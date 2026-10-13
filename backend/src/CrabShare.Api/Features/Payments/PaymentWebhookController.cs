using System.Text.Json;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace CrabShare.Api.Features.Payments;

/// <summary>
/// Điểm nhận báo có từ trung gian thanh toán (TH-06, TL-10 §5). Không có đăng nhập: xác thực bằng chữ ký HMAC của thân
/// request (header X-Signature). Đọc thân request dạng chuỗi thô để ký đúng từng byte, rồi mới giải mã JSON.
/// </summary>
[ApiController]
[Route("api")]
public sealed class PaymentWebhookController(PaymentWebhookService webhook, IOptions<PaymentOptions> options) : ControllerBase
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    [HttpPost("webhooks/payment-provider")]
    [AllowAnonymous]
    [EndpointSummary("TH-06 — Trung gian thanh toán báo có một giao dịch vào tài khoản lô; idempotent theo providerTxnId, chữ ký HMAC-SHA256 ở header X-Signature")]
    public async Task<ActionResult<WebhookResult>> Receive(CancellationToken ct)
    {
        string body;
        using (var reader = new StreamReader(Request.Body))
            body = await reader.ReadToEndAsync(ct);
        if (!WebhookSignature.Verify(options.Value.WebhookSecret, body, Request.Headers[WebhookSignature.Header]))
            throw new AppException(StatusCodes.Status401Unauthorized, "webhook.bad_signature", "Chữ ký webhook không hợp lệ.");

        ProviderPaymentNotification? txn;
        try
        {
            txn = JsonSerializer.Deserialize<ProviderPaymentNotification>(body, JsonOptions);
        }
        catch (JsonException)
        {
            txn = null;
        }
        if (txn is null || string.IsNullOrWhiteSpace(txn.ProviderTxnId) || string.IsNullOrWhiteSpace(txn.AccountNo)
            || txn.Amount <= 0 || txn.OccurredAt == default
            || txn.ProviderTxnId.Length > 60 || txn.AccountNo.Length > 40 || (txn.Content?.Length ?? 0) > 200)
            throw new AppException(StatusCodes.Status400BadRequest, "webhook.bad_payload",
                "Thân webhook phải có providerTxnId, accountNo, amount (nguyên đồng, > 0), occurredAt; content tuỳ chọn.");

        // Gửi lại cùng giao dịch vẫn trả 200 (Outcome = Duplicate) để trung gian thanh toán không gửi lại mãi
        return Ok(await webhook.ProcessAsync(txn, ct));
    }
}

/// <summary>
/// Giả lập "khách đã chuyển khoản" khi chạy Development (nút "Giả lập đã chuyển khoản" trên web): đi đúng luồng webhook,
/// không đi tắt đổi trạng thái. Ngoài Development trả 404 như thể không có endpoint.
/// </summary>
[ApiController]
[Route("api/dev/payments")]
[Authorize]
public sealed class DevPaymentsController(PaymentWebhookService webhook, AppDbContext db, IHostEnvironment env, TimeProvider clock) : ControllerBase
{
    [HttpPost("simulate")]
    [EndpointSummary("Chỉ Development — giả lập ngân hàng báo có cho một mã đối chiếu (để trống amount thì chuyển đúng số tiền yêu cầu)")]
    public async Task<ActionResult<WebhookResult>> Simulate(SimulatePaymentRequest req, CancellationToken ct)
    {
        if (!env.IsDevelopment()) return NotFound();
        var code = req.ReferenceCode.Trim().ToUpperInvariant();
        var target = await db.PaymentRequests.AsNoTracking()
                         .Where(r => r.ReferenceCode == code)
                         .Select(r => new { r.Amount, r.BatchAccount.ProviderAccountNo })
                         .SingleOrDefaultAsync(ct)
                     ?? throw new NotFoundException("payment.not_found", $"Không có yêu cầu chuyển khoản nào mang mã {code}.");
        var now = clock.GetUtcNow();
        var providerTxnId = $"SIM-{now:yyyyMMddHHmmss}-{Guid.NewGuid():N}";
        var txn = new ProviderPaymentNotification(
            providerTxnId.Length > 40 ? providerTxnId[..40] : providerTxnId,
            target.ProviderAccountNo,
            req.Amount ?? (long)target.Amount,
            $"{code} gia lap chuyen khoan",
            now);
        return Ok(await webhook.ProcessAsync(txn, ct));
    }
}
