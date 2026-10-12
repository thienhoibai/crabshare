using System.Text.RegularExpressions;
using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.AspNetCore.Http;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Tests;

/// <summary>CSDL riêng cho test audit: tạo từ migration của repo, xoá khi xong — không đụng CrabShareDev.</summary>
public sealed class AuditDatabaseFixture : IAsyncLifetime
{
    private readonly string databaseName = $"CrabShareAuditTests_{Guid.NewGuid():N}";
    private const string Master = "Server=(localdb)\\MSSQLLocalDB;Database=master;Trusted_Connection=True;TrustServerCertificate=True";
    private string ConnectionString => new SqlConnectionStringBuilder(Master) { InitialCatalog = databaseName }.ConnectionString;

    /// <summary>Cấu hình giống API thật (có EnableRetryOnFailure) để thử luôn InTransactionAsync.</summary>
    public AppDbContext OpenDb() => new(new DbContextOptionsBuilder<AppDbContext>()
        .UseSqlServer(ConnectionString, sql => sql.EnableRetryOnFailure(3)).Options);

    public async Task InitializeAsync()
    {
        await using (var master = new SqlConnection(Master))
        {
            await master.OpenAsync();
            await new SqlCommand($"CREATE DATABASE [{databaseName}]", master).ExecuteNonQueryAsync();
        }
        await using var connection = new SqlConnection(ConnectionString);
        await connection.OpenAsync();
        foreach (var file in Directory.GetFiles(Path.Combine(AppContext.BaseDirectory, "Migrations"), "V*.sql").Order())
        foreach (var batch in Regex.Split(await File.ReadAllTextAsync(file), @"^\s*GO\s*$", RegexOptions.Multiline | RegexOptions.IgnoreCase))
            if (!string.IsNullOrWhiteSpace(batch))
                await new SqlCommand(batch, connection) { CommandTimeout = 60 }.ExecuteNonQueryAsync();
    }

    public async Task DisposeAsync()
    {
        SqlConnection.ClearAllPools();
        await using var master = new SqlConnection(Master);
        await master.OpenAsync();
        await new SqlCommand($"ALTER DATABASE [{databaseName}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [{databaseName}]", master).ExecuteNonQueryAsync();
    }
}

[Trait("Category", "Database")]
public class AuditLogDatabaseTests(AuditDatabaseFixture fixture) : IClassFixture<AuditDatabaseFixture>
{
    // Không có HttpContext → giống job nền: actor_user_id để trống
    private static IAuditLog Audit(AppDbContext db)
        => new AuditLogService(db, new CurrentUser(new HttpContextAccessor()), TimeProvider.System);

    /// <summary>Mỗi test ghi với entity_type riêng rồi chỉ kiểm tra khoảng audit_id của mình → các test không ảnh hưởng nhau.</summary>
    private static string NewEntityType() => $"test-{Guid.NewGuid():N}";

    private async Task<(long First, long Last)> RangeAsync(string entityType)
    {
        await using var db = fixture.OpenDb();
        var ids = db.AuditLogs.Where(a => a.EntityType == entityType).Select(a => a.AuditId);
        return (await ids.MinAsync(), await ids.MaxAsync());
    }

    private async Task<(long First, long Last)> WriteRowsAsync(string entityType, int count)
    {
        for (var step = 1; step <= count; step++)
        {
            await using var db = fixture.OpenDb();
            await db.InTransactionAsync(() =>
                Audit(db).WriteAsync(entityType, step, "update", new { step = step - 1 }, new { step }, CancellationToken.None));
        }
        return await RangeAsync(entityType);
    }

    [Fact]
    public async Task Ghi_100_dong_thi_chuoi_hop_le()
    {
        var (first, last) = await WriteRowsAsync(NewEntityType(), 100);

        await using var db = fixture.OpenDb();
        var result = await Audit(db).VerifyChainAsync(first, last, CancellationToken.None);

        Assert.True(result.IsValid, result.Problem);
        Assert.Equal(100, result.CheckedRows);
    }

    [Fact]
    public async Task Sua_tay_mot_dong_trong_CSDL_thi_bao_gay_dung_dong_do()
    {
        var (first, last) = await WriteRowsAsync(NewEntityType(), 10);
        var victim = first + 4;

        await using var db = fixture.OpenDb();
        // Trigger trg_audit_log_append_only chặn mọi UPDATE → tắt tạm để giả lập người sửa thẳng trong CSDL
        await db.Database.ExecuteSqlAsync($$"""
            DISABLE TRIGGER dbo.trg_audit_log_append_only ON dbo.audit_log;
            UPDATE dbo.audit_log SET new_value = N'{"step":999}' WHERE audit_id = {{victim}};
            ENABLE TRIGGER dbo.trg_audit_log_append_only ON dbo.audit_log;
            """);
        var result = await Audit(db).VerifyChainAsync(first, last, CancellationToken.None);

        Assert.False(result.IsValid);
        Assert.Equal(victim, result.BrokenAuditId);
    }

    [Fact]
    public async Task Hai_muoi_luong_ghi_cung_luc_khong_re_nhanh()
    {
        var entityType = NewEntityType();
        await Task.WhenAll(Enumerable.Range(1, 20).Select(async i =>
        {
            await using var db = fixture.OpenDb();
            await db.InTransactionAsync(() =>
                Audit(db).WriteAsync(entityType, i, "update", null, new { i }, CancellationToken.None));
        }));
        var (first, last) = await RangeAsync(entityType);

        await using var check = fixture.OpenDb();
        var result = await Audit(check).VerifyChainAsync(first, last, CancellationToken.None);

        Assert.True(result.IsValid, result.Problem);
        Assert.Equal(20, result.CheckedRows);
    }

    [Fact]
    public async Task Ghi_xen_voi_cach_ghi_cua_Accounts_trong_cung_transaction_van_lien_mach()
    {
        var entityType = NewEntityType();
        await using (var db = fixture.OpenDb())
            await db.InTransactionAsync(async () =>
            {
                // Kiểu ghi của module Accounts: khoá + đọc đầu chuỗi, thêm dòng nhưng chưa SaveChanges
                var head = await AuditChain.LockAndReadTailAsync(db, CancellationToken.None);
                var legacy = new AuditLog
                {
                    EntityType = entityType, EntityId = 1, ActionType = "create", NewValue = AuditChain.Snapshot(new { step = 1 }),
                    OccurredAt = AuditChain.Timestamp(DateTimeOffset.UtcNow), PrevHash = head,
                };
                legacy.RowHash = AuditChain.Hash(legacy);
                db.AuditLogs.Add(legacy);
                await Audit(db).WriteAsync(entityType, 1, "update", new { step = 1 }, new { step = 2 }, CancellationToken.None);
            });
        var (first, last) = await RangeAsync(entityType);

        await using var check = fixture.OpenDb();
        var result = await Audit(check).VerifyChainAsync(first, last, CancellationToken.None);

        Assert.True(result.IsValid, result.Problem);
        Assert.Equal(2, result.CheckedRows);
    }

    [Fact]
    public async Task Ghi_ngoai_transaction_bi_tu_choi()
    {
        await using var db = fixture.OpenDb();

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            Audit(db).WriteAsync(NewEntityType(), 1, "update", null, null, CancellationToken.None));
    }

    [Fact]
    public async Task Loi_sau_khi_ghi_thi_rollback_ca_dong_audit()
    {
        var entityType = NewEntityType();
        await using var db = fixture.OpenDb();

        await Assert.ThrowsAsync<InvalidOperationException>(() => db.InTransactionAsync(async () =>
        {
            await Audit(db).WriteAsync(entityType, 1, "update", null, new { ok = true }, CancellationToken.None);
            throw new InvalidOperationException("lỗi nghiệp vụ xảy ra sau khi đã ghi audit");
        }));

        await using var check = fixture.OpenDb();
        Assert.False(await check.AuditLogs.AnyAsync(a => a.EntityType == entityType));
    }
}
