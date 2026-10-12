import 'package:intl/intl.dart';

/// 12/10/2026 (giờ Việt Nam theo máy).
String formatDate(DateTime value) => DateFormat('dd/MM/yyyy').format(value.toLocal());

/// 12/10
String formatDayMonth(DateTime value) => DateFormat('dd/MM').format(value.toLocal());

/// 07:30
String formatTime(DateTime value) => DateFormat('HH:mm').format(value.toLocal());

/// "Thứ Hai, 12/10" — cần initializeDateFormatting('vi_VN') trong main().
String formatWeekday(DateTime value) {
  final text = DateFormat('EEEE, dd/MM', 'vi_VN').format(value.toLocal());
  return text[0].toUpperCase() + text.substring(1);
}

/// Khoảng thời gian tới hạn: "còn 45 phút", "còn 6 ngày", "quá hạn 2 giờ".
String formatDueIn(DateTime due, {DateTime? now}) {
  final diff = due.difference(now ?? DateTime.now());
  final overdue = diff.isNegative;
  final d = diff.abs();
  final text = d.inDays >= 1
      ? '${d.inDays} ngày'
      : d.inHours >= 1
          ? '${d.inHours} giờ'
          : '${d.inMinutes.clamp(1, 59)} phút';
  return overdue ? 'quá hạn $text' : 'còn $text';
}

/// "5 phút trước", "3 giờ trước", "2 ngày trước".
String formatAgo(DateTime past, {DateTime? now}) {
  final d = (now ?? DateTime.now()).difference(past);
  if (d.inMinutes < 1) return 'vừa xong';
  if (d.inHours < 1) return '${d.inMinutes} phút trước';
  if (d.inDays < 1) return '${d.inHours} giờ trước';
  return '${d.inDays} ngày trước';
}
