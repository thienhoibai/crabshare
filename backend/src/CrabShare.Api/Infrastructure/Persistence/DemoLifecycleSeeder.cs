using System.Security.Cryptography;
using System.Text;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Infrastructure.Persistence;

/// <summary>
/// Dữ liệu demo đủ vòng đời (TH-03) để cả nhóm làm song song. Danh sách đầy đủ: database/README.md.
/// Mã lô trùng dữ liệu mẫu của app mobile để màn đang dùng mock chuyển sang API không bị lệch.
///   CS-2605-01 Settlement      cua gạch 200 con (hộp 1501–1700), bán hết qua 12 đơn Completed, chờ quyết toán
///   CS-2609-04 Harvesting      cua thịt 300 con (hộp 1201–1500), 288 con InStock có tem Active, niêm yết còn tồn
///   CS-2610-01 InProduction    cua thịt 1.200 con (hộp 0001–1200), 20 con chết, nhật ký 30 ngày, ảnh bằng chứng
///   CS-2610-02 Funding         cua gạch, đang gọi vốn: đã xác nhận 25/60 triệu
///   CS-2610-03 Funding         cua lột, đang gọi vốn: đã xác nhận 50/120 triệu
///   CS-2611-01 PendingApproval cua gạch, chi phí chuẩn đã gửi, chờ quản trị duyệt
/// Mốc thời gian tính lùi từ lúc seed nên dữ liệu luôn "đang diễn ra"; Random cố định nên chạy lại cho cùng số liệu.
/// Tiền là số nguyên đồng. Mọi khoản góp Confirmed đều có hợp đồng đã ký, yêu cầu thanh toán Paid và giao dịch ngân hàng khớp.
/// </summary>
internal sealed class DemoLifecycleSeeder
{
    public sealed record Buyer(AppUser User, CustomerAddress Address);

    public sealed record People(AppUser Admin, AppUser Owner, AppUser Staff, IReadOnlyList<AppUser> Investors,
        IReadOnlyList<Buyer> Buyers, Operator Farm, PayoutAccount FarmPayout);

    private sealed record Cost(string Category, string Description, decimal Quantity, string Unit, decimal UnitPrice, byte? Tranche);

    private const string Crockford = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
    private const decimal FarmLatitude = 8.7590m, FarmLongitude = 104.9910m;
    private static readonly TimeSpan Vietnam = TimeSpan.FromHours(7);
    private static readonly string[] UnlockConditions =
    [
        "Thả giống đủ số lượng, có ảnh từng hộp",
        "Nhật ký đủ 30 ngày liên tục, tỷ lệ sống từ 90%",
        "Khai báo thu hoạch và cân từng con",
    ];

    private static readonly Dictionary<string, decimal> MudCrabPrices = new() { ["L1"] = 650_000, ["L2"] = 520_000, ["L3"] = 420_000, ["L4"] = 320_000 };
    private static readonly Dictionary<string, decimal> RoeCrabPrices = new() { ["L1"] = 720_000, ["L2"] = 600_000, ["L3"] = 480_000, ["L4"] = 380_000 };

    private readonly AppDbContext db;
    private readonly People p;
    private readonly DateTimeOffset now;
    private readonly Random rng = new(20261013);
    private readonly HashSet<string> usedCodes = [];
    private int txnNo;
    private Dictionary<string, ProductGrade> grades = null!;
    private List<FeeTier> feeTiers = null!;
    private ContractTemplate template = null!;
    private List<PhysicalSlot> boxes = null!;   // boxes[0] là hộp 0001

    private DemoLifecycleSeeder(AppDbContext db, People p, DateTimeOffset now)
    {
        this.db = db;
        this.p = p;
        this.now = now;
    }

    public static Task SeedAsync(AppDbContext db, People people, DateTimeOffset now) => new DemoLifecycleSeeder(db, people, now).RunAsync();

    private async Task RunAsync()
    {
        grades = await db.ProductGrades.ToDictionaryAsync(g => g.GradeCode);
        feeTiers = await db.FeeTiers.ToListAsync();
        template = await db.ContractTemplates.SingleAsync(t => t.Status == "Active");
        boxes = await db.PhysicalSlots.Where(s => s.OperatorId == p.Farm.OperatorId).OrderBy(s => s.SlotCode).ToListAsync();

        var risk = await db.RiskDisclosures.SingleAsync(r => r.Status == "Active");
        foreach (var investor in p.Investors)
            db.RiskAcknowledgements.Add(new RiskAcknowledgement
            {
                InvestorId = investor.UserId, RiskDisclosureId = risk.RiskDisclosureId,
                AcknowledgedAt = Day(-170), ScrolledToEnd = true, CreatedAt = Day(-170),
            });

        await SettlementBatchAsync();
        await HarvestingBatchAsync();
        await InProductionBatchAsync();
        await FundingBatchAsync();
        await RoeFundingBatchAsync();
        await PendingApprovalBatchAsync();
    }

    // ---------- 6 lô ----------

    private async Task SettlementBatchAsync()
    {
        var b = NewBatch("CS-2605-01", "RoeCrab", "Cua gạch Năm Căn — vụ tháng 5", 200, 80m, 90,
            40_000_000, 48_000_000, 60_000_000, Day(-170));
        Approve(b, Day(-165), Day(-151));
        var costs = Costs(b, "Locked", Day(-167), Day(-165),
            new("Seed", "Cua gạch giống 180–200 g/con", 200, "con", 55_000, 1),
            new("Feed", "Thức ăn tháng 1–2 (cá tạp, ốc)", 200, "kg", 25_000, 1),
            new("Feed", "Thức ăn tháng 3", 200, "kg", 25_000, 2),
            new("Utilities", "Điện bơm, sục khí, lọc nước", 3, "tháng", 830_000, 2),
            new("Labour", "Nhân công chăm sóc", 3, "tháng", 2_000_000, 2),
            new("MortalityReserve", "Dự phòng hao hụt", 1, "gói", 2_000_000, 3),
            new("Depreciation", "Khấu hao hộp và hệ thống lọc", 1, "vụ", 1_500_000, null),
            new("Other", "Đóng gói, vận chuyển khi bán", 1, "gói", 1_000_000, 3));
        CloseCapital(b, Day(-151),
            (p.Investors[0], 20_000_000, Day(-160)), (p.Investors[1], 15_000_000, Day(-158)), (p.Investors[2], 13_000_000, Day(-155)));
        var tranches = Tranches(b, costs, DateOf(-148), DateOf(-118), DateOf(-57));

        var crabs = Stock(b, firstBox: 1501, count: 200, Day(-148));
        Release(b, tranches[0], Day(-148, 3));
        foreach (var crab in Pick(crabs, 8)) Kill(crab, Day(-rng.Next(80, 141)));
        Release(b, tranches[1], Day(-118));
        Logs(b, lastDay: Day(-58), days: 30, feedMin: 4, feedMax: 6);

        b.HarvestStartedAt = Day(-57);
        Release(b, tranches[2], Day(-57, 5));
        var harvested = Harvest(b, crabs, Day(-57), minWeight: 260, maxWeight: 640);
        var listings = Listings(b, harvested, "Cua gạch Năm Căn", RoeCrabPrices, Day(-57, 6), "Published");
        var orders = harvested.OrderBy(_ => rng.Next()).Chunk(16).ToList();
        for (var i = 0; i < orders.Count; i++)
            SellCompleted(b, orders[i], listings, p.Buyers[i % p.Buyers.Count], Day(-56 + i, 9));
        foreach (var listing in listings.Values.Where(l => l.StockQtyKg == 0)) listing.Status = "SoldOut";

        b.Status = "Settlement";
        await db.SaveChangesAsync();
    }

    private async Task HarvestingBatchAsync()
    {
        var b = NewBatch("CS-2609-04", "FatteningMudCrab", "Cua thịt vỗ béo — vụ tháng 7", 300, 120m, 95,
            60_000_000, 80_000_000, 100_000_000, Day(-120));
        Approve(b, Day(-115), Day(-101));
        var costs = Costs(b, "Locked", Day(-117), Day(-115),
            new("Seed", "Cua thịt giống 200–250 g/con", 300, "con", 52_000, 1),
            new("Feed", "Thức ăn tháng 1–2", 330, "kg", 26_000, 1),
            new("Feed", "Thức ăn tháng 3", 330, "kg", 26_000, 2),
            new("Utilities", "Điện bơm, sục khí, lọc nước", 3, "tháng", 1_100_000, 2),
            new("Labour", "Nhân công chăm sóc", 3, "tháng", 3_000_000, 2),
            new("MortalityReserve", "Dự phòng hao hụt", 1, "gói", 3_000_000, 3),
            new("Depreciation", "Khấu hao hộp và hệ thống lọc", 1, "vụ", 2_500_000, null),
            new("Other", "Đóng gói, vận chuyển khi bán", 1, "gói", 1_500_000, 3));
        CloseCapital(b, Day(-101),
            (p.Investors[0], 30_000_000, Day(-112)), (p.Investors[1], 25_000_000, Day(-110)), (p.Investors[3], 20_000_000, Day(-106)));
        var tranches = Tranches(b, costs, DateOf(-98), DateOf(-68), DateOf(-3));

        var crabs = Stock(b, firstBox: 1201, count: 300, Day(-98));
        Release(b, tranches[0], Day(-98, 3));
        foreach (var crab in Pick(crabs, 12)) Kill(crab, Day(-rng.Next(10, 91)));
        Release(b, tranches[1], Day(-68));
        Molt(crabs, 20, -90, -10);
        Logs(b, lastDay: Day(-3), days: 30, feedMin: 6, feedMax: 8);

        b.HarvestStartedAt = Day(-3);
        tranches[2].Status = "Requested";
        tranches[2].RequestedAt = Day(-3, 5);
        var harvested = Harvest(b, crabs, Day(-2), minWeight: 230, maxWeight: 620);
        Listings(b, harvested, "Cua thịt Năm Căn", MudCrabPrices, Day(-2, 5), "Published");

        b.Status = "Harvesting";
        await db.SaveChangesAsync();
    }

    private async Task InProductionBatchAsync()
    {
        var b = NewBatch("CS-2610-01", "FatteningMudCrab", "Cua thịt vỗ béo Năm Căn — 1.200 hộp", 1200, 480m, 90,
            150_000_000, 180_000_000, 220_000_000, Day(-70));
        Approve(b, Day(-65), Day(-51));
        var costs = Costs(b, "Locked", Day(-67), Day(-65),
            new("Seed", "Cua thịt giống 200–250 g/con", 1200, "con", 52_000, 1),
            new("Feed", "Thức ăn tháng 1–2", 1300, "kg", 26_000, 1),
            new("Feed", "Thức ăn tháng 3", 1300, "kg", 26_000, 2),
            new("Utilities", "Điện bơm, sục khí, lọc nước", 3, "tháng", 4_000_000, 2),
            new("Labour", "Nhân công chăm sóc", 3, "tháng", 6_000_000, 2),
            new("MortalityReserve", "Dự phòng hao hụt", 1, "gói", 6_000_000, 3),
            new("Depreciation", "Khấu hao hộp và hệ thống lọc", 1, "vụ", 5_000_000, null),
            new("Other", "Đóng gói, vận chuyển khi bán", 1, "gói", 3_000_000, 3));
        CloseCapital(b, Day(-51),
            (p.Investors[0], 60_000_000, Day(-63)), (p.Investors[1], 50_000_000, Day(-60)),
            (p.Investors[2], 40_000_000, Day(-57)), (p.Investors[3], 30_000_000, Day(-54)));
        var tranches = Tranches(b, costs, DateOf(-44), DateOf(-14), DateOf(46));

        // Thả hôm nay - 44 ngày → hôm nay là "ngày 45/90"
        var crabs = Stock(b, firstBox: 1, count: 1200, Day(-44));
        Release(b, tranches[0], Day(-44, 3));
        foreach (var crab in Pick(crabs, 20)) Kill(crab, Day(-rng.Next(1, 41)));
        Release(b, tranches[1], Day(-14));
        Molt(crabs, 30, -40, -1);
        Logs(b, lastDay: Day(-1), days: 30, feedMin: 22, feedMax: 28, outOfRangeBeforeLast: 11);   // pH vượt ngưỡng 12 ngày trước
        EvidencePhotos(b, crabs);

        b.Status = "InProduction";
        await db.SaveChangesAsync();
    }

    private async Task FundingBatchAsync()
    {
        var b = NewBatch("CS-2610-03", "SoftShellCrab", "Cua lột hộp nhựa Năm Căn — gọi vốn tháng 10", 600, 150m, 60,
            90_000_000, 120_000_000, 150_000_000, Day(-8));
        Approve(b, Day(-3), Day(11));
        var costs = Costs(b, "Locked", Day(-6), Day(-3),
            new("Seed", "Cua giống chuẩn bị lột 120–150 g/con", 600, "con", 70_000, 1),
            new("Feed", "Thức ăn tháng 1", 600, "kg", 28_000, 1),
            new("Feed", "Thức ăn tháng 2", 600, "kg", 28_000, 2),
            new("Utilities", "Điện bơm, sục khí, lọc nước", 2, "tháng", 3_500_000, 2),
            new("Labour", "Nhân công trực lột ca đêm", 2, "tháng", 7_000_000, 2),
            new("MortalityReserve", "Dự phòng hao hụt", 1, "gói", 6_000_000, 3),
            new("Depreciation", "Khấu hao hộp và hệ thống lọc", 1, "vụ", 4_000_000, null),
            new("Other", "Đóng gói lạnh khi bán", 1, "gói", 3_000_000, 3));
        Contribute(b, p.Investors[0], 30_000_000, Day(-2), snapshot: false);
        Contribute(b, p.Investors[1], 20_000_000, Day(-1), snapshot: false);
        Tranches(b, costs, DateOf(15), DateOf(45), DateOf(75));

        b.Status = "Funding";
        await db.SaveChangesAsync();
    }

    private async Task RoeFundingBatchAsync()
    {
        var b = NewBatch("CS-2610-02", "RoeCrab", "Cua gạch Năm Căn — gọi vốn tháng 10", 250, 100m, 90,
            45_000_000, 60_000_000, 75_000_000, Day(-6));
        Approve(b, Day(-4), Day(10));
        var costs = Costs(b, "Locked", Day(-5), Day(-4),
            new("Seed", "Cua gạch giống 180–200 g/con", 250, "con", 56_000, 1),
            new("Feed", "Thức ăn tháng 1–2", 250, "kg", 25_000, 1),
            new("Feed", "Thức ăn tháng 3", 250, "kg", 25_000, 2),
            new("Utilities", "Điện bơm, sục khí, lọc nước", 3, "tháng", 1_000_000, 2),
            new("Labour", "Nhân công chăm sóc", 3, "tháng", 2_500_000, 2),
            new("MortalityReserve", "Dự phòng hao hụt", 1, "gói", 2_500_000, 3),
            new("Depreciation", "Khấu hao hộp và hệ thống lọc", 1, "vụ", 1_800_000, null),
            new("Other", "Đóng gói, vận chuyển khi bán", 1, "gói", 1_200_000, 3));
        Contribute(b, p.Investors[2], 15_000_000, Day(-3), snapshot: false);
        Contribute(b, p.Investors[3], 10_000_000, Day(-2), snapshot: false);
        Tranches(b, costs, DateOf(14), DateOf(44), DateOf(100));

        b.Status = "Funding";
        await db.SaveChangesAsync();
    }

    private async Task PendingApprovalBatchAsync()
    {
        var b = NewBatch("CS-2611-01", "RoeCrab", "Cua gạch Năm Căn — đợt tháng 11", 250, 100m, 90,
            45_000_000, 60_000_000, 75_000_000, Day(-2));
        Costs(b, "Submitted", Day(-1), null,
            new("Seed", "Cua gạch giống 180–200 g/con", 250, "con", 56_000, 1),
            new("Feed", "Thức ăn tháng 1–2", 250, "kg", 25_000, 1),
            new("Feed", "Thức ăn tháng 3", 250, "kg", 25_000, 2),
            new("Utilities", "Điện bơm, sục khí, lọc nước", 3, "tháng", 1_000_000, 2),
            new("Labour", "Nhân công chăm sóc", 3, "tháng", 2_500_000, 2),
            new("MortalityReserve", "Dự phòng hao hụt", 1, "gói", 2_500_000, 3),
            new("Depreciation", "Khấu hao hộp và hệ thống lọc", 1, "vụ", 1_800_000, null),
            new("Other", "Đóng gói, vận chuyển khi bán", 1, "gói", 1_200_000, 3));

        b.Status = "PendingApproval";
        await db.SaveChangesAsync();
    }

    // ---------- Gọi vốn ----------

    private Batch NewBatch(string code, string crabType, string title, int seedQuantity, decimal expectedKg, short cycleDays,
        decimal minViable, decimal target, decimal max, DateTimeOffset createdAt)
    {
        var batch = new Batch
        {
            BatchCode = code, OperatorId = p.Farm.OperatorId, CrabType = crabType, Title = title,
            SeedQuantity = seedQuantity, ExpectedOutputKg = expectedKg, CycleDays = cycleDays, RestockCutoffDays = 15,
            MinViableCapital = minViable, TargetCapital = target, MaxCapital = max, MinContribution = 1_000_000,
            OperatorSharePct = 7.00m, FrozenStockCapMonths = 4, OfftakePreorderCapPct = 60.00m, OfftakeDepositPct = 15.00m,
            Status = "Draft", CreatedAt = createdAt, UpdatedAt = now,
        };
        db.Batches.Add(batch);
        return batch;
    }

    /// <summary>Quản trị duyệt: chọn bậc phí theo vốn mục tiêu, mở gọi vốn, mở tài khoản chuyên dùng của lô.</summary>
    private void Approve(Batch b, DateTimeOffset approvedAt, DateTimeOffset fundingDeadline)
    {
        var tier = feeTiers.Single(t => b.TargetCapital >= t.MinCapital && (t.MaxCapital is null || b.TargetCapital < t.MaxCapital));
        b.FeeTierId = tier.FeeTierId;
        b.PlatformFeeAmount = tier.FeeAmount;
        b.ApprovedBy = p.Admin.UserId;
        b.ApprovedAt = approvedAt;
        b.FundingOpenAt = approvedAt;
        b.FundingDeadline = fundingDeadline;
        b.BatchAccount = new BatchAccount
        {
            ProviderName = "Trung gian thanh toán (sandbox)", ProviderAccountNo = "SBX" + b.BatchCode.Replace("-", ""),
            Status = "Open", OpenedAt = approvedAt, CreatedAt = approvedAt, UpdatedAt = now,
        };
    }

    private StandardCostVersion Costs(Batch b, string status, DateTimeOffset submittedAt, DateTimeOffset? lockedAt, params Cost[] items)
    {
        var version = new StandardCostVersion
        {
            VersionNo = 1, Status = status, SubmittedAt = submittedAt,
            ApprovedBy = lockedAt is null ? null : p.Admin.UserId, ApprovedAt = lockedAt, LockedAt = lockedAt,
            CreatedAt = submittedAt.AddHours(-3), UpdatedAt = now,
        };
        foreach (var c in items)
            version.StandardCostItems.Add(new StandardCostItem
            {
                Category = c.Category, Description = c.Description, Quantity = c.Quantity, Unit = c.Unit,
                UnitPrice = c.UnitPrice, TrancheNo = c.Tranche, CreatedAt = version.CreatedAt,
            });
        b.StandardCostVersion = version;
        return version;
    }

    private List<DisbursementTranche> Tranches(Batch b, StandardCostVersion costs, params DateOnly[] plannedDates)
    {
        var tranches = costs.StandardCostItems.Where(i => i.TrancheNo is not null)
            .GroupBy(i => i.TrancheNo!.Value).OrderBy(g => g.Key)
            .Select(g => new DisbursementTranche
            {
                TrancheNo = g.Key, PlannedAmount = g.Sum(i => i.Quantity * i.UnitPrice), PlannedDate = plannedDates[g.Key - 1],
                UnlockCondition = UnlockConditions[g.Key - 1], Status = "Planned", CreatedAt = costs.LockedAt ?? now, UpdatedAt = now,
            })
            .ToList();
        foreach (var t in tranches) b.DisbursementTranches.Add(t);
        return tranches;
    }

    /// <summary>Hết hạn gọi vốn và đủ vốn khả thi: chụp capital_share cho từng nhà đầu tư.</summary>
    private void CloseCapital(Batch b, DateTimeOffset closedAt, params (AppUser Investor, decimal Amount, DateTimeOffset ReservedAt)[] contributions)
    {
        b.CapitalClosedAt = closedAt;
        b.TotalConfirmedCapital = contributions.Sum(c => c.Amount);
        foreach (var (investor, amount, reservedAt) in contributions)
            Contribute(b, investor, amount, reservedAt, snapshot: true);
    }

    /// <summary>Một khoản góp đi đủ luồng: giữ chỗ → hợp đồng ký số (người nuôi rồi nhà đầu tư) → VietQR → tiền về → Confirmed.</summary>
    private void Contribute(Batch b, AppUser investor, decimal amount, DateTimeOffset reservedAt, bool snapshot)
    {
        var contribution = new Contribution
        {
            Batch = b, InvestorId = investor.UserId, Amount = amount, Status = "Confirmed",
            ReservedAt = reservedAt, ExpiresAt = reservedAt.AddMinutes(30), ConfirmedAt = reservedAt.AddMinutes(9),
            CreatedAt = reservedAt, UpdatedAt = now,
        };
        db.Contributions.Add(contribution);

        var contractNo = $"HD-{b.BatchCode[3..]}-{investor.UserId:000}";
        var draftHash = Sha($"draft|{contractNo}");
        var contract = new InvestmentContract
        {
            ContractNo = contractNo, Contribution = contribution, TemplateId = template.TemplateId, Status = "FullySigned",
            SigningMethod = "DigitalSignature", DraftHash = draftHash, FinalHash = Sha($"final|{contractNo}"),
            FullySignedAt = reservedAt.AddMinutes(5), CreatedAt = reservedAt.AddMinutes(1), UpdatedAt = now,
        };
        contract.ContractSignatures.Add(new ContractSignature
        {
            SignerRole = "Operator", SigningOrder = 1, SignerUserId = p.Owner.UserId, ProviderRequestId = $"VT-SBX-{contractNo}-1",
            SignedHash = draftHash, SignedAt = reservedAt.AddMinutes(2), CreatedAt = reservedAt.AddMinutes(2),
        });
        contract.ContractSignatures.Add(new ContractSignature
        {
            SignerRole = "Investor", SigningOrder = 2, SignerUserId = investor.UserId, ProviderRequestId = $"VT-SBX-{contractNo}-2",
            SignedHash = draftHash, SignedAt = reservedAt.AddMinutes(5), CreatedAt = reservedAt.AddMinutes(5),
        });
        db.InvestmentContracts.Add(contract);

        Pay(b, amount, reservedAt.AddMinutes(8), "Contribution", NewCode("GV", 11), contribution: contribution);
        if (snapshot)
            db.CapitalShares.Add(new CapitalShare
            {
                Batch = b, InvestorId = investor.UserId, ConfirmedAmount = amount,
                SnapshottedAt = b.CapitalClosedAt!.Value, CreatedAt = b.CapitalClosedAt.Value,
            });
    }

    // ---------- Tiền vào / ra tài khoản lô ----------

    /// <summary>Yêu cầu thu tiền đã được trả + giao dịch tiền vào do trung gian báo về (đã khớp mã đối chiếu).</summary>
    private void Pay(Batch b, decimal amount, DateTimeOffset paidAt, string purpose, string referenceCode,
        Contribution? contribution = null, SalesOrder? order = null)
    {
        var request = new PaymentRequest
        {
            ReferenceCode = referenceCode, BatchAccount = b.BatchAccount!, Purpose = purpose, Amount = amount,
            Contribution = contribution, Order = order, ExpiresAt = paidAt.AddMinutes(20), Status = "Paid",
            CreatedAt = paidAt.AddMinutes(-3), UpdatedAt = now,
        };
        db.PaymentRequests.Add(request);
        db.ProviderTransactions.Add(new ProviderTransaction
        {
            ProviderTxnId = NextTxnId(), BatchAccount = b.BatchAccount!, Direction = "In", Amount = amount,
            ReferenceCode = referenceCode, PaymentRequest = request, MatchStatus = "Matched",
            OccurredAt = paidAt, ReceivedAt = paidAt.AddSeconds(4),
        });
    }

    /// <summary>Giải ngân một đợt cho người nuôi: lệnh chi Succeeded + giao dịch tiền ra.</summary>
    private void Release(Batch b, DisbursementTranche tranche, DateTimeOffset releasedAt)
    {
        tranche.Status = "Released";
        tranche.RequestedAt = releasedAt.AddHours(-20);
        tranche.ReleasedAt = releasedAt;
        var instruction = new PaymentInstruction
        {
            BatchAccount = b.BatchAccount!, InstructionType = "Disbursement", Amount = tranche.PlannedAmount, PayoutAccount = p.FarmPayout,
            BeneficiaryNote = $"Giải ngân đợt {tranche.TrancheNo} lô {b.BatchCode}", Tranche = tranche, Status = "Succeeded",
            SentAt = releasedAt, CompletedAt = releasedAt.AddMinutes(3), CreatedAt = releasedAt, UpdatedAt = now,
        };
        db.PaymentInstructions.Add(instruction);
        db.ProviderTransactions.Add(new ProviderTransaction
        {
            ProviderTxnId = NextTxnId(), BatchAccount = b.BatchAccount!, Direction = "Out", Amount = tranche.PlannedAmount,
            ReferenceCode = $"GN{b.BatchCode.Replace("-", "")}D{tranche.TrancheNo}", Instruction = instruction, MatchStatus = "Matched",
            OccurredAt = releasedAt.AddMinutes(3), ReceivedAt = releasedAt.AddMinutes(3),
        });
    }

    // ---------- Sản xuất ----------

    /// <summary>Thả mỗi hộp một con: phân hộp, sự kiện Stocked của hộp và của con cua.</summary>
    private List<CrabItem> Stock(Batch b, int firstBox, int count, DateTimeOffset stockedAt)
    {
        b.StockedAt = stockedAt;
        b.ExpectedHarvestDate = DateOnly.FromDateTime(stockedAt.ToOffset(Vietnam).AddDays(b.CycleDays).Date);
        var crabs = new List<CrabItem>(count);
        for (var i = 0; i < count; i++)
        {
            var box = boxes[firstBox - 1 + i];
            var allocation = new SlotAllocation { Batch = b, Slot = box, AllocatedAt = stockedAt, CreatedAt = stockedAt };
            db.SlotAllocations.Add(allocation);
            db.SlotEvents.Add(new SlotEvent
            {
                SlotAllocation = allocation, Batch = b, EventType = "Stocked", OccurredAt = stockedAt, Quantity = 1,
                Source = "Manual", ReceivedAt = stockedAt,
            });
            var crab = new CrabItem { Batch = b, SlotAllocation = allocation, StockedAt = stockedAt, Status = "Growing", CreatedAt = stockedAt, UpdatedAt = now };
            crab.CrabItemEvents.Add(new CrabItemEvent
            {
                EventType = "Stocked", OccurredAt = stockedAt, ActorId = p.Staff.UserId, Note = $"Thả vào hộp {box.SlotCode}", CreatedAt = stockedAt,
            });
            db.CrabItems.Add(crab);
            box.Status = "Occupied";
            box.UpdatedAt = now;
            crabs.Add(crab);
        }
        return crabs;
    }

    /// <summary>Hao hụt: con cua chết, hộp được giải phóng.</summary>
    private void Kill(CrabItem crab, DateTimeOffset at)
    {
        crab.Status = "Dead";
        crab.UpdatedAt = now;
        crab.SlotAllocation.ReleasedAt = at;
        crab.SlotAllocation.Slot.Status = "Available";
        db.SlotEvents.Add(new SlotEvent
        {
            SlotAllocation = crab.SlotAllocation, Batch = crab.Batch, EventType = "Mortality", OccurredAt = at, Quantity = 1,
            Note = "Phát hiện khi kiểm tra buổi sáng", Source = "Manual", ReceivedAt = at,
        });
        crab.CrabItemEvents.Add(new CrabItemEvent { EventType = "Died", OccurredAt = at, ActorId = p.Staff.UserId, CreatedAt = at });
    }

    private void Molt(List<CrabItem> crabs, int count, int fromDay, int toDay)
    {
        foreach (var crab in Pick(crabs.Where(c => c.Status == "Growing").ToList(), count))
        {
            var at = Day(rng.Next(fromDay, toDay + 1), 7);
            db.SlotEvents.Add(new SlotEvent
            {
                SlotAllocation = crab.SlotAllocation, Batch = crab.Batch, EventType = "Molted", OccurredAt = at, Quantity = 1,
                Source = "Manual", ReceivedAt = at,
            });
        }
    }

    /// <summary>
    /// Nhật ký ngày do nhân viên nhập (hệ thống không đo nước), kết thúc ở <paramref name="lastDay"/>.
    /// <paramref name="outOfRangeBeforeLast"/>: ngày thứ mấy tính lùi từ lastDay có pH vượt ngưỡng.
    /// </summary>
    private void Logs(Batch b, DateTimeOffset lastDay, int days, decimal feedMin, decimal feedMax, int? outOfRangeBeforeLast = null)
    {
        for (var ago = days - 1; ago >= 0; ago--)
        {
            var at = lastDay.AddDays(-ago).AddHours(8);
            var outOfRange = ago == outOfRangeBeforeLast;
            db.ProductionLogs.Add(new ProductionLog
            {
                Batch = b, LogDate = DateOnly.FromDateTime(at.ToOffset(Vietnam).Date),
                WaterTempC = Round1(27.0 + rng.NextDouble() * 3.0), SalinityPpt = Round1(14.0 + rng.NextDouble() * 4.0),
                Ph = outOfRange ? 8.8m : Round1(7.6 + rng.NextDouble() * 0.6),
                FeedKg = Math.Round(feedMin + (decimal)rng.NextDouble() * (feedMax - feedMin), 3),
                Note = outOfRange ? "pH cao sau mưa lớn, đã thay 20% nước" : null,
                Source = "Manual", PlausibilityFlag = outOfRange ? "OutOfRange" : "Ok", RecordedBy = p.Staff.UserId,
                ReceivedAt = at, CreatedAt = at,
            });
        }
    }

    /// <summary>Ảnh chụp trực tiếp trong app khi kiểm tra hộp: 8 ảnh đạt, 1 ảnh bị gắn cờ chờ thẩm định.</summary>
    private void EvidencePhotos(Batch b, List<CrabItem> crabs)
    {
        var alive = Pick(crabs.Where(c => c.Status == "Growing").ToList(), 9);
        for (var i = 0; i < alive.Count; i++)
        {
            var flagged = i == alive.Count - 1;
            var at = Day(-2 * (i + 1), 9);
            var box = alive[i].SlotAllocation.Slot;
            db.Evidences.Add(new Evidence
            {
                Batch = b, Slot = box, MediaType = "Photo", FileUri = $"seed/evidence/{b.BatchCode}-{box.SlotCode}.jpg",
                Sha256 = Sha($"{b.BatchCode}|{box.SlotCode}|{i}"), CapturedAt = at, ReceivedAt = at.AddSeconds(3),
                Latitude = FarmLatitude, Longitude = FarmLongitude, Source = "InAppCapture",
                RiskScore = flagged ? 0.82m : 0.08m, ReviewStatus = flagged ? "Flagged" : "Accepted", CreatedAt = at.AddSeconds(3),
            });
        }
    }

    // ---------- Thu hoạch và bán ----------

    /// <summary>Cân từng con, xếp hạng theo product_grade, in tem và kích hoạt tem bằng ảnh xác nhận.</summary>
    private List<CrabItem> Harvest(Batch b, List<CrabItem> crabs, DateTimeOffset at, int minWeight, int maxWeight)
    {
        var alive = crabs.Where(c => c.Status == "Growing").ToList();
        var harvest = new Harvest
        {
            Batch = b, HarvestedAt = at, HarvestedCount = alive.Count, DeclaredBy = p.Owner.UserId,
            Note = "Thu hoạch toàn bộ lô", CreatedAt = at,
        };
        db.Harvests.Add(harvest);
        for (var i = 0; i < alive.Count; i++)
        {
            var crab = alive[i];
            var t = at.AddSeconds(i * 15);
            var weight = (short)rng.Next(minWeight, maxWeight + 1);
            var box = crab.SlotAllocation.Slot;
            crab.Status = "InStock";
            crab.Harvest = harvest;
            crab.WeightG = weight;
            crab.Grade = GradeFor(weight);
            crab.UpdatedAt = now;
            crab.SlotAllocation.ReleasedAt = t;
            box.Status = "Available";
            db.SlotEvents.Add(new SlotEvent
            {
                SlotAllocation = crab.SlotAllocation, Batch = b, EventType = "Harvested", OccurredAt = t, Quantity = 1,
                Source = "Manual", ReceivedAt = t,
            });

            var tagCode = NewCode("", 12);
            var photo = new Evidence
            {
                Batch = b, Slot = box, MediaType = "Photo", FileUri = $"seed/tags/{tagCode}.jpg", Sha256 = Sha(tagCode),
                CapturedAt = t.AddSeconds(10), ReceivedAt = t.AddSeconds(11), Latitude = FarmLatitude, Longitude = FarmLongitude,
                Source = "InAppCapture", RiskScore = 0.05m, ReviewStatus = "Accepted", CreatedAt = t.AddSeconds(11),
            };
            var tag = new CrabTag
            {
                CrabItem = crab, TagCode = tagCode, Status = "Active", PrintedAt = t.AddSeconds(5), PrintedBy = p.Staff.UserId,
                ActivatedAt = t.AddSeconds(11), ActivationEvidence = photo,
            };
            db.Evidences.Add(photo);
            db.CrabTags.Add(tag);
            crab.CrabTag = tag;
            crab.CrabItemEvents.Add(new CrabItemEvent { EventType = "Harvested", OccurredAt = t, ActorId = p.Staff.UserId, Note = $"{weight} g · {crab.Grade.GradeCode}", CreatedAt = t });
            crab.CrabItemEvents.Add(new CrabItemEvent { EventType = "TagPrinted", OccurredAt = t.AddSeconds(5), ActorId = p.Staff.UserId, Tag = tag, CreatedAt = t.AddSeconds(5) });
            crab.CrabItemEvents.Add(new CrabItemEvent { EventType = "TagActivated", OccurredAt = t.AddSeconds(11), ActorId = p.Staff.UserId, Tag = tag, Evidence = photo, CreatedAt = t.AddSeconds(11) });
        }
        harvest.TotalWeightKg = alive.Sum(c => (decimal)c.WeightG!.Value) / 1000m;
        return alive;
    }

    /// <summary>Niêm yết theo hạng, tồn kho = tổng khối lượng cua InStock của hạng đó.</summary>
    private Dictionary<string, ProductListing> Listings(Batch b, List<CrabItem> harvested, string name,
        IReadOnlyDictionary<string, decimal> prices, DateTimeOffset publishedAt, string status)
    {
        var listings = new Dictionary<string, ProductListing>();
        foreach (var group in harvested.GroupBy(c => c.Grade!.GradeCode).OrderBy(g => g.Key))
        {
            var grade = grades[group.Key];
            var listing = new ProductListing
            {
                Batch = b, Grade = grade, Title = $"{name} {grade.GradeName}", StorageType = "Fresh",
                CurrentPricePerKg = prices[group.Key], StockQtyKg = group.Sum(c => (decimal)c.WeightG!.Value) / 1000m,
                ReservedQtyKg = 0, Status = status, PublishedAt = publishedAt, CreatedAt = publishedAt.AddMinutes(-30), UpdatedAt = now,
            };
            listing.PriceHistories.Add(new PriceHistory
            {
                PricePerKg = listing.CurrentPricePerKg, EffectiveFrom = publishedAt, ChangedBy = p.Owner.UserId,
                ReasonCode = "Initial", CreatedAt = publishedAt,
            });
            db.ProductListings.Add(listing);
            listings[group.Key] = listing;
        }
        return listings;
    }

    /// <summary>Đơn đã hoàn tất: trả VietQR → đóng gói bằng quét tem → giao → hết hạn đổi trả.</summary>
    private void SellCompleted(Batch b, IReadOnlyList<CrabItem> crabs, Dictionary<string, ProductListing> listings, Buyer buyer, DateTimeOffset placedAt)
    {
        var order = new SalesOrder
        {
            OrderNo = NewCode("OD", 11), CustomerId = buyer.User.UserId, Batch = b, OrderType = "Retail", Status = "Completed",
            RecipientName = buyer.Address.RecipientName, RecipientPhone = buyer.Address.RecipientPhone,
            ShippingAddress = $"{buyer.Address.AddressLine}, {buyer.Address.Province}",
            PlacedAt = placedAt, PaidAt = placedAt.AddMinutes(6), ShippedAt = placedAt.AddDays(1), DeliveredAt = placedAt.AddDays(2),
            ReturnWindowEndsAt = placedAt.AddDays(5), CompletedAt = placedAt.AddDays(5), CreatedAt = placedAt, UpdatedAt = now,
        };
        foreach (var group in crabs.GroupBy(c => c.Grade!.GradeCode))
        {
            var listing = listings[group.Key];
            var quantityKg = group.Sum(c => (decimal)c.WeightG!.Value) / 1000m;
            var line = new OrderLine { SalesOrder = order, Batch = b, ProductListing = listing, QuantityKg = quantityKg, UnitPrice = listing.CurrentPricePerKg, CreatedAt = placedAt };
            order.OrderLines.Add(line);
            listing.StockQtyKg -= quantityKg;
            foreach (var crab in group)
            {
                crab.Status = "Sold";
                crab.OrderLine = line;
                crab.UpdatedAt = now;
                crab.CrabItemEvents.Add(new CrabItemEvent { EventType = "Packed", OccurredAt = placedAt.AddHours(20), ActorId = p.Staff.UserId, Tag = crab.CrabTag, Note = order.OrderNo, CreatedAt = placedAt.AddHours(20) });
                crab.CrabItemEvents.Add(new CrabItemEvent { EventType = "Delivered", OccurredAt = placedAt.AddDays(2), Note = order.OrderNo, CreatedAt = placedAt.AddDays(2) });
            }
        }
        order.TotalAmount = order.OrderLines.Sum(l => Math.Round(l.QuantityKg * l.UnitPrice, 0, MidpointRounding.AwayFromZero));
        db.SalesOrders.Add(order);
        Pay(b, order.TotalAmount, placedAt.AddMinutes(6), "OrderPayment", order.OrderNo, order: order);
    }

    // ---------- Tiện ích ----------

    private ProductGrade GradeFor(short weight) => grades.Values
        .Where(g => g.GradeCode != "SOFT")
        .Single(g => (g.MinWeightG is null || weight >= g.MinWeightG) && (g.MaxWeightG is null || weight <= g.MaxWeightG));

    private List<CrabItem> Pick(List<CrabItem> crabs, int count) => crabs.OrderBy(_ => rng.Next()).Take(count).ToList();

    /// <summary>Mã ngẫu nhiên không trùng, bảng chữ Crockford (bỏ I, L, O, U cho dễ đọc).</summary>
    private string NewCode(string prefix, int length)
    {
        while (true)
        {
            var chars = new char[length];
            for (var i = 0; i < length; i++) chars[i] = Crockford[rng.Next(Crockford.Length)];
            var code = prefix + new string(chars);
            if (usedCodes.Add(code)) return code;
        }
    }

    private string NextTxnId() => $"SBX-TXN-{++txnNo:000000}";

    /// <summary>Giờ Việt Nam, <paramref name="days"/> ngày so với hôm nay (âm = quá khứ).</summary>
    private DateTimeOffset Day(int days, int hour = 9) => new(now.ToOffset(Vietnam).Date.AddDays(days).AddHours(hour), Vietnam);

    private DateOnly DateOf(int days) => DateOnly.FromDateTime(now.ToOffset(Vietnam).Date.AddDays(days));

    private static decimal Round1(double value) => Math.Round((decimal)value, 1);

    private static string Sha(string text) => Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(text)));
}
