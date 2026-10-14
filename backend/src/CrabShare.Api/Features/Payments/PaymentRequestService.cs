using System.Security.Cryptography;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Infrastructure.Payments;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Payments;

/// <summary>
/// Sinh yêu cầu thu tiền VietQR động vào tài khoản chuyên dùng của lô (TL-10, BR-66), dùng chung cho góp vốn, đơn hàng,
/// đặt trước và cọc bao tiêu. Hàm tạo chỉ thêm bản ghi vào DbContext, không lưu — module gọi tự SaveChanges trong
/// transaction của mình, để yêu cầu thu tiền không bao giờ tồn tại tách rời khỏi nghĩa vụ của nó.
/// Module gọi tự kiểm tra tài khoản lô đang Open và nghĩa vụ còn hiệu lực.
/// </summary>
public sealed class PaymentRequestService(AppDbContext db, IPaymentGateway gateway, ICurrentUser me, TimeProvider clock)
{
    /// <summary>Trường orderId của VietQR tối đa 13 ký tự (TL-10 §6.1, TL-29 §2).</summary>
    public const int ReferenceCodeLength = 13;

    /// <summary>Crockford base32: không có I, L, O, U để người phải chuyển tay khỏi gõ nhầm.</summary>
    public const string Alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

    private const int MaxCodeAttempts = 5;

    /// <summary>
    /// Thêm yêu cầu thu tiền cho đúng một nghĩa vụ rồi lấy nội dung QR. <paramref name="referenceCode"/> để null thì
    /// sinh mã mới: 2 ký tự tiền tố theo mục đích + 11 ký tự ngẫu nhiên, không trùng mã đã có.
    /// </summary>
    /// <param name="expiresAt">Mã QR chỉ có hiệu lực trong cửa sổ giữ chỗ của nghĩa vụ, không sống lâu hơn (TL-10 §6.1).</param>
    public async Task<CreatedPaymentRequest> CreateAsync(string purpose, decimal amount, long batchAccountId, string batchAccountNo,
        DateTimeOffset expiresAt, PaymentTarget target, string? referenceCode, CancellationToken ct)
    {
        var prefix = PaymentPurposes.Prefix(purpose);
        if (amount <= 0 || amount != decimal.Truncate(amount))
            throw new ArgumentOutOfRangeException(nameof(amount), amount, "Số tiền phải là số nguyên đồng lớn hơn 0.");
        var now = clock.GetUtcNow();
        if (expiresAt <= now)
            throw new BusinessRuleException("payment.expired", "Đã hết thời gian giữ chỗ, không tạo mã chuyển khoản được nữa.");
        referenceCode = referenceCode is null ? await NewReferenceCodeAsync(prefix, ct) : CheckReferenceCode(referenceCode);

        var request = new PaymentRequest
        {
            ReferenceCode = referenceCode,
            BatchAccountId = batchAccountId,
            Purpose = purpose,
            Amount = amount,
            ExpiresAt = expiresAt,
            Status = "Pending",
            CreatedAt = now,
            UpdatedAt = now,
        };
        target.ApplyTo(request);
        db.PaymentRequests.Add(request);
        var qr = await gateway.CreateVietQrAsync(new VietQrRequest(batchAccountNo, amount, referenceCode, expiresAt), ct);
        return new CreatedPaymentRequest(request, qr);
    }

    /// <summary>Thu tiền đơn hàng (CS-36): mã đối chiếu chính là mã đơn. Giữ nguyên chữ ký cho Orders.</summary>
    /// <param name="referenceCode">Mã đối chiếu tối đa 13 ký tự, nằm trong nội dung chuyển khoản.</param>
    /// <param name="expiresAt">Mã QR hết hiệu lực cùng lúc với giữ chỗ tồn kho, không sống lâu hơn (BR-59, TL-28 §8).</param>
    public async Task<VietQrPayment> CreateForOrderAsync(SalesOrder order, long batchAccountId, string batchAccountNo,
        decimal amount, string referenceCode, DateTimeOffset expiresAt, CancellationToken ct)
        => (await CreateAsync(PaymentPurposes.OrderPayment, amount, batchAccountId, batchAccountNo, expiresAt,
            PaymentTarget.ForOrder(order), referenceCode, ct)).Qr;

    /// <summary>Thông tin hiển thị của yêu cầu vừa tạo (dùng nội dung QR đã có, không gọi cổng thanh toán lần nữa).</summary>
    public PaymentRequestResponse Describe(CreatedPaymentRequest created, BatchAccount account, string batchCode)
        => ToResponse(created.Request, EffectiveStatus(created.Request, clock.GetUtcNow()), created.Qr.QrContent, account, batchCode);

    /// <summary>Thông tin hiển thị của một yêu cầu đã lưu; còn chờ thanh toán thì hỏi lại cổng thanh toán nội dung QR.</summary>
    public async Task<PaymentRequestResponse> DescribeAsync(PaymentRequest request, BatchAccount account, string batchCode, CancellationToken ct)
    {
        var status = EffectiveStatus(request, clock.GetUtcNow());
        string? qrContent = null;
        if (status == "Pending")
            qrContent = (await gateway.CreateVietQrAsync(
                new VietQrRequest(account.ProviderAccountNo, request.Amount, request.ReferenceCode, request.ExpiresAt), ct)).QrContent;
        return ToResponse(request, status, qrContent, account, batchCode);
    }

    /// <summary>Yêu cầu thu tiền của chính người đang đăng nhập: người góp vốn, người mua hoặc người bao tiêu.</summary>
    public async Task<PaymentRequestResponse> GetMineAsync(long paymentRequestId, CancellationToken ct)
    {
        var userId = me.UserId;
        var row = await db.PaymentRequests.AsNoTracking()
                      .Where(r => r.PaymentRequestId == paymentRequestId)
                      .Select(r => new
                      {
                          Request = r,
                          r.BatchAccount,
                          r.BatchAccount.Batch.BatchCode,
                          OwnerId = r.ContributionId != null ? r.Contribution!.InvestorId
                              : r.OrderId != null ? r.Order!.CustomerId
                              : r.Offtake!.Contribution.InvestorId,
                      })
                      .SingleOrDefaultAsync(ct)
                  ?? throw new NotFoundException("payment.not_found", "Không tìm thấy yêu cầu chuyển khoản.");
        if (row.OwnerId != userId)
            throw new ForbiddenException("payment.not_owner", "Yêu cầu chuyển khoản này không phải của bạn.");
        return await DescribeAsync(row.Request, row.BatchAccount, row.BatchCode, ct);
    }

    /// <summary>Pending đã quá hạn coi như Expired ngay, không chờ job TH-07 đổi trong CSDL.</summary>
    public static string EffectiveStatus(PaymentRequest request, DateTimeOffset now)
        => request.Status == "Pending" && request.ExpiresAt <= now ? "Expired" : request.Status;

    private static PaymentRequestResponse ToResponse(PaymentRequest r, string status, string? qrContent, BatchAccount account, string batchCode)
        => new(r.PaymentRequestId, r.Purpose, status, batchCode, r.ReferenceCode, (long)r.Amount,
            status == "Pending" ? qrContent : null, r.ExpiresAt, account.ProviderName, account.ProviderAccountNo);

    private async Task<string> NewReferenceCodeAsync(string prefix, CancellationToken ct)
    {
        for (var attempt = 0; attempt < MaxCodeAttempts; attempt++)
        {
            var code = prefix + new string(RandomNumberGenerator.GetItems<char>(Alphabet, ReferenceCodeLength - prefix.Length));
            if (!db.PaymentRequests.Local.Any(r => r.ReferenceCode == code)
                && !await db.PaymentRequests.AnyAsync(r => r.ReferenceCode == code, ct))
                return code;
        }
        throw new InvalidOperationException("Không sinh được mã đối chiếu không trùng.");
    }

    private static string CheckReferenceCode(string code)
        => code.Length is > 0 and <= ReferenceCodeLength && code.All(c => c is >= '0' and <= '9' or >= 'A' and <= 'Z')
            ? code
            : throw new ArgumentException($"Mã đối chiếu phải gồm 1–{ReferenceCodeLength} chữ in hoa không dấu hoặc chữ số: {code}", nameof(code));
}
