using CrabShare.Api.Infrastructure.Persistence.Entities;

namespace CrabShare.Api.Features.Batches;

// Chỉ kiểm tra dữ liệu vốn và hợp đồng; việc chốt vốn do module Funding thực hiện.
internal static class FundingReadiness
{
    // Bên gọi cần tải Contributions cùng InvestmentContract trước khi dùng hàm này.
    internal static DateTimeOffset? ReadyAt(Batch batch)
    {
        if (batch.CapitalClosedAt is not { } closed || batch.TotalConfirmedCapital is not { } total || total < batch.MinViableCapital)
        {
            return null;
        }

        var confirmed = batch.Contributions.Where(c => c.Status == "Confirmed").ToList();
        if (confirmed.Count == 0 || confirmed.Sum(c => c.Amount) != total ||
            confirmed.Any(c => c.InvestmentContract is not { Status: "FullySigned", FullySignedAt: not null }))
        {
            return null;
        }

        var lastSigned = confirmed.Max(c => c.InvestmentContract!.FullySignedAt!.Value);
        // Chỉ sẵn sàng sau cả hai mốc: chốt vốn và chữ ký cuối cùng.
        return lastSigned > closed ? lastSigned : closed;
    }

    internal static string? StockingBlockedReason(Batch batch, DateTimeOffset now, bool hasRegistry)
    {
        if (batch.StockedAt is not null || hasRegistry)
        {
            return "Lô đã có dữ liệu thả giống; không thể ghi nhận lần hai.";
        }

        if (batch.Status != "Funding")
        {
            return "Chỉ lô Funding đã chốt đủ vốn và hoàn tất hợp đồng được thả giống.";
        }

        if (ReadyAt(batch) is not { } ready || ready > now)
        {
            return "Lô chưa hoàn tất chốt vốn và hợp đồng: cần đủ vốn khả thi, tổng vốn khớp và mọi hợp đồng đã ký đầy đủ.";
        }

        return null;
    }
}
