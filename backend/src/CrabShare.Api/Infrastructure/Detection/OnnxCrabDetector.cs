using Microsoft.Extensions.Options;
using Microsoft.ML.OnnxRuntime;
using Microsoft.ML.OnnxRuntime.Tensors;
using SkiaSharp;

namespace CrabShare.Api.Infrastructure.Detection;

/// <summary>
/// Chạy YOLO (Ultralytics) đã xuất ONNX. Thiếu file mô hình → trả "none" giống Noop.
/// </summary>
public sealed class OnnxCrabDetector : ICrabDetector, IDisposable
{
    private readonly CrabDetectorOptions _options;
    private readonly IHostEnvironment _env;
    private readonly ILogger<OnnxCrabDetector> _logger;
    private readonly object _gate = new();
    private InferenceSession? _session;
    private string? _inputName;
    private bool _loadAttempted;
    private bool _disposed;

    public OnnxCrabDetector(IOptions<CrabDetectorOptions> options, IHostEnvironment env, ILogger<OnnxCrabDetector> logger)
    {
        _options = options.Value;
        _env = env;
        _logger = logger;
    }

    public Task<CrabDetectionResult> DetectAsync(Stream image, CancellationToken ct)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        ct.ThrowIfCancellationRequested();

        var session = EnsureSession();
        if (session is null || _inputName is null)
            return Task.FromResult(new CrabDetectionResult(null, null, "none"));

        try
        {
            using var bitmap = DecodeBitmap(image);
            ct.ThrowIfCancellationRequested();
            var tensor = LetterboxToTensor(bitmap, _options.InputSize);
            using var results = session.Run(new[] { NamedOnnxValue.CreateFromTensor(_inputName, tensor) });
            ct.ThrowIfCancellationRequested();
            var output = results[0].AsEnumerable<float>().ToArray();
            var dims = results[0].AsTensor<float>().Dimensions.ToArray();
            var best = BestConfidence(output, dims);
            var detected = best >= _options.ConfidenceThreshold;
            return Task.FromResult(new CrabDetectionResult(detected, (decimal)best, _options.ModelVersion));
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw; }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "ONNX crab detection failed");
            return Task.FromResult(new CrabDetectionResult(null, null, "unavailable"));
        }
    }

    private InferenceSession? EnsureSession()
    {
        if (_session is not null) return _session;
        lock (_gate)
        {
            if (_session is not null) return _session;
            if (_loadAttempted) return null;
            _loadAttempted = true;

            var path = ResolveModelPath(_options.ModelPath);
            if (path is null || !File.Exists(path))
            {
                _logger.LogInformation("Crab detector model not found at {Path}; using none", _options.ModelPath);
                return null;
            }

            try
            {
                var session = new InferenceSession(path);
                _inputName = session.InputMetadata.Keys.First();
                _session = session;
                _logger.LogInformation("Loaded crab detector {Version} from {Path}", _options.ModelVersion, path);
                return _session;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to load ONNX model from {Path}", path);
                return null;
            }
        }
    }

    private string? ResolveModelPath(string configured)
    {
        if (string.IsNullOrWhiteSpace(configured)) return null;
        if (Path.IsPathRooted(configured)) return configured;
        var candidates = new[]
        {
            Path.Combine(_env.ContentRootPath, configured),
            Path.Combine(AppContext.BaseDirectory, configured),
            Path.GetFullPath(configured),
        };
        return candidates.FirstOrDefault(File.Exists) ?? Path.Combine(_env.ContentRootPath, configured);
    }

    private static SKBitmap DecodeBitmap(Stream image)
    {
        if (image.CanSeek) image.Position = 0;
        using var data = SKData.Create(image);
        using var codec = SKCodec.Create(data) ?? throw new InvalidOperationException("Unsupported image");
        var info = codec.Info;
        var bitmap = new SKBitmap(new SKImageInfo(info.Width, info.Height, SKColorType.Rgba8888, SKAlphaType.Premul));
        if (codec.GetPixels(bitmap.Info, bitmap.GetPixels()) != SKCodecResult.Success)
        {
            bitmap.Dispose();
            throw new InvalidOperationException("Failed to decode image");
        }
        return bitmap;
    }

    /// <summary>Letterbox RGB float32 NCHW [0,1] khớp Ultralytics.</summary>
    internal static DenseTensor<float> LetterboxToTensor(SKBitmap source, int size)
    {
        var scale = Math.Min(size / (float)source.Width, size / (float)source.Height);
        var newW = Math.Max(1, (int)Math.Round(source.Width * scale));
        var newH = Math.Max(1, (int)Math.Round(source.Height * scale));
        var padX = (size - newW) / 2;
        var padY = (size - newH) / 2;

        using var scaled = new SKBitmap(new SKImageInfo(newW, newH, SKColorType.Rgba8888, SKAlphaType.Premul));
        if (!source.ScalePixels(scaled, new SKSamplingOptions(SKFilterMode.Linear)))
            throw new InvalidOperationException("Resize failed");

        using var canvasBitmap = new SKBitmap(new SKImageInfo(size, size, SKColorType.Rgba8888, SKAlphaType.Premul));
        using (var canvas = new SKCanvas(canvasBitmap))
        using (var skImage = SKImage.FromBitmap(scaled))
        {
            canvas.Clear(new SKColor(114, 114, 114)); // letterbox gray (Ultralytics default)
            canvas.DrawImage(skImage, padX, padY, new SKSamplingOptions(SKFilterMode.Linear));
        }

        var tensor = new DenseTensor<float>(new[] { 1, 3, size, size });
        for (var y = 0; y < size; y++)
        {
            for (var x = 0; x < size; x++)
            {
                var c = canvasBitmap.GetPixel(x, y);
                tensor[0, 0, y, x] = c.Red / 255f;
                tensor[0, 1, y, x] = c.Green / 255f;
                tensor[0, 2, y, x] = c.Blue / 255f;
            }
        }
        return tensor;
    }

    /// <summary>
    /// Ultralytics ONNX: [1, 4+nc, N] hoặc [1, N, 4+nc]. Lấy max class score (class 0 = crab).
    /// </summary>
    internal static float BestConfidence(float[] data, int[] dims)
    {
        if (dims.Length == 3 && dims[0] == 1)
        {
            // [1, attrs, anchors]
            if (dims[1] <= dims[2] && dims[1] >= 5)
            {
                var attrs = dims[1];
                var anchors = dims[2];
                var best = 0f;
                for (var i = 0; i < anchors; i++)
                {
                    var score = data[4 * anchors + i]; // class 0 channel
                    if (attrs > 5)
                    {
                        for (var c = 1; c < attrs - 4; c++)
                            score = Math.Max(score, data[(4 + c) * anchors + i]);
                    }
                    if (score > best) best = score;
                }
                return Math.Clamp(best, 0f, 1f);
            }

            // [1, anchors, attrs]
            if (dims[2] >= 5)
            {
                var anchors = dims[1];
                var attrs = dims[2];
                var best = 0f;
                for (var i = 0; i < anchors; i++)
                {
                    var baseIdx = i * attrs;
                    var score = data[baseIdx + 4];
                    for (var c = 5; c < attrs; c++)
                        score = Math.Max(score, data[baseIdx + c]);
                    if (score > best) best = score;
                }
                return Math.Clamp(best, 0f, 1f);
            }
        }

        // Fallback: max value in tensor (đủ để không crash; log qua caller nếu cần)
        return data.Length == 0 ? 0f : Math.Clamp(data.Max(), 0f, 1f);
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        lock (_gate)
        {
            _session?.Dispose();
            _session = null;
        }
    }
}
