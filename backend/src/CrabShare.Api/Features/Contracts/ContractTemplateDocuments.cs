using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using CrabShare.Api.Common.Errors;

namespace CrabShare.Api.Features.Contracts;

/// <summary>
/// Đọc toàn văn mẫu hợp đồng từ database/reference/contract-template-{version}.md (copy vào thư mục chạy, xem CrabShare.Api.csproj)
/// và kiểm tra SHA-256 khớp content_hash trong CSDL (V002) — mẫu bị sửa thì không sinh hợp đồng. Giống Funding/RiskDisclosureDocuments.
/// </summary>
public sealed partial class ContractTemplateDocuments(ILogger<ContractTemplateDocuments> logger)
{
    private readonly ConcurrentDictionary<string, string> cache = new();

    public string Read(string versionCode, string contentHash) => cache.GetOrAdd(versionCode, _ =>
    {
        var path = Path.Combine(AppContext.BaseDirectory, "Reference", $"contract-template-{versionCode}.md");
        if (!File.Exists(path))
        {
            logger.LogError("Thiếu file mẫu hợp đồng {Path}", path);
            throw Unavailable();
        }
        var bytes = File.ReadAllBytes(path);
        if (!string.Equals(Convert.ToHexStringLower(SHA256.HashData(bytes)), contentHash.Trim(), StringComparison.OrdinalIgnoreCase))
        {
            logger.LogError("Mẫu hợp đồng {Version} không khớp content_hash trong CSDL", versionCode);
            throw Unavailable();
        }
        return Encoding.UTF8.GetString(bytes);
    });

    /// <summary>Thay mọi <c>{{khoá}}</c> bằng giá trị; khoá không có dữ liệu thì để "—" (không để lộ chỗ trống của mẫu).</summary>
    public static string Fill(string template, IReadOnlyDictionary<string, string> values)
        => Placeholder().Replace(template, m => values.TryGetValue(m.Groups[1].Value, out var value) && value.Length > 0 ? value : "—");

    [GeneratedRegex(@"\{\{\s*([a-z_]+\.[a-z_]+)\s*\}\}")]
    private static partial Regex Placeholder();

    private static AppException Unavailable() => new(StatusCodes.Status500InternalServerError,
        "contract.template_unavailable", "Không đọc được mẫu hợp đồng. Báo quản trị viên.");
}
