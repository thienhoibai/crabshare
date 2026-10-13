using System.Security.Cryptography;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Features.Evidence;

namespace CrabShare.Api.Tests;

public class EvidenceImageTests
{
    [Fact]
    public async Task SHA256_is_of_original_bytes_and_dHash_is_known_gradient_vector()
    {
        var bytes = EvidenceImages.Png(reverse: true);
        var image = await new EvidenceImageProcessor().ReadAsync(EvidenceImages.File(bytes), default);
        Assert.Equal(Convert.ToHexStringLower(SHA256.HashData(bytes)), image.Sha256);
        Assert.Equal("ffffffffffffffff", image.PerceptualHash);
        Assert.Equal("image/png", image.ContentType); Assert.Equal(".png", image.Extension);
        Assert.Equal(64, EvidenceImageProcessor.Distance(image.PerceptualHash, "0000000000000000"));
    }
    [Fact]
    public async Task Differently_encoded_near_identical_photos_have_a_small_perceptual_distance()
    {
        var processor = new EvidenceImageProcessor();
        var a = await processor.ReadAsync(EvidenceImages.File(EvidenceImages.Png()), default);
        var b = await processor.ReadAsync(EvidenceImages.File(EvidenceImages.Png(tint: 1)), default);
        Assert.NotEqual(a.Sha256, b.Sha256); Assert.Equal(0, EvidenceImageProcessor.Distance(a.PerceptualHash, b.PerceptualHash));
    }
    [Fact]
    public async Task Corrupt_spoofed_empty_and_oversized_photos_are_rejected()
    {
        foreach (var file in new[] { EvidenceImages.File([1,2,3]), EvidenceImages.File([]), EvidenceImages.File(EvidenceImages.Png(), "image/jpeg"), EvidenceImages.File(new byte[EvidenceUploadLimits.MaxImageBytes + 1]) })
            Assert.Equal(400, (await Assert.ThrowsAsync<AppException>(() => new EvidenceImageProcessor().ReadAsync(file, default))).StatusCode);
    }
}
