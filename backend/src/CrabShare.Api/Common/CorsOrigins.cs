using System.Text.RegularExpressions;

namespace CrabShare.Api.Common;

/// <summary>
/// Origin được gọi API từ trình duyệt: danh sách chính xác (Cors:Origins) cộng các mẫu có dấu * (Cors:OriginPatterns),
/// ví dụ "https://crabshare-*-nguyn1hien.vercel.app" cho mọi bản Preview của project Vercel.
/// Dấu * chỉ khớp chữ, số và gạch ngang trong một nhãn tên miền, nên không lấn sang tên miền khác.
/// </summary>
public static class CorsOrigins
{
    public static Func<string, bool> Matcher(IEnumerable<string> origins, IEnumerable<string> patterns)
    {
        var exact = new HashSet<string>(origins.Select(o => o.TrimEnd('/')), StringComparer.OrdinalIgnoreCase);
        var wildcard = patterns
            .Select(p => new Regex("^" + Regex.Escape(p.TrimEnd('/')).Replace(@"\*", "[a-z0-9-]+") + "$",
                RegexOptions.IgnoreCase | RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(100)))
            .ToList();
        return origin => exact.Contains(origin) || wildcard.Any(r => r.IsMatch(origin));
    }
}
