namespace CrabShare.Api.Infrastructure.Detection;

/// <summary>
/// Nhận diện cua trong ảnh hộp nuôi (TSK-13). Kết quả chỉ là MỘT tín hiệu trong điểm rủi ro,
/// không bao giờ tự từ chối bằng chứng và không bao giờ được dùng trong quyết toán.
/// </summary>
public interface ICrabDetector
{
    Task<CrabDetectionResult> DetectAsync(Stream image, CancellationToken ct);
}

/// <param name="CrabDetected">null nghĩa là chưa có mô hình hoặc không kết luận được.</param>
/// <param name="Confidence">Độ tin cậy 0–1 của kết luận.</param>
/// <param name="ModelVersion">Lưu vào evidence_detection.model_version để truy lại kết quả.</param>
public sealed record CrabDetectionResult(bool? CrabDetected, decimal? Confidence, string ModelVersion);

/// <summary>Chưa có mô hình: trả "không kết luận". Task TSK-13 thay bằng OnnxCrabDetector (ONNX Runtime).</summary>
public sealed class NoopCrabDetector : ICrabDetector
{
    public Task<CrabDetectionResult> DetectAsync(Stream image, CancellationToken ct) =>
        Task.FromResult(new CrabDetectionResult(null, null, "none"));
}
