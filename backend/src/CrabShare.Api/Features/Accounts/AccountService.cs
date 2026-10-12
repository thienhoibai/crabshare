using System.Data;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Infrastructure.Ekyc;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Accounts;

public sealed class AccountService(AppDbContext db, ICurrentUser me, IEkycProvider ekyc, TimeProvider clock)
{
    public async Task<KycStatusResponse> GetKycAsync(CancellationToken ct)
    {
        var investor = await GetInvestorAsync(tracking: false, ct);
        var check = await db.KycChecks.AsNoTracking()
            .Where(c => c.UserId == investor.UserId && c.CheckType == "EkycIdFace")
            .OrderByDescending(c => c.CheckedAt).ThenByDescending(c => c.KycCheckId)
            .FirstOrDefaultAsync(ct);
        return ToResponse(investor, check);
    }

    public async Task<KycStatusResponse> VerifyIdentityAsync(EkycRequest req, CancellationToken ct)
    {
        if (!req.Consent)
            throw BadRequest("kyc.consent_required", "Bạn cần đồng ý xác minh danh tính trước khi gửi ảnh.");

        ValidateImage(req.IdCardFront);
        ValidateImage(req.IdCardBack);
        ValidateImage(req.Selfie);
        var investor = await GetInvestorAsync(tracking: false, ct);
        RequireUnverified(investor);
        var consentAt = UtcNow();

        // Không dùng IFileStorage, không lưu tên file, ảnh hoặc FullNameOnCard vào CSDL/log.
        await using var front = req.IdCardFront!.OpenReadStream();
        await using var back = req.IdCardBack!.OpenReadStream();
        await using var selfie = req.Selfie!.OpenReadStream();
        await ValidateImageHeaderAsync(front, req.IdCardFront.ContentType, ct);
        await ValidateImageHeaderAsync(back, req.IdCardBack.ContentType, ct);
        await ValidateImageHeaderAsync(selfie, req.Selfie.ContentType, ct);
        // Gọi provider một lần, ngoài transaction và ngoài vòng retry của SQL Server.
        var result = await ekyc.VerifyAsync(front, back, selfie, ct);
        var checkedAt = UtcNow();

        return await db.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
        {
            // Một lần retry bắt đầu với dữ liệu đọc lại từ DB, không giữ entity của lần bị rollback.
            db.ChangeTracker.Clear();
            await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
            var current = await GetInvestorAsync(tracking: true, ct);
            RequireUnverified(current);
            var oldValue = JsonSerializer.Serialize(new { current.VerificationStatus, current.VerifiedAt });

            current.VerificationStatus = result.Passed ? "Verified" : "Rejected";
            current.VerifiedAt = result.Passed ? checkedAt : null;
            var check = new KycCheck
            {
                UserId = current.UserId,
                CheckType = "EkycIdFace",
                ProviderRef = result.ProviderReference,
                ConsentAt = consentAt,
                Result = result.Passed ? "Passed" : "Failed",
                FailureReason = result.Passed ? null : Truncate(result.FailureReason ?? "Xác minh danh tính không đạt.", 300),
                CheckedAt = checkedAt,
                CreatedAt = checkedAt,
            };
            db.KycChecks.Add(check);

            var newValue = JsonSerializer.Serialize(new
            {
                current.VerificationStatus,
                current.VerifiedAt,
                check.Result,
                check.ProviderRef,
            });
            await AppendAuditAsync(current.UserId, oldValue, newValue, checkedAt, ct);
            await db.SaveChangesAsync(ct);
            await transaction.CommitAsync(ct);
            return ToResponse(current, check);
        });
    }

    private async Task<Investor> GetInvestorAsync(bool tracking, CancellationToken ct)
    {
        if (!me.IsInRole(Roles.Investor))
            throw new ForbiddenException("auth.investor_only", "Chỉ nhà đầu tư mới có thể xác minh danh tính.");

        var query = db.Investors.Include(i => i.User).AsQueryable();
        if (!tracking) query = query.AsNoTracking();
        var investor = await query.SingleOrDefaultAsync(i => i.UserId == me.UserId, ct)
                       ?? throw new NotFoundException("kyc.investor_not_found", "Không tìm thấy hồ sơ nhà đầu tư.");
        if (investor.User.Status == "Locked")
            throw new ForbiddenException("auth.locked", "Tài khoản đã bị khoá.");
        return investor;
    }

    private static void RequireUnverified(Investor investor)
    {
        if (investor.VerificationStatus == "Verified")
            throw new ConflictException("kyc.already_verified", "Danh tính của bạn đã được xác minh.");
    }

    private static void ValidateImage(IFormFile? image)
    {
        if (image is null || image.Length == 0)
            throw BadRequest("kyc.image_required", "Cần gửi đủ ảnh CCCD mặt trước, mặt sau và ảnh khuôn mặt.");
        if (image.Length > EkycUploadLimits.MaxImageBytes)
            throw BadRequest("kyc.image_too_large", "Mỗi ảnh xác minh không được vượt quá 5 MB.");
        if (image.ContentType is not ("image/jpeg" or "image/png" or "image/webp"))
            throw BadRequest("kyc.image_format", "Ảnh xác minh phải có định dạng JPEG, PNG hoặc WebP.");
    }

    private static async Task ValidateImageHeaderAsync(Stream image, string contentType, CancellationToken ct)
    {
        var header = new byte[12];
        var length = await image.ReadAtLeastAsync(header, header.Length, throwOnEndOfStream: false, ct);
        var matches = contentType switch
        {
            "image/jpeg" => length >= 3 && header[0] == 0xff && header[1] == 0xd8 && header[2] == 0xff,
            "image/png" => length >= 8 && header.AsSpan(0, 8).SequenceEqual(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 }),
            "image/webp" => length == 12 && header.AsSpan(0, 4).SequenceEqual("RIFF"u8) && header.AsSpan(8, 4).SequenceEqual("WEBP"u8),
            _ => false,
        };
        if (!matches)
            throw BadRequest("kyc.image_format", "Nội dung ảnh không khớp định dạng JPEG, PNG hoặc WebP.");
        image.Position = 0;
    }

    private async Task AppendAuditAsync(long userId, string oldValue, string newValue, DateTimeOffset now, CancellationToken ct)
    {
        // Khoá cả khi audit_log trống; ghi nối chuỗi và thay đổi KYC trong cùng transaction.
        // TH-02 chưa có IAuditLog. Định dạng hash được ghi trong README để tích hợp writer chung.
        var previousHash = await db.AuditLogs
            .FromSqlRaw("SELECT * FROM dbo.audit_log WITH (UPDLOCK, HOLDLOCK)")
            .OrderByDescending(a => a.AuditId).Select(a => a.RowHash).FirstOrDefaultAsync(ct);
        var audit = new AuditLog
        {
            EntityType = "Investor",
            EntityId = userId,
            ActionType = "VerifyIdentity",
            OldValue = oldValue,
            NewValue = newValue,
            ActorUserId = userId,
            OccurredAt = now,
            PrevHash = previousHash,
        };
        var content = JsonSerializer.Serialize(new
        {
            audit.EntityType, audit.EntityId, audit.ActionType,
            audit.OldValue, audit.NewValue, audit.ActorUserId, audit.OccurredAt,
        });
        audit.RowHash = Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes((previousHash ?? "") + content)));
        db.AuditLogs.Add(audit);
    }

    private static AppException BadRequest(string code, string message)
        => new(StatusCodes.Status400BadRequest, code, message);

    private static string Truncate(string value, int max) => value.Length <= max ? value : value[..max];

    // SQL dùng DATETIMEOFFSET(3). Băm timestamp ở cùng độ chính xác để đọc lại vẫn khớp audit.
    private DateTimeOffset UtcNow() => DateTimeOffset.FromUnixTimeMilliseconds(clock.GetUtcNow().ToUnixTimeMilliseconds());

    private static KycStatusResponse ToResponse(Investor investor, KycCheck? check)
        => new(investor.VerificationStatus, investor.VerifiedAt, check is null ? null : new(
            check.KycCheckId, check.CheckType, check.Result, check.ProviderRef,
            check.ConsentAt, check.CheckedAt, check.FailureReason));
}
