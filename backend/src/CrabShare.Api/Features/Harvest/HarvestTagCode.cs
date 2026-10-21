using System.Security.Cryptography;

namespace CrabShare.Api.Features.Harvest;

public interface IHarvestTagCodeGenerator { string NewCode(); }

public sealed class HarvestTagCodeGenerator : IHarvestTagCodeGenerator
{
    public const int Length = 12;
    public const string Alphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
    public string NewCode() => new(RandomNumberGenerator.GetItems<char>(Alphabet, Length));
}
