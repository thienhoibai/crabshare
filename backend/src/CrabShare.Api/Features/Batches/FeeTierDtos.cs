using System.ComponentModel.DataAnnotations;
using System.Data;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Batches;

public sealed class FeeTierRequest : IValidatableObject
{
    [Required, StringLength(20), RegularExpression("^[A-Za-z0-9_-]+$")] public string TierCode { get; set; } = "";
    [Range(typeof(long), "0", "999999999999999999")] public long MinCapital { get; set; }
    [Range(typeof(long), "0", "999999999999999999")] public long? MaxCapital { get; set; }
    public bool MinInclusive { get; set; } = true;
    public bool MaxInclusive { get; set; }
    [Range(typeof(long), "0", "999999999999999999")] public long FeeAmount { get; set; }
    public DateOnly EffectiveFrom { get; set; }
    public DateOnly? EffectiveTo { get; set; }
    public IEnumerable<ValidationResult> Validate(ValidationContext context)
    {
        if (MaxCapital is not null && MaxCapital <= MinCapital) yield return new("Cận trên phải lớn hơn cận dưới.");
        if (EffectiveFrom == default || EffectiveTo < EffectiveFrom) yield return new("Khoảng ngày hiệu lực không hợp lệ.");
    }
}
public sealed record FeeTierResponse(long FeeTierId, string TierCode, long MinCapital, long? MaxCapital, bool MinInclusive,
    bool MaxInclusive, long FeeAmount, DateOnly EffectiveFrom, DateOnly? EffectiveTo);

