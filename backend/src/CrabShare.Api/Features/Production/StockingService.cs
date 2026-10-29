using System.Data;
using System.Globalization;
using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Features.Batches;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Production;

public sealed class StockingService(AppDbContext db, ICurrentUser me, TimeProvider clock, IAuditLog audit)
{
    public async Task<StockingResponse> StockAsync(string code, StockingRequest request, CancellationToken ct)
    {
        // Service vẫn kiểm tra dữ liệu khi được gọi từ test hoặc tác vụ khác, không chỉ từ controller.
        BatchService.Validate(request);
        if (request.Range is not null)
            BatchService.Validate(request.Range);
        try
        {
            return await db.InTransactionAsync(async () =>
            {
                // Giữ cùng thứ tự khóa với tạo/duyệt lô: audit, hộ nuôi, rồi đến lô.
                await audit.LockAsync(ct);
                var member = await RequireOwnerAsync(ct);
                var farm = await db.Operators.FromSqlInterpolated(
                    $"SELECT * FROM dbo.operator WITH (UPDLOCK, HOLDLOCK) WHERE operator_id = {member.OperatorId}")
                    .AsNoTracking().SingleAsync(ct);
                if (farm.Status != "Approved")
                    throw new BusinessRuleException("stocking.operator_not_approved", "Hộ nuôi cần ở trạng thái Approved để thả giống.");
                var batch = await db.Batches.FromSqlInterpolated(
                    $"SELECT * FROM dbo.batch WITH (UPDLOCK, HOLDLOCK) WHERE batch_code = {code}").SingleOrDefaultAsync(ct)
                    ?? throw new NotFoundException("batch.not_found", "Không tìm thấy lô.");
                if (batch.OperatorId != member.OperatorId)
                    throw new ForbiddenException("batch.not_owner", "Lô này không thuộc hộ nuôi của bạn.");
                var hasRegistry = await db.CrabItems.AnyAsync(c => c.BatchId == batch.BatchId, ct) ||
                    await db.SlotAllocations.AnyAsync(a => a.BatchId == batch.BatchId, ct) ||
                    await db.SlotEvents.AnyAsync(e => e.BatchId == batch.BatchId && e.EventType == "Stocked", ct);
                if (batch.StockedAt is not null || hasRegistry)
                    throw new ConflictException("stocking.already_stocked", "Lô đã có dữ liệu thả giống; không thể ghi nhận lần hai.");
                await db.Entry(batch).Collection(b => b.Contributions).Query().Include(c => c.InvestmentContract).LoadAsync(ct);
                var now = clock.GetUtcNow();
                if (FundingReadiness.StockingBlockedReason(batch, now, hasRegistry) is { } reason)
                    throw new BusinessRuleException("stocking.not_ready", reason);

                var slots = await LoadAvailableSlotsAsync(batch, request, farm.OperatorId, ct);
                var ids = slots.Select(s => s.SlotId).ToArray();
                // Kiểm tra và chiếm hộp trong cùng một UPDATE để hai yêu cầu không cùng lấy một hộp.
                var claimedCount = await db.PhysicalSlots.Where(s => ids.Contains(s.SlotId) && s.Status == "Available" &&
                    !db.SlotAllocations.Any(a => a.SlotId == s.SlotId && a.ReleasedAt == null) &&
                    !db.CrabItems.Any(c => c.SlotAllocation.SlotId == s.SlotId && c.Status == "Growing"))
                    .ExecuteUpdateAsync(set => set.SetProperty(s => s.Status, "Occupied").SetProperty(s => s.UpdatedAt, now), ct);
                if (claimedCount != slots.Count)
                    throw new BusinessRuleException("stocking.slot_unavailable", "Một hoặc nhiều hộp đã được gán lô hoặc còn cua đang nuôi. Vui lòng tải lại và chọn hộp khác.");
                AddStockingRecords(batch, slots, now);
                // Lưu cả hai mốc trong audit; toàn bộ thao tác vẫn thuộc một transaction.
                batch.Status = "Stocked";
                batch.StockedAt = now;
                batch.UpdatedAt = now;
                await audit.WriteAsync("batch", batch.BatchId, "stocked", new
                {
                    status = "Funding"
                },
                    new
                    {
                        status = "Stocked",
                        stockedAt = now,
                        createdCrabs = slots.Count,
                        slotCodes = slots.Select(s => s.SlotCode)
                    }, now, ct);
                batch.Status = "InProduction";
                await audit.WriteAsync("batch", batch.BatchId, "start_production", new
                {
                    status = "Stocked"
                }, new
                {
                    status = "InProduction"
                }, now, ct);
                return new StockingResponse(batch.BatchCode, slots.Count, batch.Status);
            }, ct, IsolationLevel.Serializable);
        }
        catch (DbUpdateException ex) when (ex.InnerException is SqlException { Number: 2601 or 2627 })
        {
            throw new ConflictException("stocking.slot_conflict", "Hộp vừa được sử dụng bởi yêu cầu khác. Vui lòng tải lại.");
        }
    }

    private async Task<OperatorMember> RequireOwnerAsync(CancellationToken ct)
    {
        var member = await db.OperatorMembers.AsNoTracking()
            .Include(m => m.User)
            .SingleOrDefaultAsync(m => m.UserId == me.UserId, ct);

        if (member is null || member.User.Status != "Active" || member.MemberRole != "Owner" ||
            !await db.AppUserRoles.AnyAsync(r => r.UserId == me.UserId && r.RoleCode == Roles.OperatorMember, ct) ||
            (me.OperatorId is { } claimed && claimed != member.OperatorId))
        {
            throw new ForbiddenException("stocking.owner_required", "Chỉ chủ hộ nuôi được ghi nhận thả giống.");
        }

        return member;
    }

    private async Task<List<PhysicalSlot>> LoadAvailableSlotsAsync(
        Batch batch, StockingRequest request, long operatorId, CancellationToken ct)
    {
        var count = request.Range is { } range
            ? (long)range.To - range.From + 1
            : request.SlotCodes!.Count;

        if (count != batch.SeedQuantity)
        {
            throw new BusinessRuleException("stocking.quantity_mismatch", $"Cần chọn đúng {batch.SeedQuantity} hộp, tương ứng số cua giống của lô.");
        }

        // Chặn khoảng số quá lớn trước khi tạo danh sách mã trong bộ nhớ.
        if (count > await db.PhysicalSlots.CountAsync(s => s.OperatorId == operatorId, ct))
        {
            throw new BusinessRuleException("stocking.slot_not_found", "Hộ nuôi chưa có đủ hộp cho số cua giống của lô.");
        }

        var codes = request.Range is { } selectedRange
            ? Enumerable.Range(0, batch.SeedQuantity)
                .Select(i => ((long)selectedRange.From + i).ToString($"D{selectedRange.Width}", CultureInfo.InvariantCulture))
                .ToArray()
            : request.SlotCodes!.Select(code => code.Trim()).ToArray();

        var slots = await db.PhysicalSlots.AsNoTracking()
            .Where(slot => slot.OperatorId == operatorId && codes.Contains(slot.SlotCode))
            .OrderBy(slot => slot.SlotId)
            .ToListAsync(ct);

        if (slots.Count != codes.Length)
        {
            throw new BusinessRuleException("stocking.slot_not_found", "Một hoặc nhiều hộp không tồn tại trong hộ nuôi của bạn. Kiểm tra số hộp và số chữ số trên nhãn.");
        }

        if (slots.FirstOrDefault(slot => slot.Status != "Available") is { } unavailable)
        {
            throw new BusinessRuleException("stocking.slot_unavailable", $"Hộp {unavailable.SlotCode} đang được sử dụng hoặc bảo trì. Vui lòng chọn lại.");
        }

        return slots;
    }

    private void AddStockingRecords(Batch batch, IEnumerable<PhysicalSlot> slots, DateTimeOffset now)
    {
        foreach (var slot in slots)
        {
            var allocation = new SlotAllocation
            {
                BatchId = batch.BatchId,
                SlotId = slot.SlotId,
                AllocatedAt = now,
                CreatedAt = now
            };
            db.SlotAllocations.Add(allocation);
            db.SlotEvents.Add(new SlotEvent
            {
                SlotAllocation = allocation,
                BatchId = batch.BatchId,
                EventType = "Stocked",
                Quantity = 1,
                Source = "Manual",
                OccurredAt = now,
                ReceivedAt = now
            });

            var crab = new CrabItem
            {
                BatchId = batch.BatchId,
                SlotAllocation = allocation,
                ItemUuid = Guid.NewGuid(),
                Status = "Growing",
                StockedAt = now,
                CreatedAt = now,
                UpdatedAt = now
            };
            crab.CrabItemEvents.Add(new CrabItemEvent
            {
                EventType = "Stocked",
                ActorId = me.UserId,
                OccurredAt = now,
                CreatedAt = now,
                Note = $"Thả vào hộp {slot.SlotCode}"
            });
            db.CrabItems.Add(crab);
        }
    }
}
