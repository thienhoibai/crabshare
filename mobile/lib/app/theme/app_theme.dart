import 'package:material_ui/material_ui.dart';
import 'package:google_fonts/google_fonts.dart';

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
}

abstract final class AppRadius {
  static const card = 22.0;
  static const chip = 18.0;
  static const pill = 30.0;
}

/// [googleFonts] = false dùng trong test (test không tải font qua mạng được).
ThemeData buildAppTheme({bool googleFonts = true}) {
  final base = ThemeData(
    useMaterial3: true,
    colorScheme: ColorScheme.fromSeed(
      seedColor: AppColors.accent,
      primary: AppColors.accent,
      surface: AppColors.surface,
    ),
    scaffoldBackgroundColor: AppColors.background,
  );
  final text = (googleFonts ? GoogleFonts.dmSansTextTheme(base.textTheme) : base.textTheme)
      .apply(bodyColor: AppColors.ink, displayColor: AppColors.ink);
  const buttonText = TextStyle(fontSize: 16, fontWeight: FontWeight.w600);
  return base.copyWith(
    textTheme: text.copyWith(
      displaySmall: text.displaySmall?.copyWith(fontWeight: FontWeight.w700, letterSpacing: -1.2, height: 1.05),
      headlineMedium: text.headlineMedium?.copyWith(fontWeight: FontWeight.w700, letterSpacing: -0.6),
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
        textStyle: googleFonts ? GoogleFonts.dmSans(textStyle: buttonText) : buttonText,
      ),
    ),
  );
}
