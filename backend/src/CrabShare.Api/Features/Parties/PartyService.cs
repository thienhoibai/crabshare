using System.Data;
using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Common.Paging;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Parties;

/// <summary>
/// Đối tác của chính mình, địa điểm, bên liên quan (BR-001, 003, 008, 015); ghi nhận nhà cung cấp và bên cam kết thu mua (BR-016);
/// Admin xác minh đối tác, đổi trạng thái vai trò, quản lý pool kiểm phẩm (BR-017).
/// </summary>
public sealed class PartyService(AppDbContext db, ICurrentUser me, PartyDirectory parties, TimeProvider clock, IAuditLog audit)
{
    // ---------- đối tác của tôi ----------
    public async Task<PartyResponse> GetMineAsync(CancellationToken ct)
    {
        var partyId = await parties.PartyIdOfUserAsync(me.UserId, ct);
        return await GetAsync(partyId, ct);
    }

    public async Task<PartyResponse> UpdateMineAsync(UpdatePartyRequest req, CancellationToken ct)
    {
        var id = await db.InTransactionAsync(async () =>
        {
            var partyId = await parties.PartyIdOfUserAsync(me.UserId, ct);
            var party = await db.Parties.SingleAsync(p => p.PartyId == partyId, ct);
            if (req.PartyType != "Individual" && string.IsNullOrWhiteSpace(req.Representative))
                throw new BusinessRuleException("party.representative_required", "Đối tác tổ chức phải có người đại diện (BR-003).");
            var before = Snapshot(party);
            var legalChanged = party.LegalName != req.LegalName.Trim() || party.RegistrationNo != Clean(req.RegistrationNo) ||
                               party.PartyType != req.PartyType;
            party.LegalName = req.LegalName.Trim();
            party.PartyType = req.PartyType;
            party.RegistrationNo = Clean(req.RegistrationNo);
            party.Representative = Clean(req.Representative);
            party.Phone = Clean(req.Phone);
            party.UpdatedAt = clock.GetUtcNow();
            // Tên pháp lý là căn cứ khớp tài khoản nhận tiền (BR-013): đổi thì phải xác minh lại.
            if (legalChanged && party.VerificationStatus == "Verified")
            {
                party.VerificationStatus = "Pending";
                party.VerifiedAt = null;
            }
            await db.SaveChangesAsync(ct);
            await audit.WriteAsync("party", party.PartyId, "update", before, Snapshot(party), ct);
            return party.PartyId;
        }, ct);
        return await GetAsync(id, ct);
    }

    // ---------- địa điểm ----------
    public async Task<IReadOnlyList<PartySiteResponse>> ListMySitesAsync(string? siteType, CancellationToken ct)
    {
        var partyId = await parties.PartyIdOfUserAsync(me.UserId, ct);
        return await db.PartySites.AsNoTracking()
            .Where(s => s.PartyId == partyId && s.Status == "Active" && (siteType == null || s.SiteType == siteType))
            .OrderByDescending(s => s.IsDefault).ThenBy(s => s.SiteId).Select(s => ToSite(s)).ToListAsync(ct);
    }

    public Task<PartySiteResponse> AddMySiteAsync(SiteRequest req, CancellationToken ct)
        => db.InTransactionAsync(async () =>
        {
            var partyId = await parties.PartyIdOfUserAsync(me.UserId, ct);
            var site = await AddSiteAsync(partyId, req, ct);
            return ToSite(site);
        }, ct, IsolationLevel.Serializable);

    public Task<PartySiteResponse> UpdateMySiteAsync(long siteId, SiteRequest req, CancellationToken ct)
        => db.InTransactionAsync(async () =>
        {
            var partyId = await parties.PartyIdOfUserAsync(me.UserId, ct);
            var site = await db.PartySites.SingleOrDefaultAsync(s => s.SiteId == siteId && s.PartyId == partyId && s.Status == "Active", ct)
                       ?? throw new NotFoundException("party.site_not_found", "Không tìm thấy địa điểm.");
            if (site.SiteType != req.SiteType)
                throw new BusinessRuleException("party.site_type_fixed", "Không đổi loại địa điểm; hãy tạo địa điểm mới.");
            if (req.IsDefault && !site.IsDefault) await ClearDefaultAsync(partyId, site.SiteType, ct);
            site.Name = req.Name.Trim();
            site.AddressLine = req.AddressLine.Trim();
            site.Province = Clean(req.Province);
            site.Latitude = req.Latitude;
            site.Longitude = req.Longitude;
            site.ContactName = Clean(req.ContactName);
            site.ContactPhone = Clean(req.ContactPhone);
            site.IsDefault = req.IsDefault || site.IsDefault;
            site.UpdatedAt = clock.GetUtcNow();
            RequireCoordinates(site);
            return ToSite(site);
        }, ct, IsolationLevel.Serializable);

    public Task RemoveMySiteAsync(long siteId, CancellationToken ct)
        => db.InTransactionAsync(async () =>
        {
            var partyId = await parties.PartyIdOfUserAsync(me.UserId, ct);
            var site = await db.PartySites.SingleOrDefaultAsync(s => s.SiteId == siteId && s.PartyId == partyId && s.Status == "Active", ct)
                       ?? throw new NotFoundException("party.site_not_found", "Không tìm thấy địa điểm.");
            // Đơn và Lô đã dùng địa điểm vẫn giữ tham chiếu, nên chỉ ngừng dùng chứ không xoá.
            site.Status = "Inactive";
            site.IsDefault = false;
            site.UpdatedAt = clock.GetUtcNow();
        }, ct);

    internal async Task<PartySite> AddSiteAsync(long partyId, SiteRequest req, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        var count = await db.PartySites.CountAsync(s => s.PartyId == partyId, ct);
        var code = Clean(req.SiteCode)?.ToUpperInvariant() ?? $"{Prefix(req.SiteType)}-{count + 1:D2}";
        if (await db.PartySites.AnyAsync(s => s.PartyId == partyId && s.SiteCode == code, ct))
            throw new ConflictException("party.site_code_taken", "Mã địa điểm đã dùng.");
        var hasDefault = await db.PartySites.AnyAsync(s => s.PartyId == partyId && s.SiteType == req.SiteType && s.IsDefault && s.Status == "Active", ct);
        if (req.IsDefault && hasDefault) await ClearDefaultAsync(partyId, req.SiteType, ct);
        var site = new PartySite
        {
            PartyId = partyId, SiteCode = code, SiteType = req.SiteType, Name = req.Name.Trim(), AddressLine = req.AddressLine.Trim(),
            Province = Clean(req.Province), Latitude = req.Latitude, Longitude = req.Longitude,
            ContactName = Clean(req.ContactName), ContactPhone = Clean(req.ContactPhone),
            IsDefault = req.IsDefault || !hasDefault, Status = "Active", CreatedAt = now, UpdatedAt = now,
        };
        RequireCoordinates(site);
        db.PartySites.Add(site);
        await db.SaveChangesAsync(ct);
        return site;
    }

    // ---------- bên liên quan (BR-008) ----------
    public async Task<IReadOnlyList<RelatedPartyResponse>> ListRelatedAsync(CancellationToken ct)
    {
        var partyId = await RequireFarmerPartyAsync(ct);
        return await db.RelatedParties.AsNoTracking().Where(r => r.PartyId == partyId).OrderBy(r => r.RelatedPartyId)
            .Select(r => new RelatedPartyResponse(r.RelatedPartyId, r.FullName, r.Relation, r.IdNumberLast4,
                db.Parties.Where(p => p.PartyId == r.LinkedPartyId).Select(p => p.PartyCode).FirstOrDefault()))
            .ToListAsync(ct);
    }

    public Task<RelatedPartyResponse> AddRelatedAsync(RelatedPartyRequest req, CancellationToken ct)
        => db.InTransactionAsync(async () =>
        {
            var partyId = await RequireFarmerPartyAsync(ct);
            var idNumber = req.IdNumber.Trim().ToUpperInvariant();
            var digest = db.PayoutProtection.Digest("RELATED-PARTY", idNumber);
            if (await db.RelatedParties.AnyAsync(r => r.PartyId == partyId && r.IdNumberDigest == digest, ct))
                throw new ConflictException("party.related_exists", "Bên liên quan này đã có trong danh sách.");
            long? linked = null;
            string? linkedCode = Clean(req.LinkedPartyCode)?.ToUpperInvariant();
            if (linkedCode is not null)
                linked = await db.Parties.Where(p => p.PartyCode == linkedCode).Select(p => (long?)p.PartyId).SingleOrDefaultAsync(ct)
                         ?? throw new NotFoundException("party.not_found", "Không tìm thấy mã đối tác của bên liên quan.");
            var row = new RelatedParty
            {
                PartyId = partyId, FullName = req.FullName.Trim(), Relation = req.Relation.Trim(), IdNumberDigest = digest,
                IdNumberLast4 = idNumber[^4..], LinkedPartyId = linked, CreatedAt = clock.GetUtcNow(),
            };
            db.RelatedParties.Add(row);
            await db.SaveChangesAsync(ct);
            await audit.WriteAsync("related_party", row.RelatedPartyId, "create", null,
                new { row.PartyId, row.FullName, row.Relation, row.IdNumberLast4, row.LinkedPartyId }, ct);
            return new RelatedPartyResponse(row.RelatedPartyId, row.FullName, row.Relation, row.IdNumberLast4, linkedCode);
        }, ct);

    public Task RemoveRelatedAsync(long id, CancellationToken ct)
        => db.InTransactionAsync(async () =>
        {
            var partyId = await RequireFarmerPartyAsync(ct);
            var row = await db.RelatedParties.SingleOrDefaultAsync(r => r.RelatedPartyId == id && r.PartyId == partyId, ct)
                      ?? throw new NotFoundException("party.related_not_found", "Không tìm thấy bên liên quan.");
            db.RelatedParties.Remove(row);
            await audit.WriteAsync("related_party", id, "delete", new { row.FullName, row.Relation, row.IdNumberLast4 }, null, ct);
        }, ct);

    // ---------- nhà cung cấp, bên cam kết thu mua (BR-016) ----------
    /// <summary>Người nuôi hoặc Admin ghi nhận đối tác không có tài khoản. Admin tạo thì đã xác minh; người nuôi tạo thì chờ Admin.</summary>
    public async Task<PartyResponse> RecordExternalAsync(ExternalPartyRequest req, CancellationToken ct)
    {
        var id = await db.InTransactionAsync(async () =>
        {
            var isAdmin = me.IsInRole(Roles.PlatformAdmin);
            if (!isAdmin) await RequireFarmerPartyAsync(ct);
            var registration = Clean(req.RegistrationNo);
            if (registration is not null && await db.Parties.AnyAsync(p => p.RegistrationNo == registration, ct))
                throw new ConflictException("party.registration_taken", "Số đăng ký này đã có đối tác. Dùng đối tác sẵn có.");
            var now = clock.GetUtcNow();
            var party = new Party
            {
                LegalName = req.LegalName.Trim(), PartyType = req.PartyType, RegistrationNo = registration,
                Representative = Clean(req.Representative), Phone = req.Phone.Trim(),
                VerificationStatus = isAdmin ? "Verified" : "Pending", VerifiedAt = isAdmin ? now : null, VerifiedBy = isAdmin ? me.UserId : null,
                CreatedBy = me.UserId, RegisteredAt = now, CreatedAt = now, UpdatedAt = now,
            };
            party.Roles.Add(new PartnerRole
            {
                RoleType = req.RoleType, Status = isAdmin ? "Active" : "Pending", ValidFrom = now, CreatedAt = now, UpdatedAt = now,
            });
            db.Parties.Add(party);
            await db.SaveChangesAsync(ct);
            if (req.Site is not null) await AddSiteAsync(party.PartyId, req.Site, ct);
            await audit.WriteAsync("party", party.PartyId, "record_external", null, Snapshot(party), ct);
            return party.PartyId;
        }, ct);
        return await GetAsync(id, ct);
    }

    /// <summary>Đối tác đã xác minh có vai trò đang hoạt động, để người nuôi chọn khi lập đơn mua nguồn hay chỉ định bên thu mua.</summary>
    public async Task<IReadOnlyList<PartySummaryResponse>> DirectoryAsync(string roleType, string? search, CancellationToken ct)
    {
        if (roleType is not (PartnerRoleTypes.Supplier or PartnerRoleTypes.OfftakeBuyer))
            throw new BusinessRuleException("party.directory_role", "Chỉ tra cứu được nhà cung cấp hoặc bên cam kết thu mua.");
        var term = search?.Trim();
        return await db.Parties.AsNoTracking()
            .Where(p => p.VerificationStatus == "Verified" &&
                        p.Roles.Any(r => r.RoleType == roleType && r.Status == "Active" && r.ValidTo == null) &&
                        (term == null || p.LegalName.Contains(term) || p.PartyCode == term))
            .OrderBy(p => p.LegalName).Take(50)
            .Select(p => new PartySummaryResponse(p.PartyId, p.PartyCode, p.LegalName, p.PartyType, p.VerificationStatus,
                p.Roles.Where(r => r.Status == "Active" && r.ValidTo == null).Select(r => r.RoleType).ToList()))
            .ToListAsync(ct);
    }

    // ---------- Admin ----------
    public Task<PagedResult<PartySummaryResponse>> ListAsync(PartyListQuery filter, PageQuery paging, CancellationToken ct)
    {
        var term = filter.Search?.Trim();
        return db.Parties.AsNoTracking()
            .Where(p => (term == null || p.LegalName.Contains(term) || p.PartyCode == term || p.RegistrationNo == term) &&
                        (filter.VerificationStatus == null || p.VerificationStatus == filter.VerificationStatus) &&
                        (filter.RoleType == null || p.Roles.Any(r => r.RoleType == filter.RoleType && r.ValidTo == null)))
            .OrderByDescending(p => p.PartyId)
            .Select(p => new PartySummaryResponse(p.PartyId, p.PartyCode, p.LegalName, p.PartyType, p.VerificationStatus,
                p.Roles.Where(r => r.Status == "Active" && r.ValidTo == null).Select(r => r.RoleType).ToList()))
            .ToPagedAsync(paging, ct);
    }

    public async Task<PartyResponse> GetAsync(long partyId, CancellationToken ct)
    {
        var party = await db.Parties.AsNoTracking().Include(p => p.Roles).Include(p => p.Sites)
                        .SingleOrDefaultAsync(p => p.PartyId == partyId, ct)
                    ?? throw new NotFoundException("party.not_found", "Không tìm thấy đối tác.");
        return new PartyResponse(party.PartyId, party.PartyCode, party.LegalName, party.PartyType, party.RegistrationNo,
            party.Representative, party.Phone, party.VerificationStatus, party.RejectReason, party.IsPlatform,
            party.Roles.OrderBy(r => r.RoleType).ThenByDescending(r => r.ValidFrom)
                .Select(r => new PartnerRoleResponse(r.RoleType, r.Status, r.ValidFrom, r.ValidTo, r.Note)).ToList(),
            party.Sites.Where(s => s.Status == "Active").OrderBy(s => s.SiteType).ThenByDescending(s => s.IsDefault).Select(ToSite).ToList());
    }

    public async Task<PartyResponse> DecideAsync(long partyId, bool verify, PartyDecisionRequest req, CancellationToken ct)
    {
        var id = await db.InTransactionAsync(async () =>
        {
            await audit.LockAsync(ct);
            var party = await db.Parties.SingleOrDefaultAsync(p => p.PartyId == partyId, ct)
                        ?? throw new NotFoundException("party.not_found", "Không tìm thấy đối tác.");
            if (party.IsPlatform) throw new BusinessRuleException("party.platform_fixed", "Không đổi trạng thái đối tác CrabShare.");
            if (!verify && string.IsNullOrWhiteSpace(req.Reason))
                throw new BusinessRuleException("party.reason_required", "Từ chối phải có lý do.");
            var before = Snapshot(party);
            var now = clock.GetUtcNow();
            party.VerificationStatus = verify ? "Verified" : "Rejected";
            party.RejectReason = verify ? null : req.Reason!.Trim();
            party.VerifiedAt = verify ? now : null;
            party.VerifiedBy = me.UserId;
            party.UpdatedAt = now;
            // Vai trò nhà cung cấp/bên thu mua do người nuôi khai thì có hiệu lực khi đối tác được xác minh.
            var pending = await db.PartnerRoles.Where(r => r.PartyId == partyId && r.ValidTo == null && r.Status == "Pending" &&
                (r.RoleType == PartnerRoleTypes.Supplier || r.RoleType == PartnerRoleTypes.OfftakeBuyer)).ToListAsync(ct);
            foreach (var role in pending)
            {
                role.Status = verify ? "Active" : "Revoked";
                role.UpdatedAt = now;
            }
            await db.SaveChangesAsync(ct);
            await audit.WriteAsync("party", party.PartyId, verify ? "verify" : "reject", before, Snapshot(party), ct);
            return party.PartyId;
        }, ct);
        return await GetAsync(id, ct);
    }

    public async Task<PartyResponse> ChangeRoleAsync(long partyId, RoleChangeRequest req, CancellationToken ct)
    {
        var id = await db.InTransactionAsync(async () =>
        {
            await audit.LockAsync(ct);
            var party = await db.Parties.SingleOrDefaultAsync(p => p.PartyId == partyId, ct)
                        ?? throw new NotFoundException("party.not_found", "Không tìm thấy đối tác.");
            if (req.Status == "Active" && party.VerificationStatus != "Verified")
                throw new BusinessRuleException("party.not_verified", "Đối tác phải được xác minh trước khi vai trò có hiệu lực.");
            var before = await db.PartnerRoles.Where(r => r.PartyId == partyId && r.RoleType == req.RoleType && r.ValidTo == null)
                .Select(r => new { r.RoleType, r.Status }).SingleOrDefaultAsync(ct);
            await parties.SetRoleAsync(partyId, req.RoleType, req.Status, ct, req.Note);
            await audit.WriteAsync("partner_role", partyId, "change", before, new { req.RoleType, req.Status, req.Note }, ct);
            return partyId;
        }, ct);
        return await GetAsync(id, ct);
    }

    // ---------- pool kiểm phẩm (BR-017) ----------
    public async Task<IReadOnlyList<QcInspectorResponse>> ListQcAsync(CancellationToken ct)
    {
        var rows = await db.AppUserRoles.AsNoTracking().Where(r => r.RoleCode == Roles.QcInspector)
            .Select(r => new { r.UserId, r.User.FullName, r.User.Email, r.GrantedAt, r.User.PartyId }).ToListAsync(ct);
        var stats = await QcStats.LoadAsync(db, rows.Select(r => r.UserId).ToList(), ct);
        var codes = await db.Parties.Where(p => rows.Select(r => r.PartyId).Contains(p.PartyId))
            .ToDictionaryAsync(p => p.PartyId, p => p.PartyCode, ct);
        return rows.OrderBy(r => r.FullName).Select(r =>
        {
            var s = stats.GetValueOrDefault(r.UserId);
            return new QcInspectorResponse(r.UserId, r.FullName, r.Email,
                r.PartyId is { } pid ? codes.GetValueOrDefault(pid) : null, r.GrantedAt, s.Approved, s.AcceptedClaims);
        }).ToList();
    }

    public Task GrantQcAsync(long userId, CancellationToken ct)
        => db.InTransactionAsync(async () =>
        {
            await audit.LockAsync(ct);
            var user = await db.AppUsers.SingleOrDefaultAsync(u => u.UserId == userId, ct)
                       ?? throw new NotFoundException("party.user_not_found", "Không tìm thấy tài khoản.");
            if (user.Status != "Active")
                throw new BusinessRuleException("qc.user_inactive", "Chỉ bật quyền kiểm phẩm cho tài khoản đang hoạt động.");
            if (await db.AppUserRoles.AnyAsync(r => r.UserId == userId && r.RoleCode == Roles.QcInspector, ct))
                throw new ConflictException("qc.already_granted", "Tài khoản đã có quyền kiểm phẩm.");
            if (await db.OperatorMembers.AnyAsync(m => m.UserId == userId, ct))
                throw new BusinessRuleException("qc.operator_conflict", "Người nuôi không được làm Nhân viên kiểm phẩm.");
            await parties.EnsureForUserAsync(userId, ct);
            var now = clock.GetUtcNow();
            db.AppUserRoles.Add(new AppUserRole { UserId = userId, RoleCode = Roles.QcInspector, GrantedAt = now, CreatedAt = now });
            await db.SaveChangesAsync(ct);
            await audit.WriteAsync("app_user_role", userId, "grant_qc", null, new { role = Roles.QcInspector }, ct);
        }, ct);

    public Task RevokeQcAsync(long userId, CancellationToken ct)
        => db.InTransactionAsync(async () =>
        {
            await audit.LockAsync(ct);
            var role = await db.AppUserRoles.SingleOrDefaultAsync(r => r.UserId == userId && r.RoleCode == Roles.QcInspector, ct)
                       ?? throw new NotFoundException("qc.not_found", "Tài khoản không có quyền kiểm phẩm.");
            db.AppUserRoles.Remove(role);
            await audit.WriteAsync("app_user_role", userId, "revoke_qc", new { role = Roles.QcInspector }, null, ct);
        }, ct);

    // ---------- tiện ích ----------
    private async Task<long> RequireFarmerPartyAsync(CancellationToken ct)
    {
        var operatorId = await db.OperatorMembers.Where(m => m.UserId == me.UserId && m.MemberRole == "Owner")
            .Select(m => (long?)m.OperatorId).SingleOrDefaultAsync(ct)
            ?? throw new ForbiddenException("party.farmer_required", "Chỉ chủ hộ nuôi được thao tác này.");
        return await parties.PartyIdOfOperatorAsync(operatorId, ct);
    }

    private async Task ClearDefaultAsync(long partyId, string siteType, CancellationToken ct)
    {
        await db.PartySites.Where(s => s.PartyId == partyId && s.SiteType == siteType && s.IsDefault)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.IsDefault, false), ct);
    }

    private static void RequireCoordinates(PartySite site)
    {
        if ((site.Latitude is null) != (site.Longitude is null))
            throw new BusinessRuleException("party.coordinates_pair", "Vĩ độ và kinh độ phải nhập cùng nhau.");
        if (site.SiteType == "Farm" && site.Latitude is null)
            throw new BusinessRuleException("party.farm_coordinates", "Trại phải có vĩ độ và kinh độ để tính khoảng cách giao (BR-021).");
    }

    private static string Prefix(string siteType) => siteType switch
    {
        "Farm" => "TRAI", "QcStation" => "TKP", "Warehouse" => "KHO", _ => "DC",
    };

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static object Snapshot(Party p) => new
    {
        p.LegalName, p.PartyType, p.RegistrationNo, p.Representative, p.Phone, p.VerificationStatus, p.RejectReason,
    };

    private static PartySiteResponse ToSite(PartySite s) => new(s.SiteId, s.SiteCode, s.SiteType, s.Name, s.AddressLine, s.Province,
        s.Latitude, s.Longitude, s.ContactName, s.ContactPhone, s.IsDefault, s.Status);
}

/// <summary>Thống kê uy tín của Nhân viên kiểm phẩm (BR-017): số con đã duyệt hạng và số khiếu nại được chấp nhận.</summary>
/// <summary>BR-017: thống kê theo từng Nhân viên kiểm phẩm số con đã duyệt hạng và số khiếu nại được chấp nhận trên cua mình duyệt.</summary>
public static class QcStats
{
    public static async Task<Dictionary<long, (int Approved, int AcceptedClaims)>> LoadAsync(AppDbContext db, IReadOnlyList<long> userIds, CancellationToken ct)
    {
        var approved = await db.GradeDecisions.AsNoTracking()
            .Where(d => d.Status == "Approved" && d.DecidedBy != null && userIds.Contains(d.DecidedBy.Value))
            .GroupBy(d => d.DecidedBy!.Value).Select(g => new { g.Key, Count = g.Select(x => x.CrabUnitId).Distinct().Count() })
            .ToDictionaryAsync(x => x.Key, x => x.Count, ct);
        // Khiếu nại được chấp nhận trên dòng giao có cua do người này duyệt hạng (đếm mỗi khiếu nại một lần cho mỗi người).
        var claims = await (from c in db.CustomerClaims
                            join s in db.Shipments on c.ShipmentId equals s.ShipmentId
                            join a in db.InventoryAllocations on new { c.OrderId, LineId = (long?)c.LineId, TrancheId = (long?)s.TrancheId }
                                equals new { a.OrderId, a.LineId, a.TrancheId }
                            join d in db.GradeDecisions on a.GradeDecisionId equals d.GradeDecisionId
                            where c.Status == "Accepted" && d.DecidedBy != null && userIds.Contains(d.DecidedBy.Value)
                            select new { c.ClaimId, Qc = d.DecidedBy!.Value }).Distinct()
            .GroupBy(x => x.Qc).Select(g => new { g.Key, Count = g.Count() }).ToDictionaryAsync(x => x.Key, x => x.Count, ct);
        return userIds.ToDictionary(id => id, id => (approved.GetValueOrDefault(id), claims.GetValueOrDefault(id)));
    }
}
