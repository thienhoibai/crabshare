using System.Net;
using System.Threading.RateLimiting;
using CrabShare.Api.Common.Auth;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.RateLimiting;

namespace CrabShare.Api.Infrastructure.Security;

public static class SecuritySetup
{
    public static IServiceCollection AddAppSecurity(this IServiceCollection services, IConfiguration config, IHostEnvironment environment)
    {
        var onAppService = !string.IsNullOrEmpty(config["WEBSITE_INSTANCE_ID"]);
        var keyPath = config["Security:DataProtectionKeyPath"] ?? (onAppService ? "/home/data/keys" : null);
        if (!environment.IsDevelopment() && string.IsNullOrWhiteSpace(keyPath))
            throw new InvalidOperationException("Production requires a persistent private Security:DataProtectionKeyPath.");
        services.AddSingleton(new PayoutAccountProtection(keyPath ?? PayoutAccountProtection.DefaultPath));
        // Development tests may exercise validation/403 without a database. Production always upgrades before serving.
        if (!environment.IsDevelopment() || config.GetValue<bool>("Security:UpgradeLegacyPayouts"))
            services.AddHostedService<PayoutProtectionUpgrade>();
        services.AddSingleton<LoginAttemptLimiter>();
        services.Configure<ForwardedHeadersOptions>(o =>
        {
            o.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
            // App Service routes through two hops (front-end LB → ARR → Kestrel), so ForwardLimit
            // must be 2 for IsHttps to be set correctly. Default stays 1 elsewhere.
            o.ForwardLimit = onAppService ? 2 : 1;
            foreach (var proxy in config.GetSection("Security:KnownProxies").Get<string[]>() ?? [])
                o.KnownProxies.Add(IPAddress.Parse(proxy));
            // App Service's private ingress ranges, as documented by Microsoft. Kestrel is not public there.
            // On App Service for Linux the platform hands the request to the container from the sandbox's
            // link-local network (169.254.0.0/16, the same range as WEBSITE_PRIVATE_IP), not from an RFC 1918
            // address. Without that range every forwarded header is ignored, IsHttps stays false and the whole
            // API answers 400 security.https_required (CS-88; deploy smoke check anonymous-private-route-401).
            var networks = config.GetSection("Security:KnownNetworks").Get<string[]>() ?? (onAppService
                ? ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "169.254.0.0/16",
                   "::ffff:10.0.0.0/104", "::ffff:172.16.0.0/108", "::ffff:192.168.0.0/112", "::ffff:169.254.0.0/112"] : []);
            foreach (var network in networks) o.KnownIPNetworks.Add(System.Net.IPNetwork.Parse(network));
            // Keep framework loopback defaults; never clear trust lists or trust arbitrary client headers.
        });
        services.AddHsts(o => { o.MaxAge = TimeSpan.FromDays(180); });
        services.AddRateLimiter(o =>
        {
            var permitLimit = config.GetValue<int?>("Security:AuthIpPermitLimit") ?? 60;
            if (permitLimit is < 1 or > 10_000) throw new InvalidOperationException("Invalid authentication IP permit limit.");
            o.RejectionStatusCode = 429;
            o.AddPolicy("auth-attempts", context => RateLimitPartition.GetFixedWindowLimiter(
                context.Connection.RemoteIpAddress?.ToString() ?? "unknown", _ => new FixedWindowRateLimiterOptions
                { PermitLimit = permitLimit, Window = TimeSpan.FromMinutes(1), QueueLimit = 0, AutoReplenishment = true }));
            o.OnRejected = async (context, ct) =>
            {
                context.HttpContext.Response.Headers.RetryAfter = "60";
                await Results.Problem(statusCode: 429, title: "auth.rate_limited", detail: "Có quá nhiều yêu cầu đăng nhập. Vui lòng thử lại sau.")
                    .ExecuteAsync(context.HttpContext);
            };
        });
        return services;
    }

    public static IApplicationBuilder UseAppSecurity(this WebApplication app)
    {
        app.UseForwardedHeaders();
        if (!app.Environment.IsDevelopment())
        {
            app.UseHsts();
            // Reject HTTP credentials instead of processing or replaying them via a redirect.
            // ForwardedHeaders (with ForwardLimit=2 on App Service) sets IsHttps=true for legitimate
            // HTTPS requests; untrusted X-Forwarded-Proto headers are ignored by the middleware.
            app.Use(async (context, next) =>
            {
                if (!context.Request.IsHttps && !context.Request.Path.StartsWithSegments("/api/health"))
                {
                    // Remote address and the (still unprocessed) forwarded headers only — no cookies or tokens.
                    // Enough to see from `az webapp log tail` which proxy hop was not in the trust list.
                    app.Logger.LogWarning("Rejected non-HTTPS request {Method} {Path} from {RemoteIp}; X-Forwarded-Proto='{Proto}'; X-Forwarded-For='{For}'",
                        context.Request.Method, context.Request.Path, context.Connection.RemoteIpAddress,
                        context.Request.Headers["X-Forwarded-Proto"].ToString(), context.Request.Headers["X-Forwarded-For"].ToString());
                    await Results.Problem(statusCode: 400, title: "security.https_required", detail: "HTTPS is required.").ExecuteAsync(context);
                    return;
                }
                await next(context);
            });
        }
        return app;
    }
}
