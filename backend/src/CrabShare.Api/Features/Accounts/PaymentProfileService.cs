using System.Data;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Infrastructure.Ekyc;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Accounts;

public sealed class PaymentProfileService(AppDbContext db, ICurrentUser me, IBankNameMatcher matcher, TimeProvider clock)
{
    private sealed record Owner(string Type, long Id, string Name);

    public async Task<PayoutProfileResponse> GetPayoutAsync(string? ownerType, CancellationToken ct)
    {
        var owner = await RequireOwnerAsync(ownerType, false, ct);
        var account = await OwnedAccounts(owner).AsNoTracking().Where(a => a.Status != "Closed")
            .OrderByDescending(a => a.UpdatedAt).ThenByDescending(a => a.PayoutAccountId).FirstOrDefaultAsync(ct);
        return Profile(owner, account);
    }

    public async Task<PayoutProfileResponse> SavePayoutAsync(string? ownerType, PayoutAccountRequest req, CancellationToken ct)
    {
        var owner = await RequireOwnerAsync(ownerType, false, ct);
        var result = await matcher.MatchAsync(owner.Name, req.AccountHolderName.Trim(), ct);
        return await TransactionAsync(async () =>
        {
            if (await RequireOwnerAsync(owner.Type, true, ct) != owner)
                throw new ConflictException("payout.owner_changed", "Thông tin chủ sở hữu đã thay đổi. Vui lòng tải lại và thử lại.");
            var bankCode = req.BankCode.ToUpperInvariant();
            var accounts = await OwnedAccounts(owner).ToListAsync(ct);
            if (accounts.Any(a => a.Status == "Locked" && a.NameMatchStatus == "Matched"))
                throw new ForbiddenException("payout.locked", "Tài khoản nhận tiền đã bị khoá. Vui lòng liên hệ quản trị.");
            var existing = await db.PayoutAccounts.SingleOrDefaultAsync(a => a.BankCode == bankCode && a.AccountNo == req.AccountNo, ct);
            if (existing is not null && !accounts.Contains(existing))
                throw new ConflictException("payout.account_taken", "Tài khoản ngân hàng này đã được đăng ký cho chủ sở hữu khác.");
            if (existing is not null && existing.AccountHolderName != req.AccountHolderName.Trim()
                && await db.PaymentInstructions.AnyAsync(p => p.PayoutAccountId == existing.PayoutAccountId, ct))
                throw new ConflictException("payout.holder_immutable", "Tài khoản đã có lệnh chi, không thể thay đổi tên người nhận.");
            var now = Now();
            // Giữ số tài khoản trong lịch sử lệnh chi. Đóng bản cũ trước khi kích hoạt bản mới.
            foreach (var old in accounts.Where(a => a != existing && a.Status != "Closed"))
            {
                old.Status = "Closed";
                old.UpdatedAt = now;
            }
            await db.SaveChangesAsync(ct);
            var account = existing ?? new PayoutAccount
            {
                OwnerUserId = owner.Type == "Investor" ? owner.Id : null,
                OwnerOperatorId = owner.Type == "Operator" ? owner.Id : null,
                BankCode = bankCode, AccountNo = req.AccountNo, CreatedAt = now,
            };
            if (existing is null) db.PayoutAccounts.Add(account);
            account.AccountHolderName = req.AccountHolderName.Trim();
            account.NameMatchStatus = result.Matched ? "Matched" : "Mismatched";
            account.Status = result.Matched ? "Active" : "Locked";
            account.UpdatedAt = now;
            db.KycChecks.Add(new KycCheck
            {
                UserId = me.UserId, CheckType = "BankNameMatch", ProviderRef = result.ProviderReference,
                Result = result.Matched ? "Passed" : "Failed",
                FailureReason = result.Matched ? null : "Tên chủ tài khoản không khớp tên chủ sở hữu đã đăng ký.",
                CheckedAt = now, CreatedAt = now,
            });
            await db.SaveChangesAsync(ct);
            await AccountAuditWriter.AppendAsync(db, me.UserId, "PayoutAccount", account.PayoutAccountId, "MaintainPayoutAccount",
                null, System.Text.Json.JsonSerializer.Serialize(new { account.PayoutAccountId, OwnerType = owner.Type, account.NameMatchStatus, account.Status }), now, ct);
            await db.SaveChangesAsync(ct);
            return Profile(owner, account);
        }, ct);
    }

    public async Task<IReadOnlyList<AddressResponse>> ListAddressesAsync(CancellationToken ct)
    {
        var id = await RequireCustomerAsync(false, ct);
        return await db.CustomerAddresses.AsNoTracking().Where(a => a.CustomerId == id)
            .OrderByDescending(a => a.IsDefault).ThenByDescending(a => a.AddressId)
            .Select(a => new AddressResponse(a.AddressId, a.RecipientName, a.RecipientPhone, a.AddressLine, a.Province, a.IsDefault, a.CreatedAt)).ToListAsync(ct);
    }

    public async Task<AddressResponse> GetAddressAsync(long addressId, CancellationToken ct)
    {
        var id = await RequireCustomerAsync(false, ct);
        var address = await db.CustomerAddresses.AsNoTracking().SingleOrDefaultAsync(a => a.CustomerId == id && a.AddressId == addressId, ct)
            ?? throw MissingAddress();
        return Address(address);
    }

    public Task<AddressResponse> SaveAddressAsync(long? addressId, AddressRequest req, CancellationToken ct)
        => TransactionAsync(async () =>
        {
            var id = await RequireCustomerAsync(true, ct);
            var addresses = await db.CustomerAddresses.Where(a => a.CustomerId == id).ToListAsync(ct);
            var address = addressId is null ? new CustomerAddress { CustomerId = id, CreatedAt = Now() }
                : addresses.SingleOrDefault(a => a.AddressId == addressId) ?? throw MissingAddress();
            var makeDefault = req.IsDefault || addresses.Count == 0 || address.IsDefault;
            if (makeDefault)
            {
                foreach (var old in addresses.Where(a => a != address && a.IsDefault)) old.IsDefault = false;
                await db.SaveChangesAsync(ct);
            }
            address.RecipientName = req.RecipientName.Trim();
            address.RecipientPhone = req.RecipientPhone;
            address.AddressLine = req.AddressLine.Trim();
            address.Province = req.Province.Trim();
            address.IsDefault = makeDefault;
            if (addressId is null) db.CustomerAddresses.Add(address);
            await db.SaveChangesAsync(ct);
            return Address(address);
        }, ct);

    public Task DeleteAddressAsync(long addressId, CancellationToken ct)
        => TransactionAsync(async () =>
        {
            var id = await RequireCustomerAsync(true, ct);
            var addresses = await db.CustomerAddresses.Where(a => a.CustomerId == id).ToListAsync(ct);
            var address = addresses.SingleOrDefault(a => a.AddressId == addressId) ?? throw MissingAddress();
            db.CustomerAddresses.Remove(address);
            await db.SaveChangesAsync(ct);
            if (address.IsDefault && addresses.Where(a => a != address).OrderBy(a => a.AddressId).FirstOrDefault() is { } next)
            {
                next.IsDefault = true;
                await db.SaveChangesAsync(ct);
            }
            return true;
        }, ct);

    private async Task<Owner> RequireOwnerAsync(string? type, bool forWrite, CancellationToken ct)
    {
        type ??= me.IsInRole(Roles.Investor) ? "Investor" : "Operator";
        if (type is not ("Investor" or "Operator"))
            throw new AppException(400, "payout.owner_type", "Loại chủ sở hữu phải là Investor hoặc Operator.");
        await RequireActiveUserAsync(ct);
        if (type == "Investor")
        {
            if (!me.IsInRole(Roles.Investor) || !await db.Investors.AnyAsync(i => i.UserId == me.UserId, ct)) throw Denied();
            var query = forWrite ? db.AppUsers.FromSqlInterpolated($"SELECT * FROM dbo.app_user WITH (UPDLOCK, HOLDLOCK) WHERE user_id = {me.UserId}") : db.AppUsers.AsQueryable();
            var user = await query.AsNoTracking().SingleAsync(u => u.UserId == me.UserId, ct);
            return new Owner(type, user.UserId, user.FullName);
        }
        if (!me.IsInRole(Roles.OperatorMember)) throw Denied();
        var member = await db.OperatorMembers.AsNoTracking().SingleOrDefaultAsync(m => m.UserId == me.UserId && m.MemberRole == "Owner", ct)
            ?? throw new ForbiddenException("payout.owner_required", "Chỉ chủ hộ nuôi được quản lý tài khoản nhận tiền của hộ nuôi.");
        if (me.OperatorId is { } claimed && claimed != member.OperatorId) throw Denied();
        var operators = forWrite ? db.Operators.FromSqlInterpolated($"SELECT * FROM dbo.operator WITH (UPDLOCK, HOLDLOCK) WHERE operator_id = {member.OperatorId}") : db.Operators.AsQueryable();
        var op = await operators.AsNoTracking().SingleAsync(o => o.OperatorId == member.OperatorId, ct);
        return new Owner(type, op.OperatorId, op.LegalName);
    }

    private async Task<long> RequireCustomerAsync(bool forWrite, CancellationToken ct)
    {
        if (!me.IsInRole(Roles.Customer)) throw Denied();
        await RequireActiveUserAsync(ct);
        var customers = forWrite ? db.Customers.FromSqlInterpolated($"SELECT * FROM dbo.customer WITH (UPDLOCK, HOLDLOCK) WHERE user_id = {me.UserId}") : db.Customers.AsQueryable();
        if (!await customers.AnyAsync(c => c.UserId == me.UserId, ct)) throw Denied();
        return me.UserId;
    }

    private async Task RequireActiveUserAsync(CancellationToken ct)
    {
        if (!await db.AppUsers.AnyAsync(u => u.UserId == me.UserId && u.Status == "Active", ct)) throw Denied();
    }

    private IQueryable<PayoutAccount> OwnedAccounts(Owner owner) => owner.Type == "Investor"
        ? db.PayoutAccounts.Where(a => a.OwnerUserId == owner.Id) : db.PayoutAccounts.Where(a => a.OwnerOperatorId == owner.Id);

    private Task<T> TransactionAsync<T>(Func<Task<T>> action, CancellationToken ct)
        => db.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
        {
            db.ChangeTracker.Clear();
            await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
            var value = await action();
            await transaction.CommitAsync(ct);
            return value;
        });

    private DateTimeOffset Now() => DateTimeOffset.FromUnixTimeMilliseconds(clock.GetUtcNow().ToUnixTimeMilliseconds());
    private static ForbiddenException Denied() => new("accounts.access_denied", "Tài khoản không có quyền thao tác.");
    private static NotFoundException MissingAddress() => new("addresses.not_found", "Không tìm thấy địa chỉ của bạn.");
    private static AddressResponse Address(CustomerAddress a) => new(a.AddressId, a.RecipientName, a.RecipientPhone, a.AddressLine, a.Province, a.IsDefault, a.CreatedAt);
    private static PayoutProfileResponse Profile(Owner owner, PayoutAccount? a) => new(owner.Type, owner.Name,
        a is null ? null : new(a.PayoutAccountId, a.BankCode, a.AccountNo, a.AccountHolderName, a.NameMatchStatus, a.Status, a.UpdatedAt));
}
