using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using CrabShare.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Common.Auth;

public static class AuthSetup
{
    /// <summary>Tên claim chứa vai trò trong JWT (ngắn gọn để web/mobile đọc được).</summary>
    public const string RoleClaim = "role";

    public static IServiceCollection AddAppAuth(this IServiceCollection services, IConfiguration config)
    {
        var jwt = config.GetSection("Jwt").Get<JwtOptions>() ?? new JwtOptions();
        if (string.IsNullOrWhiteSpace(jwt.SigningKey) || jwt.SigningKey.Length < 32)
            throw new InvalidOperationException("Thiếu Jwt:SigningKey (tối thiểu 32 ký tự). Xem backend/README.md.");

        services.Configure<JwtOptions>(config.GetSection("Jwt"));
        services.AddSingleton<TokenService>();
        services.AddHttpContextAccessor();
        services.AddScoped<ICurrentUser, CurrentUser>();

        services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer(o =>
            {
                o.MapInboundClaims = false;
                // Khoá tài khoản có hiệu lực cả với JWT đã cấp, không chờ token hết hạn.
                o.Events = new JwtBearerEvents
                {
                    OnTokenValidated = async context =>
                    {
                        if (!long.TryParse(context.Principal?.FindFirstValue("sub"), out var userId)) { context.Fail("Invalid subject."); return; }
                        var db = context.HttpContext.RequestServices.GetRequiredService<AppDbContext>();
                        var status = await db.AppUsers.AsNoTracking().Where(u => u.UserId == userId).Select(u => u.Status)
                            .SingleOrDefaultAsync(context.HttpContext.RequestAborted);
                        if (status is null or "Locked") context.Fail("Account unavailable.");
                    },
                };
                o.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidIssuer = jwt.Issuer,
                    ValidAudience = jwt.Audience,
                    IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwt.SigningKey)),
                    NameClaimType = "name",
                    RoleClaimType = RoleClaim,
                    ClockSkew = TimeSpan.FromMinutes(1),
                };
            });

        services.AddAuthorizationBuilder()
            .AddPolicy(Policies.Admin, p => p.RequireRole(Roles.PlatformAdmin))
            .AddPolicy(Policies.Operator, p => p.RequireRole(Roles.OperatorMember))
            .AddPolicy(Policies.Investor, p => p.RequireRole(Roles.Investor))
            .AddPolicy(Policies.Customer, p => p.RequireRole(Roles.Customer, Roles.Investor))
            .AddPolicy(Policies.Reviewer, p => p.RequireRole(Roles.EvidenceReviewer));

        return services;
    }
}
