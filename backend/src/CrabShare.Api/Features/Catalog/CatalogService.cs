using System.Linq.Expressions;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Common.Paging;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using CrabShare.Api.Infrastructure.Storage;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Catalog;

/// <summary>
/// UC24 Niêm yết sản phẩm. Người nuôi tự đặt và đổi giá (TL-27); hệ thống chỉ ghi lịch sử, so giá với giao dịch
/// tương đồng và gắn cờ. Tồn của niêm yết = tổng cân nặng cua InStock của lô + hạng, không cho nhập tay.
/// </summary>
public sealed class CatalogService(AppDbContext db, ICurrentUser me, IFileStorage files, LowStockMonitor lowStock, TimeProvider clock)
{
    public const long MaxImageBytes = 5 * 1024 * 1024;

    private static readonly Dictionary<string, string> ImageTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        ["image/jpeg"] = ".jpg",
        ["image/png"] = ".png",
        ["image/webp"] = ".webp",
    };

    private static readonly Dictionary<string, string> CrabTypeNames = new()
    {
        ["FatteningMudCrab"] = "Cua thịt",
        ["RoeCrab"] = "Cua gạch",
        ["SoftShellCrab"] = "Cua lột",
    };

    public async Task<IReadOnlyList<ListingResponse>> ListMineAsync(CancellationToken ct)
    {
        var operatorId = me.RequireOperatorId();
        var listings = await WithDetails(db.ProductListings.Where(l => l.Batch.OperatorId == operatorId))
            .OrderByDescending(l => l.UpdatedAt)
            .ToListAsync(ct);
        return listings.Select(l => ToResponse(l, historyLimit: 5)).ToList();
    }

    public async Task<ListingResponse> GetMineAsync(long listingId, CancellationToken ct)
    {
        var operatorId = me.RequireOperatorId();
        var listing = await WithDetails(db.ProductListings.Where(l => l.ListingId == listingId && l.Batch.OperatorId == operatorId))
                          .FirstOrDefaultAsync(ct)
                      ?? throw ListingNotFound();
        return ToResponse(listing, historyLimit: null);
    }

    /// <summary>Các hạng còn tồn của những lô đang thu hoạch — người nuôi chọn từ đây để tạo niêm yết.</summary>
    public async Task<IReadOnlyList<ListingOptionResponse>> ListOptionsAsync(CancellationToken ct)
    {
        var operatorId = me.RequireOperatorId();
        var stock = await db.CrabItems
            .Where(c => c.Batch.OperatorId == operatorId && c.Batch.Status == "Harvesting" && c.Status == "InStock" && c.GradeId != null)
            .GroupBy(c => new { c.BatchId, c.Batch.BatchCode, c.Batch.Title, c.Batch.CrabType, GradeId = c.GradeId!.Value, c.Grade!.GradeCode, c.Grade.GradeName })
            .Select(g => new { g.Key, Count = g.Count(), Grams = g.Sum(c => (int?)c.WeightG) ?? 0 })
            .ToListAsync(ct);

        var existing = await db.ProductListings.Where(l => l.Batch.OperatorId == operatorId)
            .Select(l => new { l.BatchId, l.GradeId, l.ListingId })
            .ToListAsync(ct);

        var harvest = stock
            .OrderBy(s => s.Key.BatchCode).ThenBy(s => s.Key.GradeCode)
            .Select(s => new ListingOptionResponse(
                s.Key.BatchCode, s.Key.Title, s.Key.CrabType, s.Key.GradeCode, s.Key.GradeName, s.Count, ToKg(s.Grams),
                existing.FirstOrDefault(e => e.BatchId == s.Key.BatchId && e.GradeId == s.Key.GradeId)?.ListingId,
                "Harvesting"));

        var growing = await db.Batches.AsNoTracking()
            .Where(b => b.OperatorId == operatorId && b.Status == "InProduction")
            .Select(b => new { b.BatchId, b.BatchCode, b.Title, b.CrabType })
            .ToListAsync(ct);
        var grades = await db.ProductGrades.AsNoTracking()
            .OrderBy(g => g.GradeCode)
            .Select(g => new { g.GradeId, g.GradeCode, g.GradeName })
            .ToListAsync(ct);

        var preorder = growing.SelectMany(b => grades.Select(g => new ListingOptionResponse(
            b.BatchCode, b.Title, b.CrabType, g.GradeCode, g.GradeName, 0, 0,
            existing.FirstOrDefault(e => e.BatchId == b.BatchId && e.GradeId == g.GradeId)?.ListingId,
            "InProduction")));

        return harvest.Concat(preorder).OrderBy(o => o.BatchCode).ThenBy(o => o.GradeCode).ToList();
    }

    public async Task<ListingResponse> CreateAsync(CreateListingRequest req, CancellationToken ct)
    {
        var operatorId = await RequireOwnerAsync(ct);
        var batchCode = req.BatchCode.Trim();
        var batch = await db.Batches.FirstOrDefaultAsync(b => b.BatchCode == batchCode, ct)
                    ?? throw new NotFoundException("batch.not_found", "Không tìm thấy lô.");
        if (batch.OperatorId != operatorId)
            throw new ForbiddenException("batch.not_owner", "Lô này không thuộc hộ nuôi của bạn.");
        if (batch.Status is not ("InProduction" or "Harvesting"))
            throw new BusinessRuleException("listing.batch_not_listable",
                "Chỉ niêm yết được lô đang nuôi (đặt trước) hoặc lô đang thu hoạch.");

        var gradeCode = req.GradeCode.Trim().ToUpperInvariant();
        var grade = await db.ProductGrades.FirstOrDefaultAsync(g => g.GradeCode == gradeCode, ct)
                    ?? throw new NotFoundException("listing.grade_not_found", "Không tìm thấy hạng cua.");
        if (await db.ProductListings.AnyAsync(l => l.BatchId == batch.BatchId && l.GradeId == grade.GradeId, ct))
            throw new ConflictException("listing.grade_listed", "Hạng này của lô đã có niêm yết. Mỗi lô + hạng chỉ có một kiểu bảo quản.");

        var stockKg = batch.Status == "InProduction" ? 0 : await InStockKgAsync(batch.BatchId, grade.GradeId, ct);
        if (batch.Status != "InProduction" && stockKg <= 0)
            throw new BusinessRuleException("listing.no_stock", "Lô chưa có cua hạng này trong kho.");

        var now = clock.GetUtcNow();
        var frozenAt = ResolveFrozenAt(req, batch, now);
        var storage = req.StorageType.ToString();

        var listing = new ProductListing
        {
            BatchId = batch.BatchId,
            GradeId = grade.GradeId,
            Title = string.IsNullOrWhiteSpace(req.Title) ? DefaultTitle(batch, grade, req.StorageType) : req.Title.Trim(),
            StorageType = storage,
            FrozenAt = frozenAt,
            CurrentPricePerKg = req.PricePerKg,
            StockQtyKg = stockKg,
            ReservedQtyKg = 0,
            Status = "Draft",
            CreatedAt = now,
            UpdatedAt = now,
        };
        listing.PriceHistories.Add(await NewRevisionAsync(batch.CrabType, grade, storage, req.PricePerKg, null, "Initial", null, now, ct));

        db.ProductListings.Add(listing);
        await db.SaveChangesAsync(ct);
        return await GetMineAsync(listing.ListingId, ct);
    }

    /// <summary>Tính trước độ lệch của giá định đổi để giao diện cảnh báo trước khi lưu (TL-27 §6.2 bước 2).</summary>
    public async Task<PriceCheckResponse> PreviewPriceAsync(long listingId, long pricePerKg, CancellationToken ct)
    {
        if (pricePerKg <= 0)
            throw new BusinessRuleException("listing.invalid_price", "Giá phải lớn hơn 0.");
        var operatorId = me.RequireOperatorId();
        var listing = await db.ProductListings.Include(l => l.Batch).Include(l => l.Grade)
                          .FirstOrDefaultAsync(l => l.ListingId == listingId && l.Batch.OperatorId == operatorId, ct)
                      ?? throw ListingNotFound();
        var (result, _) = await CheckPriceAsync(listing.Batch.CrabType, listing.Grade, listing.StorageType, pricePerKg, clock.GetUtcNow(), ct);
        return ToCheckResponse(result);
    }

    public async Task<ListingResponse> ChangePriceAsync(long listingId, ChangePriceRequest req, CancellationToken ct)
    {
        var listing = await LoadOwnedForUpdateAsync(listingId, ct);
        if (listing.Status == "Closed")
            throw new BusinessRuleException("listing.closed", "Niêm yết đã ngừng bán, không đổi giá được.");
        if (req.PricePerKg == (long)listing.CurrentPricePerKg)
            throw new BusinessRuleException("listing.same_price", "Giá mới trùng giá hiện tại.");

        var reason = req.Reason!.Value;
        var note = string.IsNullOrWhiteSpace(req.Note) ? null : req.Note.Trim();
        if (reason == PriceChangeReason.Other && note is null)
            throw new BusinessRuleException("listing.note_required", "Chọn lý do Khác thì cần ghi chú.");

        var now = clock.GetUtcNow();
        listing.PriceHistories.Add(await NewRevisionAsync(listing.Batch.CrabType, listing.Grade, listing.StorageType,
            req.PricePerKg, (long)listing.CurrentPricePerKg, reason.ToString(), note, now, ct));
        listing.CurrentPricePerKg = req.PricePerKg;
        listing.UpdatedAt = now;

        await SaveAsync(ct);
        return await GetMineAsync(listingId, ct);
    }

    public async Task<ListingResponse> PublishAsync(long listingId, CancellationToken ct)
    {
        var listing = await LoadOwnedForUpdateAsync(listingId, ct);
        if (listing.Status != "Draft")
            throw new BusinessRuleException("listing.not_draft", "Chỉ đăng bán được niêm yết đang ở bản nháp.");
        if (listing.Batch.Status == "InProduction")
        {
            var publishedAt = clock.GetUtcNow();
            listing.Status = "Published";
            listing.PublishedAt = publishedAt;
            listing.UpdatedAt = publishedAt;
            await SaveAsync(ct);
            return await GetMineAsync(listingId, ct);
        }
        if (listing.Batch.Status != "Harvesting")
            throw new BusinessRuleException("listing.batch_not_harvesting", "Lô không còn ở giai đoạn thu hoạch.");

        var now = clock.GetUtcNow();
        if (SellUntil(listing) is { } until && until <= now)
            throw new BusinessRuleException("listing.frozen_expired", "Hàng cấp đông đã quá trần thời gian bán của lô (TL-23).");

        listing.StockQtyKg = await InStockKgAsync(listing.BatchId, listing.GradeId, ct);
        if (listing.StockQtyKg - listing.ReservedQtyKg <= 0)
            throw new BusinessRuleException("listing.no_stock", "Niêm yết không còn hàng để bán.");

        listing.Status = "Published";
        listing.PublishedAt = now;
        listing.UpdatedAt = now;
        await SaveAsync(ct);
        await lowStock.CheckAsync([listingId], ct);
        return await GetMineAsync(listingId, ct);
    }

    public async Task<ListingResponse> CloseAsync(long listingId, CancellationToken ct)
    {
        var listing = await LoadOwnedForUpdateAsync(listingId, ct);
        if (listing.Status == "Closed")
            throw new BusinessRuleException("listing.closed", "Niêm yết đã ngừng bán.");
        if (listing.ReservedQtyKg > 0)
            throw new BusinessRuleException("listing.has_reservations", "Còn đơn đang giữ hàng của niêm yết này, chưa ngừng bán được.");

        listing.Status = "Closed";
        listing.UpdatedAt = clock.GetUtcNow();
        await SaveAsync(ct);
        return await GetMineAsync(listingId, ct);
    }

    /// <summary>Cập nhật tồn theo số cua InStock hiện có (sau khi cân thêm cua hoặc đóng gói đơn).</summary>
    public async Task<ListingResponse> RefreshStockAsync(long listingId, CancellationToken ct)
    {
        var operatorId = me.RequireOperatorId();
        var listing = await db.ProductListings.Include(l => l.Batch)
                          .FirstOrDefaultAsync(l => l.ListingId == listingId && l.Batch.OperatorId == operatorId, ct)
                      ?? throw ListingNotFound();
        if (listing.Status == "Closed")
            throw new BusinessRuleException("listing.closed", "Niêm yết đã ngừng bán.");

        var stockKg = await InStockKgAsync(listing.BatchId, listing.GradeId, ct);
        if (stockKg < listing.ReservedQtyKg)
            throw new BusinessRuleException("listing.stock_below_reserved", "Tồn trong kho thấp hơn phần đang giữ cho đơn hàng. Kiểm tra lại cua đã đóng gói.");

        listing.StockQtyKg = stockKg;
        var available = stockKg - listing.ReservedQtyKg;
        listing.Status = listing.Status switch
        {
            "Published" when available <= 0 => "SoldOut",
            "SoldOut" when available > 0 => "Published",
            var s => s,
        };
        listing.UpdatedAt = clock.GetUtcNow();
        await SaveAsync(ct);
        await lowStock.CheckAsync([listingId], ct);
        return await GetMineAsync(listingId, ct);
    }

    public async Task<ListingResponse> UploadImageAsync(long listingId, IFormFile file, CancellationToken ct)
    {
        if (file.Length == 0)
            throw new BusinessRuleException("listing.image_empty", "File ảnh trống.");
        if (file.Length > MaxImageBytes)
            throw new BusinessRuleException("listing.image_too_large", "Ảnh tối đa 5 MB.");
        if (!ImageTypes.TryGetValue(file.ContentType, out var extension))
            throw new BusinessRuleException("listing.image_type", "Chỉ nhận ảnh JPG, PNG hoặc WEBP.");

        var listing = await LoadOwnedForUpdateAsync(listingId, ct);
        if (listing.Status == "Closed")
            throw new BusinessRuleException("listing.closed", "Niêm yết đã ngừng bán.");

        await using var stream = file.OpenReadStream();
        var stored = await files.SaveAsync(stream, $"image{extension}", file.ContentType, $"listings/{listingId}", ct);
        listing.ImageUri = stored.Uri;
        listing.ImageSha256 = stored.Sha256;
        listing.UpdatedAt = clock.GetUtcNow();
        await SaveAsync(ct);
        return await GetMineAsync(listingId, ct);
    }

    /// <summary>Ảnh sản phẩm là công khai (thẻ &lt;img&gt; không gửi được token).</summary>
    public async Task<(Stream Content, string ContentType)> OpenImageAsync(long listingId, CancellationToken ct)
    {
        var uri = await db.ProductListings.Where(l => l.ListingId == listingId).Select(l => l.ImageUri).FirstOrDefaultAsync(ct)
                  ?? throw new NotFoundException("listing.image_not_found", "Niêm yết chưa có ảnh.");
        var contentType = ImageTypes.FirstOrDefault(t => uri.EndsWith(t.Value, StringComparison.OrdinalIgnoreCase)).Key ?? "application/octet-stream";
        return (await files.OpenReadAsync(uri, ct), contentType);
    }

    // ---------- cửa hàng (UC25, công khai) ----------

    /// <summary>Danh sách ở cửa hàng: chỉ niêm yết đang bán hoặc hết hàng; còn hàng xếp trước.</summary>
    public async Task<PagedResult<StoreListingResponse>> BrowseAsync(StoreListingQuery q, CancellationToken ct)
    {
        var query = FilterStore(db.ProductListings, q);
        var total = await query.CountAsync(ct);
        var rows = await SortStore(query, q.Sort, db.VBatchCommitmentCaps)
            .Skip((q.Page - 1) * q.PageSize).Take(q.PageSize)
            .Select(ToStoreRow)
            .ToListAsync(ct);
        var stats = await LoadRatingStatsAsync(rows.Select(r => r.ListingId).ToArray(), ct);
        var caps = await LoadCommitmentRemainingAsync(rows.Select(r => r.BatchId).Distinct().ToArray(), ct);
        return new PagedResult<StoreListingResponse>(rows.Select(r => ToStoreResponse(r, stats, caps)).ToList(), q.Page, q.PageSize, total);
    }

    /// <summary>Chi tiết ở cửa hàng: lịch sử giá công khai (TL-27) và một mã tem để mở trang truy xuất lô.</summary>
    public async Task<StoreListingDetailResponse> GetPublicAsync(long listingId, CancellationToken ct)
    {
        var listing = await db.ProductListings
                          .Where(l => l.ListingId == listingId && StoreStatuses.Contains(l.Status) && l.HiddenAt == null)
                          .Include(l => l.Batch).ThenInclude(b => b.Operator)
                          .Include(l => l.Batch).ThenInclude(b => b.Harvests)
                          .Include(l => l.Grade)
                          .Include(l => l.PriceHistories)
                          .AsSplitQuery()
                          .FirstOrDefaultAsync(ct)
                      ?? throw ListingNotFound();

        var tagCode = await db.CrabItems
            .Where(c => c.BatchId == listing.BatchId && c.GradeId == listing.GradeId && c.CrabTag != null && c.CrabTag.Status == "Active")
            .OrderBy(c => c.Status == "InStock" ? 0 : 1).ThenBy(c => c.CrabItemId)
            .Select(c => c.CrabTag!.TagCode)
            .FirstOrDefaultAsync(ct);

        var history = listing.PriceHistories
            .OrderByDescending(h => h.EffectiveFrom).ThenByDescending(h => h.PriceHistoryId)
            .Select(h => new PublicPriceRevisionResponse((long)h.PricePerKg, (long?)h.PreviousPricePerKg, h.ReasonCode, h.EffectiveFrom, h.FlaggedAbnormal))
            .ToList();

        var stats = await LoadRatingStatsAsync([listing.ListingId], ct);
        var caps = await LoadCommitmentRemainingAsync([listing.BatchId], ct);
        var reviews = await LoadListingReviewsAsync(listing.ListingId, ct);
        return new StoreListingDetailResponse(
            ToStoreResponse(ToStoreRowCompiled(listing), stats, caps),
            listing.Batch.Title, listing.FrozenAt, SellUntil(listing), tagCode, history, reviews);
    }

    private static readonly string[] StoreStatuses = ["Published", "SoldOut"];

    public static IQueryable<ProductListing> FilterStore(IQueryable<ProductListing> source, StoreListingQuery q)
    {
        var query = source.Where(l => StoreStatuses.Contains(l.Status) && l.HiddenAt == null);
        if (!string.IsNullOrWhiteSpace(q.CrabType))
        {
            var crabType = q.CrabType.Trim();
            query = query.Where(l => l.Batch.CrabType == crabType);
        }
        if (!string.IsNullOrWhiteSpace(q.Grade))
        {
            var grade = q.Grade.Trim().ToUpperInvariant();
            query = query.Where(l => l.Grade.GradeCode == grade);
        }
        if (q.Storage is { } storage)
        {
            var storageName = storage.ToString();
            query = query.Where(l => l.StorageType == storageName);
        }
        if (!string.IsNullOrWhiteSpace(q.Batch))
        {
            var batchCode = q.Batch.Trim();
            query = query.Where(l => l.Batch.BatchCode == batchCode);
        }
        if (q.MinPrice is { } minPrice)
            query = query.Where(l => l.CurrentPricePerKg >= minPrice);
        if (q.MaxPrice is { } maxPrice)
            query = query.Where(l => l.CurrentPricePerKg <= maxPrice);
        return query;
    }

    public static IQueryable<ProductListing> SortStore(
        IQueryable<ProductListing> query,
        StoreSort sort,
        IQueryable<VBatchCommitmentCap>? commitmentCaps = null)
    {
        var inStockFirst = commitmentCaps is null
            ? query.OrderBy(l =>
                l.Status == "SoldOut"
                || (l.Batch.Status != "InProduction" && l.StockQtyKg - l.ReservedQtyKg <= 0)
                || (l.Batch.Status == "InProduction" && l.Status != "Published"))
            : query.OrderBy(l =>
                l.Status == "SoldOut"
                || (l.Batch.Status != "InProduction" && l.StockQtyKg - l.ReservedQtyKg <= 0)
                || (l.Batch.Status == "InProduction" && (l.Status != "Published"
                    || !commitmentCaps.Any(v => v.BatchId == l.BatchId && v.RemainingKg >= 0.001m))));
        return sort switch
        {
            StoreSort.PriceAsc => inStockFirst.ThenBy(l => l.CurrentPricePerKg).ThenBy(l => l.ListingId),
            StoreSort.PriceDesc => inStockFirst.ThenByDescending(l => l.CurrentPricePerKg).ThenBy(l => l.ListingId),
            _ => inStockFirst.ThenByDescending(l => l.PublishedAt).ThenByDescending(l => l.ListingId),
        };
    }

    private sealed record StoreRow(
        long ListingId, string Title, string Status, string CrabType, string GradeCode, string GradeName,
        short? MinWeightG, short? MaxWeightG, string StorageType, string BatchCode, string FarmName, DateTimeOffset? HarvestedAt,
        decimal PricePerKg, decimal StockQtyKg, decimal ReservedQtyKg, string? ImageUri, string? ImageSha256, DateTimeOffset? PublishedAt,
        long BatchId, string BatchStatus, decimal OfftakeDepositPct, DateOnly? ExpectedHarvestDate);

    private static readonly Expression<Func<ProductListing, StoreRow>> ToStoreRow = l => new StoreRow(
        l.ListingId, l.Title, l.Status, l.Batch.CrabType, l.Grade.GradeCode, l.Grade.GradeName,
        l.Grade.MinWeightG, l.Grade.MaxWeightG, l.StorageType, l.Batch.BatchCode, l.Batch.Operator.LegalName,
        l.Batch.Harvests.Max(h => (DateTimeOffset?)h.HarvestedAt),
        l.CurrentPricePerKg, l.StockQtyKg, l.ReservedQtyKg, l.ImageUri, l.ImageSha256, l.PublishedAt,
        l.BatchId, l.Batch.Status, l.Batch.OfftakeDepositPct, l.Batch.ExpectedHarvestDate);

    private static readonly Func<ProductListing, StoreRow> ToStoreRowCompiled = ToStoreRow.Compile();

    private static StoreListingResponse ToStoreResponse(
        StoreRow r,
        IReadOnlyDictionary<long, (decimal Average, int Count)> stats,
        IReadOnlyDictionary<long, decimal> remainingByBatch)
    {
        var isPreorder = r.Status == "Published" && r.BatchStatus == "InProduction";
        remainingByBatch.TryGetValue(r.BatchId, out var remaining);
        var available = isPreorder ? remaining : Math.Max(0, r.StockQtyKg - r.ReservedQtyKg);
        var inStock = isPreorder ? remaining >= 0.001m : r.Status == "Published" && available > 0;
        var imageUrl = r.ImageUri is null ? null : $"/api/listings/{r.ListingId}/image?v={r.ImageSha256?[..8]}";
        stats.TryGetValue(r.ListingId, out var stat);
        decimal? average = stat.Count == 0 ? null : stat.Average;
        return new StoreListingResponse(
            r.ListingId, r.Title, r.Status, r.CrabType, r.GradeCode, r.GradeName, r.MinWeightG, r.MaxWeightG,
            r.StorageType, r.BatchCode, r.FarmName, r.HarvestedAt, (long)r.PricePerKg, available,
            inStock, imageUrl, r.PublishedAt, average, stat.Count,
            r.BatchStatus, isPreorder,
            isPreorder ? remaining : null,
            isPreorder ? r.OfftakeDepositPct : null,
            isPreorder ? r.ExpectedHarvestDate : null);
    }

    private async Task<Dictionary<long, decimal>> LoadCommitmentRemainingAsync(
        IReadOnlyCollection<long> batchIds, CancellationToken ct)
    {
        if (batchIds.Count == 0) return [];
        return await db.VBatchCommitmentCaps.AsNoTracking()
            .Where(v => batchIds.Contains(v.BatchId))
            .ToDictionaryAsync(v => v.BatchId, v => v.RemainingKg ?? 0, ct);
    }

    private async Task<Dictionary<long, (decimal Average, int Count)>> LoadRatingStatsAsync(
        IReadOnlyCollection<long> listingIds, CancellationToken ct)
    {
        if (listingIds.Count == 0) return [];
        var pairs = await db.OrderLines.AsNoTracking()
            .Where(l => listingIds.Contains(l.ListingId))
            .Join(db.ProductRatings.AsNoTracking(), l => l.OrderId, r => r.OrderId,
                (l, r) => new { l.ListingId, r.RatingId, r.Stars, r.Comment })
            .ToListAsync(ct);
        return pairs
            .DistinctBy(p => (p.ListingId, p.RatingId))
            .GroupBy(p => p.ListingId)
            .ToDictionary(
                g => g.Key,
                g =>
                {
                    var itemStars = g.Select(x => CrabShare.Api.Features.Orders.OrderRatingService.ExtractForListing(x.Stars, x.Comment, x.ListingId).Stars).ToList();
                    return ((decimal)Math.Round(itemStars.Average(s => (decimal)s), 2), itemStars.Count);
                });
    }

    private async Task<IReadOnlyList<ListingReviewResponse>> LoadListingReviewsAsync(long listingId, CancellationToken ct)
    {
        var raw = await db.OrderLines.AsNoTracking()
            .Where(l => l.ListingId == listingId)
            .Join(db.ProductRatings.AsNoTracking(), l => l.OrderId, r => r.OrderId,
                (l, r) => new
                {
                    r.RatingId,
                    l.SalesOrder.OrderNo,
                    BuyerName = l.SalesOrder.RecipientName,
                    r.Stars,
                    r.Comment,
                    r.CreatedAt,
                })
            .OrderByDescending(x => x.CreatedAt)
            .ThenByDescending(x => x.RatingId)
            .ToListAsync(ct);

        return raw
            .DistinctBy(x => x.RatingId)
            .Select(x =>
            {
                var (stars, comment) = CrabShare.Api.Features.Orders.OrderRatingService.ExtractForListing(x.Stars, x.Comment, listingId);
                return new ListingReviewResponse(
                    x.RatingId,
                    x.OrderNo,
                    string.IsNullOrWhiteSpace(x.BuyerName) ? "Khách mua" : x.BuyerName,
                    stars,
                    comment,
                    x.CreatedAt);
            })
            .ToList();
    }

    // ---------- nội bộ ----------

    private static IQueryable<ProductListing> WithDetails(IQueryable<ProductListing> query) => query
        .Include(l => l.Batch).ThenInclude(b => b.Operator)
        .Include(l => l.Batch).ThenInclude(b => b.Harvests)
        .Include(l => l.Grade)
        .Include(l => l.PriceHistories).ThenInclude(h => h.ChangedByNavigation)
        .Include(l => l.PriceHistories).ThenInclude(h => h.PriceCheck)
        .AsSplitQuery();

    private async Task<long> RequireOwnerAsync(CancellationToken ct)
    {
        var operatorId = me.RequireOperatorId();
        var userId = me.UserId;
        var isOwner = await db.OperatorMembers.AnyAsync(m => m.UserId == userId && m.OperatorId == operatorId && m.MemberRole == "Owner", ct);
        if (!isOwner)
            throw new ForbiddenException("listing.owner_only", "Chỉ chủ hộ nuôi mới niêm yết, đổi giá và đăng bán được.");
        return operatorId;
    }

    private async Task<ProductListing> LoadOwnedForUpdateAsync(long listingId, CancellationToken ct)
    {
        var operatorId = await RequireOwnerAsync(ct);
        return await db.ProductListings.Include(l => l.Batch).Include(l => l.Grade)
                   .FirstOrDefaultAsync(l => l.ListingId == listingId && l.Batch.OperatorId == operatorId, ct)
               ?? throw ListingNotFound();
    }

    private async Task SaveAsync(CancellationToken ct)
    {
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException)
        {
            throw new ConflictException("listing.changed", "Niêm yết vừa được cập nhật ở nơi khác. Tải lại rồi thử lại.");
        }
    }

    private async Task<decimal> InStockKgAsync(long batchId, long gradeId, CancellationToken ct)
    {
        var grams = await db.CrabItems
            .Where(c => c.BatchId == batchId && c.GradeId == gradeId && c.Status == "InStock")
            .SumAsync(c => (int?)c.WeightG, ct) ?? 0;
        return ToKg(grams);
    }

    private static decimal ToKg(int grams) => Math.Round(grams / 1000m, 3);

    private static DateTimeOffset? ResolveFrozenAt(CreateListingRequest req, Batch batch, DateTimeOffset now)
    {
        if (req.StorageType == StorageType.Fresh)
        {
            if (req.FrozenAt is not null)
                throw new BusinessRuleException("listing.frozen_at_fresh", "Hàng tươi không có ngày cấp đông.");
            return null;
        }

        var frozenAt = req.FrozenAt ?? now;
        if (frozenAt > now)
            throw new BusinessRuleException("listing.frozen_in_future", "Ngày cấp đông không được ở tương lai.");
        if (frozenAt.AddMonths(batch.FrozenStockCapMonths) <= now)
            throw new BusinessRuleException("listing.frozen_expired", "Hàng cấp đông đã quá trần thời gian bán của lô (TL-23).");
        return frozenAt;
    }

    private static DateTimeOffset? SellUntil(ProductListing l) => SellUntil(l.StorageType, l.FrozenAt, l.Batch.FrozenStockCapMonths);

    internal static DateTimeOffset? SellUntil(string storageType, DateTimeOffset? frozenAt, byte frozenStockCapMonths) =>
        storageType == nameof(StorageType.Frozen) && frozenAt is { } at ? at.AddMonths(frozenStockCapMonths) : null;

    private static string DefaultTitle(Batch batch, ProductGrade grade, StorageType storage)
    {
        var kind = CrabTypeNames.GetValueOrDefault(batch.CrabType, batch.CrabType);
        var state = storage == StorageType.Frozen ? " cấp đông" : "";
        return $"{kind}{state} {grade.GradeName} — lô {batch.BatchCode}";
    }

    private async Task<PriceHistory> NewRevisionAsync(string crabType, ProductGrade grade, string storage, long price, long? previous,
        string reason, string? note, DateTimeOffset now, CancellationToken ct)
    {
        var (result, segment) = await CheckPriceAsync(crabType, grade, storage, price, now, ct);
        return new PriceHistory
        {
            PricePerKg = price,
            PreviousPricePerKg = previous,
            ReasonCode = reason,
            Note = note,
            EffectiveFrom = now,
            ChangedBy = me.UserId,
            FlaggedAbnormal = result.IsFlagged,
            CreatedAt = now,
            PriceCheck = new PriceCheck
            {
                SegmentKey = segment,
                WindowDays = result.WindowDays,
                SampleCount = result.SampleCount,
                OperatorCount = result.OperatorCount,
                HasEnoughData = result.HasEnoughData,
                MedianPricePerKg = result.Median is { } m ? Math.Round(m, 0, MidpointRounding.AwayFromZero) : null,
                MadPerKg = result.Mad is { } mad ? Math.Round(mad, 2) : null,
                Method = result.Method,
                Score = result.Score,
                Threshold = result.Threshold,
                IsFlagged = result.IsFlagged,
                AlgorithmVersion = PriceAnomaly.AlgorithmVersion,
                CreatedAt = now,
            },
        };
    }

    /// <summary>Tập so sánh: dòng hàng của đơn Completed, cùng loại cua + hạng + kiểu bảo quản, trong 90 ngày gần nhất.</summary>
    private async Task<(PriceAnomaly.Result Result, string Segment)> CheckPriceAsync(string crabType, ProductGrade grade, string storage,
        long price, DateTimeOffset now, CancellationToken ct)
    {
        var since = now.AddDays(-PriceAnomaly.LongWindowDays);
        var gradeId = grade.GradeId;
        var rows = await db.OrderLines
            .Where(ol => ol.SalesOrder.Status == "Completed"
                         && ol.ProductListing.GradeId == gradeId
                         && ol.ProductListing.StorageType == storage
                         && ol.Batch.CrabType == crabType
                         && (ol.SalesOrder.CompletedAt ?? ol.SalesOrder.PlacedAt) > since)
            .Select(ol => new { ol.UnitPrice, ol.Batch.OperatorId, At = ol.SalesOrder.CompletedAt ?? ol.SalesOrder.PlacedAt })
            .ToListAsync(ct);

        var samples = rows.Select(r => new PriceAnomaly.Sample((long)r.UnitPrice, r.OperatorId, r.At)).ToList();
        return (PriceAnomaly.Evaluate(price, samples, now), $"{crabType}|{grade.GradeCode}|{storage}");
    }

    private static NotFoundException ListingNotFound() => new("listing.not_found", "Không tìm thấy niêm yết.");

    private static PriceCheckResponse ToCheckResponse(PriceAnomaly.Result r) => new(
        r.HasEnoughData, r.IsFlagged, r.SampleCount, r.OperatorCount, r.WindowDays,
        r.Median is { } m ? (long)Math.Round(m, 0, MidpointRounding.AwayFromZero) : null,
        r.Score, r.Threshold, r.Method, PriceAnomaly.AlgorithmVersion);

    internal static PriceCheckResponse ToCheckResponse(PriceCheck c) => new(
        c.HasEnoughData, c.IsFlagged, c.SampleCount, c.OperatorCount, c.WindowDays,
        c.MedianPricePerKg is { } m ? (long)m : null, c.Score, c.Threshold, c.Method, c.AlgorithmVersion);

    internal static string? ImageUrl(ProductListing l) =>
        l.ImageUri is null ? null : $"/api/listings/{l.ListingId}/image?v={l.ImageSha256?[..8]}";

    private static ListingResponse ToResponse(ProductListing l, int? historyLimit)
    {
        var history = l.PriceHistories
            .OrderByDescending(h => h.EffectiveFrom).ThenByDescending(h => h.PriceHistoryId)
            .Take(historyLimit ?? int.MaxValue)
            .Select(h => new PriceRevisionResponse(
                h.PriceHistoryId, (long)h.PricePerKg, (long?)h.PreviousPricePerKg, h.ReasonCode, h.Note, h.EffectiveFrom,
                h.ChangedByNavigation.FullName, h.FlaggedAbnormal, h.PriceCheck is null ? null : ToCheckResponse(h.PriceCheck)))
            .ToList();

        return new ListingResponse(
            l.ListingId, l.Title, l.Status,
            l.Batch.BatchCode, l.Batch.Title, l.Batch.CrabType, l.Batch.Operator.LegalName,
            l.Grade.GradeCode, l.Grade.GradeName, l.Grade.MinWeightG, l.Grade.MaxWeightG,
            l.StorageType, l.FrozenAt, SellUntil(l),
            l.Batch.Harvests.Count == 0 ? null : l.Batch.Harvests.Max(h => h.HarvestedAt),
            (long)l.CurrentPricePerKg, l.StockQtyKg, l.ReservedQtyKg, l.StockQtyKg - l.ReservedQtyKg,
            ImageUrl(l), l.PublishedAt, l.UpdatedAt, l.HiddenAt, l.HiddenReason, history);
    }
}
