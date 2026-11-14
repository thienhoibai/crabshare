using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Features.Quality;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace CrabShare.Api.Tests.Br15;

/// <summary>G3: đơn mua nguồn, phiếu nhận, kiểm đầu vào từng con, mã cua, xếp hộp kèm ảnh, chết, thả bù, chuyển hộp (BR-017, 098…128).</summary>
[Trait("Category", "Database")]
public sealed class SourcingHoldingTests(Br15Fixture f) : IClassFixture<Br15Fixture>
{
    private sealed record Opened(Br15Scenario.BatchHandle Batch, HttpClient Farmer);

    /// <summary>Lô P đã mở với 200 con được cấp vốn, trại có 20 hộp, một nhà cung cấp đã xác minh, pool có ít nhất một QC.</summary>
    private async Task<(Opened Opened, long SupplierId)> OpenBatchAsync()
    {
        var batch = await Br15Scenario.FundingBatchAsync(f, zeroPreorderRatio: true, slots: 20);
        await Br15Scenario.ConfirmedContributionAsync(f, batch.BatchId, 200 * Br15Scenario.CostPerCrab);
        Assert.Equal("CapitalClosed", await Br15Scenario.CloseFundingAsync(f, batch.BatchId));
        await f.CreateUserAsync("Nhân viên kiểm phẩm", Roles.QcInspector);
        await using var db = f.OpenDb();
        var now = DateTimeOffset.UtcNow;
        var supplier = new Party
        {
            LegalName = $"Vựa cua Năm Căn {f.Next()}", PartyType = "Household", VerificationStatus = "Verified", VerifiedAt = now,
            RegisteredAt = now, CreatedAt = now, UpdatedAt = now,
        };
        supplier.Roles.Add(new PartnerRole { RoleType = "Supplier", Status = "Active", ValidFrom = now, CreatedAt = now, UpdatedAt = now });
        db.Parties.Add(supplier);
        await db.SaveChangesAsync();
        return (new Opened(batch, batch.Farmer.Client(f)), supplier.PartyId);
    }

    private static object Inspection(bool twoClaws = true, decimal weight = 380m) => new
    {
        species = "Scylla paramamosain", sex = "Male", maturity = "Mature", speciesOk = true, alive = true, healthy = true, twoClaws, foodSafe = true,
        weightG = weight,
    };

    /// <summary>Ảnh hộp chụp trong ứng dụng (ghi thẳng như sau khi tải lên).</summary>
    private async Task<long> BoxPhotoAsync(long batchId, string slotCode, long operatorId)
    {
        await using var db = f.OpenDb();
        var slotId = await db.PhysicalSlots.Where(s => s.OperatorId == operatorId && s.SlotCode == slotCode).Select(s => s.SlotId).SingleAsync();
        var now = DateTimeOffset.UtcNow;
        var evidence = new Evidence
        {
            BatchId = batchId, SlotId = slotId, MediaType = "Photo", FileUri = $"test/{Guid.NewGuid():N}.jpg", Sha256 = Guid.NewGuid().ToString("N") + Guid.NewGuid().ToString("N"),
            CapturedAt = now, ReceivedAt = now, Source = "InAppCapture", ReviewStatus = "Accepted", CreatedAt = now,
        };
        db.Evidences.Add(evidence);
        await db.SaveChangesAsync();
        return evidence.EvidenceId;
    }

    /// <summary>Nhận 3 con: 2 đạt, 1 thiếu càng. Trả về mã hai con đạt.</summary>
    private async Task<(string Receipt, string[] Codes)> ReceiveAsync(Opened o, long supplierId)
    {
        var po = await Br15Fixture.Body(await Br15Fixture.PostJson(o.Farmer, $"/api/batches/{o.Batch.Code}/procurement-orders", new
        {
            supplierPartyId = supplierId, orderedOn = DateOnly.FromDateTime(DateTime.UtcNow), agreedSpec = "Cua thịt 350–450 g", quantity = 100, unitPrice = 250_000,
        }));
        var receipt = await Br15Fixture.Body(await Br15Fixture.PostJson(o.Farmer, $"/api/procurement-orders/{po.GetProperty("poNo").GetString()}/receipts", new
        {
            originRegion = "Năm Căn, Cà Mau", harvestedOn = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-1)), declaredSpecies = "Scylla paramamosain",
            declaredCount = 3, declaredWeightKg = 1.2m,
        }));
        var receiptNo = receipt.GetProperty("receiptNo").GetString()!;
        var qcId = receipt.GetProperty("qcUserId").GetInt64();
        using var qc = f.Client(qcId, Roles.QcInspector);
        var a = await Br15Fixture.Body(await Br15Fixture.PostJson(qc, $"/api/goods-receipts/{receiptNo}/inspections", Inspection()));
        var b = await Br15Fixture.Body(await Br15Fixture.PostJson(qc, $"/api/goods-receipts/{receiptNo}/inspections", Inspection(weight: 410m)));
        var c = await Br15Fixture.Body(await Br15Fixture.PostJson(qc, $"/api/goods-receipts/{receiptNo}/inspections", Inspection(twoClaws: false)));
        Assert.Equal("Rejected", c.GetProperty("conclusion").GetString());
        Assert.Contains("thiếu càng", c.GetProperty("rejectReason").GetString());
        Assert.Equal(JsonValueKind.Null, c.GetProperty("crabCode").ValueKind);
        var done = await Br15Fixture.Body(await qc.PostAsync($"/api/goods-receipts/{receiptNo}/complete", null));
        Assert.Equal("Completed", done.GetProperty("status").GetString());
        Assert.Equal(2, done.GetProperty("acceptedCount").GetInt32());
        Assert.Equal(1, done.GetProperty("rejectedCount").GetInt32());
        return (receiptNo, [a.GetProperty("crabCode").GetString()!, b.GetProperty("crabCode").GetString()!]);
    }

    [Fact]
    public async Task Procurement_is_capped_by_funded_crabs_plus_restock_reserve()
    {
        var (o, supplier) = await OpenBatchAsync();
        // 200 con được cấp vốn + dự phòng 10.000.000 ÷ 250.000 đ mỗi con giống = 40 con thả bù.
        var over = await Br15Fixture.PostJson(o.Farmer, $"/api/batches/{o.Batch.Code}/procurement-orders", new
        {
            supplierPartyId = supplier, orderedOn = DateOnly.FromDateTime(DateTime.UtcNow), agreedSpec = "Cua thịt", quantity = 241, unitPrice = 250_000,
        });
        Assert.Equal("sourcing.exceeds_funded", await Br15Fixture.ErrorCode(over));
        var ok = await Br15Fixture.PostJson(o.Farmer, $"/api/batches/{o.Batch.Code}/procurement-orders", new
        {
            supplierPartyId = supplier, orderedOn = DateOnly.FromDateTime(DateTime.UtcNow), agreedSpec = "Cua thịt", quantity = 240, unitPrice = 250_000,
        });
        Assert.Equal(HttpStatusCode.Created, ok.StatusCode);
        await using var db = f.OpenDb();
        Assert.True(await db.BatchParticipants.AnyAsync(p => p.BatchId == o.Batch.BatchId && p.PartyId == supplier && p.ParticipantRole == "Supplier"));
    }

    [Fact]
    public async Task Only_the_randomly_assigned_qc_inspects_and_accepted_crabs_get_internal_codes()
    {
        var (o, supplier) = await OpenBatchAsync();
        var (receiptNo, codes) = await ReceiveAsync(o, supplier);
        Assert.All(codes, c => Assert.StartsWith("CU", c));
        var other = await f.CreateUserAsync("QC khác", Roles.QcInspector);
        using var otherClient = f.Client(other, Roles.QcInspector);
        var forbidden = await Br15Fixture.PostJson(otherClient, $"/api/goods-receipts/{receiptNo}/inspections", Inspection());
        Assert.Equal(HttpStatusCode.Forbidden, forbidden.StatusCode);
        var crab = await Br15Fixture.Body(await o.Farmer.GetAsync($"/api/crab-units/{codes[0]}"));
        Assert.Equal("Received", crab.GetProperty("inventoryStatus").GetString());
        Assert.Equal("Năm Căn, Cà Mau", crab.GetProperty("originRegion").GetString());
        Assert.Equal("Received", crab.GetProperty("events")[0].GetProperty("eventType").GetString());
    }

    [Fact]
    public async Task Qc_with_a_stake_in_the_batch_is_never_assigned()
    {
        var (o, _) = await OpenBatchAsync();
        // Nhà đầu tư của chính Lô này được bật quyền QC: phải bị loại khỏi danh sách được phân.
        var investorQc = await f.CreateUserAsync("NĐT kiêm QC", Roles.Investor, Roles.QcInspector);
        await using (var db = f.OpenDb())
        {
            db.BatchParticipants.Add(new BatchParticipant
            {
                BatchId = o.Batch.BatchId, PartyId = await db.AppUsers.Where(u => u.UserId == investorQc).Select(u => u.PartyId!.Value).SingleAsync(),
                ParticipantRole = "Investor", JoinedAt = DateTimeOffset.UtcNow, CreatedAt = DateTimeOffset.UtcNow,
            });
            await db.SaveChangesAsync();
        }
        await using var scope = f.Factory.Services.CreateAsyncScope();
        var eligible = await scope.ServiceProvider.GetRequiredService<QcAssignmentService>().EligibleAsync(o.Batch.BatchId, null, CancellationToken.None);
        Assert.DoesNotContain(investorQc, eligible);
        Assert.NotEmpty(eligible);
    }

    [Fact]
    public async Task Boxing_needs_a_fresh_in_app_photo_of_that_box_and_starts_holding()
    {
        var (o, supplier) = await OpenBatchAsync();
        var (_, codes) = await ReceiveAsync(o, supplier);
        var wrongPhoto = await BoxPhotoAsync(o.Batch.BatchId, "0002", o.Batch.Farmer.OperatorId);
        var mismatch = await Br15Fixture.PostJson(o.Farmer, $"/api/batches/{o.Batch.Code}/box-assignments", new { crabCode = codes[0], slotCode = "0001", evidenceId = wrongPhoto });
        Assert.Equal("holding.photo_wrong_box", await Br15Fixture.ErrorCode(mismatch));

        var photo = await BoxPhotoAsync(o.Batch.BatchId, "0001", o.Batch.Farmer.OperatorId);
        var boxed = await Br15Fixture.Body(await Br15Fixture.PostJson(o.Farmer, $"/api/batches/{o.Batch.Code}/box-assignments", new { crabCode = codes[0], slotCode = "0001", evidenceId = photo }));
        Assert.Equal("Holding", boxed.GetProperty("inventoryStatus").GetString());
        Assert.Equal("0001", boxed.GetProperty("currentSlotCode").GetString());

        var occupied = await Br15Fixture.PostJson(o.Farmer, $"/api/batches/{o.Batch.Code}/box-assignments", new
        {
            crabCode = codes[1], slotCode = "0001", evidenceId = await BoxPhotoAsync(o.Batch.BatchId, "0001", o.Batch.Farmer.OperatorId),
        });
        Assert.Equal("holding.slot_occupied", await Br15Fixture.ErrorCode(occupied));

        // Ảnh hộp gửi qua API thật (web và app đi đường này): hộp còn trống nên phải đánh dấu là ảnh xếp hộp, không thì bị từ chối như trước.
        using (var plain = EvidenceControllerTests.Upload(o.Batch.Code, "0002", EvidenceImages.Noise(915001)))
            Assert.Equal("evidence.slot_not_allocated", await Br15Fixture.ErrorCode(await o.Farmer.PostAsync("/api/evidence", plain)));
        using (var boxing = EvidenceControllerTests.Upload(o.Batch.Code, "0002", EvidenceImages.Noise(915002)))
        {
            boxing.Add(new StringContent("Boxed"), "slotEventType");
            var sent = await o.Farmer.PostAsync("/api/evidence", boxing);
            Assert.Equal(System.Net.HttpStatusCode.Created, sent.StatusCode);
            var uploaded = (await Br15Fixture.Body(sent)).GetProperty("id").GetInt64();
            var viaApi = await Br15Fixture.Body(await Br15Fixture.PostJson(o.Farmer, $"/api/batches/{o.Batch.Code}/box-assignments", new { crabCode = codes[1], slotCode = "0002", evidenceId = uploaded }));
            Assert.Equal("0002", viaApi.GetProperty("currentSlotCode").GetString());
        }
        using (var taken = EvidenceControllerTests.Upload(o.Batch.Code, "0002", EvidenceImages.Noise(915003)))
        {
            taken.Add(new StringContent("Boxed"), "slotEventType");
            Assert.Equal("evidence.box_not_free", await Br15Fixture.ErrorCode(await o.Farmer.PostAsync("/api/evidence", taken)));
        }

        var holding = await Br15Fixture.Body(await o.Farmer.GetAsync($"/api/batches/{o.Batch.Code}/holding"));
        Assert.Equal("Active", holding.GetProperty("status").GetString());
        Assert.Equal(40, holding.GetProperty("maxRestock").GetInt32());
        await using var db = f.OpenDb();
        Assert.Equal("InProduction", await db.Batches.Where(b => b.BatchId == o.Batch.BatchId).Select(b => b.Status).SingleAsync());
        var evidence = await db.Evidences.SingleAsync(e => e.EvidenceId == photo);
        Assert.Equal("Stocking", evidence.EvidenceKind);
    }

    [Fact]
    public async Task Death_needs_photo_frees_the_box_and_restock_replaces_only_that_crab()
    {
        var (o, supplier) = await OpenBatchAsync();
        var (_, codes) = await ReceiveAsync(o, supplier);
        await Br15Fixture.Body(await Br15Fixture.PostJson(o.Farmer, $"/api/batches/{o.Batch.Code}/box-assignments", new
        {
            crabCode = codes[0], slotCode = "0003", evidenceId = await BoxPhotoAsync(o.Batch.BatchId, "0003", o.Batch.Farmer.OperatorId),
        }));
        var noPhoto = await Br15Fixture.PostJson(o.Farmer, $"/api/crab-units/{codes[0]}/events", new { eventType = "Died" });
        Assert.Equal("holding.photo_required", await Br15Fixture.ErrorCode(noPhoto));
        var died = await Br15Fixture.Body(await Br15Fixture.PostJson(o.Farmer, $"/api/crab-units/{codes[0]}/events", new
        {
            eventType = "Died", evidenceId = await BoxPhotoAsync(o.Batch.BatchId, "0003", o.Batch.Farmer.OperatorId), note = "Chết sáng nay",
        }));
        Assert.Equal("Dead", died.GetProperty("inventoryStatus").GetString());
        Assert.Equal(JsonValueKind.Null, died.GetProperty("currentSlotCode").ValueKind);

        var wrongBox = await Br15Fixture.PostJson(o.Farmer, $"/api/batches/{o.Batch.Code}/box-assignments", new
        {
            crabCode = codes[1], slotCode = "0004", replacesCrabCode = codes[0], evidenceId = await BoxPhotoAsync(o.Batch.BatchId, "0004", o.Batch.Farmer.OperatorId),
        });
        Assert.Equal("holding.restock_invalid", await Br15Fixture.ErrorCode(wrongBox));
        var restock = await Br15Fixture.Body(await Br15Fixture.PostJson(o.Farmer, $"/api/batches/{o.Batch.Code}/box-assignments", new
        {
            crabCode = codes[1], slotCode = "0003", replacesCrabCode = codes[0], evidenceId = await BoxPhotoAsync(o.Batch.BatchId, "0003", o.Batch.Farmer.OperatorId),
        }));
        Assert.Equal(codes[0], restock.GetProperty("replacesCrabCode").GetString());
        Assert.Equal("Restock", restock.GetProperty("boxes")[0].GetProperty("reason").GetString());

        // Sự kiện tồn không sửa, không xoá được (BR-102).
        await using var db = f.OpenDb();
        var sql = () => db.Database.ExecuteSqlRawAsync("DELETE FROM dbo.inventory_event");
        await Assert.ThrowsAnyAsync<Exception>(sql);
    }

    [Fact]
    public async Task Move_keeps_the_same_crab_and_other_farm_cannot_operate()
    {
        var (o, supplier) = await OpenBatchAsync();
        var (_, codes) = await ReceiveAsync(o, supplier);
        await Br15Fixture.Body(await Br15Fixture.PostJson(o.Farmer, $"/api/batches/{o.Batch.Code}/box-assignments", new
        {
            crabCode = codes[0], slotCode = "0005", evidenceId = await BoxPhotoAsync(o.Batch.BatchId, "0005", o.Batch.Farmer.OperatorId),
        }));
        var moved = await Br15Fixture.Body(await Br15Fixture.PostJson(o.Farmer, $"/api/crab-units/{codes[0]}/move", new { slotCode = "0006" }));
        Assert.Equal("0006", moved.GetProperty("currentSlotCode").GetString());
        Assert.Equal(2, moved.GetProperty("boxes").GetArrayLength());

        var stranger = await f.CreateFarmerAsync(5);
        using var strangerClient = stranger.Client(f);
        var denied = await Br15Fixture.PostJson(strangerClient, $"/api/batches/{o.Batch.Code}/box-assignments", new { crabCode = codes[1], slotCode = "0001", evidenceId = 1 });
        Assert.Equal(HttpStatusCode.Forbidden, denied.StatusCode);
    }

    [Fact]
    public async Task Incoming_inspection_rejects_wrong_sex_for_roe_crab_batches()
    {
        Assert.False(CrabShare.Api.Features.Sourcing.SourcingService.MatchesCrabType("RoeCrab", "Male", "Mature"));
        Assert.True(CrabShare.Api.Features.Sourcing.SourcingService.MatchesCrabType("RoeCrab", "Female", "Mature"));
        Assert.False(CrabShare.Api.Features.Sourcing.SourcingService.MatchesCrabType("YoungFemaleCrab", "Female", "Mature"));
        Assert.True(CrabShare.Api.Features.Sourcing.SourcingService.MatchesCrabType("FatteningMudCrab", "Male", "Unknown"));
        await Task.CompletedTask;
    }
}
