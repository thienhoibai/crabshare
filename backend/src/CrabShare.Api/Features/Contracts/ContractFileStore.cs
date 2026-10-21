using System.Security.Cryptography;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Infrastructure.Storage;
using Microsoft.Extensions.Options;

namespace CrabShare.Api.Features.Contracts;

/// <summary>
/// Kho file hợp đồng PDF (TL-19 §6): mỗi phiên bản (bản nháp, sau chữ ký người nuôi, bản đủ hai chữ ký) lưu nguyên byte tại
/// <c>contracts/{số hợp đồng}/{sha256}.pdf</c> dưới <c>Storage:RootPath</c> (trên Azure là <c>/home/data/storage</c>, không mất khi deploy).
/// Tên file chính là mã băm nên không cần thêm cột để tìm lại từng phiên bản, và không bao giờ ghi đè nội dung khác.
/// Không đi qua IFileStorage vì Cloudinary chỉ nhận ảnh. Mỗi lần đọc đều băm lại để phát hiện file bị tráo.
/// </summary>
public sealed class ContractFileStore(IOptions<StorageOptions> options, IHostEnvironment env, ILogger<ContractFileStore> logger)
{
    private readonly string root = Path.GetFullPath(Path.Combine(env.ContentRootPath, options.Value.RootPath));

    public static string UriFor(string contractNo, string sha256) => $"contracts/{contractNo}/{sha256}.pdf";

    /// <summary>Lưu một phiên bản; trả về đường dẫn tương đối và SHA-256 của đúng byte đã lưu.</summary>
    public async Task<(string Uri, string Sha256)> SaveAsync(string contractNo, byte[] pdf, CancellationToken ct)
    {
        var sha = Convert.ToHexStringLower(SHA256.HashData(pdf));
        var uri = UriFor(contractNo, sha);
        var full = Resolve(uri);
        if (!File.Exists(full))
        {
            Directory.CreateDirectory(Path.GetDirectoryName(full)!);
            var temp = full + ".tmp-" + Guid.NewGuid().ToString("N");
            await File.WriteAllBytesAsync(temp, pdf, ct);
            File.Move(temp, full, overwrite: true); // cùng tên = cùng mã băm = cùng nội dung
        }
        return (uri, sha);
    }

    /// <summary>Đọc phiên bản có mã băm <paramref name="sha256"/>; nội dung không khớp mã đã ghi → 500 contract.file_tampered.</summary>
    public async Task<byte[]> ReadAsync(string contractNo, string sha256, CancellationToken ct)
    {
        var full = Resolve(UriFor(contractNo, sha256.Trim()));
        if (!File.Exists(full))
        {
            logger.LogError("Thiếu file hợp đồng {ContractNo} phiên bản {Sha}", contractNo, sha256);
            throw new AppException(StatusCodes.Status500InternalServerError, "contract.file_missing", "Không tìm thấy file hợp đồng. Báo quản trị viên.");
        }
        var bytes = await File.ReadAllBytesAsync(full, ct);
        if (!string.Equals(Convert.ToHexStringLower(SHA256.HashData(bytes)), sha256.Trim(), StringComparison.OrdinalIgnoreCase))
        {
            logger.LogError("File hợp đồng {ContractNo} không khớp mã băm {Sha}", contractNo, sha256);
            throw new AppException(StatusCodes.Status500InternalServerError, "contract.file_tampered", "File hợp đồng không khớp mã băm đã ghi. Báo quản trị viên.");
        }
        return bytes;
    }

    private string Resolve(string uri)
    {
        var full = Path.GetFullPath(Path.Combine(root, uri));
        var relative = Path.GetRelativePath(root, full);
        if (relative.StartsWith("..") || Path.IsPathRooted(relative))
            throw new UnauthorizedAccessException("Đường dẫn file hợp đồng không hợp lệ.");
        return full;
    }
}
