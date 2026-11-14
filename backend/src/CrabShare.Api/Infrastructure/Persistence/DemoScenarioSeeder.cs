using System.Data;
using System.Diagnostics;
using System.Security.Claims;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Features.Batches;
using CrabShare.Api.Features.Contracts;
using CrabShare.Api.Features.Delivery;
using CrabShare.Api.Features.Funding;
using CrabShare.Api.Features.Grading;
using CrabShare.Api.Features.Parties;
using CrabShare.Api.Features.Payments;
using CrabShare.Api.Features.Sales;
using CrabShare.Api.Features.Settlement;
using CrabShare.Api.Features.Sourcing;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Infrastructure.Persistence;

/// <summary>
/// Kịch bản demo chờ quyết toán (Seed:DemoScenarios = true, môi trường nào cũng được; thao tác của người quản hạ tầng, xem docs/deploy.md).
/// Dựng ba Lô mã cố định, đi hết vòng tới AwaitingSettlement (đủ sáu điều kiện BR-183, sổ tiền của Lô khớp) để Admin làm trọn quyết toán trên web:
///   QT-DEMO-P01  lô P 30 con, ba nhà đầu tư mẫu góp vốn có hợp đồng, khách mẫu đặt trước 10 con đã giao xong, 20 con bán cho bên cam kết;
///   QT-DEMO-T01  lô T 12 con, bán hết cho bên cam kết (kết quả thương vụ nội bộ của CrabShare, BR-200);
///   QT-DEMO-A01  lô A 12 con của nhà cung cấp được kết nối, hoa hồng 8 % (BR-201).
/// Mọi bước đi qua service thật của API, đăng nhập thay đúng người làm bước đó (người nuôi, Admin, nhà đầu tư, khách, Nhân viên kiểm phẩm
/// được hệ thống phân ngẫu nhiên); tiền vào đi qua webhook ngân hàng như công cụ giả lập chuyển khoản. Chỉ dùng ba lối tắt thời gian mà test
/// cũng dùng: dời hạn gọi vốn về quá khứ rồi chốt vốn, dời ngày bắt đầu bán (hết số ngày bán), dời hết hạn đổi trả của chuyến đã nghiệm thu.
/// Dùng lại tài khoản mẫu (admin, operator, investor1..3, customer), hộ nuôi mẫu, nhà cung cấp và bên cam kết thu mua đã có; không xoá gì,
/// không sửa dữ liệu khác. Lô nào đã có mã thì bỏ qua; cả lượt chạy là một giao dịch, lỗi thì hoàn tác hết.
/// </summary>
public static class DemoScenarioSeeder
{
    public const string PBatchCode = "QT-DEMO-P01";
    public const string TBatchCode = "QT-DEMO-T01";
    public const string ABatchCode = "QT-DEMO-A01";
    public static readonly IReadOnlyList<string> BatchCodes = [PBatchCode, TBatchCode, ABatchCode];

    /// <summary>Lúc khởi động (Program.cs): tạo các Lô còn thiếu; lỗi chỉ ghi log, CSDL giữ nguyên.</summary>
    public static async Task<IReadOnlyList<string>> SeedAsync(IServiceProvider services, CancellationToken ct = default)
    {
        var logger = services.GetRequiredService<ILoggerFactory>().CreateLogger(nameof(DemoScenarioSeeder));
        try
        {
            return await CreateAsync(services, ct);
        }
        catch (Exception e)
        {
            logger.LogError(e, "Dựng kịch bản demo quyết toán thất bại. Đã hoàn tác, CSDL không thay đổi.");
            return [];
        }
    }

    /// <summary>Tạo các Lô còn thiếu trong một giao dịch; trả về mã các Lô vừa tạo (rỗng nếu đã đủ). Lỗi thì hoàn tác và ném ra.</summary>
    public static async Task<IReadOnlyList<string>> CreateAsync(IServiceProvider services, CancellationToken ct = default)
    {
        using var scope = services.CreateScope();
        var sp = scope.ServiceProvider;
        var logger = sp.GetRequiredService<ILoggerFactory>().CreateLogger(nameof(DemoScenarioSeeder));
        var db = sp.GetRequiredService<AppDbContext>();
        var accessor = sp.GetRequiredService<IHttpContextAccessor>();
        try
        {
            if (!await db.Database.CanConnectAsync(ct))
            {
                logger.LogWarning("Không kết nối được CSDL — bỏ qua kịch bản demo quyết toán.");
                return [];
            }
            var existing = await db.Batches.Where(b => BatchCodes.Contains(b.BatchCode)).Select(b => b.BatchCode).ToListAsync(ct);
            var missing = BatchCodes.Except(existing).ToList();
            if (missing.Count == 0)
            {
                logger.LogInformation("Kịch bản demo quyết toán đã có đủ Lô {Codes}; bỏ qua. Có thể gỡ cấu hình Seed:DemoScenarios.", string.Join(", ", BatchCodes));
                return [];
            }
            var started = Stopwatch.GetTimestamp();
            await db.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
            {
                db.ChangeTracker.Clear();
                // Một giao dịch cho cả lượt: các service bên trong chạy luôn trong giao dịch này (TransactionExtensions).
                await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.ReadCommitted, ct);
                var run = new Run(sp, db, accessor, ct);
                await run.LoadPeopleAsync();
                foreach (var code in missing)
                {
                    switch (code)
                    {
                        case PBatchCode: await run.PBatchAsync(code); break;
                        case TBatchCode: await run.TradeBatchAsync(code, "T"); break;
                        case ABatchCode: await run.TradeBatchAsync(code, "A"); break;
                    }
                }
                await transaction.CommitAsync(ct);
            });
            logger.LogInformation("Đã dựng kịch bản demo quyết toán sau {Seconds:N1} giây: {Codes} đang chờ quyết toán (AwaitingSettlement).",
                Stopwatch.GetElapsedTime(started).TotalSeconds, string.Join(", ", missing));
            return missing;
        }
        finally
        {
            accessor.HttpContext = null;
        }
    }

    private sealed class Run(IServiceProvider sp, AppDbContext db, IHttpContextAccessor accessor, CancellationToken ct)
    {
        private const string Species = "Scylla paramamosain";
        private static readonly TimeSpan Vn = TimeSpan.FromHours(7);
        private readonly TimeProvider clock = sp.GetRequiredService<TimeProvider>();
        private T S<T>() where T : notnull => sp.GetRequiredService<T>();

        private sealed record Person(long UserId, string[] Roles, long? OperatorId = null);
        private Person admin = null!, owner = null!, customer = null!;
        private readonly List<Person> investors = [];
        private long operatorId, buyerParty, supplierParty, dispatchSite, customerSite;

        private DateTimeOffset Now => clock.GetUtcNow();
        private DateOnly Today => DateOnly.FromDateTime(Now.ToOffset(Vn).DateTime);

        // ---------- người làm từng bước ----------
        private void As(Person p) => As(p.UserId, p.OperatorId, p.Roles);

        private void As(long userId, long? operatorOf, params string[] roles)
        {
            var claims = new List<Claim> { new("sub", userId.ToString()) };
            claims.AddRange(roles.Select(r => new Claim(AuthSetup.RoleClaim, r)));
            if (operatorOf is { } op) claims.Add(new Claim(CurrentUser.OperatorIdClaim, op.ToString()));
            accessor.HttpContext = new DefaultHttpContext
            {
                User = new ClaimsPrincipal(new ClaimsIdentity(claims, nameof(DemoScenarioSeeder), "name", AuthSetup.RoleClaim)),
                RequestServices = sp,
            };
        }

        private async Task<Person> UserAsync(string email, params string[] roles)
        {
            var user = await db.AppUsers.AsNoTracking().Where(u => u.Email == email && u.Status == "Active")
                           .Select(u => new { u.UserId, Roles = u.AppUserRoles.Select(r => r.RoleCode).ToList() }).SingleOrDefaultAsync(ct)
                       ?? throw new InvalidOperationException($"Thiếu tài khoản mẫu {email} đang hoạt động.");
            if (roles.Any(r => !user.Roles.Contains(r)))
                throw new InvalidOperationException($"Tài khoản mẫu {email} thiếu vai trò {string.Join(", ", roles.Except(user.Roles))}.");
            return new Person(user.UserId, user.Roles.ToArray());
        }

        public async Task LoadPeopleAsync()
        {
            admin = await UserAsync("admin@crabshare.local", Roles.PlatformAdmin);
            var o = await UserAsync("operator@crabshare.local", Roles.OperatorMember);
            operatorId = await db.OperatorMembers.AsNoTracking().Where(m => m.UserId == o.UserId && m.MemberRole == "Owner" && m.Operator.Status == "Approved")
                             .Select(m => (long?)m.OperatorId).FirstOrDefaultAsync(ct)
                         ?? throw new InvalidOperationException("operator@crabshare.local không phải chủ một hộ nuôi đang được duyệt (Approved).");
            owner = o with { OperatorId = operatorId };
            foreach (var n in new[] { 1, 2, 3 })
            {
                var investor = await UserAsync($"investor{n}@crabshare.local", Roles.Investor);
                if (!await db.Investors.AnyAsync(i => i.UserId == investor.UserId && i.VerificationStatus == "Verified", ct))
                    throw new InvalidOperationException($"investor{n}@crabshare.local chưa xác minh danh tính nên không góp vốn được.");
                investors.Add(investor);
            }
            customer = await UserAsync("customer@crabshare.local", Roles.Customer);

            var parties = S<PartyDirectory>();
            var farmParty = await parties.PartyIdOfOperatorAsync(operatorId, ct);
            dispatchSite = await db.PartySites.AsNoTracking()
                               .Where(s => s.PartyId == farmParty && s.Status == "Active" && (s.SiteType == "Farm" || s.SiteType == "Warehouse") && s.Latitude != null && s.Longitude != null)
                               .OrderByDescending(s => s.IsDefault).ThenBy(s => s.SiteType == "Farm" ? 0 : 1).Select(s => (long?)s.SiteId).FirstOrDefaultAsync(ct)
                           ?? throw new InvalidOperationException("Trại của hộ nuôi mẫu chưa có toạ độ (điểm xuất hàng cần toạ độ). Khai toạ độ trại trước (tools/demo-flows làm việc này).");
            var customerParty = await parties.PartyIdOfUserAsync(customer.UserId, ct);
            customerSite = await db.PartySites.AsNoTracking()
                               .Where(s => s.PartyId == customerParty && s.SiteType == "DeliveryAddress" && s.Status == "Active" && s.Latitude != null && s.Longitude != null)
                               .OrderByDescending(s => s.IsDefault).ThenBy(s => s.SiteId).Select(s => (long?)s.SiteId).FirstOrDefaultAsync(ct)
                           ?? throw new InvalidOperationException("customer@crabshare.local chưa có địa chỉ giao có toạ độ.");
            buyerParty = await VerifiedPartyWithRoleAsync(PartnerRoleTypes.OfftakeBuyer, "Phương Nam")
                         ?? throw new InvalidOperationException("Chưa có bên cam kết thu mua đã xác minh.");
            supplierParty = await VerifiedPartyWithRoleAsync(PartnerRoleTypes.Supplier, "Rạch Gốc")
                            ?? throw new InvalidOperationException("Chưa có nhà cung cấp đã xác minh.");
        }

        private Task<long?> VerifiedPartyWithRoleAsync(string role, string preferred)
            => db.Parties.AsNoTracking()
                .Where(p => p.VerificationStatus == "Verified" && p.Roles.Any(r => r.RoleType == role && r.Status == "Active"))
                .OrderByDescending(p => p.LegalName.Contains(preferred)).ThenBy(p => p.PartyId).Select(p => (long?)p.PartyId).FirstOrDefaultAsync(ct);

        // ---------- lô P ----------
        public async Task PBatchAsync(string code)
        {
            const int crabs = 30;
            var batches = S<BatchService>();
            As(owner);
            var created = await batches.CreateAsync(Terms("[demo] Cua thịt Năm Căn — lô P mẫu chờ quyết toán", crabs, isP: true), ct);
            await RenameAsync(created.BatchCode, code);
            await batches.SaveCostPlanAsync(code, CostPlan(crabs, seedPrice: 95_000), ct);
            await batches.SubmitAsync(code, ct);
            As(admin);
            await S<BatchReviewService>().ApproveAsync(code, new ApproveBatchRequest { FundingOpenAt = Now.AddHours(-2), FundingDeadline = Now.AddHours(2) }, ct);
            var batchId = await BatchIdAsync(code);

            // Ba nhà đầu tư mẫu góp đủ vốn mục tiêu (30 con × 150.000 đ), mỗi khoản có hợp đồng ký số đủ hai bên.
            var funding = S<FundingService>();
            var contracts = S<ContractService>();
            foreach (var (investor, amount) in investors.Zip(new long[] { 2_000_000, 1_500_000, 1_000_000 }))
            {
                As(investor);
                var risk = await funding.GetActiveDisclosureAsync(ct);
                if (risk.AcknowledgedAt is null)
                    await funding.AcknowledgeAsync(new AcknowledgeRiskRequest { RiskDisclosureId = risk.RiskDisclosureId, ScrolledToEnd = true }, ct);
                var contribution = await funding.ReserveAsync(code, new ReserveContributionRequest { Amount = amount }, ct);
                var contract = (await contracts.CreateForContributionAsync(contribution.ContributionId, ct)).Contract;
                As(owner);
                await contracts.SignAsync(contract.ContractId, ct);
                As(investor);
                await contracts.SignAsync(contract.ContractId, ct);
                var (payment, _) = await funding.RequestPaymentAsync(contribution.ContributionId, ct);
                await PayAsync(payment.ReferenceCode);
            }

            // Khách mẫu đặt trước 10 con XL Đặc cấp và trả cọc: tỷ lệ đặt trước 10/30 con, đạt mức tối thiểu để Lô mở (BR-080).
            As(customer);
            var order = await S<PreorderService>().CreateAsync(new PreorderRequest
            {
                BatchCode = code, DeliverySiteId = customerSite,
                Lines = [new PreorderLineRequest { SpecCode = "FAT-XL-SPECIAL", Mode = "ByCount", QtyCrabs = 10 }],
            }, ct);
            await PayAsync(order.Deposit!.ReferenceCode);

            // Lối tắt thời gian (như test): dời hạn gọi vốn về quá khứ rồi chốt vốn như job.
            await db.Batches.Where(b => b.BatchId == batchId).ExecuteUpdateAsync(s => s.SetProperty(b => b.FundingDeadline, Now.AddSeconds(-1)), ct);
            var outcome = await S<FundingCloseService>().CloseBatchAsync(batchId, ct);
            if (outcome?.Outcome != FundingCloseService.OutcomeCapitalClosed)
                throw new InvalidOperationException($"Lô {code} không mở được khi chốt vốn ({outcome?.Outcome ?? "không chốt"}).");

            var weights = Enumerable.Range(0, crabs).Select(i => 405m + i * 7 % 36 + 0.5m).ToList();
            await ReceiveAsync(code, weights, owner);
            await GradeAsync(code, batchId, weights, owner);

            // Giao 10 con cho khách: lập chuyến, cân lần một, cân lần hai, khách nghiệm thu và trả phần còn lại.
            await DeliverAsync(code, order.OrderNo);

            // Bán 20 con còn lại cho bên cam kết khi hết số ngày bán.
            await SellRemainingAsync(code, batchId, owner, pricePerKg: 430_000);
            await AwaitSettlementAsync(code, batchId);
        }

        // ---------- lô T và lô A ----------
        public async Task TradeBatchAsync(string code, string mode)
        {
            const int crabs = 12;
            var batches = S<BatchService>();
            As(admin);
            var title = mode == "T" ? "[demo] Cua thịt thu mua Năm Căn — lô T mẫu chờ quyết toán" : "[demo] Cua thịt đại lý Rạch Gốc — lô A mẫu chờ quyết toán";
            var created = await batches.CreateForAdminAsync(new AdminBatchRequest
            {
                BatchMode = mode, OperatorId = operatorId, SupplierPartyId = mode == "A" ? supplierParty : null, CommissionPct = mode == "A" ? 8m : null,
                Terms = Terms(title, crabs, isP: false),
            }, ct);
            await RenameAsync(created.BatchCode, code);
            await batches.SaveCostPlanAsync(code, CostPlan(crabs, seedPrice: 120_000), ct);
            await batches.SubmitAsync(code, ct);
            await S<BatchReviewService>().ApproveAsync(code, new ApproveBatchRequest { PreorderDeadline = Now.AddDays(3) }, ct);
            var batchId = await BatchIdAsync(code);

            var weights = Enumerable.Range(0, crabs).Select(i => 372m + i * 9 % 50 + 0.5m).ToList();
            await ReceiveAsync(code, weights, owner);
            await GradeAsync(code, batchId, weights, owner);
            await SellRemainingAsync(code, batchId, owner, pricePerKg: 450_000);
            await AwaitSettlementAsync(code, batchId);
        }

        // ---------- các bước dùng chung ----------
        private BatchRequest Terms(string title, int crabs, bool isP) => new()
        {
            Title = title, CrabType = "FatteningMudCrab", PlannedQuantity = crabs, HasHolding = false, ExpectedAvgWeightG = 420,
            ExpectedGrade = "Đặc cấp", SaleDays = 14, DeliveryRadiusKm = 400, DispatchSiteId = dispatchSite, ExpectedReceiptDate = Today.AddDays(20),
            MinViableCapital = isP ? 3_000_000 : null, MinViableBasis = isP ? "Tiền cua giống và thức ăn tối thiểu cho 20 con" : null,
            SurvivalThresholdPct = isP ? 85 : null, BaseRemunerationPct = isP ? 10 : null,
            RemunerationTiers = isP
                ? [new() { SurvivalFromPct = 0, SurvivalToPct = 85, RatePct = 5 }, new() { SurvivalFromPct = 85, SurvivalToPct = 100, RatePct = 10 }]
                : [],
            FloorPricePerKg = 300_000, OfftakeBuyerPartyId = buyerParty, SettlementBasis = "StandardCost",
            Offers =
            [
                new() { SpecCode = "FAT-XL-SPECIAL", PricePerKg = 520_000, ConversionWeightG = 420, OfferedQuantity = crabs },
                new() { SpecCode = "FAT-L-SPECIAL", PricePerKg = 460_000, ConversionWeightG = 330, OfferedQuantity = crabs },
            ],
        };

        /// <summary>Chi phí chuẩn 150.000 đ mỗi con (lô P) hoặc 175.000 đ (lô T, A), có dự phòng hao hụt (BR-031).</summary>
        private static CostPlanRequest CostPlan(int crabs, long seedPrice) => new()
        {
            Items =
            [
                new() { Category = "Seed", Description = "Cua thịt đầu vào 380–440 g/con", Quantity = crabs, Unit = "con", UnitPrice = seedPrice },
                new() { Category = "Feed", Description = "Thức ăn (cá tạp, ốc)", Quantity = 1, Unit = "gói", UnitPrice = crabs * 22_000L },
                new() { Category = "Utilities", Description = "Điện bơm, sục khí", Quantity = 1, Unit = "gói", UnitPrice = crabs * 10_000L },
                new() { Category = "Labour", Description = "Nhân công phân loại, đóng gói", Quantity = 1, Unit = "gói", UnitPrice = crabs * 13_000L },
                new() { Category = "MortalityReserve", Description = "Dự phòng hao hụt", Quantity = 1, Unit = "gói", UnitPrice = crabs * 10_000L },
            ],
        };

        /// <summary>Lô vừa tạo mang mã tạm "B-…"; đổi sang mã cố định của kịch bản trước khi duyệt (tài khoản Lô mở theo mã này).</summary>
        private async Task RenameAsync(string temporary, string code)
        {
            if (await db.Batches.Where(b => b.BatchCode == temporary).ExecuteUpdateAsync(s => s.SetProperty(b => b.BatchCode, code), ct) != 1)
                throw new InvalidOperationException($"Không đổi được mã Lô {temporary} sang {code}.");
        }

        private Task<long> BatchIdAsync(string code) => db.Batches.Where(b => b.BatchCode == code).Select(b => b.BatchId).SingleAsync(ct);

        /// <summary>Ngân hàng báo có đúng số tiền của mã đối chiếu, đi qua webhook như công cụ giả lập chuyển khoản.</summary>
        private async Task PayAsync(string referenceCode)
        {
            var target = await db.PaymentRequests.AsNoTracking().Where(r => r.ReferenceCode == referenceCode)
                .Select(r => new { r.Amount, r.BatchAccount.ProviderAccountNo }).SingleAsync(ct);
            var now = Now;
            var id = $"DEMO-{now:yyyyMMddHHmmss}-{Guid.NewGuid():N}"[..40];
            var result = await S<PaymentWebhookService>().ProcessAsync(
                new ProviderPaymentNotification(id, target.ProviderAccountNo, (long)target.Amount, $"{referenceCode} chuyen khoan demo", now), ct);
            if (result.Outcome != WebhookResult.Matched)
                throw new InvalidOperationException($"Giao dịch giả lập cho mã {referenceCode} không khớp ({result.Outcome}).");
        }

        /// <summary>Đơn mua nguồn, phiếu nhận, Nhân viên kiểm phẩm được phân kiểm từng con rồi đóng phiếu.</summary>
        private async Task ReceiveAsync(string code, IReadOnlyList<decimal> weights, Person farmer)
        {
            var sourcing = S<SourcingService>();
            As(farmer);
            var po = await sourcing.CreateOrderAsync(code, new ProcurementOrderRequest
            {
                SupplierPartyId = supplierParty, OrderedOn = Today, Quantity = weights.Count, UnitPrice = 120_000,
                AgreedSpec = "[demo] Cua thịt Scylla paramamosain 370–450 g, còn sống, đủ càng",
            }, ct);
            var receipt = await sourcing.CreateReceiptAsync(po.PoNo, new GoodsReceiptRequest
            {
                OriginRegion = "Tam Giang, Năm Căn, Cà Mau", HarvestedOn = Today.AddDays(-1), DeclaredSpecies = Species, DeclaredCount = weights.Count,
                DeclaredWeightKg = decimal.Round(weights.Sum() / 1000m, 3), Note = "[demo] Lô nguồn của kịch bản chờ quyết toán",
            }, ct);
            As(receipt.QcUserId!.Value, null, Roles.QcInspector);
            foreach (var w in weights)
                await sourcing.InspectAsync(receipt.ReceiptNo, new IncomingInspectionRequest
                {
                    Species = Species, Sex = "Male", Maturity = "Mature", SpeciesOk = true, Alive = true, Healthy = true, TwoClaws = true, FoodSafe = true,
                    WeightG = w + 1.5m,
                }, ct);
            await sourcing.CompleteReceiptAsync(receipt.ReceiptNo, ct);
        }

        /// <summary>Đo tay (cân + thước kẹp, mức C ≈ 0,72: XL Đặc cấp) rồi Nhân viên kiểm phẩm được phân duyệt; cua đã cọc được phân bổ ngay.</summary>
        private async Task GradeAsync(string code, long batchId, IReadOnlyList<decimal> weights, Person farmer)
        {
            var sessions = S<MeasurementSessionService>();
            var grading = S<GradingService>();
            var units = await db.CrabUnits.AsNoTracking().Where(c => c.BatchId == batchId && c.InventoryStatus == "Received")
                .OrderBy(c => c.CrabUnitId).Select(c => c.CrabCode).ToListAsync(ct);
            for (var i = 0; i < units.Count; i++)
            {
                var weight = weights[i % weights.Count];
                As(farmer);
                var session = await sessions.OpenAsync(new OpenSessionRequest { CrabCode = units[i], Procedure = "Manual" }, ct);
                var measured = await grading.RecordValuesAsync(session.SessionNo,
                    new MeasurementValuesRequest { WeightG = weight, CarapaceLengthCm = decimal.Round((decimal)Math.Cbrt((double)(weight / 0.72m)), 2) }, ct);
                var qc = await db.QcAssignments.AsNoTracking()
                    .Where(a => a.BatchId == batchId && a.AssignmentKind == "GradingSession" && a.Status == "Assigned").Select(a => a.QcUserId).SingleAsync(ct);
                As(qc, null, Roles.QcInspector);
                await grading.ApproveAsync(measured.Decision!.DecisionNo,
                    new ApproveDecisionRequest { SensoryNote = "[demo] Mai cứng, yếm chắc, càng đủ" }, ct);
            }
            var status = await db.Batches.Where(b => b.BatchId == batchId).Select(b => b.Status).SingleAsync(ct);
            if (status != "Selling") throw new InvalidOperationException($"Lô {code} chưa chuyển Selling sau khi duyệt hạng ({status}).");
        }

        private async Task DeliverAsync(string code, string orderNo)
        {
            var delivery = S<DeliveryService>();
            As(owner);
            var tranche = (await delivery.TranchesAsync(code, ct)).Single(t => t.OrderNo == orderNo);
            var shipment = await delivery.CreateShipmentAsync(tranche.TrancheId, new CreateShipmentRequest
            {
                ScheduledAt = Now.AddHours(-6), TransportCondition = "[demo] Thùng xốp, đá lạnh 18–22 °C, xe lạnh Năm Căn – TP.HCM",
            }, ct);
            tranche = (await delivery.TranchesAsync(code, ct)).Single(t => t.OrderNo == orderNo);
            var grams = await (from a in db.InventoryAllocations.AsNoTracking()
                               join d in db.GradeDecisions on a.GradeDecisionId equals d.GradeDecisionId
                               where a.TrancheId == tranche.TrancheId && a.ReleasedAt == null
                               select new { a.LineId, d.WeightG }).ToListAsync(ct);
            var lines = tranche.Lines.Select(l => new
            {
                l.LineId, Crabs = l.AllocatedCrabs,
                Kg = decimal.Round(grams.Where(g => g.LineId == l.LineId).Sum(g => g.WeightG ?? 0) / 1000m, 3),
            }).ToList();
            await delivery.DispatchAsync(shipment.ShipmentNo, new DispatchRequest
            {
                Lines = lines.Select(l => new DispatchLineRequest { LineId = l.LineId, DispatchedCrabs = l.Crabs, DispatchedKg = l.Kg }).ToList(),
            }, ct);
            await delivery.RecordReceiptAsync(shipment.ShipmentNo, new ReceiptRequest
            {
                Lines = lines.Select(l => new ReceiptLineRequest
                {
                    LineId = l.LineId, ReceivedCrabs = l.Crabs, ReceivedKg = l.Kg - 0.02m, AcceptedCrabs = l.Crabs, AcceptedKg = l.Kg - 0.02m,
                }).ToList(),
            }, ct);
            As(customer);
            var accepted = await delivery.ConfirmAcceptanceAsync(shipment.ShipmentNo, ct);
            if (accepted.Balance is { } balance) await PayAsync(balance.ReferenceCode);

            // Lối tắt thời gian (như test): hết hạn đổi trả 72 giờ, không có khiếu nại → đơn hoàn tất, tiền hàng thành doanh thu (BR-175, BR-184).
            var past = Now.AddMinutes(-1);
            await db.Shipments.Where(s => s.ShipmentNo == shipment.ShipmentNo).ExecuteUpdateAsync(u => u.SetProperty(s => s.ReturnWindowEndsAt, past), ct);
            await db.SalesOrders.Where(o => o.OrderNo == orderNo).ExecuteUpdateAsync(u => u.SetProperty(o => o.ReturnWindowEndsAt, past), ct);
            await S<DeliveryJobService>().CompleteOrdersAsync(ct);
            var status = await db.SalesOrders.Where(o => o.OrderNo == orderNo).Select(o => o.Status).SingleAsync(ct);
            if (status != "Completed") throw new InvalidOperationException($"Đơn {orderNo} chưa hoàn tất ({status}).");
        }

        /// <summary>Lối tắt thời gian (như test): hết số ngày bán; đơn hàng cuối cho bên cam kết với toàn bộ cua còn lại, rồi bên cam kết chuyển tiền.</summary>
        private async Task SellRemainingAsync(string code, long batchId, Person farmer, long pricePerKg)
        {
            var saleDays = await db.Batches.Where(b => b.BatchId == batchId).Select(b => b.SaleDays ?? 0).SingleAsync(ct);
            await db.Batches.Where(b => b.BatchId == batchId).ExecuteUpdateAsync(s => s.SetProperty(b => b.SellingStartedAt, Now.AddDays(-saleDays - 1)), ct);
            var grams = await (from c in db.CrabUnits.AsNoTracking()
                               join d in db.GradeDecisions on c.CrabUnitId equals d.CrabUnitId
                               where c.BatchId == batchId && c.InventoryStatus == "Graded" && d.IsCurrent && d.Status == "Approved"
                               select d.WeightG ?? 0).ToListAsync(ct);
            As(farmer);
            var sale = await S<DirectSaleService>().CreateFinalOrderAsync(code,
                new FinalOrderRequest { Kg = decimal.Round(grams.Sum() / 1000m, 3), PricePerKg = pricePerKg }, ct);
            await PayAsync(sale.Payment!.ReferenceCode);
        }

        /// <summary>Đủ sáu điều kiện thì job chuyển Lô sang chờ quyết toán; chạy ngay bước đó của job (BR-183).</summary>
        private async Task AwaitSettlementAsync(string code, long batchId)
        {
            var readiness = S<SettlementReadinessService>();
            await readiness.AdvanceAsync(ct);
            var batch = await db.Batches.AsNoTracking().SingleAsync(b => b.BatchId == batchId, ct);
            if (batch.Status != "AwaitingSettlement")
            {
                var missing = (await readiness.ConditionsAsync(batch, ct)).Where(c => !c.Met).Select(c => $"{c.Code} ({c.Pending})");
                throw new InvalidOperationException($"Lô {code} chưa chờ quyết toán ({batch.Status}); điều kiện còn thiếu: {string.Join(", ", missing)}.");
            }
        }
    }
}
