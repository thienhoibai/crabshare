using System;
using System.Collections.Generic;

namespace CrabShare.Api.Infrastructure.Persistence.Entities;

public partial class VInvestorPortfolio
{
    public long InvestorId { get; set; }

    public string FullName { get; set; } = null!;

    public long BatchId { get; set; }

    public string BatchCode { get; set; } = null!;

    public string BatchStatus { get; set; } = null!;

    public decimal ConfirmedAmount { get; set; }

    public decimal? CapitalRatio { get; set; }

    public string? SettlementStatus { get; set; }

    public decimal? CapitalReturn { get; set; }

    public decimal? ProfitShare { get; set; }

    public decimal? TaxWithheld { get; set; }

    public decimal? NetPayout { get; set; }

    public decimal? InKindQtyKg { get; set; }
}
