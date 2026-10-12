using Microsoft.AspNetCore.Diagnostics;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Common.Errors;

/// <summary>
/// Đổi mọi exception thành ProblemDetails (RFC 9457) để web và mobile đọc lỗi cùng một kiểu:
/// { status, title, detail, code }.
/// Lỗi ràng buộc của SQL Server (UNIQUE, CHECK, FK, THROW trong trigger) cũng được đổi thành 409/422
/// kèm tên ràng buộc, vì nhiều quy tắc nghiệp vụ đã được khoá ngay trong CSDL.
/// </summary>
public sealed class GlobalExceptionHandler(IProblemDetailsService problems, ILogger<GlobalExceptionHandler> logger) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext http, Exception ex, CancellationToken ct)
    {
        var (status, code, detail) = ex switch
        {
            AppException app => (app.StatusCode, app.Code, app.Message),
            DbUpdateException { InnerException: SqlException sql } => MapSql(sql),
            SqlException sql => MapSql(sql),
            _ => (StatusCodes.Status500InternalServerError, "server_error", "Có lỗi không mong muốn. Thử lại sau."),
        };

        if (status >= 500) logger.LogError(ex, "Unhandled exception");

        http.Response.StatusCode = status;
        return await problems.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = http,
            Exception = ex,
            ProblemDetails =
            {
                Status = status,
                Title = code,
                Detail = detail,
                Extensions = { ["code"] = code },
            },
        });
    }

    private static (int, string, string) MapSql(SqlException sql) => sql.Number switch
    {
        2627 or 2601 => (StatusCodes.Status409Conflict, "db.unique", $"Dữ liệu bị trùng: {ConstraintName(sql.Message)}"),
        547 => (StatusCodes.Status422UnprocessableEntity, "db.constraint", $"Vi phạm ràng buộc: {ConstraintName(sql.Message)}"),
        >= 50000 => (StatusCodes.Status422UnprocessableEntity, "db.rule", sql.Message), // THROW 5000x trong trigger
        _ => (StatusCodes.Status500InternalServerError, "db.error", "Lỗi cơ sở dữ liệu."),
    };

    // Lấy tên ràng buộc (ví dụ ck_batch_capital_range) trong thông báo lỗi của SQL Server
    private static string ConstraintName(string message)
    {
        var start = message.IndexOf('"');
        var end = start >= 0 ? message.IndexOf('"', start + 1) : -1;
        return start >= 0 && end > start ? message[(start + 1)..end] : message;
    }
}
