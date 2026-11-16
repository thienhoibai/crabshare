import 'package:material_ui/material_ui.dart';

/// Bảng màu theo mẫu thiết kế (nền be ấm, nhấn cam, thanh điều hướng tối).
/// Muốn đổi màu toàn app thì chỉ sửa ở đây.
abstract final class AppColors {
  static const background = Color(0xFFEFEAE4); // nền be ấm
  static const surface = Color(0xFFFFFFFF); // thẻ trắng
  static const surfaceMuted = Color(0xFFE8E3DD); // ô xám nhạt (thanh "+", phân đoạn chưa đầy)
  static const accent = Color(0xFFF4925C); // cam chủ đạo
  static const accentSoft = Color(0xFFFCE3D4); // cam rất nhạt (nền chip, vệt gradient)
  static const accentText = Color(0xFFEF7A3E); // chữ cam (35% of goal)
  static const ink = Color(0xFF151413); // chữ đậm
  static const inkMuted = Color(0xFF8C8681); // chữ phụ
  static const nav = Color(0xFF1D1C1B); // thanh điều hướng dưới
  static const success = Color(0xFF3FA36B);
  static const danger = Color(0xFFD9534F);
  static const warning = Color(0xFFE29A17); // cần chú ý, chờ xử lý
  static const info = Color(0xFF3B8FD9); // thông tin, đang chạy
}

abstract final class AppRadius {
  static const card = 22.0;
  static const chip = 18.0;
  static const pill = 30.0;
}

/// Phông chữ của app: Bricolage Grotesque, cùng phông với web. Mọi màn lấy kiểu chữ ở đây,
/// không ghi tên family rải rác.
abstract final class AppFonts {
  /// Chữ thường, nút, nhãn: các tệp tĩnh 400–800.
  static const text = 'Bricolage Grotesque';

  /// Tiêu đề trang và con số lớn: tệp biến thiên, chỉnh được độ hẹp và cỡ quang học.
  static const display = 'Bricolage Grotesque Display';

  /// Tiêu đề trang, cùng dáng với tiêu đề của web (hẹp vừa, đậm vừa, chữ khít).
  static TextStyle heading(double size) => TextStyle(
    fontFamily: display,
    fontSize: size,
    fontWeight: FontWeight.w600,
    fontVariations: const [FontVariation('wght', 600), FontVariation('wdth', 88), FontVariation('opsz', 96)],
    letterSpacing: -0.025 * size, // web dùng -0.035em; trên màn nhỏ nới ra một chút cho dễ đọc
    height: 1.05,
  );

  /// Con số lớn (tiền, cân nặng, số đếm), cùng dáng với số lớn của web: hẹp, đậm, số thẳng cột.
  static TextStyle figure(double size, {Color? color}) => TextStyle(
    fontFamily: display,
    fontSize: size,
    fontWeight: FontWeight.w700,
    fontVariations: const [FontVariation('wght', 700), FontVariation('wdth', 80), FontVariation('opsz', 96)],
    fontFeatures: const [FontFeature.tabularFigures()],
    letterSpacing: -0.012 * size, // các chữ số không được chạm nhau
    color: color,
  );
}

/// Bricolage Grotesque (đủ chữ tiếng Việt) được đóng gói trong assets, dùng cùng theme khi chạy app và test.
ThemeData buildAppTheme() {
  final base = ThemeData(
    useMaterial3: true,
    fontFamily: AppFonts.text,
    colorScheme: ColorScheme.fromSeed(
      seedColor: AppColors.accent,
      primary: AppColors.accent,
      surface: AppColors.surface,
    ),
    scaffoldBackgroundColor: AppColors.background,
  );
  final text = base.textTheme.apply(bodyColor: AppColors.ink, displayColor: AppColors.ink);
  const buttonText = TextStyle(fontFamily: AppFonts.text, fontSize: 16, fontWeight: FontWeight.w600);
  return base.copyWith(
    textTheme: text.copyWith(
      displaySmall: text.displaySmall?.merge(AppFonts.heading(36)),
      headlineMedium: text.headlineMedium?.merge(AppFonts.heading(28)),
      headlineSmall: text.headlineSmall?.merge(AppFonts.heading(24)),
      titleLarge: text.titleLarge?.copyWith(fontWeight: FontWeight.w700),
      titleMedium: text.titleMedium?.copyWith(fontWeight: FontWeight.w600),
      bodySmall: text.bodySmall?.copyWith(color: AppColors.inkMuted),
    ),
    appBarTheme: const AppBarTheme(backgroundColor: Colors.transparent, elevation: 0, foregroundColor: AppColors.ink),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: AppColors.surface,
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(AppRadius.chip), borderSide: BorderSide.none),
      contentPadding: const EdgeInsets.symmetric(horizontal: 18, vertical: 16),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: AppColors.ink,
        foregroundColor: Colors.white,
        minimumSize: const Size.fromHeight(56),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.pill)),
        textStyle: buttonText,
      ),
    ),
  );
}
