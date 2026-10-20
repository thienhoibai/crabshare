using System.ComponentModel.DataAnnotations;
using System.Text.RegularExpressions;
using CrabShare.Api.Features.Boxes;

namespace CrabShare.Api.Features.Production;

public sealed class StockingRequest : IValidatableObject
{
    public List<string>? SlotCodes { get; set; }
    public BoxRangeRequest? Range { get; set; }

    public IEnumerable<ValidationResult> Validate(ValidationContext context)
    {
        if ((SlotCodes is null) == (Range is null))
            yield return new("Chỉ chọn một trong slotCodes hoặc range.");
        if (SlotCodes is not null)
        {
            if (SlotCodes.Count == 0 || SlotCodes.Any(c => string.IsNullOrWhiteSpace(c) || c.Trim().Length > 30 ||
                !Regex.IsMatch(c.Trim(), "^[A-Za-z0-9 _-]+$")))
                yield return new("Danh sách phải có mã hộp hợp lệ (tối đa 30 ký tự).", [nameof(SlotCodes)]);
            if (SlotCodes.Select(c => c?.Trim()).Distinct(StringComparer.OrdinalIgnoreCase).Count() != SlotCodes.Count)
                yield return new("Không được chọn trùng mã hộp.", [nameof(SlotCodes)]);
        }
    }
}

public sealed record StockingResponse(string BatchCode, int CreatedCrabs, string Status);
