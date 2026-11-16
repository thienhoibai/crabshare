using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Features.Auth;
using CrabShare.Api.Features.Funding;
using CrabShare.Api.Features.Payments;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace CrabShare.Api.Tests;

/// <summary>TH-06: webhook báo có của trung gian thanh toán, chống trùng, trả trễ, và giả lập chuyển khoản (CS-41).</summary>
[Trait("Category", "Database")]
public class PaymentWebhookDatabaseTests(FundingDatabaseFixture fixture) : IClassFixture<FundingDatabaseFixture>
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private const string WebhookUrl = "/api/webhooks/payment-provider";

    private string Secret => fixture.Factory.Services.GetRequiredService<IOptions<PaymentOptions>>().Value.WebhookSecret;

    // ---------- Helper (chép từ FundingDatabaseTests vì ở đó là private) ----------

    private async Task<(HttpClient Client, long UserId)> InvestorAsync()
    {
        var client = fixture.Factory.CreateClient();
        var register = await client.PostAsJsonAsync("/api/auth/register", new
        { email = $"inv-{Guid.NewGuid():N}@test.local", password = "Test-password-123", fullName = "Nhà đầu tư webhook", role = "Investor" });
        register.EnsureSuccessStatusCode();
        var auth = (await register.Content.ReadFromJsonAsync<AuthResponse>())!;
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.AccessToken);
        await using (var db = fixture.OpenDb())
            await db.Investors.Where(i => i.UserId == auth.User.UserId).ExecuteUpdateAsync(s => s
                .SetProperty(i => i.VerificationStatus, "Verified").SetProperty(i => i.VerifiedAt, DateTimeOffset.UtcNow));
        var rd = (await client.GetFromJsonAsync<RiskDisclosureResponse>("/api/risk-disclosures/active"))!;
        (await client.PostAsJsonAsync("/api/risk-acknowledgements", new { rd.RiskDisclosureId, scrolledToEnd = true })).EnsureSuccessStatusCode();
        return (client, auth.User.UserId);
    }

    private async Task<string> FundingBatchAsync(long maxCapital = 10_000_000, long minContribution = 1_000_000)
    {
        await using var db = fixture.OpenDb();
        var now = DateTimeOffset.UtcNow;
        var code = $"TW-{Guid.NewGuid():N}"[..20];
        db.Batches.Add(new Batch
        {
            BatchCode = code, OperatorId = fixture.OperatorId, CrabType = "FatteningMudCrab", Title = "Lô test webhook",
            SeedQuantity = 100, ExpectedOutputKg = 40, CycleDays = 90, RestockCutoffDays = 15,
            MinViableCapital = maxCapital / 2, TargetCapital = maxCapital, MaxCapital = maxCapital, MinContribution = minContribution,
            OperatorSharePct = 7, FrozenStockCapMonths = 4, OfftakePreorderCapPct = 60, OfftakeDepositPct = 15,
            Status = "Funding", FundingOpenAt = now.AddDays(-1), FundingDeadline = now.AddDays(10),
            CreatedAt = now, UpdatedAt = now,
            BatchAccount = new BatchAccount
            {
                ProviderName = "Sandbox", ProviderAccountNo = "SBX" + code[3..], Status = "Open",
                OpenedAt = now, CreatedAt = now, UpdatedAt = now,
            },
        });
        await db.SaveChangesAsync();
        return code;
    }

    private static async Task<ContributionResponse> ReservedAsync(HttpClient client, string code, long amount)
    {
        var response = await client.PostAsJsonAsync($"/api/batches/{code}/contributions", new { amount });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<ContributionResponse>())!;
    }

    private static async Task<PaymentRequestResponse> RequestPaymentAsync(HttpClient client, long contributionId)
    {
        var response = await client.PostAsync($"/api/contributions/{contributionId}/payment-requests", null);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<PaymentRequestResponse>())!;
    }

    /// <summary>Giữ chỗ rồi lấy mã QR: trả về khoản góp và yêu cầu chuyển khoản đang Pending.</summary>
    private async Task<(HttpClient Client, ContributionResponse Contribution, PaymentRequestResponse Payment)> PendingPaymentAsync(long amount = 3_000_000)
    {
        var code = await FundingBatchAsync();
        var (client, _) = await InvestorAsync();
        var contribution = await ReservedAsync(client, code, amount);
        var payment = await RequestPaymentAsync(client, contribution.ContributionId);
        return (client, contribution, payment);
    }

    private static object Notification(PaymentRequestResponse payment, long? amount = null, string? content = null, string? providerTxnId = null) => new
    {
        providerTxnId = providerTxnId ?? $"BANK-{Guid.NewGuid():N}"[..30],
        accountNo = payment.AccountNo,
        amount = amount ?? payment.Amount,
        content = content ?? $"{payment.ReferenceCode} gop von",
        occurredAt = DateTimeOffset.UtcNow,
    };

    /// <summary>Gửi webhook như trung gian thanh toán: thân JSON camelCase + header X-Signature = HMAC-SHA256(secret, thân).</summary>
    private Task<HttpResponseMessage> SendWebhookAsync(string body, string? signature = null)
    {
        var client = fixture.Factory.CreateClient();
        var request = new HttpRequestMessage(HttpMethod.Post, WebhookUrl)
        {
            Content = new StringContent(body, Encoding.UTF8, "application/json"),
        };
        request.Headers.Add(WebhookSignature.Header, signature ?? WebhookSignature.Compute(Secret, body));
        return client.SendAsync(request);
    }

    private async Task<WebhookResult> WebhookAsync(object notification)
    {
        var response = await SendWebhookAsync(JsonSerializer.Serialize(notification, Json));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<WebhookResult>())!;
    }

    private static async Task<string?> ErrorCode(HttpResponseMessage response)
        => (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString();

    // ---------- Test ----------

    [Fact]
    public async Task Sai_chu_ky_thi_401_va_khong_ghi_giao_dich()
    {
        var (_, _, payment) = await PendingPaymentAsync();
        var notification = Notification(payment, providerTxnId: $"BAD-{Guid.NewGuid():N}"[..30]);
        var body = JsonSerializer.Serialize(notification, Json);

        var wrongSecret = await SendWebhookAsync(body, WebhookSignature.Compute("khoa-sai", body));
        var noHeader = await fixture.Factory.CreateClient().PostAsync(WebhookUrl, new StringContent(body, Encoding.UTF8, "application/json"));

        Assert.Equal(HttpStatusCode.Unauthorized, wrongSecret.StatusCode);
        Assert.Equal("webhook.bad_signature", await ErrorCode(wrongSecret));
        Assert.Equal(HttpStatusCode.Unauthorized, noHeader.StatusCode);
        await using var db = fixture.OpenDb();
        Assert.False(await db.ProviderTransactions.AnyAsync(t => t.ProviderTxnId.StartsWith("BAD-")));
    }

    [Fact]
    public async Task Thieu_truong_thi_400_webhook_bad_payload()
    {
        var body = JsonSerializer.Serialize(new { accountNo = "SBX000", amount = 1000 }, Json);

        var response = await SendWebhookAsync(body);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("webhook.bad_payload", await ErrorCode(response));
    }

    [Fact]
    public async Task Tien_ve_dung_so_thi_khoan_thu_Paid_va_khoan_gop_Confirmed()
    {
        var (client, contribution, payment) = await PendingPaymentAsync(3_000_000);

        var result = await WebhookAsync(Notification(payment));

        Assert.Equal(WebhookResult.Matched, result.Outcome);
        Assert.Equal((payment.ReferenceCode, payment.PaymentRequestId, "Contribution"), (result.ReferenceCode, result.PaymentRequestId, result.Purpose));
        Assert.Null(result.RefundInstructionId);

        await using var db = fixture.OpenDb();
        var request = await db.PaymentRequests.SingleAsync(r => r.PaymentRequestId == payment.PaymentRequestId);
        Assert.Equal("Paid", request.Status);
        var row = await db.Contributions.SingleAsync(c => c.ContributionId == contribution.ContributionId);
        Assert.Equal("Confirmed", row.Status);
        Assert.NotNull(row.ConfirmedAt);
        var txn = await db.ProviderTransactions.SingleAsync(t => t.TransactionId == result.TransactionId);
        Assert.Equal(("In", WebhookResult.Matched, payment.PaymentRequestId, 3_000_000m), (txn.Direction, txn.MatchStatus, txn.PaymentRequestId, txn.Amount));
        Assert.Contains(payment.ReferenceCode, txn.ReferenceCode);

        var audits = await db.AuditLogs.Where(a =>
                (a.EntityType == "payment_request" && a.EntityId == payment.PaymentRequestId && a.ActionType == "paid")
                || (a.EntityType == "contribution" && a.EntityId == contribution.ContributionId && a.ActionType == "confirm")
                || (a.EntityType == "provider_transaction" && a.EntityId == result.TransactionId && a.ActionType == "receive"))
            .ToListAsync();
        Assert.Equal(3, audits.Count);
        Assert.All(audits, a => Assert.Null(a.ActorUserId)); // webhook không có người đăng nhập
        Assert.True(AuditChainVerifier.Verify(await db.AuditLogs.OrderBy(a => a.AuditId).ToListAsync()).IsValid);

        var mine = (await client.GetFromJsonAsync<PaymentRequestResponse>($"/api/payment-requests/{payment.PaymentRequestId}"))!;
        Assert.Equal("Paid", mine.Status);
        Assert.Null(mine.QrContent);
        var contributions = (await client.GetFromJsonAsync<List<ContributionResponse>>("/api/me/contributions"))!;
        Assert.Equal("Confirmed", Assert.Single(contributions).Status);
    }

    [Fact]
    public async Task Gui_lai_cung_webhook_hai_lan_chi_ghi_mot_giao_dich()
    {
        var (_, contribution, payment) = await PendingPaymentAsync();
        var providerTxnId = $"BANK-{Guid.NewGuid():N}"[..30];
        var body = JsonSerializer.Serialize(Notification(payment, providerTxnId: providerTxnId), Json);

        var first = await SendWebhookAsync(body);
        var second = await SendWebhookAsync(body);

        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        Assert.Equal(HttpStatusCode.OK, second.StatusCode);
        var r1 = (await first.Content.ReadFromJsonAsync<WebhookResult>())!;
        var r2 = (await second.Content.ReadFromJsonAsync<WebhookResult>())!;
        Assert.Equal(WebhookResult.Matched, r1.Outcome);
        Assert.Equal(WebhookResult.Duplicate, r2.Outcome);
        Assert.Equal((r1.TransactionId, r1.PaymentRequestId, r1.ReferenceCode), (r2.TransactionId, r2.PaymentRequestId, r2.ReferenceCode));

        await using var db = fixture.OpenDb();
        Assert.Equal(1, await db.ProviderTransactions.CountAsync(t => t.ProviderTxnId == providerTxnId));
        Assert.Equal("Confirmed", (await db.Contributions.SingleAsync(c => c.ContributionId == contribution.ContributionId)).Status);
        Assert.Equal(1, await db.AuditLogs.CountAsync(a => a.EntityType == "contribution" && a.EntityId == contribution.ContributionId && a.ActionType == "confirm"));
    }

    [Fact]
    public async Task Hai_webhook_cung_ma_chay_song_song_van_chi_mot_giao_dich()
    {
        var (_, contribution, payment) = await PendingPaymentAsync();
        var body = JsonSerializer.Serialize(Notification(payment), Json);

        var responses = await Task.WhenAll(Enumerable.Range(0, 4).Select(_ => SendWebhookAsync(body)));

        Assert.All(responses, r => Assert.Equal(HttpStatusCode.OK, r.StatusCode));
        var outcomes = new List<string>();
        foreach (var r in responses) outcomes.Add((await r.Content.ReadFromJsonAsync<WebhookResult>())!.Outcome);
        Assert.Equal(1, outcomes.Count(o => o == WebhookResult.Matched));
        Assert.Equal(3, outcomes.Count(o => o == WebhookResult.Duplicate));
        await using var db = fixture.OpenDb();
        Assert.Equal(1, await db.ProviderTransactions.CountAsync(t => t.PaymentRequestId == payment.PaymentRequestId));
        Assert.Equal("Confirmed", (await db.Contributions.SingleAsync(c => c.ContributionId == contribution.ContributionId)).Status);
    }

    [Fact]
    public async Task Tien_den_sau_han_thi_LatePayment_va_lap_lenh_hoan()
    {
        var (_, contribution, payment) = await PendingPaymentAsync(2_000_000);
        var past = DateTimeOffset.UtcNow.AddMinutes(-5);
        await using (var db = fixture.OpenDb())
        {
            await db.PaymentRequests.Where(r => r.PaymentRequestId == payment.PaymentRequestId).ExecuteUpdateAsync(s => s.SetProperty(r => r.ExpiresAt, past));
            await db.Contributions.Where(c => c.ContributionId == contribution.ContributionId).ExecuteUpdateAsync(s => s.SetProperty(c => c.ExpiresAt, past));
        }

        var result = await WebhookAsync(Notification(payment));

        Assert.Equal(WebhookResult.LatePayment, result.Outcome);
        Assert.Equal(payment.PaymentRequestId, result.PaymentRequestId);
        Assert.NotNull(result.RefundInstructionId);
        await using var check = fixture.OpenDb();
        var txn = await check.ProviderTransactions.SingleAsync(t => t.TransactionId == result.TransactionId);
        Assert.Equal((WebhookResult.LatePayment, payment.PaymentRequestId), (txn.MatchStatus, txn.PaymentRequestId));
        var refund = await check.PaymentInstructions.SingleAsync(i => i.InstructionId == result.RefundInstructionId);
        Assert.Equal(("Refund", "Created", 2_000_000m, contribution.ContributionId, (long?)null),
            (refund.InstructionType, refund.Status, refund.Amount, refund.ContributionId, refund.OrderId));
        Assert.Equal(txn.BatchAccountId, refund.BatchAccountId);
        Assert.Equal("Expired", (await check.PaymentRequests.SingleAsync(r => r.PaymentRequestId == payment.PaymentRequestId)).Status);
        var row = await check.Contributions.SingleAsync(c => c.ContributionId == contribution.ContributionId);
        Assert.NotEqual("Confirmed", row.Status);
        Assert.Null(row.ConfirmedAt);
        Assert.True(await check.AuditLogs.AnyAsync(a => a.EntityType == "payment_instruction" && a.EntityId == refund.InstructionId && a.ActionType == "create"));
        Assert.True(AuditChainVerifier.Verify(await check.AuditLogs.OrderBy(a => a.AuditId).ToListAsync()).IsValid);
    }

    [Fact]
    public async Task Sai_so_tien_thi_Unmatched_va_khoan_thu_van_Pending()
    {
        var (_, contribution, payment) = await PendingPaymentAsync(3_000_000);

        var result = await WebhookAsync(Notification(payment, amount: 2_999_000));

        Assert.Equal(WebhookResult.Unmatched, result.Outcome);
        Assert.Equal(payment.PaymentRequestId, result.PaymentRequestId); // vẫn gắn để admin đối soát tay
        await using var db = fixture.OpenDb();
        Assert.Equal("Pending", (await db.PaymentRequests.SingleAsync(r => r.PaymentRequestId == payment.PaymentRequestId)).Status);
        Assert.Equal("Reserved", (await db.Contributions.SingleAsync(c => c.ContributionId == contribution.ContributionId)).Status);
        var txn = await db.ProviderTransactions.SingleAsync(t => t.TransactionId == result.TransactionId);
        Assert.Equal((WebhookResult.Unmatched, 2_999_000m), (txn.MatchStatus, txn.Amount));
        Assert.False(await db.PaymentInstructions.AnyAsync(i => i.ContributionId == contribution.ContributionId));
    }

    [Fact]
    public async Task Noi_dung_khong_co_ma_thi_Unmatched_khong_gan_khoan_thu()
    {
        var (_, _, payment) = await PendingPaymentAsync();

        var result = await WebhookAsync(Notification(payment, content: "chuyen tien nuoi cua"));

        Assert.Equal(WebhookResult.Unmatched, result.Outcome);
        Assert.Null(result.PaymentRequestId);
        await using var db = fixture.OpenDb();
        var txn = await db.ProviderTransactions.SingleAsync(t => t.TransactionId == result.TransactionId);
        Assert.Equal((WebhookResult.Unmatched, (long?)null, "chuyen tien nuoi cua"), (txn.MatchStatus, txn.PaymentRequestId, txn.ReferenceCode));
        Assert.Equal("Pending", (await db.PaymentRequests.SingleAsync(r => r.PaymentRequestId == payment.PaymentRequestId)).Status);
    }

    [Fact]
    public async Task Tai_khoan_khong_ton_tai_thi_422_payment_unknown_account()
    {
        var (_, _, payment) = await PendingPaymentAsync();
        var body = JsonSerializer.Serialize(new
        {
            providerTxnId = $"BANK-{Guid.NewGuid():N}"[..30], accountNo = "KHONG-CO-TAI-KHOAN", amount = payment.Amount,
            content = payment.ReferenceCode, occurredAt = DateTimeOffset.UtcNow,
        }, Json);

        var response = await SendWebhookAsync(body);

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        Assert.Equal("payment.unknown_account", await ErrorCode(response));
    }

    [Fact]
    public async Task Gia_lap_chuyen_khoan_di_dung_luong_webhook()
    {
        var (client, contribution, payment) = await PendingPaymentAsync(4_000_000);

        var response = await client.PostAsJsonAsync("/api/dev/payments/simulate", new { referenceCode = payment.ReferenceCode.ToLowerInvariant() });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var result = (await response.Content.ReadFromJsonAsync<WebhookResult>())!;
        Assert.Equal(WebhookResult.Matched, result.Outcome);
        await using var db = fixture.OpenDb();
        var txn = await db.ProviderTransactions.SingleAsync(t => t.TransactionId == result.TransactionId);
        Assert.StartsWith("SIM-", txn.ProviderTxnId);
        Assert.Equal(4_000_000m, txn.Amount);
        Assert.Equal("Confirmed", (await db.Contributions.SingleAsync(c => c.ContributionId == contribution.ContributionId)).Status);
        var mine = (await client.GetFromJsonAsync<PaymentRequestResponse>($"/api/payment-requests/{payment.PaymentRequestId}"))!;
        Assert.Equal("Paid", mine.Status);

        var unknown = await client.PostAsJsonAsync("/api/dev/payments/simulate", new { referenceCode = "GV0000000000X" });
        Assert.Equal(HttpStatusCode.NotFound, unknown.StatusCode);
        Assert.Equal("payment.not_found", await ErrorCode(unknown));
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await fixture.Factory.CreateClient().PostAsJsonAsync("/api/dev/payments/simulate", new { referenceCode = payment.ReferenceCode })).StatusCode);
    }
}
