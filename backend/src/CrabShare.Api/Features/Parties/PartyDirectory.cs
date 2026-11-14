using CrabShare.Api.Common.Errors;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Parties;

/// <summary>Loại vai trò đối tác (BR-001) và vai trò trong một Lô (BR-002).</summary>
public static class PartnerRoleTypes
{
    public const string Farmer = "Farmer";
    public const string Investor = "Investor";
    public const string Customer = "Customer";
    public const string Supplier = "Supplier";
    public const string OfftakeBuyer = "OfftakeBuyer";
    public static readonly string[] All = [Farmer, Investor, Customer, Supplier, OfftakeBuyer];
}

public static class ParticipantRoles
{
    public const string Executor = "Executor";
    public const string Investor = "Investor";
    public const string Customer = "Customer";
    public const string Supplier = "Supplier";
    public const string OfftakeBuyer = "OfftakeBuyer";
}

/// <summary>
/// Tra cứu và tạo đối tác dùng chung cho mọi tính năng. Tài khoản và hộ nuôi tạo trước V018 có thể chưa có đối tác;
/// các hàm Ensure... tạo khi cần, nên code cũ và dữ liệu cũ vẫn chạy.
/// Hàm chỉ thêm vào change tracker; người gọi tự SaveChanges trong transaction của mình.
/// </summary>
public sealed class PartyDirectory(AppDbContext db, TimeProvider clock)
{
    public async Task<long> PlatformPartyIdAsync(CancellationToken ct)
        => await db.Parties.Where(p => p.IsPlatform).Select(p => (long?)p.PartyId).SingleOrDefaultAsync(ct)
           ?? throw new BusinessRuleException("party.platform_missing", "Thiếu đối tác CrabShare (V018).");

    /// <summary>Đối tác của một tài khoản (BR-003); tạo đối tác cá nhân nếu tài khoản cũ chưa có.</summary>
    public async Task<Party> EnsureForUserAsync(long userId, CancellationToken ct)
    {
        var user = await db.AppUsers.Include(u => u.Investor).Include(u => u.Customer)
                       .SingleOrDefaultAsync(u => u.UserId == userId, ct)
                   ?? throw new NotFoundException("party.user_not_found", "Không tìm thấy tài khoản.");
        if (user.PartyId is { } existing)
            return await db.Parties.Include(p => p.Roles).SingleAsync(p => p.PartyId == existing, ct);

        var now = clock.GetUtcNow();
        var organization = user.Investor?.InvestorKind == "Organization";
        var party = new Party
        {
            LegalName = organization ? user.Investor!.OrganizationName ?? user.FullName : user.FullName,
            PartyType = organization ? "Company" : "Individual",
            RegistrationNo = organization ? user.Investor!.TaxCode : null,
            Representative = organization ? user.FullName : null,
            Phone = user.Phone,
            VerificationStatus = user.Investor?.VerificationStatus == "Verified" ? "Verified" : "Unverified",
            VerifiedAt = user.Investor?.VerificationStatus == "Verified" ? now : null,
            RegisteredAt = now, CreatedAt = now, UpdatedAt = now,
        };
        if (user.Investor is not null) party.Roles.Add(NewRole(PartnerRoleTypes.Investor, "Active", now));
        if (user.Customer is not null) party.Roles.Add(NewRole(PartnerRoleTypes.Customer, "Active", now));
        db.Parties.Add(party);
        await db.SaveChangesAsync(ct);
        user.PartyId = party.PartyId;
        await db.SaveChangesAsync(ct);
        return party;
    }

    public async Task<long> PartyIdOfUserAsync(long userId, CancellationToken ct)
    {
        var id = await db.AppUsers.Where(u => u.UserId == userId).Select(u => u.PartyId).SingleOrDefaultAsync(ct);
        return id ?? (await EnsureForUserAsync(userId, ct)).PartyId;
    }

    /// <summary>Đối tác của hộ nuôi; hộ nuôi cũ chưa có thì dùng đối tác của chủ hộ.</summary>
    public async Task<long> PartyIdOfOperatorAsync(long operatorId, CancellationToken ct)
    {
        var farm = await db.Operators.SingleOrDefaultAsync(o => o.OperatorId == operatorId, ct)
                   ?? throw new NotFoundException("operator.not_found", "Không tìm thấy hộ nuôi.");
        if (farm.PartyId is { } id) return id;
        var ownerId = await db.OperatorMembers.Where(m => m.OperatorId == operatorId && m.MemberRole == "Owner")
            .OrderBy(m => m.JoinedAt).Select(m => (long?)m.UserId).FirstOrDefaultAsync(ct);
        long partyId;
        if (ownerId is { } owner)
        {
            partyId = (await EnsureForUserAsync(owner, ct)).PartyId;
        }
        else
        {
            // Hộ nuôi chưa có chủ hộ (dữ liệu cũ hoặc dữ liệu test): đối tác lập từ chính hồ sơ hộ nuôi.
            var now = clock.GetUtcNow();
            var party = new Party
            {
                LegalName = farm.LegalName, PartyType = FarmPartyType(farm.LegalName), RegistrationNo = null,
                VerificationStatus = farm.Status == "Approved" ? "Verified" : "Pending",
                VerifiedAt = farm.Status == "Approved" ? now : null, RegisteredAt = now, CreatedAt = now, UpdatedAt = now,
            };
            party.Roles.Add(NewRole(PartnerRoleTypes.Farmer, farm.Status == "Approved" ? "Active" : "Pending", now));
            db.Parties.Add(party);
            await db.SaveChangesAsync(ct);
            partyId = party.PartyId;
        }
        farm.PartyId = partyId;
        await db.SaveChangesAsync(ct);
        return partyId;
    }

    public static string FarmPartyType(string legalName)
        => legalName.StartsWith("HTX", StringComparison.OrdinalIgnoreCase) ||
           legalName.StartsWith("Hợp tác xã", StringComparison.OrdinalIgnoreCase) ? "Cooperative"
         : legalName.StartsWith("Công ty", StringComparison.OrdinalIgnoreCase) ? "Company" : "Household";

    /// <summary>Đồng bộ đối tác và vai trò người nuôi theo quyết định duyệt hồ sơ hộ nuôi (BR-005, BR-006).</summary>
    public async Task SyncFarmDecisionAsync(Operator farm, string action, string? reason, CancellationToken ct)
    {
        var partyId = await PartyIdOfOperatorAsync(farm.OperatorId, ct);
        var party = await db.Parties.SingleAsync(p => p.PartyId == partyId, ct);
        var now = clock.GetUtcNow();
        switch (action)
        {
            case "approve":
                party.LegalName = farm.LegalName;
                party.PartyType = FarmPartyType(farm.LegalName);
                if (!await db.Parties.AnyAsync(p => p.RegistrationNo == farm.TaxCode && p.PartyId != partyId, ct))
                    party.RegistrationNo = farm.TaxCode;
                party.VerificationStatus = "Verified";
                party.RejectReason = null;
                party.VerifiedAt = now;
                await SetRoleAsync(partyId, PartnerRoleTypes.Farmer, "Active", ct);
                if (!await db.PartySites.AnyAsync(s => s.PartyId == partyId && s.SiteType == "Farm" && s.Status == "Active", ct))
                    db.PartySites.Add(new PartySite
                    {
                        PartyId = partyId, SiteCode = "TRAI-01", SiteType = "Farm", Name = farm.LegalName, AddressLine = farm.FarmAddress,
                        IsDefault = true, Status = "Active", CreatedAt = now, UpdatedAt = now,
                    });
                break;
            case "reject":
                party.VerificationStatus = "Rejected";
                party.RejectReason = reason?.Trim() ?? "Hồ sơ người nuôi bị từ chối.";
                await SetRoleAsync(partyId, PartnerRoleTypes.Farmer, "Pending", ct, party.RejectReason);
                break;
            case "suspend":
                await SetRoleAsync(partyId, PartnerRoleTypes.Farmer, "Suspended", ct, reason?.Trim());
                break;
            case "reinstate":
                await SetRoleAsync(partyId, PartnerRoleTypes.Farmer, "Active", ct, reason?.Trim());
                break;
        }
        party.UpdatedAt = now;
        await db.SaveChangesAsync(ct);
    }

    public Task<bool> HasActiveRoleAsync(long partyId, string roleType, CancellationToken ct)
        => db.PartnerRoles.AnyAsync(r => r.PartyId == partyId && r.RoleType == roleType && r.Status == "Active" && r.ValidTo == null, ct);

    /// <summary>Thêm hoặc đổi trạng thái vai trò đang mở của đối tác.</summary>
    public async Task SetRoleAsync(long partyId, string roleType, string status, CancellationToken ct, string? note = null)
    {
        var now = clock.GetUtcNow();
        var role = await db.PartnerRoles.SingleOrDefaultAsync(r => r.PartyId == partyId && r.RoleType == roleType && r.ValidTo == null, ct);
        if (role is null)
        {
            role = NewRole(roleType, status, now);
            role.PartyId = partyId;
            role.Note = note;
            db.PartnerRoles.Add(role);
        }
        else
        {
            role.Status = status;
            role.UpdatedAt = now;
            if (note is not null) role.Note = note;
        }
        await db.SaveChangesAsync(ct);
    }

    /// <summary>Ghi một đối tác vào Lô với vai trò cho trước (BR-002). Gọi lặp không tạo dòng trùng.</summary>
    public async Task AddParticipantAsync(long batchId, long partyId, string role, CancellationToken ct, string? scope = null)
    {
        if (await db.BatchParticipants.AnyAsync(p => p.BatchId == batchId && p.PartyId == partyId && p.ParticipantRole == role, ct))
            return;
        var now = clock.GetUtcNow();
        db.BatchParticipants.Add(new BatchParticipant
        {
            BatchId = batchId, PartyId = partyId, ParticipantRole = role, ResponsibilityScope = scope,
            ApprovalStatus = "Approved", JoinedAt = now, CreatedAt = now,
        });
        await db.SaveChangesAsync(ct);
    }

    /// <summary>Đối tác là chính người nuôi của Lô hoặc nằm trong danh sách bên liên quan của người nuôi (BR-008, BR-094).</summary>
    public async Task<bool> IsExecutorOrRelatedAsync(long batchId, long partyId, CancellationToken ct)
    {
        var executor = await db.Batches.Where(b => b.BatchId == batchId).Select(b => b.ExecutorPartyId).SingleOrDefaultAsync(ct);
        if (executor is null) return false;
        if (executor == partyId) return true;
        return await db.RelatedParties.AnyAsync(r => r.PartyId == executor && r.LinkedPartyId == partyId, ct);
    }

    /// <summary>Đối tác có tham gia Lô với vai trò người nuôi, nhà cung cấp hay nhà đầu tư không (xung đột lợi ích của QC, BR-017).</summary>
    public Task<bool> HasStakeInBatchAsync(long batchId, long partyId, CancellationToken ct)
        => db.BatchParticipants.AnyAsync(p => p.BatchId == batchId && p.PartyId == partyId &&
            (p.ParticipantRole == ParticipantRoles.Executor || p.ParticipantRole == ParticipantRoles.Supplier ||
             p.ParticipantRole == ParticipantRoles.Investor), ct);

    private static PartnerRole NewRole(string roleType, string status, DateTimeOffset now)
        => new() { RoleType = roleType, Status = status, ValidFrom = now, CreatedAt = now, UpdatedAt = now };
}
