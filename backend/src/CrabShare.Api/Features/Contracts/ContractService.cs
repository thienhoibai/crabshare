using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using CrabShare.Api.Infrastructure.Signing;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Contracts;

/// <summary>
/// UC14 hợp đồng góp vốn (TH-08, TL-19): sinh từ mẫu đang Active cho một khoản góp, xuất PDF, băm <c>draft_hash</c>; ký số lần lượt
/// trên cùng một file qua <see cref="IDigitalSigningService"/>: chủ hộ nuôi ký trước, nhà đầu tư ký sau trên đúng file người nuôi đã ký.
/// Mỗi phiên bản file lưu nguyên byte theo mã băm (<see cref="ContractFileStore"/>); đủ hai chữ ký → FullySigned + final_hash.
/// Sinh và ký chạy trong transaction có khoá chuỗi audit (ghi audit cùng commit).
/// </summary>
public sealed class ContractService(
    AppDbContext db, ICurrentUser me, IAuditLog audit, TimeProvider clock,
    ContractTemplateDocuments templates, ContractPdfRenderer renderer, ContractFileStore files, IDigitalSigningService signing)
{
    public const string LegalNotice = "Bản demo: mẫu hợp đồng chưa được rà soát pháp lý, chỉ dùng để minh hoạ luồng ký số.";
    private static readonly CultureInfo Vi = CultureInfo.GetCultureInfo("vi-VN");

    // ---------- Sinh hợp đồng ----------

    /// <summary>
    /// Màn 3 luồng góp vốn: hợp đồng của khoản góp đang giữ chỗ (hoặc đã xác nhận) của chính tôi. Đã có thì trả lại đúng hợp đồng đó
    /// (Created = false): mỗi khoản góp chỉ có một hợp đồng (uq_investment_contract_contribution_id).
    /// </summary>
    public Task<(ContractResponse Contract, bool Created)> CreateForContributionAsync(long contributionId, CancellationToken ct)
        => db.InTransactionAsync(async () =>
        {
            await audit.LockAsync(ct);
            if (!me.IsInRole(Roles.Investor))
                throw new ForbiddenException("auth.investor_only", "Chỉ nhà đầu tư mới lập hợp đồng góp vốn.");
            var contribution = await db.Contributions
                .Include(c => c.Batch).ThenInclude(b => b.Operator)
                .Include(c => c.Investor).ThenInclude(i => i.User)
                .Include(c => c.InvestmentContract)
                .SingleOrDefaultAsync(c => c.ContributionId == contributionId, ct)
                ?? throw new NotFoundException("contribution.not_found", "Không tìm thấy khoản góp.");
            if (contribution.InvestorId != me.UserId)
                throw new ForbiddenException("contribution.not_owner", "Khoản góp này không phải của bạn.");
            if (contribution.InvestmentContract is { } existing)
                return (await DescribeAsync(existing.ContractId, ct), false);

            var now = Now();
            if (!IsActive(contribution, now))
                throw new BusinessRuleException("contract.contribution_inactive", "Khoản góp đã hết hạn giữ chỗ hoặc đã hoàn tiền nên không lập hợp đồng được.");
            if (contribution.Batch.Status != "Funding")
                throw new BusinessRuleException("contract.batch_not_funding", "Lô không còn ở giai đoạn gọi vốn.");

            var template = await db.ContractTemplates.AsNoTracking()
                .Where(t => t.Status == "Active" && t.EffectiveFrom <= now)
                .OrderByDescending(t => t.EffectiveFrom)
                .FirstOrDefaultAsync(ct)
                ?? throw new AppException(StatusCodes.Status500InternalServerError, "contract.no_active_template", "Chưa có mẫu hợp đồng đang hiệu lực. Báo quản trị viên.");
            var contractNo = $"HD{now.ToOffset(TimeSpan.FromHours(7)):yyyyMMdd}-{contribution.ContributionId:D6}";
            var body = ContractTemplateDocuments.Fill(templates.Read(template.VersionCode, template.ContentHash),
                await PlaceholdersAsync(contribution, ct));
            var pdf = renderer.Render(new ContractDocument(contractNo, template.VersionCode, template.ContentHash, now,
                contribution.Batch.Operator.LegalName, InvestorName(contribution.Investor), body));
            var draft = await files.SaveAsync(contractNo, pdf, ct);

            var contract = new InvestmentContract
            {
                ContractNo = contractNo, ContributionId = contribution.ContributionId, TemplateId = template.TemplateId,
                Status = ContractStatuses.Draft, SigningMethod = ContractStatuses.DigitalSignature, DraftHash = draft.Sha256,
                CreatedAt = now, UpdatedAt = now,
            };
            db.InvestmentContracts.Add(contract);
            await db.SaveChangesAsync(ct);
            await audit.WriteAsync("investment_contract", contract.ContractId, "create", null, new
            {
                contractNo, contribution.ContributionId, contribution.Batch.BatchCode, amount = (long)contribution.Amount,
                templateVersion = template.VersionCode, templateHash = template.ContentHash, draftHash = draft.Sha256, status = contract.Status,
            }, now, ct);
            return (await DescribeAsync(contract.ContractId, ct), true);
        }, ct);

    // ---------- Ký số ----------

    /// <summary>
    /// Ký phần của người đang đăng nhập: chủ hộ nuôi của lô (thứ tự 1) hoặc nhà đầu tư của khoản góp (thứ tự 2).
    /// Nhà đầu tư ký khi người nuôi chưa ký → 422 contract.wrong_signing_order.
    /// </summary>
    public Task<ContractResponse> SignAsync(long contractId, CancellationToken ct) => db.InTransactionAsync(async () =>
    {
        await audit.LockAsync(ct);
        var contract = await db.InvestmentContracts
            .Include(c => c.ContractSignatures)
            .Include(c => c.Contribution).ThenInclude(c => c.Batch).ThenInclude(b => b.Operator)
            .Include(c => c.Contribution).ThenInclude(c => c.Investor).ThenInclude(i => i.User)
            .SingleOrDefaultAsync(c => c.ContractId == contractId, ct)
            ?? throw ContractNotFound();
        var role = await SignerRoleAsync(contract, ct);
        if (role == StaffOnly)
            throw new ForbiddenException("contract.owner_only", "Chỉ chủ hộ nuôi mới ký hợp đồng thay hộ nuôi.");
        if (role is null)
            throw new ForbiddenException("contract.not_party", "Bạn không phải một bên ký của hợp đồng này.");
        var now = Now();

        if (contract.Status == ContractStatuses.Void)
            throw new BusinessRuleException("contract.void", "Hợp đồng đã huỷ (khoản góp hết hạn hoặc lô huỷ).");
        if (contract.Status == ContractStatuses.FullySigned)
            throw new ConflictException("contract.already_signed", "Hợp đồng đã đủ hai chữ ký.");
        if (contract.SigningMethod != ContractStatuses.DigitalSignature)
            throw new BusinessRuleException("contract.not_digital", "Hợp đồng này ký ngoài hệ thống (bản scan).");
        if (!IsActive(contract.Contribution, now))
            throw new BusinessRuleException("contract.contribution_inactive", "Khoản góp đã hết hạn giữ chỗ hoặc đã hoàn tiền nên không ký tiếp được.");
        if (role == ContractStatuses.Investor && contract.Status == ContractStatuses.Draft)
            throw new BusinessRuleException("contract.wrong_signing_order", "Người nuôi phải ký trước, sau đó bạn mới ký được.");
        if (role == ContractStatuses.Operator && contract.Status != ContractStatuses.Draft)
            throw new ConflictException("contract.already_signed", "Người nuôi đã ký hợp đồng này.");

        // Ký tiếp trên đúng file hiện hành (bản nháp, hoặc bản người nuôi đã ký): chữ ký sau nối vào, không tạo file mới từ mẫu
        var previousHash = CurrentHash(contract);
        var current = await files.ReadAsync(contract.ContractNo, previousHash, ct);
        var signer = await db.AppUsers.AsNoTracking().Where(u => u.UserId == me.UserId).Select(u => u.FullName).SingleAsync(ct);
        var signerName = role == ContractStatuses.Operator ? $"{signer} — {contract.Contribution.Batch.Operator.LegalName}" : signer;
        var signed = await signing.SignAsync(current, signerName, role, ct);
        var stored = await files.SaveAsync(contract.ContractNo, signed.Pdf, ct);

        contract.ContractSignatures.Add(new ContractSignature
        {
            SignerRole = role, SigningOrder = role == ContractStatuses.Operator ? (byte)1 : (byte)2, SignerUserId = me.UserId,
            ProviderRequestId = signed.ProviderReference, SignedHash = stored.Sha256, SignedAt = now, CreatedAt = now,
        });
        var before = contract.Status;
        if (role == ContractStatuses.Operator)
            contract.Status = ContractStatuses.OperatorSigned;
        else
        {
            contract.Status = ContractStatuses.FullySigned;
            contract.FinalHash = stored.Sha256;
            contract.FinalFileUri = stored.Uri;
            contract.FullySignedAt = now;
        }
        contract.UpdatedAt = now;
        await db.SaveChangesAsync(ct);
        await audit.WriteAsync("investment_contract", contract.ContractId, "sign", new { status = before, hash = previousHash }, new
        {
            status = contract.Status, role, signerUserId = me.UserId, signedHash = stored.Sha256, previousHash,
            providerReference = signed.ProviderReference, contract.FinalHash,
        }, now, ct);
        return await DescribeAsync(contract.ContractId, ct);
    }, ct);

    // ---------- Xem / tải ----------

    public async Task<ContractResponse> GetAsync(long contractId, CancellationToken ct)
    {
        await RequireAccessAsync(contractId, ct);
        return await DescribeAsync(contractId, ct);
    }

    /// <summary>File PDF hiện hành (bản cuối nếu đã đủ chữ ký), đã băm lại để đối chiếu.</summary>
    public async Task<(byte[] Pdf, string FileName)> GetFileAsync(long contractId, CancellationToken ct)
    {
        var contract = await RequireAccessAsync(contractId, ct);
        return (await files.ReadAsync(contract.ContractNo, CurrentHash(contract), ct), $"{contract.ContractNo}.pdf");
    }

    /// <summary>Hợp đồng của các lô thuộc hộ nuôi của tôi: chờ tôi ký trước, rồi chờ nhà đầu tư, rồi đã xong.</summary>
    public async Task<IReadOnlyList<ContractSummary>> ListForOperatorAsync(CancellationToken ct)
    {
        var operatorId = me.RequireOperatorId();
        var rows = await SummaryQuery(db.InvestmentContracts.Where(c => c.Contribution.Batch.OperatorId == operatorId)).ToListAsync(ct);
        return rows.OrderBy(r => r.Status switch { ContractStatuses.Draft => 0, ContractStatuses.OperatorSigned => 1, ContractStatuses.FullySigned => 2, _ => 3 })
            .ThenByDescending(r => r.CreatedAt).ToList();
    }

    // ---------- Dùng chung (cũng dùng ở TH-09) ----------

    internal static IQueryable<ContractSummary> SummaryQuery(IQueryable<InvestmentContract> contracts) => contracts
        .OrderByDescending(c => c.ContractId)
        .Select(c => new ContractSummary(
            c.ContractId, c.ContractNo, c.Status, c.SigningMethod, c.Contribution.Batch.BatchCode, c.Contribution.Batch.Title,
            c.Contribution.Investor.InvestorKind == "Organization" && c.Contribution.Investor.OrganizationName != null
                ? c.Contribution.Investor.OrganizationName : c.Contribution.Investor.User.FullName,
            (long)c.Contribution.Amount, c.Contribution.Status,
            c.Status == ContractStatuses.Draft && c.SigningMethod == ContractStatuses.DigitalSignature ? ContractStatuses.Operator
                : c.Status == ContractStatuses.OperatorSigned ? ContractStatuses.Investor : null,
            c.CreatedAt, c.FullySignedAt));

    internal async Task<ContractResponse> DescribeAsync(long contractId, CancellationToken ct)
    {
        var c = await db.InvestmentContracts.AsNoTracking()
            .Include(x => x.Template)
            .Include(x => x.ContractSignatures).ThenInclude(s => s.SignerUser)
            .Include(x => x.Contribution).ThenInclude(x => x.Batch).ThenInclude(b => b.Operator)
            .Include(x => x.Contribution).ThenInclude(x => x.Investor).ThenInclude(i => i.User)
            .SingleAsync(x => x.ContractId == contractId, ct);
        var next = c.Status switch
        {
            ContractStatuses.Draft when c.SigningMethod == ContractStatuses.DigitalSignature => ContractStatuses.Operator,
            ContractStatuses.OperatorSigned => ContractStatuses.Investor,
            _ => null,
        };
        var canSign = next is not null && IsActive(c.Contribution, clock.GetUtcNow()) && await SignerRoleAsync(c, ct) == next;
        return new ContractResponse(
            c.ContractId, c.ContractNo, c.Status, c.SigningMethod, c.Contribution.Batch.BatchCode, c.Contribution.Batch.Title,
            c.Contribution.Batch.Operator.LegalName, InvestorName(c.Contribution.Investor), c.ContributionId, (long)c.Contribution.Amount,
            c.Contribution.Status, c.Template.VersionCode, c.DraftHash, CurrentHash(c), c.FinalHash, c.FullySignedAt, c.CreatedAt,
            c.ContractSignatures.OrderBy(s => s.SigningOrder)
                .Select(s => new ContractSignatureResponse(s.SignerRole, s.SigningOrder, s.SignerUser.FullName, s.SignedAt, s.SignedHash, s.ProviderRequestId))
                .ToList(),
            next, canSign, LegalNotice);
    }

    /// <summary>Ai được xem: nhà đầu tư của khoản góp, thành viên hộ nuôi của lô, admin. Người khác → 404 (không lộ là có hợp đồng).</summary>
    internal async Task<InvestmentContract> RequireAccessAsync(long contractId, CancellationToken ct)
    {
        var contract = await db.InvestmentContracts.AsNoTracking()
            .Include(c => c.ContractSignatures)
            .Include(c => c.Contribution).ThenInclude(c => c.Batch)
            .SingleOrDefaultAsync(c => c.ContractId == contractId, ct)
            ?? throw ContractNotFound();
        var allowed = me.IsInRole(Roles.PlatformAdmin)
                      || contract.Contribution.InvestorId == me.UserId
                      || (me.OperatorId is { } operatorId && operatorId == contract.Contribution.Batch.OperatorId);
        return allowed ? contract : throw ContractNotFound();
    }

    /// <summary>Nhân viên (Staff) của hộ nuôi xem được hợp đồng nhưng không ký thay hộ nuôi.</summary>
    private const string StaffOnly = "Staff";

    /// <summary>
    /// Vai trò ký của người đang đăng nhập với hợp đồng này: Investor (nhà đầu tư của khoản góp), Operator (chủ hộ nuôi của lô),
    /// <see cref="StaffOnly"/> (nhân viên hộ nuôi), hoặc null (không phải một bên).
    /// </summary>
    private async Task<string?> SignerRoleAsync(InvestmentContract contract, CancellationToken ct)
    {
        if (!me.IsAuthenticated) return null;
        if (me.IsInRole(Roles.Investor) && contract.Contribution.InvestorId == me.UserId) return ContractStatuses.Investor;
        if (me.OperatorId is not { } operatorId || operatorId != contract.Contribution.Batch.OperatorId) return null;
        var isOwner = await db.OperatorMembers.AnyAsync(m => m.UserId == me.UserId && m.OperatorId == operatorId && m.MemberRole == "Owner", ct);
        return isOwner ? ContractStatuses.Operator : StaffOnly;
    }

    internal static string CurrentHash(InvestmentContract c)
        => c.FinalHash ?? c.ContractSignatures.OrderByDescending(s => s.SigningOrder).Select(s => s.SignedHash).FirstOrDefault() ?? c.DraftHash;

    private static bool IsActive(Contribution c, DateTimeOffset now)
        => c.Status == "Confirmed" || (c.Status == "Reserved" && c.ExpiresAt > now);

    private static string InvestorName(Investor investor)
        => investor.InvestorKind == "Organization" && !string.IsNullOrWhiteSpace(investor.OrganizationName) ? investor.OrganizationName : investor.User.FullName;

    /// <summary>Dữ liệu điền vào {{placeholder}} của mẫu CT-2026-01.</summary>
    private async Task<Dictionary<string, string>> PlaceholdersAsync(Contribution contribution, CancellationToken ct)
    {
        var batch = contribution.Batch;
        var investor = contribution.Investor;
        var cost = await db.StandardCostVersions.AsNoTracking()
            .Where(v => v.BatchId == batch.BatchId && v.Status == "Locked")
            .Select(v => new { v.VersionNo, Items = v.StandardCostItems.OrderBy(i => i.CostItemId)
                .Select(i => new { i.Category, i.Description, i.Quantity, i.Unit, i.UnitPrice, i.TrancheNo }).ToList() })
            .FirstOrDefaultAsync(ct);
        var offtake = await db.OfftakeCommitments.AsNoTracking()
            .Where(o => o.ContributionId == contribution.ContributionId && o.Status != "Cancelled")
            .OrderByDescending(o => o.OfftakeId)
            .FirstOrDefaultAsync(ct);
        return new Dictionary<string, string>
        {
            ["operator.legal_name"] = batch.Operator.LegalName,
            ["operator.tax_code"] = batch.Operator.TaxCode,
            ["operator.farm_address"] = batch.Operator.FarmAddress,
            ["investor.full_name"] = InvestorName(investor),
            ["investor.id_or_tax_code"] = investor.InvestorKind == "Organization" && !string.IsNullOrWhiteSpace(investor.TaxCode)
                ? $"MST {investor.TaxCode}"
                : investor.VerifiedAt is { } verified ? $"đã xác minh danh tính (eKYC) ngày {verified.ToOffset(TimeSpan.FromHours(7)):dd/MM/yyyy}" : "chưa xác minh danh tính",
            ["batch.batch_code"] = batch.BatchCode,
            ["batch.title"] = batch.Title,
            ["batch.seed_quantity"] = batch.SeedQuantity.ToString("N0", Vi),
            ["batch.cycle_days"] = batch.CycleDays.ToString(Vi),
            ["batch.operator_share_pct"] = batch.OperatorSharePct.ToString("0.##", Vi),
            ["batch.frozen_stock_cap_months"] = batch.FrozenStockCapMonths.ToString(Vi),
            ["batch.offtake_deposit_pct"] = batch.OfftakeDepositPct.ToString("0.##", Vi),
            ["contribution.amount"] = contribution.Amount.ToString("N0", Vi),
            ["standard_cost.version_no"] = cost?.VersionNo.ToString(Vi) ?? "",
            // Bảng chi phí không có cột băm: băm bản JSON các dòng đã khoá (thứ tự theo id) để hợp đồng chỉ đúng một bảng
            ["standard_cost.hash"] = cost is null ? "" : Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(AuditChain.Snapshot(cost.Items)))),
            // Mẫu viết "Khối lượng {{offtake.volume_kg}} kg, giá chốt {{offtake.price}}"
            ["offtake.volume_kg"] = offtake is null ? "0" : offtake.CommittedQtyKg.ToString("0.##", Vi),
            ["offtake.price"] = offtake is null ? "không áp dụng (Bên B không đăng ký bao tiêu)" : $"{offtake.FixedUnitPrice.ToString("N0", Vi)} đồng/kg",
        };
    }

    private DateTimeOffset Now() => AuditChain.Timestamp(clock.GetUtcNow());

    private static NotFoundException ContractNotFound() => new("contract.not_found", "Không tìm thấy hợp đồng.");
}
