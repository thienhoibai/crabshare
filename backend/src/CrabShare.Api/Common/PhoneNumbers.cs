namespace CrabShare.Api.Common;

/// <summary>Số điện thoại Việt Nam viết theo nhiều cách ("0767201075", "+84767201075", "84 767 201 075") vẫn là một số.</summary>
public static class PhoneNumbers
{
    /// <summary>
    /// Mọi cách viết thường gặp của cùng một số, để so trùng với dữ liệu đã lưu theo cách người dùng gõ.
    /// Số không nhận ra được dạng Việt Nam thì chỉ trả về chính nó.
    /// </summary>
    public static IReadOnlyList<string> Variants(string phone)
    {
        var typed = phone.Trim();
        var digits = new string(typed.Where(char.IsDigit).ToArray());
        var national = typed.StartsWith('+') && digits.StartsWith("84") ? "0" + digits[2..]
            : digits.StartsWith("84") && digits.Length is 11 or 12 ? "0" + digits[2..]
            : digits.StartsWith('0') ? digits
            : null;
        if (national is null || national.Length < 9) return [typed];
        return new[] { typed, national, "+84" + national[1..], "84" + national[1..] }.Distinct().ToList();
    }
}
