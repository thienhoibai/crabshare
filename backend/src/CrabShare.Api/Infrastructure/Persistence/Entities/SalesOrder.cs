using System;
using System.Collections.Generic;

namespace CrabShare.Api.Infrastructure.Persistence.Entities;

/// <summary>
/// Đơn hàng; mỗi đơn thuộc đúng một lô (giỏ hàng nhiều lô được tách đơn)
/// </summary>
public partial class SalesOrder
{
    public long OrderId { get; set; }

    public string OrderNo { get; set; } = null!;

    /// <summary>
    /// Khách lẻ hoặc nhà đầu tư bao tiêu
    /// </summary>
    public long CustomerId { get; set; }

    public long BatchId { get; set; }

    /// <summary>
    /// Giá trị: Retail, PreOrder, Offtake
    /// </summary>
    public string OrderType { get; set; } = null!;

    public long? OfftakeId { get; set; }

    /// <summary>
    /// Giá trị: PendingPayment, DepositPaid, Paid, Packed, Shipping, Delivered, Completed, Cancelled, Returned
    /// </summary>
    public string Status { get; set; } = null!;

    /// <summary>
    /// Chốt lúc đặt để đối soát thanh toán
    /// </summary>
    public decimal TotalAmount { get; set; }

    public decimal? DepositAmount { get; set; }

    public DateTimeOffset? BalanceDueAt { get; set; }

    public string RecipientName { get; set; } = null!;

    public string RecipientPhone { get; set; } = null!;

    public string ShippingAddress { get; set; } = null!;

    public DateTimeOffset PlacedAt { get; set; }

    public DateTimeOffset? PaidAt { get; set; }

    public DateTimeOffset? ShippedAt { get; set; }

    public DateTimeOffset? DeliveredAt { get; set; }

    public DateTimeOffset? ReturnWindowEndsAt { get; set; }

    public DateTimeOffset? CompletedAt { get; set; }

    public DateTimeOffset? CancelledAt { get; set; }

    public string? CancelReason { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset UpdatedAt { get; set; }

    public virtual Batch Batch { get; set; } = null!;

    public virtual ICollection<Complaint> Complaints { get; set; } = new List<Complaint>();

    public virtual AppUser Customer { get; set; } = null!;

    public virtual OfftakeCommitment? Offtake { get; set; }

    public virtual ICollection<OrderLine> OrderLines { get; set; } = new List<OrderLine>();

    public virtual ICollection<PaymentInstruction> PaymentInstructions { get; set; } = new List<PaymentInstruction>();

    public virtual ICollection<PaymentRequest> PaymentRequests { get; set; } = new List<PaymentRequest>();

    public virtual ProductRating? ProductRating { get; set; }
}
