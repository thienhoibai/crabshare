using System.Data;
using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Features.Batches;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Harvest;

public sealed partial class HarvestService
{
    public async Task<HarvestWriteResult<HarvestCrabResponse>> RecordAsync(long id, RecordHarvestCrabRequest request, CancellationToken ct)
    {
        BatchService.Validate(request);
        var slotCode = request.SlotCode.Trim();
        var hash = Hash(new
        {
            harvestId = id,
            slotCode = slotCode.ToUpperInvariant(),
            request.ExpectedCrabItemId,
            request.WeightG,
            request.ShellCondition
        });
        for (var attempt = 0; attempt < 5; attempt++)
        {
            try
            {
                return await db.InTransactionAsync(async () =>
                {
                    await audit.LockAsync(ct);
                    var member = await MemberAsync(false, ct);
                    var (session, batch) = await SessionAsync(id, member.OperatorId, true, ct);
                    var previous = await db.SlotEventDetails.AsNoTracking().SingleOrDefaultAsync(d => d.BatchId == batch.BatchId && d.RequestId == request.RequestId, ct);
                    if (previous is not null)
                    {
                        // Gửi lại sau khi mất mạng phải nhận kết quả cũ, không thu hoạch cùng con lần hai.
                        if (previous.ActorId != me.UserId || previous.RequestHash != hash)
                            throw Conflict("request_reused", "Mã yêu cầu đã được dùng với nội dung khác.");
                        var snapshot = await db.HarvestRecords.AsNoTracking().SingleOrDefaultAsync(r => r.SlotEventId == previous.SlotEventId && r.HarvestId == id, ct)
                            ?? throw Conflict("request_reused");
                        return new HarvestWriteResult<HarvestCrabResponse>(await RecordResponseAsync(snapshot, ct), false);
                    }
                    EnsureOpen(session, batch);
                    var slot = await db.PhysicalSlots.FromSqlInterpolated($"SELECT * FROM dbo.physical_slot WITH (UPDLOCK,HOLDLOCK) WHERE operator_id = {member.OperatorId} AND slot_code = {slotCode}")
                        .SingleOrDefaultAsync(ct) ?? throw new NotFoundException("harvest.slot_not_found", "Không tìm thấy hộp trong hộ nuôi của bạn.");
                    var allocation = await db.SlotAllocations.SingleOrDefaultAsync(a => a.SlotId == slot.SlotId && a.ReleasedAt == null, ct);
                    if (slot.Status != "Occupied" || allocation is null || allocation.BatchId != batch.BatchId)
                        throw Conflict("crab_changed", "Hộp trống, không thuộc lô hoặc vừa được sử dụng bởi yêu cầu khác.");
                    var crab = await db.CrabItems.SingleOrDefaultAsync(c => c.SlotAllocationId == allocation.SlotAllocationId && c.BatchId == batch.BatchId && c.Status == "Growing", ct);
                    if (crab is null || crab.CrabItemId != request.ExpectedCrabItemId || crab.HarvestId is not null)
                        throw Conflict("crab_changed", "Cá thể trong hộp đã thay đổi hoặc không còn đủ điều kiện thu hoạch.");
                    if (await db.CrabTags.AnyAsync(t => t.CrabItemId == crab.CrabItemId && t.Status != "Void", ct))
                        throw Conflict("already_harvested", "Cá thể đã có tem thu hoạch.");
                    var grade = HarvestGrading.Select(await db.ProductGrades.AsNoTracking().ToListAsync(ct), request.WeightG, request.ShellCondition);
                    var now = AuditChain.Timestamp(clock.GetUtcNow());
                    if (now < crab.StockedAt || now < allocation.AllocatedAt
                        || await db.CrabItemEvents.AnyAsync(e => e.CrabItemId == crab.CrabItemId && e.OccurredAt > now, ct)
                        || await db.SlotEvents.AnyAsync(e => e.SlotAllocation.SlotId == slot.SlotId && e.OccurredAt > now, ct))
                        throw Rule("invalid_time", "Thời điểm thu hoạch phải sau lúc thả và các sự kiện đã ghi.");
                    var claimed = await db.CrabItems.Where(c => c.CrabItemId == crab.CrabItemId && c.Status == "Growing" && c.HarvestId == null && c.SlotAllocationId == allocation.SlotAllocationId)
                        .ExecuteUpdateAsync(set => set.SetProperty(c => c.Status, "InStock").SetProperty(c => c.WeightG, (short?)request.WeightG)
                            .SetProperty(c => c.GradeId, grade.GradeId).SetProperty(c => c.HarvestId, id).SetProperty(c => c.UpdatedAt, now), ct);
                    if (claimed != 1)
                        throw Conflict("already_harvested");
                    // UPDATE trực tiếp không cập nhật bản EF đang giữ; tải lại trước khi tiếp tục.
                    await db.Entry(crab).ReloadAsync(ct);
                    var tagCode = tagCodes.NewCode();
                    if (tagCode.Length != HarvestTagCodeGenerator.Length || tagCode.Any(c => !HarvestTagCodeGenerator.Alphabet.Contains(c)))
                        throw new InvalidOperationException("Harvest tag generator returned an invalid code.");
                    var tag = new CrabTag
                    {
                        CrabItemId = crab.CrabItemId,
                        TagCode = tagCode,
                        Status = "Printed",
                        PrintedBy = me.UserId,
                        PrintedAt = now
                    };
                    db.CrabTags.Add(tag);
                    var released = await db.SlotAllocations.Where(a => a.SlotAllocationId == allocation.SlotAllocationId && a.ReleasedAt == null)
                        .ExecuteUpdateAsync(set => set.SetProperty(a => a.ReleasedAt, now), ct);
                    var freed = await db.PhysicalSlots.Where(s => s.SlotId == slot.SlotId && s.Status == "Occupied")
                        .ExecuteUpdateAsync(set => set.SetProperty(s => s.Status, "Available").SetProperty(s => s.UpdatedAt, now), ct);
                    if (released != 1 || freed != 1)
                        throw Conflict();
                    await db.Entry(allocation).ReloadAsync(ct);
                    await db.Entry(slot).ReloadAsync(ct);
                    session.HarvestedCount = checked(session.HarvestedCount + 1);
                    session.TotalWeightKg += request.WeightG / 1000m;
                    session.RevisionNo = checked(session.RevisionNo + 1);
                    var note = $"Thu hoạch đợt {id}; {request.WeightG} g; {request.ShellCondition}; {grade.GradeCode}";
                    var slotEvent = new SlotEvent
                    {
                        BatchId = batch.BatchId,
                        SlotAllocationId = allocation.SlotAllocationId,
                        EventType = "Harvested",
                        Quantity = 1,
                        Source = "Manual",
                        OccurredAt = now,
                        ReceivedAt = now,
                        Note = note
                    };
                    db.SlotEvents.Add(slotEvent);
                    db.CrabItemEvents.Add(new CrabItemEvent
                    {
                        CrabItemId = crab.CrabItemId,
                        EventType = "Harvested",
                        OccurredAt = now,
                        CreatedAt = now,
                        ActorId = me.UserId,
                        Note = note
                    });
                    db.CrabItemEvents.Add(new CrabItemEvent
                    {
                        CrabItemId = crab.CrabItemId,
                        EventType = "TagPrinted",
                        OccurredAt = now,
                        CreatedAt = now,
                        ActorId = me.UserId,
                        Tag = tag
                    });
                    await db.SaveChangesAsync(ct);
                    var alive = await db.CrabItems.CountAsync(c => c.BatchId == batch.BatchId && c.Status == "Growing", ct);
                    db.SlotEventDetails.Add(new SlotEventDetail
                    {
                        SlotEventId = slotEvent.SlotEventId,
                        BatchId = batch.BatchId,
                        CrabItemId = crab.CrabItemId,
                        ActorId = me.UserId,
                        RequestId = request.RequestId,
                        RequestHash = hash,
                        AliveCount = alive
                    });
                    await db.SaveChangesAsync(ct);
                    // Chụp lại kết quả lúc cân để lần gửi lại không bị thay đổi theo dữ liệu về sau.
                    var record = new HarvestRecord
                    {
                        SlotEventId = slotEvent.SlotEventId,
                        HarvestId = id,
                        BatchId = batch.BatchId,
                        CrabItemId = crab.CrabItemId,
                        TagId = tag.TagId,
                        SlotCode = slot.SlotCode,
                        WeightG = (short)request.WeightG,
                        ShellCondition = request.ShellCondition,
                        GradeCode = grade.GradeCode,
                        GradeName = grade.GradeName,
                        TagCode = tagCode,
                        TagStatus = "Printed",
                        RecordedAt = now,
                        HarvestedCount = session.HarvestedCount,
                        TotalWeightKg = session.TotalWeightKg
                    };
                    db.HarvestRecords.Add(record);
                    await db.SaveChangesAsync(ct);
                    await EnsureCountsAsync(batch.BatchId, alive, ct);
                    var response = await RecordResponseAsync(record, ct);
                    await audit.WriteAsync("harvest", id, "record_crab", null, response, now, ct);
                    return new HarvestWriteResult<HarvestCrabResponse>(response, true);
                }, ct, IsolationLevel.Serializable);
            }
            catch (Exception ex) when (TagCollision(ex))
            {
                db.ChangeTracker.Clear();
                if (attempt == 4)
                    throw Conflict("tag_generation_conflict", "Chưa tạo được mã tem duy nhất. Thao tác chưa được lưu, vui lòng thử lại.");
            }
            catch (Exception ex) when (SqlNumber(ex) is 2601 or 2627 or 1205 or 1222 || ex is DbUpdateConcurrencyException)
            {
                db.ChangeTracker.Clear();
                throw Conflict();
            }
            catch
            {
                db.ChangeTracker.Clear();
                throw;
            }
        }
        throw Conflict("tag_generation_conflict");
    }

    private async Task EnsureCountsAsync(long batchId, int alive, CancellationToken ct)
    {
        var row = await db.VCrabCountReconciliations.SingleOrDefaultAsync(v => v.BatchId == batchId, ct);
        if (row is null || row.Growing != alive || row.StockedTotal - row.Dead - row.Harvested != alive || row.Harvested != row.DeclaredHarvested
            || await db.CrabItems.AnyAsync(c => c.BatchId == batchId && c.Status == "Growing" && c.SlotAllocation.ReleasedAt != null, ct)
            || await db.SlotAllocations.AnyAsync(a => a.BatchId == batchId && a.ReleasedAt == null
                && db.CrabItems.Count(c => c.SlotAllocationId == a.SlotAllocationId && c.Status == "Growing") != 1, ct))
            throw Rule("reconciliation_failed", "Số cua và lượt gán hộp không khớp. Thao tác đã hủy; cần đối chiếu dữ liệu lô.");
    }
}
