using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Common.Paging;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Catalog;

/// <summary>
/// UC24 phía quản trị: người nuôi đăng thẳng không chờ duyệt (TL-27), quản trị xem các niêm yết có giá bị gắn cờ
/// và ẩn niêm yết vi phạm. Ẩn không đổi status; cửa hàng và checkout bỏ qua mọi niêm yết có hidden_at.
/// </summary>
public sealed class ListingModerationService(AppDbContext db, ICurrentUser me, TimeProvider clock)
{
    public async Task<PagedResult<AdminListingResponse>> ListAsync(AdminListingQuery filter, PageQuery paging, CancellationToken ct)
    {
        await RequireAdminAsync(ct);
        var query = Filter(db.ProductListings.AsNoTracking(), filter);
        var total = await query.CountAsync(ct);
        var listings = await WithDetails(query
                .OrderByDescending(l => l.PriceHistories.Max(h => (DateTimeOffset?)h.EffectiveFrom))
                .ThenByDescending(l => l.ListingId)
                .Skip((paging.Page - 1) * paging.PageSize).Take(paging.PageSize))
            .ToListAsync(ct);
        return new PagedResult<AdminListingResponse>(listings.Select(ToResponse).ToList(), paging.Page, paging.PageSize, total);
    }

    public async Task<AdminListingResponse> HideAsync(long listingId, HideListingRequest req, CancellationToken ct)
    {
        await RequireAdminAsync(ct);
        var reason = req.Reason.Trim();
        if (reason.Length == 0)
            throw new BusinessRuleException("listing.hide_reason_required", "Vui lòng nhập lý do ẩn niêm yết.");

        var now = clock.GetUtcNow();
        var userId = me.UserId;
        var affected = await db.ProductListings
            .Where(l => l.ListingId == listingId && l.HiddenAt == null)
            .ExecuteUpdateAsync(s => s
                .SetProperty(l => l.HiddenAt, now)
                .SetProperty(l => l.HiddenBy, userId)
                .SetProperty(l => l.HiddenReason, reason)
                .SetProperty(l => l.UpdatedAt, now), ct);
        if (affected == 0)
        {
            if (await db.ProductListings.AnyAsync(l => l.ListingId == listingId, ct))
                throw new ConflictException("listing.already_hidden", "Niêm yết này đã bị ẩn.");
            throw new NotFoundException("listing.not_found", "Không tìm thấy niêm yết.");
        }

        var listing = await WithDetails(db.ProductListings.AsNoTracking().Where(l => l.ListingId == listingId)).SingleAsync(ct);
        return ToResponse(listing);
    }

    public static IQueryable<ProductListing> Filter(IQueryable<ProductListing> source, AdminListingQuery filter)
    {
        var query = source;
        if (filter.Status is not null)
            query = query.Where(l => l.Status == filter.Status);
        if (filter.Hidden is { } hidden)
            query = hidden ? query.Where(l => l.HiddenAt != null) : query.Where(l => l.HiddenAt == null);
        if (filter.Flagged is { } flagged)
            query = query.Where(l => l.PriceHistories
                .OrderByDescending(h => h.EffectiveFrom).ThenByDescending(h => h.PriceHistoryId)
                .Select(h => h.FlaggedAbnormal)
                .FirstOrDefault() == flagged);
        return query;
    }

    private static IQueryable<ProductListing> WithDetails(IQueryable<ProductListing> query) => query
        .Include(l => l.Batch).ThenInclude(b => b.Operator)
        .Include(l => l.Grade)
        .Include(l => l.HiddenByNavigation)
        .Include(l => l.PriceHistories.OrderByDescending(h => h.EffectiveFrom).ThenByDescending(h => h.PriceHistoryId).Take(1))
            .ThenInclude(h => h.ChangedByNavigation)
        .Include(l => l.PriceHistories).ThenInclude(h => h.PriceCheck)
        .AsSplitQuery();

    private static AdminListingResponse ToResponse(ProductListing l)
    {
        var latest = l.PriceHistories.MaxBy(h => (h.EffectiveFrom, h.PriceHistoryId));
        return new AdminListingResponse(
            l.ListingId, l.Title, l.Status, l.Batch.BatchCode, l.Batch.Operator.LegalName, l.Batch.CrabType,
            l.Grade.GradeCode, l.Grade.GradeName, l.StorageType, (long)l.CurrentPricePerKg, l.StockQtyKg - l.ReservedQtyKg,
            CatalogService.ImageUrl(l), l.PublishedAt,
            latest is null ? null : new PriceRevisionResponse(
                latest.PriceHistoryId, (long)latest.PricePerKg, (long?)latest.PreviousPricePerKg, latest.ReasonCode, latest.Note,
                latest.EffectiveFrom, latest.ChangedByNavigation.FullName, latest.FlaggedAbnormal,
                latest.PriceCheck is null ? null : CatalogService.ToCheckResponse(latest.PriceCheck)),
            l.HiddenAt, l.HiddenByNavigation?.FullName, l.HiddenReason);
    }

    private async Task RequireAdminAsync(CancellationToken ct)
    {
        var userId = me.UserId;
        if (!await db.AppUsers.AnyAsync(u => u.UserId == userId && u.Status == "Active" &&
                u.AppUserRoles.Any(r => r.RoleCode == Roles.PlatformAdmin), ct))
            throw new ForbiddenException("listing.admin_required", "Chỉ quản trị viên đang có quyền mới được kiểm duyệt niêm yết.");
    }
}
