using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Features.Orders;
using CrabShare.Api.Features.Payments;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Offtake;

/// <summary>
/// UC23 Nhận hàng trong cửa sổ: tạo sales_order Offtake đúng giá chốt, tiền phải trả = giá trị − cọc.
/// Cọc vẫn Held cho đến khi OfftakePayment về (Applied) hoặc cửa sổ hết hạn (Forfeited / Refunded).
/// </summary>
public sealed class OfftakeClaimService(
    AppDbContext db, ICurrentUser me, PaymentRequestService payments, IAuditLog audit, TimeProvider clock)
{
    private const int ShippingAddressMaxLength = 300;
    private const int MaxOrderNoAttempts = 3;
    public const string ClaimAction = "claim";

    public async Task<OfftakeCommitmentResponse> ClaimAsync(long offtakeId, ClaimOfftakeRequest req, CancellationToken ct)
    {
        for (var attempt = 1; ; attempt++)
        {
            try
            {
                return await db.InTransactionAsync(() => ClaimInsideAsync(offtakeId, req.AddressId, ct), ct);
            }
            catch (DbUpdateException ex) when (attempt < MaxOrderNoAttempts && IsDuplicateOrderNo(ex))
            {
            }
        }
    }

    private async Task<OfftakeCommitmentResponse> ClaimInsideAsync(long offtakeId, long addressId, CancellationToken ct)
    {
        var now = AuditChain.Timestamp(clock.GetUtcNow());
        await audit.LockAsync(ct);
        var investorId = me.UserId;

        var offtake = await db.OfftakeCommitments
                          .Include(o => o.Batch).ThenInclude(b => b.BatchAccount)
                          .Include(o => o.Grade)
                          .Include(o => o.Contribution)
                          .Include(o => o.SalesOrders).ThenInclude(s => s.PaymentRequests)
                          .SingleOrDefaultAsync(o => o.OfftakeId == offtakeId, ct)
                      ?? throw new NotFoundException("offtake.not_found", "Không tìm thấy cam kết bao tiêu.");
        if (offtake.Contribution.InvestorId != investorId)
            throw new ForbiddenException("offtake.not_owner", "Cam kết này không phải của bạn.");

        var existing = offtake.SalesOrders.FirstOrDefault(s => s.Status != "Cancelled");
        if (existing is not null)
            return Describe(offtake, existing);

        if (offtake.DepositStatus != "Held")
            throw new BusinessRuleException("offtake.deposit_not_held", "Chỉ nhận hàng khi cọc bao tiêu đang được giữ.");
        if (offtake.Status != "WindowOpen" || offtake.WindowOpensAt is null || offtake.WindowExpiresAt is null
            || now < offtake.WindowOpensAt || now >= offtake.WindowExpiresAt)
            throw new BusinessRuleException("offtake.window_closed", "Chỉ nhận hàng trong cửa sổ ưu tiên 48 giờ sau thu hoạch.");

        var address = await db.CustomerAddresses.AsNoTracking()
                          .FirstOrDefaultAsync(a => a.AddressId == addressId && a.CustomerId == investorId, ct)
                      ?? throw new NotFoundException("order.address_not_found", "Không tìm thấy địa chỉ giao hàng của bạn.");

        var batch = offtake.Batch;
        if (batch.BatchAccount is not { Status: "Open" } account)
            throw new BusinessRuleException("offtake.batch_account_unavailable",
                $"Lô {batch.BatchCode} chưa có tài khoản chuyên dùng để nhận tiền hàng.");

        // AsNoTracking: ExecuteUpdate tăng reserved_qty_kg. Entity đang theo dõi sẽ ghi đè mức giữ chỗ khi SaveChanges.
        var listing = await db.ProductListings.AsNoTracking()
                          .FirstOrDefaultAsync(l => l.BatchId == offtake.BatchId && l.GradeId == offtake.GradeId
                                                     && l.StorageType == "Fresh" && l.Status != "Closed", ct)
                      ?? throw new BusinessRuleException("offtake.listing_missing",
                          "Chưa có niêm yết cua tươi của hạng này để giao hàng.");

        var qty = offtake.CommittedQtyKg;
        var affected = await db.ProductListings
            .Where(l => l.ListingId == listing.ListingId && l.Status != "Closed" && l.StockQtyKg - l.ReservedQtyKg >= qty)
            .ExecuteUpdateAsync(s => s.SetProperty(l => l.ReservedQtyKg, l => l.ReservedQtyKg + qty), ct);
        if (affected == 0)
            throw new BusinessRuleException("offtake.insufficient_stock",
                "Không còn đủ hàng tươi của hạng đã cam kết. Cọc chưa bị mất; nếu đến hết cửa sổ vẫn không đủ hàng thì cọc được hoàn.");

        var revision = await db.PriceHistories.AsNoTracking()
                           .Where(h => h.ListingId == listing.ListingId)
                           .OrderByDescending(h => h.EffectiveFrom).ThenByDescending(h => h.PriceHistoryId)
                           .Select(h => h.PriceHistoryId)
                           .FirstAsync(ct);
        var unitPrice = (long)offtake.FixedUnitPrice;
        var gross = OrderService.LineAmount(qty, unitPrice);
        var deposit = (long)offtake.DepositAmount;
        var balance = gross - deposit;
        if (gross <= 0 || balance < 1)
            throw new BusinessRuleException("offtake.balance_invalid", "Số tiền hàng sau khi trừ cọc không hợp lệ.");

        // Đơn giữ giá chốt của hợp đồng (TL-30). Không thêm price_history: bản ghi đó hiện trên gian hàng
        // và sẽ bị hiểu là một lần đổi giá bán lẻ. price_history_id chỉ để thỏa khóa ngoại dòng đơn.

        var shipping = $"{address.AddressLine}, {address.Province}";
        var order = new SalesOrder
        {
            OrderNo = OrderNumber.New(),
            CustomerId = investorId,
            BatchId = offtake.BatchId,
            OrderType = "Offtake",
            OfftakeId = offtake.OfftakeId,
            Status = "PendingPayment",
            TotalAmount = gross,
            DepositAmount = deposit,
            BalanceDueAt = offtake.WindowExpiresAt,
            RecipientName = address.RecipientName,
            RecipientPhone = address.RecipientPhone,
            ShippingAddress = shipping.Length > ShippingAddressMaxLength ? shipping[..ShippingAddressMaxLength] : shipping,
            PlacedAt = now,
            CreatedAt = now,
            UpdatedAt = now,
        };
        order.OrderLines.Add(new OrderLine
        {
            BatchId = offtake.BatchId,
            ListingId = listing.ListingId,
            QuantityKg = qty,
            UnitPrice = unitPrice,
            PriceHistoryId = revision,
            CreatedAt = now,
            StockReservation = new StockReservation
            {
                ListingId = listing.ListingId,
                QuantityKg = qty,
                ExpiresAt = offtake.WindowExpiresAt.Value,
                Status = "Active",
                CreatedAt = now,
                UpdatedAt = now,
            },
        });
        db.SalesOrders.Add(order);

        var payment = await payments.CreateAsync(
            PaymentPurposes.OfftakePayment, balance, account.BatchAccountId, account.ProviderAccountNo,
            offtake.WindowExpiresAt.Value, PaymentTarget.ForOrder(order), null, ct);
        await db.SaveChangesAsync(ct);
        await audit.WriteAsync("offtake_commitment", offtake.OfftakeId, ClaimAction,
            new { status = "WindowOpen" },
            new { order.OrderNo, qtyKg = qty, fixedUnitPrice = unitPrice, gross, deposit, balance }, now, ct);

        return ToResponse(offtake, order, new OfftakePaymentResponse(
            payment.Qr.ReferenceCode, account.ProviderAccountNo, balance, payment.Qr.QrContent,
            payment.Qr.ExpiresAt, payment.Request.PaymentRequestId));
    }

    private static OfftakeCommitmentResponse Describe(OfftakeCommitment offtake, SalesOrder order)
    {
        var payment = order.PaymentRequests.Where(p => p.Purpose == PaymentPurposes.OfftakePayment)
            .OrderByDescending(p => p.PaymentRequestId).FirstOrDefault();
        OfftakePaymentResponse? pay = null;
        if (payment is not null && offtake.Batch.BatchAccount?.ProviderAccountNo is { } accountNo)
        {
            pay = new OfftakePaymentResponse(payment.ReferenceCode, accountNo, (long)payment.Amount, null,
                payment.ExpiresAt, payment.PaymentRequestId);
        }
        return ToResponse(offtake, order, pay);
    }

    private static OfftakeCommitmentResponse ToResponse(OfftakeCommitment offtake, SalesOrder? order, OfftakePaymentResponse? payment)
    {
        var unitPrice = (long)offtake.FixedUnitPrice;
        var value = OrderService.LineAmount(offtake.CommittedQtyKg, unitPrice);
        return new OfftakeCommitmentResponse(
            offtake.OfftakeId, offtake.Batch.BatchCode, offtake.ContributionId, offtake.Grade.GradeCode, offtake.Grade.GradeName,
            offtake.CommittedQtyKg, unitPrice, value, (long)offtake.DepositAmount, offtake.Batch.OfftakeDepositPct,
            offtake.DepositStatus, offtake.Status, offtake.CreatedAt, payment,
            offtake.WindowOpensAt, offtake.WindowExpiresAt, order?.OrderId, order?.OrderNo);
    }

    private static bool IsDuplicateOrderNo(DbUpdateException ex) =>
        ex.InnerException is Microsoft.Data.SqlClient.SqlException { Number: 2627 or 2601 } sql
        && sql.Message.Contains("uq_sales_order_order_no", StringComparison.Ordinal);
}
