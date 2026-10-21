using System.Data;
using System.Globalization;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Common.Paging;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;

namespace CrabShare.Api.Features.Boxes;

public sealed class BoxService(AppDbContext db, ICurrentUser me, TimeProvider clock)
{
    private async Task<OperatorMember> MemberAsync(bool write, CancellationToken ct)
    {
        var userId = me.UserId;
        var member = await db.OperatorMembers.AsNoTracking().Include(m => m.User)
            .SingleOrDefaultAsync(m => m.UserId == userId, ct);
        if (member is null || member.User.Status != "Active" || member.MemberRole is not ("Owner" or "Staff") ||
            !await db.AppUserRoles.AnyAsync(r => r.UserId == userId && r.RoleCode == Roles.OperatorMember, ct) ||
            (me.OperatorId is { } claimed && claimed != member.OperatorId))
            throw new ForbiddenException("box.access_denied", "Bạn không có quyền truy cập hộ nuôi này.");
        if (write && member.MemberRole != "Owner")
            throw new ForbiddenException("box.owner_required", "Chỉ chủ hộ nuôi được quản lý hộp.");
        return member;
    }

    public async Task<PagedResult<BoxResponse>> ListAsync(BoxListQuery query, PageQuery paging, CancellationToken ct)
    {
        var member = await MemberAsync(false, ct);
        var boxes = db.PhysicalSlots.AsNoTracking().Where(b => b.OperatorId == member.OperatorId);
        if (!string.IsNullOrEmpty(query.Status)) boxes = boxes.Where(b => b.Status == query.Status);
        if (!string.IsNullOrWhiteSpace(query.BatchCode))
        {
            var batchCode = query.BatchCode.Trim();
            boxes = boxes.Where(b => db.SlotAllocations.Any(a => a.SlotId == b.SlotId && a.ReleasedAt == null && a.Batch.BatchCode == batchCode
                && (a.Batch.Status == "InProduction" || a.Batch.Status == "Stocked" || a.Batch.Status == "Harvesting")));
        }
        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            var search = query.Search.Trim();
            boxes = boxes.Where(b => b.SlotCode.Contains(search));
        }
        var assigned = boxes.Select(b => new
        {
            Slot = b,
            Allocation = db.SlotAllocations.Where(a => a.SlotId == b.SlotId && a.ReleasedAt == null
                && (a.Batch.Status == "InProduction" || a.Batch.Status == "Stocked" || a.Batch.Status == "Harvesting"))
                .OrderByDescending(a => a.AllocatedAt)
                .Select(a => new { a.BatchId, a.Batch.BatchCode, a.AllocatedAt }).FirstOrDefault(),
        });
        return await assigned.OrderBy(b => b.Slot.SlotCode).Select(b => new BoxResponse(b.Slot.SlotCode, b.Slot.Status,
            b.Slot.RowCode, b.Slot.RackNo, b.Slot.TierNo, b.Slot.ColumnNo,
            b.Allocation == null ? null : b.Allocation.BatchCode,
            b.Allocation == null ? null : db.Evidences.Where(e => e.SlotId == b.Slot.SlotId
                && e.BatchId == b.Allocation.BatchId && e.ReceivedAt >= b.Allocation.AllocatedAt
                && e.MediaType == "Photo" && e.Source == "InAppCapture")
                .OrderByDescending(e => e.ReceivedAt).ThenByDescending(e => e.EvidenceId)
                .Select(e => new BoxEvidenceResponse(e.EvidenceId, e.ReceivedAt, e.ReviewStatus)).FirstOrDefault())).ToPagedAsync(paging, ct);
    }

    // All creators take the same parent-row lock before counting: concurrent ranges/singles serialize per farm.
    private Task<T> WriteAsync<T>(Func<Operator, Task<T>> action, CancellationToken ct)
        => db.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
        {
            await using var transaction = await db.Database.BeginTransactionAsync(ct);
            var member = await MemberAsync(true, ct);
            var farm = await db.Operators.FromSqlInterpolated($"SELECT * FROM dbo.operator WITH (UPDLOCK, HOLDLOCK) WHERE operator_id = {member.OperatorId}")
                .AsNoTracking().SingleAsync(ct);
            if (farm.Status != "Approved")
                throw new BusinessRuleException("box.operator_not_approved", "Hộ nuôi cần được duyệt trước khi quản lý hộp.");
            var result = await action(farm);
            await transaction.CommitAsync(ct);
            return result;
        });

    private async Task CapacityAsync(Operator farm, long added, CancellationToken ct)
    {
        var count = await db.PhysicalSlots.CountAsync(b => b.OperatorId == farm.OperatorId, ct);
        if (count + added > farm.ApprovedSlotCapacity)
            throw new BusinessRuleException("box.over_capacity", "Tổng số hộp vượt sức chứa đã được duyệt.");
    }

    public Task<BoxRangeResponse> CreateRangeAsync(BoxRangeRequest request, CancellationToken ct)
        => WriteAsync(async farm =>
        {
            var count = (long)request.To - request.From + 1;
            await CapacityAsync(farm, count, ct);
            var existing = await db.PhysicalSlots.Where(b => b.OperatorId == farm.OperatorId).Select(b => b.SlotCode).ToListAsync(ct);
            var codes = new HashSet<string>(existing, StringComparer.OrdinalIgnoreCase);
            var now = clock.GetUtcNow();
            using var table = new DataTable();
            table.Columns.Add("operator_id", typeof(long));
            table.Columns.Add("slot_code", typeof(string));
            table.Columns.Add("status", typeof(string));
            table.Columns.Add("created_at", typeof(DateTimeOffset));
            table.Columns.Add("updated_at", typeof(DateTimeOffset));
            string Code(long value) => value.ToString($"D{request.Width}", CultureInfo.InvariantCulture);
            for (long value = request.From; value <= request.To; value++)
            {
                var code = Code(value);
                if (!codes.Add(code)) throw new ConflictException("box.duplicate", $"Hộp {code} đã tồn tại.");
                table.Rows.Add(farm.OperatorId, code, "Available", now, now);
            }
            // One bulk command; check constraints remains enabled for the existing schema.
            using var bulk = new SqlBulkCopy((SqlConnection)db.Database.GetDbConnection(), SqlBulkCopyOptions.CheckConstraints,
                (SqlTransaction)db.Database.CurrentTransaction!.GetDbTransaction()) { DestinationTableName = "dbo.physical_slot" };
            foreach (DataColumn column in table.Columns) bulk.ColumnMappings.Add(column.ColumnName, column.ColumnName);
            await bulk.WriteToServerAsync(table, ct);
            return new BoxRangeResponse((int)count, Code(request.From), Code(request.To));
        }, ct);

    public Task<BoxResponse> CreateAsync(CreateBoxRequest request, CancellationToken ct)
        => WriteAsync(async farm =>
        {
            var code = request.SlotCode.Trim();
            if (await db.PhysicalSlots.AnyAsync(b => b.OperatorId == farm.OperatorId && b.SlotCode == code, ct))
                throw new ConflictException("box.duplicate", "Số hộp đã tồn tại.");
            await CapacityAsync(farm, 1, ct);
            var now = clock.GetUtcNow();
            // Parameterized SQL also keeps execution-strategy retries free of tracked pending inserts.
            await db.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO dbo.physical_slot (operator_id, slot_code, row_code, rack_no, tier_no, column_no, status, created_at, updated_at) VALUES ({farm.OperatorId}, {code}, {request.RowCode}, {request.RackNo}, {request.TierNo}, {request.ColumnNo}, 'Available', {now}, {now})", ct);
            return new BoxResponse(code, "Available", request.RowCode, request.RackNo, request.TierNo, request.ColumnNo);
        }, ct);

    public Task<BoxResponse> UpdateAsync(string slotCode, UpdateBoxRequest request, CancellationToken ct)
        => WriteAsync(async farm =>
        {
            var box = await db.PhysicalSlots.AsNoTracking().SingleOrDefaultAsync(b => b.OperatorId == farm.OperatorId && b.SlotCode == slotCode, ct)
                ?? throw new NotFoundException("box.not_found", "Không tìm thấy hộp nuôi.");
            var changed = await db.PhysicalSlots.Where(b => b.SlotId == box.SlotId &&
                    (b.Status == "Available" || b.Status == "Maintenance") &&
                    !db.SlotAllocations.Any(a => a.SlotId == b.SlotId && a.ReleasedAt == null))
                .ExecuteUpdateAsync(s => s.SetProperty(b => b.Status, request.Status).SetProperty(b => b.UpdatedAt, clock.GetUtcNow()), ct);
            if (changed == 0) throw new BusinessRuleException("box.in_use", "Hộp đang nuôi không thể đổi trạng thái bảo trì.");
            return new BoxResponse(box.SlotCode, request.Status, box.RowCode, box.RackNo, box.TierNo, box.ColumnNo);
        }, ct);
}
