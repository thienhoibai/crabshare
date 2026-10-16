using CrabShare.Api.Infrastructure.Persistence.Entities;
using CrabShare.Api.Infrastructure.Security;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace CrabShare.Api.Infrastructure.Persistence;

public partial class AppDbContext
{
    private readonly PayoutAccountProtection? _payoutProtection;
    public PayoutAccountProtection PayoutProtection => _payoutProtection ?? PayoutAccountProtection.Default.Value;
    public AppDbContext(DbContextOptions<AppDbContext> options, PayoutAccountProtection protection) : this(options)
        => _payoutProtection = protection;

    protected override void OnConfiguring(DbContextOptionsBuilder optionsBuilder)
        => optionsBuilder.ReplaceService<IModelCacheKeyFactory, ProtectedModelCacheKeyFactory>();

    private void ConfigurePayoutProtection(ModelBuilder modelBuilder)
    {
        var entity = modelBuilder.Entity<PayoutAccount>();
        var oldIndex = entity.Metadata.GetIndexes().SingleOrDefault(i => i.GetDatabaseName() == "ux_payout_bank_account");
        if (oldIndex is not null) entity.Metadata.RemoveIndex(oldIndex);
        var protection = PayoutProtection;
        entity.Property(a => a.AccountNo).HasMaxLength(2048).HasConversion(new ValueConverter<string, string>(
            number => protection.Protect(number), stored => protection.Unprotect(stored)));
        entity.Property(a => a.AccountNoDigest).HasMaxLength(64).IsUnicode(false).HasColumnName("account_no_digest");
        entity.HasIndex(a => a.AccountNoDigest).HasDatabaseName("ux_payout_account_digest")
            .IsUnique().HasFilter("[account_no_digest] IS NOT NULL");
    }

    private void ProtectPayoutChanges()
    {
        foreach (var entry in ChangeTracker.Entries<PayoutAccount>().Where(e => e.State == EntityState.Added
            || e.Property(a => a.AccountNo).IsModified || e.Property(a => a.BankCode).IsModified))
            entry.Entity.AccountNoDigest = PayoutProtection.Digest(entry.Entity.BankCode, entry.Entity.AccountNo);
    }

    public override int SaveChanges(bool acceptAllChangesOnSuccess)
    {
        ProtectPayoutChanges();
        return base.SaveChanges(acceptAllChangesOnSuccess);
    }
    public override Task<int> SaveChangesAsync(bool acceptAllChangesOnSuccess, CancellationToken cancellationToken = default)
    {
        ProtectPayoutChanges();
        return base.SaveChangesAsync(acceptAllChangesOnSuccess, cancellationToken);
    }
}

public sealed class ProtectedModelCacheKeyFactory : IModelCacheKeyFactory
{
    public object Create(DbContext context, bool designTime) => context is AppDbContext db
        ? (context.GetType(), db.PayoutProtection.KeyRingPath, designTime) : (object)(context.GetType(), designTime);
}
