using System.Data;
using System.Security.Cryptography;
using CrabShare.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Infrastructure.Security;

/// <summary>Complete legacy encryption before accepting requests. Fail closed if keys/schema are unavailable.</summary>
public sealed class PayoutProtectionUpgrade(IServiceScopeFactory scopes) : IHostedService
{
    private sealed class LegacyRow
    {
        public long Id { get; set; }
        public string BankCode { get; set; } = "";
        public string Stored { get; set; } = "";
    }
    public async Task StartAsync(CancellationToken ct)
    {
        await using var scope = scopes.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        await db.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
        {
            db.ChangeTracker.Clear();
            await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
            while (true)
            {
                var rows = await db.Database.SqlQueryRaw<LegacyRow>("SELECT TOP (200) user_record_id AS Id, bank_code AS BankCode, account_no AS Stored FROM dbo.user_record WITH (UPDLOCK,HOLDLOCK) WHERE record_type = 'PayoutAccount' AND account_no_digest IS NULL ORDER BY user_record_id").ToListAsync(ct);
                if (rows.Count == 0) break;
                foreach (var row in rows)
                {
                    var number = row.Stored.StartsWith(PayoutAccountProtection.Prefix, StringComparison.Ordinal)
                        ? db.PayoutProtection.Unprotect(row.Stored) : row.Stored;
                    if (number.Length is < 4 or > 30 || number.Any(c => c is < '0' or > '9'))
                        throw new InvalidOperationException("Invalid legacy payout number; resolve before deployment.");
                    var encrypted = db.PayoutProtection.Protect(number);
                    var digest = db.PayoutProtection.Digest(row.BankCode, number);
                    await db.Database.ExecuteSqlInterpolatedAsync($"UPDATE dbo.user_record SET account_no={encrypted}, account_no_digest={digest} WHERE record_type = 'PayoutAccount' AND user_record_id={row.Id}", ct);
                }
            }
            long cursor = 0;
            while (true)
            {
                var protectedRows = await db.PayoutAccounts.AsNoTracking().Where(a => a.UserRecordId > cursor)
                    .OrderBy(a => a.UserRecordId).Take(200).ToListAsync(ct);
                if (protectedRows.Count == 0) break;
                foreach (var row in protectedRows)
                    if (row.AccountNoDigest != db.PayoutProtection.Digest(row.BankCode, row.AccountNo))
                        throw new CryptographicException("Payout lookup key or protected data is inconsistent. Restore the private key-ring backup.");
                cursor = protectedRows[^1].UserRecordId;
            }
            await transaction.CommitAsync(ct);
        });
    }
    public Task StopAsync(CancellationToken ct) => Task.CompletedTask;
}
