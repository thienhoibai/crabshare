using System.Security.Cryptography;
using System.Text;

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

/// <summary>
/// Bản giả lập: không ký thật. Giống dịch vụ thật ở chỗ chữ ký được NỐI vào cuối file (ở đây là một dòng chú thích PDF, trình đọc
/// bỏ qua), nên mỗi lần ký ra một file mới có mã băm mới mà phần đã ký trước vẫn nguyên (TL-19: H1 → H2).
/// Thay bằng ViettelSigningService khi có sandbox.
/// </summary>
public sealed class FakeSigningService(TimeProvider clock) : IDigitalSigningService
{
    public Task<SignedDocument> SignAsync(byte[] pdf, string signerName, string signerRole, CancellationToken ct)
    {
        var signedAt = clock.GetUtcNow();
        var signer = Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(signerName)))[..12];
        var stamp = Encoding.ASCII.GetBytes($"\n%CrabShare-FakeSign role={signerRole} signer={signer} at={signedAt:yyyy-MM-ddTHH:mm:ss.fffZ}\n");
        byte[] signed = [.. pdf, .. stamp];
        var hash = Convert.ToHexStringLower(SHA256.HashData(signed));
        return Task.FromResult(new SignedDocument(signed, hash, signedAt, $"FAKE-SIGN-{signerRole}-{hash[..8]}"));
    }
}
