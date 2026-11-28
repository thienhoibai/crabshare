using System.ComponentModel.DataAnnotations;
using System.Security.Cryptography;
using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Features.Evidence;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using CrabShare.Api.Infrastructure.Storage;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Parties;

public sealed record PartyDocumentResponse(long DocumentId, string DocType, string ContentType, string? Note, DateTimeOffset UploadedAt);

public sealed record PartyAccountResponse(long UserId, string Email, string FullName, string? Phone, string Status, IReadOnlyList<string> Roles,
    string? InvestorVerification, string? EkycResult, DateTimeOffset? EkycCheckedAt, string? EkycFailureReason);

/// <summary>Những gì Admin cần xem trước khi xác minh một đối tác: tài khoản đứng tên, kết quả eKYC và giấy tờ đã gửi.</summary>
public sealed record PartyDossierResponse(IReadOnlyList<PartyAccountResponse> Accounts, IReadOnlyList<PartyDocumentResponse> Documents);

public sealed class UploadPartyDocumentRequest
{
    [Required, RegularExpression("^(BusinessRegistration|License|Authorization|Other)$")] public string DocType { get; set; } = "BusinessRegistration";
    [StringLength(200)] public string? Note { get; set; }
    /// <summary>Giấy tờ dạng ảnh JPEG, PNG, WebP hoặc PDF, tối đa 5 MB.</summary>
    [Required] public IFormFile? File { get; set; }
}

/// <summary>
/// Giấy tờ pháp lý của đối tác tổ chức (hộ kinh doanh, doanh nghiệp) để Admin xác minh hồ sơ (BR-009, BR-016).
/// Cá nhân không gửi giấy tờ ở đây: cá nhân xác minh bằng eKYC và hệ thống không lưu ảnh giấy tờ tuỳ thân (BR-010).
/// </summary>
public sealed class PartyDocumentService(AppDbContext db, ICurrentUser me, PartyDirectory parties, EvidenceImageProcessor images,
    IFileStorage files, TimeProvider clock, IAuditLog audit)
{
    public const int MaxActiveDocuments = 10;
    private const int MaxPdfBytes = 5 * 1024 * 1024;

    public async Task<IReadOnlyList<PartyDocumentResponse>> ListMineAsync(CancellationToken ct)
        => await ListAsync(await parties.PartyIdOfUserAsync(me.UserId, ct), ct);

    public async Task<PartyDocumentResponse> UploadMineAsync(UploadPartyDocumentRequest req, CancellationToken ct)
    {
        var partyId = await parties.PartyIdOfUserAsync(me.UserId, ct);
        var partyType = await db.Parties.Where(p => p.PartyId == partyId).Select(p => p.PartyType).SingleAsync(ct);
        RequireOrganization(partyType);

        var (bytes, contentType, extension, sha256) = await ReadDocumentAsync(req.File!, ct);
        var now = clock.GetUtcNow();
        StoredFile stored;
        await using (var stream = new MemoryStream(bytes, writable: false))
            stored = await files.SaveAsync(stream, "document" + extension, contentType, $"party-documents/{now:yyyy/MM}", ct);

        try
        {
            return await db.InTransactionAsync(async () =>
            {
                await audit.LockAsync(ct);
                var tracked = await db.Parties.SingleAsync(p => p.PartyId == partyId, ct);
                RequireOrganization(tracked.PartyType);
                if (await db.PartyDocuments.CountAsync(d => d.PartyId == partyId && d.RemovedAt == null, ct) >= MaxActiveDocuments)
                    throw new BusinessRuleException("party.documents_full", $"Mỗi đối tác gửi tối đa {MaxActiveDocuments} giấy tờ. Hãy xoá bớt giấy tờ cũ.");

                var doc = new PartyDocument
                {
                    PartyId = partyId, DocType = req.DocType, FileUri = stored.Uri, ContentType = contentType, Sha256 = sha256,
                    Note = string.IsNullOrWhiteSpace(req.Note) ? null : req.Note.Trim(), UploadedBy = me.UserId, UploadedAt = now,
                };
                db.PartyDocuments.Add(doc);
                // Gửi giấy tờ là nộp hồ sơ: đối tác chưa xác minh hoặc đã bị từ chối chuyển sang chờ Admin xem.
                if (tracked.VerificationStatus is "Unverified" or "Rejected")
                {
                    tracked.VerificationStatus = "Pending";
                    tracked.RejectReason = null;
                    tracked.UpdatedAt = now;
                }
                await db.SaveChangesAsync(ct);
                await audit.WriteAsync("party_document", doc.DocumentId, "upload", null, new { doc.PartyId, doc.DocType, doc.Sha256 }, ct);
                return new PartyDocumentResponse(doc.DocumentId, doc.DocType, doc.ContentType, doc.Note, doc.UploadedAt);
            }, ct);
        }
        catch
        {
            await files.DeleteAsync(stored.Uri, CancellationToken.None);
            throw;
        }
    }

    private async Task<(byte[] Bytes, string ContentType, string Extension, string Sha256)> ReadDocumentAsync(IFormFile file, CancellationToken ct)
    {
        if (!string.Equals(file.ContentType, "application/pdf", StringComparison.OrdinalIgnoreCase))
        {
            var image = await images.ReadAsync(file, ct);
            return (image.Bytes, image.ContentType, image.Extension, image.Sha256);
        }

        if (file.Length is <= 0 or > MaxPdfBytes)
            throw new AppException(400, "party.invalid_pdf", "Tệp PDF phải có dung lượng từ 1 byte đến 5 MB.");

        var bytes = new byte[(int)file.Length];
        await using var input = file.OpenReadStream();
        try
        {
            await input.ReadExactlyAsync(bytes, ct);
        }
        catch (EndOfStreamException)
        {
            throw new AppException(400, "party.invalid_pdf", "Tệp PDF chưa đầy đủ. Hãy thử tải lại.");
        }

        var end = bytes.Length;
        while (end > 0 && bytes[end - 1] is 0 or 9 or 10 or 12 or 13 or 32) end--;
        if (!bytes.AsSpan().StartsWith("%PDF-"u8) || !bytes.AsSpan(0, end).EndsWith("%%EOF"u8))
            throw new AppException(400, "party.invalid_pdf", "Tệp đã chọn không phải PDF hợp lệ hoặc bị thiếu dữ liệu.");

        return (bytes, "application/pdf", ".pdf", Convert.ToHexStringLower(SHA256.HashData(bytes)));
    }

    public async Task RemoveMineAsync(long documentId, CancellationToken ct)
    {
        await db.InTransactionAsync(async () =>
        {
            await audit.LockAsync(ct);
            var partyId = await parties.PartyIdOfUserAsync(me.UserId, ct);
            var doc = await db.PartyDocuments.SingleOrDefaultAsync(d => d.DocumentId == documentId && d.PartyId == partyId && d.RemovedAt == null, ct)
                      ?? throw new NotFoundException("party.document_not_found", "Không tìm thấy giấy tờ.");
            var party = await db.Parties.SingleAsync(p => p.PartyId == partyId, ct);
            // Giấy tờ là căn cứ của lần xác minh đã xong nên không xoá được nữa.
            if (party.LegalDossierVerified)
                throw new BusinessRuleException("party.document_locked", "Hồ sơ đã được xác minh nên không xoá giấy tờ được.");
            doc.RemovedAt = clock.GetUtcNow();
            await db.SaveChangesAsync(ct);
            await audit.WriteAsync("party_document", doc.DocumentId, "remove", new { doc.PartyId, doc.DocType }, null, ct);
        }, ct);
    }

    public async Task<(Stream Content, string ContentType)> MyFileAsync(long documentId, CancellationToken ct)
        => await FileAsync(await parties.PartyIdOfUserAsync(me.UserId, ct), documentId, ct);

    // ---------- Admin ----------
    public async Task<PartyDossierResponse> DossierAsync(long partyId, CancellationToken ct)
    {
        if (!await db.Parties.AnyAsync(p => p.PartyId == partyId, ct))
            throw new NotFoundException("party.not_found", "Không tìm thấy đối tác.");
        var users = await db.AppUsers.AsNoTracking().Where(u => u.PartyId == partyId).OrderBy(u => u.UserId)
            .Select(u => new
            {
                u.UserId, u.Email, u.FullName, u.Phone, u.Status,
                Roles = u.AppUserRoles.Select(r => r.RoleCode).ToList(),
                Investor = u.Investor == null ? null : u.Investor.VerificationStatus,
                Ekyc = db.KycChecks.Where(k => k.UserId == u.UserId && k.CheckType == "EkycIdFace").OrderByDescending(k => k.CheckedAt)
                    .Select(k => new { k.Result, k.CheckedAt, k.FailureReason }).FirstOrDefault(),
            })
            .ToListAsync(ct);
        var accounts = users.Select(u => new PartyAccountResponse(u.UserId, u.Email, u.FullName, u.Phone, u.Status, u.Roles.Order().ToList(),
            u.Investor, u.Ekyc?.Result, u.Ekyc?.CheckedAt, u.Ekyc?.FailureReason)).ToList();
        return new PartyDossierResponse(accounts, await ListAsync(partyId, ct));
    }

    public Task<(Stream Content, string ContentType)> AdminFileAsync(long partyId, long documentId, CancellationToken ct)
        => FileAsync(partyId, documentId, ct);

    private static void RequireOrganization(string partyType)
    {
        if (partyType == "Individual")
            throw new BusinessRuleException("party.documents_org_only",
                "Chỉ hộ kinh doanh hoặc doanh nghiệp mới gửi giấy tờ. Cá nhân xác minh bằng eKYC.");
    }

    private async Task<IReadOnlyList<PartyDocumentResponse>> ListAsync(long partyId, CancellationToken ct)
        => await db.PartyDocuments.AsNoTracking().Where(d => d.PartyId == partyId && d.RemovedAt == null).OrderBy(d => d.UploadedAt)
            .Select(d => new PartyDocumentResponse(d.DocumentId, d.DocType, d.ContentType, d.Note, d.UploadedAt)).ToListAsync(ct);

    private async Task<(Stream Content, string ContentType)> FileAsync(long partyId, long documentId, CancellationToken ct)
    {
        var doc = await db.PartyDocuments.AsNoTracking().SingleOrDefaultAsync(d => d.DocumentId == documentId && d.PartyId == partyId && d.RemovedAt == null, ct)
                  ?? throw new NotFoundException("party.document_not_found", "Không tìm thấy giấy tờ.");
        return (await files.OpenReadAsync(doc.FileUri, ct), doc.ContentType);
    }
}
