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

    public virtual DbSet<Complaint> Complaints { get; set; }

    public virtual DbSet<ContractSignature> ContractSignatures { get; set; }

    public virtual DbSet<ContractTemplate> ContractTemplates { get; set; }

    public virtual DbSet<Contribution> Contributions { get; set; }

    public virtual DbSet<CrabItem> CrabItems { get; set; }

    public virtual DbSet<CrabItemEvent> CrabItemEvents { get; set; }

    public virtual DbSet<CrabTag> CrabTags { get; set; }

    public virtual DbSet<Customer> Customers { get; set; }

    public virtual DbSet<CustomerAddress> CustomerAddresses { get; set; }

    public virtual DbSet<DisbursementTranche> DisbursementTranches { get; set; }

    public virtual DbSet<Evidence> Evidences { get; set; }

    public virtual DbSet<EvidenceDetection> EvidenceDetections { get; set; }

    public virtual DbSet<EvidenceReview> EvidenceReviews { get; set; }

    public virtual DbSet<FeeTier> FeeTiers { get; set; }

    public virtual DbSet<Harvest> Harvests { get; set; }

    public virtual DbSet<InvestmentContract> InvestmentContracts { get; set; }

    public virtual DbSet<Investor> Investors { get; set; }

    public virtual DbSet<KycCheck> KycChecks { get; set; }

    public virtual DbSet<OfftakeCommitment> OfftakeCommitments { get; set; }

    public virtual DbSet<Operator> Operators { get; set; }

    public virtual DbSet<OperatorMember> OperatorMembers { get; set; }

    public virtual DbSet<OrderLine> OrderLines { get; set; }

    public virtual DbSet<PaymentInstruction> PaymentInstructions { get; set; }

    public virtual DbSet<PaymentRequest> PaymentRequests { get; set; }

    public virtual DbSet<PayoutAccount> PayoutAccounts { get; set; }

    public virtual DbSet<PhysicalSlot> PhysicalSlots { get; set; }

    public virtual DbSet<PriceHistory> PriceHistories { get; set; }

    public virtual DbSet<ProductGrade> ProductGrades { get; set; }

    public virtual DbSet<ProductListing> ProductListings { get; set; }

    public virtual DbSet<ProductRating> ProductRatings { get; set; }

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

    public virtual DbSet<StockReservation> StockReservations { get; set; }

    public virtual DbSet<TagScan> TagScans { get; set; }

    public virtual DbSet<VBatchActualRevenue> VBatchActualRevenues { get; set; }

    public virtual DbSet<VBatchCommitmentCap> VBatchCommitmentCaps { get; set; }

    public virtual DbSet<VBatchFundingProgress> VBatchFundingProgresses { get; set; }

    public virtual DbSet<VCrabCountReconciliation> VCrabCountReconciliations { get; set; }

    public virtual DbSet<VInvestorPortfolio> VInvestorPortfolios { get; set; }

    public virtual DbSet<VOperatorReputation> VOperatorReputations { get; set; }

    public virtual DbSet<VOverdueAlert> VOverdueAlerts { get; set; }

    public virtual DbSet<VSettlementReconciliation> VSettlementReconciliations { get; set; }

    public virtual DbSet<VTraceability> VTraceabilities { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Alert>(entity =>
        {
            entity.HasKey(e => e.AlertId).HasName("pk_alert");

            entity.ToTable("alert", tb => tb.HasComment("Cảnh báo vận hành, có hạn xác nhận và tự leo thang"));

            entity.HasIndex(e => e.AcknowledgedBy, "ix_alert_acknowledged_by");

            entity.HasIndex(e => new { e.BatchId, e.Status }, "ix_alert_batch_id_status");

            entity.Property(e => e.AlertId).HasColumnName("alert_id");
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
                .HasComment("Giá trị: Mortality, WaterQuality, MilestoneDelay, LowStock, DataSilence, EvidenceFlag")
                .HasColumnName("alert_type");
            entity.Property(e => e.BatchId).HasColumnName("batch_id");
            entity.Property(e => e.CreatedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysdatetimeoffset())", "df_alert_created_at")
                .HasColumnName("created_at");
            entity.Property(e => e.EscalatedAt)
                .HasPrecision(3)
                .HasColumnName("escalated_at");
            entity.Property(e => e.Message)
                .HasMaxLength(300)
                .HasColumnName("message");
            entity.Property(e => e.RaisedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysdatetimeoffset())", "df_alert_raised_at")
                .HasColumnName("raised_at");
            entity.Property(e => e.ResponseNote)
                .HasMaxLength(300)
                .HasColumnName("response_note");
            entity.Property(e => e.Severity)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasComment("Giá trị: Low, Medium, High, Critical")
                .HasColumnName("severity");
            entity.Property(e => e.Status)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasComment("Giá trị: Open, Acknowledged, Escalated, Resolved")
                .HasDefaultValue("Open", "df_alert_status")
                .HasColumnName("status");
            entity.Property(e => e.UpdatedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysdatetimeoffset())", "df_alert_updated_at")
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
            entity.HasKey(e => new { e.UserId, e.RoleCode }).HasName("pk_app_user_role");

            entity.ToTable("app_user_role", tb => tb.HasComment("Vai trò của tài khoản (một người có thể vừa là nhà đầu tư vừa là khách hàng)"));

            entity.Property(e => e.UserId).HasColumnName("user_id");
            entity.Property(e => e.RoleCode)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasComment("Giá trị: Investor, Customer, OperatorMember, PlatformAdmin, EvidenceReviewer (quyền Kiểm định viên, không phải tác nhân mới)")
                .HasColumnName("role_code");
            entity.Property(e => e.CreatedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysdatetimeoffset())", "df_app_user_role_created_at")
                .HasColumnName("created_at");
            entity.Property(e => e.GrantedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysdatetimeoffset())", "df_app_user_role_granted_at")
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

            entity.HasIndex(e => e.FeeTierId, "ix_batch_fee_tier_id");

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
            entity.Property(e => e.FeeTierId)
                .HasComment("Bậc phí áp dụng, chốt khi duyệt lô")
                .HasColumnName("fee_tier_id");
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

            entity.HasOne(d => d.FeeTier).WithMany(p => p.Batches)
                .HasForeignKey(d => d.FeeTierId)
                .HasConstraintName("fk_batch_fee_tier_id");

            entity.HasOne(d => d.Operator).WithMany(p => p.Batches)
                .HasForeignKey(d => d.OperatorId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("fk_batch_operator_id");
        });

        modelBuilder.Entity<BatchAccount>(entity =>
        {
            entity.HasKey(e => e.BatchAccountId).HasName("pk_batch_account");

            entity.ToTable("batch_account", tb => tb.HasComment("Tài khoản chuyên dùng của lô do tổ chức trung gian thanh toán giữ hộ"));

            entity.HasIndex(e => e.BatchId, "uq_batch_account_batch_id").IsUnique();

            entity.HasIndex(e => e.ProviderAccountNo, "uq_batch_account_provider_account_no").IsUnique();

            entity.Property(e => e.BatchAccountId).HasColumnName("batch_account_id");
            entity.Property(e => e.BatchId).HasColumnName("batch_id");
            entity.Property(e => e.ClosedAt)
                .HasPrecision(3)
                .HasColumnName("closed_at");
            entity.Property(e => e.CreatedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysdatetimeoffset())", "df_batch_account_created_at")
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
                .HasComment("Giá trị: Requested, Open, Frozen, Closed")
                .HasDefaultValue("Requested", "df_batch_account_status")
                .HasColumnName("status");
            entity.Property(e => e.UpdatedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysdatetimeoffset())", "df_batch_account_updated_at")
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
            entity.HasKey(e => e.CaptureRequestId).HasName("pk_capture_request");

            entity.ToTable("capture_request", tb => tb.HasComment("Yêu cầu chụp đột xuất một ô, có hạn; hệ thống chọn ô ngẫu nhiên"));

            entity.HasIndex(e => new { e.BatchId, e.Status }, "ix_capture_request_batch_id_status");

            entity.HasIndex(e => e.SlotId, "ix_capture_request_slot_id");

            entity.Property(e => e.CaptureRequestId).HasColumnName("capture_request_id");
            entity.Property(e => e.BatchId).HasColumnName("batch_id");
            entity.Property(e => e.CreatedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysdatetimeoffset())", "df_capture_request_created_at")
                .HasColumnName("created_at");
            entity.Property(e => e.DueAt)
                .HasPrecision(3)
                .HasColumnName("due_at");
            entity.Property(e => e.FulfilledAt)
                .HasPrecision(3)
                .HasColumnName("fulfilled_at");
            entity.Property(e => e.RequestedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysdatetimeoffset())", "df_capture_request_requested_at")
                .HasColumnName("requested_at");
            entity.Property(e => e.SlotId).HasColumnName("slot_id");
            entity.Property(e => e.Status)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasComment("Giá trị: Open, Fulfilled, Expired")
                .HasDefaultValue("Open", "df_capture_request_status")
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

        modelBuilder.Entity<Complaint>(entity =>
        {
            entity.HasKey(e => e.ComplaintId).HasName("pk_complaint");

            entity.ToTable("complaint", tb => tb.HasComment("Khiếu nại đơn hàng và cách giải quyết"));

            entity.HasIndex(e => e.OrderId, "ix_complaint_order_id");

            entity.HasIndex(e => e.ResolvedBy, "ix_complaint_resolved_by");

            entity.Property(e => e.ComplaintId).HasColumnName("complaint_id");
            entity.Property(e => e.ComplaintType)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasComment("Giá trị: LateDelivery, WrongGrade, Damaged, NotReceived, Other")
                .HasColumnName("complaint_type");
            entity.Property(e => e.CreatedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysdatetimeoffset())", "df_complaint_created_at")
                .HasColumnName("created_at");
            entity.Property(e => e.Description)
                .HasMaxLength(1000)
                .HasColumnName("description");
            entity.Property(e => e.EvidenceUri)
                .HasMaxLength(400)
                .HasColumnName("evidence_uri");
            entity.Property(e => e.OpenedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysdatetimeoffset())", "df_complaint_opened_at")
                .HasColumnName("opened_at");
            entity.Property(e => e.OrderId).HasColumnName("order_id");
            entity.Property(e => e.RefundAmount)
                .HasColumnType("decimal(18, 0)")
                .HasColumnName("refund_amount");
            entity.Property(e => e.Resolution)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasComment("Giá trị: Refund, Compensation, Replacement, NoAction")
                .HasColumnName("resolution");
            entity.Property(e => e.ResolvedAt)
                .HasPrecision(3)
                .HasColumnName("resolved_at");
            entity.Property(e => e.ResolvedBy).HasColumnName("resolved_by");
            entity.Property(e => e.Status)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasComment("Giá trị: Open, OperatorResponded, Escalated, Resolved, Rejected")
                .HasDefaultValue("Open", "df_complaint_status")
                .HasColumnName("status");
            entity.Property(e => e.UpdatedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysdatetimeoffset())", "df_complaint_updated_at")
                .HasColumnName("updated_at");

            entity.HasOne(d => d.Order).WithMany(p => p.Complaints)
                .HasForeignKey(d => d.OrderId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("fk_complaint_order_id");

            entity.HasOne(d => d.ResolvedByNavigation).WithMany(p => p.Complaints)
                .HasForeignKey(d => d.ResolvedBy)
                .HasConstraintName("fk_complaint_resolved_by");
        });

        modelBuilder.Entity<ContractSignature>(entity =>
        {
            entity.HasKey(e => e.SignatureId).HasName("pk_contract_signature");

            entity.ToTable("contract_signature", tb => tb.HasComment("Từng chữ ký trên hợp đồng (người nuôi ký trước, nhà đầu tư ký sau)"));

            entity.HasIndex(e => e.SignerUserId, "ix_contract_signature_signer_user_id");

            entity.HasIndex(e => new { e.ContractId, e.SigningOrder }, "ux_signature_order").IsUnique();

            entity.HasIndex(e => new { e.ContractId, e.SignerRole }, "ux_signature_role").IsUnique();

            entity.Property(e => e.SignatureId).HasColumnName("signature_id");
            entity.Property(e => e.ContractId).HasColumnName("contract_id");
            entity.Property(e => e.CreatedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysdatetimeoffset())", "df_contract_signature_created_at")
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
                .HasComment("Giá trị: Operator, Investor")
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
            entity.HasKey(e => e.TemplateId).HasName("pk_contract_template");

            entity.ToTable("contract_template", tb => tb.HasComment("Phiên bản mẫu hợp đồng hợp tác"));

            entity.HasIndex(e => e.VersionCode, "uq_contract_template_version_code").IsUnique();

            entity.Property(e => e.TemplateId).HasColumnName("template_id");
            entity.Property(e => e.ContentHash)
                .HasMaxLength(64)
                .IsUnicode(false)
                .IsFixedLength()
                .HasColumnName("content_hash");
            entity.Property(e => e.CreatedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysdatetimeoffset())", "df_contract_template_created_at")
                .HasColumnName("created_at");
            entity.Property(e => e.EffectiveFrom)
                .HasPrecision(3)
                .HasColumnName("effective_from");
            entity.Property(e => e.Status)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasComment("Giá trị: Draft, Active, Retired")
                .HasDefaultValue("Draft", "df_contract_template_status")
                .HasColumnName("status");
            entity.Property(e => e.UpdatedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysdatetimeoffset())", "df_contract_template_updated_at")
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

            entity.HasIndex(e => e.GradeId, "ix_crab_item_grade_id");

            entity.HasIndex(e => e.HarvestId, "ix_crab_item_harvest_id");

            entity.HasIndex(e => new { e.HarvestId, e.BatchId }, "ix_crab_item_harvest_id_batch_id");

            entity.HasIndex(e => e.OrderLineId, "ix_crab_item_order_line_id");

            entity.HasIndex(e => new { e.OrderLineId, e.BatchId }, "ix_crab_item_order_line_id_batch_id");

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
            entity.Property(e => e.GradeId).HasColumnName("grade_id");
            entity.Property(e => e.HarvestId)
                .HasComment("Null khi còn nuôi hoặc đã chết")
                .HasColumnName("harvest_id");
            entity.Property(e => e.ItemUuid)
                .HasComment("Mã nội bộ của con cua, sinh lúc thả giống")
                .HasDefaultValueSql("(newid())", "df_crab_item_item_uuid")
                .HasColumnName("item_uuid");
            entity.Property(e => e.OrderLineId)
                .HasComment("Gán khi đóng đơn bằng cách quét tem")
                .HasColumnName("order_line_id");
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

            entity.HasOne(d => d.Grade).WithMany(p => p.CrabItems)
                .HasForeignKey(d => d.GradeId)
                .HasConstraintName("fk_crab_item_grade_id");

            entity.HasOne(d => d.ReplacesCrabItem).WithMany(p => p.InverseReplacesCrabItem)
                .HasForeignKey(d => d.ReplacesCrabItemId)
                .HasConstraintName("fk_crab_item_replaces_crab_item_id");

            entity.HasOne(d => d.Harvest).WithMany(p => p.CrabItems)
                .HasPrincipalKey(p => new { p.HarvestId, p.BatchId })
                .HasForeignKey(d => new { d.HarvestId, d.BatchId })
                .HasConstraintName("fk_crab_item_harvest_id_batch_id");

            entity.HasOne(d => d.OrderLine).WithMany(p => p.CrabItems)
                .HasPrincipalKey(p => new { p.OrderLineId, p.BatchId })
                .HasForeignKey(d => new { d.OrderLineId, d.BatchId })
                .HasConstraintName("fk_crab_item_order_line_id_batch_id");

            entity.HasOne(d => d.SlotAllocation).WithMany(p => p.CrabItems)
                .HasPrincipalKey(p => new { p.SlotAllocationId, p.BatchId })
                .HasForeignKey(d => new { d.SlotAllocationId, d.BatchId })
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("fk_crab_item_slot_allocation_id_batch_id");
        });

        modelBuilder.Entity<CrabItemEvent>(entity =>
        {
            entity.HasKey(e => e.CrabItemEventId).HasName("pk_crab_item_event");

            entity.ToTable("crab_item_event", tb =>
                {
                    tb.HasComment("Lịch sử từng con cua từ lúc thả tới tay người mua; chỉ ghi thêm");
                    tb.HasTrigger("trg_crab_item_event_append_only");
                });

            entity.HasIndex(e => e.ActorId, "ix_crab_item_event_actor_id");

            entity.HasIndex(e => new { e.CrabItemId, e.OccurredAt }, "ix_crab_item_event_crab_item_id_occurred_at");

            entity.HasIndex(e => e.EvidenceId, "ix_crab_item_event_evidence_id");

            entity.HasIndex(e => e.TagId, "ix_crab_item_event_tag_id");

            entity.Property(e => e.CrabItemEventId).HasColumnName("crab_item_event_id");
            entity.Property(e => e.ActorId).HasColumnName("actor_id");
            entity.Property(e => e.CrabItemId).HasColumnName("crab_item_id");
            entity.Property(e => e.CreatedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysdatetimeoffset())", "df_crab_item_event_created_at")
                .HasColumnName("created_at");
            entity.Property(e => e.EventType)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasComment("Giá trị: Stocked, Died, Harvested, TagPrinted, TagActivated, TagVoided, StoredIn, Packed, Delivered, Lost")
                .HasColumnName("event_type");
            entity.Property(e => e.EvidenceId).HasColumnName("evidence_id");
            entity.Property(e => e.Note)
                .HasMaxLength(300)
                .HasColumnName("note");
            entity.Property(e => e.OccurredAt)
                .HasPrecision(3)
                .HasColumnName("occurred_at");
            entity.Property(e => e.TagId).HasColumnName("tag_id");

            entity.HasOne(d => d.Actor).WithMany(p => p.CrabItemEvents)
                .HasForeignKey(d => d.ActorId)
                .HasConstraintName("fk_crab_item_event_actor_id");

            entity.HasOne(d => d.CrabItem).WithMany(p => p.CrabItemEvents)
                .HasForeignKey(d => d.CrabItemId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("fk_crab_item_event_crab_item_id");

            entity.HasOne(d => d.Evidence).WithMany(p => p.CrabItemEvents)
                .HasForeignKey(d => d.EvidenceId)
                .HasConstraintName("fk_crab_item_event_evidence_id");

            entity.HasOne(d => d.Tag).WithMany(p => p.CrabItemEvents)
                .HasForeignKey(d => d.TagId)
                .HasConstraintName("fk_crab_item_event_tag_id");
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
            entity.HasKey(e => e.AddressId).HasName("pk_customer_address");

            entity.ToTable("customer_address", tb => tb.HasComment("Địa chỉ nhận hàng của khách (thuộc tính đa trị)"));

            entity.HasIndex(e => e.CustomerId, "ux_customer_address_default")
                .IsUnique()
                .HasFilter("([is_default]=(1))");

            entity.Property(e => e.AddressId).HasColumnName("address_id");
            entity.Property(e => e.AddressLine)
                .HasMaxLength(300)
                .HasColumnName("address_line");
            entity.Property(e => e.CreatedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysdatetimeoffset())", "df_customer_address_created_at")
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
            entity.HasKey(e => e.TrancheId).HasName("pk_disbursement_tranche");

            entity.ToTable("disbursement_tranche", tb => tb.HasComment("Đợt giải ngân theo mốc, suy ra từ Standard Cost đã khoá"));

            entity.HasIndex(e => new { e.BatchId, e.TrancheNo }, "ux_tranche_no").IsUnique();

            entity.Property(e => e.TrancheId).HasColumnName("tranche_id");
            entity.Property(e => e.BatchId).HasColumnName("batch_id");
            entity.Property(e => e.CreatedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysdatetimeoffset())", "df_disbursement_tranche_created_at")
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
                .HasComment("Giá trị: Planned, Requested, NeedsExplanation, Released, Blocked")
                .HasDefaultValue("Planned", "df_disbursement_tranche_status")
                .HasColumnName("status");
            entity.Property(e => e.TrancheNo).HasColumnName("tranche_no");
            entity.Property(e => e.UnlockCondition)
                .HasMaxLength(300)
                .HasColumnName("unlock_condition");
            entity.Property(e => e.UpdatedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysdatetimeoffset())", "df_disbursement_tranche_updated_at")
                .HasColumnName("updated_at");

            entity.HasOne(d => d.Batch).WithMany(p => p.DisbursementTranches)
                .HasForeignKey(d => d.BatchId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("fk_disbursement_tranche_batch_id");
        });

        modelBuilder.Entity<Evidence>(entity =>
        {
            entity.HasKey(e => e.EvidenceId).HasName("pk_evidence");

            entity.ToTable("evidence", tb => tb.HasComment("Ảnh/video bằng chứng nuôi: chụp trực tiếp trong ứng dụng, nhận qua API hệ thống trại, hoặc chứng từ tải lên"));

            entity.HasIndex(e => e.BatchId, "ix_evidence_batch_id");

            entity.HasIndex(e => e.CaptureRequestId, "ix_evidence_capture_request_id");

            entity.HasIndex(e => e.PerceptualHash, "ix_evidence_perceptual_hash");

            entity.HasIndex(e => e.Sha256, "ix_evidence_sha256");

            entity.HasIndex(e => e.SlotEventId, "ix_evidence_slot_event_id");

            entity.HasIndex(e => e.SlotId, "ix_evidence_slot_id");

            entity.HasIndex(e => e.TrancheId, "ix_evidence_tranche_id");

            entity.Property(e => e.EvidenceId).HasColumnName("evidence_id");
            entity.Property(e => e.BatchId).HasColumnName("batch_id");
            entity.Property(e => e.CaptureRequestId)
                .HasComment("Yêu cầu chụp đột xuất mà ảnh này đáp ứng")
                .HasColumnName("capture_request_id");
            entity.Property(e => e.CapturedAt)
                .HasPrecision(3)
                .HasColumnName("captured_at");
            entity.Property(e => e.CreatedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysdatetimeoffset())", "df_evidence_created_at")
                .HasColumnName("created_at");
            entity.Property(e => e.ExplainedAt)
                .HasPrecision(3)
                .HasColumnName("explained_at");
            entity.Property(e => e.Explanation)
                .HasMaxLength(1000)
                .HasComment("Giải trình của người nuôi khi bằng chứng bị gắn cờ")
                .HasColumnName("explanation");
            entity.Property(e => e.FileUri)
                .HasMaxLength(400)
                .HasColumnName("file_uri");
            entity.Property(e => e.Latitude)
                .HasComment("Vị trí lúc chụp")
                .HasColumnType("decimal(9, 6)")
                .HasColumnName("latitude");
            entity.Property(e => e.Longitude)
                .HasColumnType("decimal(9, 6)")
                .HasColumnName("longitude");
            entity.Property(e => e.MediaType)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasComment("Giá trị: Photo, Video, Invoice")
                .HasColumnName("media_type");
            entity.Property(e => e.PartnerLabel)
                .HasMaxLength(100)
                .HasComment("Kết quả nhận diện do đối tác trả về")
                .HasColumnName("partner_label");
            entity.Property(e => e.PerceptualHash)
                .HasMaxLength(64)
                .IsUnicode(false)
                .HasColumnName("perceptual_hash");
            entity.Property(e => e.ReceivedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysdatetimeoffset())", "df_evidence_received_at")
                .HasColumnName("received_at");
            entity.Property(e => e.ReviewStatus)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasComment("Giá trị: Accepted, Watch (hiện cảnh báo cho nhà đầu tư), Flagged (chờ Kiểm định viên), Rejected")
                .HasDefaultValue("Accepted", "df_evidence_review_status")
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
                .HasComment("Ô người nuôi chọn trên sơ đồ khi chụp")
                .HasColumnName("slot_id");
            entity.Property(e => e.Source)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasComment("Giá trị: FarmApi, InAppCapture (chụp trực tiếp, không chọn từ thư viện), DocumentUpload (chỉ cho chứng từ)")
                .HasColumnName("source");
            entity.Property(e => e.TrancheId).HasColumnName("tranche_id");

            entity.HasOne(d => d.Batch).WithMany(p => p.Evidences)
                .HasForeignKey(d => d.BatchId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("fk_evidence_batch_id");

            entity.HasOne(d => d.CaptureRequest).WithMany(p => p.Evidences)
                .HasForeignKey(d => d.CaptureRequestId)
                .HasConstraintName("fk_evidence_capture_request_id");

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
            entity.HasKey(e => e.DetectionId).HasName("pk_evidence_detection");

            entity.ToTable("evidence_detection", tb => tb.HasComment("Kết quả mô hình nhận diện cua trên một ảnh; chỉ là một tín hiệu trong điểm rủi ro, không tự từ chối bằng chứng"));

            entity.HasIndex(e => new { e.EvidenceId, e.ModelVersion }, "ux_evidence_detection_model").IsUnique();

            entity.Property(e => e.DetectionId).HasColumnName("detection_id");
            entity.Property(e => e.BboxJson)
                .HasMaxLength(400)
                .HasColumnName("bbox_json");
            entity.Property(e => e.Confidence)
                .HasComment("Độ tin cậy từ 0 tới 1")
                .HasColumnType("decimal(5, 4)")
                .HasColumnName("confidence");
            entity.Property(e => e.CrabDetected).HasColumnName("crab_detected");
            entity.Property(e => e.DetectedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysdatetimeoffset())", "df_evidence_detection_detected_at")
                .HasColumnName("detected_at");
            entity.Property(e => e.EvidenceId).HasColumnName("evidence_id");
            entity.Property(e => e.ModelVersion)
                .HasMaxLength(50)
                .IsUnicode(false)
                .HasComment("Phiên bản mô hình đã chạy, để truy lại kết quả")
                .HasColumnName("model_version");

            entity.HasOne(d => d.Evidence).WithMany(p => p.EvidenceDetections)
                .HasForeignKey(d => d.EvidenceId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("fk_evidence_detection_evidence_id");
        });

        modelBuilder.Entity<EvidenceReview>(entity =>
        {
            entity.HasKey(e => e.EvidenceReviewId).HasName("pk_evidence_review");

            entity.ToTable("evidence_review", tb => tb.HasComment("Kết luận của Kiểm định viên cho bằng chứng bị gắn cờ; không xét lô mình có góp vốn"));

            entity.HasIndex(e => e.ReviewerId, "ix_evidence_review_reviewer_id");

            entity.HasIndex(e => new { e.EvidenceId, e.ReviewerId }, "ux_evidence_review_reviewer").IsUnique();

            entity.Property(e => e.EvidenceReviewId).HasColumnName("evidence_review_id");
            entity.Property(e => e.EvidenceId).HasColumnName("evidence_id");
            entity.Property(e => e.Note)
                .HasMaxLength(500)
                .HasColumnName("note");
            entity.Property(e => e.ReviewedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysdatetimeoffset())", "df_evidence_review_reviewed_at")
                .HasColumnName("reviewed_at");
            entity.Property(e => e.ReviewerId).HasColumnName("reviewer_id");
            entity.Property(e => e.Verdict)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasComment("Giá trị: Pass, Fail, NeedMoreEvidence")
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

        modelBuilder.Entity<FeeTier>(entity =>
        {
            entity.HasKey(e => e.FeeTierId).HasName("pk_fee_tier");

            entity.ToTable("fee_tier", tb => tb.HasComment("Bậc phí nền tảng theo quy mô vốn của lô"));

            entity.HasIndex(e => e.TierCode, "uq_fee_tier_tier_code").IsUnique();

            entity.Property(e => e.FeeTierId).HasColumnName("fee_tier_id");
            entity.Property(e => e.CreatedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysdatetimeoffset())", "df_fee_tier_created_at")
                .HasColumnName("created_at");
            entity.Property(e => e.EffectiveFrom).HasColumnName("effective_from");
            entity.Property(e => e.EffectiveTo).HasColumnName("effective_to");
            entity.Property(e => e.FeeAmount)
                .HasColumnType("decimal(18, 0)")
                .HasColumnName("fee_amount");
            entity.Property(e => e.MaxCapital)
                .HasColumnType("decimal(18, 0)")
                .HasColumnName("max_capital");
            entity.Property(e => e.MinCapital)
                .HasColumnType("decimal(18, 0)")
                .HasColumnName("min_capital");
            entity.Property(e => e.TierCode)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasColumnName("tier_code");
        });

        modelBuilder.Entity<Harvest>(entity =>
        {
            entity.HasKey(e => e.HarvestId).HasName("pk_harvest");

            entity.ToTable("harvest", tb => tb.HasComment("Khai báo thu hoạch của lô"));

            entity.HasIndex(e => e.BatchId, "ix_harvest_batch_id");

            entity.HasIndex(e => e.DeclaredBy, "ix_harvest_declared_by");

            entity.HasIndex(e => new { e.HarvestId, e.BatchId }, "ux_harvest_batch").IsUnique();

            entity.Property(e => e.HarvestId).HasColumnName("harvest_id");
            entity.Property(e => e.BatchId).HasColumnName("batch_id");
            entity.Property(e => e.CreatedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysdatetimeoffset())", "df_harvest_created_at")
                .HasColumnName("created_at");
            entity.Property(e => e.DeclaredBy).HasColumnName("declared_by");
            entity.Property(e => e.HarvestedAt)
                .HasPrecision(3)
                .HasColumnName("harvested_at");
            entity.Property(e => e.HarvestedCount).HasColumnName("harvested_count");
            entity.Property(e => e.Note)
                .HasMaxLength(300)
                .HasColumnName("note");
            entity.Property(e => e.TotalWeightKg)
                .HasColumnType("decimal(12, 3)")
                .HasColumnName("total_weight_kg");

            entity.HasOne(d => d.Batch).WithMany(p => p.Harvests)
                .HasForeignKey(d => d.BatchId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("fk_harvest_batch_id");

            entity.HasOne(d => d.DeclaredByNavigation).WithMany(p => p.Harvests)
                .HasForeignKey(d => d.DeclaredBy)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("fk_harvest_declared_by");
        });

        modelBuilder.Entity<InvestmentContract>(entity =>
        {
            entity.HasKey(e => e.ContractId).HasName("pk_investment_contract");

            entity.ToTable("investment_contract", tb => tb.HasComment("Hợp đồng hợp tác của một khoản góp, ký lần lượt người nuôi rồi nhà đầu tư"));

            entity.HasIndex(e => e.TemplateId, "ix_investment_contract_template_id");

            entity.HasIndex(e => e.ContractNo, "uq_investment_contract_contract_no").IsUnique();

            entity.HasIndex(e => e.ContributionId, "uq_investment_contract_contribution_id").IsUnique();

            entity.Property(e => e.ContractId).HasColumnName("contract_id");
            entity.Property(e => e.ContractNo)
                .HasMaxLength(30)
                .IsUnicode(false)
                .HasColumnName("contract_no");
            entity.Property(e => e.ContributionId).HasColumnName("contribution_id");
            entity.Property(e => e.CreatedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysdatetimeoffset())", "df_investment_contract_created_at")
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
                .HasComment("Giá trị: DigitalSignature, OfflineUpload")
                .HasDefaultValue("DigitalSignature", "df_investment_contract_signing_method")
                .HasColumnName("signing_method");
            entity.Property(e => e.Status)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasComment("Giá trị: Draft, OperatorSigned, FullySigned, Void")
                .HasDefaultValue("Draft", "df_investment_contract_status")
                .HasColumnName("status");
            entity.Property(e => e.TemplateId).HasColumnName("template_id");
            entity.Property(e => e.UpdatedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysdatetimeoffset())", "df_investment_contract_updated_at")
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
            entity.HasKey(e => e.KycCheckId).HasName("pk_kyc_check");

            entity.ToTable("kyc_check", tb => tb.HasComment("Kết quả từng lần xác minh danh tính. Chỉ lưu kết quả, không lưu ảnh CCCD hay khuôn mặt"));

            entity.HasIndex(e => e.ReviewedBy, "ix_kyc_check_reviewed_by");

            entity.HasIndex(e => e.UserId, "ix_kyc_check_user_id");

            entity.Property(e => e.KycCheckId).HasColumnName("kyc_check_id");
            entity.Property(e => e.CheckType)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasComment("Giá trị: OtpDeclaration, EkycIdFace, BankNameMatch")
                .HasColumnName("check_type");
            entity.Property(e => e.CheckedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysdatetimeoffset())", "df_kyc_check_checked_at")
                .HasColumnName("checked_at");
            entity.Property(e => e.ConsentAt)
                .HasPrecision(3)
                .HasComment("Bắt buộc với EkycIdFace")
                .HasColumnName("consent_at");
            entity.Property(e => e.CreatedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysdatetimeoffset())", "df_kyc_check_created_at")
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
                .HasComment("Giá trị: Pending, Passed, Failed, ExceptionApproved")
                .HasDefaultValue("Pending", "df_kyc_check_result")
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

        modelBuilder.Entity<OfftakeCommitment>(entity =>
        {
            entity.HasKey(e => e.OfftakeId).HasName("pk_offtake_commitment");

            entity.ToTable("offtake_commitment", tb => tb.HasComment("Cam kết bao tiêu gắn với một khoản góp: khối lượng, giá chốt, cọc"));

            entity.HasIndex(e => e.BatchId, "ix_offtake_commitment_batch_id");

            entity.HasIndex(e => new { e.ContributionId, e.BatchId }, "ix_offtake_commitment_contribution_id_batch_id");

            entity.HasIndex(e => e.GradeId, "ix_offtake_commitment_grade_id");

            entity.HasIndex(e => e.ContributionId, "uq_offtake_commitment_contribution_id").IsUnique();

            entity.Property(e => e.OfftakeId).HasColumnName("offtake_id");
            entity.Property(e => e.BatchId).HasColumnName("batch_id");
            entity.Property(e => e.CommittedQtyKg)
                .HasColumnType("decimal(12, 3)")
                .HasColumnName("committed_qty_kg");
            entity.Property(e => e.ContributionId).HasColumnName("contribution_id");
            entity.Property(e => e.CreatedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysdatetimeoffset())", "df_offtake_commitment_created_at")
                .HasColumnName("created_at");
            entity.Property(e => e.DepositAmount)
                .HasColumnType("decimal(18, 0)")
                .HasColumnName("deposit_amount");
            entity.Property(e => e.DepositStatus)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasComment("Giá trị: Pending, Held, Applied, Forfeited, Refunded")
                .HasDefaultValue("Pending", "df_offtake_commitment_deposit_status")
                .HasColumnName("deposit_status");
            entity.Property(e => e.FixedUnitPrice)
                .HasColumnType("decimal(18, 0)")
                .HasColumnName("fixed_unit_price");
            entity.Property(e => e.GradeId).HasColumnName("grade_id");
            entity.Property(e => e.Status)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasComment("Giá trị: PendingHarvest, WindowOpen, Fulfilled, Expired, Cancelled")
                .HasDefaultValue("PendingHarvest", "df_offtake_commitment_status")
                .HasColumnName("status");
            entity.Property(e => e.UpdatedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysdatetimeoffset())", "df_offtake_commitment_updated_at")
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

            entity.HasOne(d => d.Grade).WithMany(p => p.OfftakeCommitments)
                .HasForeignKey(d => d.GradeId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("fk_offtake_commitment_grade_id");

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

        modelBuilder.Entity<OrderLine>(entity =>
        {
            entity.HasKey(e => e.OrderLineId).HasName("pk_order_line");

            entity.ToTable("order_line", tb => tb.HasComment("Dòng hàng trong đơn; mặt hàng phải cùng lô với đơn"));

            entity.HasIndex(e => e.BatchId, "ix_order_line_batch_id");

            entity.HasIndex(e => e.ListingId, "ix_order_line_listing_id");

            entity.HasIndex(e => new { e.ListingId, e.BatchId }, "ix_order_line_listing_id_batch_id");

            entity.HasIndex(e => e.OrderId, "ix_order_line_order_id");

            entity.HasIndex(e => new { e.OrderId, e.BatchId }, "ix_order_line_order_id_batch_id");

            entity.HasIndex(e => new { e.OrderLineId, e.BatchId }, "ux_order_line_batch").IsUnique();

            entity.Property(e => e.OrderLineId).HasColumnName("order_line_id");
            entity.Property(e => e.BatchId).HasColumnName("batch_id");
            entity.Property(e => e.CreatedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysdatetimeoffset())", "df_order_line_created_at")
                .HasColumnName("created_at");
            entity.Property(e => e.ListingId).HasColumnName("listing_id");
            entity.Property(e => e.OrderId).HasColumnName("order_id");
            entity.Property(e => e.QuantityKg)
                .HasColumnType("decimal(12, 3)")
                .HasColumnName("quantity_kg");
            entity.Property(e => e.UnitPrice)
                .HasComment("Giá tại thời điểm đặt")
                .HasColumnType("decimal(18, 0)")
                .HasColumnName("unit_price");

            entity.HasOne(d => d.Batch).WithMany(p => p.OrderLines)
                .HasForeignKey(d => d.BatchId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("fk_order_line_batch_id");

            entity.HasOne(d => d.ProductListing).WithMany(p => p.OrderLines)
                .HasPrincipalKey(p => new { p.ListingId, p.BatchId })
                .HasForeignKey(d => new { d.ListingId, d.BatchId })
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("fk_order_line_listing_id_batch_id");

            entity.HasOne(d => d.SalesOrder).WithMany(p => p.OrderLines)
                .HasPrincipalKey(p => new { p.OrderId, p.BatchId })
                .HasForeignKey(d => new { d.OrderId, d.BatchId })
                .HasConstraintName("fk_order_line_order_id_batch_id");
        });

        modelBuilder.Entity<PaymentInstruction>(entity =>
        {
            entity.HasKey(e => e.InstructionId).HasName("pk_payment_instruction");

            entity.ToTable("payment_instruction", tb => tb.HasComment("Lệnh chi CrabShare gửi tổ chức trung gian: giải ngân, chi trả, hoàn tiền, nộp thuế"));

            entity.HasIndex(e => new { e.BatchAccountId, e.Status }, "ix_payment_instruction_batch_account_id_status");

            entity.HasIndex(e => e.ContributionId, "ix_payment_instruction_contribution_id");

            entity.HasIndex(e => e.OrderId, "ix_payment_instruction_order_id");

            entity.HasIndex(e => e.PayoutAccountId, "ix_payment_instruction_payout_account_id");

            entity.HasIndex(e => e.SettlementLineId, "ix_payment_instruction_settlement_line_id");

            entity.HasIndex(e => e.TrancheId, "ix_payment_instruction_tranche_id");

            entity.Property(e => e.InstructionId).HasColumnName("instruction_id");
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
                .HasDefaultValueSql("(sysdatetimeoffset())", "df_payment_instruction_created_at")
                .HasColumnName("created_at");
            entity.Property(e => e.InstructionType)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasComment("Giá trị: Disbursement, Payout, Refund, TaxPayment")
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
                .HasComment("Giá trị: Created, Sent, Succeeded, Failed, Disputed")
                .HasDefaultValue("Created", "df_payment_instruction_status")
                .HasColumnName("status");
            entity.Property(e => e.TrancheId).HasColumnName("tranche_id");
            entity.Property(e => e.UpdatedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysdatetimeoffset())", "df_payment_instruction_updated_at")
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
            entity.HasKey(e => e.PaymentRequestId).HasName("pk_payment_request");

            entity.ToTable("payment_request", tb => tb.HasComment("Chỉ dẫn thu tiền (mã VietQR) vào tài khoản lô; gắn với đúng một nghĩa vụ"));

            entity.HasIndex(e => e.BatchAccountId, "ix_payment_request_batch_account_id");

            entity.HasIndex(e => e.ContributionId, "ix_payment_request_contribution_id");

            entity.HasIndex(e => e.OfftakeId, "ix_payment_request_offtake_id");

            entity.HasIndex(e => e.OrderId, "ix_payment_request_order_id");

            entity.HasIndex(e => e.ReferenceCode, "uq_payment_request_reference_code").IsUnique();

            entity.Property(e => e.PaymentRequestId).HasColumnName("payment_request_id");
            entity.Property(e => e.Amount)
                .HasColumnType("decimal(18, 0)")
                .HasColumnName("amount");
            entity.Property(e => e.BatchAccountId).HasColumnName("batch_account_id");
            entity.Property(e => e.ContributionId).HasColumnName("contribution_id");
            entity.Property(e => e.CreatedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysdatetimeoffset())", "df_payment_request_created_at")
                .HasColumnName("created_at");
            entity.Property(e => e.ExpiresAt)
                .HasPrecision(3)
                .HasColumnName("expires_at");
            entity.Property(e => e.OfftakeId).HasColumnName("offtake_id");
            entity.Property(e => e.OrderId).HasColumnName("order_id");
            entity.Property(e => e.Purpose)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasComment("Giá trị: Contribution, OrderPayment, PreOrderDeposit, PreOrderBalance, OfftakeDeposit, OfftakePayment")
                .HasColumnName("purpose");
            entity.Property(e => e.ReferenceCode)
                .HasMaxLength(30)
                .IsUnicode(false)
                .HasComment("Nội dung chuyển khoản")
                .HasColumnName("reference_code");
            entity.Property(e => e.Status)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasComment("Giá trị: Pending, Paid, Expired, Cancelled")
                .HasDefaultValue("Pending", "df_payment_request_status")
                .HasColumnName("status");
            entity.Property(e => e.UpdatedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysdatetimeoffset())", "df_payment_request_updated_at")
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
            entity.HasKey(e => e.PayoutAccountId).HasName("pk_payout_account");

            entity.ToTable("payout_account", tb => tb.HasComment("Tài khoản nhận tiền của nhà đầu tư hoặc người nuôi (đúng một chủ sở hữu)"));

            entity.HasIndex(e => e.OwnerOperatorId, "ix_payout_account_owner_operator_id");

            entity.HasIndex(e => e.OwnerUserId, "ix_payout_account_owner_user_id");

            entity.HasIndex(e => new { e.BankCode, e.AccountNo }, "ux_payout_bank_account").IsUnique();

            entity.Property(e => e.PayoutAccountId).HasColumnName("payout_account_id");
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
                .HasDefaultValueSql("(sysdatetimeoffset())", "df_payout_account_created_at")
                .HasColumnName("created_at");
            entity.Property(e => e.NameMatchStatus)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasComment("Giá trị: Pending, Matched, Mismatched")
                .HasDefaultValue("Pending", "df_payout_account_name_match_status")
                .HasColumnName("name_match_status");
            entity.Property(e => e.OwnerOperatorId).HasColumnName("owner_operator_id");
            entity.Property(e => e.OwnerUserId).HasColumnName("owner_user_id");
            entity.Property(e => e.Status)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasComment("Giá trị: Active, Locked, Closed")
                .HasDefaultValue("Active", "df_payout_account_status")
                .HasColumnName("status");
            entity.Property(e => e.UpdatedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysdatetimeoffset())", "df_payout_account_updated_at")
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

            entity.ToTable("physical_slot", tb => tb.HasComment("Hộp nuôi vật lý (slot) của người nuôi; vị trí lấy từ sơ đồ cơ sở: dãy, kệ, tầng, cột"));

            entity.HasIndex(e => new { e.OperatorId, e.SlotCode }, "ux_slot_code").IsUnique();

            entity.Property(e => e.SlotId).HasColumnName("slot_id");
            entity.Property(e => e.ColumnNo)
                .HasComment("Cột trên tầng")
                .HasColumnName("column_no");
            entity.Property(e => e.CreatedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysdatetimeoffset())", "df_physical_slot_created_at")
                .HasColumnName("created_at");
            entity.Property(e => e.OperatorId).HasColumnName("operator_id");
            entity.Property(e => e.RackNo)
                .HasComment("Số kệ trên sơ đồ cơ sở")
                .HasColumnName("rack_no");
            entity.Property(e => e.RowCode)
                .HasMaxLength(10)
                .IsUnicode(false)
                .HasComment("Dãy trên sơ đồ cơ sở")
                .HasColumnName("row_code");
            entity.Property(e => e.SlotCode)
                .HasMaxLength(30)
                .IsUnicode(false)
                .HasComment("Mã vị trí ô sinh từ sơ đồ cơ sở, ví dụ A-03-12; duy nhất trong một trại")
                .HasColumnName("slot_code");
            entity.Property(e => e.Status)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasComment("Giá trị: Available, Occupied, Maintenance")
                .HasDefaultValue("Available", "df_physical_slot_status")
                .HasColumnName("status");
            entity.Property(e => e.TierNo)
                .HasComment("Tầng trên kệ")
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

        modelBuilder.Entity<PriceHistory>(entity =>
        {
            entity.HasKey(e => e.PriceHistoryId).HasName("pk_price_history");

            entity.ToTable("price_history", tb => tb.HasComment("Lịch sử đổi giá công khai của mặt hàng"));

            entity.HasIndex(e => e.ChangedBy, "ix_price_history_changed_by");

            entity.HasIndex(e => new { e.ListingId, e.EffectiveFrom }, "ix_price_history_listing_id_effective_from");

            entity.Property(e => e.PriceHistoryId).HasColumnName("price_history_id");
            entity.Property(e => e.ChangedBy).HasColumnName("changed_by");
            entity.Property(e => e.CreatedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysdatetimeoffset())", "df_price_history_created_at")
                .HasColumnName("created_at");
            entity.Property(e => e.EffectiveFrom)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysdatetimeoffset())", "df_price_history_effective_from")
                .HasColumnName("effective_from");
            entity.Property(e => e.FlaggedAbnormal).HasColumnName("flagged_abnormal");
            entity.Property(e => e.ListingId).HasColumnName("listing_id");
            entity.Property(e => e.PricePerKg)
                .HasColumnType("decimal(18, 0)")
                .HasColumnName("price_per_kg");

            entity.HasOne(d => d.ChangedByNavigation).WithMany(p => p.PriceHistories)
                .HasForeignKey(d => d.ChangedBy)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("fk_price_history_changed_by");

            entity.HasOne(d => d.Listing).WithMany(p => p.PriceHistories)
                .HasForeignKey(d => d.ListingId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("fk_price_history_listing_id");
        });

        modelBuilder.Entity<ProductGrade>(entity =>
        {
            entity.HasKey(e => e.GradeId).HasName("pk_product_grade");

            entity.ToTable("product_grade", tb => tb.HasComment("Danh mục phân loại cua theo kích cỡ, chất lượng"));

            entity.HasIndex(e => e.GradeCode, "uq_product_grade_grade_code").IsUnique();

            entity.Property(e => e.GradeId).HasColumnName("grade_id");
            entity.Property(e => e.CreatedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysdatetimeoffset())", "df_product_grade_created_at")
                .HasColumnName("created_at");
            entity.Property(e => e.GradeCode)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasColumnName("grade_code");
            entity.Property(e => e.GradeName)
                .HasMaxLength(100)
                .HasColumnName("grade_name");
            entity.Property(e => e.MaxWeightG).HasColumnName("max_weight_g");
            entity.Property(e => e.MinWeightG).HasColumnName("min_weight_g");
        });

        modelBuilder.Entity<ProductListing>(entity =>
        {
            entity.HasKey(e => e.ListingId).HasName("pk_product_listing");

            entity.ToTable("product_listing", tb => tb.HasComment("Mặt hàng đăng bán của một lô theo một phân loại"));

            entity.HasIndex(e => e.GradeId, "ix_product_listing_grade_id");

            entity.HasIndex(e => new { e.ListingId, e.BatchId }, "ux_listing_batch").IsUnique();

            entity.HasIndex(e => new { e.BatchId, e.GradeId, e.StorageType }, "ux_listing_grade").IsUnique();

            entity.Property(e => e.ListingId).HasColumnName("listing_id");
            entity.Property(e => e.BatchId).HasColumnName("batch_id");
            entity.Property(e => e.CreatedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysdatetimeoffset())", "df_product_listing_created_at")
                .HasColumnName("created_at");
            entity.Property(e => e.CurrentPricePerKg)
                .HasColumnType("decimal(18, 0)")
                .HasColumnName("current_price_per_kg");
            entity.Property(e => e.FrozenAt)
                .HasPrecision(3)
                .HasColumnName("frozen_at");
            entity.Property(e => e.GradeId).HasColumnName("grade_id");
            entity.Property(e => e.PublishedAt)
                .HasPrecision(3)
                .HasColumnName("published_at");
            entity.Property(e => e.ReservedQtyKg)
                .HasColumnType("decimal(12, 3)")
                .HasColumnName("reserved_qty_kg");
            entity.Property(e => e.Status)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasComment("Giá trị: Draft, Published, SoldOut, Closed")
                .HasDefaultValue("Draft", "df_product_listing_status")
                .HasColumnName("status");
            entity.Property(e => e.StockQtyKg)
                .HasColumnType("decimal(12, 3)")
                .HasColumnName("stock_qty_kg");
            entity.Property(e => e.StorageType)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasComment("Giá trị: Fresh, Frozen")
                .HasDefaultValue("Fresh", "df_product_listing_storage_type")
                .HasColumnName("storage_type");
            entity.Property(e => e.Title)
                .HasMaxLength(200)
                .HasColumnName("title");
            entity.Property(e => e.UpdatedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysdatetimeoffset())", "df_product_listing_updated_at")
                .HasColumnName("updated_at");

            entity.HasOne(d => d.Batch).WithMany(p => p.ProductListings)
                .HasForeignKey(d => d.BatchId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("fk_product_listing_batch_id");

            entity.HasOne(d => d.Grade).WithMany(p => p.ProductListings)
                .HasForeignKey(d => d.GradeId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("fk_product_listing_grade_id");
        });

        modelBuilder.Entity<ProductRating>(entity =>
        {
            entity.HasKey(e => e.RatingId).HasName("pk_product_rating");

            entity.ToTable("product_rating", tb => tb.HasComment("Đánh giá của khách cho một đơn đã nhận"));

            entity.HasIndex(e => e.OrderId, "uq_product_rating_order_id").IsUnique();

            entity.Property(e => e.RatingId).HasColumnName("rating_id");
            entity.Property(e => e.Comment)
                .HasMaxLength(500)
                .HasColumnName("comment");
            entity.Property(e => e.CreatedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysdatetimeoffset())", "df_product_rating_created_at")
                .HasColumnName("created_at");
            entity.Property(e => e.OrderId).HasColumnName("order_id");
            entity.Property(e => e.Stars).HasColumnName("stars");

            entity.HasOne(d => d.Order).WithOne(p => p.ProductRating)
                .HasForeignKey<ProductRating>(d => d.OrderId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("fk_product_rating_order_id");
        });

        modelBuilder.Entity<ProductionLog>(entity =>
        {
            entity.HasKey(e => e.ProductionLogId).HasName("pk_production_log");

            entity.ToTable("production_log", tb => tb.HasComment("Nhật ký vận hành hằng ngày của lô"));

            entity.HasIndex(e => e.RecordedBy, "ix_production_log_recorded_by");

            entity.HasIndex(e => new { e.BatchId, e.LogDate, e.Source }, "ux_production_log_day").IsUnique();

            entity.Property(e => e.ProductionLogId).HasColumnName("production_log_id");
            entity.Property(e => e.BatchId).HasColumnName("batch_id");
            entity.Property(e => e.CreatedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysdatetimeoffset())", "df_production_log_created_at")
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
                .HasComment("Kết quả kiểm tra hợp lý số liệu: Ok, OutOfRange (ngoài dải), Inconsistent (mâu thuẫn với số cua còn sống)")
                .HasDefaultValue("Ok", "df_production_log_plausibility_flag")
                .HasColumnName("plausibility_flag");
            entity.Property(e => e.ReceivedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysdatetimeoffset())", "df_production_log_received_at")
                .HasColumnName("received_at");
            entity.Property(e => e.RecordedBy).HasColumnName("recorded_by");
            entity.Property(e => e.SalinityPpt)
                .HasColumnType("decimal(4, 1)")
                .HasColumnName("salinity_ppt");
            entity.Property(e => e.Source)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasComment("Giá trị: FarmApi, Manual")
                .HasColumnName("source");
            entity.Property(e => e.VerifiedAt)
                .HasPrecision(3)
                .HasComment("Có giá trị khi số liệu đã được kiểm (nhãn nguồn \"đã kiểm\")")
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
            entity.HasKey(e => e.TransactionId).HasName("pk_provider_transaction");

            entity.ToTable("provider_transaction", tb => tb.HasComment("Giao dịch do tổ chức trung gian báo về (webhook); chống trùng theo mã giao dịch"));

            entity.HasIndex(e => new { e.BatchAccountId, e.OccurredAt }, "ix_provider_transaction_batch_account_id_occurred_at");

            entity.HasIndex(e => e.InstructionId, "ix_provider_transaction_instruction_id");

            entity.HasIndex(e => e.PaymentRequestId, "ix_provider_transaction_payment_request_id");

            entity.HasIndex(e => e.ProviderTxnId, "uq_provider_transaction_provider_txn_id").IsUnique();

            entity.Property(e => e.TransactionId).HasColumnName("transaction_id");
            entity.Property(e => e.Amount)
                .HasColumnType("decimal(18, 0)")
                .HasColumnName("amount");
            entity.Property(e => e.BatchAccountId).HasColumnName("batch_account_id");
            entity.Property(e => e.Direction)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasComment("Giá trị: In, Out")
                .HasColumnName("direction");
            entity.Property(e => e.InstructionId).HasColumnName("instruction_id");
            entity.Property(e => e.MatchStatus)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasComment("Giá trị: Matched, Unmatched, LatePayment")
                .HasDefaultValue("Unmatched", "df_provider_transaction_match_status")
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
                .HasDefaultValueSql("(sysdatetimeoffset())", "df_provider_transaction_received_at")
                .HasColumnName("received_at");
            entity.Property(e => e.ReferenceCode)
                .HasMaxLength(60)
                .IsUnicode(false)
                .HasColumnName("reference_code");

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
            entity.HasKey(e => new { e.InvestorId, e.RiskDisclosureId }).HasName("pk_risk_acknowledgement");

            entity.ToTable("risk_acknowledgement", tb => tb.HasComment("Nhà đầu tư xác nhận đã đọc một phiên bản công bố rủi ro"));

            entity.HasIndex(e => e.RiskDisclosureId, "ix_risk_acknowledgement_risk_disclosure_id");

            entity.Property(e => e.InvestorId).HasColumnName("investor_id");
            entity.Property(e => e.RiskDisclosureId).HasColumnName("risk_disclosure_id");
            entity.Property(e => e.AcknowledgedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysdatetimeoffset())", "df_risk_acknowledgement_acknowledged_at")
                .HasColumnName("acknowledged_at");
            entity.Property(e => e.CreatedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysdatetimeoffset())", "df_risk_acknowledgement_created_at")
                .HasColumnName("created_at");
            entity.Property(e => e.ScrolledToEnd)
                .HasDefaultValue(true, "df_risk_acknowledgement_scrolled_to_end")
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
            entity.HasKey(e => e.RiskDisclosureId).HasName("pk_risk_disclosure");

            entity.ToTable("risk_disclosure", tb => tb.HasComment("Phiên bản bản công bố rủi ro"));

            entity.HasIndex(e => e.VersionCode, "uq_risk_disclosure_version_code").IsUnique();

            entity.Property(e => e.RiskDisclosureId).HasColumnName("risk_disclosure_id");
            entity.Property(e => e.ContentHash)
                .HasMaxLength(64)
                .IsUnicode(false)
                .IsFixedLength()
                .HasColumnName("content_hash");
            entity.Property(e => e.CreatedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysdatetimeoffset())", "df_risk_disclosure_created_at")
                .HasColumnName("created_at");
            entity.Property(e => e.EffectiveFrom)
                .HasPrecision(3)
                .HasColumnName("effective_from");
            entity.Property(e => e.Status)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasComment("Giá trị: Draft, Active, Retired")
                .HasDefaultValue("Draft", "df_risk_disclosure_status")
                .HasColumnName("status");
            entity.Property(e => e.UpdatedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysdatetimeoffset())", "df_risk_disclosure_updated_at")
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
            entity.HasKey(e => e.SettlementId).HasName("pk_settlement");

            entity.ToTable("settlement", tb =>
                {
                    tb.HasComment("Bảng quyết toán của lô; bất biến sau khi được duyệt");
                    tb.HasTrigger("trg_settlement_locked");
                });

            entity.HasIndex(e => e.ApprovedBy, "ix_settlement_approved_by");

            entity.HasIndex(e => e.BatchId, "uq_settlement_batch_id").IsUnique();

            entity.Property(e => e.SettlementId).HasColumnName("settlement_id");
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
                .HasDefaultValueSql("(sysdatetimeoffset())", "df_settlement_created_at")
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
                .HasComment("= actual_revenue − locked_standard_cost, có thể âm")
                .HasColumnType("decimal(18, 0)")
                .HasColumnName("revenue_pool");
            entity.Property(e => e.RevisionNo)
                .HasDefaultValue((short)1, "df_settlement_revision_no")
                .HasColumnName("revision_no");
            entity.Property(e => e.Status)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasComment("Giá trị: Draft, Proposed, Disputed, Approved, PaidOut, Closed")
                .HasDefaultValue("Draft", "df_settlement_status")
                .HasColumnName("status");
            entity.Property(e => e.TaxTotal)
                .HasColumnType("decimal(18, 0)")
                .HasColumnName("tax_total");
            entity.Property(e => e.UpdatedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysdatetimeoffset())", "df_settlement_updated_at")
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
            entity.HasKey(e => e.FeedbackId).HasName("pk_settlement_feedback");

            entity.ToTable("settlement_feedback", tb => tb.HasComment("Phản hồi / tranh chấp về bảng quyết toán trong cửa sổ 7 ngày"));

            entity.HasIndex(e => e.SettlementId, "ix_settlement_feedback_settlement_id");

            entity.HasIndex(e => e.UserId, "ix_settlement_feedback_user_id");

            entity.Property(e => e.FeedbackId).HasColumnName("feedback_id");
            entity.Property(e => e.Content)
                .HasMaxLength(1000)
                .HasColumnName("content");
            entity.Property(e => e.CreatedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysdatetimeoffset())", "df_settlement_feedback_created_at")
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
                .HasComment("Giá trị: Open, Answered, Withdrawn, Unresolved")
                .HasDefaultValue("Open", "df_settlement_feedback_status")
                .HasColumnName("status");
            entity.Property(e => e.UpdatedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysdatetimeoffset())", "df_settlement_feedback_updated_at")
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
            entity.HasKey(e => e.SettlementLineId).HasName("pk_settlement_line");

            entity.ToTable("settlement_line", tb =>
                {
                    tb.HasComment("Phần chia của từng nhà đầu tư; tổng khớp Revenue Pool tới từng đồng");
                    tb.HasTrigger("trg_settlement_line_locked");
                });

            entity.HasIndex(e => e.BatchId, "ix_settlement_line_batch_id");

            entity.HasIndex(e => new { e.BatchId, e.InvestorId }, "ix_settlement_line_batch_id_investor_id");

            entity.HasIndex(e => e.InvestorId, "ix_settlement_line_investor_id");

            entity.HasIndex(e => new { e.SettlementId, e.InvestorId }, "ux_settlement_line_investor").IsUnique();

            entity.Property(e => e.SettlementLineId).HasColumnName("settlement_line_id");
            entity.Property(e => e.BatchId).HasColumnName("batch_id");
            entity.Property(e => e.CapitalReturn)
                .HasColumnType("decimal(18, 0)")
                .HasColumnName("capital_return");
            entity.Property(e => e.CreatedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysdatetimeoffset())", "df_settlement_line_created_at")
                .HasColumnName("created_at");
            entity.Property(e => e.InKindQtyKg)
                .HasColumnType("decimal(12, 3)")
                .HasColumnName("in_kind_qty_kg");
            entity.Property(e => e.InvestorId).HasColumnName("investor_id");
            entity.Property(e => e.NetPayout)
                .HasColumnType("decimal(18, 0)")
                .HasColumnName("net_payout");
            entity.Property(e => e.ProfitShare)
                .HasComment("Âm khi lô lỗ; lỗ không vượt vốn góp")
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
            entity.HasKey(e => e.CostItemId).HasName("pk_standard_cost_item");

            entity.ToTable("standard_cost_item", tb => tb.HasComment("Dòng chi phí theo hạng mục trong một phiên bản Standard Cost"));

            entity.HasIndex(e => e.CostVersionId, "ix_standard_cost_item_cost_version_id");

            entity.Property(e => e.CostItemId).HasColumnName("cost_item_id");
            entity.Property(e => e.Category)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasComment("Giá trị: Seed, Feed, Utilities, Labour, MortalityReserve, Depreciation, Other")
                .HasColumnName("category");
            entity.Property(e => e.CostVersionId).HasColumnName("cost_version_id");
            entity.Property(e => e.CreatedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysdatetimeoffset())", "df_standard_cost_item_created_at")
                .HasColumnName("created_at");
            entity.Property(e => e.Description)
                .HasMaxLength(200)
                .HasColumnName("description");
            entity.Property(e => e.Quantity)
                .HasColumnType("decimal(12, 3)")
                .HasColumnName("quantity");
            entity.Property(e => e.TrancheNo)
                .HasComment("Đợt giải ngân; NULL với khấu hao")
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
            entity.HasKey(e => e.CostVersionId).HasName("pk_standard_cost_version");

            entity.ToTable("standard_cost_version", tb => tb.HasComment("Phiên bản bảng Standard Cost của lô; đúng một bản bị khoá khi mở gọi vốn"));

            entity.HasIndex(e => e.ApprovedBy, "ix_standard_cost_version_approved_by");

            entity.HasIndex(e => e.BatchId, "ux_cost_version_locked")
                .IsUnique()
                .HasFilter("([status]='Locked')");

            entity.HasIndex(e => new { e.BatchId, e.VersionNo }, "ux_cost_version_no").IsUnique();

            entity.Property(e => e.CostVersionId).HasColumnName("cost_version_id");
            entity.Property(e => e.ApprovedAt)
                .HasPrecision(3)
                .HasColumnName("approved_at");
            entity.Property(e => e.ApprovedBy).HasColumnName("approved_by");
            entity.Property(e => e.BatchId).HasColumnName("batch_id");
            entity.Property(e => e.CreatedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysdatetimeoffset())", "df_standard_cost_version_created_at")
                .HasColumnName("created_at");
            entity.Property(e => e.LockedAt)
                .HasPrecision(3)
                .HasColumnName("locked_at");
            entity.Property(e => e.Status)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasComment("Giá trị: Draft, Submitted, Approved, Locked, Superseded")
                .HasDefaultValue("Draft", "df_standard_cost_version_status")
                .HasColumnName("status");
            entity.Property(e => e.SubmittedAt)
                .HasPrecision(3)
                .HasColumnName("submitted_at");
            entity.Property(e => e.UpdatedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysdatetimeoffset())", "df_standard_cost_version_updated_at")
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

        modelBuilder.Entity<StockReservation>(entity =>
        {
            entity.HasKey(e => e.StockReservationId).HasName("pk_stock_reservation");

            entity.ToTable("stock_reservation", tb => tb.HasComment("Giữ chỗ tồn kho có thời hạn khi đặt hàng"));

            entity.HasIndex(e => new { e.ListingId, e.Status }, "ix_stock_reservation_listing_id_status");

            entity.HasIndex(e => e.OrderLineId, "uq_stock_reservation_order_line_id").IsUnique();

            entity.Property(e => e.StockReservationId).HasColumnName("stock_reservation_id");
            entity.Property(e => e.CreatedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysdatetimeoffset())", "df_stock_reservation_created_at")
                .HasColumnName("created_at");
            entity.Property(e => e.ExpiresAt)
                .HasPrecision(3)
                .HasColumnName("expires_at");
            entity.Property(e => e.ListingId).HasColumnName("listing_id");
            entity.Property(e => e.OrderLineId).HasColumnName("order_line_id");
            entity.Property(e => e.QuantityKg)
                .HasColumnType("decimal(12, 3)")
                .HasColumnName("quantity_kg");
            entity.Property(e => e.Status)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasComment("Giá trị: Active, Committed, Released")
                .HasDefaultValue("Active", "df_stock_reservation_status")
                .HasColumnName("status");
            entity.Property(e => e.UpdatedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysdatetimeoffset())", "df_stock_reservation_updated_at")
                .HasColumnName("updated_at");

            entity.HasOne(d => d.Listing).WithMany(p => p.StockReservations)
                .HasForeignKey(d => d.ListingId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("fk_stock_reservation_listing_id");

            entity.HasOne(d => d.OrderLine).WithOne(p => p.StockReservation)
                .HasForeignKey<StockReservation>(d => d.OrderLineId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("fk_stock_reservation_order_line_id");
        });

        modelBuilder.Entity<TagScan>(entity =>
        {
            entity.HasKey(e => e.TagScanId).HasName("pk_tag_scan");

            entity.ToTable("tag_scan", tb => tb.HasComment("Lượt quét tem của người mua; dùng để phát hiện tem bị sao chép"));

            entity.HasIndex(e => e.ScannedBy, "ix_tag_scan_scanned_by");

            entity.HasIndex(e => new { e.TagId, e.ScannedAt }, "ix_tag_scan_tag_id_scanned_at");

            entity.Property(e => e.TagScanId).HasColumnName("tag_scan_id");
            entity.Property(e => e.IsOrderOwner)
                .HasComment("Người quét có phải chủ đơn chứa con cua này không")
                .HasColumnName("is_order_owner");
            entity.Property(e => e.ScannedAt)
                .HasPrecision(3)
                .HasDefaultValueSql("(sysdatetimeoffset())", "df_tag_scan_scanned_at")
                .HasColumnName("scanned_at");
            entity.Property(e => e.ScannedBy).HasColumnName("scanned_by");
            entity.Property(e => e.TagId).HasColumnName("tag_id");

            entity.HasOne(d => d.ScannedByNavigation).WithMany(p => p.TagScans)
                .HasForeignKey(d => d.ScannedBy)
                .HasConstraintName("fk_tag_scan_scanned_by");

            entity.HasOne(d => d.Tag).WithMany(p => p.TagScans)
                .HasForeignKey(d => d.TagId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("fk_tag_scan_tag_id");
        });

        modelBuilder.Entity<VBatchActualRevenue>(entity =>
        {
            entity
                .HasNoKey()
                .ToView("v_batch_actual_revenue");

            entity.Property(e => e.ActualRevenue)
                .HasColumnType("decimal(38, 0)")
                .HasColumnName("actual_revenue");
            entity.Property(e => e.BatchCode)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasColumnName("batch_code");
            entity.Property(e => e.BatchId).HasColumnName("batch_id");
            entity.Property(e => e.ComplaintRefunds)
                .HasColumnType("decimal(38, 0)")
                .HasColumnName("complaint_refunds");
            entity.Property(e => e.ForfeitedDeposits)
                .HasColumnType("decimal(38, 0)")
                .HasColumnName("forfeited_deposits");
            entity.Property(e => e.OrderRevenue)
                .HasColumnType("decimal(38, 0)")
                .HasColumnName("order_revenue");
        });

        modelBuilder.Entity<VBatchCommitmentCap>(entity =>
        {
            entity
                .HasNoKey()
                .ToView("v_batch_commitment_cap");

            entity.Property(e => e.BatchCode)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasColumnName("batch_code");
            entity.Property(e => e.BatchId).HasColumnName("batch_id");
            entity.Property(e => e.CapKg)
                .HasColumnType("decimal(12, 3)")
                .HasColumnName("cap_kg");
            entity.Property(e => e.ExpectedOutputKg)
                .HasColumnType("decimal(12, 3)")
                .HasColumnName("expected_output_kg");
            entity.Property(e => e.OfftakeKg)
                .HasColumnType("decimal(38, 3)")
                .HasColumnName("offtake_kg");
            entity.Property(e => e.OfftakePreorderCapPct)
                .HasColumnType("decimal(5, 2)")
                .HasColumnName("offtake_preorder_cap_pct");
            entity.Property(e => e.PreorderKg)
                .HasColumnType("decimal(38, 3)")
                .HasColumnName("preorder_kg");
            entity.Property(e => e.RemainingKg)
                .HasColumnType("decimal(38, 3)")
                .HasColumnName("remaining_kg");
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

        modelBuilder.Entity<VCrabCountReconciliation>(entity =>
        {
            entity
                .HasNoKey()
                .ToView("v_crab_count_reconciliation");

            entity.Property(e => e.BatchId).HasColumnName("batch_id");
            entity.Property(e => e.Dead).HasColumnName("dead");
            entity.Property(e => e.DeclaredHarvested).HasColumnName("declared_harvested");
            entity.Property(e => e.Growing).HasColumnName("growing");
            entity.Property(e => e.Harvested).HasColumnName("harvested");
            entity.Property(e => e.HarvestedWithoutActiveTag).HasColumnName("harvested_without_active_tag");
            entity.Property(e => e.InStock).HasColumnName("in_stock");
            entity.Property(e => e.Lost).HasColumnName("lost");
            entity.Property(e => e.Restocked).HasColumnName("restocked");
            entity.Property(e => e.Sold).HasColumnName("sold");
            entity.Property(e => e.StockedTotal).HasColumnName("stocked_total");
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

        modelBuilder.Entity<VOperatorReputation>(entity =>
        {
            entity
                .HasNoKey()
                .ToView("v_operator_reputation");

            entity.Property(e => e.AvgRating)
                .HasColumnType("decimal(3, 2)")
                .HasColumnName("avg_rating");
            entity.Property(e => e.ClosedBatches).HasColumnName("closed_batches");
            entity.Property(e => e.ComplaintCount).HasColumnName("complaint_count");
            entity.Property(e => e.EscalatedAlerts).HasColumnName("escalated_alerts");
            entity.Property(e => e.LegalName)
                .HasMaxLength(200)
                .HasColumnName("legal_name");
            entity.Property(e => e.OperatorId)
                .ValueGeneratedOnAdd()
                .HasColumnName("operator_id");
            entity.Property(e => e.ProfitableBatches).HasColumnName("profitable_batches");
            entity.Property(e => e.Status)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasColumnName("status");
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

        modelBuilder.Entity<VTraceability>(entity =>
        {
            entity
                .HasNoKey()
                .ToView("v_traceability");

            entity.Property(e => e.AllocatedAt)
                .HasPrecision(3)
                .HasColumnName("allocated_at");
            entity.Property(e => e.BatchCode)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasColumnName("batch_code");
            entity.Property(e => e.CrabType)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasColumnName("crab_type");
            entity.Property(e => e.EvidenceCount).HasColumnName("evidence_count");
            entity.Property(e => e.FarmAddress)
                .HasMaxLength(300)
                .HasColumnName("farm_address");
            entity.Property(e => e.GradeCode)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasColumnName("grade_code");
            entity.Property(e => e.GradeName)
                .HasMaxLength(100)
                .HasColumnName("grade_name");
            entity.Property(e => e.HarvestPhotoUri)
                .HasMaxLength(400)
                .HasColumnName("harvest_photo_uri");
            entity.Property(e => e.HarvestedAt)
                .HasPrecision(3)
                .HasColumnName("harvested_at");
            entity.Property(e => e.ItemStatus)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasColumnName("item_status");
            entity.Property(e => e.ItemUuid).HasColumnName("item_uuid");
            entity.Property(e => e.MoltCount).HasColumnName("molt_count");
            entity.Property(e => e.OperatorName)
                .HasMaxLength(200)
                .HasColumnName("operator_name");
            entity.Property(e => e.OrderNo)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasColumnName("order_no");
            entity.Property(e => e.ScanCount).HasColumnName("scan_count");
            entity.Property(e => e.SlotCode)
                .HasMaxLength(30)
                .IsUnicode(false)
                .HasColumnName("slot_code");
            entity.Property(e => e.StockedAt)
                .HasPrecision(3)
                .HasColumnName("stocked_at");
            entity.Property(e => e.TagCode)
                .HasMaxLength(12)
                .IsUnicode(false)
                .IsFixedLength()
                .HasColumnName("tag_code");
            entity.Property(e => e.TagStatus)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasColumnName("tag_status");
            entity.Property(e => e.WeightG).HasColumnName("weight_g");
        });

        OnModelCreatingPartial(modelBuilder);
    }

    partial void OnModelCreatingPartial(ModelBuilder modelBuilder);
}
