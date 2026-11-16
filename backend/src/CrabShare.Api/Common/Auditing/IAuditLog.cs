namespace CrabShare.Api.Common.Auditing;

/// <summary>
/// Nhật ký kiểm toán dùng chung (TH-02). Mọi thay đổi về tiền, hợp đồng, chi phí chuẩn, trạng thái lô,
/// quyết toán, KYC đều phải ghi. Luôn gọi BÊN TRONG transaction (db.InTransactionAsync) để thay đổi
/// nghiệp vụ và dòng nhật ký cùng commit hoặc cùng rollback. Giao thức băm/khoá: <see cref="AuditChain"/>.
/// </summary>
public interface IAuditLog
{
    /// <summary>
    /// Khoá chuỗi audit tới khi transaction commit. WriteAsync tự khoá; chỉ gọi sớm hơn khi muốn các
    /// thao tác đồng thời (ví dụ hai admin cùng duyệt một hồ sơ) chạy lần lượt ngay từ đầu.
    /// </summary>
    Task LockAsync(CancellationToken ct);

    /// <summary>
    /// Ghi một dòng. oldValue / newValue: chuỗi JSON có sẵn, hoặc object bất kỳ (tự đổi sang JSON camelCase).
    /// Người thực hiện lấy từ ICurrentUser (job nền thì để trống); thời điểm lấy theo giờ máy chủ.
    /// </summary>
    Task WriteAsync(string entityType, long entityId, string action, object? oldValue, object? newValue, CancellationToken ct);

    /// <summary>Như trên nhưng tự chọn thời điểm, ví dụ dùng đúng giá trị vừa ghi vào approved_at.</summary>
    Task WriteAsync(string entityType, long entityId, string action, object? oldValue, object? newValue, DateTimeOffset occurredAt, CancellationToken ct);

    /// <summary>Kiểm tra chuỗi trong khoảng audit_id [from, to]; null = từ đầu / tới cuối bảng.</summary>
    Task<AuditChainResult> VerifyChainAsync(long? fromAuditId, long? toAuditId, CancellationToken ct);
}
