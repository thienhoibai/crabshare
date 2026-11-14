using CrabShare.Api.Common;
using CrabShare.Api.Common.Errors;

namespace CrabShare.Api.Tests;

/// <summary>Lời báo lỗi cho người dùng không được chép nguyên thông báo của SQL Server (tên bảng, tên chỉ mục, giá trị bị trùng).</summary>
public class FriendlyErrorTests
{
    private const string PhoneDuplicate =
        "Cannot insert duplicate key row in object 'dbo.app_user' with unique index 'ux_app_user_phone'. The duplicate key value is (+84767201075).";

    [Fact]
    public void A_duplicate_phone_is_explained_without_database_names_or_the_value()
    {
        var text = GlobalExceptionHandler.DuplicateMessage(PhoneDuplicate);

        Assert.Equal("Số điện thoại này đã được dùng cho một tài khoản khác.", text);
        Assert.DoesNotContain("dbo", text);
        Assert.DoesNotContain("ux_", text);
        Assert.DoesNotContain("84767201075", text);
    }

    [Fact]
    public void A_unique_key_constraint_is_recognised_too()
        => Assert.Equal("Mã địa điểm này đã được dùng.", GlobalExceptionHandler.DuplicateMessage(
            "Violation of UNIQUE KEY constraint 'ux_party_site_code'. Cannot insert duplicate key in object 'dbo.party_site'. The duplicate key value is (7, KHO-01)."));

    [Theory]
    [InlineData("Cannot insert duplicate key row in object 'dbo.something' with unique index 'ux_not_listed'. The duplicate key value is (bí mật).")]
    [InlineData("một thông báo lạ không theo mẫu nào")]
    public void Anything_else_gets_a_general_sentence_that_leaks_nothing(string sqlMessage)
    {
        var text = GlobalExceptionHandler.DuplicateMessage(sqlMessage);

        Assert.Equal("Thông tin này đã có trong hệ thống. Hãy kiểm tra lại dữ liệu vừa nhập.", text);
    }

    [Theory]
    [InlineData("0767201075")]
    [InlineData("+84767201075")]
    [InlineData("84 767 201 075")]
    [InlineData("0767.201.075")]
    public void One_vietnamese_number_written_in_any_usual_way_matches_the_same_stored_forms(string typed)
    {
        var variants = PhoneNumbers.Variants(typed);

        Assert.Contains("0767201075", variants);
        Assert.Contains("+84767201075", variants);
        Assert.Contains(typed.Trim(), variants);
    }

    [Fact]
    public void A_number_that_is_not_recognised_is_only_compared_as_typed()
        => Assert.Equal(["12345"], PhoneNumbers.Variants(" 12345 "));
}
