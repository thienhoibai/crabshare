using CrabShare.Api.Common;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Accounts;

public sealed record PayoutRecipient(string LegalName, bool Verified, string VerificationMethod);

/// <summary>BR-012–013: cùng một căn cứ xác minh khi khai tài khoản và khi gửi lệnh chi.</summary>
public sealed class PayoutRecipientService(AppDbContext db)
{
    public async Task<PayoutRecipient> ForUserAsync(long userId, CancellationToken ct)
    {
        var user = await db.AppUsers.AsNoTracking().Include(u => u.Investor)
            .SingleOrDefaultAsync(u => u.UserId == userId, ct)
            ?? throw new NotFoundException("payment.recipient_not_found", "Không tìm thấy người nhận tiền.");
        var party = await db.Parties.AsNoTracking().SingleOrDefaultAsync(p => p.PartyId == user.PartyId, ct);
        var organization = party is null ? user.Investor?.InvestorKind == "Organization" : party.PartyType != "Individual";
        if (organization)
            return new(party?.LegalName ?? user.Investor?.OrganizationName ?? user.FullName,
                user.Status == "Active" && party?.LegalDossierVerified == true, "LegalDossier");

        // Tài khoản cũ chưa gắn Party vẫn dùng tên và kết quả xác minh của chính tài khoản đó.
        return new(party?.LegalName ?? user.FullName,
            user.Status == "Active" && user.Investor?.VerificationStatus == "Verified" &&
            (party is null || party.VerificationStatus == "Verified" ||
             (party.VerificationStatus == "Unverified" && LegalNames.Match(party.LegalName, user.FullName))), "Ekyc");
    }

    public async Task<PayoutRecipient> ForOperatorAsync(long operatorId, CancellationToken ct)
    {
        var farm = await db.Operators.AsNoTracking().SingleOrDefaultAsync(o => o.OperatorId == operatorId, ct)
            ?? throw new NotFoundException("payment.recipient_not_found", "Không tìm thấy người nhận tiền.");
        var party = await db.Parties.AsNoTracking().SingleOrDefaultAsync(p => p.PartyId == farm.PartyId, ct);
        return new(party?.LegalName ?? farm.LegalName,
            farm.Status == "Approved" && (party is null || party.VerificationStatus == "Verified") &&
            (party is null || LegalNames.Match(party.LegalName, farm.LegalName)), "OperatorDossier");
    }
}
