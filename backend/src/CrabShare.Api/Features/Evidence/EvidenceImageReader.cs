using CrabShare.Api.Common.Errors;
using CrabShare.Api.Infrastructure.Storage;

namespace CrabShare.Api.Features.Evidence;

public sealed record EvidenceImageContent(Stream Stream, string ContentType);

// Call only after checking the caller's current role and access to this evidence.
public sealed class EvidenceImageReader(IFileStorage storage)
{
    public async Task<EvidenceImageContent> OpenAsync(string fileUri, string mediaType, CancellationToken ct)
    {
        var type = Path.GetExtension(fileUri).ToLowerInvariant() switch
        {
            ".jpg" or ".jpeg" => "image/jpeg", ".png" => "image/png", ".webp" => "image/webp", _ => null,
        };
        if (mediaType != "Photo" || type is null)
            throw new BusinessRuleException("evidence.not_photo", "Bằng chứng này không có ảnh ở định dạng được hỗ trợ.");
        try { return new(await storage.OpenReadAsync(fileUri, ct), type); }
        catch (Exception error) when (error is FileNotFoundException or DirectoryNotFoundException or UnauthorizedAccessException)
        { throw new NotFoundException("evidence.image_not_found", "Không tìm thấy ảnh bằng chứng."); }
    }
}
