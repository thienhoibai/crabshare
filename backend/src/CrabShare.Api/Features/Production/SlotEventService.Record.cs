using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Features.Alerts;
using CrabShare.Api.Features.Batches;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Production;

public sealed partial class SlotEventService
{
    public Task<SlotEventResponse> RecordAsync(string code, SlotEventRequest request, CancellationToken ct)
    {
        BatchService.Validate(request);
        var slotCode = request.SlotCode.Trim();
        var destinationCode = request.DestinationSlotCode?.Trim();
        var occurred = AuditChain.Timestamp(request.OccurredAt!.Value.ToUniversalTime());
        var note = string.IsNullOrWhiteSpace(request.Note) ? null : request.Note.Trim();
        // Hash giữ nguyên nội dung nghiệp vụ để phát hiện requestId bị dùng lại với dữ liệu khác.
        var normalizedEvent = new
        {
            slotCode,
            request.EventType,
            occurred,
            request.Quantity,
            note,
            destinationCode,
            request.ReplacesCrabItemId,
            request.EvidenceId,
        };
        var serializedEvent = JsonSerializer.Serialize(normalizedEvent);
        var hash = Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(serializedEvent)));
        return WriteAsync(async () =>
        {
            var member = await MemberAsync(false, ct);
            var batch = await BatchAsync(code, member.OperatorId, true, ct);
            var previous = await db.SlotEventDetails.AsNoTracking().SingleOrDefaultAsync(d => d.BatchId == batch.BatchId && d.RequestId == request.RequestId, ct);
            if (previous is not null)
            {
                if (previous.ActorId != me.UserId || previous.RequestHash != hash)
                    throw new ConflictException("slot_events.request_reused", "Mã yêu cầu đã được dùng với dữ liệu khác. Hãy tải lại để ghi sự kiện mới.");
                return await ResponseAsync(previous.SlotEventId, ct);
            }
            if (!RecordingState(batch.Status))
                throw Rule("invalid_state", "Chỉ ghi sự kiện cho lô đã thả giống, đang nuôi hoặc còn cua trong giai đoạn thu hoạch.");
            var now = AuditChain.Timestamp(clock.GetUtcNow());
            if (occurred > now)
                throw Rule("future_time", "Thời điểm sự kiện không được ở tương lai.");
            if (batch.StockedAt is null || occurred < batch.StockedAt)
                throw Rule("invalid_time", "Thời điểm sự kiện không được trước lúc thả giống của lô.");
            var selected = await LockSlotsAsync(member.OperatorId, slotCode, destinationCode, ct);
            var source = selected.Single(s => s.SlotCode.Equals(slotCode, StringComparison.OrdinalIgnoreCase));
            var destination = request.EventType == "Relocated"
                ? selected.Single(s => s.SlotCode.Equals(destinationCode, StringComparison.OrdinalIgnoreCase)) : null;
            if (destination?.SlotId == source.SlotId)
                throw Rule("same_slot", "Hộp đích phải khác hộp nguồn.");
            await CheckSlotTimeAsync(source.SlotId, occurred, ct);
            if (destination is not null)
                await CheckSlotTimeAsync(destination.SlotId, occurred, ct);
            var active = await db.SlotAllocations.SingleOrDefaultAsync(a => a.SlotId == source.SlotId && a.ReleasedAt == null, ct);
            var policy = await CurrentPolicyAsync(batch.BatchId, ct);
            CrabItem crab;
            SlotAllocation eventAllocation;
            SlotAllocation? destinationAllocation = null;
            DateTimeOffset evidenceEarliest;

            if (request.EventType == "Restocked")
            {
                if (policy is null)
                    throw Rule("policy_required", "Chủ hộ nuôi cần đặt quy tắc và hạn thả bù cho lô trước khi ghi thả bù.");
                var deadline = Deadline(batch, policy)!.Value;
                if (BusinessDate(now) > deadline || BusinessDate(occurred) > deadline)
                    throw Rule("restock_expired", $"Đã quá hạn thả bù {deadline:dd/MM/yyyy} (giờ Việt Nam) do trại cấu hình. Không thể nhập lùi ngày để vượt hạn.");
                if (active is not null)
                    throw Rule("slot_unavailable", "Hộp thả bù phải trống, không có lượt gán đang hoạt động.");
                var replaced = await db.CrabItems.Include(c => c.SlotAllocation)
                    .SingleOrDefaultAsync(c => c.CrabItemId == request.ReplacesCrabItemId && c.BatchId == batch.BatchId, ct)
                    ?? throw Rule("replacement_invalid", "Cá thể được thay thế không thuộc lô này.");
                if (replaced.Status != "Dead" || replaced.SlotAllocation.SlotId != source.SlotId || replaced.SlotAllocation.ReleasedAt is null)
                    throw Rule("replacement_invalid", "Chỉ thả bù cho cua đã chết trong đúng hộp đã chọn của lô.");
                if (await db.CrabItems.AnyAsync(c => c.ReplacesCrabItemId == replaced.CrabItemId, ct))
                    throw Changed("Cá thể chết này đã được thả bù. Vui lòng tải lại.");
                var lastAllocation = await db.SlotAllocations.Where(a => a.SlotId == source.SlotId).OrderByDescending(a => a.AllocatedAt)
                    .ThenByDescending(a => a.SlotAllocationId).Select(a => a.SlotAllocationId).FirstAsync(ct);
                if (lastAllocation != replaced.SlotAllocationId)
                    throw Rule("replacement_invalid", "Hộp đã được dùng cho lượt nuôi khác sau lần chết này; không thể thả bù theo lịch sử cũ.");
                var diedAt = await db.CrabItemEvents.Where(e => e.CrabItemId == replaced.CrabItemId && e.EventType == "Died")
                    .MaxAsync(e => (DateTimeOffset?)e.OccurredAt, ct);
                evidenceEarliest = diedAt ?? replaced.SlotAllocation.ReleasedAt.Value;
                if (occurred < evidenceEarliest)
                    throw Rule("invalid_time", "Thả bù không được trước lần ghi nhận cua chết.");
                await ClaimAvailableAsync(source, now, ct);
                eventAllocation = new SlotAllocation
                {
                    BatchId = batch.BatchId,
                    SlotId = source.SlotId,
                    AllocatedAt = occurred,
                    CreatedAt = now
                };
                crab = new CrabItem
                {
                    BatchId = batch.BatchId,
                    SlotAllocation = eventAllocation,
                    ItemUuid = Guid.NewGuid(),
                    StockedAt = occurred,
                    ReplacesCrabItemId = replaced.CrabItemId,
                    Status = "Growing",
                    CreatedAt = now,
                    UpdatedAt = now
                };
                db.CrabItems.Add(crab);
            }
            else
            {
                if (active is null || active.BatchId != batch.BatchId || source.Status != "Occupied")
                    throw Rule("no_current_crab", "Hộp không có cua đang nuôi thuộc lô này; có thể sự kiện đã được ghi. Hãy tải lại.");
                crab = await db.CrabItems.SingleOrDefaultAsync(c => c.BatchId == batch.BatchId && c.SlotAllocationId == active.SlotAllocationId && c.Status == "Growing", ct)
                    ?? throw Rule("no_current_crab", "Không có cua đang sống trong lượt gán hiện tại của hộp.");
                var lastCrabTime = await db.CrabItemEvents.Where(e => e.CrabItemId == crab.CrabItemId).MaxAsync(e => (DateTimeOffset?)e.OccurredAt, ct);
                if (occurred < active.AllocatedAt || occurred < crab.StockedAt || (lastCrabTime is { } last && occurred < last))
                    throw Rule("invalid_time", "Thời điểm sự kiện làm sai thứ tự lịch sử của cá thể hoặc lượt gán hộp.");
                eventAllocation = active;
                evidenceEarliest = active.AllocatedAt;
                if (request.EventType == "Mortality")
                {
                    crab.Status = "Dead";
                    crab.UpdatedAt = now;
                    active.ReleasedAt = occurred;
                    await ReleaseSlotAsync(source, now, ct);
                }
                else if (request.EventType == "Relocated")
                {
                    await ClaimAvailableAsync(destination!, now, ct);
                    active.ReleasedAt = occurred;
                    // Giải phóng lượt gán cũ trước khi tạo lượt mới để không vi phạm unique của hộp.
                    await db.SaveChangesAsync(ct);
                    destinationAllocation = new SlotAllocation
                    {
                        BatchId = batch.BatchId,
                        SlotId = destination!.SlotId,
                        AllocatedAt = occurred,
                        CreatedAt = now
                    };
                    db.SlotAllocations.Add(destinationAllocation);
                    crab.SlotAllocation = destinationAllocation;
                    crab.UpdatedAt = now;
                    await ReleaseSlotAsync(source, now, ct);
                }
                // Lột vỏ chỉ thêm lịch sử; vẫn là con cua đó đang nuôi trong hộp.
            }

            var evidence = request.EvidenceId is { } evidenceId
                ? await EvidenceAsync(evidenceId, batch.BatchId, source.SlotId, evidenceEarliest, now, ct) : null;
            var slotEvent = new SlotEvent
            {
                BatchId = batch.BatchId,
                SlotAllocation = eventAllocation,
                EventType = request.EventType,
                OccurredAt = occurred,
                ReceivedAt = now,
                Quantity = 1,
                Source = "Manual",
                Note = note
            };
            db.SlotEvents.Add(slotEvent);
            crab.CrabItemEvents.Add(new CrabItemEvent
            {
                EventType = request.EventType switch
                {
                    "Mortality" => "Died",
                    "Restocked" => "Stocked",
                    _ => request.EventType
                },
                OccurredAt = occurred,
                CreatedAt = now,
                ActorId = me.UserId,
                EvidenceId = request.EvidenceId,
                Note = note,
            });
            if (evidence is not null)
                evidence.SlotEvent = slotEvent;
            await db.SaveChangesAsync(ct);
            var alive = await db.CrabItems.CountAsync(c => c.BatchId == batch.BatchId && c.Status == "Growing", ct);
            db.SlotEventDetails.Add(new SlotEventDetail
            {
                SlotEventId = slotEvent.SlotEventId,
                BatchId = batch.BatchId,
                CrabItemId = crab.CrabItemId,
                DestinationSlotAllocationId = destinationAllocation?.SlotAllocationId,
                ActorId = me.UserId,
                RequestId = request.RequestId,
                RequestHash = hash,
                PolicyVersionId = policy?.PolicyVersionId,
                AliveCount = alive,
            });
            await db.SaveChangesAsync(ct);
            await EnsureCountsAsync(batch.BatchId, alive, ct);
            var result = await ResponseAsync(slotEvent.SlotEventId, ct);
            await audit.WriteAsync("slot_event", slotEvent.SlotEventId, "record", null, result, now, ct);
            if (request.EventType == "Mortality")
            {
                await RaiseMortalityAlertIfNeededAsync(batch, policy, now, ct);
            }
            return result;
        }, ct);
    }

    private async Task RaiseMortalityAlertIfNeededAsync(
        Batch batch, SlotEventPolicyVersion? policy, DateTimeOffset now, CancellationToken ct)
    {
        // Không tự đặt ngưỡng khi trại chưa cấu hình chính sách hao hụt.
        if (policy?.MortalityWindowHours is not { } hours)
        {
            return;
        }

        var since = now.AddHours(-hours);
        var deaths = await db.SlotEvents.CountAsync(e => e.BatchId == batch.BatchId
            && e.EventType == "Mortality" && e.OccurredAt > since && e.OccurredAt <= now, ct);

        if (batch.SeedQuantity > 0 && deaths * 100m / batch.SeedQuantity > policy.MortalityThresholdPercent!.Value)
        {
            await alerts.RaiseAsync(batch.BatchId, AlertType.Mortality, Enum.Parse<AlertSeverity>(policy.MortalitySeverity!),
                $"Vượt ngưỡng trại cấu hình v{policy.VersionNo}: {deaths}/{batch.SeedQuantity} cua giống ban đầu chết trong {hours} giờ; ngưỡng {policy.MortalityThresholdPercent:0.##}%.",
                TimeSpan.FromHours(policy.MortalityAckWithinHours!.Value), ct);
        }
    }

    private async Task<List<PhysicalSlot>> LockSlotsAsync(long operatorId, string source, string? destination, CancellationToken ct)
    {
        var codes = destination is null ? new[] { source } : new[] { source, destination };
        var ids = await db.PhysicalSlots.AsNoTracking().Where(s => s.OperatorId == operatorId && codes.Contains(s.SlotCode))
            .OrderBy(s => s.SlotId).Select(s => s.SlotId).ToListAsync(ct);
        if (ids.Count != codes.Distinct(StringComparer.OrdinalIgnoreCase).Count())
            throw new NotFoundException("slot_events.slot_not_found", "Hộp nguồn hoặc hộp đích không tồn tại trong hộ nuôi của bạn.");
        var slots = new List<PhysicalSlot>();
        foreach (var id in ids)
            slots.Add(await db.PhysicalSlots.FromSqlInterpolated($"SELECT * FROM dbo.physical_slot WITH (UPDLOCK,HOLDLOCK) WHERE slot_id = {id}").SingleAsync(ct));
        return slots;
    }

    private async Task CheckSlotTimeAsync(long slotId, DateTimeOffset occurred, CancellationToken ct)
    {
        if (await db.SlotAllocations.AnyAsync(a => a.SlotId == slotId && (a.AllocatedAt > occurred || a.ReleasedAt > occurred), ct)
            || await db.SlotEvents.AnyAsync(e => e.SlotAllocation.SlotId == slotId && e.OccurredAt > occurred, ct)
            || await db.SlotEventDetails.AnyAsync(d => d.DestinationSlotAllocationId != null
                && db.SlotAllocations.Any(a => a.SlotAllocationId == d.DestinationSlotAllocationId && a.SlotId == slotId)
                && db.SlotEvents.Any(e => e.SlotEventId == d.SlotEventId && e.OccurredAt > occurred), ct))
            throw Rule("invalid_time", "Thời điểm sự kiện phải sau các lần sử dụng và sự kiện đã ghi của hộp.");
    }

    private async Task ClaimAvailableAsync(PhysicalSlot slot, DateTimeOffset now, CancellationToken ct)
    {
        if (slot.Status != "Available")
            throw Rule("slot_unavailable", "Hộp đích đang được dùng hoặc bảo trì. Vui lòng chọn hộp Available.");
        var claimed = await db.PhysicalSlots.Where(s => s.SlotId == slot.SlotId && s.Status == "Available"
            && !db.SlotAllocations.Any(a => a.SlotId == s.SlotId && a.ReleasedAt == null)
            && !db.CrabItems.Any(c => c.SlotAllocation.SlotId == s.SlotId && c.Status == "Growing"))
            .ExecuteUpdateAsync(set => set.SetProperty(s => s.Status, "Occupied").SetProperty(s => s.UpdatedAt, now), ct);
        if (claimed != 1)
            throw Changed("Hộp vừa được sử dụng bởi thao tác khác. Vui lòng chọn lại.");
        // ExecuteUpdate sửa DB trực tiếp; tải lại để dữ liệu EF đang giữ khớp với DB.
        await db.Entry(slot).ReloadAsync(ct);
    }
    private async Task ReleaseSlotAsync(PhysicalSlot slot, DateTimeOffset now, CancellationToken ct)
    {
        var released = await db.PhysicalSlots.Where(s => s.SlotId == slot.SlotId && s.Status == "Occupied")
            .ExecuteUpdateAsync(set => set.SetProperty(s => s.Status, "Available").SetProperty(s => s.UpdatedAt, now), ct);
        if (released != 1)
            throw Changed();
        await db.Entry(slot).ReloadAsync(ct);
    }
    private async Task<Infrastructure.Persistence.Entities.Evidence> EvidenceAsync(long id, long batchId, long slotId, DateTimeOffset earliest, DateTimeOffset now, CancellationToken ct)
    {
        var evidence = await db.Evidences.SingleOrDefaultAsync(e => e.EvidenceId == id && e.BatchId == batchId && e.SlotId == slotId, ct);
        if (evidence is null || evidence.Source != "InAppCapture" || evidence.MediaType != "Photo" || evidence.CapturedAt is null
            || evidence.Latitude is null || evidence.Longitude is null || evidence.ReviewStatus == "Rejected")
            throw Rule("evidence_required", "Cần ảnh bằng chứng chụp trực tiếp từ app mobile, đúng hộp và lô, có vị trí và thời điểm chụp.");
        if (evidence.SlotEventId is not null)
            throw Changed("Ảnh này đã được gắn với sự kiện khác. Hãy chụp ảnh cho lần ghi nhận mới.");
        if (evidence.CapturedAt < earliest || evidence.CapturedAt > now)
            throw Rule("evidence_invalid_time", "Ảnh không thuộc lượt nuôi hoặc lần thả bù này. Hãy chụp lại trong app mobile.");
        return evidence;
    }

    private async Task EnsureCountsAsync(long batchId, int alive, CancellationToken ct)
    {
        var row = await db.VCrabCountReconciliations.SingleOrDefaultAsync(v => v.BatchId == batchId, ct);
        var invalid = row is null || row.Growing != alive
            // Harvested đã tính mọi con có harvest_id, kể cả con về sau bị mất hoặc bán.
            // Trừ Lost thêm lần nữa sẽ đếm thiếu cùng một cá thể.
            || row.StockedTotal - row.Dead - row.Harvested != alive
            || await db.CrabItems.AnyAsync(c => c.BatchId == batchId && c.Status == "Growing" && c.SlotAllocation.ReleasedAt != null, ct)
            || await db.SlotAllocations.AnyAsync(a => a.BatchId == batchId && a.ReleasedAt == null
                && db.CrabItems.Count(c => c.SlotAllocationId == a.SlotAllocationId && c.Status == "Growing") != 1, ct);
        if (invalid)
            throw Rule("reconciliation_failed", "Số cua đang nuôi không khớp lượt gán hộp. Thao tác đã hủy; cần đối chiếu dữ liệu lô.");
    }
}
