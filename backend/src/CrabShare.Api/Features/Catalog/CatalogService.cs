using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using CrabShare.Api.Infrastructure.Storage;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Catalog;

/// <summary>
/// UC24 Niêm yết sản phẩm. Người nuôi tự đặt và đổi giá (TL-27); hệ thống chỉ ghi lịch sử, so giá với giao dịch
/// tương đồng và gắn cờ. Tồn của niêm yết = tổng cân nặng cua InStock của lô + hạng, không cho nhập tay.
/// </summary>
public sealed class CatalogService(AppDbContext db, ICurrentUser me, IFileStorage files, TimeProvider clock)
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

        return stock
            .OrderBy(s => s.Key.BatchCode).ThenBy(s => s.Key.GradeCode)
            .Select(s => new ListingOptionResponse(
                s.Key.BatchCode, s.Key.Title, s.Key.CrabType, s.Key.GradeCode, s.Key.GradeName, s.Count, ToKg(s.Grams),
                existing.FirstOrDefault(e => e.BatchId == s.Key.BatchId && e.GradeId == s.Key.GradeId)?.ListingId))
            .ToList();
    }

    public async Task<ListingResponse> CreateAsync(CreateListingRequest req, CancellationToken ct)
    {
        var operatorId = await RequireOwnerAsync(ct);
        var batchCode = req.BatchCode.Trim();
        var batch = await db.Batches.FirstOrDefaultAsync(b => b.BatchCode == batchCode, ct)
                    ?? throw new NotFoundException("batch.not_found", "Không tìm thấy lô.");
        if (batch.OperatorId != operatorId)
            throw new ForbiddenException("batch.not_owner", "Lô này không thuộc hộ nuôi của bạn.");
        if (batch.Status != "Harvesting")
            throw new BusinessRuleException("listing.batch_not_harvesting", "Chỉ niêm yết được lô đang thu hoạch.");

        var gradeCode = req.GradeCode.Trim().ToUpperInvariant();
        var grade = await db.ProductGrades.FirstOrDefaultAsync(g => g.GradeCode == gradeCode, ct)
                    ?? throw new NotFoundException("listing.grade_not_found", "Không tìm thấy hạng cua.");
        if (await db.ProductListings.AnyAsync(l => l.BatchId == batch.BatchId && l.GradeId == grade.GradeId, ct))
            throw new ConflictException("listing.grade_listed", "Hạng này của lô đã có niêm yết. Mỗi lô + hạng chỉ có một kiểu bảo quản.");

        var stockKg = await InStockKgAsync(batch.BatchId, grade.GradeId, ct);
        if (stockKg <= 0)
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

    private static DateTimeOffset? SellUntil(ProductListing l) =>
        l.StorageType == nameof(StorageType.Frozen) && l.FrozenAt is { } frozenAt ? frozenAt.AddMonths(l.Batch.FrozenStockCapMonths) : null;

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

    private static PriceCheckResponse ToCheckResponse(PriceCheck c) => new(
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
            ImageUrl(l), l.PublishedAt, l.UpdatedAt, history);
    }
}
