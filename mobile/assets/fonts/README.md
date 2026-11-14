# Bricolage Grotesque

App dùng cùng phông với web CrabShare. Không tải phông lúc chạy.

| Family trong `pubspec.yaml` | Tệp | Dùng cho |
|---|---|---|
| `Bricolage Grotesque` | `BricolageGrotesque-Regular/Medium/SemiBold/Bold/ExtraBold.ttf` (400–800) | Chữ thường, nút, nhãn |
| `Bricolage Grotesque Display` | `BricolageGrotesque-Variable.ttf` (trục `opsz`, `wdth`, `wght`) | Tiêu đề trang và con số lớn, dáng hẹp như web |

Nguồn:

- Các tệp tĩnh: kho của tác giả, https://github.com/ateliertriay/bricolage/tree/main/fonts/ttf
- Tệp biến thiên và giấy phép: kho Google Fonts, https://github.com/google/fonts/tree/main/ofl/bricolagegrotesque
  (đây cũng là tệp web đang tải từ Google Fonts)

Cả sáu tệp có đủ chữ tiếng Việt và ký hiệu ₫. Kiểu chữ dùng chung nằm ở `AppFonts` trong
`lib/app/theme/app_theme.dart`; không ghi tên family rải rác trong các màn.

Giấy phép SIL Open Font License 1.1; xem `OFL.txt`.
