namespace CrabShare.Api.Infrastructure.Detection;

public sealed class CrabDetectorOptions
{
    public const string Section = "CrabDetector";

    /// <summary>Đường dẫn tới file ONNX (tương đối ContentRoot hoặc tuyệt đối).</summary>
    public string ModelPath { get; set; } = "models/crab-detector-v1.onnx";

    /// <summary>Ngưỡng tin cậy image-level: có cua nếu box tốt nhất ≥ ngưỡng.</summary>
    public float ConfidenceThreshold { get; set; } = 0.25f;

    public int InputSize { get; set; } = 640;

    public string ModelVersion { get; set; } = "crab-detector-v1";
}
