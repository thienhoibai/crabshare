using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.DataProtection;

namespace CrabShare.Api.Infrastructure.Security;

/// <summary>Private persisted key ring. Never store this directory in public upload storage.</summary>
public sealed class PayoutAccountProtection
{
    public const string Prefix = "dp:v1:";
    public static string DefaultPath => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "CrabShare", "keys");
    public static readonly Lazy<PayoutAccountProtection> Default = new(() => new(DefaultPath));
    private readonly IDataProtector _protector;
    private readonly byte[] _lookupKey;
    public string KeyRingPath { get; }

    public PayoutAccountProtection(string path)
    {
        KeyRingPath = Path.GetFullPath(path);
        Directory.CreateDirectory(KeyRingPath);
        if (!OperatingSystem.IsWindows()) File.SetUnixFileMode(KeyRingPath, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute);
        var provider = DataProtectionProvider.Create(new DirectoryInfo(KeyRingPath), o => o.SetApplicationName("CrabShare"));
        _protector = provider.CreateProtector("PayoutAccount.AccountNo.v1");
        var lookupProtector = provider.CreateProtector("PayoutAccount.LookupKey.v1");
        var keyPath = Path.Combine(KeyRingPath, "payout-lookup-key.protected");
        if (!File.Exists(keyPath))
        {
            // Atomic rename: concurrent starts either publish a complete key or read the winner.
            var temporary = Path.Combine(KeyRingPath, Guid.NewGuid().ToString("N") + ".tmp");
            try
            {
                File.WriteAllBytes(temporary, lookupProtector.Protect(RandomNumberGenerator.GetBytes(32)));
                if (!OperatingSystem.IsWindows()) File.SetUnixFileMode(temporary, UnixFileMode.UserRead | UnixFileMode.UserWrite);
                try { File.Move(temporary, keyPath, overwrite: false); }
                catch (IOException) when (File.Exists(keyPath)) { }
            }
            finally { if (File.Exists(temporary)) File.Delete(temporary); }
        }
        _lookupKey = lookupProtector.Unprotect(File.ReadAllBytes(keyPath));
        if (_lookupKey.Length != 32) throw new CryptographicException("Invalid payout lookup key.");
    }

    public string Protect(string number) => Prefix + _protector.Protect(number);
    public string Unprotect(string stored) => stored.StartsWith(Prefix, StringComparison.Ordinal)
        ? _protector.Unprotect(stored[Prefix.Length..]) : throw new CryptographicException("Unprotected payout account requires the legacy upgrade.");
    public string Digest(string bankCode, string number) => Convert.ToHexStringLower(
        HMACSHA256.HashData(_lookupKey, Encoding.UTF8.GetBytes(bankCode.Trim().ToUpperInvariant() + "\n" + number)));
}
