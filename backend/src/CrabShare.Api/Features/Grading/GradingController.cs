using CrabShare.Api.Common.Auth;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CrabShare.Api.Features.Grading;

/// <summary>Phân hạng từng con (BR-151 – BR-159): số đo, đề xuất, Nhân viên kiểm phẩm duyệt, giữ lại, loại, sửa.</summary>
[ApiController]
[Authorize]
public sealed class GradingController(GradingService grading) : ControllerBase
{
    private const long PhotoLimit = 12 * 1024 * 1024;

    [HttpGet("api/measurement-sessions/{sessionNo}/measurements")]
    [EndpointSummary("Số đo, kết quả AI và quyết định hiện hành của lượt đo")]
    public async Task<ActionResult<SessionMeasurementsResponse>> Measurements(string sessionNo, CancellationToken ct)
        => Ok(await grading.MeasurementsAsync(sessionNo, ct));

    [HttpPost("api/measurement-sessions/{sessionNo}/values")]
    [EndpointSummary("Nhập số đo tay: cân tay và thước kẹp (lượt đo Manual) hoặc thước kẹp khi ảnh lỗi, AI không chắc (BR-226)")]
    public async Task<ActionResult<SessionMeasurementsResponse>> Values(string sessionNo, MeasurementValuesRequest req, CancellationToken ct)
        => Ok(await grading.RecordValuesAsync(sessionNo, req, ct));

    [HttpPost("api/measurement-sessions/{sessionNo}/process")]
    [EndpointSummary("Chạy lại xử lý lượt đo đã nhận bản tin của trạm mà chưa có số đo")]
    public async Task<ActionResult<SessionMeasurementsResponse>> Process(string sessionNo, CancellationToken ct)
        => Ok(await grading.ReprocessAsync(sessionNo, ct));

    [HttpGet("api/measurement-sessions/{sessionNo}/images/{kind}")]
    [EndpointSummary("Ảnh lượt đo: white (đèn trắng) hoặc red (soi đỏ)")]
    public async Task<IActionResult> Image(string sessionNo, string kind, CancellationToken ct)
    {
        var (content, type) = await grading.SessionImageAsync(sessionNo, kind, ct);
        return File(content, type);
    }

    [HttpGet("api/batches/{code}/grading")]
    [EndpointSummary("Tổng hợp phân hạng của Lô")]
    public async Task<ActionResult<BatchGradingSummary>> Summary(string code, CancellationToken ct) => Ok(await grading.BatchSummaryAsync(code, ct));

    [HttpPost("api/admin/batches/{code}/grading-qc"), Authorize(Policy = Policies.Admin)]
    [EndpointSummary("Phân công ngẫu nhiên Nhân viên kiểm phẩm cho buổi đo của Lô khi lúc đo pool còn trống (BR-017)")]
    public async Task<ActionResult<BatchGradingSummary>> AssignQc(string code, CancellationToken ct) => Ok(await grading.AssignGradingQcAsync(code, ct));

    [HttpGet("api/batches/{code}/grade-decisions")]
    [EndpointSummary("Quyết định phân hạng hiện hành của Lô, lọc theo trạng thái")]
    public async Task<ActionResult<IReadOnlyList<GradeDecisionResponse>>> BatchDecisions(string code, [FromQuery] string? status, CancellationToken ct)
        => Ok(await grading.BatchDecisionsAsync(code, status, ct));

    [HttpGet("api/crab-units/{crabCode}/grade-decisions")]
    [EndpointSummary("Lịch sử quyết định phân hạng của một con cua (BR-157)")]
    public async Task<ActionResult<IReadOnlyList<GradeDecisionResponse>>> CrabHistory(string crabCode, CancellationToken ct)
        => Ok(await grading.CrabHistoryAsync(crabCode, ct));

    [HttpGet("api/grade-decisions/{decisionNo}")]
    public async Task<ActionResult<GradeDecisionResponse>> Get(string decisionNo, CancellationToken ct) => Ok(await grading.DecisionAsync(decisionNo, ct));

    [HttpGet("api/grade-decisions/{decisionNo}/photo")]
    public async Task<IActionResult> Photo(string decisionNo, CancellationToken ct)
    {
        var (content, type) = await grading.DecisionPhotoAsync(decisionNo, ct);
        return File(content, type);
    }

    [HttpPost("api/grade-decisions/{decisionNo}/approve"), Authorize(Policy = Policies.Qc)]
    [EndpointSummary("Nhân viên kiểm phẩm duyệt hạng cuối sau kiểm cảm quan (BR-155)")]
    public async Task<ActionResult<GradeDecisionResponse>> Approve(string decisionNo, ApproveDecisionRequest req, CancellationToken ct)
        => Ok(await grading.ApproveAsync(decisionNo, req, ct));

    [HttpPost("api/grade-decisions/{decisionNo}/hold"), Authorize(Policy = Policies.Qc)]
    [EndpointSummary("Giữ lại để kiểm thêm; cần Nhân viên kiểm phẩm thứ hai xác nhận (BR-017)")]
    public async Task<ActionResult<GradeDecisionResponse>> Hold(string decisionNo, HoldDecisionRequest req, CancellationToken ct)
        => Ok(await grading.HoldAsync(decisionNo, req, ct));

    [HttpPost("api/grade-decisions/{decisionNo}/confirm-hold"), Authorize(Policy = Policies.Qc)]
    public async Task<ActionResult<GradeDecisionResponse>> ConfirmHold(string decisionNo, CancellationToken ct)
        => Ok(await grading.ConfirmHoldAsync(decisionNo, ct));

    [HttpPost("api/grade-decisions/{decisionNo}/reject"), Authorize(Policy = Policies.Qc), Consumes("multipart/form-data")]
    [RequestSizeLimit(PhotoLimit)]
    [EndpointSummary("Loại bỏ cua chết, yếu nặng hoặc không an toàn, kèm ảnh chụp trong app (BR-156)")]
    public async Task<ActionResult<GradeDecisionResponse>> Reject(string decisionNo, [FromForm] RejectDecisionRequest req, CancellationToken ct)
        => Ok(await grading.RejectAsync(decisionNo, req, ct));

    [HttpPost("api/grade-decisions/{decisionNo}/revise"), Authorize(Policy = Policies.Qc), Consumes("multipart/form-data")]
    [RequestSizeLimit(PhotoLimit)]
    [EndpointSummary("Đổi size hoặc hạng cuối: tạo phiên bản quyết định mới kèm ảnh và lý do (BR-157)")]
    public async Task<ActionResult<GradeDecisionResponse>> Revise(string decisionNo, [FromForm] ReviseDecisionRequest req, CancellationToken ct)
        => Ok(await grading.ReviseAsync(decisionNo, req, ct));
}

/// <summary>Chuẩn phân hạng và bộ quy tắc (BR-038).</summary>
[ApiController]
public sealed class GradingStandardsController(GradingStandardService standards) : ControllerBase
{
    [HttpGet("api/grading/standards"), AllowAnonymous]
    [EndpointSummary("Chuẩn phân hạng và bộ quy tắc đang áp dụng (chuẩn nội bộ tham chiếu, không phải chứng nhận)")]
    public async Task<ActionResult<IReadOnlyList<GradingStandardResponse>>> Standards(CancellationToken ct) => Ok(await standards.StandardsAsync(false, ct));

    [HttpGet("api/admin/grade-rule-sets"), Authorize(Policy = Policies.Admin)]
    public async Task<ActionResult<IReadOnlyList<GradingStandardResponse>>> All(CancellationToken ct) => Ok(await standards.StandardsAsync(true, ct));

    [HttpPost("api/admin/grade-rule-sets"), Authorize(Policy = Policies.Admin)]
    [EndpointSummary("Tạo bản nháp bộ quy tắc mới (chép bộ đang áp dụng nếu không gửi quy tắc)")]
    public async Task<ActionResult<GradeRuleSetResponse>> Create(CreateRuleSetRequest req, CancellationToken ct)
        => StatusCode(StatusCodes.Status201Created, await standards.CreateDraftAsync(req, ct));

    [HttpPut("api/admin/grade-rule-sets/{id:long}/rules"), Authorize(Policy = Policies.Admin)]
    public async Task<ActionResult<GradeRuleSetResponse>> Rules(long id, ReplaceRulesRequest req, CancellationToken ct)
        => Ok(await standards.ReplaceRulesAsync(id, req, ct));

    [HttpPost("api/admin/grade-rule-sets/{id:long}/activate"), Authorize(Policy = Policies.Admin)]
    [EndpointSummary("Áp dụng bản nháp; bộ cũ chuyển Retired, Lô đã duyệt vẫn dùng bộ cũ (BR-038)")]
    public async Task<ActionResult<GradeRuleSetResponse>> Activate(long id, CancellationToken ct) => Ok(await standards.ActivateAsync(id, ct));
}
