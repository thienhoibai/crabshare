using System.Text;
using SkiaSharp;

namespace CrabShare.Api.Features.Contracts;

/// <summary>
/// Dựng file PDF hợp đồng từ mẫu Markdown đã điền dữ liệu (TH-08), bằng SkiaSharp có sẵn trong dự án (không thêm thư viện).
/// Mẫu chỉ dùng vài cú pháp: <c>#</c> tiêu đề, <c>##</c> mục, <c>&gt;</c> ghi chú, <c>-</c> gạch đầu dòng, còn lại là đoạn văn.
/// Font Plus Jakarta Sans (giấy phép OFL, có đủ dấu tiếng Việt) nằm trong Reference/Fonts của project (bản sao font web), copy ra output khi build.
/// Thời điểm trong metadata lấy theo lúc lập hợp đồng, nên cùng dữ liệu cho cùng một file.
/// </summary>
public sealed class ContractPdfRenderer
{
    private const float PageWidth = 595, PageHeight = 842, Margin = 56, FooterY = PageHeight - 32;
    private const float ContentWidth = PageWidth - 2 * Margin;

    private static readonly SKColor Ink = new(0x1F, 0x29, 0x37), Muted = new(0x6B, 0x72, 0x80), Warn = new(0xB4, 0x23, 0x18);
    private readonly SKTypeface regular = Load("jakarta-400.ttf");
    private readonly SKTypeface bold = Load("jakarta-700.ttf");

    /// <summary>Bản nháp hợp đồng: thông báo bản demo, khung thông tin hợp đồng, nội dung mẫu đã điền, chỗ ký.</summary>
    public byte[] Render(ContractDocument doc)
    {
        var lines = Layout(doc);
        var pages = lines.Max(l => l.Page) + 1;
        using var output = new MemoryStream();
        var meta = SKDocumentPdfMetadata.Default;
        meta.Title = $"Hợp đồng {doc.ContractNo}";
        meta.Subject = $"Hợp đồng hợp tác theo mẫu {doc.TemplateVersion}";
        meta.Author = "CrabShare (điều phối, không là một bên)";
        meta.Creator = meta.Producer = "CrabShare";
        meta.Creation = meta.Modified = doc.CreatedAt.UtcDateTime;
        using (var pdf = SKDocument.CreatePdf(output, meta))
        {
            for (var page = 0; page < pages; page++)
            {
                var canvas = pdf.BeginPage(PageWidth, PageHeight);
                foreach (var line in lines.Where(l => l.Page == page))
                {
                    if (line.Box is { } box)
                    {
                        using var fill = new SKPaint { Color = new SKColor(0xFE, 0xF2, 0xF2), Style = SKPaintStyle.Fill };
                        using var stroke = new SKPaint { Color = Warn, Style = SKPaintStyle.Stroke, StrokeWidth = 1 };
                        canvas.DrawRect(box, fill);
                        canvas.DrawRect(box, stroke);
                        continue;
                    }
                    using var font = new SKFont(line.Bold ? bold : regular, line.Size);
                    using var paint = new SKPaint { Color = line.Color, IsAntialias = true };
                    canvas.DrawText(line.Text, line.X, line.Y, SKTextAlign.Left, font, paint);
                }
                using var footerFont = new SKFont(regular, 8);
                using var footerPaint = new SKPaint { Color = Muted, IsAntialias = true };
                canvas.DrawText($"Hợp đồng {doc.ContractNo} · Mẫu {doc.TemplateVersion} · Trang {page + 1}/{pages}",
                    Margin, FooterY, SKTextAlign.Left, footerFont, footerPaint);
                pdf.EndPage();
            }
            pdf.Close();
        }
        return output.ToArray();
    }

    private sealed record Line(int Page, float X, float Y, string Text, float Size, bool Bold, SKColor Color, SKRect? Box = null);

    private List<Line> Layout(ContractDocument doc)
    {
        var lines = new List<Line>();
        var page = 0;
        var y = Margin;

        void NewPageIfNeeded(float height)
        {
            if (y + height <= FooterY - 24) return;
            page++;
            y = Margin;
        }

        void Paragraph(string text, float size, bool isBold, SKColor color, float indent = 0, string? bullet = null, float after = 4)
        {
            using var font = new SKFont(isBold ? bold : regular, size);
            var lead = size * 1.45f;
            var first = true;
            foreach (var row in Wrap(text, font, ContentWidth - indent))
            {
                NewPageIfNeeded(lead);
                y += lead;
                if (first && bullet is not null) lines.Add(new Line(page, Margin + indent - 10, y, bullet, size, false, color));
                lines.Add(new Line(page, Margin + indent, y, row, size, isBold, color));
                first = false;
            }
            y += after;
        }

        // Thông báo bản demo (TH-08: ghi rõ trên PDF mẫu chưa rà soát pháp lý)
        const float boxHeight = 44;
        lines.Add(new Line(page, 0, 0, "", 0, false, Warn, SKRect.Create(Margin, y, ContentWidth, boxHeight)));
        y += 4;
        Paragraph("BẢN DEMO CỦA ĐỒ ÁN — MẪU HỢP ĐỒNG CHƯA ĐƯỢC RÀ SOÁT PHÁP LÝ", 9.5f, true, Warn, 10, after: 0);
        Paragraph("Chỉ dùng để minh hoạ luồng ký số; không có giá trị pháp lý.", 9, false, Warn, 10, after: 0);
        y = Margin + boxHeight + 14;

        Paragraph($"Số hợp đồng: {doc.ContractNo}", 10, true, Ink, after: 0);
        Paragraph($"Lập lúc: {doc.CreatedAt.ToOffset(TimeSpan.FromHours(7)):dd/MM/yyyy HH:mm} (giờ Việt Nam) · Mẫu {doc.TemplateVersion} (SHA-256 {doc.TemplateHash[..16]}…)",
            9, false, Muted, after: 10);

        foreach (var raw in doc.Body.Replace("\r\n", "\n").Split('\n'))
        {
            var text = raw.TrimEnd();
            if (text.Length == 0) { y += 4; continue; }
            if (text.StartsWith("## "))
            {
                // Tiêu đề mục đi cùng ít nhất hai dòng nội dung, không đứng một mình cuối trang
                y += 6;
                NewPageIfNeeded(12 * 1.45f + 2 * 10.5f * 1.45f + 2);
                Paragraph(text[3..], 12, true, Ink, after: 2);
            }
            else if (text.StartsWith("# ")) Paragraph(text[2..], 16, true, Ink, after: 6);
            else if (text.StartsWith("> ")) Paragraph(text[2..], 9, false, Muted, 8);
            else if (text.StartsWith("- ")) Paragraph(text[2..], 10.5f, false, Ink, 14, "•", 1);
            else Paragraph(text, 10.5f, false, Ink);
        }

        // Chỗ ký: chữ ký số do dịch vụ ký gắn vào chính file này, người nuôi trước, nhà đầu tư sau (TL-19)
        y += 14;
        NewPageIfNeeded(90);
        Paragraph("Chữ ký của các bên", 12, true, Ink, after: 2);
        Paragraph($"Bên A — {doc.OperatorName}: ký số thứ nhất.", 10.5f, false, Ink, after: 0);
        Paragraph($"Bên B — {doc.InvestorName}: ký số thứ hai, trên đúng file Bên A đã ký.", 10.5f, false, Ink, after: 4);
        Paragraph("CrabShare chỉ điều phối việc ký, không ký thay và không là một bên của hợp đồng. Bản đủ hai chữ ký được lưu nguyên vẹn kèm mã băm SHA-256.",
            9, false, Muted);
        return lines;
    }

    /// <summary>Ngắt dòng theo từ cho vừa độ rộng; từ quá dài (mã băm) thì cắt theo ký tự.</summary>
    private static IEnumerable<string> Wrap(string text, SKFont font, float width)
    {
        var current = new StringBuilder();
        foreach (var word in text.Normalize(NormalizationForm.FormC).Split(' ', StringSplitOptions.RemoveEmptyEntries))
        {
            var candidate = current.Length == 0 ? word : current + " " + word;
            if (font.MeasureText(candidate) <= width) { current.Clear().Append(candidate); continue; }
            if (current.Length > 0) { yield return current.ToString(); current.Clear(); }
            var rest = word;
            while (font.MeasureText(rest) > width)
            {
                var cut = rest.Length - 1;
                while (cut > 1 && font.MeasureText(rest[..cut]) > width) cut--;
                yield return rest[..cut];
                rest = rest[cut..];
            }
            current.Append(rest);
        }
        if (current.Length > 0) yield return current.ToString();
    }

    private static SKTypeface Load(string file)
    {
        var path = Path.Combine(AppContext.BaseDirectory, "Reference", "Fonts", file);
        return SKTypeface.FromFile(path) ?? throw new FileNotFoundException("Thiếu font dựng PDF hợp đồng.", path);
    }
}

/// <param name="Body">Nội dung mẫu Markdown đã điền dữ liệu.</param>
public sealed record ContractDocument(
    string ContractNo, string TemplateVersion, string TemplateHash, DateTimeOffset CreatedAt,
    string OperatorName, string InvestorName, string Body);
