using System.Globalization;
using System.Text;

namespace CrabShare.Api.Common.Exports;

/// <summary>Excel UTF-8 CSV. Quote every field, neutralize spreadsheet formulas and preserve line breaks.</summary>
public static class CsvExport
{
    public static byte[] Encode(IEnumerable<IEnumerable<object?>> rows)
    {
        var text = new StringBuilder();
        foreach (var row in rows)
            text.AppendJoin(',', row.Select(Cell)).Append("\r\n");
        return [.. Encoding.UTF8.GetPreamble(), .. Encoding.UTF8.GetBytes(text.ToString())];
    }

    private static string Cell(object? value)
    {
        var text = value is IFormattable f ? f.ToString(null, CultureInfo.InvariantCulture) : value?.ToString() ?? "";
        if (value is string && text.TrimStart() is { Length: > 0 } trimmed && "=+-@".Contains(trimmed[0])) text = "'" + text;
        return '"' + text.Replace("\"", "\"\"") + '"';
    }
}
