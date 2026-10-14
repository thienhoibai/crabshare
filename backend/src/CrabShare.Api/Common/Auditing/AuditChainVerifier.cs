using CrabShare.Api.Infrastructure.Persistence.Entities;

namespace CrabShare.Api.Common.Auditing;

/// <summary>Kết quả kiểm tra chuỗi: hợp lệ, hoặc dòng đầu tiên bị gãy và lý do.</summary>
public sealed record AuditChainResult(bool IsValid, int CheckedRows, long? BrokenAuditId, string? Problem)
{
    public static AuditChainResult Valid(int checkedRows) => new(true, checkedRows, null, null);

    public static AuditChainResult Broken(long auditId, int checkedRows, string problem) => new(false, checkedRows, auditId, problem);
}

public static class AuditChainVerifier
{
    /// <summary>
    /// Duyệt các dòng theo thứ tự audit_id tăng dần. <paramref name="previousRowHash"/> là row_hash của dòng
    /// ngay trước dòng đầu tiên (null nếu bắt đầu từ đầu bảng). Hash từng dòng kiểm bằng AuditChain.VerifyHash
    /// (chấp nhận cả dòng Accounts cũ dạng PascalCase).
    /// </summary>
    public static AuditChainResult Verify(IEnumerable<AuditLog> rows, string? previousRowHash = null)
    {
        var expectedPrev = previousRowHash;
        var checkedRows = 0;
        foreach (var row in rows)
        {
            if (row.PrevHash != expectedPrev)
                return AuditChainResult.Broken(row.AuditId, checkedRows, "prev_hash không khớp dòng trước: có dòng bị xoá, chèn hoặc đổi thứ tự.");
            if (!AuditChain.VerifyHash(row))
                return AuditChainResult.Broken(row.AuditId, checkedRows, "row_hash không khớp nội dung: dòng này đã bị sửa.");
            expectedPrev = row.RowHash;
            checkedRows++;
        }
        return AuditChainResult.Valid(checkedRows);
    }
}
