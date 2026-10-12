using System.Security.Cryptography;

namespace CrabShare.Api.Infrastructure.Signing;

/// <summary>
/// Ký số hợp đồng qua dịch vụ ký của Viettel (TL-19): người nuôi ký trước, nhà đầu tư ký sau, trên cùng một file PDF.
/// Đường dự phòng: tải lên file đã ký ngoài hệ thống (UC15).
/// </summary>
public interface IDigitalSigningService
{
    /// <summary>Ký một file PDF thay mặt người ký (sandbox) và trả về file đã ký.</summary>
    Task<SignedDocument> SignAsync(byte[] pdf, string signerName, string signerRole, CancellationToken ct);
}

public sealed record SignedDocument(byte[] Pdf, string Sha256, DateTimeOffset SignedAt, string ProviderReference);

/// <summary>Bản giả lập: không ký thật, chỉ trả lại file kèm mã băm và thời điểm. Thay bằng ViettelSigningService khi có sandbox.</summary>
public sealed class FakeSigningService(TimeProvider clock) : IDigitalSigningService
{
    public Task<SignedDocument> SignAsync(byte[] pdf, string signerName, string signerRole, CancellationToken ct)
    {
        var hash = Convert.ToHexStringLower(SHA256.HashData(pdf));
        return Task.FromResult(new SignedDocument(pdf, hash, clock.GetUtcNow(), $"FAKE-SIGN-{signerRole}-{hash[..8]}"));
    }
}
