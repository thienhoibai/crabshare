using System.Security.Cryptography;
using System.Text;
using CrabShare.Api.Common.Errors;

namespace CrabShare.Api.Common.Auth;

/// <summary>Single-instance demo guard. Attempts in flight count too; expiry cannot be extended by an attacker.</summary>
public sealed class LoginAttemptLimiter(TimeProvider clock)
{
    private sealed record Window(DateTimeOffset End, int Count);
    private readonly Dictionary<string, Window> _windows = [];
    private readonly object _gate = new();
    private static string Key(string email) => Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(email)));

    public void Begin(string email)
    {
        lock (_gate)
        {
            var now = clock.GetUtcNow();
            foreach (var expired in _windows.Where(p => p.Value.End <= now).Select(p => p.Key).ToArray()) _windows.Remove(expired);
            var key = Key(email);
            if (_windows.TryGetValue(key, out var window) && window.Count >= 5)
                throw new AppException(429, "auth.rate_limited", "Đăng nhập sai quá nhiều lần. Vui lòng thử lại sau 15 phút.");
            if (window is null && _windows.Count >= 10_000)
                throw new AppException(429, "auth.rate_limited", "Có quá nhiều yêu cầu đăng nhập. Vui lòng thử lại sau.");
            _windows[key] = new(window?.End ?? now.AddMinutes(15), (window?.Count ?? 0) + 1);
        }
    }
    public void Success(string email) { lock (_gate) _windows.Remove(Key(email)); }
}
