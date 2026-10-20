using System.Globalization;
using System.Net;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using CrabShare.Api.Common.Errors;

namespace CrabShare.Api.Infrastructure.Storage;

public sealed class CloudinaryStorageOptions
{
    public string CloudName { get; set; } = "";
    public string ApiKey { get; set; } = "";
    public string ApiSecret { get; set; } = "";

    public static CloudinaryStorageOptions Read(IConfiguration config)
    {
        var options = config.GetSection("Cloudinary").Get<CloudinaryStorageOptions>() ?? new();
        if (string.IsNullOrEmpty(options.ApiSecret) && config["CLOUDINARY_URL"] is { Length: > 0 } url)
        {
            if (!Uri.TryCreate(url, UriKind.Absolute, out var parsed) || parsed.Scheme != "cloudinary")
                throw new InvalidOperationException("CLOUDINARY_URL không hợp lệ; không đưa thông tin kết nối vào log hoặc source.");
            var pair = parsed.UserInfo.Split(':', 2);
            if (pair.Length != 2) throw new InvalidOperationException("CLOUDINARY_URL cần có API key và secret.");
            options.CloudName = parsed.Host; options.ApiKey = Uri.UnescapeDataString(pair[0]); options.ApiSecret = Uri.UnescapeDataString(pair[1]);
        }
        if (!Regex.IsMatch(options.CloudName, @"\A[a-zA-Z0-9_-]+\z") || !Regex.IsMatch(options.ApiKey, @"\A[0-9]+\z") || string.IsNullOrWhiteSpace(options.ApiSecret))
            throw new InvalidOperationException("Thiếu hoặc sai Cloudinary:CloudName/ApiKey/ApiSecret. Đặt bằng User Secrets hoặc biến môi trường backend.");
        return options;
    }
}

/// <summary>New images live in Cloudinary. Stable identifiers keep secrets/signed URLs out of SQL.
/// Existing relative file paths continue to be read/deleted from the old local store.</summary>
public sealed class CloudinaryFileStorage(CloudinaryStorageOptions options, LocalFileStorage legacy, HttpClient http, TimeProvider clock) : IFileStorage
{
    private const int MaxImageBytes = 10 * 1024 * 1024;
    private string Prefix => $"cloudinary:{options.CloudName}/image/authenticated/";
    private string Endpoint(string action) => $"https://api.cloudinary.com/v1_1/{options.CloudName}/image/{action}";

    public async Task<StoredFile> SaveAsync(Stream content, string fileName, string contentType, string folder, CancellationToken ct)
    {
        var extension = Path.GetExtension(fileName).ToLowerInvariant();
        var expected = extension switch { ".jpg" or ".jpeg" => "image/jpeg", ".png" => "image/png", ".webp" => "image/webp", _ => null };
        if (expected is null || contentType != expected) throw new AppException(400, "storage.image_format", "Ảnh cần đúng định dạng JPEG, PNG hoặc WebP.");
        if (!Regex.IsMatch(folder, @"\A[A-Za-z0-9_-]+(?:/[A-Za-z0-9_-]+)*\z") || folder.Length > 200)
            throw new UnauthorizedAccessException("Thư mục ảnh không hợp lệ.");
        using var buffer = new MemoryStream();
        var block = new byte[81920];
        int read;
        while ((read = await content.ReadAsync(block, ct)) != 0)
        {
            if (buffer.Length + read > MaxImageBytes) throw new AppException(400, "storage.image_size", "Ảnh vượt dung lượng lưu trữ cho phép.");
            await buffer.WriteAsync(block.AsMemory(0, read), ct);
        }
        if (buffer.Length == 0) throw new AppException(400, "storage.empty_image", "Ảnh không được rỗng.");
        var bytes = buffer.ToArray();
        var publicId = $"crabshare/{folder}/{Guid.NewGuid():N}";
        using var multipart = new MultipartFormDataContent();
        var photo = new ByteArrayContent(bytes); photo.Headers.ContentType = new MediaTypeHeaderValue(contentType);
        multipart.Add(photo, "file", "capture" + extension);
        multipart.Add(new StringContent(publicId), "public_id");
        multipart.Add(new StringContent("authenticated"), "type");
        multipart.Add(new StringContent("false"), "overwrite");
        using var request = AuthenticatedRequest("upload", multipart);
        using var response = await SendAsync(request, ct);
        await RequireSuccessAsync(response, ct);
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync(ct));
        var result = json.RootElement;
        if (result.GetProperty("public_id").GetString() != publicId || result.GetProperty("resource_type").GetString() != "image"
            || result.GetProperty("type").GetString() != "authenticated")
            throw Unavailable("Cloudinary trả về định danh ảnh không đúng yêu cầu.");
        var format = result.GetProperty("format").GetString();
        if (format is not ("jpg" or "jpeg" or "png" or "webp")) throw Unavailable("Cloudinary trả về định dạng ảnh không được hỗ trợ.");
        return new(Prefix + publicId + "." + format, Convert.ToHexStringLower(SHA256.HashData(bytes)), bytes.Length, contentType);
    }

    public async Task<Stream> OpenReadAsync(string uri, CancellationToken ct)
    {
        if (!uri.StartsWith("cloudinary:", StringComparison.Ordinal))
        {
            ValidateLegacy(uri);
            return await legacy.OpenReadAsync(uri, ct);
        }
        var (publicId, format) = Parse(uri);
        var now = clock.GetUtcNow().ToUnixTimeSeconds();
        var values = new SortedDictionary<string, string>(StringComparer.Ordinal)
        {
            ["public_id"] = publicId, ["format"] = format, ["type"] = "authenticated",
            ["timestamp"] = now.ToString(CultureInfo.InvariantCulture), ["expires_at"] = (now + 120).ToString(CultureInfo.InvariantCulture),
        };
        var canonical = string.Join("&", values.Select(p => $"{p.Key}={p.Value}"));
        // Cloudinary's private_download_url signature protocol (SHA-1, not a password hash).
        values["signature"] = Convert.ToHexStringLower(SHA1.HashData(Encoding.UTF8.GetBytes(canonical + options.ApiSecret)));
        values["api_key"] = options.ApiKey;
        var query = string.Join("&", values.Select(p => $"{Uri.EscapeDataString(p.Key)}={Uri.EscapeDataString(p.Value)}"));
        using var request = new HttpRequestMessage(HttpMethod.Get, Endpoint("download") + "?" + query);
        using var response = await SendAsync(request, ct);
        if (response.StatusCode == HttpStatusCode.NotFound) throw new FileNotFoundException("Không tìm thấy ảnh trên Cloudinary.");
        await RequireSuccessAsync(response, ct);
        return new MemoryStream(await response.Content.ReadAsByteArrayAsync(ct), writable: false);
    }

    public async Task DeleteAsync(string uri, CancellationToken ct)
    {
        if (!uri.StartsWith("cloudinary:", StringComparison.Ordinal))
        { ValidateLegacy(uri); await legacy.DeleteAsync(uri, ct); return; }
        var (publicId, _) = Parse(uri);
        using var body = new FormUrlEncodedContent(new Dictionary<string, string> { ["public_id"] = publicId, ["type"] = "authenticated", ["invalidate"] = "true" });
        using var request = AuthenticatedRequest("destroy", body);
        using var response = await SendAsync(request, ct);
        await RequireSuccessAsync(response, ct);
    }

    private HttpRequestMessage AuthenticatedRequest(string action, HttpContent body)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, Endpoint(action)) { Content = body };
        request.Headers.Authorization = new AuthenticationHeaderValue("Basic", Convert.ToBase64String(Encoding.UTF8.GetBytes(options.ApiKey + ":" + options.ApiSecret)));
        return request;
    }
    private (string PublicId, string Format) Parse(string uri)
    {
        if (!uri.StartsWith(Prefix, StringComparison.Ordinal)) throw new UnauthorizedAccessException("Ảnh không thuộc kho Cloudinary đã cấu hình.");
        var path = uri[Prefix.Length..];
        if (!Regex.IsMatch(path, @"\Acrabshare/[A-Za-z0-9_-]+(?:/[A-Za-z0-9_-]+)*\.(?:jpg|jpeg|png|webp)\z"))
            throw new UnauthorizedAccessException("Định danh ảnh không hợp lệ.");
        var dot = path.LastIndexOf('.'); return (path[..dot], path[(dot + 1)..]);
    }
    private static void ValidateLegacy(string uri)
    {
        if (string.IsNullOrWhiteSpace(uri) || uri.Contains(':') || Path.IsPathRooted(uri))
            throw new UnauthorizedAccessException("Đường dẫn ảnh không hợp lệ.");
    }
    private async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
    {
        try { return await http.SendAsync(request, ct); }
        catch (HttpRequestException) { throw Unavailable("Chưa kết nối được kho ảnh Cloudinary. Vui lòng thử lại."); }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested) { throw Unavailable("Kho ảnh Cloudinary phản hồi quá hạn. Vui lòng thử lại."); }
    }
    private static Task RequireSuccessAsync(HttpResponseMessage response, CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();
        if (!response.IsSuccessStatusCode)
            throw Unavailable(response.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden
                ? "Cloudinary từ chối truy cập ảnh. Kiểm tra khóa và quyền kho ảnh trên backend."
                : "Kho ảnh Cloudinary chưa xử lý được yêu cầu. Vui lòng thử lại.");
        return Task.CompletedTask;
    }
    private static AppException Unavailable(string message) => new(503, "storage.cloudinary_unavailable", message);
}
