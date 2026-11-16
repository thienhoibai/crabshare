using CrabShare.Api.Common.Auth;
using CrabShare.Api.Features.Holding;
using CrabShare.Api.Features.Quality;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CrabShare.Api.Features.Sourcing;

/// <summary>WF-05 nguồn hàng và kiểm đầu vào (BR-098…101).</summary>
[ApiController]
[Authorize]
public sealed class SourcingController(SourcingService sourcing) : ControllerBase
{
    [HttpPost("api/batches/{code}/procurement-orders")]
    [EndpointSummary("Đơn mua nguồn: lô P chỉ mua sau khi Lô mở, trong số con được cấp vốn (BR-098)")]
    public async Task<ActionResult<ProcurementOrderResponse>> CreateOrder(string code, ProcurementOrderRequest req, CancellationToken ct)
        => StatusCode(StatusCodes.Status201Created, await sourcing.CreateOrderAsync(code, req, ct));

    [HttpGet("api/batches/{code}/procurement-orders")]
    public async Task<ActionResult<IReadOnlyList<ProcurementOrderResponse>>> Orders(string code, CancellationToken ct) => Ok(await sourcing.OrdersAsync(code, ct));

    [HttpPost("api/procurement-orders/{poNo}/receipts")]
    [EndpointSummary("Nhận một lô nguồn bằng phiếu nhận hàng; hệ thống phân ngẫu nhiên Nhân viên kiểm phẩm (BR-017, BR-099)")]
    public async Task<ActionResult<GoodsReceiptResponse>> CreateReceipt(string poNo, GoodsReceiptRequest req, CancellationToken ct)
        => StatusCode(StatusCodes.Status201Created, await sourcing.CreateReceiptAsync(poNo, req, ct));

    [HttpGet("api/batches/{code}/goods-receipts")]
    public async Task<ActionResult<IReadOnlyList<GoodsReceiptResponse>>> Receipts(string code, CancellationToken ct) => Ok(await sourcing.ReceiptsAsync(code, ct));

    [HttpGet("api/goods-receipts/{receiptNo}")]
    public async Task<ActionResult<GoodsReceiptResponse>> Receipt(string receiptNo, CancellationToken ct) => Ok(await sourcing.ReceiptAsync(receiptNo, ct));

    [HttpPost("api/goods-receipts/{receiptNo}/inspections"), Authorize(Policy = Policies.Qc)]
    [EndpointSummary("Nhân viên kiểm phẩm kiểm từng con; con đạt được gắn mã cua nội bộ (BR-100, BR-101)")]
    public async Task<ActionResult<InspectionResponse>> Inspect(string receiptNo, IncomingInspectionRequest req, CancellationToken ct)
        => StatusCode(StatusCodes.Status201Created, await sourcing.InspectAsync(receiptNo, req, ct));

    [HttpPost("api/goods-receipts/{receiptNo}/complete"), Authorize(Policy = Policies.Qc)]
    public async Task<ActionResult<GoodsReceiptResponse>> Complete(string receiptNo, CancellationToken ct) => Ok(await sourcing.CompleteReceiptAsync(receiptNo, ct));
}

/// <summary>WF-05 lưu nuôi (BR-104…111, 120–128).</summary>
[ApiController]
[Authorize]
public sealed class HoldingController(HoldingService holding) : ControllerBase
{
    [HttpPost("api/batches/{code}/box-assignments")]
    [EndpointSummary("Xếp con cua vào hộp trống kèm ảnh hộp; thả bù thay con đã chết (BR-106…108, BR-120)")]
    public async Task<ActionResult<CrabUnitResponse>> Box(string code, BoxRequest req, CancellationToken ct)
        => StatusCode(StatusCodes.Status201Created, await holding.BoxAsync(code, req, ct));

    [HttpGet("api/batches/{code}/boxes")]
    public async Task<ActionResult<IReadOnlyList<BoxStateResponse>>> Boxes(string code, CancellationToken ct) => Ok(await holding.BoxesAsync(code, ct));

    [HttpGet("api/batches/{code}/holding")]
    public async Task<ActionResult<HoldingResponse>> Holding(string code, CancellationToken ct) => Ok(await holding.HoldingAsync(code, ct));

    [HttpGet("api/batches/{code}/crab-units")]
    public async Task<ActionResult<IReadOnlyList<CrabUnitResponse>>> Crabs(string code, [FromQuery] string? status, CancellationToken ct)
        => Ok(await holding.CrabsAsync(code, status, ct));

    [HttpGet("api/crab-units/{crabCode}")]
    [EndpointSummary("Chi tiết một con cua: lô nguồn, các hộp đã ở, sự kiện tồn (BR-102, BR-142)")]
    public async Task<ActionResult<CrabUnitResponse>> Crab(string crabCode, CancellationToken ct) => Ok(await holding.CrabAsync(crabCode, ct));

    [HttpPost("api/crab-units/{crabCode}/move")]
    public async Task<ActionResult<CrabUnitResponse>> Move(string crabCode, MoveRequest req, CancellationToken ct) => Ok(await holding.MoveAsync(crabCode, req, ct));

    [HttpPost("api/crab-units/{crabCode}/events")]
    [EndpointSummary("Ghi sự kiện của một con: chết (kèm ảnh), lột xác, ăn khác thường, kiểm tra")]
    public async Task<ActionResult<CrabUnitResponse>> Record(string crabCode, CrabEventRequest req, CancellationToken ct)
        => StatusCode(StatusCodes.Status201Created, await holding.RecordAsync(crabCode, req, ct));
}

[ApiController]
[Authorize(Policy = Policies.Qc)]
public sealed class QcTasksController(QcAssignmentService qc, ICurrentUser me) : ControllerBase
{
    [HttpGet("api/qc/tasks")]
    [EndpointSummary("Việc được phân ngẫu nhiên cho Nhân viên kiểm phẩm (BR-017)")]
    public async Task<ActionResult<IReadOnlyList<QcTaskResponse>>> Tasks(CancellationToken ct) => Ok(await qc.MyTasksAsync(me.UserId, ct));
}
