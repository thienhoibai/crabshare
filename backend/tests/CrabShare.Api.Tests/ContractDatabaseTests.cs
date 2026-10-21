using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text.Json;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Features.Auth;
using CrabShare.Api.Features.Contracts;
using CrabShare.Api.Features.Funding;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SkiaSharp;

namespace CrabShare.Api.Tests;

/// <summary>
/// TH-08: hợp đồng sinh từ mẫu CT-2026-01 + ký số theo thứ tự chủ hộ nuôi → nhà đầu tư.
/// Hoàn thành khi: ký sai thứ tự → 422 contract.wrong_signing_order; FullySigned có final_hash; tải được PDF; ghi audit.
/// </summary>
[Trait("Category", "Database")]
public class ContractDatabaseTests(FundingDatabaseFixture fixture) : IClassFixture<FundingDatabaseFixture>
{
    private const string Password = "Test-password-123";

    private async Task<(HttpClient Client, long UserId)> LoginAsync(string email)
    {
        var client = fixture.Factory.CreateClient();
        var login = await client.PostAsJsonAsync("/api/auth/login", new { email, password = Password });
        login.EnsureSuccessStatusCode();
        var auth = (await login.Content.ReadFromJsonAsync<AuthResponse>())!;
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.AccessToken);
        return (client, auth.User.UserId);
    }

    private async Task<string> RegisterAsync(string role, string fullName)
    {
        var email = $"th08-{Guid.NewGuid():N}@test.local";
        (await fixture.Factory.CreateClient().PostAsJsonAsync("/api/auth/register", new { email, password = Password, fullName, role }))
            .EnsureSuccessStatusCode();
        return email;
    }

    /// <summary>Nhà đầu tư đã eKYC và đã xác nhận bản công bố rủi ro, sẵn sàng giữ chỗ.</summary>
    private async Task<(HttpClient Client, long UserId)> InvestorAsync(string fullName = "Nguyễn Văn Bên B")
    {
        var (client, userId) = await LoginAsync(await RegisterAsync("Investor", fullName));
        await using (var db = fixture.OpenDb())
            await db.Investors.Where(i => i.UserId == userId).ExecuteUpdateAsync(s => s
                .SetProperty(i => i.VerificationStatus, "Verified").SetProperty(i => i.VerifiedAt, DateTimeOffset.UtcNow));
        var rd = (await client.GetFromJsonAsync<RiskDisclosureResponse>("/api/risk-disclosures/active"))!;
        (await client.PostAsJsonAsync("/api/risk-acknowledgements", new { rd.RiskDisclosureId, scrolledToEnd = true })).EnsureSuccessStatusCode();
        return (client, userId);
    }

    /// <summary>Thành viên của hộ nuôi trong fixture (Owner được ký, Staff chỉ xem).</summary>
    private async Task<HttpClient> OperatorMemberAsync(string memberRole)
    {
        var email = await RegisterAsync("Customer", $"Thành viên {memberRole}");
        await using (var db = fixture.OpenDb())
        {
            var userId = await db.AppUsers.Where(u => u.Email == email).Select(u => u.UserId).SingleAsync();
            var now = DateTimeOffset.UtcNow;
            db.AppUserRoles.Add(new AppUserRole { UserId = userId, RoleCode = Roles.OperatorMember, GrantedAt = now, CreatedAt = now });
            db.OperatorMembers.Add(new OperatorMember { UserId = userId, OperatorId = fixture.OperatorId, MemberRole = memberRole, JoinedAt = now, CreatedAt = now });
            await db.SaveChangesAsync();
        }
        return (await LoginAsync(email)).Client;
    }

    private async Task<string> FundingBatchAsync()
    {
        await using var db = fixture.OpenDb();
        var now = DateTimeOffset.UtcNow;
        var code = $"TK-{Guid.NewGuid():N}"[..20];
        db.Batches.Add(new Batch
        {
            BatchCode = code, OperatorId = fixture.OperatorId, CrabType = "FatteningMudCrab", Title = "Lô test hợp đồng",
            SeedQuantity = 1200, ExpectedOutputKg = 400, CycleDays = 90, RestockCutoffDays = 15,
            MinViableCapital = 5_000_000, TargetCapital = 10_000_000, MaxCapital = 10_000_000, MinContribution = 1_000_000,
            OperatorSharePct = 7, FrozenStockCapMonths = 4, OfftakePreorderCapPct = 60, OfftakeDepositPct = 15,
            Status = "Funding", FundingOpenAt = now.AddDays(-1), FundingDeadline = now.AddDays(10), CreatedAt = now, UpdatedAt = now,
            BatchAccount = new BatchAccount
            {
                ProviderName = "Sandbox", ProviderAccountNo = "SBX" + code[3..], Status = "Open", OpenedAt = now, CreatedAt = now, UpdatedAt = now,
            },
        });
        await db.SaveChangesAsync();
        return code;
    }

    private static async Task<long> ReserveAsync(HttpClient investor, string code, long amount = 2_000_000)
    {
        var response = await investor.PostAsJsonAsync($"/api/batches/{code}/contributions", new { amount });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<ContributionResponse>())!.ContributionId;
    }

    private static async Task<string?> ErrorCode(HttpResponseMessage response)
        => (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString();

    [Fact]
    public async Task Contract_is_signed_operator_first_then_investor_and_keeps_every_version_hash()
    {
        var code = await FundingBatchAsync();
        var (investor, _) = await InvestorAsync();
        var contributionId = await ReserveAsync(investor, code);

        // Màn 3: lập hợp đồng; gọi lại trả đúng hợp đồng đó
        var created = await investor.PostAsync($"/api/contributions/{contributionId}/contract", null);
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var draft = (await created.Content.ReadFromJsonAsync<ContractResponse>())!;
        Assert.Equal(ContractStatuses.Draft, draft.Status);
        Assert.Equal(ContractStatuses.Operator, draft.NextSigner);
        Assert.False(draft.CanSign);
        Assert.Equal("CT-2026-01", draft.TemplateVersion);
        Assert.Equal(draft.DraftHash, draft.CurrentHash);
        var again = await investor.PostAsync($"/api/contributions/{contributionId}/contract", null);
        Assert.Equal(HttpStatusCode.OK, again.StatusCode);
        Assert.Equal(draft.ContractId, (await again.Content.ReadFromJsonAsync<ContractResponse>())!.ContractId);

        // Bản nháp tải được, đúng mã băm
        var draftPdf = await investor.GetByteArrayAsync($"/api/contracts/{draft.ContractId}/file");
        Assert.Equal("%PDF", System.Text.Encoding.ASCII.GetString(draftPdf, 0, 4));
        Assert.Equal(draft.DraftHash, Convert.ToHexStringLower(SHA256.HashData(draftPdf)));

        // Nhà đầu tư ký trước người nuôi → 422
        var early = await investor.PostAsync($"/api/contracts/{draft.ContractId}/sign", null);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, early.StatusCode);
        Assert.Equal("contract.wrong_signing_order", await ErrorCode(early));

        // Nhân viên hộ nuôi xem được nhưng không ký thay
        var staff = await OperatorMemberAsync("Staff");
        Assert.Equal(HttpStatusCode.OK, (await staff.GetAsync($"/api/contracts/{draft.ContractId}")).StatusCode);
        var staffSign = await staff.PostAsync($"/api/contracts/{draft.ContractId}/sign", null);
        Assert.Equal(HttpStatusCode.Forbidden, staffSign.StatusCode);
        Assert.Equal("contract.owner_only", await ErrorCode(staffSign));

        // Chủ hộ nuôi thấy hợp đồng chờ ký và ký trước
        var owner = await OperatorMemberAsync("Owner");
        var pending = (await owner.GetFromJsonAsync<List<ContractSummary>>("/api/operator/contracts"))!;
        Assert.Contains(pending, c => c.ContractId == draft.ContractId && c.NextSigner == ContractStatuses.Operator);
        Assert.True((await owner.GetFromJsonAsync<ContractResponse>($"/api/contracts/{draft.ContractId}"))!.CanSign);
        var operatorSigned = (await (await owner.PostAsync($"/api/contracts/{draft.ContractId}/sign", null)).Content.ReadFromJsonAsync<ContractResponse>())!;
        Assert.Equal(ContractStatuses.OperatorSigned, operatorSigned.Status);
        Assert.NotEqual(draft.DraftHash, operatorSigned.CurrentHash);
        Assert.Equal(HttpStatusCode.Conflict, (await owner.PostAsync($"/api/contracts/{draft.ContractId}/sign", null)).StatusCode);

        // Nhà đầu tư ký trên đúng file người nuôi đã ký → FullySigned + final_hash
        Assert.True((await investor.GetFromJsonAsync<ContractResponse>($"/api/contracts/{draft.ContractId}"))!.CanSign);
        var signed = await investor.PostAsync($"/api/contracts/{draft.ContractId}/sign", null);
        Assert.Equal(HttpStatusCode.OK, signed.StatusCode);
        var final = (await signed.Content.ReadFromJsonAsync<ContractResponse>())!;
        Assert.Equal(ContractStatuses.FullySigned, final.Status);
        Assert.NotNull(final.FinalHash);
        Assert.NotNull(final.FullySignedAt);
        Assert.Equal(final.FinalHash, final.CurrentHash);
        Assert.Equal([ContractStatuses.Operator, ContractStatuses.Investor], final.Signatures.Select(s => s.Role));
        Assert.Equal(operatorSigned.CurrentHash, final.Signatures[0].SignedHash);
        var finalPdf = await investor.GetByteArrayAsync($"/api/contracts/{draft.ContractId}/file");
        Assert.Equal(final.FinalHash, Convert.ToHexStringLower(SHA256.HashData(finalPdf)));
        // Chữ ký sau nối vào sau, phần người nuôi đã ký giữ nguyên byte
        Assert.Equal(draftPdf, finalPdf[..draftPdf.Length]);

        await using var db = fixture.OpenDb();
        var actions = await db.AuditLogs.Where(a => a.EntityType == "investment_contract" && a.EntityId == draft.ContractId)
            .OrderBy(a => a.AuditId).Select(a => a.ActionType).ToListAsync();
        Assert.Equal(["create", "sign", "sign"], actions);
        var row = await db.InvestmentContracts.SingleAsync(c => c.ContractId == draft.ContractId);
        Assert.Equal(ContractFileStore.UriFor(row.ContractNo, final.FinalHash!), row.FinalFileUri);

        // Người ngoài không thấy hợp đồng
        var (stranger, _) = await InvestorAsync("Người lạ");
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.GetAsync($"/api/contracts/{draft.ContractId}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.GetAsync($"/api/contracts/{draft.ContractId}/file")).StatusCode);
    }

    [Fact]
    public async Task Expired_reservation_voids_its_unsigned_contract()
    {
        var code = await FundingBatchAsync();
        var (investor, _) = await InvestorAsync();
        var contributionId = await ReserveAsync(investor, code);
        var contract = (await (await investor.PostAsync($"/api/contributions/{contributionId}/contract", null)).Content.ReadFromJsonAsync<ContractResponse>())!;
        await using (var db = fixture.OpenDb())
            await db.Contributions.Where(c => c.ContributionId == contributionId)
                .ExecuteUpdateAsync(s => s.SetProperty(c => c.ExpiresAt, DateTimeOffset.UtcNow.AddMinutes(-1)));

        await using (var scope = fixture.Factory.Services.CreateAsyncScope())
            await scope.ServiceProvider.GetRequiredService<FundingCloseService>().ExpireReservationsAsync(CancellationToken.None);

        var owner = await OperatorMemberAsync("Owner");
        var sign = await owner.PostAsync($"/api/contracts/{contract.ContractId}/sign", null);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, sign.StatusCode);
        Assert.Equal("contract.void", await ErrorCode(sign));
        await using var check = fixture.OpenDb();
        Assert.Equal(ContractStatuses.Void, (await check.InvestmentContracts.SingleAsync(c => c.ContractId == contract.ContractId)).Status);
    }

    [Fact]
    public async Task Only_the_contribution_owner_can_create_its_contract()
    {
        var code = await FundingBatchAsync();
        var (investor, _) = await InvestorAsync();
        var contributionId = await ReserveAsync(investor, code);
        var (other, _) = await InvestorAsync("Người khác");
        var response = await other.PostAsync($"/api/contributions/{contributionId}/contract", null);
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal("contribution.not_owner", await ErrorCode(response));
    }

    [Fact]
    public void Contract_font_covers_vietnamese_text()
    {
        foreach (var file in new[] { "jakarta-400.ttf", "jakarta-700.ttf" })
        {
            using var typeface = SKTypeface.FromFile(Path.Combine(AppContext.BaseDirectory, "Reference", "Fonts", file));
            Assert.NotNull(typeface);
            Assert.True(typeface.ContainsGlyphs("Hợp đồng góp vốn — Bên A ký trước, Bên B ký sau. Đ đ ă â ê ô ơ ư ạ ả ấ ầ ẩ ẫ ậ ắ ằ ẳ ẵ ặ ẹ ẻ ẽ ế ề ể ễ ệ ỉ ị ọ ỏ ố ồ ổ ỗ ộ ớ ờ ở ỡ ợ ụ ủ ứ ừ ử ữ ự ỳ ỵ ỷ ỹ •"),
                $"{file} thiếu glyph tiếng Việt");
        }
    }
}
