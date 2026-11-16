using System.Globalization;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;

namespace CrabShare.Api.Features.Grading;

/// <summary>Cấu hình AI đo mai (BR-226). Mode: None (mặc định, chưa có mô hình → đo thước kẹp), Http (gọi dịch vụ mô hình), Simulated (chỉ cho demo với thiết bị giả lập).</summary>
public sealed class CarapaceAiOptions
{
    public const string Section = "Grading:Ai";
    public string Mode { get; set; } = "None";
    /// <summary>Địa chỉ dịch vụ mô hình, ví dụ http://localhost:8001/infer (Mode = Http).</summary>
    public string? Endpoint { get; set; }
    public int TimeoutSeconds { get; set; } = 20;
}

public sealed record CarapaceAiRequest(string SessionNo, string CrabType, decimal WeightG, int? CameraHeightMm, byte[] WhiteImage, byte[]? RedImage);

/// <summary>Kết quả cho một ảnh: Succeeded, LowConfidence hoặc Failed (kèm lý do).</summary>
public sealed record CarapaceImageResult(string Status, string? ImageQuality, string? LandmarksJson, decimal? CarapaceLengthCm, decimal? CarapaceWidthCm,
    decimal? CarapaceAreaCm2, decimal? EdgeBandMm, decimal? Confidence, string? Error)
{
    public static CarapaceImageResult Failed(string error) => new("Failed", null, null, null, null, null, null, null, error);
}

public sealed record CarapaceAiResult(string ModelName, string ModelVersion, bool Simulated, CarapaceImageResult White, CarapaceImageResult? Red);

/// <summary>
/// AI suy luận từ ảnh lượt đo (AIInference, BR-226): ảnh đèn trắng cho điểm mốc, chiều dài mai, chiều rộng mai, diện tích mai;
/// ảnh soi đỏ cho dải xuyên sáng viền mai. AI chỉ đề xuất số đo; không tự duyệt hạng (BR-155).
/// </summary>
public interface ICarapaceAi
{
    Task<CarapaceAiResult> InferAsync(CarapaceAiRequest request, CancellationToken ct);
}

/// <summary>Chưa cấu hình mô hình: trả Failed để hệ thống yêu cầu đo thước kẹp, không bịa số.</summary>
public sealed class UnconfiguredCarapaceAi : ICarapaceAi
{
    private const string Reason = "Chưa cấu hình mô hình AI đo mai; đo chiều dài mai bằng thước kẹp (BR-226).";

    public Task<CarapaceAiResult> InferAsync(CarapaceAiRequest request, CancellationToken ct)
        => Task.FromResult(new CarapaceAiResult("none", "0", false, CarapaceImageResult.Failed(Reason),
            request.RedImage is null ? null : CarapaceImageResult.Failed(Reason)));
}

/// <summary>
/// Gọi dịch vụ mô hình qua HTTP. Hợp đồng: POST multipart (meta JSON, white, red) → JSON
/// { modelName, modelVersion, white: { status, imageQuality, landmarks, carapaceLengthCm, carapaceWidthCm, carapaceAreaCm2, confidence, error },
///   red: { status, imageQuality, edgeBandMm, confidence, error } }.
/// Lỗi mạng hoặc trả sai định dạng thì coi như Failed để chuyển sang thước kẹp.
/// </summary>
public sealed class HttpCarapaceAi(HttpClient http, IOptions<CarapaceAiOptions> options, ILogger<HttpCarapaceAi> log) : ICarapaceAi
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public async Task<CarapaceAiResult> InferAsync(CarapaceAiRequest request, CancellationToken ct)
    {
        try
        {
            using var form = new MultipartFormDataContent
            {
                { new StringContent(JsonSerializer.Serialize(new { request.SessionNo, request.CrabType, request.WeightG, request.CameraHeightMm }, Json), Encoding.UTF8, "application/json"), "meta" },
            };
            form.Add(Image(request.WhiteImage), "white", "white.jpg");
            if (request.RedImage is { } red) form.Add(Image(red), "red", "red.jpg");
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
            timeout.CancelAfter(TimeSpan.FromSeconds(Math.Clamp(options.Value.TimeoutSeconds, 1, 120)));
            using var response = await http.PostAsync(options.Value.Endpoint, form, timeout.Token);
            response.EnsureSuccessStatusCode();
            var body = await response.Content.ReadFromJsonAsync<HttpBody>(Json, timeout.Token)
                       ?? throw new InvalidOperationException("Dịch vụ AI trả thân rỗng.");
            return new CarapaceAiResult(Trim(body.ModelName, 50) ?? "unknown", Trim(body.ModelVersion, 30) ?? "unknown", false,
                Map(body.White) ?? CarapaceImageResult.Failed("Dịch vụ AI không trả kết quả ảnh đèn trắng."),
                request.RedImage is null ? null : Map(body.Red) ?? CarapaceImageResult.Failed("Dịch vụ AI không trả kết quả ảnh soi đỏ."));
        }
        catch (Exception e) when (e is HttpRequestException or TaskCanceledException or JsonException or InvalidOperationException or NotSupportedException)
        {
            log.LogWarning(e, "AI đo mai lỗi với lượt đo {SessionNo}; chuyển sang thước kẹp", request.SessionNo);
            var failed = CarapaceImageResult.Failed("Không gọi được dịch vụ AI; đo chiều dài mai bằng thước kẹp.");
            return new CarapaceAiResult("http", "unavailable", false, failed, request.RedImage is null ? null : failed);
        }
    }

    private static ByteArrayContent Image(byte[] bytes)
    {
        var content = new ByteArrayContent(bytes);
        content.Headers.ContentType = new MediaTypeHeaderValue("image/jpeg");
        return content;
    }

    private static CarapaceImageResult? Map(HttpImage? x)
    {
        if (x is null) return null;
        var status = x.Status is "Succeeded" or "LowConfidence" or "Failed" ? x.Status : "Failed";
        var error = status == "Failed" ? Trim(x.Error, 300) ?? "Dịch vụ AI báo lỗi không rõ lý do." : Trim(x.Error, 300);
        return new CarapaceImageResult(status, x.ImageQuality is "Good" or "Poor" or "Unusable" ? x.ImageQuality : null,
            x.Landmarks.ValueKind == JsonValueKind.Undefined ? null : Trim(x.Landmarks.GetRawText(), 2000),
            Positive(x.CarapaceLengthCm), Positive(x.CarapaceWidthCm), Positive(x.CarapaceAreaCm2), x.EdgeBandMm is >= 0 ? x.EdgeBandMm : null,
            x.Confidence is >= 0 and <= 1 ? decimal.Round(x.Confidence.Value, 4) : null, error);
    }

    private static decimal? Positive(decimal? v) => v is > 0 ? decimal.Round(v.Value, 2) : null;
    private static string? Trim(string? s, int max) => string.IsNullOrWhiteSpace(s) ? null : s.Length <= max ? s : s[..max];

    private sealed record HttpBody(string? ModelName, string? ModelVersion, HttpImage? White, HttpImage? Red);
    private sealed record HttpImage(string? Status, string? ImageQuality, JsonElement Landmarks, decimal? CarapaceLengthCm, decimal? CarapaceWidthCm,
        decimal? CarapaceAreaCm2, decimal? EdgeBandMm, decimal? Confidence, string? Error);
}

/// <summary>
/// Mô hình giả lập cho demo với thiết bị giả lập (BR-230): không nhìn ảnh, sinh số đo hợp lý từ khối lượng và mã lượt đo.
/// Mọi kết quả ghi is_simulated = 1 và tên mô hình "simulated"; không dùng khi có dữ liệu thật.
/// </summary>
public sealed class SimulatedCarapaceAi : ICarapaceAi
{
    public Task<CarapaceAiResult> InferAsync(CarapaceAiRequest request, CancellationToken ct)
    {
        var seed = BitConverter.ToUInt32(SHA256.HashData(Encoding.UTF8.GetBytes(request.SessionNo)), 0);
        var u = (seed % 10_000) / 10_000m;                 // 0..1, cùng lượt đo thì cùng số
        var c = 0.59m + u * 0.11m;                           // chỉ số C giả định 0,59–0,70 g/cm³
        var length = decimal.Round((decimal)Math.Cbrt((double)(request.WeightG / c)), 2);
        var width = decimal.Round(length * 1.45m, 2);
        var area = decimal.Round(length * width * 0.62m, 2);
        var landmarks = string.Create(CultureInfo.InvariantCulture, $"{{\"note\":\"simulated\",\"carapaceLengthCm\":{length}}}");
        var white = new CarapaceImageResult("Succeeded", "Good", landmarks, length, width, area, null, 0.9m, null);
        CarapaceImageResult? red = null;
        if (request.RedImage is not null)
        {
            var band = request.CrabType == "RoeCrab" ? decimal.Round(1m + u * 4m, 2) : decimal.Round(u, 2);
            red = new CarapaceImageResult("Succeeded", "Good", null, null, null, null, band, 0.9m, null);
        }
        return Task.FromResult(new CarapaceAiResult("simulated", "0.1", true, white, red));
    }
}
