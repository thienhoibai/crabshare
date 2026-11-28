using CrabShare.Api.Common.Errors;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;

namespace CrabShare.Api.Features.Auth;

public sealed class GoogleAuthOptions
{
    public const string Section = "GoogleAuth";
    public string? ClientId { get; set; }
    public string[] ClientIds { get; set; } = [];

    public string[] AllowedAudiences() =>
        ClientIds.Concat((ClientId ?? "").Split(',', ';', ' '))
            .Select(s => s.Trim()).Where(s => s.Length > 0).Distinct(StringComparer.Ordinal).ToArray();
}

public sealed record GoogleIdentity(string Subject, string Email, string FullName);

public interface IGoogleTokenVerifier
{
    Task<GoogleIdentity> VerifyAsync(string idToken, CancellationToken ct);
}

public sealed class GoogleTokenVerifier(
    IOptions<GoogleAuthOptions> options,
    IConfigurationManager<OpenIdConnectConfiguration>? oidc = null) : IGoogleTokenVerifier
{
    private const string DiscoveryUrl = "https://accounts.google.com/.well-known/openid-configuration";
    private static readonly string[] ValidIssuers = ["https://accounts.google.com", "accounts.google.com"];
    private static readonly JsonWebTokenHandler Handler = new() { MapInboundClaims = false };

    private readonly IConfigurationManager<OpenIdConnectConfiguration> _oidc = oidc ??
        new ConfigurationManager<OpenIdConnectConfiguration>(
            DiscoveryUrl,
            new OpenIdConnectConfigurationRetriever(),
            new HttpDocumentRetriever { RequireHttps = true });

    public async Task<GoogleIdentity> VerifyAsync(string idToken, CancellationToken ct)
    {
        var audiences = options.Value.AllowedAudiences();
        if (audiences.Length == 0)
            throw new AppException(StatusCodes.Status503ServiceUnavailable, "auth.google_unconfigured", "Đăng nhập Google chưa được cấu hình trên máy chủ.");

        OpenIdConnectConfiguration config;
        try
        {
            config = await _oidc.GetConfigurationAsync(ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            throw new AppException(StatusCodes.Status503ServiceUnavailable, "auth.google_unavailable", "Không tải được khoá xác thực Google. Vui lòng thử lại.");
        }

        var result = await Handler.ValidateTokenAsync(idToken, new TokenValidationParameters
        {
            ValidateIssuerSigningKey = true,
            IssuerSigningKeys = config.SigningKeys,
            ValidateIssuer = true,
            ValidIssuers = ValidIssuers,
            ValidateAudience = true,
            ValidAudiences = audiences,
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromMinutes(2),
        });

        if (!result.IsValid)
            throw new AppException(StatusCodes.Status401Unauthorized, "auth.invalid_google_token", "Phiên đăng nhập Google không hợp lệ hoặc đã hết hạn.");

        var sub = ClaimString(result.Claims, "sub");
        var email = ClaimString(result.Claims, "email");
        if (string.IsNullOrEmpty(sub) || sub.Length > 255 || string.IsNullOrEmpty(email) || email.Length > 254 || !email.Contains('@'))
            throw new AppException(StatusCodes.Status401Unauthorized, "auth.invalid_google_token", "Thông tin định danh Google không hợp lệ.");

        var verified = result.Claims.TryGetValue("email_verified", out var rawVerified) &&
            (rawVerified is true || (rawVerified is string text && string.Equals(text, "true", StringComparison.OrdinalIgnoreCase)));
        if (!verified)
            throw new AppException(StatusCodes.Status401Unauthorized, "auth.google_email_unverified", "Email Google chưa được xác minh.");

        var name = ClaimString(result.Claims, "name");
        if (string.IsNullOrWhiteSpace(name)) name = email.Split('@')[0];
        if (name.Length > 150) name = name[..150];

        return new GoogleIdentity(sub, email, name);
    }

    private static string? ClaimString(IDictionary<string, object> claims, string key) =>
        claims.TryGetValue(key, out var value) ? value?.ToString()?.Trim() : null;
}
