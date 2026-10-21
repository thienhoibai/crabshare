using System.Data;
using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Common.Paging;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Options;

namespace CrabShare.Api.Features.Harvest;

public sealed class TagsService(AppDbContext db, ICurrentUser me, IAuditLog audit,
    IHarvestTagCodeGenerator codes, TimeProvider clock, IOptions<TraceOptions> traceOptions)
{
    private async Task<OperatorMember> MemberAsync(bool owner, CancellationToken ct)
    {
        if (!me.IsInRole(Roles.OperatorMember)) throw Denied();
        var member = await db.OperatorMembers.AsNoTracking().Include(m => m.User).Include(m => m.Operator)
            .SingleOrDefaultAsync(m => m.UserId == me.UserId, ct);
        if (member is null || member.User.Status != "Active" || member.MemberRole is not ("Owner" or "Staff")
            || member.Operator.Status != "Approved"
            || (me.OperatorId is { } claimed && claimed != member.OperatorId)
            || !await db.AppUserRoles.AnyAsync(r => r.UserId == me.UserId && r.RoleCode == Roles.OperatorMember, ct)) throw Denied();
        if (owner && member.MemberRole != "Owner") throw new ForbiddenException("tag.owner_required", "Chỉ chủ hộ nuôi được hủy hoặc thay tem.");
        return member;
    }
    private static ForbiddenException Denied() => new("tag.access_denied", "Bạn không có quyền trên hộ nuôi/tem này.");
    private IQueryable<CrabTag> Owned(long operatorId) => db.CrabTags.Where(t => t.CrabItem.Batch.OperatorId == operatorId);
    private static TagLifecycleResponse Lifecycle(CrabTag tag) => new(tag.TagId, tag.TagCode, tag.Status, tag.ActivationEvidenceId, tag.ActivatedAt);
    private static TagListItem Item(CrabTag tag) => new(tag.TagId, tag.TagCode, tag.Status, tag.CrabItem.Batch.BatchCode, tag.CrabItem.ItemUuid, tag.PrintedAt);

    public async Task<PagedResult<TagListItem>> ListAsync(TagListQuery query, PageQuery paging, CancellationToken ct)
    {
        var member = await MemberAsync(false, ct);
        var tags = Owned(member.OperatorId).AsNoTracking();
        if (query.Status is not null) tags = tags.Where(t => t.Status == query.Status);
        return await tags.OrderByDescending(t => t.PrintedAt).ThenBy(t => t.TagId)
            .Select(t => new TagListItem(t.TagId, t.TagCode, t.Status, t.CrabItem.Batch.BatchCode, t.CrabItem.ItemUuid, t.PrintedAt))
            .ToPagedAsync(paging, ct);
    }

    public async Task<TagLabelResponse> LabelAsync(string code, CancellationToken ct)
    {
        var member = await MemberAsync(false, ct);
        var tag = await Owned(member.OperatorId).AsNoTracking().SingleOrDefaultAsync(t => t.TagCode == code, ct)
            ?? throw new NotFoundException("tag.not_found", "Không tìm thấy tem.");
        if (tag.Status == "Void") throw new BusinessRuleException("tag.void", "Tem đã bị hủy.");
        if (!Uri.TryCreate(traceOptions.Value.PublicBaseUrl, UriKind.Absolute, out var baseUri)
            || baseUri.Scheme is not ("https" or "http"))
            throw new AppException(500, "trace.base_url_missing", "Chưa cấu hình địa chỉ truy xuất công khai.");
        var traceUrl = new Uri(baseUri, $"/truy-xuat/{Uri.EscapeDataString(tag.TagCode)}").AbsoluteUri;
        return new(tag.TagCode, traceUrl);
    }

    public async Task<TagLifecycleResponse> ActivateAsync(string code, ActivateTagRequest request, CancellationToken ct)
    {
        var member = await MemberAsync(false, ct);
        return await db.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
        {
            db.ChangeTracker.Clear();
            await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
            await audit.LockAsync(ct);
            var currentMember = await MemberAsync(false, ct);
            var tag = await Owned(currentMember.OperatorId).Include(t => t.CrabItem).SingleOrDefaultAsync(t => t.TagCode == code, ct)
                ?? throw new NotFoundException("tag.not_found", "Không tìm thấy tem.");
            if (tag.Status == "Active")
            {
                if (tag.ActivationEvidenceId == request.EvidenceId) { await tx.CommitAsync(ct); return Lifecycle(tag); }
                throw new ConflictException("tag.activation_conflict", "Tem đã được kích hoạt bằng ảnh xác nhận khác.");
            }
            if (tag.Status != "Printed") throw new ConflictException("tag.invalid_state", "Chỉ kích hoạt được tem đang ở trạng thái Printed.");
            var evidence = await db.Evidences.AsNoTracking().SingleOrDefaultAsync(e => e.EvidenceId == request.EvidenceId
                && e.Batch.OperatorId == currentMember.OperatorId, ct)
                ?? throw new NotFoundException("evidence.not_found", "Không tìm thấy ảnh xác nhận.");
            if (evidence.CrabItemId != tag.CrabItemId || evidence.BatchId != tag.CrabItem.BatchId
                || evidence.MediaType != "Photo" || evidence.Source != "InAppCapture" || evidence.ReviewStatus != "Accepted")
                throw new BusinessRuleException("tag.evidence_ineligible", "Ảnh phải được chụp trong ứng dụng, đã được duyệt và thuộc đúng con cua.");
            var now = AuditChain.Timestamp(clock.GetUtcNow());
            var old = AuditChain.Snapshot(new { tag.Status, tag.ActivatedAt, tag.ActivationEvidenceId });
            tag.Status = "Active"; tag.ActivatedAt = now; tag.ActivationEvidenceId = evidence.EvidenceId;
            db.CrabItemEvents.Add(new CrabItemEvent { CrabItemId = tag.CrabItemId, TagId = tag.TagId, EvidenceId = evidence.EvidenceId,
                ActorId = me.UserId, EventType = "TagActivated", OccurredAt = now, CreatedAt = now });
            await db.SaveChangesAsync(ct);
            await audit.WriteAsync("CrabTag", tag.TagId, "ActivateTag", old,
                new { tag.Status, tag.ActivatedAt, tag.ActivationEvidenceId, tag.TagCode }, now, ct);
            await tx.CommitAsync(ct);
            return Lifecycle(tag);
        });
    }

    public async Task<TagVoidResponse> VoidAsync(string code, VoidTagRequest request, CancellationToken ct)
    {
        var member = await MemberAsync(true, ct);
        var reason = request.Reason.Trim();
        if (reason.Length == 0 || reason.Length > 200) throw new AppException(400, "tag.reason_required", "Lý do hủy tem phải có từ 1 đến 200 ký tự.");
        for (var attempt = 0; attempt < 5; attempt++)
        {
            try
            {
                return await db.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
                {
                    db.ChangeTracker.Clear();
                    await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
                    await audit.LockAsync(ct);
                    var currentMember = await MemberAsync(true, ct);
                    var tag = await Owned(currentMember.OperatorId).Include(t => t.CrabItem).ThenInclude(c => c.Batch)
                        .SingleOrDefaultAsync(t => t.TagCode == code, ct) ?? throw new NotFoundException("tag.not_found", "Không tìm thấy tem.");
                    if (tag.Status is not ("Printed" or "Active") || tag.CrabItem.Status != "InStock")
                        throw new ConflictException("tag.invalid_state", "Chỉ thay tem Printed hoặc Active của cua đang InStock.");
                    var now = AuditChain.Timestamp(clock.GetUtcNow());
                    var old = AuditChain.Snapshot(new { tag.Status, tag.ActivatedAt, tag.ActivationEvidenceId, tag.VoidReason });
                    var replacementCode = codes.NewCode();
                    if (replacementCode.Length != HarvestTagCodeGenerator.Length
                        || replacementCode.Any(ch => !HarvestTagCodeGenerator.Alphabet.Contains(ch)))
                        throw new ConflictException("tag.code_generation_conflict", "Mã tem mới không đúng định dạng.");
                    await db.Database.ExecuteSqlInterpolatedAsync($"UPDATE dbo.crab_tag SET status='Void', voided_at={now}, void_reason={reason} WHERE tag_id={tag.TagId}", ct);
                    await using var command = db.Database.GetDbConnection().CreateCommand();
                    command.Transaction = tx.GetDbTransaction();
                    command.CommandText = "INSERT dbo.crab_tag(crab_item_id,tag_code,status,printed_at,printed_by) OUTPUT INSERTED.tag_id VALUES(@crabItemId,@tagCode,'Printed',@printedAt,@printedBy)";
                    foreach (var (name, value) in new[] { ("@crabItemId", (object)tag.CrabItemId), ("@tagCode", replacementCode), ("@printedAt", (object)now), ("@printedBy", me.UserId) })
                    { var parameter = command.CreateParameter(); parameter.ParameterName = name; parameter.Value = value; command.Parameters.Add(parameter); }
                    var replacementId = Convert.ToInt64(await command.ExecuteScalarAsync(ct));
                    await db.Database.ExecuteSqlInterpolatedAsync($"""
                        INSERT dbo.crab_item_event(crab_item_id,event_type,occurred_at,actor_id,tag_id,note,created_at)
                        VALUES({tag.CrabItemId},'TagVoided',{now},{me.UserId},{tag.TagId},{reason},{now}),
                              ({tag.CrabItemId},'TagPrinted',{now},{me.UserId},{replacementId},N'Replacement',{now})
                        """, ct);
                    tag.Status = "Void"; tag.VoidedAt = now; tag.VoidReason = reason;
                    await audit.WriteAsync("CrabTag", tag.TagId, "VoidTag", old, new { tag.Status, tag.VoidedAt, tag.VoidReason, ReplacementTagId = replacementId }, now, ct);
                    await audit.WriteAsync("CrabTag", replacementId, "PrintReplacementTag", null,
                        new { TagCode = replacementCode, Status = "Printed", tag.CrabItemId }, now, ct);
                    await tx.CommitAsync(ct);
                    return new TagVoidResponse(Lifecycle(tag), new(replacementId, replacementCode, "Printed", tag.CrabItem.Batch.BatchCode, tag.CrabItem.ItemUuid, now));
                });
            }
            catch (Exception ex) when (TagCodeCollision(ex))
            {
                db.ChangeTracker.Clear();
                if (attempt == 4) throw new ConflictException("tag.code_generation_conflict", "Không thể tạo mã tem mới. Vui lòng thử lại.");
            }
        }
        throw new ConflictException("tag.code_generation_conflict", "Không thể tạo mã tem mới. Vui lòng thử lại.");
    }

    private static bool TagCodeCollision(Exception ex)
    {
        for (Exception? inner = ex; inner is not null; inner = inner.InnerException)
            if (inner is SqlException sql && sql.Number is 2601 or 2627
                && sql.Message.Contains("uq_crab_tag_tag_code", StringComparison.OrdinalIgnoreCase)) return true;
        return false;
    }
}
