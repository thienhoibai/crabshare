using System.Security.Cryptography;
using Microsoft.Extensions.Options;

namespace CrabShare.Api.Infrastructure.Storage;

public sealed class StorageOptions
{
    /// <summary>Thư mục gốc lưu file (ảnh bằng chứng, hợp đồng PDF...). Đường dẫn tương đối tính từ thư mục chạy API.</summary>
    public string RootPath { get; set; } = "storage";
}

/// <summary>File đã lưu: đường dẫn tương đối để ghi vào CSDL (cột file_uri) và mã băm SHA-256 (cột content_hash).</summary>
public sealed record StoredFile(string Uri, string Sha256, long SizeBytes, string ContentType);

public interface IFileStorage
{
    /// <summary>Lưu file vào thư mục con (ví dụ "evidence/2026/10"), tính SHA-256 trong lúc ghi.</summary>
    Task<StoredFile> SaveAsync(Stream content, string fileName, string contentType, string folder, CancellationToken ct);

    Task<Stream> OpenReadAsync(string uri, CancellationToken ct);
    Task DeleteAsync(string uri, CancellationToken ct);
}

/// <summary>Lưu file trên ổ đĩa máy chủ. Đủ cho đồ án; muốn lên cloud thì viết class khác cài cùng interface.</summary>
public sealed class LocalFileStorage(IOptions<StorageOptions> options, IHostEnvironment env) : IFileStorage
{
    private readonly string _root = Path.GetFullPath(Path.Combine(env.ContentRootPath, options.Value.RootPath));

    public async Task<StoredFile> SaveAsync(Stream content, string fileName, string contentType, string folder, CancellationToken ct)
    {
        var safeName = $"{Guid.NewGuid():N}{Path.GetExtension(fileName).ToLowerInvariant()}";
        var relative = Path.Combine(folder, safeName).Replace('\\', '/');
        var full = Resolve(relative);
        Directory.CreateDirectory(Path.GetDirectoryName(full)!);

        using var sha = SHA256.Create();
        try
        {
            await using (var file = File.Create(full))
            await using (var hashing = new CryptoStream(file, sha, CryptoStreamMode.Write))
            {
                await content.CopyToAsync(hashing, ct);
            }

            return new StoredFile(relative, Convert.ToHexStringLower(sha.Hash!), new FileInfo(full).Length, contentType);
        }
        catch
        {
            // File riêng của lần ghi đang thất bại, không để ảnh ghi dở lại trong storage.
            File.Delete(full);
            throw;
        }
    }

    public Task<Stream> OpenReadAsync(string uri, CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();
        return Task.FromResult<Stream>(File.OpenRead(Resolve(uri)));
    }

    public Task DeleteAsync(string uri, CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();
        File.Delete(Resolve(uri));
        return Task.CompletedTask;
    }

    private string Resolve(string uri)
    {
        if (string.IsNullOrWhiteSpace(uri) || Path.IsPathRooted(uri)) throw new UnauthorizedAccessException("Đường dẫn file không hợp lệ.");
        var full = Path.GetFullPath(Path.Combine(_root, uri));
        var relative = Path.GetRelativePath(_root, full);
        if (relative == "." || relative == ".." || relative.StartsWith(".." + Path.DirectorySeparatorChar) || Path.IsPathRooted(relative))
            throw new UnauthorizedAccessException("Đường dẫn file không hợp lệ.");
        return full;
    }
}
