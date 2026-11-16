using System.Net.Http.Json;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Features.Funding;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace CrabShare.Api.Tests.Br15;

/// <summary>Các bước dựng sẵn dùng chung cho test BR v1.5: bên thu mua, Lô P đang gọi vốn, vốn đã xác nhận, khách có địa chỉ giao.</summary>
public static class Br15Scenario
{
    public const long CostPerCrab = 500_001;

    public static async Task<long> OfftakeBuyerAsync(Br15Fixture f)
    {
        await using var db = f.OpenDb();
        var now = DateTimeOffset.UtcNow;
        var party = new Party
        {
            LegalName = $"Nhà hàng thu mua {f.Next()}", PartyType = "Company", VerificationStatus = "Verified", VerifiedAt = now,
            RegisteredAt = now, CreatedAt = now, UpdatedAt = now,
        };
        party.Roles.Add(new PartnerRole { RoleType = "OfftakeBuyer", Status = "Active", ValidFrom = now, CreatedAt = now, UpdatedAt = now });
        db.Parties.Add(party);
        await db.SaveChangesAsync();
        return party.PartyId;
    }

    public static object Terms(long buyerId, int planned = 200, string crabType = "FatteningMudCrab", long floor = 300_000, bool holding = true) => new
    {
        title = "Lô cua thịt thử nghiệm", crabType, plannedQuantity = planned, hasHolding = holding, holdingDays = holding ? 35 : (int?)null,
        expectedAvgWeightG = 420, expectedGrade = "Cấp 1", saleDays = 14, deliveryRadiusKm = 300,
        expectedReceiptDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(40)),
        minViableCapital = 30_000_000, minViableBasis = "Chi phí cố định 30 triệu",
        survivalThresholdPct = 85m, baseRemunerationPct = 10m,
        remunerationTiers = new[]
        {
            new { survivalFromPct = 0m, survivalToPct = 85m, ratePct = 5m },
            new { survivalFromPct = 85m, survivalToPct = 100m, ratePct = 10m },
        },
        floorPricePerKg = floor, offtakeBuyerPartyId = buyerId, settlementBasis = "StandardCost",
        offers = new[]
        {
            new { specCode = "FAT-L-SPECIAL", pricePerKg = 450_000L, conversionWeightG = 450, offeredQuantity = 120 },
            new { specCode = "FAT-L-G1", pricePerKg = 420_000L, conversionWeightG = 450, offeredQuantity = 120 },
            new { specCode = "FAT-M-G1", pricePerKg = 380_000L, conversionWeightG = 350, offeredQuantity = 80 },
        },
    };

    /// <summary>Tổng 100.000.001 đ cho 200 con: Chi phí chuẩn mỗi con 500.001 đ.</summary>
    public static object CostPlan() => new
    {
        items = new object[]
        {
            new { category = "Seed", description = "Cua giống 200 con", quantity = 200m, unit = "con", unitPrice = 250_000L },
            new { category = "Feed", description = "Thức ăn", quantity = 1m, unit = "gói", unitPrice = 20_000_001L },
            new { category = "Utilities", description = "Điện nước", quantity = 1m, unit = "gói", unitPrice = 10_000_000L },
            new { category = "Labour", description = "Nhân công", quantity = 1m, unit = "gói", unitPrice = 10_000_000L },
            new { category = "MortalityReserve", description = "Dự phòng hao hụt", quantity = 1m, unit = "gói", unitPrice = 10_000_000L },
        },
    };

    public sealed record BatchHandle(string Code, long BatchId, Br15Fixture.Farmer Farmer, long BuyerPartyId);

    /// <summary>Lô P đã duyệt, đang gọi vốn; tỷ lệ đặt trước tối thiểu có thể hạ về 0 cho test không có đơn.</summary>
    public static async Task<BatchHandle> FundingBatchAsync(Br15Fixture f, bool zeroPreorderRatio = false, int slots = 0)
    {
        var farmer = await f.CreateFarmerAsync(slots);
        var buyer = await OfftakeBuyerAsync(f);
        using var client = farmer.Client(f);
        var created = await Br15Fixture.Body(await Br15Fixture.PostJson(client, "/api/batches", Terms(buyer)));
        var code = created.GetProperty("batchCode").GetString()!;
        await Br15Fixture.Body(await client.PutAsJsonAsync($"/api/batches/{code}/cost-plan", CostPlan(), Br15Fixture.Json));
        await Br15Fixture.Body(await client.PostAsync($"/api/batches/{code}/submit", null));
        using var admin = f.Admin();
        await Br15Fixture.Body(await admin.PostAsJsonAsync($"/api/admin/batches/{code}/approve", new
        {
            fundingOpenAt = DateTimeOffset.UtcNow.AddMinutes(-1), fundingDeadline = DateTimeOffset.UtcNow.AddDays(10),
        }));
        await using var db = f.OpenDb();
        var batch = await db.Batches.SingleAsync(b => b.BatchCode == code);
        if (zeroPreorderRatio)
        {
            db.PlatformParameters.Add(new PlatformParameter
            {
                ParamKey = "MinPreorderRatioPct", Value = 0, EffectiveFrom = batch.FundingOpenAt!.Value.AddSeconds(-30), CreatedAt = DateTimeOffset.UtcNow,
            });
            await db.SaveChangesAsync();
        }
        return new BatchHandle(code, batch.BatchId, farmer, buyer);
    }

    /// <summary>Lô T đã duyệt, đang nhận đặt trước.</summary>
    public static async Task<BatchHandle> TBatchAsync(Br15Fixture f, bool holding = true)
    {
        var farmer = await f.CreateFarmerAsync();
        var buyer = await OfftakeBuyerAsync(f);
        using var admin = f.Admin();
        var created = await Br15Fixture.Body(await Br15Fixture.PostJson(admin, "/api/admin/batches", new
        {
            batchMode = "T", operatorId = farmer.OperatorId, terms = Terms(buyer, holding: holding),
        }));
        var code = created.GetProperty("batchCode").GetString()!;
        await Br15Fixture.Body(await admin.PutAsJsonAsync($"/api/batches/{code}/cost-plan", CostPlan(), Br15Fixture.Json));
        await Br15Fixture.Body(await admin.PostAsync($"/api/batches/{code}/submit", null));
        await Br15Fixture.Body(await admin.PostAsJsonAsync($"/api/admin/batches/{code}/approve", new { preorderDeadline = DateTimeOffset.UtcNow.AddDays(10) }));
        await using var db = f.OpenDb();
        return new BatchHandle(code, await db.Batches.Where(b => b.BatchCode == code).Select(b => b.BatchId).SingleAsync(), farmer, buyer);
    }

    /// <summary>Khoản góp đã xác nhận ghi thẳng vào CSDL (bỏ qua VietQR và ký số).</summary>
    public static async Task<long> ConfirmedContributionAsync(Br15Fixture f, long batchId, long amount, long? investorId = null)
    {
        var investor = investorId ?? await f.CreateUserAsync("Nhà đầu tư", Roles.Investor);
        await using var db = f.OpenDb();
        var now = DateTimeOffset.UtcNow;
        var contribution = new Contribution
        {
            BatchId = batchId, InvestorId = investor, Amount = amount, Status = "Confirmed", ReservedAt = now, ExpiresAt = now,
            ConfirmedAt = now, CreatedAt = now, UpdatedAt = now,
        };
        db.Contributions.Add(contribution);
        await db.SaveChangesAsync();
        // Tiền góp vào tài khoản của Lô như giao dịch đã đối soát (BR-232: số dư dẫn xuất từ giao dịch tiền).
        if (await db.BatchAccounts.Where(a => a.BatchId == batchId).Select(a => (long?)a.BatchAccountId).SingleOrDefaultAsync() is { } account)
        {
            db.ProviderTransactions.Add(new ProviderTransaction
            {
                ProviderTxnId = $"TEST-{Guid.NewGuid():N}", BatchAccountId = account, Direction = "In", Amount = amount,
                ReferenceCode = $"GV{contribution.ContributionId}", MatchStatus = "Matched", OccurredAt = now, ReceivedAt = now,
            });
            await db.SaveChangesAsync();
        }
        return investor;
    }

    /// <summary>Chốt gọi vốn ngay (đặt hạn về quá khứ rồi chạy FundingCloseService).</summary>
    public static async Task<string?> CloseFundingAsync(Br15Fixture f, long batchId)
    {
        await using (var db = f.OpenDb())
            await db.Batches.Where(b => b.BatchId == batchId)
                .ExecuteUpdateAsync(s => s.SetProperty(b => b.FundingDeadline, DateTimeOffset.UtcNow.AddSeconds(-1)));
        await using var scope = f.Factory.Services.CreateAsyncScope();
        var outcome = await scope.ServiceProvider.GetRequiredService<FundingCloseService>().CloseBatchAsync(batchId, CancellationToken.None);
        return outcome?.Outcome;
    }

    public sealed record Customer(long UserId, long PartyId, long SiteId)
    {
        public HttpClient Client(Br15Fixture f) => f.Client(UserId, Roles.Customer);
    }

    /// <summary>Khách B2B có địa chỉ giao ở TP.HCM (cách trại Năm Căn khoảng 260 km).</summary>
    public static async Task<Customer> CustomerAsync(Br15Fixture f, decimal latitude = 10.7769m, decimal longitude = 106.7009m)
    {
        var userId = await f.CreateUserAsync("Khách sỉ", Roles.Customer);
        var partyId = await f.PartyIdOfUserAsync(userId);
        await using var db = f.OpenDb();
        var now = DateTimeOffset.UtcNow;
        var site = new PartySite
        {
            PartyId = partyId, SiteCode = $"DC-{f.Next()}", SiteType = "DeliveryAddress", Name = "Nhà hàng Hải Sản", AddressLine = "Quận 1, TP.HCM",
            Province = "TP.HCM", Latitude = latitude, Longitude = longitude, ContactName = "Anh Bếp Trưởng", ContactPhone = "0909000111",
            IsDefault = true, Status = "Active", CreatedAt = now, UpdatedAt = now,
        };
        db.PartySites.Add(site);
        await db.SaveChangesAsync();
        return new Customer(userId, partyId, site.SiteId);
    }

    public sealed record CrabSet(BatchHandle Batch, IReadOnlyList<string> CrabCodes, long SupplierPartyId);

    /// <summary>
    /// Lô P đã mở với 200 con được cấp vốn, trại có <paramref name="slots"/> hộp; ghi thẳng <paramref name="count"/> con đã nhận
    /// (bỏ qua bước kiểm đầu vào), và nếu <paramref name="boxed"/> thì xếp mỗi con vào hộp 0001, 0002… và Lô chuyển InProduction.
    /// </summary>
    public static async Task<CrabSet> CrabsAsync(Br15Fixture f, int count, bool boxed = true, int slots = 20)
    {
        var batch = await FundingBatchAsync(f, zeroPreorderRatio: true, slots: slots);
        await ConfirmedContributionAsync(f, batch.BatchId, 200 * CostPerCrab);
        if (await CloseFundingAsync(f, batch.BatchId) != "CapitalClosed") throw new InvalidOperationException("Lô không mở được.");
        await using var db = f.OpenDb();
        var now = DateTimeOffset.UtcNow;
        var supplier = new Party
        {
            LegalName = $"Vựa cua {f.Next()}", PartyType = "Household", VerificationStatus = "Verified", VerifiedAt = now, RegisteredAt = now, CreatedAt = now, UpdatedAt = now,
        };
        supplier.Roles.Add(new PartnerRole { RoleType = "Supplier", Status = "Active", ValidFrom = now, CreatedAt = now, UpdatedAt = now });
        db.Parties.Add(supplier);
        await db.SaveChangesAsync();
        var po = new ProcurementOrder
        {
            PoNo = $"PO{Guid.NewGuid():N}"[..12], BatchId = batch.BatchId, SupplierPartyId = supplier.PartyId, OrderedOn = DateOnly.FromDateTime(now.UtcDateTime),
            AgreedSpec = "Cua thịt", Quantity = count, UnitPrice = 250_000, Status = "Received", CreatedBy = batch.Farmer.UserId, CreatedAt = now, UpdatedAt = now,
        };
        db.ProcurementOrders.Add(po);
        await db.SaveChangesAsync();
        var lot = new SupplyLot
        {
            LotCode = $"LN{Guid.NewGuid():N}"[..12], ProcurementOrderId = po.ProcurementOrderId, BatchId = batch.BatchId, OriginRegion = "Năm Căn, Cà Mau",
            HarvestedOn = DateOnly.FromDateTime(now.UtcDateTime.AddDays(-1)), DeclaredSpecies = "Scylla paramamosain", DeclaredCount = count,
            DeclaredWeightKg = count * 0.4m, CreatedAt = now,
        };
        db.SupplyLots.Add(lot);
        await db.SaveChangesAsync();
        var receipt = new GoodsReceipt
        {
            ReceiptNo = $"GR{Guid.NewGuid():N}"[..12], SupplyLotId = lot.SupplyLotId, BatchId = batch.BatchId, ReceivedAt = now, ReceivedBy = batch.Farmer.UserId,
            AcceptedCount = count, AcceptedWeightG = count * 400, Status = "Completed", CompletedAt = now, CreatedAt = now,
        };
        db.GoodsReceipts.Add(receipt);
        await db.SaveChangesAsync();
        var codes = new List<string>();
        var slotRows = await db.PhysicalSlots.Where(s => s.OperatorId == batch.Farmer.OperatorId).OrderBy(s => s.SlotCode).ToListAsync();
        for (var i = 0; i < count; i++)
        {
            var crab = new CrabUnit
            {
                CrabCode = $"CU{Guid.NewGuid():N}"[..10].ToUpperInvariant(), BatchId = batch.BatchId, SupplyLotId = lot.SupplyLotId, GoodsReceiptId = receipt.GoodsReceiptId,
                Species = "Scylla paramamosain", Sex = "Male", Maturity = "Mature", ReceivedWeightG = 400, InventoryStatus = boxed ? "Holding" : "Received",
                ReceivedAt = now, CreatedAt = now, UpdatedAt = now,
            };
            db.CrabUnits.Add(crab);
            await db.SaveChangesAsync();
            codes.Add(crab.CrabCode);
            if (boxed)
            {
                var slot = slotRows[i];
                db.SlotAllocations.Add(new SlotAllocation { BatchId = batch.BatchId, SlotId = slot.SlotId, AllocatedAt = now, CreatedAt = now });
                slot.Status = "Occupied";
                db.BoxAssignments.Add(new BoxAssignment
                {
                    CrabUnitId = crab.CrabUnitId, BatchId = batch.BatchId, SlotId = slot.SlotId, AssignedAt = now, Reason = "Stock", ActorId = batch.Farmer.UserId, CreatedAt = now,
                });
            }
        }
        if (boxed)
        {
            db.HoldingOperations.Add(new HoldingOperation
            {
                HoldingCode = $"HO{Guid.NewGuid():N}"[..12], BatchId = batch.BatchId, Method = "Hộp RAS", StockedAt = now,
                ExpectedEndDate = DateOnly.FromDateTime(now.UtcDateTime.AddDays(35)), ResponsibleUserId = batch.Farmer.UserId, Status = "Active", CreatedAt = now,
            });
            await db.Batches.Where(b => b.BatchId == batch.BatchId)
                .ExecuteUpdateAsync(s => s.SetProperty(b => b.Status, "InProduction").SetProperty(b => b.StockedAt, now));
        }
        await db.SaveChangesAsync();
        return new CrabSet(batch, codes, supplier.PartyId);
    }

    /// <summary>JPEG nhỏ hợp lệ để gửi như ảnh thiết bị.</summary>
    public static byte[] Jpeg(string text = "CrabShare")
    {
        using var bitmap = new SkiaSharp.SKBitmap(64, 48);
        using (var canvas = new SkiaSharp.SKCanvas(bitmap)) canvas.Clear(new SkiaSharp.SKColor((byte)(text.Length * 7 % 255), 120, 160));
        using var image = SkiaSharp.SKImage.FromBitmap(bitmap);
        using var data = image.Encode(SkiaSharp.SKEncodedImageFormat.Jpeg, 80);
        return data.ToArray();
    }

    /// <summary>Chuyển khoản giả lập đúng mã đối chiếu (đi qua webhook như tiền thật).</summary>
    public static async Task PayAsync(Br15Fixture f, string referenceCode)
    {
        using var client = f.Admin();
        await Br15Fixture.Body(await client.PostAsJsonAsync("/api/dev/payments/simulate", new { referenceCode }));
    }
}
