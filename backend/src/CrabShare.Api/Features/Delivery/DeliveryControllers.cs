using CrabShare.Api.Common.Auth;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CrabShare.Api.Features.Delivery;

/// <summary>Đợt giao, chuyến giao, cân hai lần, nghiệm thu, phần còn lại (BR-160 – BR-169, BR-234).</summary>
[ApiController]
[Authorize]
public sealed class DeliveryController(DeliveryService delivery) : ControllerBase
{
    [HttpGet("api/batches/{code}/delivery-tranches")]
    [EndpointSummary("Các đợt giao của Lô kèm số con đã phân bổ theo từng dòng")]
    public async Task<ActionResult<IReadOnlyList<TrancheStatusResponse>>> Tranches(string code, CancellationToken ct) => Ok(await delivery.TranchesAsync(code, ct));

    [HttpGet("api/batches/{code}/allocations")]
    [EndpointSummary("Phân bổ hàng của Lô (BR-160)")]
    public async Task<ActionResult<IReadOnlyList<AllocationResponse>>> Allocations(string code, CancellationToken ct) => Ok(await delivery.AllocationsAsync(code, ct));

    [HttpPost("api/delivery-tranches/{id:long}/shipments")]
    [EndpointSummary("Lập chuyến giao cho đợt; bù cua còn thiếu, cho phép thay cua cùng size hạng cao hơn; phát QR đơn")]
    public async Task<ActionResult<ShipmentResponse>> CreateShipment(long id, CreateShipmentRequest req, CancellationToken ct)
        => StatusCode(StatusCodes.Status201Created, await delivery.CreateShipmentAsync(id, req, ct));

    [HttpPost("api/delivery-tranches/{id:long}/cancel")]
    [EndpointSummary("Huỷ đợt chưa xuất vì thiếu cua; đợt cuối thì hoàn phần cọc chưa dùng (BR-160)")]
    public async Task<ActionResult<OrderDeliveriesResponse>> CancelTranche(long id, CancelTrancheRequest req, CancellationToken ct)
        => Ok(await delivery.CancelTrancheAsync(id, req, ct));

    [HttpGet("api/shipments/{shipmentNo}")]
    public async Task<ActionResult<ShipmentResponse>> Shipment(string shipmentNo, CancellationToken ct) => Ok(await delivery.ShipmentAsync(shipmentNo, ct));

    [HttpPost("api/shipments/{shipmentNo}/dispatch")]
    [EndpointSummary("Xuất hàng, cân lần một theo từng dòng (BR-164)")]
    public async Task<ActionResult<ShipmentResponse>> Dispatch(string shipmentNo, DispatchRequest req, CancellationToken ct)
        => Ok(await delivery.DispatchAsync(shipmentNo, req, ct));

    [HttpPost("api/shipments/{shipmentNo}/receipt")]
    [EndpointSummary("Ghi cân lần hai khi nhận và lập biên bản nghiệm thu chờ khách xác nhận (BR-165)")]
    public async Task<ActionResult<ShipmentResponse>> Receipt(string shipmentNo, ReceiptRequest req, CancellationToken ct)
        => Ok(await delivery.RecordReceiptAsync(shipmentNo, req, ct));

    [HttpPost("api/shipments/{shipmentNo}/acceptance/confirm")]
    [EndpointSummary("Khách xác nhận nghiệm thu: tiền hàng, trừ cọc, phần còn lại qua VietQR, hoá đơn đợt (BR-166 – BR-171)")]
    public async Task<ActionResult<ShipmentResponse>> Confirm(string shipmentNo, CancellationToken ct) => Ok(await delivery.ConfirmAcceptanceAsync(shipmentNo, ct));

    [HttpPost("api/shipments/{shipmentNo}/acceptance/refuse")]
    [EndpointSummary("Khách từ chối nhận: mất cọc, cua quay về để bán lại (BR-169)")]
    public async Task<ActionResult<ShipmentResponse>> Refuse(string shipmentNo, RefuseDeliveryRequest req, CancellationToken ct)
        => Ok(await delivery.RefuseAsync(shipmentNo, req, ct));

    [HttpGet("api/preorders/{orderNo}/deliveries")]
    [EndpointSummary("Chuyến giao, nghiệm thu, hoá đơn và phần còn lại của một đơn")]
    public async Task<ActionResult<OrderDeliveriesResponse>> OrderDeliveries(string orderNo, CancellationToken ct)
        => Ok(await delivery.OrderDeliveriesAsync(orderNo, ct));
}

/// <summary>Đổi trả, khiếu nại và đánh giá đơn (BR-172 – BR-176).</summary>
[ApiController]
[Authorize]
public sealed class ClaimsController(ClaimService claims) : ControllerBase
{
    private const long PhotoLimit = 12 * 1024 * 1024;

    [HttpPost("api/preorders/{orderNo}/claims"), Consumes("multipart/form-data"), RequestSizeLimit(PhotoLimit)]
    [EndpointSummary("Khách gửi khiếu nại hoặc trả hàng trong hạn đổi trả, kèm ảnh chụp trong app (BR-172)")]
    public async Task<ActionResult<ClaimResponse>> Create(string orderNo, [FromForm] CreateClaimRequest req, CancellationToken ct)
        => StatusCode(StatusCodes.Status201Created, await claims.CreateAsync(orderNo, req, ct));

    [HttpGet("api/claims/{claimNo}")]
    public async Task<ActionResult<ClaimResponse>> Get(string claimNo, CancellationToken ct) => Ok(await claims.GetAsync(claimNo, ct));

    [HttpGet("api/claims/{claimNo}/photo")]
    public async Task<IActionResult> Photo(string claimNo, CancellationToken ct)
    {
        var (content, type) = await claims.PhotoAsync(claimNo, ct);
        return File(content, type);
    }

    [HttpGet("api/operators/me/claims"), Authorize(Policy = Policies.Operator)]
    public async Task<ActionResult<IReadOnlyList<ClaimResponse>>> Mine([FromQuery] string? status, CancellationToken ct) => Ok(await claims.ListAsync(status, true, ct));

    [HttpPost("api/claims/{claimNo}/respond"), Authorize(Policy = Policies.Operator)]
    [EndpointSummary("Người nuôi chấp nhận hoặc từ chối trong hạn phản hồi")]
    public async Task<ActionResult<ClaimResponse>> Respond(string claimNo, RespondClaimRequest req, CancellationToken ct)
        => Ok(await claims.RespondAsync(claimNo, req, ct));

    [HttpPost("api/claims/{claimNo}/customer-reply")]
    [EndpointSummary("Khách đồng ý thì chốt; không đồng ý thì chuyển Admin")]
    public async Task<ActionResult<ClaimResponse>> Reply(string claimNo, CustomerReplyRequest req, CancellationToken ct)
        => Ok(await claims.CustomerReplyAsync(claimNo, req, ct));

    [HttpGet("api/admin/claims"), Authorize(Policy = Policies.Admin)]
    public async Task<ActionResult<IReadOnlyList<ClaimResponse>>> All([FromQuery] string? status, CancellationToken ct) => Ok(await claims.ListAsync(status, false, ct));

    [HttpPost("api/admin/claims/{claimNo}/decide"), Authorize(Policy = Policies.Admin)]
    [EndpointSummary("Admin quyết định cuối (BR-174)")]
    public async Task<ActionResult<ClaimResponse>> Decide(string claimNo, AdminClaimDecisionRequest req, CancellationToken ct)
        => Ok(await claims.AdminDecideAsync(claimNo, req, ct));

    [HttpPost("api/preorders/{orderNo}/rating")]
    [EndpointSummary("Khách đánh giá đơn đã giao, mỗi đơn một lần (BR-176)")]
    public async Task<ActionResult<OrderRatingResponse>> Rate(string orderNo, RateOrderRequest req, CancellationToken ct) => Ok(await claims.RateAsync(orderNo, req, ct));
}

/// <summary>Đơn có hoá đơn và đơn hàng cuối (BR-177 – BR-182).</summary>
[ApiController]
[Authorize]
public sealed class DirectSalesController(DirectSaleService sales) : ControllerBase
{
    [HttpGet("api/batches/{code}/sellable-crabs")]
    [EndpointSummary("Cua đã duyệt hạng còn trong tồn, chưa phân bổ")]
    public async Task<ActionResult<IReadOnlyList<SellableCrab>>> Sellable(string code, CancellationToken ct) => Ok(await sales.SellableAsync(code, ct));

    [HttpGet("api/batches/{code}/direct-sales")]
    public async Task<ActionResult<IReadOnlyList<DirectSaleResponse>>> List(string code, CancellationToken ct) => Ok(await sales.ListAsync(code, ct));

    [HttpPost("api/batches/{code}/invoiced-sales")]
    [EndpointSummary("Đơn có hoá đơn: dưới chuẩn, bán lại do mất cọc, phần dư (BR-169, BR-177, BR-182)")]
    public async Task<ActionResult<DirectSaleResponse>> InvoicedSale(string code, InvoicedSaleRequest req, CancellationToken ct)
        => StatusCode(StatusCodes.Status201Created, await sales.CreateInvoicedSaleAsync(code, req, ct));

    [HttpPost("api/batches/{code}/final-order")]
    [EndpointSummary("Đơn hàng cuối cho bên cam kết thu mua, đơn giá không dưới giá sàn (BR-179 – BR-181)")]
    public async Task<ActionResult<DirectSaleResponse>> FinalOrder(string code, FinalOrderRequest req, CancellationToken ct)
        => StatusCode(StatusCodes.Status201Created, await sales.CreateFinalOrderAsync(code, req, ct));

    [HttpGet("api/direct-sales/{orderNo}")]
    public async Task<ActionResult<DirectSaleResponse>> Get(string orderNo, CancellationToken ct) => Ok(await sales.GetAsync(orderNo, ct));

    [HttpPost("api/direct-sales/{orderNo}/cancel")]
    [EndpointSummary("Huỷ đơn chưa thu tiền; với đơn hàng cuối là ghi bên cam kết không mua (BR-182)")]
    public async Task<ActionResult<DirectSaleResponse>> Cancel(string orderNo, CancelDirectSaleRequest req, CancellationToken ct)
        => Ok(await sales.CancelAsync(orderNo, req, ct));
}

/// <summary>Trang truy xuất của mã QR đơn, công khai (BR-162, BR-163).</summary>
[ApiController]
public sealed class OrderTraceController(OrderTraceService trace) : ControllerBase
{
    [HttpGet("api/trace/orders/{traceCode}"), AllowAnonymous]
    [EndpointSummary("Quét QR đơn: Lô, trại, vùng xuất xứ, ngày thu của lô nguồn, quy cách đã duyệt; không có thông tin cá nhân")]
    public async Task<ActionResult<OrderTraceResponse>> Trace(string traceCode, CancellationToken ct) => Ok(await trace.TraceAsync(traceCode, ct));
}
