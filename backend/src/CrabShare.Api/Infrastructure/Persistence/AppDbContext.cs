using System;
using System.Collections.Generic;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Infrastructure.Persistence;

public partial class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options)
        : base(options)
    {
    }

    public virtual DbSet<Alert> Alerts { get; set; }

    public virtual DbSet<AppUser> AppUsers { get; set; }

    public virtual DbSet<AppUserRole> AppUserRoles { get; set; }

    public virtual DbSet<AuditLog> AuditLogs { get; set; }

    public virtual DbSet<Batch> Batches { get; set; }

    public virtual DbSet<BatchAccount> BatchAccounts { get; set; }

    public virtual DbSet<CapitalShare> CapitalShares { get; set; }

    public virtual DbSet<CaptureRequest> CaptureRequests { get; set; }

    public virtual DbSet<ContractSignature> ContractSignatures { get; set; }

    public virtual DbSet<ContractTemplate> ContractTemplates { get; set; }

    public virtual DbSet<Contribution> Contributions { get; set; }

    public virtual DbSet<CrabItem> CrabItems { get; set; }

    public virtual DbSet<CrabTag> CrabTags { get; set; }

    public virtual DbSet<Customer> Customers { get; set; }

    public virtual DbSet<CustomerAddress> CustomerAddresses { get; set; }

    public virtual DbSet<DisbursementTranche> DisbursementTranches { get; set; }

    public virtual DbSet<Evidence> Evidences { get; set; }

    public virtual DbSet<EvidenceDetection> EvidenceDetections { get; set; }

    public virtual DbSet<EvidenceReview> EvidenceReviews { get; set; }

    public virtual DbSet<InvestmentContract> InvestmentContracts { get; set; }

    public virtual DbSet<Investor> Investors { get; set; }

    public virtual DbSet<KycCheck> KycChecks { get; set; }

    public virtual DbSet<KycHandoff> KycHandoffs { get; set; }

    public virtual DbSet<OfftakeCommitment> OfftakeCommitments { get; set; }

    public virtual DbSet<Operator> Operators { get; set; }

    public virtual DbSet<OperatorMember> OperatorMembers { get; set; }

    public virtual DbSet<PaymentInstruction> PaymentInstructions { get; set; }

    public virtual DbSet<PaymentRequest> PaymentRequests { get; set; }

    public virtual DbSet<PayoutAccount> PayoutAccounts { get; set; }

    public virtual DbSet<PhysicalSlot> PhysicalSlots { get; set; }

    public virtual DbSet<ProductionLog> ProductionLogs { get; set; }

    public virtual DbSet<ProviderTransaction> ProviderTransactions { get; set; }

    public virtual DbSet<RiskAcknowledgement> RiskAcknowledgements { get; set; }

    public virtual DbSet<RiskDisclosure> RiskDisclosures { get; set; }

    public virtual DbSet<SalesOrder> SalesOrders { get; set; }

    public virtual DbSet<Settlement> Settlements { get; set; }

    public virtual DbSet<SettlementFeedback> SettlementFeedbacks { get; set; }

    public virtual DbSet<SettlementLine> SettlementLines { get; set; }

    public virtual DbSet<SlotAllocation> SlotAllocations { get; set; }

    public virtual DbSet<SlotEvent> SlotEvents { get; set; }

    public virtual DbSet<StandardCostItem> StandardCostItems { get; set; }

    public virtual DbSet<StandardCostVersion> StandardCostVersions { get; set; }

    public virtual DbSet<VBatchFundingProgress> VBatchFundingProgresses { get; set; }

    public virtual DbSet<VInvestorPortfolio> VInvestorPortfolios { get; set; }

    public virtual DbSet<VOverdueAlert> VOverdueAlerts { get; set; }

    public virtual DbSet<VSettlementReconciliation> VSettlementReconciliations { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Alert>(entity =>
        {
            entity.HasIndex(e => e.AcknowledgedBy, "ix_alert_acknowledged_by");

            entity.HasIndex(e => new { e.BatchId, e.Status }, "ix_alert_batch_id_status");

            entity.Property(e => e.AckDeadline)
                .HasPrecision(3)
                .HasColumnName("ack_deadline");

            entity.Property(e => e.AcknowledgedAt)
                .HasPrecision(3)
                .HasColumnName("acknowledged_at");

            entity.Property(e => e.AcknowledgedBy).HasColumnName("acknowledged_by");

            entity.Property(e => e.AlertType)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasColumnName("alert_type");

            entity.Property(e => e.BatchId).HasColumnName("batch_id");

            entity.Property(e => e.CreatedAt)
                .HasPrecision(3)
                .HasColumnName("created_at");

            entity.Property(e => e.EscalatedAt)
                .HasPrecision(3)
                .HasColumnName("escalated_at");

            entity.Property(e => e.Message)
                .HasMaxLength(300)
                .HasColumnName("message");

            entity.Property(e => e.RaisedAt)
                .HasPrecision(3)
                .HasColumnName("raised_at");

            entity.Property(e => e.ResponseNote)
                .HasMaxLength(300)
                .HasColumnName("response_note");

            entity.Property(e => e.Severity)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasColumnName("severity");

            entity.Property(e => e.Status)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasColumnName("status");

            entity.Property(e => e.UpdatedAt)
                .HasPrecision(3)
                .HasColumnName("updated_at");

            entity.HasOne(d => d.AcknowledgedByNavigation).WithMany(p => p.Alerts)
                .HasForeignKey(d => d.AcknowledgedBy)
                .HasConstraintName("fk_alert_acknowledged_by");

            entity.HasOne(d => d.Batch).WithMany(p => p.Alerts)
                .HasForeignKey(d => d.BatchId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("fk_alert_batch_id");
        });

        modelBuilder.Entity<AppUser>(entity =>
        {
            entity.HasKey(e => e.UserId).HasName("pk_app_user");

            entity.ToTable("app_user", tb => tb.HasComment("Tài khoản đăng nhập chung của mọi người dùng"));

            entity.HasIndex(e => e.Email, "uq_app_user_email").IsUnique();

            entity.HasIndex(e => e.Phone, "ux_app_user_phone")
                .IsUnique()
                .HasFilter("([phone] IS NOT NULL)");

            entity.Property(e => e.UserId).HasColumnName("user_id");
            entity.Property(e => e.CreatedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysdatetimeoffset())", "df_app_user_created_at")
                .HasColumnName("created_at");
            entity.Property(e => e.Email)
                .HasMaxLength(254)
                .HasColumnName("email");
            entity.Property(e => e.FullName)
                .HasMaxLength(150)
                .HasColumnName("full_name");
            entity.Property(e => e.LastLoginAt)
                .HasPrecision(3)
                .HasColumnName("last_login_at");
            entity.Property(e => e.PasswordHash)
                .HasMaxLength(255)
                .IsUnicode(false)
                .HasColumnName("password_hash");
            entity.Property(e => e.Phone)
                .HasMaxLength(15)
                .IsUnicode(false)
                .HasColumnName("phone");
            entity.Property(e => e.Status)
                .HasMaxLength(21)
                .IsUnicode(false)
                .HasComment("Giá trị: PendingVerification, Active, Locked")
                .HasDefaultValue("PendingVerification", "df_app_user_status")
                .HasColumnName("status");
            entity.Property(e => e.UpdatedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysdatetimeoffset())", "df_app_user_updated_at")
                .HasColumnName("updated_at");
        });

        modelBuilder.Entity<AppUserRole>(entity =>
        {
            entity.Property(e => e.UserId).HasColumnName("user_id");

            entity.Property(e => e.RoleCode)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasColumnName("role_code");

            entity.Property(e => e.CreatedAt)
                .HasPrecision(3)
                .HasColumnName("created_at");

            entity.Property(e => e.GrantedAt)
                .HasPrecision(3)
                .HasColumnName("granted_at");

            entity.HasOne(d => d.User).WithMany(p => p.AppUserRoles)
                .HasForeignKey(d => d.UserId)
                .HasConstraintName("fk_app_user_role_user_id");
        });

        modelBuilder.Entity<AuditLog>(entity =>
        {
            entity.HasKey(e => e.AuditId).HasName("pk_audit_log");

            entity.ToTable("audit_log", tb =>
                {
                    tb.HasComment("Nhật ký chỉ ghi thêm cho mọi thay đổi về tiền, hợp đồng, Standard Cost; nối chuỗi băm");
                    tb.HasTrigger("trg_audit_log_append_only");
                });

            entity.HasIndex(e => e.ActorUserId, "ix_audit_log_actor_user_id");

            entity.HasIndex(e => new { e.EntityType, e.EntityId }, "ix_audit_log_entity_type_entity_id");

            entity.Property(e => e.AuditId).HasColumnName("audit_id");
            entity.Property(e => e.ActionType)
                .HasMaxLength(30)
                .IsUnicode(false)
                .HasColumnName("action_type");
            entity.Property(e => e.ActorUserId).HasColumnName("actor_user_id");
            entity.Property(e => e.EntityId).HasColumnName("entity_id");
            entity.Property(e => e.EntityType)
                .HasMaxLength(50)
                .IsUnicode(false)
                .HasColumnName("entity_type");
            entity.Property(e => e.NewValue).HasColumnName("new_value");
            entity.Property(e => e.OccurredAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysdatetimeoffset())", "df_audit_log_occurred_at")
                .HasColumnName("occurred_at");
            entity.Property(e => e.OldValue).HasColumnName("old_value");
            entity.Property(e => e.PrevHash)
                .HasMaxLength(64)
                .IsUnicode(false)
                .IsFixedLength()
                .HasColumnName("prev_hash");
            entity.Property(e => e.RowHash)
                .HasMaxLength(64)
                .IsUnicode(false)
                .IsFixedLength()
                .HasColumnName("row_hash");

            entity.HasOne(d => d.ActorUser).WithMany(p => p.AuditLogs)
                .HasForeignKey(d => d.ActorUserId)
                .HasConstraintName("fk_audit_log_actor_user_id");
        });

        modelBuilder.Entity<Batch>(entity =>
        {
            entity.HasKey(e => e.BatchId).HasName("pk_batch");

            entity.ToTable("batch", tb => tb.HasComment("Lô nuôi: đơn vị gọi vốn, sản xuất, bán hàng và quyết toán"));

            entity.HasIndex(e => e.ApprovedBy, "ix_batch_approved_by");

            entity.HasIndex(e => e.OperatorId, "ix_batch_operator_id");

            entity.HasIndex(e => e.Status, "ix_batch_status");

            entity.HasIndex(e => e.BatchCode, "uq_batch_batch_code").IsUnique();

            entity.Property(e => e.BatchId).HasColumnName("batch_id");
            entity.Property(e => e.ApprovedAt)
                .HasPrecision(3)
                .HasColumnName("approved_at");
            entity.Property(e => e.ApprovedBy).HasColumnName("approved_by");
            entity.Property(e => e.BatchCode)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasColumnName("batch_code");
            entity.Property(e => e.CapitalClosedAt)
                .HasPrecision(3)
                .HasComment("Thời điểm đóng vốn")
                .HasColumnName("capital_closed_at");
            entity.Property(e => e.ClosedAt)
                .HasPrecision(3)
                .HasColumnName("closed_at");
            entity.Property(e => e.CrabType)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasComment("Giá trị: FatteningMudCrab, RoeCrab, SoftShellCrab")
                .HasColumnName("crab_type");
            entity.Property(e => e.CreatedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysdatetimeoffset())", "df_batch_created_at")
                .HasColumnName("created_at");
            entity.Property(e => e.CycleDays).HasColumnName("cycle_days");
            entity.Property(e => e.EarlyLiquidationAt)
                .HasPrecision(3)
                .HasColumnName("early_liquidation_at");
            entity.Property(e => e.ExpectedHarvestDate).HasColumnName("expected_harvest_date");
            entity.Property(e => e.ExpectedOutputKg)
                .HasColumnType("decimal(12, 3)")
                .HasColumnName("expected_output_kg");
            entity.Property(e => e.FrozenStockCapMonths)
                .HasDefaultValue((byte)4, "df_batch_frozen_stock_cap_months")
                .HasColumnName("frozen_stock_cap_months");
            entity.Property(e => e.FundingDeadline)
                .HasPrecision(3)
                .HasColumnName("funding_deadline");
            entity.Property(e => e.FundingOpenAt)
                .HasPrecision(3)
                .HasColumnName("funding_open_at");
            entity.Property(e => e.HarvestStartedAt)
                .HasPrecision(3)
                .HasColumnName("harvest_started_at");
            entity.Property(e => e.MaxCapital)
                .HasColumnType("decimal(18, 0)")
                .HasColumnName("max_capital");
            entity.Property(e => e.MinContribution)
                .HasDefaultValue(1000000m, "df_batch_min_contribution")
                .HasColumnType("decimal(18, 0)")
                .HasColumnName("min_contribution");
            entity.Property(e => e.MinViableCapital)
                .HasColumnType("decimal(18, 0)")
                .HasColumnName("min_viable_capital");
            entity.Property(e => e.OfftakeDepositPct)
                .HasDefaultValue(15.00m, "df_batch_offtake_deposit_pct")
                .HasColumnType("decimal(5, 2)")
                .HasColumnName("offtake_deposit_pct");
            entity.Property(e => e.OfftakePreorderCapPct)
                .HasDefaultValue(60.00m, "df_batch_offtake_preorder_cap_pct")
                .HasColumnType("decimal(5, 2)")
                .HasColumnName("offtake_preorder_cap_pct");
            entity.Property(e => e.OperatorId).HasColumnName("operator_id");
            entity.Property(e => e.OperatorSharePct)
                .HasDefaultValue(7.00m, "df_batch_operator_share_pct")
                .HasColumnType("decimal(5, 2)")
                .HasColumnName("operator_share_pct");
            entity.Property(e => e.PlatformFeeAmount)
                .HasComment("Phí chốt theo bậc; người nuôi trả ngoài tiền của lô")
                .HasColumnType("decimal(18, 0)")
                .HasColumnName("platform_fee_amount");
            entity.Property(e => e.RestockCutoffDays).HasColumnName("restock_cutoff_days");
            entity.Property(e => e.SeedQuantity)
                .HasComment("Số con giống khoá")
                .HasColumnName("seed_quantity");
            entity.Property(e => e.Status)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasComment("Giá trị: Draft, PendingApproval, Rejected, Funding, Cancelled, Stocked, InProduction, Harvesting, Settlement, Closed")
                .HasDefaultValue("Draft", "df_batch_status")
                .HasColumnName("status");
            entity.Property(e => e.StockedAt)
                .HasPrecision(3)
                .HasColumnName("stocked_at");
            entity.Property(e => e.TargetCapital)
                .HasColumnType("decimal(18, 0)")
                .HasColumnName("target_capital");
            entity.Property(e => e.Title)
                .HasMaxLength(200)
                .HasColumnName("title");
            entity.Property(e => e.TotalConfirmedCapital)
                .HasComment("Mẫu số tỷ lệ, chốt khi đóng vốn")
                .HasColumnType("decimal(18, 0)")
                .HasColumnName("total_confirmed_capital");
            entity.Property(e => e.UpdatedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysdatetimeoffset())", "df_batch_updated_at")
                .HasColumnName("updated_at");

            entity.HasOne(d => d.ApprovedByNavigation).WithMany(p => p.Batches)
                .HasForeignKey(d => d.ApprovedBy)
                .HasConstraintName("fk_batch_approved_by");

            entity.HasOne(d => d.Operator).WithMany(p => p.Batches)
                .HasForeignKey(d => d.OperatorId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("fk_batch_operator_id");
        });

        modelBuilder.Entity<BatchAccount>(entity =>
        {
            entity.HasIndex(e => e.BatchId, "uq_batch_account_batch_id").IsUnique();

            entity.HasIndex(e => e.ProviderAccountNo, "uq_batch_account_provider_account_no").IsUnique();

            entity.Property(e => e.BatchId).HasColumnName("batch_id");

            entity.Property(e => e.ClosedAt)
                .HasPrecision(3)
                .HasColumnName("closed_at");

            entity.Property(e => e.CreatedAt)
                .HasPrecision(3)
                .HasColumnName("created_at");

            entity.Property(e => e.OpenedAt)
                .HasPrecision(3)
                .HasColumnName("opened_at");

            entity.Property(e => e.ProviderAccountNo)
                .HasMaxLength(40)
                .IsUnicode(false)
                .HasColumnName("provider_account_no");

            entity.Property(e => e.ProviderName)
                .HasMaxLength(100)
                .HasColumnName("provider_name");

            entity.Property(e => e.Status)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasColumnName("status");

            entity.Property(e => e.UpdatedAt)
                .HasPrecision(3)
                .HasColumnName("updated_at");

            entity.HasOne(d => d.Batch).WithOne(p => p.BatchAccount)
                .HasForeignKey<BatchAccount>(d => d.BatchId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("fk_batch_account_batch_id");
        });

        modelBuilder.Entity<CapitalShare>(entity =>
        {
            entity.HasKey(e => new { e.BatchId, e.InvestorId }).HasName("pk_capital_share");

            entity.ToTable("capital_share", tb =>
                {
                    tb.HasComment("Tử số quyền lợi của từng nhà đầu tư, chốt bất biến khi lô đóng vốn");
                    tb.HasTrigger("trg_capital_share_immutable");
                });

            entity.HasIndex(e => e.InvestorId, "ix_capital_share_investor_id");

            entity.Property(e => e.BatchId).HasColumnName("batch_id");
            entity.Property(e => e.InvestorId).HasColumnName("investor_id");
            entity.Property(e => e.ConfirmedAmount)
                .HasColumnType("decimal(18, 0)")
                .HasColumnName("confirmed_amount");
            entity.Property(e => e.CreatedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysdatetimeoffset())", "df_capital_share_created_at")
                .HasColumnName("created_at");
            entity.Property(e => e.SnapshottedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysdatetimeoffset())", "df_capital_share_snapshotted_at")
                .HasColumnName("snapshotted_at");

            entity.HasOne(d => d.Batch).WithMany(p => p.CapitalShares)
                .HasForeignKey(d => d.BatchId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("fk_capital_share_batch_id");

            entity.HasOne(d => d.Investor).WithMany(p => p.CapitalShares)
                .HasForeignKey(d => d.InvestorId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("fk_capital_share_investor_id");
        });

        modelBuilder.Entity<CaptureRequest>(entity =>
        {
            entity.HasIndex(e => new { e.BatchId, e.Status }, "ix_capture_request_batch_id_status");

            entity.HasIndex(e => e.SlotId, "ix_capture_request_slot_id");

            entity.Property(e => e.BatchId).HasColumnName("batch_id");

            entity.Property(e => e.CreatedAt)
                .HasPrecision(3)
                .HasColumnName("created_at");

            entity.Property(e => e.DueAt)
                .HasPrecision(3)
                .HasColumnName("due_at");

            entity.Property(e => e.FulfilledAt)
                .HasPrecision(3)
                .HasColumnName("fulfilled_at");

            entity.Property(e => e.RequestedAt)
                .HasPrecision(3)
                .HasColumnName("requested_at");

            entity.Property(e => e.SlotId).HasColumnName("slot_id");

            entity.Property(e => e.Status)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasColumnName("status");

            entity.HasOne(d => d.Batch).WithMany(p => p.CaptureRequests)
                .HasForeignKey(d => d.BatchId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("fk_capture_request_batch_id");

            entity.HasOne(d => d.Slot).WithMany(p => p.CaptureRequests)
                .HasForeignKey(d => d.SlotId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("fk_capture_request_slot_id");
        });

        modelBuilder.Entity<ContractSignature>(entity =>
        {
            entity.HasIndex(e => e.SignerUserId, "ix_contract_signature_signer_user_id");

            entity.HasIndex(e => new { e.ContractId, e.SigningOrder }, "ux_signature_order").IsUnique();

            entity.HasIndex(e => new { e.ContractId, e.SignerRole }, "ux_signature_role").IsUnique();

            entity.Property(e => e.ContractId).HasColumnName("contract_id");

            entity.Property(e => e.CreatedAt)
                .HasPrecision(3)
                .HasColumnName("created_at");

            entity.Property(e => e.ProviderRequestId)
                .HasMaxLength(100)
                .IsUnicode(false)
                .HasColumnName("provider_request_id");

            entity.Property(e => e.SignedAt)
                .HasPrecision(3)
                .HasColumnName("signed_at");

            entity.Property(e => e.SignedHash)
                .HasMaxLength(64)
                .IsUnicode(false)
                .IsFixedLength()
                .HasColumnName("signed_hash");

            entity.Property(e => e.SignerRole)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasColumnName("signer_role");

            entity.Property(e => e.SignerUserId).HasColumnName("signer_user_id");

            entity.Property(e => e.SigningOrder).HasColumnName("signing_order");

            entity.HasOne(d => d.Contract).WithMany(p => p.ContractSignatures)
                .HasForeignKey(d => d.ContractId)
                .HasConstraintName("fk_contract_signature_contract_id");

            entity.HasOne(d => d.SignerUser).WithMany(p => p.ContractSignatures)
                .HasForeignKey(d => d.SignerUserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("fk_contract_signature_signer_user_id");
        });

        modelBuilder.Entity<ContractTemplate>(entity =>
        {
            entity.HasIndex(e => e.VersionCode, "uq_contract_template_version_code").IsUnique();

            entity.Property(e => e.ContentHash)
                .HasMaxLength(64)
                .IsUnicode(false)
                .IsFixedLength()
                .HasColumnName("content_hash");

            entity.Property(e => e.CreatedAt)
                .HasPrecision(3)
                .HasColumnName("created_at");

            entity.Property(e => e.EffectiveFrom)
                .HasPrecision(3)
                .HasColumnName("effective_from");

            entity.Property(e => e.Status)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasColumnName("status");

            entity.Property(e => e.UpdatedAt)
                .HasPrecision(3)
                .HasColumnName("updated_at");

            entity.Property(e => e.VersionCode)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasColumnName("version_code");
        });

        modelBuilder.Entity<Contribution>(entity =>
        {
            entity.HasKey(e => e.ContributionId).HasName("pk_contribution");

            entity.ToTable("contribution", tb => tb.HasComment("Khoản góp vốn: giữ chỗ rồi được xác nhận khi tiền về tài khoản lô"));

            entity.HasIndex(e => new { e.BatchId, e.Status }, "ix_contribution_batch_id_status");

            entity.HasIndex(e => e.InvestorId, "ix_contribution_investor_id");

            entity.HasIndex(e => new { e.ContributionId, e.BatchId }, "ux_contribution_batch").IsUnique();

            entity.Property(e => e.ContributionId).HasColumnName("contribution_id");
            entity.Property(e => e.Amount)
                .HasColumnType("decimal(18, 0)")
                .HasColumnName("amount");
            entity.Property(e => e.BatchId).HasColumnName("batch_id");
            entity.Property(e => e.ConfirmedAt)
                .HasPrecision(3)
                .HasColumnName("confirmed_at");
            entity.Property(e => e.CreatedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysdatetimeoffset())", "df_contribution_created_at")
                .HasColumnName("created_at");
            entity.Property(e => e.ExpiresAt)
                .HasPrecision(3)
                .HasColumnName("expires_at");
            entity.Property(e => e.InvestorId).HasColumnName("investor_id");
            entity.Property(e => e.RefundedAt)
                .HasPrecision(3)
                .HasColumnName("refunded_at");
            entity.Property(e => e.ReservedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysdatetimeoffset())", "df_contribution_reserved_at")
                .HasColumnName("reserved_at");
            entity.Property(e => e.Status)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasComment("Giá trị: Reserved, Confirmed, Expired, Refunded")
                .HasDefaultValue("Reserved", "df_contribution_status")
                .HasColumnName("status");
            entity.Property(e => e.UpdatedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysdatetimeoffset())", "df_contribution_updated_at")
                .HasColumnName("updated_at");

            entity.HasOne(d => d.Batch).WithMany(p => p.Contributions)
                .HasForeignKey(d => d.BatchId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("fk_contribution_batch_id");

            entity.HasOne(d => d.Investor).WithMany(p => p.Contributions)
                .HasForeignKey(d => d.InvestorId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("fk_contribution_investor_id");
        });

        modelBuilder.Entity<CrabItem>(entity =>
        {
            entity.HasKey(e => e.CrabItemId).HasName("pk_crab_item");

            entity.ToTable("crab_item", tb => tb.HasComment("Từng con cua, có mã từ lúc thả giống; lúc nuôi gắn với ô, từ lúc thu hoạch gắn với tem"));

            entity.HasIndex(e => e.BatchId, "ix_crab_item_batch_id");

            entity.HasIndex(e => new { e.BatchId, e.Status }, "ix_crab_item_batch_id_status");

            entity.HasIndex(e => e.ReplacesCrabItemId, "ix_crab_item_replaces_crab_item_id");

            entity.HasIndex(e => new { e.SlotAllocationId, e.BatchId }, "ix_crab_item_slot_allocation_id_batch_id");

            entity.HasIndex(e => e.ItemUuid, "uq_crab_item_item_uuid").IsUnique();

            entity.HasIndex(e => e.SlotAllocationId, "ux_crab_item_growing_slot")
                .IsUnique()
                .HasFilter("([status]='Growing')");

            entity.Property(e => e.CrabItemId).HasColumnName("crab_item_id");
            entity.Property(e => e.BatchId).HasColumnName("batch_id");
            entity.Property(e => e.CreatedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysdatetimeoffset())", "df_crab_item_created_at")
                .HasColumnName("created_at");
            entity.Property(e => e.ItemUuid)
                .HasComment("Mã nội bộ của con cua, sinh lúc thả giống")
                .HasDefaultValueSql("(newid())", "df_crab_item_item_uuid")
                .HasColumnName("item_uuid");
            entity.Property(e => e.ReplacesCrabItemId)
                .HasComment("Con cua chết mà con này thả bù thay")
                .HasColumnName("replaces_crab_item_id");
            entity.Property(e => e.SlotAllocationId).HasColumnName("slot_allocation_id");
            entity.Property(e => e.Status)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasComment("Giá trị: Growing, Dead, InStock, Packed, Sold, DeliveredInKind, Lost")
                .HasDefaultValue("Growing", "df_crab_item_status")
                .HasColumnName("status");
            entity.Property(e => e.StockedAt)
                .HasPrecision(3)
                .HasComment("Thời điểm thả con cua vào ô")
                .HasDefaultValueSql("(sysdatetimeoffset())", "df_crab_item_stocked_at")
                .HasColumnName("stocked_at");
            entity.Property(e => e.UpdatedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysdatetimeoffset())", "df_crab_item_updated_at")
                .HasColumnName("updated_at");
            entity.Property(e => e.WeightG).HasColumnName("weight_g");

            entity.HasOne(d => d.Batch).WithMany(p => p.CrabItems)
                .HasForeignKey(d => d.BatchId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("fk_crab_item_batch_id");

            entity.HasOne(d => d.ReplacesCrabItem).WithMany(p => p.InverseReplacesCrabItem)
                .HasForeignKey(d => d.ReplacesCrabItemId)
                .HasConstraintName("fk_crab_item_replaces_crab_item_id");

            entity.HasOne(d => d.SlotAllocation).WithMany(p => p.CrabItems)
                .HasPrincipalKey(p => new { p.SlotAllocationId, p.BatchId })
                .HasForeignKey(d => new { d.SlotAllocationId, d.BatchId })
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("fk_crab_item_slot_allocation_id_batch_id");
        });

        modelBuilder.Entity<CrabTag>(entity =>
        {
            entity.HasKey(e => e.TagId).HasName("pk_crab_tag");

            entity.ToTable("crab_tag", tb => tb.HasComment("Tem truy xuất in tại chỗ khi thu hoạch; mỗi con cua có tối đa một tem đang hiệu lực"));

            entity.HasIndex(e => e.ActivationEvidenceId, "ix_crab_tag_activation_evidence_id");

            entity.HasIndex(e => e.CrabItemId, "ix_crab_tag_crab_item_id");

            entity.HasIndex(e => e.PrintedBy, "ix_crab_tag_printed_by");

            entity.HasIndex(e => e.TagCode, "uq_crab_tag_tag_code").IsUnique();

            entity.HasIndex(e => e.CrabItemId, "ux_crab_tag_active")
                .IsUnique()
                .HasFilter("([status]='Active')");

            entity.Property(e => e.TagId).HasColumnName("tag_id");
            entity.Property(e => e.ActivatedAt)
                .HasPrecision(3)
                .HasColumnName("activated_at");
            entity.Property(e => e.ActivationEvidenceId)
                .HasComment("Ảnh xác nhận lúc thu hoạch thấy cả con cua và tem")
                .HasColumnName("activation_evidence_id");
            entity.Property(e => e.CrabItemId).HasColumnName("crab_item_id");
            entity.Property(e => e.PrintedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysdatetimeoffset())", "df_crab_tag_printed_at")
                .HasColumnName("printed_at");
            entity.Property(e => e.PrintedBy).HasColumnName("printed_by");
            entity.Property(e => e.Status)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasComment("Giá trị: Printed, Active, Void")
                .HasDefaultValue("Printed", "df_crab_tag_status")
                .HasColumnName("status");
            entity.Property(e => e.TagCode)
                .HasMaxLength(12)
                .IsUnicode(false)
                .IsFixedLength()
                .HasComment("Mã in trên tem và nằm trong QR; sinh ngẫu nhiên, không đoán được")
                .HasColumnName("tag_code");
            entity.Property(e => e.VoidReason)
                .HasMaxLength(200)
                .HasColumnName("void_reason");
            entity.Property(e => e.VoidedAt)
                .HasPrecision(3)
                .HasColumnName("voided_at");

            entity.HasOne(d => d.ActivationEvidence).WithMany(p => p.CrabTags)
                .HasForeignKey(d => d.ActivationEvidenceId)
                .HasConstraintName("fk_crab_tag_activation_evidence_id");

            entity.HasOne(d => d.CrabItem).WithOne(p => p.CrabTag)
                .HasForeignKey<CrabTag>(d => d.CrabItemId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("fk_crab_tag_crab_item_id");

            entity.HasOne(d => d.PrintedByNavigation).WithMany(p => p.CrabTags)
                .HasForeignKey(d => d.PrintedBy)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("fk_crab_tag_printed_by");
        });

        modelBuilder.Entity<Customer>(entity =>
        {
            entity.HasKey(e => e.UserId).HasName("pk_customer");

            entity.ToTable("customer", tb => tb.HasComment("Khách mua trên gian hàng (kế thừa User)"));

            entity.Property(e => e.UserId)
                .ValueGeneratedNever()
                .HasComment("PK + FK tới app_user")
                .HasColumnName("user_id");
            entity.Property(e => e.CreatedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysdatetimeoffset())", "df_customer_created_at")
                .HasColumnName("created_at");
            entity.Property(e => e.DisplayName)
                .HasMaxLength(100)
                .HasColumnName("display_name");

            entity.HasOne(d => d.User).WithOne(p => p.Customer)
                .HasForeignKey<Customer>(d => d.UserId)
                .HasConstraintName("fk_customer_user_id");
        });

        modelBuilder.Entity<CustomerAddress>(entity =>
        {
            entity.HasIndex(e => e.CustomerId, "ux_customer_address_default")
                .IsUnique()
                .HasFilter("([is_default]=(1))");

            entity.Property(e => e.AddressLine)
                .HasMaxLength(300)
                .HasColumnName("address_line");

            entity.Property(e => e.CreatedAt)
                .HasPrecision(3)
                .HasColumnName("created_at");

            entity.Property(e => e.CustomerId).HasColumnName("customer_id");

            entity.Property(e => e.IsDefault).HasColumnName("is_default");

            entity.Property(e => e.Province)
                .HasMaxLength(100)
                .HasColumnName("province");

            entity.Property(e => e.RecipientName)
                .HasMaxLength(150)
                .HasColumnName("recipient_name");

            entity.Property(e => e.RecipientPhone)
                .HasMaxLength(15)
                .IsUnicode(false)
                .HasColumnName("recipient_phone");

            entity.HasOne(d => d.Customer).WithOne(p => p.CustomerAddress)
                .HasForeignKey<CustomerAddress>(d => d.CustomerId)
                .HasConstraintName("fk_customer_address_customer_id");
        });

        modelBuilder.Entity<DisbursementTranche>(entity =>
        {
            entity.HasIndex(e => new { e.BatchId, e.TrancheNo }, "ux_tranche_no").IsUnique();

            entity.Property(e => e.BatchId).HasColumnName("batch_id");

            entity.Property(e => e.CreatedAt)
                .HasPrecision(3)
                .HasColumnName("created_at");

            entity.Property(e => e.ExplanationDeadline)
                .HasPrecision(3)
                .HasColumnName("explanation_deadline");

            entity.Property(e => e.PlannedAmount)
                .HasColumnType("decimal(18, 0)")
                .HasColumnName("planned_amount");

            entity.Property(e => e.PlannedDate).HasColumnName("planned_date");

            entity.Property(e => e.ReleasedAt)
                .HasPrecision(3)
                .HasColumnName("released_at");

            entity.Property(e => e.RequestedAt)
                .HasPrecision(3)
                .HasColumnName("requested_at");

            entity.Property(e => e.Status)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasColumnName("status");

            entity.Property(e => e.TrancheNo).HasColumnName("tranche_no");

            entity.Property(e => e.UnlockCondition)
                .HasMaxLength(300)
                .HasColumnName("unlock_condition");

            entity.Property(e => e.UpdatedAt)
                .HasPrecision(3)
                .HasColumnName("updated_at");

            entity.HasOne(d => d.Batch).WithMany(p => p.DisbursementTranches)
                .HasForeignKey(d => d.BatchId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("fk_disbursement_tranche_batch_id");
        });

        modelBuilder.Entity<Evidence>(entity =>
        {
            entity.HasIndex(e => e.BatchId, "ix_evidence_batch_id");

            entity.HasIndex(e => e.CaptureRequestId, "ix_evidence_capture_request_id");

            entity.HasIndex(e => e.CrabItemId, "ix_evidence_crab_item_id");

            entity.HasIndex(e => e.PerceptualHash, "ix_evidence_perceptual_hash");

            entity.HasIndex(e => e.Sha256, "ix_evidence_sha256");

            entity.HasIndex(e => e.SlotEventId, "ix_evidence_slot_event_id");

            entity.HasIndex(e => e.SlotId, "ix_evidence_slot_id");

            entity.HasIndex(e => e.TrancheId, "ix_evidence_tranche_id");

            entity.Property(e => e.BatchId).HasColumnName("batch_id");

            entity.Property(e => e.CaptureRequestId)
                .HasColumnName("capture_request_id");

            entity.Property(e => e.CrabItemId).HasColumnName("crab_item_id");

            entity.Property(e => e.CapturedAt)
                .HasPrecision(3)
                .HasColumnName("captured_at");

            entity.Property(e => e.CreatedAt)
                .HasPrecision(3)
                .HasColumnName("created_at");

            entity.Property(e => e.ExplainedAt)
                .HasPrecision(3)
                .HasColumnName("explained_at");

            entity.Property(e => e.Explanation)
                .HasMaxLength(1000)
                .HasColumnName("explanation");

            entity.Property(e => e.FileUri)
                .HasMaxLength(400)
                .HasColumnName("file_uri");

            entity.Property(e => e.Latitude)
                .HasColumnType("decimal(9, 6)")
                .HasColumnName("latitude");

            entity.Property(e => e.Longitude)
                .HasColumnType("decimal(9, 6)")
                .HasColumnName("longitude");

            entity.Property(e => e.MediaType)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasColumnName("media_type");

            entity.Property(e => e.PartnerLabel)
                .HasMaxLength(100)
                .HasColumnName("partner_label");

            entity.Property(e => e.PerceptualHash)
                .HasMaxLength(64)
                .IsUnicode(false)
                .HasColumnName("perceptual_hash");

            entity.Property(e => e.ReceivedAt)
                .HasPrecision(3)
                .HasColumnName("received_at");

            entity.Property(e => e.ReviewStatus)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasColumnName("review_status");

            entity.Property(e => e.RiskScore)
                .HasColumnType("decimal(5, 2)")
                .HasColumnName("risk_score");

            entity.Property(e => e.Sha256)
                .HasMaxLength(64)
                .IsUnicode(false)
                .IsFixedLength()
                .HasColumnName("sha256");

            entity.Property(e => e.SlotEventId).HasColumnName("slot_event_id");

            entity.Property(e => e.SlotId)
                .HasColumnName("slot_id");

            entity.Property(e => e.Source)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasColumnName("source");

            entity.Property(e => e.TrancheId).HasColumnName("tranche_id");

            entity.HasOne(d => d.Batch).WithMany(p => p.Evidences)
                .HasForeignKey(d => d.BatchId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("fk_evidence_batch_id");

            entity.HasOne(d => d.CaptureRequest).WithMany(p => p.Evidences)
                .HasForeignKey(d => d.CaptureRequestId)
                .HasConstraintName("fk_evidence_capture_request_id");

            entity.HasOne(d => d.CrabItem).WithMany()
                .HasForeignKey(d => d.CrabItemId)
                .HasConstraintName("fk_evidence_crab_item_id");

            entity.HasOne(d => d.SlotEvent).WithMany(p => p.Evidences)
                .HasForeignKey(d => d.SlotEventId)
                .HasConstraintName("fk_evidence_slot_event_id");

            entity.HasOne(d => d.Slot).WithMany(p => p.Evidences)
                .HasForeignKey(d => d.SlotId)
                .HasConstraintName("fk_evidence_slot_id");

            entity.HasOne(d => d.Tranche).WithMany(p => p.Evidences)
                .HasForeignKey(d => d.TrancheId)
                .HasConstraintName("fk_evidence_tranche_id");
        });

        modelBuilder.Entity<EvidenceDetection>(entity =>
        {
            entity.HasIndex(e => new { e.EvidenceId, e.ModelVersion }, "ux_evidence_detection_model").IsUnique();

            entity.Property(e => e.BboxJson)
                .HasMaxLength(400)
                .HasColumnName("bbox_json");

            entity.Property(e => e.Confidence)
                .HasColumnType("decimal(5, 4)")
                .HasColumnName("confidence");

            entity.Property(e => e.CrabDetected).HasColumnName("crab_detected");

            entity.Property(e => e.DetectedAt)
                .HasPrecision(3)
                .HasColumnName("detected_at");

            entity.Property(e => e.EvidenceId).HasColumnName("evidence_id");

            entity.Property(e => e.ModelVersion)
                .HasMaxLength(50)
                .IsUnicode(false)
                .HasColumnName("model_version");

            entity.HasOne(d => d.Evidence).WithMany(p => p.EvidenceDetections)
                .HasForeignKey(d => d.EvidenceId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("fk_evidence_detection_evidence_id");
        });

        modelBuilder.Entity<EvidenceReview>(entity =>
        {
            entity.HasIndex(e => e.ReviewerId, "ix_evidence_review_reviewer_id");

            entity.HasIndex(e => new { e.EvidenceId, e.ReviewerId }, "ux_evidence_review_reviewer").IsUnique();

            entity.Property(e => e.EvidenceId).HasColumnName("evidence_id");

            entity.Property(e => e.Note)
                .HasMaxLength(500)
                .HasColumnName("note");

            entity.Property(e => e.ReviewedAt)
                .HasPrecision(3)
                .HasColumnName("reviewed_at");

            entity.Property(e => e.ReviewerId).HasColumnName("reviewer_id");

            entity.Property(e => e.Verdict)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasColumnName("verdict");

            entity.HasOne(d => d.Evidence).WithMany(p => p.EvidenceReviews)
                .HasForeignKey(d => d.EvidenceId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("fk_evidence_review_evidence_id");

            entity.HasOne(d => d.Reviewer).WithMany(p => p.EvidenceReviews)
                .HasForeignKey(d => d.ReviewerId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("fk_evidence_review_reviewer_id");
        });

        modelBuilder.Entity<InvestmentContract>(entity =>
        {
            entity.HasIndex(e => e.TemplateId, "ix_investment_contract_template_id");

            entity.HasIndex(e => e.ContractNo, "uq_investment_contract_contract_no").IsUnique();

            entity.HasIndex(e => e.ContributionId, "uq_investment_contract_contribution_id").IsUnique();

            entity.Property(e => e.ContractNo)
                .HasMaxLength(30)
                .IsUnicode(false)
                .HasColumnName("contract_no");

            entity.Property(e => e.ContributionId).HasColumnName("contribution_id");

            entity.Property(e => e.CreatedAt)
                .HasPrecision(3)
                .HasColumnName("created_at");

            entity.Property(e => e.DraftHash)
                .HasMaxLength(64)
                .IsUnicode(false)
                .IsFixedLength()
                .HasColumnName("draft_hash");

            entity.Property(e => e.FinalFileUri)
                .HasMaxLength(400)
                .HasColumnName("final_file_uri");

            entity.Property(e => e.FinalHash)
                .HasMaxLength(64)
                .IsUnicode(false)
                .IsFixedLength()
                .HasColumnName("final_hash");

            entity.Property(e => e.FullySignedAt)
                .HasPrecision(3)
                .HasColumnName("fully_signed_at");

            entity.Property(e => e.SigningMethod)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasColumnName("signing_method");

            entity.Property(e => e.Status)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasColumnName("status");

            entity.Property(e => e.TemplateId).HasColumnName("template_id");

            entity.Property(e => e.UpdatedAt)
                .HasPrecision(3)
                .HasColumnName("updated_at");

            entity.HasOne(d => d.Contribution).WithOne(p => p.InvestmentContract)
                .HasForeignKey<InvestmentContract>(d => d.ContributionId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("fk_investment_contract_contribution_id");

            entity.HasOne(d => d.Template).WithMany(p => p.InvestmentContracts)
                .HasForeignKey(d => d.TemplateId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("fk_investment_contract_template_id");
        });

        modelBuilder.Entity<Investor>(entity =>
        {
            entity.HasKey(e => e.UserId).HasName("pk_investor");

            entity.ToTable("investor", tb => tb.HasComment("Nhà đầu tư (kế thừa User). Nhà đầu tư bao tiêu là nhà đầu tư có ít nhất một cam kết bao tiêu"));

            entity.Property(e => e.UserId)
                .ValueGeneratedNever()
                .HasComment("PK + FK tới app_user")
                .HasColumnName("user_id");
            entity.Property(e => e.CreatedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysdatetimeoffset())", "df_investor_created_at")
                .HasColumnName("created_at");
            entity.Property(e => e.InvestorKind)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasComment("Giá trị: Individual, Organization")
                .HasDefaultValue("Individual", "df_investor_investor_kind")
                .HasColumnName("investor_kind");
            entity.Property(e => e.OrganizationName)
                .HasMaxLength(200)
                .HasColumnName("organization_name");
            entity.Property(e => e.TaxCode)
                .HasMaxLength(14)
                .IsUnicode(false)
                .HasColumnName("tax_code");
            entity.Property(e => e.VerificationStatus)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasComment("Giá trị: Unverified, Verified, Rejected")
                .HasDefaultValue("Unverified", "df_investor_verification_status")
                .HasColumnName("verification_status");
            entity.Property(e => e.VerifiedAt)
                .HasPrecision(3)
                .HasColumnName("verified_at");

            entity.HasOne(d => d.User).WithOne(p => p.Investor)
                .HasForeignKey<Investor>(d => d.UserId)
                .HasConstraintName("fk_investor_user_id");
        });

        modelBuilder.Entity<KycCheck>(entity =>
        {
            entity.HasIndex(e => e.ReviewedBy, "ix_kyc_check_reviewed_by");

            entity.HasIndex(e => e.UserId, "ix_kyc_check_user_id");

            entity.Property(e => e.CheckType)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasColumnName("check_type");

            entity.Property(e => e.CheckedAt)
                .HasPrecision(3)
                .HasColumnName("checked_at");

            entity.Property(e => e.ConsentAt)
                .HasPrecision(3)
                .HasColumnName("consent_at");

            entity.Property(e => e.CreatedAt)
                .HasPrecision(3)
                .HasColumnName("created_at");

            entity.Property(e => e.FailureReason)
                .HasMaxLength(300)
                .HasColumnName("failure_reason");

            entity.Property(e => e.ProviderRef)
                .HasMaxLength(100)
                .IsUnicode(false)
                .HasColumnName("provider_ref");

            entity.Property(e => e.Result)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasColumnName("result");

            entity.Property(e => e.ReviewedBy).HasColumnName("reviewed_by");

            entity.Property(e => e.UserId).HasColumnName("user_id");

            entity.HasOne(d => d.ReviewedByNavigation).WithMany(p => p.KycCheckReviewedByNavigations)
                .HasForeignKey(d => d.ReviewedBy)
                .HasConstraintName("fk_kyc_check_reviewed_by");

            entity.HasOne(d => d.User).WithMany(p => p.KycCheckUsers)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("fk_kyc_check_user_id");
        });

        modelBuilder.Entity<KycHandoff>(entity =>
        {
            entity.HasIndex(e => e.TokenHash, "ux_kyc_handoff_token_hash").IsUnique();

            entity.HasIndex(e => e.UserId, "ux_kyc_handoff_pending_user").IsUnique().HasFilter("[handoff_status] = 'Pending'");

            entity.HasIndex(e => new { e.UserId, e.CreatedAt }, "ix_kyc_handoff_user_id_created_at");

            entity.Property(e => e.UserId).HasColumnName("user_id");

            entity.Property(e => e.TokenHash).HasMaxLength(64).IsUnicode(false).IsFixedLength().HasColumnName("token_hash");

            entity.Property(e => e.Status).HasMaxLength(16).IsUnicode(false).HasColumnName("handoff_status");

            entity.Property(e => e.CreatedAt).HasPrecision(3).HasColumnName("created_at");

            entity.Property(e => e.ExpiresAt).HasPrecision(3).HasColumnName("expires_at");

            entity.Property(e => e.ClaimedAt).HasPrecision(3).HasColumnName("claimed_at");

            entity.Property(e => e.CancelledAt).HasPrecision(3).HasColumnName("cancelled_at");

            entity.HasOne(d => d.User).WithMany()
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("fk_kyc_handoff_user_id");
        });

        modelBuilder.Entity<OfftakeCommitment>(entity =>
        {
            entity.HasIndex(e => e.BatchId, "ix_offtake_commitment_batch_id");

            entity.HasIndex(e => new { e.ContributionId, e.BatchId }, "ix_offtake_commitment_contribution_id_batch_id");

            entity.HasIndex(e => e.ContributionId, "uq_offtake_commitment_contribution_id").IsUnique();

            entity.Property(e => e.BatchId).HasColumnName("batch_id");

            entity.Property(e => e.CommittedQtyKg)
                .HasColumnType("decimal(12, 3)")
                .HasColumnName("committed_qty_kg");

            entity.Property(e => e.ContributionId).HasColumnName("contribution_id");

            entity.Property(e => e.CreatedAt)
                .HasPrecision(3)
                .HasColumnName("created_at");

            entity.Property(e => e.DepositAmount)
                .HasColumnType("decimal(18, 0)")
                .HasColumnName("deposit_amount");

            entity.Property(e => e.DepositStatus)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasColumnName("deposit_status");

            entity.Property(e => e.FixedUnitPrice)
                .HasColumnType("decimal(18, 0)")
                .HasColumnName("fixed_unit_price");

            entity.Property(e => e.Status)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasColumnName("status");

            entity.Property(e => e.UpdatedAt)
                .HasPrecision(3)
                .HasColumnName("updated_at");

            entity.Property(e => e.WindowExpiresAt)
                .HasPrecision(3)
                .HasColumnName("window_expires_at");

            entity.Property(e => e.WindowOpensAt)
                .HasPrecision(3)
                .HasColumnName("window_opens_at");

            entity.HasOne(d => d.Batch).WithMany(p => p.OfftakeCommitments)
                .HasForeignKey(d => d.BatchId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("fk_offtake_commitment_batch_id");

            entity.HasOne(d => d.Contribution).WithMany(p => p.OfftakeCommitments)
                .HasPrincipalKey(p => new { p.ContributionId, p.BatchId })
                .HasForeignKey(d => new { d.ContributionId, d.BatchId })
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("fk_offtake_commitment_contribution_id_batch_id");
        });

        modelBuilder.Entity<Operator>(entity =>
        {
            entity.HasKey(e => e.OperatorId).HasName("pk_operator");

            entity.ToTable("operator", tb => tb.HasComment("Người nuôi: tổ chức có mã số thuế, vận hành cơ sở RAS"));

            entity.HasIndex(e => e.ApprovedBy, "ix_operator_approved_by");

            entity.HasIndex(e => e.TaxCode, "uq_operator_tax_code").IsUnique();

            entity.Property(e => e.OperatorId).HasColumnName("operator_id");
            entity.Property(e => e.ApprovedAt)
                .HasPrecision(3)
                .HasColumnName("approved_at");
            entity.Property(e => e.ApprovedBy).HasColumnName("approved_by");
            entity.Property(e => e.ApprovedSlotCapacity).HasColumnName("approved_slot_capacity");
            entity.Property(e => e.BusinessRegNo)
                .HasMaxLength(30)
                .IsUnicode(false)
                .HasColumnName("business_reg_no");
            entity.Property(e => e.CreatedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysdatetimeoffset())", "df_operator_created_at")
                .HasColumnName("created_at");
            entity.Property(e => e.FarmAddress)
                .HasMaxLength(300)
                .HasColumnName("farm_address");
            entity.Property(e => e.LegalName)
                .HasMaxLength(200)
                .HasColumnName("legal_name");
            entity.Property(e => e.Status)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasComment("Giá trị: Draft, Submitted, Approved, Rejected, Suspended")
                .HasDefaultValue("Draft", "df_operator_status")
                .HasColumnName("status");
            entity.Property(e => e.SubmittedAt)
                .HasPrecision(3)
                .HasColumnName("submitted_at");
            entity.Property(e => e.TaxCode)
                .HasMaxLength(14)
                .IsUnicode(false)
                .HasColumnName("tax_code");
            entity.Property(e => e.UpdatedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysdatetimeoffset())", "df_operator_updated_at")
                .HasColumnName("updated_at");

            entity.HasOne(d => d.ApprovedByNavigation).WithMany(p => p.Operators)
                .HasForeignKey(d => d.ApprovedBy)
                .HasConstraintName("fk_operator_approved_by");
        });

        modelBuilder.Entity<OperatorMember>(entity =>
        {
            entity.HasKey(e => e.UserId).HasName("pk_operator_member");

            entity.ToTable("operator_member", tb => tb.HasComment("Tài khoản thuộc tổ chức người nuôi (chủ, nhân viên)"));

            entity.HasIndex(e => e.OperatorId, "ix_operator_member_operator_id");

            entity.Property(e => e.UserId)
                .ValueGeneratedNever()
                .HasComment("PK + FK; mỗi tài khoản thuộc tối đa một người nuôi")
                .HasColumnName("user_id");
            entity.Property(e => e.CreatedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysdatetimeoffset())", "df_operator_member_created_at")
                .HasColumnName("created_at");
            entity.Property(e => e.JoinedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysdatetimeoffset())", "df_operator_member_joined_at")
                .HasColumnName("joined_at");
            entity.Property(e => e.MemberRole)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasComment("Giá trị: Owner, Staff")
                .HasDefaultValue("Staff", "df_operator_member_member_role")
                .HasColumnName("member_role");
            entity.Property(e => e.OperatorId).HasColumnName("operator_id");

            entity.HasOne(d => d.Operator).WithMany(p => p.OperatorMembers)
                .HasForeignKey(d => d.OperatorId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("fk_operator_member_operator_id");

            entity.HasOne(d => d.User).WithOne(p => p.OperatorMember)
                .HasForeignKey<OperatorMember>(d => d.UserId)
                .HasConstraintName("fk_operator_member_user_id");
        });

        modelBuilder.Entity<PaymentInstruction>(entity =>
        {
            entity.HasIndex(e => new { e.BatchAccountId, e.Status }, "ix_payment_instruction_batch_account_id_status");

            entity.HasIndex(e => e.ContributionId, "ix_payment_instruction_contribution_id");

            entity.HasIndex(e => e.OrderId, "ix_payment_instruction_order_id");

            entity.HasIndex(e => e.PayoutAccountId, "ix_payment_instruction_payout_account_id");

            entity.HasIndex(e => e.SettlementLineId, "ix_payment_instruction_settlement_line_id");

            entity.HasIndex(e => e.TrancheId, "ix_payment_instruction_tranche_id");

            entity.Property(e => e.Amount)
                .HasColumnType("decimal(18, 0)")
                .HasColumnName("amount");

            entity.Property(e => e.BatchAccountId).HasColumnName("batch_account_id");

            entity.Property(e => e.BeneficiaryNote)
                .HasMaxLength(200)
                .HasColumnName("beneficiary_note");

            entity.Property(e => e.CompletedAt)
                .HasPrecision(3)
                .HasColumnName("completed_at");

            entity.Property(e => e.ContributionId).HasColumnName("contribution_id");

            entity.Property(e => e.CreatedAt)
                .HasPrecision(3)
                .HasColumnName("created_at");

            entity.Property(e => e.InstructionType)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasColumnName("instruction_type");

            entity.Property(e => e.OrderId).HasColumnName("order_id");

            entity.Property(e => e.PayoutAccountId).HasColumnName("payout_account_id");

            entity.Property(e => e.SentAt)
                .HasPrecision(3)
                .HasColumnName("sent_at");

            entity.Property(e => e.SettlementLineId).HasColumnName("settlement_line_id");

            entity.Property(e => e.Status)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasColumnName("status");

            entity.Property(e => e.TrancheId).HasColumnName("tranche_id");

            entity.Property(e => e.UpdatedAt)
                .HasPrecision(3)
                .HasColumnName("updated_at");

            entity.HasOne(d => d.BatchAccount).WithMany(p => p.PaymentInstructions)
                .HasForeignKey(d => d.BatchAccountId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("fk_payment_instruction_batch_account_id");

            entity.HasOne(d => d.Contribution).WithMany(p => p.PaymentInstructions)
                .HasForeignKey(d => d.ContributionId)
                .HasConstraintName("fk_payment_instruction_contribution_id");

            entity.HasOne(d => d.Order).WithMany(p => p.PaymentInstructions)
                .HasForeignKey(d => d.OrderId)
                .HasConstraintName("fk_payment_instruction_order_id");

            entity.HasOne(d => d.PayoutAccount).WithMany(p => p.PaymentInstructions)
                .HasForeignKey(d => d.PayoutAccountId)
                .HasConstraintName("fk_payment_instruction_payout_account_id");

            entity.HasOne(d => d.SettlementLine).WithMany(p => p.PaymentInstructions)
                .HasForeignKey(d => d.SettlementLineId)
                .HasConstraintName("fk_payment_instruction_settlement_line_id");

            entity.HasOne(d => d.Tranche).WithMany(p => p.PaymentInstructions)
                .HasForeignKey(d => d.TrancheId)
                .HasConstraintName("fk_payment_instruction_tranche_id");
        });

        modelBuilder.Entity<PaymentRequest>(entity =>
        {
            entity.HasIndex(e => e.BatchAccountId, "ix_payment_request_batch_account_id");

            entity.HasIndex(e => e.ContributionId, "ix_payment_request_contribution_id");

            entity.HasIndex(e => e.OfftakeId, "ix_payment_request_offtake_id");

            entity.HasIndex(e => e.OrderId, "ix_payment_request_order_id");

            entity.HasIndex(e => e.ReferenceCode, "uq_payment_request_reference_code").IsUnique();

            entity.Property(e => e.Amount)
                .HasColumnType("decimal(18, 0)")
                .HasColumnName("amount");

            entity.Property(e => e.BatchAccountId).HasColumnName("batch_account_id");

            entity.Property(e => e.ContributionId).HasColumnName("contribution_id");

            entity.Property(e => e.CreatedAt)
                .HasPrecision(3)
                .HasColumnName("created_at");

            entity.Property(e => e.ExpiresAt)
                .HasPrecision(3)
                .HasColumnName("expires_at");

            entity.Property(e => e.OfftakeId).HasColumnName("offtake_id");

            entity.Property(e => e.OrderId).HasColumnName("order_id");

            entity.Property(e => e.Purpose)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasColumnName("purpose");

            entity.Property(e => e.ReferenceCode)
                .HasMaxLength(30)
                .IsUnicode(false)
                .HasColumnName("reference_code");

            entity.Property(e => e.Status)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasColumnName("status");

            entity.Property(e => e.UpdatedAt)
                .HasPrecision(3)
                .HasColumnName("updated_at");

            entity.HasOne(d => d.BatchAccount).WithMany(p => p.PaymentRequests)
                .HasForeignKey(d => d.BatchAccountId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("fk_payment_request_batch_account_id");

            entity.HasOne(d => d.Contribution).WithMany(p => p.PaymentRequests)
                .HasForeignKey(d => d.ContributionId)
                .HasConstraintName("fk_payment_request_contribution_id");

            entity.HasOne(d => d.Offtake).WithMany(p => p.PaymentRequests)
                .HasForeignKey(d => d.OfftakeId)
                .HasConstraintName("fk_payment_request_offtake_id");

            entity.HasOne(d => d.Order).WithMany(p => p.PaymentRequests)
                .HasForeignKey(d => d.OrderId)
                .HasConstraintName("fk_payment_request_order_id");
        });

        modelBuilder.Entity<PayoutAccount>(entity =>
        {
            entity.HasIndex(e => e.OwnerOperatorId, "ix_payout_account_owner_operator_id");

            entity.HasIndex(e => e.OwnerUserId, "ix_payout_account_owner_user_id");

            entity.HasIndex(e => new { e.BankCode, e.AccountNo }, "ux_payout_bank_account").IsUnique();

            entity.Property(e => e.AccountHolderName)
                .HasMaxLength(150)
                .HasColumnName("account_holder_name");

            entity.Property(e => e.AccountNo)
                .HasMaxLength(30)
                .IsUnicode(false)
                .HasColumnName("account_no");

            entity.Property(e => e.BankCode)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasColumnName("bank_code");

            entity.Property(e => e.CreatedAt)
                .HasPrecision(3)
                .HasColumnName("created_at");

            entity.Property(e => e.NameMatchStatus)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasColumnName("name_match_status");

            entity.Property(e => e.OwnerOperatorId).HasColumnName("owner_operator_id");

            entity.Property(e => e.OwnerUserId).HasColumnName("owner_user_id");

            entity.Property(e => e.Status)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasColumnName("status");

            entity.Property(e => e.UpdatedAt)
                .HasPrecision(3)
                .HasColumnName("updated_at");

            entity.HasOne(d => d.OwnerOperator).WithMany(p => p.PayoutAccounts)
                .HasForeignKey(d => d.OwnerOperatorId)
                .HasConstraintName("fk_payout_account_owner_operator_id");

            entity.HasOne(d => d.OwnerUser).WithMany(p => p.PayoutAccounts)
                .HasForeignKey(d => d.OwnerUserId)
                .HasConstraintName("fk_payout_account_owner_user_id");
        });

        modelBuilder.Entity<PhysicalSlot>(entity =>
        {
            entity.HasKey(e => e.SlotId).HasName("pk_physical_slot");

            entity.ToTable("physical_slot", tb => tb.HasComment("Hộp nuôi (slot) của người nuôi, nhận diện bằng số hộp in trên nhãn dán lên hộp; dãy, kệ, tầng, cột là tuỳ chọn"));

            entity.HasIndex(e => new { e.OperatorId, e.SlotCode }, "ux_slot_code").IsUnique();

            entity.Property(e => e.SlotId).HasColumnName("slot_id");
            entity.Property(e => e.ColumnNo)
                .HasComment("Cột trên tầng (tuỳ chọn)")
                .HasColumnName("column_no");
            entity.Property(e => e.CreatedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysdatetimeoffset())", "df_physical_slot_created_at")
                .HasColumnName("created_at");
            entity.Property(e => e.OperatorId).HasColumnName("operator_id");
            entity.Property(e => e.RackNo)
                .HasComment("Số kệ (tuỳ chọn)")
                .HasColumnName("rack_no");
            entity.Property(e => e.RowCode)
                .HasMaxLength(10)
                .IsUnicode(false)
                .HasComment("Dãy (tuỳ chọn)")
                .HasColumnName("row_code");
            entity.Property(e => e.SlotCode)
                .HasMaxLength(30)
                .IsUnicode(false)
                .HasComment("Số hộp do người nuôi đánh và in nhãn, ví dụ 0001; duy nhất trong một trại")
                .HasColumnName("slot_code");
            entity.Property(e => e.Status)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasComment("Giá trị: Available, Occupied, Maintenance")
                .HasDefaultValue("Available", "df_physical_slot_status")
                .HasColumnName("status");
            entity.Property(e => e.TierNo)
                .HasComment("Tầng trên kệ (tuỳ chọn)")
                .HasColumnName("tier_no");
            entity.Property(e => e.UpdatedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysdatetimeoffset())", "df_physical_slot_updated_at")
                .HasColumnName("updated_at");

            entity.HasOne(d => d.Operator).WithMany(p => p.PhysicalSlots)
                .HasForeignKey(d => d.OperatorId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("fk_physical_slot_operator_id");
        });

        modelBuilder.Entity<ProductionLog>(entity =>
        {
            entity.HasIndex(e => e.RecordedBy, "ix_production_log_recorded_by");

            entity.HasIndex(e => new { e.BatchId, e.LogDate, e.Source }, "ux_production_log_day").IsUnique();

            entity.Property(e => e.BatchId).HasColumnName("batch_id");

            entity.Property(e => e.CreatedAt)
                .HasPrecision(3)
                .HasColumnName("created_at");

            entity.Property(e => e.FeedKg)
                .HasColumnType("decimal(12, 3)")
                .HasColumnName("feed_kg");

            entity.Property(e => e.LogDate).HasColumnName("log_date");

            entity.Property(e => e.Note)
                .HasMaxLength(500)
                .HasColumnName("note");

            entity.Property(e => e.Ph)
                .HasColumnType("decimal(3, 1)")
                .HasColumnName("ph");

            entity.Property(e => e.PlausibilityFlag)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasColumnName("plausibility_flag");

            entity.Property(e => e.ReceivedAt)
                .HasPrecision(3)
                .HasColumnName("received_at");

            entity.Property(e => e.RecordedBy).HasColumnName("recorded_by");

            entity.Property(e => e.SalinityPpt)
                .HasColumnType("decimal(4, 1)")
                .HasColumnName("salinity_ppt");

            entity.Property(e => e.Source)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasColumnName("source");

            entity.Property(e => e.VerifiedAt)
                .HasPrecision(3)
                .HasColumnName("verified_at");

            entity.Property(e => e.WaterTempC)
                .HasColumnType("decimal(4, 1)")
                .HasColumnName("water_temp_c");

            entity.HasOne(d => d.Batch).WithMany(p => p.ProductionLogs)
                .HasForeignKey(d => d.BatchId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("fk_production_log_batch_id");

            entity.HasOne(d => d.RecordedByNavigation).WithMany(p => p.ProductionLogs)
                .HasForeignKey(d => d.RecordedBy)
                .HasConstraintName("fk_production_log_recorded_by");
        });

        modelBuilder.Entity<ProviderTransaction>(entity =>
        {
            entity.HasIndex(e => new { e.BatchAccountId, e.OccurredAt }, "ix_provider_transaction_batch_account_id_occurred_at");

            entity.HasIndex(e => e.InstructionId, "ix_provider_transaction_instruction_id");

            entity.HasIndex(e => e.PaymentRequestId, "ix_provider_transaction_payment_request_id");

            entity.HasIndex(e => e.ProviderTxnId, "uq_provider_transaction_provider_txn_id").IsUnique();

            entity.Property(e => e.Amount)
                .HasColumnType("decimal(18, 0)")
                .HasColumnName("amount");

            entity.Property(e => e.BatchAccountId).HasColumnName("batch_account_id");

            entity.Property(e => e.Direction)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasColumnName("direction");

            entity.Property(e => e.InstructionId).HasColumnName("instruction_id");

            entity.Property(e => e.MatchStatus)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasColumnName("match_status");

            entity.Property(e => e.OccurredAt)
                .HasPrecision(3)
                .HasColumnName("occurred_at");

            entity.Property(e => e.PaymentRequestId).HasColumnName("payment_request_id");

            entity.Property(e => e.ProviderTxnId)
                .HasMaxLength(80)
                .IsUnicode(false)
                .HasColumnName("provider_txn_id");

            entity.Property(e => e.ReceivedAt)
                .HasPrecision(3)
                .HasColumnName("received_at");

            entity.Property(e => e.ReferenceCode)
                .HasMaxLength(60)
                .IsUnicode(false)
                .HasColumnName("txn_reference_code");

            entity.HasOne(d => d.BatchAccount).WithMany(p => p.ProviderTransactions)
                .HasForeignKey(d => d.BatchAccountId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("fk_provider_transaction_batch_account_id");

            entity.HasOne(d => d.Instruction).WithMany(p => p.ProviderTransactions)
                .HasForeignKey(d => d.InstructionId)
                .HasConstraintName("fk_provider_transaction_instruction_id");

            entity.HasOne(d => d.PaymentRequest).WithMany(p => p.ProviderTransactions)
                .HasForeignKey(d => d.PaymentRequestId)
                .HasConstraintName("fk_provider_transaction_payment_request_id");
        });

        modelBuilder.Entity<RiskAcknowledgement>(entity =>
        {
            entity.HasIndex(e => e.RiskDisclosureId, "ix_risk_acknowledgement_risk_disclosure_id");

            entity.Property(e => e.InvestorId).HasColumnName("investor_id");

            entity.Property(e => e.RiskDisclosureId).HasColumnName("risk_disclosure_id");

            entity.Property(e => e.AcknowledgedAt)
                .HasPrecision(3)
                .HasColumnName("acknowledged_at");

            entity.Property(e => e.CreatedAt)
                .HasPrecision(3)
                .HasColumnName("created_at");

            entity.Property(e => e.ScrolledToEnd)
                .HasColumnName("scrolled_to_end");

            entity.HasOne(d => d.Investor).WithMany(p => p.RiskAcknowledgements)
                .HasForeignKey(d => d.InvestorId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("fk_risk_acknowledgement_investor_id");

            entity.HasOne(d => d.RiskDisclosure).WithMany(p => p.RiskAcknowledgements)
                .HasForeignKey(d => d.RiskDisclosureId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("fk_risk_acknowledgement_risk_disclosure_id");
        });

        modelBuilder.Entity<RiskDisclosure>(entity =>
        {
            entity.HasIndex(e => e.VersionCode, "uq_risk_disclosure_version_code").IsUnique();

            entity.Property(e => e.ContentHash)
                .HasMaxLength(64)
                .IsUnicode(false)
                .IsFixedLength()
                .HasColumnName("content_hash");

            entity.Property(e => e.CreatedAt)
                .HasPrecision(3)
                .HasColumnName("created_at");

            entity.Property(e => e.EffectiveFrom)
                .HasPrecision(3)
                .HasColumnName("effective_from");

            entity.Property(e => e.Status)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasColumnName("status");

            entity.Property(e => e.UpdatedAt)
                .HasPrecision(3)
                .HasColumnName("updated_at");

            entity.Property(e => e.VersionCode)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasColumnName("version_code");
        });

        modelBuilder.Entity<SalesOrder>(entity =>
        {
            entity.HasKey(e => e.OrderId).HasName("pk_sales_order");

            entity.ToTable("sales_order", tb => tb.HasComment("Đơn hàng; mỗi đơn thuộc đúng một lô (giỏ hàng nhiều lô được tách đơn)"));

            entity.HasIndex(e => new { e.BatchId, e.Status }, "ix_sales_order_batch_id_status");

            entity.HasIndex(e => e.CustomerId, "ix_sales_order_customer_id");

            entity.HasIndex(e => e.OfftakeId, "ix_sales_order_offtake_id");

            entity.HasIndex(e => e.OrderNo, "uq_sales_order_order_no").IsUnique();

            entity.HasIndex(e => new { e.OrderId, e.BatchId }, "ux_order_batch").IsUnique();

            entity.Property(e => e.OrderId).HasColumnName("order_id");
            entity.Property(e => e.BalanceDueAt)
                .HasPrecision(3)
                .HasColumnName("balance_due_at");
            entity.Property(e => e.BatchId).HasColumnName("batch_id");
            entity.Property(e => e.CancelReason)
                .HasMaxLength(300)
                .HasColumnName("cancel_reason");
            entity.Property(e => e.CancelledAt)
                .HasPrecision(3)
                .HasColumnName("cancelled_at");
            entity.Property(e => e.CompletedAt)
                .HasPrecision(3)
                .HasColumnName("completed_at");
            entity.Property(e => e.CreatedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysdatetimeoffset())", "df_sales_order_created_at")
                .HasColumnName("created_at");
            entity.Property(e => e.CustomerId)
                .HasComment("Khách lẻ hoặc nhà đầu tư bao tiêu")
                .HasColumnName("customer_id");
            entity.Property(e => e.DeliveredAt)
                .HasPrecision(3)
                .HasColumnName("delivered_at");
            entity.Property(e => e.DepositAmount)
                .HasColumnType("decimal(18, 0)")
                .HasColumnName("deposit_amount");
            entity.Property(e => e.OfftakeId).HasColumnName("offtake_id");
            entity.Property(e => e.OrderNo)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasColumnName("order_no");
            entity.Property(e => e.OrderType)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasComment("Giá trị: Retail, PreOrder, Offtake")
                .HasDefaultValue("Retail", "df_sales_order_order_type")
                .HasColumnName("order_type");
            entity.Property(e => e.PaidAt)
                .HasPrecision(3)
                .HasColumnName("paid_at");
            entity.Property(e => e.PlacedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysdatetimeoffset())", "df_sales_order_placed_at")
                .HasColumnName("placed_at");
            entity.Property(e => e.RecipientName)
                .HasMaxLength(150)
                .HasColumnName("recipient_name");
            entity.Property(e => e.RecipientPhone)
                .HasMaxLength(15)
                .IsUnicode(false)
                .HasColumnName("recipient_phone");
            entity.Property(e => e.ReturnWindowEndsAt)
                .HasPrecision(3)
                .HasColumnName("return_window_ends_at");
            entity.Property(e => e.ShippedAt)
                .HasPrecision(3)
                .HasColumnName("shipped_at");
            entity.Property(e => e.ShippingAddress)
                .HasMaxLength(300)
                .HasColumnName("shipping_address");
            entity.Property(e => e.Status)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasComment("Giá trị: PendingPayment, DepositPaid, Paid, Packed, Shipping, Delivered, Completed, Cancelled, Returned")
                .HasDefaultValue("PendingPayment", "df_sales_order_status")
                .HasColumnName("status");
            entity.Property(e => e.TotalAmount)
                .HasComment("Chốt lúc đặt để đối soát thanh toán")
                .HasColumnType("decimal(18, 0)")
                .HasColumnName("total_amount");
            entity.Property(e => e.UpdatedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysdatetimeoffset())", "df_sales_order_updated_at")
                .HasColumnName("updated_at");

            entity.HasOne(d => d.Batch).WithMany(p => p.SalesOrders)
                .HasForeignKey(d => d.BatchId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("fk_sales_order_batch_id");

            entity.HasOne(d => d.Customer).WithMany(p => p.SalesOrders)
                .HasForeignKey(d => d.CustomerId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("fk_sales_order_customer_id");

            entity.HasOne(d => d.Offtake).WithMany(p => p.SalesOrders)
                .HasForeignKey(d => d.OfftakeId)
                .HasConstraintName("fk_sales_order_offtake_id");
        });

        modelBuilder.Entity<Settlement>(entity =>
        {
            entity.HasIndex(e => e.ApprovedBy, "ix_settlement_approved_by");

            entity.HasIndex(e => e.BatchId, "uq_settlement_batch_id").IsUnique();

            entity.Property(e => e.ActualRevenue)
                .HasColumnType("decimal(18, 0)")
                .HasColumnName("actual_revenue");

            entity.Property(e => e.ApprovedAt)
                .HasPrecision(3)
                .HasColumnName("approved_at");

            entity.Property(e => e.ApprovedBy).HasColumnName("approved_by");

            entity.Property(e => e.BatchId).HasColumnName("batch_id");

            entity.Property(e => e.CreatedAt)
                .HasPrecision(3)
                .HasColumnName("created_at");

            entity.Property(e => e.DepreciationAmount)
                .HasColumnType("decimal(18, 0)")
                .HasColumnName("depreciation_amount");

            entity.Property(e => e.FeedbackDeadline)
                .HasPrecision(3)
                .HasColumnName("feedback_deadline");

            entity.Property(e => e.LockedStandardCost)
                .HasColumnType("decimal(18, 0)")
                .HasColumnName("locked_standard_cost");

            entity.Property(e => e.OperatorRemuneration)
                .HasColumnType("decimal(18, 0)")
                .HasColumnName("operator_remuneration");

            entity.Property(e => e.OperatorSharePct)
                .HasColumnType("decimal(5, 2)")
                .HasColumnName("operator_share_pct");

            entity.Property(e => e.ProposedAt)
                .HasPrecision(3)
                .HasColumnName("proposed_at");

            entity.Property(e => e.RevenuePool)
                .HasColumnType("decimal(18, 0)")
                .HasColumnName("revenue_pool");

            entity.Property(e => e.RevisionNo)
                .HasColumnName("revision_no");

            entity.Property(e => e.Status)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasColumnName("status");

            entity.Property(e => e.TaxTotal)
                .HasColumnType("decimal(18, 0)")
                .HasColumnName("tax_total");

            entity.Property(e => e.UpdatedAt)
                .HasPrecision(3)
                .HasColumnName("updated_at");

            entity.HasOne(d => d.ApprovedByNavigation).WithMany(p => p.Settlements)
                .HasForeignKey(d => d.ApprovedBy)
                .HasConstraintName("fk_settlement_approved_by");

            entity.HasOne(d => d.Batch).WithOne(p => p.Settlement)
                .HasForeignKey<Settlement>(d => d.BatchId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("fk_settlement_batch_id");
        });

        modelBuilder.Entity<SettlementFeedback>(entity =>
        {
            entity.HasIndex(e => e.SettlementId, "ix_settlement_feedback_settlement_id");

            entity.HasIndex(e => e.UserId, "ix_settlement_feedback_user_id");

            entity.Property(e => e.Content)
                .HasMaxLength(1000)
                .HasColumnName("content");

            entity.Property(e => e.CreatedAt)
                .HasPrecision(3)
                .HasColumnName("created_at");

            entity.Property(e => e.RespondedAt)
                .HasPrecision(3)
                .HasColumnName("responded_at");

            entity.Property(e => e.Response)
                .HasMaxLength(1000)
                .HasColumnName("response");

            entity.Property(e => e.SettlementId).HasColumnName("settlement_id");

            entity.Property(e => e.Status)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasColumnName("status");

            entity.Property(e => e.UpdatedAt)
                .HasPrecision(3)
                .HasColumnName("updated_at");

            entity.Property(e => e.UserId).HasColumnName("user_id");

            entity.HasOne(d => d.Settlement).WithMany(p => p.SettlementFeedbacks)
                .HasForeignKey(d => d.SettlementId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("fk_settlement_feedback_settlement_id");

            entity.HasOne(d => d.User).WithMany(p => p.SettlementFeedbacks)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("fk_settlement_feedback_user_id");
        });

        modelBuilder.Entity<SettlementLine>(entity =>
        {
            entity.HasIndex(e => e.BatchId, "ix_settlement_line_batch_id");

            entity.HasIndex(e => new { e.BatchId, e.InvestorId }, "ix_settlement_line_batch_id_investor_id");

            entity.HasIndex(e => e.InvestorId, "ix_settlement_line_investor_id");

            entity.HasIndex(e => new { e.SettlementId, e.InvestorId }, "ux_settlement_line_investor").IsUnique();

            entity.Property(e => e.BatchId).HasColumnName("batch_id");

            entity.Property(e => e.CapitalReturn)
                .HasColumnType("decimal(18, 0)")
                .HasColumnName("capital_return");

            entity.Property(e => e.CreatedAt)
                .HasPrecision(3)
                .HasColumnName("created_at");

            entity.Property(e => e.InKindQtyKg)
                .HasColumnType("decimal(12, 3)")
                .HasColumnName("in_kind_qty_kg");

            entity.Property(e => e.InvestorId).HasColumnName("investor_id");

            entity.Property(e => e.NetPayout)
                .HasColumnType("decimal(18, 0)")
                .HasColumnName("net_payout");

            entity.Property(e => e.ProfitShare)
                .HasColumnType("decimal(18, 0)")
                .HasColumnName("profit_share");

            entity.Property(e => e.SettlementId).HasColumnName("settlement_id");

            entity.Property(e => e.TaxWithheld)
                .HasColumnType("decimal(18, 0)")
                .HasColumnName("tax_withheld");

            entity.HasOne(d => d.Batch).WithMany(p => p.SettlementLines)
                .HasForeignKey(d => d.BatchId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("fk_settlement_line_batch_id");

            entity.HasOne(d => d.Investor).WithMany(p => p.SettlementLines)
                .HasForeignKey(d => d.InvestorId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("fk_settlement_line_investor_id");

            entity.HasOne(d => d.Settlement).WithMany(p => p.SettlementLines)
                .HasForeignKey(d => d.SettlementId)
                .HasConstraintName("fk_settlement_line_settlement_id");

            entity.HasOne(d => d.CapitalShare).WithMany(p => p.SettlementLines)
                .HasForeignKey(d => new { d.BatchId, d.InvestorId })
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("fk_settlement_line_batch_id_investor_id");
        });

        modelBuilder.Entity<SlotAllocation>(entity =>
        {
            entity.HasKey(e => e.SlotAllocationId).HasName("pk_slot_allocation");

            entity.ToTable("slot_allocation", tb => tb.HasComment("Gán ô nuôi cho lô; mỗi ô chỉ thuộc một lô đang hoạt động"));

            entity.HasIndex(e => e.BatchId, "ix_slot_allocation_batch_id");

            entity.HasIndex(e => e.SlotId, "ux_slot_active")
                .IsUnique()
                .HasFilter("([released_at] IS NULL)");

            entity.HasIndex(e => new { e.SlotAllocationId, e.BatchId }, "ux_slot_allocation_batch_slot").IsUnique();

            entity.Property(e => e.SlotAllocationId).HasColumnName("slot_allocation_id");
            entity.Property(e => e.AllocatedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysdatetimeoffset())", "df_slot_allocation_allocated_at")
                .HasColumnName("allocated_at");
            entity.Property(e => e.BatchId).HasColumnName("batch_id");
            entity.Property(e => e.CreatedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysdatetimeoffset())", "df_slot_allocation_created_at")
                .HasColumnName("created_at");
            entity.Property(e => e.ReleasedAt)
                .HasPrecision(3)
                .HasColumnName("released_at");
            entity.Property(e => e.SlotId).HasColumnName("slot_id");

            entity.HasOne(d => d.Batch).WithMany(p => p.SlotAllocations)
                .HasForeignKey(d => d.BatchId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("fk_slot_allocation_batch_id");

            entity.HasOne(d => d.Slot).WithOne(p => p.SlotAllocation)
                .HasForeignKey<SlotAllocation>(d => d.SlotId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("fk_slot_allocation_slot_id");
        });

        modelBuilder.Entity<SlotEvent>(entity =>
        {
            entity.HasKey(e => e.SlotEventId).HasName("pk_slot_event");

            entity.ToTable("slot_event", tb => tb.HasComment("Sự kiện của từng ô nuôi: thả giống, lột xác, hao hụt, thả bù, thu hoạch"));

            entity.HasIndex(e => new { e.BatchId, e.OccurredAt }, "ix_slot_event_batch_id_occurred_at");

            entity.HasIndex(e => new { e.SlotAllocationId, e.BatchId }, "ix_slot_event_slot_allocation_id_batch_id");

            entity.Property(e => e.SlotEventId).HasColumnName("slot_event_id");
            entity.Property(e => e.BatchId).HasColumnName("batch_id");
            entity.Property(e => e.EventType)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasComment("Giá trị: Stocked, Molted, Mortality, Restocked, Harvested, Relocated")
                .HasColumnName("event_type");
            entity.Property(e => e.Note)
                .HasMaxLength(300)
                .HasColumnName("note");
            entity.Property(e => e.OccurredAt)
                .HasPrecision(3)
                .HasColumnName("occurred_at");
            entity.Property(e => e.Quantity)
                .HasDefaultValue((short)1, "df_slot_event_quantity")
                .HasColumnName("quantity");
            entity.Property(e => e.ReceivedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysdatetimeoffset())", "df_slot_event_received_at")
                .HasColumnName("received_at");
            entity.Property(e => e.SlotAllocationId).HasColumnName("slot_allocation_id");
            entity.Property(e => e.Source)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasComment("Giá trị: FarmApi, Manual")
                .HasColumnName("source");

            entity.HasOne(d => d.Batch).WithMany(p => p.SlotEvents)
                .HasForeignKey(d => d.BatchId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("fk_slot_event_batch_id");

            entity.HasOne(d => d.SlotAllocation).WithMany(p => p.SlotEvents)
                .HasPrincipalKey(p => new { p.SlotAllocationId, p.BatchId })
                .HasForeignKey(d => new { d.SlotAllocationId, d.BatchId })
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("fk_slot_event_slot_allocation_id_batch_id");
        });

        modelBuilder.Entity<StandardCostItem>(entity =>
        {
            entity.HasIndex(e => e.CostVersionId, "ix_standard_cost_item_cost_version_id");

            entity.Property(e => e.Category)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasColumnName("category");

            entity.Property(e => e.CostVersionId).HasColumnName("cost_version_id");

            entity.Property(e => e.CreatedAt)
                .HasPrecision(3)
                .HasColumnName("created_at");

            entity.Property(e => e.Description)
                .HasMaxLength(200)
                .HasColumnName("description");

            entity.Property(e => e.Quantity)
                .HasColumnType("decimal(12, 3)")
                .HasColumnName("quantity");

            entity.Property(e => e.TrancheNo)
                .HasColumnName("tranche_no");

            entity.Property(e => e.Unit)
                .HasMaxLength(20)
                .HasColumnName("unit");

            entity.Property(e => e.UnitPrice)
                .HasColumnType("decimal(18, 0)")
                .HasColumnName("unit_price");

            entity.HasOne(d => d.CostVersion).WithMany(p => p.StandardCostItems)
                .HasForeignKey(d => d.CostVersionId)
                .HasConstraintName("fk_standard_cost_item_cost_version_id");
        });

        modelBuilder.Entity<StandardCostVersion>(entity =>
        {
            entity.HasIndex(e => e.ApprovedBy, "ix_standard_cost_version_approved_by");

            entity.HasIndex(e => e.BatchId, "ux_cost_version_locked")
                .IsUnique()
                .HasFilter("([status]='Locked')");

            entity.HasIndex(e => new { e.BatchId, e.VersionNo }, "ux_cost_version_no").IsUnique();

            entity.Property(e => e.ApprovedAt)
                .HasPrecision(3)
                .HasColumnName("approved_at");

            entity.Property(e => e.ApprovedBy).HasColumnName("approved_by");

            entity.Property(e => e.BatchId).HasColumnName("batch_id");

            entity.Property(e => e.CreatedAt)
                .HasPrecision(3)
                .HasColumnName("created_at");

            entity.Property(e => e.LockedAt)
                .HasPrecision(3)
                .HasColumnName("locked_at");

            entity.Property(e => e.Status)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasColumnName("status");

            entity.Property(e => e.SubmittedAt)
                .HasPrecision(3)
                .HasColumnName("submitted_at");

            entity.Property(e => e.UpdatedAt)
                .HasPrecision(3)
                .HasColumnName("updated_at");

            entity.Property(e => e.VersionNo).HasColumnName("version_no");

            entity.HasOne(d => d.ApprovedByNavigation).WithMany(p => p.StandardCostVersions)
                .HasForeignKey(d => d.ApprovedBy)
                .HasConstraintName("fk_standard_cost_version_approved_by");

            entity.HasOne(d => d.Batch).WithOne(p => p.StandardCostVersion)
                .HasForeignKey<StandardCostVersion>(d => d.BatchId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("fk_standard_cost_version_batch_id");
        });

        modelBuilder.Entity<VBatchFundingProgress>(entity =>
        {
            entity
                .HasNoKey()
                .ToView("v_batch_funding_progress");

            entity.Property(e => e.BatchCode)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasColumnName("batch_code");
            entity.Property(e => e.BatchId).HasColumnName("batch_id");
            entity.Property(e => e.ConfirmedCapital)
                .HasColumnType("decimal(38, 0)")
                .HasColumnName("confirmed_capital");
            entity.Property(e => e.FundingDeadline)
                .HasPrecision(3)
                .HasColumnName("funding_deadline");
            entity.Property(e => e.InvestorCount).HasColumnName("investor_count");
            entity.Property(e => e.MaxCapital)
                .HasColumnType("decimal(18, 0)")
                .HasColumnName("max_capital");
            entity.Property(e => e.MinViableCapital)
                .HasColumnType("decimal(18, 0)")
                .HasColumnName("min_viable_capital");
            entity.Property(e => e.PctOfTarget)
                .HasColumnType("decimal(7, 2)")
                .HasColumnName("pct_of_target");
            entity.Property(e => e.ReachedMinViable).HasColumnName("reached_min_viable");
            entity.Property(e => e.ReservedCapital)
                .HasColumnType("decimal(38, 0)")
                .HasColumnName("reserved_capital");
            entity.Property(e => e.Status)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasColumnName("status");
            entity.Property(e => e.TargetCapital)
                .HasColumnType("decimal(18, 0)")
                .HasColumnName("target_capital");
        });

        modelBuilder.Entity<VInvestorPortfolio>(entity =>
        {
            entity
                .HasNoKey()
                .ToView("v_investor_portfolio");

            entity.Property(e => e.BatchCode)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasColumnName("batch_code");
            entity.Property(e => e.BatchId).HasColumnName("batch_id");
            entity.Property(e => e.BatchStatus)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasColumnName("batch_status");
            entity.Property(e => e.CapitalRatio)
                .HasColumnType("decimal(9, 6)")
                .HasColumnName("capital_ratio");
            entity.Property(e => e.CapitalReturn)
                .HasColumnType("decimal(18, 0)")
                .HasColumnName("capital_return");
            entity.Property(e => e.ConfirmedAmount)
                .HasColumnType("decimal(18, 0)")
                .HasColumnName("confirmed_amount");
            entity.Property(e => e.FullName)
                .HasMaxLength(150)
                .HasColumnName("full_name");
            entity.Property(e => e.InKindQtyKg)
                .HasColumnType("decimal(12, 3)")
                .HasColumnName("in_kind_qty_kg");
            entity.Property(e => e.InvestorId).HasColumnName("investor_id");
            entity.Property(e => e.NetPayout)
                .HasColumnType("decimal(18, 0)")
                .HasColumnName("net_payout");
            entity.Property(e => e.ProfitShare)
                .HasColumnType("decimal(18, 0)")
                .HasColumnName("profit_share");
            entity.Property(e => e.SettlementStatus)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasColumnName("settlement_status");
            entity.Property(e => e.TaxWithheld)
                .HasColumnType("decimal(18, 0)")
                .HasColumnName("tax_withheld");
        });

        modelBuilder.Entity<VOverdueAlert>(entity =>
        {
            entity
                .HasNoKey()
                .ToView("v_overdue_alerts");

            entity.Property(e => e.AckDeadline)
                .HasPrecision(3)
                .HasColumnName("ack_deadline");
            entity.Property(e => e.AlertId).HasColumnName("alert_id");
            entity.Property(e => e.AlertType)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasColumnName("alert_type");
            entity.Property(e => e.BatchCode)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasColumnName("batch_code");
            entity.Property(e => e.BatchId).HasColumnName("batch_id");
            entity.Property(e => e.MinutesOverdue).HasColumnName("minutes_overdue");
            entity.Property(e => e.RaisedAt)
                .HasPrecision(3)
                .HasColumnName("raised_at");
            entity.Property(e => e.Severity)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasColumnName("severity");
        });

        modelBuilder.Entity<VSettlementReconciliation>(entity =>
        {
            entity
                .HasNoKey()
                .ToView("v_settlement_reconciliation");

            entity.Property(e => e.ActualRevenue)
                .HasColumnType("decimal(18, 0)")
                .HasColumnName("actual_revenue");
            entity.Property(e => e.BatchId).HasColumnName("batch_id");
            entity.Property(e => e.Difference)
                .HasColumnType("decimal(38, 0)")
                .HasColumnName("difference");
            entity.Property(e => e.Distributable)
                .HasColumnType("decimal(19, 0)")
                .HasColumnName("distributable");
            entity.Property(e => e.LineCount).HasColumnName("line_count");
            entity.Property(e => e.LockedStandardCost)
                .HasColumnType("decimal(18, 0)")
                .HasColumnName("locked_standard_cost");
            entity.Property(e => e.OperatorRemuneration)
                .HasColumnType("decimal(18, 0)")
                .HasColumnName("operator_remuneration");
            entity.Property(e => e.RevenuePool)
                .HasColumnType("decimal(18, 0)")
                .HasColumnName("revenue_pool");
            entity.Property(e => e.SettlementId).HasColumnName("settlement_id");
            entity.Property(e => e.SumCapitalReturn)
                .HasColumnType("decimal(38, 0)")
                .HasColumnName("sum_capital_return");
            entity.Property(e => e.SumProfitShare)
                .HasColumnType("decimal(38, 0)")
                .HasColumnName("sum_profit_share");
            entity.Property(e => e.SumTaxWithheld)
                .HasColumnType("decimal(38, 0)")
                .HasColumnName("sum_tax_withheld");
        });

        OnModelCreatingPartial(modelBuilder);
    }

    partial void OnModelCreatingPartial(ModelBuilder modelBuilder);
}
