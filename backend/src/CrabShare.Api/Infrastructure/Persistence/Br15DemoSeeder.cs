using CrabShare.Api.Common.Auth;
using CrabShare.Api.Features.Devices;
using CrabShare.Api.Features.Parties;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Infrastructure.Persistence;

/// <summary>
/// Dữ liệu demo theo Business Rule v1.5, chạy sau <see cref="DemoLifecycleSeeder"/> (chỉ Development, Seed:Enabled):
/// đối tác cho mọi tài khoản, địa điểm trại và trạm kiểm phẩm, hai Nhân viên kiểm phẩm, nhà cung cấp, bên cam kết thu mua;
/// lô P CS-2611-P1 đang nuôi 40 con trên dàn R02 (hộp 1701–1740) có ba thiết bị IoT đăng ký sẵn với khoá cố định;
/// lô T CS-2611-T1 đang nhận đặt trước theo quy cách.
/// Khoá thiết bị demo là hằng số để phần cứng thử nghiệm và tool simdevice dùng ngay; chỉ dùng ở máy dev.
/// </summary>
internal static class Br15DemoSeeder
{
    public const string StationCode = "ST-NC-01";
    public const string StationKey = "dk_demo_station_namcan_2026";
    public const string RailCameraCode = "RC-NC-R02";
    public const string RailCameraKey = "dk_demo_railcam_namcan_r02_2026";
    public const string WaterSensorCode = "WS-NC-01";
    public const string WaterSensorKey = "dk_demo_water_namcan_2026";
    public const decimal FarmLatitude = 8.760100m;
    public const decimal FarmLongitude = 105.050300m;

    public static async Task SeedAsync(AppDbContext db, PartyDirectory parties, DemoLifecycleSeeder.People p, AppUser buyer, DateTimeOffset now,
        ILogger log, CancellationToken ct = default)
    {
        var hasher = new PasswordHasher<AppUser>();

        // 1. Đối tác cho mọi tài khoản và cho trại (BR-001); địa điểm trại, trạm kiểm phẩm, địa chỉ giao của khách.
        foreach (var userId in await db.AppUsers.Where(u => u.PartyId == null).Select(u => u.UserId).ToListAsync(ct))
            await parties.EnsureForUserAsync(userId, ct);
        var farmParty = await parties.PartyIdOfOperatorAsync(p.Farm.OperatorId, ct);
        PartySite Site(long partyId, string code, string type, string name, string address, decimal lat, decimal lng, string? contact = null, string? phone = null)
            => new()
            {
                PartyId = partyId, SiteCode = code, SiteType = type, Name = name, AddressLine = address, Latitude = lat, Longitude = lng,
                ContactName = contact, ContactPhone = phone, IsDefault = true, Status = "Active", CreatedAt = now, UpdatedAt = now,
            };
        if (!await db.PartySites.AnyAsync(s => s.PartyId == farmParty && s.SiteType == "Farm", ct))
            db.PartySites.Add(Site(farmParty, "TRAI-NC-01", "Farm", "Trại cua hộp Năm Căn", p.Farm.FarmAddress, FarmLatitude, FarmLongitude));
        var qcSite = Site(farmParty, "TKP-NC-01", "QcStation", "Trạm kiểm phẩm tại trại Năm Căn", p.Farm.FarmAddress, FarmLatitude, FarmLongitude);
        db.PartySites.Add(qcSite);
        var buyerParty = await parties.PartyIdOfUserAsync(buyer.UserId, ct);
        db.PartySites.Add(Site(buyerParty, "GIAO-KH-01", "DeliveryAddress", "Nhà hàng hải sản Sài Gòn", "12 Nguyễn Huệ, phường Sài Gòn, TP. Hồ Chí Minh",
            10.776900m, 106.700900m, buyer.FullName, buyer.Phone));
        await db.SaveChangesAsync(ct);

        // 2. Hai Nhân viên kiểm phẩm thuộc pool nền tảng (BR-017).
        foreach (var (email, name) in new[] { ("qc1@crabshare.local", "Đặng Kiểm Phẩm"), ("qc2@crabshare.local", "Mai Thị Kiểm Định") })
        {
            var qc = new AppUser { Email = email, FullName = name, Status = "Active", CreatedAt = now.AddDays(-60), UpdatedAt = now };
            qc.PasswordHash = hasher.HashPassword(qc, DevDataSeeder.DemoPassword);
            qc.AppUserRoles.Add(new AppUserRole { RoleCode = Roles.QcInspector, GrantedAt = qc.CreatedAt, CreatedAt = qc.CreatedAt });
            db.AppUsers.Add(qc);
            await db.SaveChangesAsync(ct);
            await parties.EnsureForUserAsync(qc.UserId, ct);
        }

        // 3. Nhà cung cấp cua giống và bên cam kết thu mua (BR-001, BR-022).
        Party Org(string name, string type, string role) => new()
        {
            LegalName = name, PartyType = type, VerificationStatus = "Verified", VerifiedAt = now.AddDays(-90), RegisteredAt = now.AddDays(-95),
            CreatedAt = now.AddDays(-95), UpdatedAt = now,
            Roles = { new PartnerRole { RoleType = role, Status = "Active", ValidFrom = now.AddDays(-90), CreatedAt = now.AddDays(-90), UpdatedAt = now } },
        };
        var supplier = Org("Vựa cua Rạch Gốc", "Household", PartnerRoleTypes.Supplier);
        var offtake = Org("Công ty TNHH Hải sản Phương Nam", "Company", PartnerRoleTypes.OfftakeBuyer);
        db.Parties.AddRange(supplier, offtake);
        await db.SaveChangesAsync(ct);

        // 4. Dàn R02: hộp 1701–1740, 4 tầng × 10 cột.
        var slots = new List<PhysicalSlot>();
        for (var i = 0; i < 40; i++)
            slots.Add(new PhysicalSlot
            {
                OperatorId = p.Farm.OperatorId, SlotCode = (1701 + i).ToString("0000"), RackNo = 2, TierNo = (short)(i / 10 + 1), ColumnNo = (short)(i % 10 + 1),
                Status = "Occupied", CreatedAt = now.AddDays(-30), UpdatedAt = now,
            });
        db.PhysicalSlots.AddRange(slots);
        await db.SaveChangesAsync(ct);

        var specs = await db.ProductSpecifications.AsNoTracking().ToDictionaryAsync(s => s.SpecCode, s => s.SpecId, ct);
        var ruleSet = await db.GradeRuleSets.Where(s => s.CrabType == "FatteningMudCrab" && s.Status == "Active").Select(s => (long?)s.RuleSetId).SingleOrDefaultAsync(ct);

        // 5. Lô P đang nuôi (WF-02 → WF-05): 40 con được cấp vốn, Chi phí chuẩn 425.000 đ mỗi con.
        var stocked = now.AddDays(-12);
        // Điểm xuất hàng của hai Lô mẫu là trại Năm Căn: đặt trước cần nó để tính khoảng cách giao (BR-084, BR-085).
        var dispatchSite = await db.PartySites.Where(x => x.PartyId == farmParty && x.SiteType == "Farm").Select(x => x.SiteId).FirstAsync(ct);
        var pBatch = NewBatch("CS-2611-P1", "Cua thịt hộp RAS Năm Căn — đợt tháng 11", p, farmParty, offtake.PartyId, ruleSet, now);
        pBatch.DispatchSiteId = dispatchSite;
        pBatch.BatchMode = "P";
        pBatch.Status = "InProduction";
        pBatch.SeedQuantity = 40;
        pBatch.FundedQuantity = 40;
        pBatch.StandardCostPerCrab = 425_000;
        pBatch.TargetCapital = pBatch.MaxCapital = 17_000_000;
        pBatch.MinViableCapital = 8_500_000;
        pBatch.TotalConfirmedCapital = 17_000_000;
        pBatch.PlatformFeeRatePct = 2;
        pBatch.MinContribution = 1_000_000;
        pBatch.FundingOpenAt = now.AddDays(-40);
        pBatch.FundingDeadline = now.AddDays(-20);
        pBatch.CapitalClosedAt = now.AddDays(-20);
        pBatch.SourcingStartedAt = now.AddDays(-20);
        pBatch.StockedAt = stocked;
        pBatch.SurvivalThresholdPct = 85;
        pBatch.BaseRemunerationPct = 10;
        pBatch.OperatorSharePct = 10;
        db.Batches.Add(pBatch);
        await db.SaveChangesAsync(ct);
        await CostPlanAsync(db, pBatch, now, withMilestones: true);
        AddOffers(db, pBatch, specs, now);
        db.RemunerationTiers.AddRange(
            new RemunerationTier { BatchId = pBatch.BatchId, TierNo = 1, SurvivalFromPct = 0, SurvivalToPct = 85, RatePct = 5, CreatedAt = now },
            new RemunerationTier { BatchId = pBatch.BatchId, TierNo = 2, SurvivalFromPct = 85, SurvivalToPct = 100, RatePct = 10, CreatedAt = now });
        foreach (var (investor, amount) in new[] { (p.Investors[0], 10_200_000L), (p.Investors[1], 6_800_000L) })
        {
            var c = new Contribution
            {
                BatchId = pBatch.BatchId, InvestorId = investor.UserId, Amount = amount, Status = "Confirmed", ReservedAt = now.AddDays(-35),
                ExpiresAt = now.AddDays(-35).AddMinutes(30), ConfirmedAt = now.AddDays(-34), CreatedAt = now.AddDays(-35), UpdatedAt = now,
            };
            db.Contributions.Add(c);
            db.CapitalShares.Add(new CapitalShare { BatchId = pBatch.BatchId, InvestorId = investor.UserId, ConfirmedAmount = amount, SnapshottedAt = now.AddDays(-20), CreatedAt = now.AddDays(-20) });
            await db.SaveChangesAsync(ct);
            // Tiền góp đi qua yêu cầu thanh toán VietQR đã trả và giao dịch ngân hàng đã khớp (BR-213, BR-232).
            var request = new PaymentRequest
            {
                ReferenceCode = $"GV{c.ContributionId:D11}", BatchAccountId = pBatch.BatchAccount!.BatchAccountId, Purpose = "Contribution", Amount = amount,
                ContributionId = c.ContributionId, ExpiresAt = c.ExpiresAt, Status = "Paid", CreatedAt = c.ReservedAt, UpdatedAt = now.AddDays(-34),
            };
            db.PaymentRequests.Add(request);
            await db.SaveChangesAsync(ct);
            db.ProviderTransactions.Add(new ProviderTransaction
            {
                ProviderTxnId = $"SEED-GV-{c.ContributionId}", BatchAccountId = pBatch.BatchAccount!.BatchAccountId, Direction = "In", Amount = amount,
                ReferenceCode = request.ReferenceCode, PaymentRequestId = request.PaymentRequestId, MatchStatus = "Matched", OccurredAt = now.AddDays(-34), ReceivedAt = now.AddDays(-34),
            });
            await parties.AddParticipantAsync(pBatch.BatchId, await parties.PartyIdOfUserAsync(investor.UserId, ct), ParticipantRoles.Investor, ct);
        }
        await parties.AddParticipantAsync(pBatch.BatchId, farmParty, ParticipantRoles.Executor, ct);
        await db.SaveChangesAsync(ct);

        // Đơn mua nguồn, lô nguồn, phiếu nhận đã kiểm và 40 con cua đã xếp hộp (WF-04, WF-05).
        var po = new ProcurementOrder
        {
            PoNo = "PO-2611-P1-01", BatchId = pBatch.BatchId, SupplierPartyId = supplier.PartyId, OrderedOn = DateOnly.FromDateTime(now.AddDays(-15).UtcDateTime),
            AgreedSpec = "Cua thịt Scylla paramamosain 280–320 g, còn sống, đủ càng", Quantity = 40, UnitPrice = 250_000, Status = "Received",
            CreatedBy = p.Owner.UserId, CreatedAt = now.AddDays(-15), UpdatedAt = now,
        };
        db.ProcurementOrders.Add(po);
        await db.SaveChangesAsync(ct);
        var lot = new SupplyLot
        {
            LotCode = "LN-2611-P1-01", ProcurementOrderId = po.ProcurementOrderId, BatchId = pBatch.BatchId, OriginRegion = "Rạch Gốc, Ngọc Hiển, Cà Mau",
            HarvestedOn = DateOnly.FromDateTime(stocked.AddDays(-1).UtcDateTime), DeclaredSpecies = "Scylla paramamosain", DeclaredCount = 40, DeclaredWeightKg = 12.0m,
            CreatedAt = stocked.AddHours(-6),
        };
        db.SupplyLots.Add(lot);
        await db.SaveChangesAsync(ct);
        var receipt = new GoodsReceipt
        {
            ReceiptNo = "GR-2611-P1-01", SupplyLotId = lot.SupplyLotId, BatchId = pBatch.BatchId, ReceivedAt = stocked.AddHours(-3), ReceivedBy = p.Owner.UserId,
            AcceptedCount = 40, AcceptedWeightG = 12_040, Status = "Completed", CompletedAt = stocked.AddHours(-1), CreatedAt = stocked.AddHours(-3),
        };
        db.GoodsReceipts.Add(receipt);
        await db.SaveChangesAsync(ct);
        db.HoldingOperations.Add(new HoldingOperation
        {
            HoldingCode = "HO-2611-P1", BatchId = pBatch.BatchId, Method = "Hộp RAS tuần hoàn, nước lợ 15‰", StockedAt = stocked,
            ExpectedEndDate = DateOnly.FromDateTime(stocked.AddDays(35).UtcDateTime), ResponsibleUserId = p.Owner.UserId, Status = "Active", CreatedAt = stocked,
        });
        db.SlotAllocations.AddRange(slots.Select(s => new SlotAllocation { BatchId = pBatch.BatchId, SlotId = s.SlotId, AllocatedAt = stocked, CreatedAt = stocked }));
        await db.SaveChangesAsync(ct);
        for (var i = 0; i < 40; i++)
        {
            var crab = new CrabUnit
            {
                CrabCode = $"CU2611P1{i + 1:D2}", BatchId = pBatch.BatchId, SupplyLotId = lot.SupplyLotId, GoodsReceiptId = receipt.GoodsReceiptId,
                Species = "Scylla paramamosain", Sex = "Male", Maturity = "Mature", ReceivedWeightG = 280 + (i * 7 % 45), InventoryStatus = "Holding",
                ReceivedAt = stocked.AddHours(-2), CreatedAt = stocked.AddHours(-2), UpdatedAt = now,
            };
            db.CrabUnits.Add(crab);
            await db.SaveChangesAsync(ct);
            db.BoxAssignments.Add(new BoxAssignment
            {
                CrabUnitId = crab.CrabUnitId, BatchId = pBatch.BatchId, SlotId = slots[i].SlotId, AssignedAt = stocked, Reason = "Stock", ActorId = p.Staff.UserId, CreatedAt = stocked,
            });
            db.InventoryEvents.Add(new InventoryEvent { CrabUnitId = crab.CrabUnitId, BatchId = pBatch.BatchId, EventType = "Received", OccurredAt = stocked.AddHours(-2), Source = "Qc", ActorId = p.Owner.UserId, CreatedAt = stocked });
            db.InventoryEvents.Add(new InventoryEvent { CrabUnitId = crab.CrabUnitId, BatchId = pBatch.BatchId, EventType = "Boxed", OccurredAt = stocked, Source = "App", SlotId = slots[i].SlotId, ActorId = p.Staff.UserId, CreatedAt = stocked });
        }
        // Nhật ký chăm sóc 12 ngày (BR-111): thức ăn theo ngày; chỉ số nước chỉ để vẽ biểu đồ (BR-115).
        for (var d = 1; d <= 12; d++)
        {
            var day = DateOnly.FromDateTime(stocked.ToOffset(TimeSpan.FromHours(7)).DateTime).AddDays(d - 1);
            db.ProductionLogs.Add(new ProductionLog
            {
                BatchId = pBatch.BatchId, LogDate = day, Source = "Manual", Ph = 7.8m + d % 3 * 0.1m, WaterTempC = 27.5m + d % 4 * 0.4m, SalinityPpt = 15.0m + d % 2 * 0.5m,
                FeedKg = 0.6m + d * 0.01m, PlausibilityFlag = "Ok", RecordedBy = p.Staff.UserId, ReceivedAt = stocked.AddDays(d - 1).AddHours(18), CreatedAt = stocked.AddDays(d - 1).AddHours(18),
            });
        }
        await db.SaveChangesAsync(ct);

        // 6. Thiết bị IoT đã đăng ký (BR-116, BR-230): trạm đo tại trạm kiểm phẩm, camera chạy dàn R02, cụm cảm biến nước của đợt lưu nuôi.
        var holdingId = await db.HoldingOperations.Where(h => h.BatchId == pBatch.BatchId).Select(h => h.HoldingId).SingleAsync(ct);
        Device NewDevice(string code, string type, string key, string scope) => new()
        {
            DeviceCode = code, DeviceType = type, OperatorId = p.Farm.OperatorId, ScopeType = scope, KeyHash = DeviceKeys.Hash(key), KeyPrefix = key[..8],
            Source = "Real", Status = "Active", CalibrationPeriodDays = 30, RegisteredBy = p.Admin.UserId, LastSeenAt = now.AddMinutes(-3),
            LastCalibratedAt = now.AddDays(-2), CreatedAt = now.AddDays(-14), UpdatedAt = now,
        };
        var station = NewDevice(StationCode, "Station", StationKey, "QcStation");
        station.ScopeSiteId = qcSite.SiteId;
        station.CameraHeightMm = 370;
        var railCamera = NewDevice(RailCameraCode, "RailCamera", RailCameraKey, "Rack");
        railCamera.ScopeRackCode = "R02";
        var water = NewDevice(WaterSensorCode, "WaterSensor", WaterSensorKey, "Holding");
        water.ScopeHoldingId = holdingId;
        db.Devices.AddRange(station, railCamera, water);
        await db.SaveChangesAsync(ct);
        for (var h = 72; h > 0; h -= 6)
        {
            var at = now.AddHours(-h);
            db.WaterReadings.Add(new WaterReading
            {
                DeviceId = water.DeviceId, HoldingId = holdingId, BatchId = pBatch.BatchId, MessageId = Guid.NewGuid(), MeasuredAt = at, ReceivedAt = at.AddSeconds(2),
                TemperatureC = 27.6m + (h % 24) / 24m, SalinityPpt = 15.1m + (h % 12) / 40m, Ph = 7.85m + (h % 18) / 90m, DeviceQualityFlag = "ok", Quality = "Calibrated",
            });
        }
        await db.SaveChangesAsync(ct);

        // 7. Lô T đang nhận đặt trước theo quy cách, không lưu nuôi (WF-04, BR-085).
        var tBatch = NewBatch("CS-2611-T1", "Cua thịt thu mua Năm Căn — giao cuối tháng 12", p, await parties.PlatformPartyIdAsync(ct), offtake.PartyId, ruleSet, now);
        tBatch.DispatchSiteId = dispatchSite;
        tBatch.BatchMode = "T";
        tBatch.Status = "Sourcing";
        tBatch.HasHolding = false;
        tBatch.SeedQuantity = 300;
        tBatch.FundedQuantity = 300;
        tBatch.StandardCostPerCrab = 300_000;
        tBatch.TargetCapital = tBatch.MaxCapital = tBatch.MinViableCapital = 90_000_000;
        tBatch.PreorderDeadline = now.AddDays(20);
        tBatch.SourcingStartedAt = now.AddDays(-2);
        tBatch.OperatorSharePct = 0;
        db.Batches.Add(tBatch);
        await db.SaveChangesAsync(ct);
        await CostPlanAsync(db, tBatch, now, withMilestones: false);
        AddOffers(db, tBatch, specs, now);
        await parties.AddParticipantAsync(tBatch.BatchId, tBatch.ExecutorPartyId!.Value, ParticipantRoles.Executor, ct);
        await db.SaveChangesAsync(ct);

        log.LogInformation("Seed BR v1.5: lô {P} (đang nuôi 40 con, dàn R02) và {T} (nhận đặt trước). Thiết bị demo: {Station} khoá {StationKey}; "
                           + "{Rail} khoá {RailKey}; {Water} khoá {WaterKey}. Nhân viên kiểm phẩm: qc1@crabshare.local, qc2@crabshare.local.",
            pBatch.BatchCode, tBatch.BatchCode, StationCode, StationKey, RailCameraCode, RailCameraKey, WaterSensorCode, WaterSensorKey);
    }

    private static Batch NewBatch(string code, string title, DemoLifecycleSeeder.People p, long executorParty, long offtakeParty, long? ruleSet, DateTimeOffset now) => new()
    {
        BatchCode = code, OperatorId = p.Farm.OperatorId, CrabType = "FatteningMudCrab", Title = title, ExpectedOutputKg = 100, CycleDays = 35, RestockCutoffDays = 15,
        MinContribution = 1_000_000, FrozenStockCapMonths = 4, OfftakePreorderCapPct = 60, OfftakeDepositPct = 15, CreatedAt = now.AddDays(-45), UpdatedAt = now,
        ApprovedAt = now.AddDays(-41), ApprovedBy = p.Admin.UserId, ExecutorPartyId = executorParty, HasHolding = true, ExpectedAvgWeightG = 420, ExpectedGrade = "Đặc cấp, Cấp 1",
        SaleDays = 14, DeliveryRadiusKm = 400, FloorPricePerKg = 300_000, OfftakeBuyerPartyId = offtakeParty, SettlementBasis = "StandardCost",
        ExpectedReceiptDate = DateOnly.FromDateTime(now.AddDays(-14).UtcDateTime), GradeRuleSetId = ruleSet,
        BatchAccount = new BatchAccount { ProviderName = "Sandbox", ProviderAccountNo = "SBX" + code.Replace("-", ""), Status = "Open", OpenedAt = now.AddDays(-41), CreatedAt = now.AddDays(-41), UpdatedAt = now },
    };

    /// <summary>Kế hoạch chi phí đã khoá: tổng chia đúng cho sản lượng kế hoạch; lô P có ba mốc giải ngân mặc định (BR-145).</summary>
    private static async Task CostPlanAsync(AppDbContext db, Batch b, DateTimeOffset now, bool withMilestones)
    {
        var perCrab = b.StandardCostPerCrab!.Value;
        var seed = 250_000m;
        var version = new StandardCostVersion { BatchId = b.BatchId, VersionNo = 1, Status = "Draft", CreatedAt = now.AddDays(-44), UpdatedAt = now };
        StandardCostItem Item(string category, string description, decimal amount) => new()
        {
            Category = category, Description = description, Quantity = 1, Unit = "gói", UnitPrice = amount, CreatedAt = now.AddDays(-44),
        };
        var total = perCrab * b.SeedQuantity;
        version.StandardCostItems.Add(new StandardCostItem { Category = "Seed", Description = "Cua đầu vào", Quantity = b.SeedQuantity, Unit = "con", UnitPrice = seed, CreatedAt = now.AddDays(-44) });
        var rest = total - seed * b.SeedQuantity;
        version.StandardCostItems.Add(Item("Feed", "Thức ăn", decimal.Round(rest * 0.4m)));
        version.StandardCostItems.Add(Item("Utilities", "Điện nước, máy bơm", decimal.Round(rest * 0.2m)));
        version.StandardCostItems.Add(Item("Labour", "Nhân công chăm sóc", decimal.Round(rest * 0.25m)));
        version.StandardCostItems.Add(Item("MortalityReserve", "Dự phòng hao hụt", rest - decimal.Round(rest * 0.4m) - decimal.Round(rest * 0.2m) - decimal.Round(rest * 0.25m)));
        db.StandardCostVersions.Add(version);
        await db.SaveChangesAsync();
        if (withMilestones)
        {
            byte no = 1;
            foreach (var (kind, name, pct) in new[] { ("Receipt", "Nhận cua xong", 60m), ("MidCycle", "Giữa vụ", 25m), ("Settlement", "Quyết toán", 15m) })
            {
                db.DisbursementTranches.Add(new DisbursementTranche
                {
                    BatchId = b.BatchId, TrancheNo = no++, PlannedAmount = decimal.Round(total * pct / 100), UnlockCondition = name, Status = "Planned",
                    MilestoneKind = kind, MilestoneName = name, Pct = pct, CreatedAt = now, UpdatedAt = now,
                });
            }
            await db.SaveChangesAsync();
        }
        await db.StandardCostVersions.Where(v => v.CostVersionId == version.CostVersionId)
            .ExecuteUpdateAsync(s => s.SetProperty(v => v.Status, "Locked").SetProperty(v => v.LockedAt, now.AddDays(-41)).SetProperty(v => v.ApprovedAt, now.AddDays(-41)));
    }

    private static void AddOffers(AppDbContext db, Batch b, IReadOnlyDictionary<string, long> specs, DateTimeOffset now)
    {
        foreach (var (code, price, grams, qty) in new[]
                 {
                     ("FAT-XL-SPECIAL", 520_000m, 420, b.SeedQuantity / 4), ("FAT-XL-G1", 480_000m, 420, b.SeedQuantity / 4),
                     ("FAT-L-SPECIAL", 460_000m, 330, b.SeedQuantity / 4), ("FAT-L-G1", 430_000m, 330, b.SeedQuantity / 4),
                     ("FAT-M-G1", 380_000m, 260, b.SeedQuantity / 5),
                 })
            if (specs.TryGetValue(code, out var specId))
                db.Offers.Add(new Offer { BatchId = b.BatchId, SpecId = specId, PricePerKg = price, ConversionWeightG = grams, OfferedQuantity = Math.Max(1, qty), CreatedAt = now });
    }
}
