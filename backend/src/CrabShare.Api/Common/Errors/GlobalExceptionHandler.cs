using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Common.Errors;

/// <summary>
/// Đổi mọi exception thành ProblemDetails (RFC 9457) để web và mobile đọc lỗi cùng một kiểu:
/// { status, title, detail, code }.
/// Lỗi ràng buộc của SQL Server (UNIQUE, CHECK, FK, THROW trong trigger) cũng được đổi thành 409/422,
/// vì nhiều quy tắc nghiệp vụ đã được khoá ngay trong CSDL. Lời báo cho người dùng không bao giờ chép nguyên
/// thông báo của SQL Server: thông báo đó lộ tên bảng, tên chỉ mục và cả giá trị bị trùng.
/// </summary>
public sealed partial class GlobalExceptionHandler(IProblemDetailsService problems, ILogger<GlobalExceptionHandler> logger) : IExceptionHandler
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
        if (status == 429) http.Response.Headers.RetryAfter = "900";
        var context = new ProblemDetailsContext
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
        };
        if (ex is AppException { Details: { } details }) context.ProblemDetails.Extensions["details"] = details;
        return await problems.TryWriteAsync(context);
    }

    private (int, string, string) MapSql(SqlException sql)
    {
        switch (sql.Number)
        {
            case 2627 or 2601:
                // Chỉ ghi tên chỉ mục vào log; giá trị bị trùng (số điện thoại, số đăng ký…) không ghi lại.
                logger.LogWarning("Trùng dữ liệu ở ràng buộc duy nhất {Index}", UniqueIndexName(sql.Message) ?? "(không rõ)");
                return (StatusCodes.Status409Conflict, "db.unique", DuplicateMessage(sql.Message));
            case 547:
                var constraint = ConstraintName(sql.Message);
                return (StatusCodes.Status422UnprocessableEntity, "db.constraint",
                    constraint is null ? "Dữ liệu chưa hợp lệ với ràng buộc của hệ thống." : $"Vi phạm ràng buộc: {constraint}");
            case >= 50000:
                return (StatusCodes.Status422UnprocessableEntity, "db.rule", sql.Message); // THROW 5000x trong trigger
            default:
                return (StatusCodes.Status500InternalServerError, "db.error", "Lỗi cơ sở dữ liệu.");
        }
    }

    /// <summary>Lời báo trùng dữ liệu cho những chỉ mục duy nhất mà người dùng có thể chạm tới; còn lại dùng câu chung.</summary>
    private static readonly Dictionary<string, string> DuplicateMessages = new(StringComparer.OrdinalIgnoreCase)
    {
        ["ux_app_user_phone"] = "Số điện thoại này đã được dùng cho một tài khoản khác.",
        ["ux_party_registration_no"] = "Mã số thuế hoặc số đăng ký này đã có trong hệ thống.",
        ["ux_party_site_code"] = "Mã địa điểm này đã được dùng.",
        ["ux_payout_account_digest"] = "Tài khoản ngân hàng này đã được khai cho một chủ tài khoản khác.",
        ["ux_payout_active_user"] = "Bạn đã có một tài khoản nhận tiền đang dùng.",
        ["ux_payout_active_operator"] = "Hộ nuôi đã có một tài khoản nhận tiền đang dùng.",
    };

    /// <summary>Đổi thông báo lỗi trùng khoá của SQL Server thành câu cho người dùng, không lộ tên bảng hay giá trị bị trùng.</summary>
    public static string DuplicateMessage(string sqlMessage)
        => UniqueIndexName(sqlMessage) is { } name && DuplicateMessages.TryGetValue(name, out var text)
            ? text
            : "Thông tin này đã có trong hệ thống. Hãy kiểm tra lại dữ liệu vừa nhập.";

    // "... with unique index 'ux_app_user_phone'." hoặc "Violation of UNIQUE KEY constraint 'ux_party_site_code'."
    private static string? UniqueIndexName(string message)
    {
        var match = UniqueName().Match(message);
        return match.Success ? match.Groups[1].Value : null;
    }

    // Lấy tên ràng buộc (ví dụ ck_batch_capital_range) trong thông báo lỗi của SQL Server
    private static string? ConstraintName(string message)
    {
        var start = message.IndexOf('"');
        var end = start >= 0 ? message.IndexOf('"', start + 1) : -1;
        return start >= 0 && end > start ? message[(start + 1)..end] : null;
    }

    [GeneratedRegex("(?:unique index|constraint) '([^']+)'", RegexOptions.IgnoreCase)]
    private static partial Regex UniqueName();
}
