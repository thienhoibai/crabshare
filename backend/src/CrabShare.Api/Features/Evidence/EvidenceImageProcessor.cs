using System.Numerics;
using System.Globalization;
using System.Security.Cryptography;
using CrabShare.Api.Common.Errors;
using SkiaSharp;

namespace CrabShare.Api.Features.Evidence;

public sealed record EvidenceImage(byte[] Bytes, string ContentType, string Extension, string Sha256, string PerceptualHash);

public sealed class EvidenceImageProcessor
{
    public async Task<EvidenceImage> ReadAsync(IFormFile file, CancellationToken ct)
    {
        if (file.Length <= 0 || file.Length > EvidenceUploadLimits.MaxImageBytes) throw Invalid("Ảnh cần có dung lượng từ 1 byte đến 5 MB.");
        var claimed = file.ContentType.ToLowerInvariant();
        if (claimed is not ("image/jpeg" or "image/png" or "image/webp")) throw Invalid("Ảnh cần có định dạng JPEG, PNG hoặc WebP.");
        await using var input = file.OpenReadStream();
        using var buffer = new MemoryStream();
        var chunk = new byte[81920];
        int read;
        while ((read = await input.ReadAsync(chunk, ct)) > 0)
        {
            if (buffer.Length + read > EvidenceUploadLimits.MaxImageBytes) throw Invalid("Ảnh vượt quá dung lượng 5 MB.");
            await buffer.WriteAsync(chunk.AsMemory(0, read), ct);
        }
        var bytes = buffer.ToArray();
        try
        {
            using var data = SKData.CreateCopy(bytes);
            using var codec = SKCodec.Create(data) ?? throw Invalid("Ảnh bị hỏng hoặc không được hỗ trợ.");
            var info = codec.Info;
            if (info.Width <= 0 || info.Height <= 0 || (long)info.Width * info.Height > EvidenceUploadLimits.MaxPixels)
                throw Invalid("Ảnh có kích thước quá lớn. Vui lòng chụp lại.");
            var actual = codec.EncodedFormat switch { SKEncodedImageFormat.Jpeg => "image/jpeg", SKEncodedImageFormat.Png => "image/png", SKEncodedImageFormat.Webp => "image/webp", _ => null };
            if (actual != claimed) throw Invalid("Nội dung ảnh không khớp định dạng đã gửi.");
            if (codec.FrameCount > 1) throw Invalid("Vui lòng gửi ảnh tĩnh chụp bằng camera.");
            ct.ThrowIfCancellationRequested();
            using var decoded = new SKBitmap(new SKImageInfo(info.Width, info.Height, SKColorType.Rgba8888, SKAlphaType.Premul));
            if (codec.GetPixels(decoded.Info, decoded.GetPixels()) != SKCodecResult.Success) throw Invalid("Ảnh bị hỏng hoặc chưa đầy đủ.");
            using var image = new SKBitmap(9, 8, SKColorType.Rgba8888, SKAlphaType.Premul);
            if (!decoded.ScalePixels(image, new SKSamplingOptions(SKFilterMode.Linear))) throw Invalid("Không xử lý được ảnh.");
            ulong hash = 0;
            for (var y = 0; y < 8; y++)
                for (var x = 0; x < 8; x++)
                    hash = (hash << 1) | (Luminance(image.GetPixel(x, y)) > Luminance(image.GetPixel(x + 1, y)) ? 1UL : 0UL);
            return new(bytes, actual!, actual == "image/jpeg" ? ".jpg" : actual == "image/png" ? ".png" : ".webp",
                Convert.ToHexStringLower(SHA256.HashData(bytes)), hash.ToString("x16", CultureInfo.InvariantCulture));
        }
        catch (Exception error) when (error is ArgumentException or InvalidOperationException)
        { throw Invalid("Ảnh bị hỏng hoặc định dạng không được hỗ trợ. Vui lòng chụp lại."); }
    }

    private static int Luminance(SKColor color) => 299 * color.Red + 587 * color.Green + 114 * color.Blue;

    public static int Distance(string a, string b) => ulong.TryParse(a, NumberStyles.HexNumber, CultureInfo.InvariantCulture, out var left)
        && ulong.TryParse(b, NumberStyles.HexNumber, CultureInfo.InvariantCulture, out var right)
        ? BitOperations.PopCount(left ^ right) : int.MaxValue;
    private static AppException Invalid(string message) => new(400, "evidence.invalid_image", message);
}
