using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace CrabShare.Api.Common.Auth;

/// <summary>Tạo JWT sau khi đăng nhập. Claim "operator_id" chỉ có khi người dùng là nhân viên của một người nuôi.</summary>
public sealed class TokenService(IOptions<JwtOptions> options, TimeProvider clock)
{
    private readonly JwtOptions _jwt = options.Value;

    public (string Token, DateTimeOffset ExpiresAt) Create(long userId, string email, string fullName, IEnumerable<string> roles, long? operatorId)
    {
        var expires = clock.GetUtcNow().AddMinutes(_jwt.ExpiryMinutes);
        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, userId.ToString()),
            new(JwtRegisteredClaimNames.Email, email),
            new("name", fullName),
        };
        claims.AddRange(roles.Select(r => new Claim(AuthSetup.RoleClaim, r)));
        if (operatorId is not null) claims.Add(new Claim(CurrentUser.OperatorIdClaim, operatorId.Value.ToString()));

        var creds = new SigningCredentials(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_jwt.SigningKey)), SecurityAlgorithms.HmacSha256);
        var token = new JwtSecurityToken(_jwt.Issuer, _jwt.Audience, claims, expires: expires.UtcDateTime, signingCredentials: creds);
        return (new JwtSecurityTokenHandler().WriteToken(token), expires);
    }
}
