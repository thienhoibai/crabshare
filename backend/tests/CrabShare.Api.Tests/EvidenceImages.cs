using Microsoft.AspNetCore.Http;
using SkiaSharp;

namespace CrabShare.Api.Tests;

internal static class EvidenceImages
{
    public static byte[] Png(bool reverse = false, byte tint = 0)
    {
        using var bitmap = new SKBitmap(90, 80);
        for (var y = 0; y < bitmap.Height; y++)
            for (var x = 0; x < bitmap.Width; x++)
            {
                var value = (byte)(reverse ? 255 - x * 2 : x * 2);
                bitmap.SetPixel(x, y, new SKColor(value, (byte)Math.Min(255, value + tint), value, 255));
            }
        using var image = SKImage.FromBitmap(bitmap);
        using var data = image.Encode(SKEncodedImageFormat.Png, 100);
        return data.ToArray();
    }
    public static FormFile File(byte[] bytes, string contentType = "image/png") => new(new MemoryStream(bytes), 0, bytes.Length, "image", "camera.png") { Headers = new HeaderDictionary(), ContentType = contentType };
    public static byte[] Noise(int seed)
    {
        var random = new Random(seed);
        using var bitmap = new SKBitmap(90, 80);
        for (var y = 0; y < bitmap.Height; y++)
            for (var x = 0; x < bitmap.Width; x++)
                bitmap.SetPixel(x, y, new SKColor((byte)random.Next(256), (byte)random.Next(256), (byte)random.Next(256), 255));
        using var image = SKImage.FromBitmap(bitmap); using var encoded = image.Encode(SKEncodedImageFormat.Png, 100);
        return encoded.ToArray();
    }
}
