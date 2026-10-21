using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Contracts;

/// <summary>
/// Hợp đồng chưa đủ chữ ký của khoản góp không còn hiệu lực (hết hạn giữ chỗ, nhà đầu tư huỷ giữ chỗ, lô huỷ vì thiếu vốn) → Void.
/// Hợp đồng đã FullySigned giữ nguyên làm hồ sơ. Gọi BÊN TRONG transaction của module (đã khoá chuỗi audit).
/// </summary>
public static class ContractVoiding
{
    public static async Task<int> VoidUnsignedAsync(AppDbContext db, IAuditLog audit, IReadOnlyCollection<long> contributionIds,
        string reason, DateTimeOffset now, CancellationToken ct)
    {
        if (contributionIds.Count == 0) return 0;
        var contracts = await db.InvestmentContracts
            .Where(c => contributionIds.Contains(c.ContributionId)
                        && (c.Status == ContractStatuses.Draft || c.Status == ContractStatuses.OperatorSigned))
            .ToListAsync(ct);
        foreach (var contract in contracts)
        {
            var before = contract.Status;
            contract.Status = ContractStatuses.Void;
            contract.UpdatedAt = now;
            await audit.WriteAsync("investment_contract", contract.ContractId, "void", new { status = before },
                new { status = contract.Status, reason, contract.ContributionId }, now, ct);
        }
        return contracts.Count;
    }
}
