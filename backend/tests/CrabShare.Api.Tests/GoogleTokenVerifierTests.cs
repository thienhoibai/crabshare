using System.Security.Cryptography;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Features.Auth;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;

namespace CrabShare.Api.Tests;

public class GoogleTokenVerifierTests : IDisposable
{
    private const string ClientId = "123456-web.apps.googleusercontent.com";
    private readonly RSA _rsa = RSA.Create(2048);
    private readonly RsaSecurityKey _key;

    public GoogleTokenVerifierTests()
    {
        _key = new RsaSecurityKey(_rsa) { KeyId = "google-kid-1" };
    }

    public void Dispose() => _rsa.Dispose();

    private GoogleTokenVerifier CreateVerifier(string? clientId = ClientId)
    {
        var config = new OpenIdConnectConfiguration();
        config.SigningKeys.Add(_key);
        return new GoogleTokenVerifier(
            Options.Create(new GoogleAuthOptions { ClientId = clientId }),
            new StaticOidcConfig(config));
    }

    private string SignToken(
        string issuer = "https://accounts.google.com",
        string audience = ClientId,
        string? sub = "google-sub-001",
        string? email = "User@Example.com",
        object? emailVerified = null,
        string? name = "Nguyễn Văn A",
        DateTime? expiresUtc = null,
        SecurityKey? signingKey = null)
    {
        var claims = new Dictionary<string, object>();
        if (sub is not null) claims["sub"] = sub;
        if (email is not null) claims["email"] = email;
        claims["email_verified"] = emailVerified ?? true;
        if (name is not null) claims["name"] = name;

        var now = DateTime.UtcNow;
        return new JsonWebTokenHandler().CreateToken(new SecurityTokenDescriptor
        {
            Issuer = issuer,
            Audience = audience,
            Claims = claims,
            NotBefore = now.AddMinutes(-1),
            IssuedAt = now.AddMinutes(-1),
            Expires = expiresUtc ?? now.AddMinutes(30),
            SigningCredentials = new SigningCredentials(signingKey ?? _key, SecurityAlgorithms.RsaSha256),
        });
    }

    [Theory]
    [InlineData("https://accounts.google.com")]
    [InlineData("accounts.google.com")]
    public async Task Token_hop_le_tra_ve_danh_tinh_Google(string issuer)
    {
        var verifier = CreateVerifier($"{ClientId}, 999-mobile.apps.googleusercontent.com");
        var token = SignToken(issuer: issuer, name: "  Trần Thị B  ");

        var identity = await verifier.VerifyAsync(token, CancellationToken.None);

        Assert.Equal("google-sub-001", identity.Subject);
        Assert.Equal("User@Example.com", identity.Email);
        Assert.Equal("Trần Thị B", identity.FullName);
    }

    [Fact]
    public async Task Email_chua_xac_minh_bi_tu_choi_401()
    {
        var verifier = CreateVerifier();
        var token = SignToken(emailVerified: false);

        var ex = await Assert.ThrowsAsync<AppException>(() => verifier.VerifyAsync(token, CancellationToken.None));
        Assert.Equal(401, ex.StatusCode);
        Assert.Equal("auth.google_email_unverified", ex.Code);
    }

    [Fact]
    public async Task Sai_client_id_hoac_sai_chu_ky_hoac_het_han_bi_tu_choi_401()
    {
        var verifier = CreateVerifier();

        var wrongAud = SignToken(audience: "other-app.apps.googleusercontent.com");
        var exAud = await Assert.ThrowsAsync<AppException>(() => verifier.VerifyAsync(wrongAud, CancellationToken.None));
        Assert.Equal("auth.invalid_google_token", exAud.Code);

        var expired = SignToken(expiresUtc: DateTime.UtcNow.AddMinutes(-10));
        var exExp = await Assert.ThrowsAsync<AppException>(() => verifier.VerifyAsync(expired, CancellationToken.None));
        Assert.Equal("auth.invalid_google_token", exExp.Code);

        using var otherRsa = RSA.Create(2048);
        var forged = SignToken(signingKey: new RsaSecurityKey(otherRsa) { KeyId = "forged" });
        var exSig = await Assert.ThrowsAsync<AppException>(() => verifier.VerifyAsync(forged, CancellationToken.None));
        Assert.Equal("auth.invalid_google_token", exSig.Code);
    }

    private sealed class StaticOidcConfig(OpenIdConnectConfiguration config) : IConfigurationManager<OpenIdConnectConfiguration>
    {
        public Task<OpenIdConnectConfiguration> GetConfigurationAsync(CancellationToken cancel) => Task.FromResult(config);
        public void RequestRefresh() { }
    }
}
