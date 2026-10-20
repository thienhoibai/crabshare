using CrabShare.Api.Infrastructure.Detection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using SkiaSharp;

namespace CrabShare.Api.Tests;

public class OnnxCrabDetectorTests
{
    [Fact]
    public async Task Missing_model_returns_none_like_noop()
    {
        var detector = CreateDetector(modelPath: "models/does-not-exist.onnx");
        await using var stream = new MemoryStream(TinyJpeg());
        var result = await detector.DetectAsync(stream, CancellationToken.None);
        Assert.Null(result.CrabDetected);
        Assert.Null(result.Confidence);
        Assert.Equal("none", result.ModelVersion);
    }

    [Fact]
    public void BestConfidence_reads_ultralytics_channels_first()
    {
        // [1, 5, 2]: two anchors, class score on channel 4
        var dims = new[] { 1, 5, 2 };
        var data = new float[10];
        data[4 * 2 + 0] = 0.2f;
        data[4 * 2 + 1] = 0.91f;
        Assert.Equal(0.91f, OnnxCrabDetector.BestConfidence(data, dims));
    }

    [Fact]
    public void BestConfidence_reads_ultralytics_channels_last()
    {
        // [1, 2, 5]
        var dims = new[] { 1, 2, 5 };
        var data = new float[] { 0, 0, 0, 0, 0.3f, 0, 0, 0, 0, 0.77f };
        Assert.Equal(0.77f, OnnxCrabDetector.BestConfidence(data, dims));
    }

    [Fact]
    public void Letterbox_produces_nchw_640()
    {
        using var bmp = new SKBitmap(new SKImageInfo(320, 240, SKColorType.Rgba8888, SKAlphaType.Premul));
        bmp.Erase(SKColors.Red);
        var tensor = OnnxCrabDetector.LetterboxToTensor(bmp, 640);
        Assert.Equal(new[] { 1, 3, 640, 640 }, tensor.Dimensions.ToArray());
        Assert.InRange(tensor[0, 0, 320, 320], 0.9f, 1f); // red channel near center of letterboxed image
    }

    private static OnnxCrabDetector CreateDetector(string modelPath)
    {
        var options = Options.Create(new CrabDetectorOptions
        {
            ModelPath = modelPath,
            ConfidenceThreshold = 0.25f,
            InputSize = 640,
            ModelVersion = "crab-detector-v1",
        });
        return new OnnxCrabDetector(options, new FakeHostEnvironment(), NullLogger<OnnxCrabDetector>.Instance);
    }

    private static byte[] TinyJpeg()
    {
        using var bmp = new SKBitmap(new SKImageInfo(8, 8, SKColorType.Rgba8888, SKAlphaType.Premul));
        bmp.Erase(SKColors.Blue);
        using var image = SKImage.FromBitmap(bmp);
        using var data = image.Encode(SKEncodedImageFormat.Jpeg, 80);
        return data.ToArray();
    }

    private sealed class FakeHostEnvironment : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = Environments.Development;
        public string ApplicationName { get; set; } = "CrabShare.Api.Tests";
        public string ContentRootPath { get; set; } = AppContext.BaseDirectory;
        public Microsoft.Extensions.FileProviders.IFileProvider ContentRootFileProvider { get; set; }
            = new Microsoft.Extensions.FileProviders.NullFileProvider();
    }
}
