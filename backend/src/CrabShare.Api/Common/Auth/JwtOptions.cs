namespace CrabShare.Api.Common.Auth;

/// <summary>Cấu hình JWT, đọc từ mục "Jwt" trong appsettings.</summary>
public sealed class JwtOptions
{
    public string Issuer { get; set; } = "crabshare-api";
    public string Audience { get; set; } = "crabshare-clients";

    /// <summary>Khoá ký token. Dev để trong appsettings.Development.json; môi trường thật đặt bằng biến môi trường Jwt__SigningKey.</summary>
    public string SigningKey { get; set; } = "";

    public int ExpiryMinutes { get; set; } = 480;
}
