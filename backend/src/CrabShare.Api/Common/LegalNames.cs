using System.Globalization;
using System.Text;

namespace CrabShare.Api.Common;

public static class LegalNames
{
    public static bool Match(string expected, string actual) =>
        !string.IsNullOrWhiteSpace(expected) && !string.IsNullOrWhiteSpace(actual) && Normalize(expected) == Normalize(actual);

    private static string Normalize(string name)
    {
        var characters = name.Trim().Replace('đ', 'd').Replace('Đ', 'D').Normalize(NormalizationForm.FormD)
            .Where(character => CharUnicodeInfo.GetUnicodeCategory(character) != UnicodeCategory.NonSpacingMark);
        return string.Join(' ', new string(characters.ToArray()).ToUpperInvariant()
            .Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
    }
}
