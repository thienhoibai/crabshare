using System;
using System.Collections.Generic;

namespace CrabShare.Api.Infrastructure.Persistence.Entities;

/// <summary>
/// Người nuôi: tổ chức có mã số thuế, vận hành cơ sở RAS
/// </summary>
public partial class Operator
{
    public long OperatorId { get; set; }

    public string LegalName { get; set; } = null!;

    public string TaxCode { get; set; } = null!;

    public string BusinessRegNo { get; set; } = null!;

    public string FarmAddress { get; set; } = null!;

    public int ApprovedSlotCapacity { get; set; }

    /// <summary>
    /// Giá trị: Draft, Submitted, Approved, Rejected, Suspended
    /// </summary>
    public string Status { get; set; } = null!;

    public DateTimeOffset? SubmittedAt { get; set; }

    public DateTimeOffset? ApprovedAt { get; set; }

    public long? ApprovedBy { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset UpdatedAt { get; set; }

    public virtual AppUser? ApprovedByNavigation { get; set; }

    public virtual ICollection<Batch> Batches { get; set; } = new List<Batch>();

    public virtual ICollection<OperatorMember> OperatorMembers { get; set; } = new List<OperatorMember>();

    public virtual ICollection<PayoutAccount> PayoutAccounts { get; set; } = new List<PayoutAccount>();

    public virtual ICollection<PhysicalSlot> PhysicalSlots { get; set; } = new List<PhysicalSlot>();
}
