using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Features.Catalog;
using CrabShare.Api.Features.Payments;
using CrabShare.Api.Infrastructure.Payments;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace CrabShare.Api.Features.Orders;

/// <summary>
/// UC26 Đặt hàng. Giữ chỗ tồn kho có hạn, tồn gốc không bị trừ (TL-28 phương án 3.3, BR-13); mỗi lô một đơn với mã
/// VietQR riêng trỏ về tài khoản chuyên dùng của lô (TL-29, BR-67). Lớp an toàn là câu UPDATE có điều kiện cộng với
/// CHECK ck_listing_reserved (reserved ≤ stock) ở CSDL, nên checkout đồng thời không thể bán vượt.
/// Cùng khuôn với giữ chỗ góp vốn (BR-12, TL-17): sửa một chỗ thì xem lại chỗ kia.
/// </summary>
public sealed class OrderService(
    AppDbContext db, ICurrentUser me, PaymentRequestService payments, LowStockMonitor lowStock, IOptions<OrderOptions> options,
    TimeProvider clock)
{
    private const int MaxOrderNoAttempts = 3;
    private const int ShippingAddressMaxLength = 300;

    public sealed record ReservedLine(long ListingId, long BatchId, decimal QuantityKg, long UnitPrice, long PriceHistoryId);

    private sealed record ListingInfo(long ListingId, string Title, long BatchId, string BatchCode, string FarmName,
        long BatchAccountId, string BatchAccountNo);

    /// <summary>
    /// Cả giỏ là một transaction: một dòng thiếu hàng thì không dòng nào được giữ và không đơn nào được tạo.
    /// Đơn, dòng hàng, giữ chỗ và yêu cầu thu tiền cùng được ghi hoặc cùng không (NFR Transactional integrity).
    /// </summary>
    public async Task<CheckoutResponse> CheckoutAsync(CheckoutRequest req, CancellationToken ct)
    {
        var customerId = me.UserId;
        var lines = NormalizeLines(req.Lines.Select(l => (l.ListingId, l.QuantityKg)));
        var address = await db.CustomerAddresses.AsNoTracking()
                          .FirstOrDefaultAsync(a => a.AddressId == req.AddressId && a.CustomerId == customerId, ct)
                      ?? throw new NotFoundException("order.address_not_found", "Không tìm thấy địa chỉ giao hàng của bạn.");
        var listings = await LoadSellableAsync(lines, ct);

        for (var attempt = 1; ; attempt++)
        {
            try
            {
                var placed = await PlaceAsync(customerId, address, lines, listings, ct);
                await lowStock.CheckAsync(lines.Select(l => l.ListingId), ct);
                return placed;
            }
            catch (DbUpdateException ex) when (attempt < MaxOrderNoAttempts && IsDuplicateOrderNo(ex))
            {
                // Trùng mã đơn ngẫu nhiên: transaction đã rollback cả phần giữ tồn, sinh mã mới rồi đặt lại.
            }
        }
    }

    /// <summary>Gộp dòng trùng niêm yết, sắp theo listingId để mọi checkout khoá dòng cùng thứ tự (tránh deadlock).</summary>
    public static IReadOnlyList<(long ListingId, decimal QuantityKg)> NormalizeLines(IEnumerable<(long ListingId, decimal QuantityKg)> lines)
    {
        var merged = new SortedDictionary<long, decimal>();
        foreach (var (listingId, quantityKg) in lines)
        {
            if (quantityKg <= 0)
                throw new BusinessRuleException("order.invalid_quantity", "Số kg phải lớn hơn 0.");
            if (decimal.Round(quantityKg, 3) != quantityKg)
                throw new BusinessRuleException("order.invalid_quantity", "Số kg tối đa 3 chữ số thập phân.");
            merged[listingId] = merged.GetValueOrDefault(listingId) + quantityKg;
        }
        if (merged.Count == 0)
            throw new BusinessRuleException("order.empty_cart", "Giỏ hàng trống.");
        return merged.Select(kv => (kv.Key, kv.Value)).ToList();
    }

    /// <summary>Mỗi lô một đơn (BR-67): một khoản tiền chỉ vào được tài khoản chuyên dùng của đúng một lô.</summary>
    public static IReadOnlyList<IReadOnlyList<ReservedLine>> SplitByBatch(IEnumerable<ReservedLine> lines) =>
        lines.GroupBy(l => l.BatchId)
            .OrderBy(g => g.Key)
            .Select(g => (IReadOnlyList<ReservedLine>)g.OrderBy(l => l.ListingId).ToList())
            .ToList();

    public static long LineAmount(decimal quantityKg, long unitPrice) =>
        (long)Math.Round(quantityKg * unitPrice, 0, MidpointRounding.AwayFromZero);

    private async Task<IReadOnlyDictionary<long, ListingInfo>> LoadSellableAsync(
        IReadOnlyList<(long ListingId, decimal QuantityKg)> lines, CancellationToken ct)
    {
        var ids = lines.Select(l => l.ListingId).ToList();
        var rows = await db.ProductListings.AsNoTracking()
            .Where(l => ids.Contains(l.ListingId))
            .Select(l => new
            {
                l.ListingId, l.Title, l.Status, Hidden = l.HiddenAt != null, l.StorageType, l.FrozenAt, l.BatchId,
                l.Batch.BatchCode, BatchStatus = l.Batch.Status, l.Batch.FrozenStockCapMonths,
                FarmName = l.Batch.Operator.LegalName,
                AccountId = (long?)l.Batch.BatchAccount!.BatchAccountId,
                AccountNo = l.Batch.BatchAccount!.ProviderAccountNo,
                AccountStatus = l.Batch.BatchAccount!.Status,
            })
            .ToListAsync(ct);

        var now = clock.GetUtcNow();
        var result = new Dictionary<long, ListingInfo>();
        foreach (var id in ids)
        {
            var l = rows.FirstOrDefault(r => r.ListingId == id)
                    ?? throw new NotFoundException("listing.not_found", "Không tìm thấy niêm yết.");
            if (l.Status != "Published" || l.Hidden)
                throw new BusinessRuleException("order.listing_not_on_sale", $"\"{l.Title}\" không còn đăng bán.");
            if (l.BatchStatus != "Harvesting")
                throw new BusinessRuleException("order.batch_not_harvesting", $"Lô {l.BatchCode} không còn ở giai đoạn bán hàng.");
            if (CatalogService.SellUntil(l.StorageType, l.FrozenAt, l.FrozenStockCapMonths) is { } until && until <= now)
                throw new BusinessRuleException("listing.frozen_expired", $"\"{l.Title}\" đã quá trần thời gian bán hàng cấp đông (TL-23).");
            if (l.AccountId is not { } accountId || l.AccountStatus != "Open")
                throw new BusinessRuleException("order.batch_account_unavailable", $"Lô {l.BatchCode} chưa có tài khoản chuyên dùng để nhận tiền.");
            result[id] = new ListingInfo(l.ListingId, l.Title, l.BatchId, l.BatchCode, l.FarmName, accountId, l.AccountNo);
        }
        return result;
    }

    private Task<CheckoutResponse> PlaceAsync(long customerId, CustomerAddress address,
        IReadOnlyList<(long ListingId, decimal QuantityKg)> lines, IReadOnlyDictionary<long, ListingInfo> listings, CancellationToken ct)
        => db.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
        {
            db.ChangeTracker.Clear();
            await using var tx = await db.Database.BeginTransactionAsync(ct);

            // Không đổi updated_at: đó là concurrency token của việc đổi giá, đổi ở đây thì người nuôi bị báo xung đột oan.
            foreach (var (listingId, quantityKg) in lines)
            {
                var affected = await db.ProductListings
                    .Where(l => l.ListingId == listingId && l.Status == "Published" && l.HiddenAt == null
                                && l.StockQtyKg - l.ReservedQtyKg >= quantityKg)
                    .ExecuteUpdateAsync(s => s.SetProperty(l => l.ReservedQtyKg, l => l.ReservedQtyKg + quantityKg), ct);
                if (affected == 0)
                    throw new ConflictException("order.insufficient_stock",
                        $"\"{listings[listingId].Title}\" không còn đủ {quantityKg:0.###} kg. Giỏ hàng chưa được đặt.");
            }

            // Chụp phiên bản giá đang hiệu lực (TL-27 §6.1) khi dòng niêm yết đang bị khoá bởi câu UPDATE trên:
            // đổi giá phải sửa chính dòng này nên không chen được vào giữa, bản ghi mới nhất là giá đang bán.
            var revisions = new Dictionary<long, (long Id, long Price)>();
            foreach (var (listingId, _) in lines)
            {
                var revision = await db.PriceHistories.AsNoTracking()
                    .Where(h => h.ListingId == listingId)
                    .OrderByDescending(h => h.EffectiveFrom).ThenByDescending(h => h.PriceHistoryId)
                    .Select(h => new { h.PriceHistoryId, h.PricePerKg })
                    .FirstOrDefaultAsync(ct)
                    ?? throw new InvalidOperationException($"Niêm yết {listingId} không có lịch sử giá.");
                revisions[listingId] = (revision.PriceHistoryId, (long)revision.PricePerKg);
            }

            var now = clock.GetUtcNow();
            var expiresAt = now.AddMinutes(options.Value.ReservationMinutes);
            var reserved = lines.Select(l => new ReservedLine(l.ListingId, listings[l.ListingId].BatchId, l.QuantityKg,
                revisions[l.ListingId].Price, revisions[l.ListingId].Id));

            var placed = new List<(SalesOrder Order, ListingInfo Batch, VietQrPayment Qr)>();
            foreach (var group in SplitByBatch(reserved))
            {
                var batch = listings[group[0].ListingId];
                var order = NewOrder(customerId, batch.BatchId, address, group, now, expiresAt);
                if (order.TotalAmount <= 0)
                    throw new BusinessRuleException("order.amount_too_small", $"Giá trị đơn của lô {batch.BatchCode} phải lớn hơn 0 đồng.");
                db.SalesOrders.Add(order);
                var qr = await payments.CreateForOrderAsync(order, batch.BatchAccountId, batch.BatchAccountNo,
                    order.TotalAmount, order.OrderNo, expiresAt, ct);
                placed.Add((order, batch, qr));
            }

            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
            return new CheckoutResponse(placed.Select(p => ToResponse(p.Order, p.Batch, p.Qr, listings, expiresAt)).ToList());
        });

    private static SalesOrder NewOrder(long customerId, long batchId, CustomerAddress address,
        IReadOnlyList<ReservedLine> lines, DateTimeOffset now, DateTimeOffset expiresAt)
    {
        var shipping = $"{address.AddressLine}, {address.Province}";
        var order = new SalesOrder
        {
            OrderNo = OrderNumber.New(),
            CustomerId = customerId,
            BatchId = batchId,
            OrderType = "Retail",
            Status = "PendingPayment",
            TotalAmount = lines.Sum(l => LineAmount(l.QuantityKg, l.UnitPrice)),
            RecipientName = address.RecipientName,
            RecipientPhone = address.RecipientPhone,
            ShippingAddress = shipping.Length > ShippingAddressMaxLength ? shipping[..ShippingAddressMaxLength] : shipping,
            PlacedAt = now,
            CreatedAt = now,
            UpdatedAt = now,
        };
        foreach (var line in lines)
        {
            order.OrderLines.Add(new OrderLine
            {
                BatchId = batchId,
                ListingId = line.ListingId,
                QuantityKg = line.QuantityKg,
                UnitPrice = line.UnitPrice,
                PriceHistoryId = line.PriceHistoryId,
                CreatedAt = now,
                StockReservation = new StockReservation
                {
                    ListingId = line.ListingId,
                    QuantityKg = line.QuantityKg,
                    ExpiresAt = expiresAt,
                    Status = "Active",
                    CreatedAt = now,
                    UpdatedAt = now,
                },
            });
        }
        return order;
    }

    private static CheckoutOrderResponse ToResponse(SalesOrder order, ListingInfo batch, VietQrPayment qr,
        IReadOnlyDictionary<long, ListingInfo> listings, DateTimeOffset expiresAt) => new(
        order.OrderNo, batch.BatchCode, batch.FarmName, order.Status, (long)order.TotalAmount, expiresAt,
        order.OrderLines.Select(l => new CheckoutLineResponse(
            l.ListingId, listings[l.ListingId].Title, l.QuantityKg, (long)l.UnitPrice, LineAmount(l.QuantityKg, (long)l.UnitPrice))).ToList(),
        new OrderPaymentResponse(qr.ReferenceCode, batch.BatchAccountNo, (long)qr.Amount, qr.QrContent, qr.ExpiresAt));

    private static bool IsDuplicateOrderNo(DbUpdateException ex) =>
        ex.InnerException is SqlException { Number: 2627 or 2601 } sql
        && (sql.Message.Contains("uq_sales_order_order_no") || sql.Message.Contains("uq_payment_request_reference_code"));
}
