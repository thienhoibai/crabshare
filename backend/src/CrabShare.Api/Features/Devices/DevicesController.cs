using CrabShare.Api.Common.Auth;
using CrabShare.Api.Features.Grading;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CrabShare.Api.Features.Devices;

public sealed class StationMeasurementForm
{
    /// <summary>Phần meta JSON của bản tin trạm đo.</summary>
    [FromForm(Name = "meta")] public string Meta { get; set; } = "";
    [FromForm(Name = "white")] public IFormFile? White { get; set; }
    [FromForm(Name = "red")] public IFormFile? Red { get; set; }
}

public sealed class BoxImageForm
{
    [FromForm(Name = "meta")] public string Meta { get; set; } = "";
    [FromForm(Name = "image")] public IFormFile? Image { get; set; }
}

/// <summary>
/// API nhận dữ liệu cho thiết bị thật và tool giả lập (mục 11 của Hướng dẫn, BR-230). Xác thực bằng header X-Device-Key;
/// chống lặp bằng Idempotency-Key = mã bản tin. 202 đã nhận; 409 trùng; 404 không có lượt đo mở; 403 thiết bị chưa đăng ký, đã gỡ
/// hoặc ngoài phạm vi; 422 thiếu trường hoặc vi phạm quy tắc đo.
/// </summary>
[ApiController]
[AllowAnonymous]
[Route("api/devices")]
public sealed class DevicesController(DeviceIngestService ingest) : ControllerBase
{
    private const long MaxRequestBytes = 40 * 1024 * 1024;

    [HttpPost("heartbeat")]
    public async Task<ActionResult<HeartbeatResponse>> Heartbeat(HeartbeatMessage msg, [FromHeader(Name = "X-Device-Key")] string? key, CancellationToken ct)
        => Ok(await ingest.HeartbeatAsync(msg, key, ct));

    [HttpGet("{code}/open-session")]
    public async Task<ActionResult<OpenSessionResponse>> OpenSession(string code, [FromHeader(Name = "X-Device-Key")] string? key, CancellationToken ct)
        => Ok(await ingest.OpenSessionAsync(code, key, ct));

    [HttpPost("ingest/measurements"), Consumes("multipart/form-data"), RequestSizeLimit(MaxRequestBytes)]
    public async Task<ActionResult<IngestAccepted>> Measurement([FromForm] StationMeasurementForm form, [FromHeader(Name = "X-Device-Key")] string? key,
        [FromHeader(Name = "Idempotency-Key")] string? idempotencyKey, CancellationToken ct)
        => Accepted(await ingest.MeasurementAsync(form.Meta, form.White, form.Red, key, idempotencyKey, ct));

    [HttpPost("ingest/box-images"), Consumes("multipart/form-data"), RequestSizeLimit(MaxRequestBytes)]
    public async Task<ActionResult<IngestAccepted>> BoxImage([FromForm] BoxImageForm form, [FromHeader(Name = "X-Device-Key")] string? key,
        [FromHeader(Name = "Idempotency-Key")] string? idempotencyKey, CancellationToken ct)
        => Accepted(await ingest.BoxImageAsync(form.Meta, form.Image, key, idempotencyKey, ct));

    [HttpPost("ingest/water-readings")]
    public async Task<ActionResult<IngestAccepted>> Water(WaterReadingMessage msg, [FromHeader(Name = "X-Device-Key")] string? key,
        [FromHeader(Name = "Idempotency-Key")] string? idempotencyKey, CancellationToken ct)
        => Accepted(await ingest.WaterReadingAsync(msg, key, idempotencyKey, ct));

    [HttpPost("calibration")]
    public async Task<ActionResult<IngestAccepted>> Calibration(CalibrationMessage msg, [FromHeader(Name = "X-Device-Key")] string? key,
        [FromHeader(Name = "Idempotency-Key")] string? idempotencyKey, CancellationToken ct)
        => Accepted(await ingest.CalibrationAsync(msg, key, idempotencyKey, ct));

    [HttpGet("{code}/commands")]
    public async Task<ActionResult<IReadOnlyList<DeviceCommandResponse>>> Commands(string code, [FromHeader(Name = "X-Device-Key")] string? key, CancellationToken ct)
        => Ok(await ingest.CommandsAsync(code, key, ct));

    [HttpPost("commands/{id:long}/ack")]
    public async Task<IActionResult> Ack(long id, [FromHeader(Name = "X-Device-Key")] string? key, [FromQuery] string? deviceCode, CancellationToken ct)
    {
        await ingest.AckCommandAsync(id, deviceCode, key, ct);
        return NoContent();
    }
}

[ApiController]
[Authorize]
public sealed class DeviceManagementController(DeviceAdminService devices, DeviceDataService data) : ControllerBase
{
    [HttpPost("api/admin/devices"), Authorize(Policy = Policies.Admin)]
    [EndpointSummary("Admin đăng ký thiết bị với mã, loại, phạm vi; khoá thiết bị chỉ trả về một lần (BR-116, BR-230)")]
    public async Task<ActionResult<DeviceRegisteredResponse>> Register(RegisterDeviceRequest req, CancellationToken ct)
        => StatusCode(StatusCodes.Status201Created, await devices.RegisterAsync(req, ct));

    [HttpGet("api/admin/devices"), Authorize(Policy = Policies.Admin)]
    public async Task<ActionResult<IReadOnlyList<DeviceResponse>>> List([FromQuery] long? operatorId, CancellationToken ct) => Ok(await devices.ListAsync(operatorId, ct));

    [HttpPost("api/admin/devices/{code}/rotate-key"), Authorize(Policy = Policies.Admin)]
    public async Task<IActionResult> RotateKey(string code, CancellationToken ct) => Ok(new { deviceKey = await devices.RotateKeyAsync(code, ct) });

    [HttpPost("api/admin/devices/{code}/remove"), Authorize(Policy = Policies.Admin)]
    public async Task<ActionResult<DeviceResponse>> Remove(string code, CancellationToken ct) => Ok(await devices.RemoveAsync(code, ct));

    [HttpGet("api/operators/me/devices"), Authorize(Policy = Policies.Operator)]
    public async Task<ActionResult<IReadOnlyList<DeviceResponse>>> Mine(CancellationToken ct) => Ok(await devices.ListAsync(null, ct));

    [HttpPost("api/devices/{code}/calibrations")]
    [EndpointSummary("Ghi hiệu chuẩn tay (quả cân chuẩn, dung dịch chuẩn) vào nhật ký kiểm toán (BR-225)")]
    public async Task<ActionResult<DeviceResponse>> Calibrate(string code, ManualCalibrationRequest req, CancellationToken ct)
        => Ok(await devices.RecordCalibrationAsync(code, req, ct));

    [HttpPost("api/devices/{code}/commands")]
    [EndpointSummary("Lệnh cho camera chạy dàn: quét dàn, quét một hộp khi có cảnh báo, về chỗ đỗ")]
    public async Task<ActionResult<DeviceCommandResponse>> Command(string code, DeviceCommandRequest req, CancellationToken ct)
        => StatusCode(StatusCodes.Status201Created, await devices.CommandAsync(code, req, ct));

    [HttpGet("api/batches/{code}/water-readings")]
    [EndpointSummary("Chỉ số nước của đợt lưu nuôi, chỉ để vẽ biểu đồ (BR-115)")]
    public async Task<ActionResult<IReadOnlyList<WaterReadingResponse>>> Water(string code, [FromQuery] DateTimeOffset? from, [FromQuery] DateTimeOffset? to, CancellationToken ct)
        => Ok(await data.WaterAsync(code, from, to, ct));

    [HttpGet("api/batches/{code}/device-images")]
    public async Task<ActionResult<IReadOnlyList<DeviceImageResponse>>> Images(string code, [FromQuery] string? slotCode, CancellationToken ct)
        => Ok(await data.BoxImagesAsync(code, slotCode, ct));

    [HttpGet("api/device-images/{id:long}/file")]
    public async Task<IActionResult> ImageFile(long id, CancellationToken ct)
    {
        var (content, type) = await data.BoxImageFileAsync(id, ct);
        return File(content, type);
    }
}

[ApiController]
[Authorize]
public sealed class MeasurementSessionsController(MeasurementSessionService sessions) : ControllerBase
{
    [HttpPost("api/batches/{code}/start-harvest")]
    [EndpointSummary("Bắt đầu thu hoạch: Lô chuyển Harvesting, từng con được đưa qua trạm đo (BR-150)")]
    public async Task<IActionResult> StartHarvest(string code, CancellationToken ct) => Ok(new { status = await sessions.StartHarvestAsync(code, ct) });

    [HttpPost("api/measurement-sessions")]
    [EndpointSummary("Mở lượt đo với mã cua trước khi đặt cua vào trạm (BR-224)")]
    public async Task<ActionResult<SessionResponse>> Open(OpenSessionRequest req, CancellationToken ct)
        => StatusCode(StatusCodes.Status201Created, await sessions.OpenAsync(req, ct));

    [HttpGet("api/measurement-sessions/{sessionNo}")]
    public async Task<ActionResult<SessionResponse>> Get(string sessionNo, CancellationToken ct) => Ok(await sessions.GetAsync(sessionNo, ct));

    [HttpPost("api/measurement-sessions/{sessionNo}/cancel")]
    public async Task<ActionResult<SessionResponse>> Cancel(string sessionNo, CancellationToken ct) => Ok(await sessions.CancelAsync(sessionNo, ct));
}
