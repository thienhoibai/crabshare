namespace CrabShare.Api.Infrastructure.Ekyc;

/// <summary>
/// eKYC thương mại (TL-06): đọc CCCD và so khớp khuôn mặt. Chỉ lưu KẾT QUẢ (đạt/không, mã tham chiếu),
/// không lưu ảnh CCCD hay ảnh khuôn mặt.
/// </summary>
public interface IEkycProvider
{
    Task<EkycResult> VerifyAsync(Stream idCardFront, Stream idCardBack, Stream selfie, CancellationToken ct);
}

public sealed record EkycResult(bool Passed, string ProviderReference, string? FullNameOnCard, string? FailureReason);

/// <summary>Bản giả lập: luôn trả về đạt. Thay bằng class gọi nhà cung cấp eKYC khi có API key dùng thử.</summary>
public sealed class FakeEkycProvider : IEkycProvider
{
    public Task<EkycResult> VerifyAsync(Stream idCardFront, Stream idCardBack, Stream selfie, CancellationToken ct) =>
        Task.FromResult(new EkycResult(true, $"FAKE-EKYC-{Guid.NewGuid():N}"[..20], null, null));
}
