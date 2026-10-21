namespace CrabShare.Api.Infrastructure.Payments;

/// <summary>
/// Cổng thanh toán của tổ chức trung gian (TL-02, TL-10). Mỗi lô có một tài khoản ảo; tiền góp vốn
/// và tiền hàng đều chuyển vào tài khoản của lô bằng VietQR động. Nền tảng không giữ tiền.
/// </summary>
public interface IPaymentGateway
{
    /// <summary>
    /// Tạo yêu cầu thu tiền VietQR động cho một nghĩa vụ (khoản góp, đơn hàng, cọc bao tiêu). Gọi lại với cùng tham số
    /// phải trả cùng nội dung QR: màn hình tải lại sẽ hỏi lại thay vì lưu chuỗi QR trong CSDL.
    /// </summary>
    Task<VietQrPayment> CreateVietQrAsync(VietQrRequest request, CancellationToken ct);

    /// <summary>Gửi lệnh chi từ tài khoản của lô (giải ngân, chi trả quyết toán, hoàn tiền).</summary>
    Task<PayoutResult> SendPayoutAsync(PayoutRequest request, CancellationToken ct);
}

/// <param name="ReferenceCode">Mã đối chiếu tối đa 13 ký tự, không dấu (TL-10), nằm trong nội dung chuyển khoản.</param>
public sealed record VietQrRequest(string BatchAccountNo, decimal Amount, string ReferenceCode, DateTimeOffset ExpiresAt);

/// <param name="QrContent">Chuỗi nội dung QR; web và app tự vẽ ảnh QR từ chuỗi này.</param>
public sealed record VietQrPayment(string ReferenceCode, string QrContent, decimal Amount, DateTimeOffset ExpiresAt);

public sealed record PayoutRequest(string FromBatchAccountNo, string ToBankCode, string ToAccountNo, string ToAccountName, decimal Amount, string Reference);

public sealed record PayoutResult(bool Accepted, string ProviderTransactionId, string? Error);

public interface IBatchAccountProvisioner
{
    // Providers must be idempotent by batch code. The current sandbox has no external side effects.
    Task<(string ProviderName,string AccountNo)> OpenBatchAccountAsync(string batchCode,CancellationToken ct);
}

/// <summary>
/// Bản giả lập để dev và demo: không gọi ra ngoài. Tiền "về" khi gọi endpoint giả lập webhook
/// (sẽ làm trong Features/Payments). Thay bằng class gọi sandbox thật khi có tài khoản.
/// </summary>
public sealed class FakePaymentGateway : IPaymentGateway, IBatchAccountProvisioner
{
    public Task<(string ProviderName,string AccountNo)> OpenBatchAccountAsync(string batchCode,CancellationToken ct)
        => Task.FromResult(("Trung gian thanh toán (sandbox)","SBX"+batchCode.Replace("-","")));
    public Task<VietQrPayment> CreateVietQrAsync(VietQrRequest r, CancellationToken ct)
    {
        var content = $"VIETQR|SANDBOX|{r.BatchAccountNo}|{r.Amount:0}|{r.ReferenceCode}";
        return Task.FromResult(new VietQrPayment(r.ReferenceCode, content, r.Amount, r.ExpiresAt));
    }

    /// <summary>
    /// Idempotent theo <see cref="PayoutRequest.Reference"/> như trung gian thật (TL-10: khoá idempotency): gửi lại cùng mã tham chiếu
    /// (ví dụ EF chạy lại transaction khi kết nối chập chờn) nhận lại đúng mã giao dịch cũ, không sinh giao dịch thứ hai.
    /// </summary>
    public Task<PayoutResult> SendPayoutAsync(PayoutRequest r, CancellationToken ct) =>
        Task.FromResult(new PayoutResult(true, $"FAKE-OUT-{r.Reference}", null));
}
