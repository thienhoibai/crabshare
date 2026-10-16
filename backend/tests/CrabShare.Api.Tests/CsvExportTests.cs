using System.Text;
using CrabShare.Api.Common.Exports;

namespace CrabShare.Api.Tests;

public class CsvExportTests
{
    [Fact]
    public void Excel_csv_preserves_utf8_quotes_lines_integer_money_and_neutralizes_formulas()
    {
        var bytes = CsvExport.Encode([new object?[] { "Cảnh báo", "a,\"b\"\nc", "  =HYPERLINK(\"x\")", "+123", -15L, 25000001L, null }]);
        Assert.True(bytes.AsSpan().StartsWith(Encoding.UTF8.GetPreamble()));
        Assert.Equal("\"Cảnh báo\",\"a,\"\"b\"\"\nc\",\"'  =HYPERLINK(\"\"x\"\")\",\"'+123\",\"-15\",\"25000001\",\"\"\r\n", Encoding.UTF8.GetString(bytes[3..]));
    }
}
