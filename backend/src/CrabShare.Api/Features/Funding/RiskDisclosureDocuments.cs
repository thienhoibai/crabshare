using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using CrabShare.Api.Common.Errors;

namespace CrabShare.Api.Features.Funding;

/// <summary>
/// Đọc toàn văn bản công bố rủi ro từ database/reference/risk-disclosure-{version}.md (được copy vào thư mục chạy,
/// xem CrabShare.Api.csproj) và kiểm tra SHA-256 khớp content_hash đã ghi trong CSDL (V002) — nội dung bị sửa thì không hiển thị.
/// </summary>
public sealed class RiskDisclosureDocuments(ILogger<RiskDisclosureDocuments> logger)
{
    private readonly ConcurrentDictionary<string, string> cache = new();

    public string Read(string versionCode, string contentHash) => cache.GetOrAdd(versionCode, _ =>
    {
        var path = Path.Combine(AppContext.BaseDirectory, "Reference", $"risk-disclosure-{versionCode}.md");
        if (!File.Exists(path))
        {
            logger.LogError("Thiếu file bản công bố rủi ro {Path}", path);
            throw Unavailable();
        }
        var bytes = File.ReadAllBytes(path);
        if (!string.Equals(Convert.ToHexStringLower(SHA256.HashData(bytes)), contentHash.Trim(), StringComparison.OrdinalIgnoreCase))
        {
            logger.LogError("Bản công bố rủi ro {Version} không khớp content_hash trong CSDL", versionCode);
            throw Unavailable();
        }
        return Encoding.UTF8.GetString(bytes);
    });

    private static AppException Unavailable() => new(StatusCodes.Status500InternalServerError,
        "funding.disclosure_unavailable", "Không đọc được bản công bố rủi ro. Báo quản trị viên.");
}
