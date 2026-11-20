using CrabShare.Api.Common;

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
        return Task.FromResult(new BankNameMatchResult(LegalNames.Match(expectedName, holderName),
            $"FAKE-BANK-{Guid.NewGuid():N}"));
    }

}
