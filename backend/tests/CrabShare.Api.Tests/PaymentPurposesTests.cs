using CrabShare.Api.Features.Payments;

namespace CrabShare.Api.Tests;

public class PaymentPurposesTests
{
    // Đủ 6 giá trị của ck_payment_request_purpose
    private static readonly string[] All =
    [
        PaymentPurposes.Contribution, PaymentPurposes.OrderPayment, PaymentPurposes.PreOrderDeposit,
        PaymentPurposes.PreOrderBalance, PaymentPurposes.OfftakeDeposit, PaymentPurposes.OfftakePayment,
    ];

    [Fact]
    public void Moi_muc_dich_co_tien_to_rieng_hai_chu_in_hoa()
    {
        var prefixes = All.Select(PaymentPurposes.Prefix).ToList();

        Assert.Equal(All.Length, prefixes.Distinct().Count());
        Assert.All(prefixes, p => Assert.Matches("^[A-Z]{2}$", p));
        Assert.Equal("GV", PaymentPurposes.Prefix(PaymentPurposes.Contribution));
        Assert.Equal("OD", PaymentPurposes.Prefix(PaymentPurposes.OrderPayment));
    }

    [Fact]
    public void Muc_dich_la_thi_bao_loi()
        => Assert.Throws<ArgumentException>(() => PaymentPurposes.Prefix("Donation"));
}
