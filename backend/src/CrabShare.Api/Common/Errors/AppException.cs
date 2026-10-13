namespace CrabShare.Api.Common.Errors;

/// <summary>
/// Lỗi nghiệp vụ có chủ đích. Ném ra trong service, GlobalExceptionHandler sẽ đổi thành ProblemDetails.
/// Code nên ngắn gọn, dạng "module.ly_do" hoặc mã quy tắc nghiệp vụ, ví dụ "BR-11", "funding.over_max_capital".
/// Mọi lớp con đều nhận (code, message) theo cùng thứ tự.
/// </summary>
public class AppException(int statusCode, string code, string message) : Exception(message)
{
    public int StatusCode { get; } = statusCode;
    public string Code { get; } = code;

    /// <summary>Dữ liệu kèm theo cho client (ví dụ tagCode, orderLineId); xuất ra ProblemDetails dưới khoá "details".</summary>
    public object? Details { get; init; }
}

public sealed class NotFoundException(string code, string message)
    : AppException(StatusCodes.Status404NotFound, code, message);

public sealed class ForbiddenException(string code, string message)
    : AppException(StatusCodes.Status403Forbidden, code, message);

public sealed class ConflictException(string code, string message)
    : AppException(StatusCodes.Status409Conflict, code, message);

/// <summary>Vi phạm quy tắc nghiệp vụ (BR-xx trong tài liệu). Trả 422.</summary>
public sealed class BusinessRuleException(string code, string message)
    : AppException(StatusCodes.Status422UnprocessableEntity, code, message);
