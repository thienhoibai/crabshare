using System.Net;
using System.Net.Http.Json;
using System.Text;
using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Features.Admin;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace CrabShare.Api.Tests;

[Trait("Category", "Database"), Collection("KycDatabase")]
public class AuditLogQueryDatabaseTests(KycDatabaseFixture fixture) : IClassFixture<KycDatabaseFixture>
{
    private async Task<T> Db<T>(Func<AppDbContext, Task<T>> action) { await using var scope = fixture.Factory.Services.CreateAsyncScope(); return await action(scope.ServiceProvider.GetRequiredService<AppDbContext>()); }
    private Task<long> Admin() => Db(async db => { var now = DateTimeOffset.UtcNow; var user = new AppUser { Email = $"auditview-{Guid.NewGuid():N}@test.local", FullName = "Audit Admin", Status = "Active", PasswordHash = "test", CreatedAt = now, UpdatedAt = now }; user.AppUserRoles.Add(new AppUserRole { RoleCode = Roles.PlatformAdmin, GrantedAt = now }); db.AppUsers.Add(user); await db.SaveChangesAsync(); return user.UserId; });
    private Task<List<long>> Write(string type, int count = 3) => Db(async db => {
        var audit = new AuditLogService(db, new CurrentUser(new HttpContextAccessor()), TimeProvider.System);
        await db.InTransactionAsync(async () => { for (var i = 0; i < count; i++) await audit.WriteAsync(type, i + 1, "TestChange", null, new { message = "=SUM(1,2)\nChuỗi tiếng Việt", step = i }, default); });
        return await db.AuditLogs.Where(a => a.EntityType == type).OrderBy(a => a.AuditId).Select(a => a.AuditId).ToListAsync();
    });
    private HttpClient Client(long user) { var client = fixture.Factory.CreateClient(); client.DefaultRequestHeaders.Add("X-Test-User", user.ToString()); client.DefaultRequestHeaders.Add("X-Test-Role", Roles.PlatformAdmin); return client; }

    [Fact]
    public async Task Filtered_paging_keeps_a_stable_prefix_and_exports_same_rows_without_mutations()
    {
        var user = await Admin(); var type = "AQ-" + Guid.NewGuid().ToString("N")[..12]; var ids = await Write(type);
        using var client = Client(user); var response = await client.GetAsync($"/api/admin/audit-log?entityType={type}&pageSize=1"); response.EnsureSuccessStatusCode();
        var first = (await response.Content.ReadFromJsonAsync<AuditLogPage>())!; Assert.Equal(3, first.Total); Assert.Equal(ids[^1], Assert.Single(first.Items).AuditId); Assert.True(first.Chain.IsValid); Assert.True(response.Headers.CacheControl!.NoStore);
        await Write(type, 1); var countBefore = await Db(db => db.AuditLogs.CountAsync());
        var second = (await client.GetFromJsonAsync<AuditLogPage>($"/api/admin/audit-log?entityType={type}&pageSize=1&page=2&throughAuditId={first.ThroughAuditId}"))!;
        Assert.Equal(3, second.Total); Assert.Equal(ids[1], Assert.Single(second.Items).AuditId);
        var csv = await client.GetAsync($"/api/admin/audit-log/export?entityType={type}&throughAuditId={first.ThroughAuditId}"); csv.EnsureSuccessStatusCode(); var bytes = await csv.Content.ReadAsByteArrayAsync();
        Assert.True(bytes.AsSpan().StartsWith(Encoding.UTF8.GetPreamble())); Assert.Equal("text/csv", csv.Content.Headers.ContentType!.MediaType); Assert.Contains("Chuỗi hợp lệ", Encoding.UTF8.GetString(bytes));
        Assert.Contains("SUM(1,2)", Encoding.UTF8.GetString(bytes)); Assert.Contains("\\u", Encoding.UTF8.GetString(bytes)); Assert.Equal(countBefore, await Db(db => db.AuditLogs.CountAsync()));
    }
    [Fact]
    public async Task Manual_tampering_is_reported_at_exact_id_even_outside_filter_and_in_csv()
    {
        var user = await Admin(); var type = "tamper-" + Guid.NewGuid().ToString("N")[..12]; var ids = await Write(type); var victim = ids[1]; using var client = Client(user);
        await Db(async db => { await db.Database.ExecuteSqlAsync($"DISABLE TRIGGER dbo.trg_audit_log_append_only ON dbo.audit_log; UPDATE dbo.audit_log SET new_value = N'{{\"modified\":true}}' WHERE audit_id = {victim}; ENABLE TRIGGER dbo.trg_audit_log_append_only ON dbo.audit_log;"); return true; });
        try
        {
            var result = (await client.GetFromJsonAsync<AuditLogPage>("/api/admin/audit-log?entityType=NO-MATCH"))!;
            Assert.Empty(result.Items); Assert.False(result.Chain.IsValid); Assert.Equal(victim, result.Chain.BrokenAuditId);
            var csv = await client.GetStringAsync("/api/admin/audit-log/export?entityType=NO-MATCH"); Assert.Contains($"\"Dòng gãy đầu tiên\",\"{victim}\"", csv); Assert.Contains("False", csv);
        }
        finally
        {
            // Restore only the isolated test row, never any application audit history.
            await Db(async db => { var original = AuditChain.Snapshot(new { message = "=SUM(1,2)\nChuỗi tiếng Việt", step = 1 }); await db.Database.ExecuteSqlAsync($"DISABLE TRIGGER dbo.trg_audit_log_append_only ON dbo.audit_log; UPDATE dbo.audit_log SET new_value = {original} WHERE audit_id = {victim}; ENABLE TRIGGER dbo.trg_audit_log_append_only ON dbo.audit_log;"); return true; });
        }
    }
    [Fact]
    public async Task Locked_or_revoked_admin_cannot_read_or_export_old_token_data()
    {
        var user = await Admin(); using var client = Client(user); await Db(async db => { var row = await db.AppUsers.SingleAsync(u => u.UserId == user); row.Status = "Locked"; await db.SaveChangesAsync(); return true; });
        foreach (var path in new[] { "", "/export" }) Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/admin/audit-log" + path)).StatusCode);
    }
    [Fact]
    public async Task Empty_prefix_and_out_of_range_boundary_are_explicit()
    {
        using var client = Client(await Admin()); var data = (await client.GetFromJsonAsync<AuditLogPage>("/api/admin/audit-log?throughAuditId=0"))!;
        Assert.Empty(data.Items); Assert.True(data.Chain.IsValid); Assert.Equal(0, data.Chain.CheckedRows);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync($"/api/admin/audit-log?throughAuditId={long.MaxValue}")).StatusCode);
    }
    [Fact]
    public async Task Verification_crosses_chunks_and_large_export_requires_narrower_filters()
    {
        var user = await Admin(); var type = "large-" + Guid.NewGuid().ToString("N")[..12];
        await Db(async db => {
            await db.InTransactionAsync(async () => {
                var previous = await AuditChain.LockAndReadTailAsync(db, default);
                for (var i = 0; i <= AuditLogQueryService.ExportLimit; i++) { var row = new AuditLog { EntityType = type, EntityId = i, ActionType = "Insert", OccurredAt = AuditChain.Timestamp(DateTimeOffset.UtcNow), PrevHash = previous }; row.RowHash = AuditChain.Hash(row); previous = row.RowHash; db.AuditLogs.Add(row); }
            }); return true;
        });
        using var client = Client(user);
        var data = (await client.GetFromJsonAsync<AuditLogPage>($"/api/admin/audit-log?entityType={type}"))!;
        Assert.True(data.Chain.IsValid); Assert.True(data.Chain.CheckedRows >= 5001); Assert.Equal(5001, data.Total); Assert.Equal(20, data.Items.Count);
        Assert.All(data.Items, row => Assert.Matches("^[a-f0-9]{64}$", row.RowHash));
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync($"/api/admin/audit-log/export?entityType={type}")).StatusCode);
    }
}
