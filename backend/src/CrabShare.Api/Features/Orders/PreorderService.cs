using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Features.Payments;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace CrabShare.Api.Features.Orders;

/// <summary>
/// UC27 Đặt trước: lô InProduction, chiếm trần v_batch_commitment_cap, thu cọc PreOrderDeposit (không giữ tồn listing).
/// </summary>
public sealed class PreorderService(
    AppDbContext db, ICurrentUser me, PaymentRequestService payments, IAuditLog audit,
    IOptions<OrderOptions> options, TimeProvider clock)
{
    private const int MaxOrderNoAttempts = 3;
    private const int ShippingAddressMaxLength = 300;
    public const string PreorderAction = "preorder";

    public static long ComputeDeposit(long totalAmount, decimal depositPct) =>
        (long)Math.Round(totalAmount * depositPct / 100m, 0, MidpointRounding.AwayFromZero);

    public async Task<PreorderResponse> PlaceAsync(PlacePreorderRequest req, CancellationToken ct)
    {
        var lines = OrderService.NormalizeLines([(req.ListingId, req.QuantityKg)]);
        var quantityKg = lines[0].QuantityKg;
        for (var attempt = 1; ; attempt++)
        {
            try
            {
                return await db.InTransactionAsync(() => PlaceInsideAsync(req.AddressId, req.ListingId, quantityKg, ct), ct);
            }
            catch (DbUpdateException ex) when (attempt < MaxOrderNoAttempts && IsDuplicateOrderNo(ex))
            {
            }
        }
    }

    private async Task<PreorderResponse> PlaceInsideAsync(long addressId, long listingId, decimal quantityKg, CancellationToken ct)
    {
        var now = AuditChain.Timestamp(clock.GetUtcNow());
        await audit.LockAsync(ct);
        var customerId = me.UserId;

        var address = await db.CustomerAddresses.AsNoTracking()
                          .FirstOrDefaultAsync(a => a.AddressId == addressId && a.CustomerId == customerId, ct)
                      ?? throw new NotFoundException("order.address_not_found", "Không tìm thấy địa chỉ giao hàng của bạn.");

        var listing = await db.ProductListings.AsNoTracking()
                          .Where(l => l.ListingId == listingId)
                          .Select(l => new
                          {
                              l.ListingId, l.Title, l.Status, Hidden = l.HiddenAt != null, l.BatchId,
                              l.Batch.BatchCode, BatchStatus = l.Batch.Status, l.Batch.OperatorId,
                              l.Batch.OfftakeDepositPct,
                              FarmName = l.Batch.Operator.LegalName,
                              AccountId = (long?)l.Batch.BatchAccount!.BatchAccountId,
                              AccountNo = l.Batch.BatchAccount!.ProviderAccountNo,
                              AccountStatus = l.Batch.BatchAccount!.Status,
                          })
                          .FirstOrDefaultAsync(ct)
                      ?? throw new NotFoundException("listing.not_found", "Không tìm thấy niêm yết.");

        if (listing.Status != "Published" || listing.Hidden)
            throw new BusinessRuleException("order.listing_not_on_sale",
                $"Mặt hàng \"{listing.Title}\" đã bị ẩn khỏi cửa hàng hoặc ngừng bán.");
        if (listing.BatchStatus != "InProduction")
            throw new BusinessRuleException("preorder.batch_not_in_production",
                $"Lô {listing.BatchCode} không còn ở giai đoạn nuôi — đặt hàng lẻ khi lô đang thu hoạch.");
        if (listing.AccountId is not { } accountId || listing.AccountStatus != "Open")
            throw new BusinessRuleException("order.batch_account_unavailable",
                $"Lô {listing.BatchCode} chưa có tài khoản chuyên dùng để nhận tiền.");
        if (await db.OperatorMembers.AsNoTracking()
                .AnyAsync(m => m.UserId == customerId && m.OperatorId == listing.OperatorId, ct))
            throw new BusinessRuleException("preorder.related_party",
                "Hộ nuôi và người liên quan không được đặt trước lô của chính mình.");

        await db.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT batch_id FROM dbo.batch WITH (UPDLOCK, HOLDLOCK) WHERE batch_id = {listing.BatchId}", ct);

        var cap = await db.VBatchCommitmentCaps.AsNoTracking()
                      .SingleAsync(v => v.BatchId == listing.BatchId, ct);
        var remainingBefore = cap.RemainingKg ?? 0;
        if (remainingBefore < quantityKg)
            throw CapExceeded(remainingBefore, quantityKg, cap.CapKg ?? 0);

        var revision = await db.PriceHistories.AsNoTracking()
                           .Where(h => h.ListingId == listingId)
                           .OrderByDescending(h => h.EffectiveFrom).ThenByDescending(h => h.PriceHistoryId)
                           .Select(h => new { h.PriceHistoryId, h.PricePerKg })
                           .FirstOrDefaultAsync(ct)
                       ?? throw new InvalidOperationException($"Niêm yết {listingId} không có lịch sử giá.");
        var unitPrice = (long)revision.PricePerKg;
        var total = OrderService.LineAmount(quantityKg, unitPrice);
        if (total <= 0)
            throw new BusinessRuleException("order.amount_too_small", $"Giá trị đơn của lô {listing.BatchCode} phải lớn hơn 0 đồng.");
        var deposit = ComputeDeposit(total, listing.OfftakeDepositPct);
        if (deposit < 1 || deposit >= total)
            throw new BusinessRuleException("preorder.deposit_invalid",
                "Số cọc tính từ tỷ lệ lô không hợp lệ (phải nhỏ hơn tổng đơn và ít nhất 1 đồng).");

        var expiresAt = now.AddMinutes(options.Value.ReservationMinutes);
        var shipping = $"{address.AddressLine}, {address.Province}";
        var order = new SalesOrder
        {
            OrderNo = OrderNumber.New(),
            CustomerId = customerId,
            BatchId = listing.BatchId,
            OrderType = "PreOrder",
            Status = "PendingPayment",
            TotalAmount = total,
            DepositAmount = deposit,
            RecipientName = address.RecipientName,
            RecipientPhone = address.RecipientPhone,
            ShippingAddress = shipping.Length > ShippingAddressMaxLength ? shipping[..ShippingAddressMaxLength] : shipping,
            PlacedAt = now,
            CreatedAt = now,
            UpdatedAt = now,
        };
        order.OrderLines.Add(new OrderLine
        {
            BatchId = listing.BatchId,
            ListingId = listingId,
            QuantityKg = quantityKg,
            UnitPrice = unitPrice,
            PriceHistoryId = revision.PriceHistoryId,
            CreatedAt = now,
        });
        db.SalesOrders.Add(order);

        var payment = await payments.CreateAsync(
            PaymentPurposes.PreOrderDeposit, deposit, accountId, listing.AccountNo, expiresAt,
            PaymentTarget.ForOrder(order), null, ct);

        await db.SaveChangesAsync(ct);

        var remainingAfter = await db.VBatchCommitmentCaps.AsNoTracking()
            .Where(v => v.BatchId == listing.BatchId)
            .Select(v => v.RemainingKg ?? 0)
            .SingleAsync(ct);
        if (remainingAfter < 0)
            throw CapExceeded(remainingBefore, quantityKg, cap.CapKg ?? 0);

        await audit.WriteAsync("sales_order", order.OrderId, PreorderAction, null,
            new
            {
                order.OrderNo, listingId, quantityKg, totalAmount = total, depositAmount = deposit,
                status = order.Status,
            }, now, ct);

        var line = new CheckoutLineResponse(listingId, listing.Title, quantityKg, unitPrice, total);
        return new PreorderResponse(
            order.OrderNo, listing.BatchCode, listing.FarmName, order.Status, total, deposit, listing.OfftakeDepositPct,
            expiresAt, [line],
            new OrderPaymentResponse(payment.Qr.ReferenceCode, listing.AccountNo, (long)payment.Qr.Amount,
                payment.Qr.QrContent, payment.Qr.ExpiresAt, payment.Request.PaymentRequestId));
    }

    private static BusinessRuleException CapExceeded(decimal remainingKg, decimal requestedKg, decimal capKg) =>
        new("preorder.cap_exceeded",
            $"Đặt trước vượt trần cam kết của lô (còn {remainingKg:0.###} kg, yêu cầu {requestedKg:0.###} kg).")
        {
            Details = new { remainingKg, requestedKg, capKg },
        };

    private static bool IsDuplicateOrderNo(DbUpdateException ex) =>
        ex.InnerException is SqlException { Number: 2627 or 2601 } sql
        && (sql.Message.Contains("uq_sales_order_order_no") || sql.Message.Contains("uq_payment_request_reference_code"));
}
