using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Features.Orders;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace CrabShare.Api.Tests;

/// <summary>UC31 + UC32 trên CSDL thật: khiếu nại, hộ nuôi phản hồi, tự leo thang, admin phân xử và hoàn tiền. Không chạy trong CI.</summary>
[Trait("Category", "Database")]
[Collection("OrderDatabase")]
public class ComplaintDatabaseTests(OrderDatabaseFixture fixture) : IClassFixture<OrderDatabaseFixture>
{
    private static readonly JsonSerializerOptions Json = new() { PropertyNameCaseInsensitive = true };

    private static HttpClient AdminClient(OrderDatabaseFixture f, long adminId)
    {
        var client = f.Factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Test-User", adminId.ToString());
        client.DefaultRequestHeaders.Add("X-Test-Role", Roles.PlatformAdmin);
        return client;
    }

    private static async Task<string?> ErrorCode(HttpResponseMessage response)
        => (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString();

    private async Task<(long CustomerId, long OperatorUserId, long OperatorId, string OrderNo, long AdminId)> SeedDeliveredOrderAsync()
    {
        var listingId = await fixture.CreateListingAsync(stockKg: 10);
        var (customerId, addressId) = await fixture.CreateCustomerAsync();

        using var customer = fixture.Client(customerId);
        using var checkout = await customer.PostAsJsonAsync("/api/orders/checkout", new
        {
            addressId,
            lines = new[] { new { listingId, quantityKg = 1m } },
        });
        checkout.EnsureSuccessStatusCode();
        var orderNo = (await checkout.Content.ReadFromJsonAsync<CheckoutResponse>())!.Orders.Single().OrderNo;

        return await fixture.WithDbAsync(async db =>
        {
            var now = DateTimeOffset.UtcNow;
            var listing = await db.ProductListings.Include(l => l.Batch).SingleAsync(l => l.ListingId == listingId);
            var order = await db.SalesOrders.SingleAsync(o => o.OrderNo == orderNo);
            order.Status = "Delivered";
            order.PaidAt = now.AddHours(-10);
            order.ShippedAt = now.AddHours(-5);
            order.DeliveredAt = now.AddHours(-2);
            order.ReturnWindowEndsAt = now.AddHours(70);
            order.CarrierName = "Chành xe Test";
            order.DriverPhone = "0901234567";
            order.UpdatedAt = now;

            var operatorUser = new AppUser
            {
                Email = $"complaint-op-{Guid.NewGuid():N}@test.local",
                FullName = "Hộ nuôi khiếu nại",
                PasswordHash = "test-only",
                Status = "Active",
                CreatedAt = now,
                UpdatedAt = now,
            };
            db.AppUsers.Add(operatorUser);
            await db.SaveChangesAsync();

            db.OperatorMembers.Add(new OperatorMember
            {
                OperatorId = listing.Batch.OperatorId,
                UserId = operatorUser.UserId,
                MemberRole = "Owner",
                JoinedAt = now,
                CreatedAt = now,
            });

            var adminUser = new AppUser
            {
                Email = $"admin-{Guid.NewGuid():N}@test.local",
                FullName = "Admin xử lý",
                PasswordHash = "test-only",
                Status = "Active",
                CreatedAt = now,
                UpdatedAt = now,
            };
            adminUser.AppUserRoles.Add(new AppUserRole { RoleCode = Roles.PlatformAdmin, GrantedAt = now, CreatedAt = now });
            db.AppUsers.Add(adminUser);

            await db.SaveChangesAsync();

            return (customerId, operatorUser.UserId, listing.Batch.OperatorId, orderNo, adminUser.UserId);
        });
    }

    [Fact]
    public async Task SubmitComplaint_WhenOrderDelivered_SucceedsAndCreatesOpenComplaint()
    {
        var (customerId, _, _, orderNo, _) = await SeedDeliveredOrderAsync();
        using var client = fixture.Client(customerId);

        var req = new CreateComplaintRequest(ComplaintTypes.Damaged, "Cua bị óp và gãy càng khi nhận", "https://img.test/cua-gay.jpg");
        using var res = await client.PostAsJsonAsync($"/api/orders/{orderNo}/complaints", req);

        var body = await res.Content.ReadAsStringAsync();
        Assert.True(res.IsSuccessStatusCode, body);
        var detail = await res.Content.ReadFromJsonAsync<ComplaintDetailResponse>(Json);
        Assert.NotNull(detail);
        Assert.Equal(ComplaintStatuses.Open, detail.Status);
        Assert.Equal(ComplaintTypes.Damaged, detail.ComplaintType);
        Assert.Equal(orderNo, detail.OrderNo);

        // Kiểm tra audit log
        await fixture.WithDbAsync(async db =>
        {
            var auditExists = await db.AuditLogs.AnyAsync(a =>
                a.EntityType == "complaint" && a.EntityId == detail.ComplaintId && a.ActionType == "create");
            Assert.True(auditExists);
            return true;
        });
    }

    [Fact]
    public async Task SubmitComplaint_WhenNotOwner_Returns403()
    {
        var (_, _, _, orderNo, _) = await SeedDeliveredOrderAsync();
        var (otherCustomerId, _) = await fixture.CreateCustomerAsync();
        using var otherClient = fixture.Client(otherCustomerId);

        var req = new CreateComplaintRequest(ComplaintTypes.WrongGrade, "Giao sai hạng", null);
        using var res = await otherClient.PostAsJsonAsync($"/api/orders/{orderNo}/complaints", req);

        Assert.Equal(HttpStatusCode.Forbidden, res.StatusCode);
        Assert.Equal(ComplaintErrors.OrderNotOwner, await ErrorCode(res));
    }

    [Fact]
    public async Task SubmitComplaint_WhenOrderPendingPayment_Returns422()
    {
        var listingId = await fixture.CreateListingAsync(stockKg: 10);
        var (customerId, addressId) = await fixture.CreateCustomerAsync();
        using var client = fixture.Client(customerId);

        using var checkout = await client.PostAsJsonAsync("/api/orders/checkout", new
        {
            addressId,
            lines = new[] { new { listingId, quantityKg = 1m } },
        });
        var orderNo = (await checkout.Content.ReadFromJsonAsync<CheckoutResponse>())!.Orders.Single().OrderNo;

        var req = new CreateComplaintRequest(ComplaintTypes.Damaged, "Hàng hỏng", null);
        using var res = await client.PostAsJsonAsync($"/api/orders/{orderNo}/complaints", req);

        Assert.Equal(HttpStatusCode.UnprocessableEntity, res.StatusCode);
        Assert.Equal(ComplaintErrors.OrderNotEligible, await ErrorCode(res));
    }

    [Fact]
    public async Task SubmitComplaint_WhenAlreadyHasActive_Returns422()
    {
        var (customerId, _, _, orderNo, _) = await SeedDeliveredOrderAsync();
        using var client = fixture.Client(customerId);

        var req1 = new CreateComplaintRequest(ComplaintTypes.Damaged, "Lần 1", null);
        using var res1 = await client.PostAsJsonAsync($"/api/orders/{orderNo}/complaints", req1);
        Assert.Equal(HttpStatusCode.OK, res1.StatusCode);

        var req2 = new CreateComplaintRequest(ComplaintTypes.LateDelivery, "Lần 2", null);
        using var res2 = await client.PostAsJsonAsync($"/api/orders/{orderNo}/complaints", req2);

        Assert.Equal(HttpStatusCode.UnprocessableEntity, res2.StatusCode);
        Assert.Equal(ComplaintErrors.AlreadyHasActive, await ErrorCode(res2));
    }

    [Fact]
    public async Task OperatorRespond_WhenOwner_SucceedsAndUpdatesStatus()
    {
        var (customerId, operatorUserId, operatorId, orderNo, _) = await SeedDeliveredOrderAsync();
        using var customer = fixture.Client(customerId);

        var req = new CreateComplaintRequest(ComplaintTypes.Damaged, "Cua chết 1 con", "https://img.test/proof.jpg");
        using var createRes = await customer.PostAsJsonAsync($"/api/orders/{orderNo}/complaints", req);
        var complaint = (await createRes.Content.ReadFromJsonAsync<ComplaintDetailResponse>(Json))!;

        using var opClient = fixture.OperatorClient(operatorUserId, operatorId);
        var respondReq = new RespondComplaintRequest("Trại đã kiểm tra clip đóng gói, đồng ý hoàn 50%", "https://img.test/pack.mp4");
        using var res = await opClient.PostAsJsonAsync($"/api/complaints/{complaint.ComplaintId}/respond", respondReq);

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var detail = await res.Content.ReadFromJsonAsync<ComplaintDetailResponse>(Json);
        Assert.NotNull(detail);
        Assert.Equal(ComplaintStatuses.OperatorResponded, detail.Status);
        Assert.Equal("Trại đã kiểm tra clip đóng gói, đồng ý hoàn 50%", detail.OperatorResponse);
        Assert.NotNull(detail.RespondedAt);
    }

    [Fact]
    public async Task OperatorRespond_WhenOtherOperator_Returns403()
    {
        var (customerId, _, _, orderNo, _) = await SeedDeliveredOrderAsync();
        using var customer = fixture.Client(customerId);

        var req = new CreateComplaintRequest(ComplaintTypes.Damaged, "Lỗi cua", null);
        using var createRes = await customer.PostAsJsonAsync($"/api/orders/{orderNo}/complaints", req);
        var complaint = (await createRes.Content.ReadFromJsonAsync<ComplaintDetailResponse>(Json))!;

        using var otherOpClient = fixture.OperatorClient(99999, 99999);
        var respondReq = new RespondComplaintRequest("Không liên quan", null);
        using var res = await otherOpClient.PostAsJsonAsync($"/api/complaints/{complaint.ComplaintId}/respond", respondReq);

        Assert.Equal(HttpStatusCode.Forbidden, res.StatusCode);
        Assert.Equal(ComplaintErrors.OperatorForbidden, await ErrorCode(res));
    }

    [Fact]
    public async Task AdminResolve_Refund_CreatesPaymentInstructionAndResolvesComplaint()
    {
        var (customerId, _, _, orderNo, adminId) = await SeedDeliveredOrderAsync();
        using var customer = fixture.Client(customerId);

        var req = new CreateComplaintRequest(ComplaintTypes.Damaged, "Cua bị hỏng", null);
        using var createRes = await customer.PostAsJsonAsync($"/api/orders/{orderNo}/complaints", req);
        var complaint = (await createRes.Content.ReadFromJsonAsync<ComplaintDetailResponse>(Json))!;

        using var admin = AdminClient(fixture, adminId);
        var resolveReq = new ResolveComplaintRequest(ComplaintResolutions.Refund, 200_000m, "Chấp nhận hoàn một phần 200k");
        using var res = await admin.PostAsJsonAsync($"/api/admin/complaints/{complaint.ComplaintId}/resolve", resolveReq);

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var detail = await res.Content.ReadFromJsonAsync<ComplaintDetailResponse>(Json);
        Assert.NotNull(detail);
        Assert.Equal(ComplaintStatuses.Resolved, detail.Status);
        Assert.Equal(ComplaintResolutions.Refund, detail.Resolution);
        Assert.Equal(200_000m, detail.RefundAmount);

        // Kiểm tra lệnh hoàn tiền payment_instruction đã tạo
        await fixture.WithDbAsync(async db =>
        {
            var refundInstruction = await db.PaymentInstructions
                .SingleOrDefaultAsync(p => p.OrderId == detail.OrderId && p.InstructionType == "Refund");
            Assert.NotNull(refundInstruction);
            Assert.Equal(200_000m, refundInstruction.Amount);
            Assert.Equal("Created", refundInstruction.Status);

            var auditRefund = await db.AuditLogs.AnyAsync(a =>
                a.EntityType == "payment_instruction" && a.EntityId == refundInstruction.InstructionId && a.ActionType == "create");
            Assert.True(auditRefund);
            return true;
        });
    }

    [Fact]
    public async Task AdminResolve_FullRefund_UpdatesOrderStatusToReturned()
    {
        var (customerId, _, _, orderNo, adminId) = await SeedDeliveredOrderAsync();
        using var customer = fixture.Client(customerId);

        var req = new CreateComplaintRequest(ComplaintTypes.WrongGrade, "Giao sai toàn bộ", null);
        using var createRes = await customer.PostAsJsonAsync($"/api/orders/{orderNo}/complaints", req);
        var complaint = (await createRes.Content.ReadFromJsonAsync<ComplaintDetailResponse>(Json))!;

        using var admin = AdminClient(fixture, adminId);
        var resolveReq = new ResolveComplaintRequest(ComplaintResolutions.Refund, complaint.TotalAmount, "Hoàn tiền 100%");
        using var res = await admin.PostAsJsonAsync($"/api/admin/complaints/{complaint.ComplaintId}/resolve", resolveReq);

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);

        await fixture.WithDbAsync(async db =>
        {
            var order = await db.SalesOrders.SingleAsync(o => o.OrderNo == orderNo);
            Assert.Equal("Returned", order.Status);
            return true;
        });
    }

    [Fact]
    public async Task AdminResolve_Rejected_UpdatesStatusToRejected()
    {
        var (customerId, _, _, orderNo, adminId) = await SeedDeliveredOrderAsync();
        using var customer = fixture.Client(customerId);

        var req = new CreateComplaintRequest(ComplaintTypes.Other, "Yêu cầu không chính đáng", null);
        using var createRes = await customer.PostAsJsonAsync($"/api/orders/{orderNo}/complaints", req);
        var complaint = (await createRes.Content.ReadFromJsonAsync<ComplaintDetailResponse>(Json))!;

        using var admin = AdminClient(fixture, adminId);
        var resolveReq = new ResolveComplaintRequest(ComplaintStatuses.Rejected, null, "Không đủ bằng chứng");
        using var res = await admin.PostAsJsonAsync($"/api/admin/complaints/{complaint.ComplaintId}/resolve", resolveReq);

        var body = await res.Content.ReadAsStringAsync();
        Assert.True(res.IsSuccessStatusCode, $"Expected OK but got {res.StatusCode}: {body}");
        var detail = await res.Content.ReadFromJsonAsync<ComplaintDetailResponse>(Json);
        Assert.NotNull(detail);
        Assert.Equal(ComplaintStatuses.Rejected, detail.Status);
        Assert.Equal(ComplaintResolutions.NoAction, detail.Resolution);
    }

    [Fact]
    public async Task EscalateOverdue_WhenOverdue24h_UpdatesStatusToEscalated()
    {
        var (customerId, _, _, orderNo, _) = await SeedDeliveredOrderAsync();
        using var customer = fixture.Client(customerId);

        var req = new CreateComplaintRequest(ComplaintTypes.LateDelivery, "Giao trễ", null);
        using var createRes = await customer.PostAsJsonAsync($"/api/orders/{orderNo}/complaints", req);
        var complaint = (await createRes.Content.ReadFromJsonAsync<ComplaintDetailResponse>(Json))!;

        // Làm giả mốc opened_at về 25 tiếng trước
        await fixture.WithDbAsync(async db =>
        {
            var c = await db.Complaints.SingleAsync(x => x.ComplaintId == complaint.ComplaintId);
            c.OpenedAt = DateTimeOffset.UtcNow.AddHours(-25);
            await db.SaveChangesAsync();
            return true;
        });

        using var scope = fixture.Factory.Services.CreateScope();
        var service = scope.ServiceProvider.GetRequiredService<ComplaintService>();
        var escalatedCount = await service.EscalateOverdueAsync(CancellationToken.None);

        Assert.True(escalatedCount >= 1);

        await fixture.WithDbAsync(async db =>
        {
            var c = await db.Complaints.SingleAsync(x => x.ComplaintId == complaint.ComplaintId);
            Assert.Equal(ComplaintStatuses.Escalated, c.Status);
            Assert.NotNull(c.EscalatedAt);
            return true;
        });
    }
}
