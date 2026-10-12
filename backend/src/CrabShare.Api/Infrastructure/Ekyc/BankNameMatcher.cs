using System.Globalization;
using System.Text;

namespace CrabShare.Api.Infrastructure.Ekyc;

public interface IBankNameMatcher
{
    Task<BankNameMatchResult> MatchAsync(string expectedName, string holderName, CancellationToken ct);
}

public sealed record BankNameMatchResult(bool Matched, string ProviderReference);

/// <summary>Giả lập đối chiếu tên, không gọi ngân hàng. Bỏ dấu, hoa/thường và khoảng trắng thừa.</summary>
public sealed class FakeBankNameMatcher : IBankNameMatcher
{
    public Task<BankNameMatchResult> MatchAsync(string expectedName, string holderName, CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();
        return Task.FromResult(new BankNameMatchResult(Normalize(expectedName) == Normalize(holderName),
            $"FAKE-BANK-{Guid.NewGuid():N}"));
    }

    private static string Normalize(string name)
    {
        var chars = name.Trim().Replace('đ', 'd').Replace('Đ', 'D').Normalize(NormalizationForm.FormD)
            .Where(c => CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark);
        return string.Join(' ', new string(chars.ToArray()).ToUpperInvariant().Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
    }
}
