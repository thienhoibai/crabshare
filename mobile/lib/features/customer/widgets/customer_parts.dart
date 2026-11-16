import 'dart:async';

import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../app/theme/app_theme.dart';
import '../../../core/api/api_client.dart';
import '../../../core/format/dates.dart';
import '../../../core/format/money.dart';
import '../../../shared/widgets/app_parts.dart';
import '../../../shared/widgets/app_ui.dart';
import '../data/customer_models.dart';

/// Khối giao diện riêng của khu khách hàng, ghép từ bộ khối chung của ứng dụng.

/// Mở một địa chỉ bằng trình duyệt của máy. Test thay bằng hàm giả.
final webLauncherProvider = Provider<Future<bool> Function(Uri)>(
  (ref) =>
      (uri) => launchUrl(uri, mode: LaunchMode.externalApplication),
);

/// Trang chi tiết đơn trên web CrabShare, nơi có mã VietQR để chuyển khoản.
String orderWebPath(String orderNo) => '/khach/don/${Uri.encodeComponent(orderNo)}';

Future<void> openOnWeb(BuildContext context, WidgetRef ref, String path) async {
  final messenger = ScaffoldMessenger.of(context);
  var opened = false;
  try {
    opened = await ref.read(webLauncherProvider)(Uri.parse('$webUrl$path'));
  } catch (_) {
    opened = false;
  }
  if (!opened && messenger.mounted) {
    messenger.showSnackBar(const SnackBar(content: Text('Không mở được trình duyệt. Hãy thử lại.')));
  }
}

/// Dòng việc cần làm hoặc dòng chuyến giao: ô icon, tiêu đề, một dòng phụ, mũi tên.
class ActionRow extends StatelessWidget {
  const ActionRow({
    super.key,
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
    this.tone = AppColors.accentText,
  });
  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;
  final Color tone;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      onTap: onTap,
      padding: const EdgeInsets.all(12),
      child: Row(
        children: [
          IconTile(icon: icon, foreground: tone, background: tone.withValues(alpha: 0.12)),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, maxLines: 2, overflow: TextOverflow.ellipsis, style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 2),
                Text(subtitle, maxLines: 2, overflow: TextOverflow.ellipsis, style: Theme.of(context).textTheme.bodySmall),
              ],
            ),
          ),
          const Icon(Icons.chevron_right_rounded, color: AppColors.inkMuted),
        ],
      ),
    );
  }
}

/// Đếm ngược tới hạn: dưới một giờ thì hiện phút:giây, còn lại hiện ngày giờ của hạn.
class DueCountdown extends StatefulWidget {
  const DueCountdown({super.key, required this.deadline});
  final DateTime deadline;

  @override
  State<DueCountdown> createState() => _DueCountdownState();
}

class _DueCountdownState extends State<DueCountdown> {
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final left = widget.deadline.difference(DateTime.now());
    final String text;
    final Color color;
    if (left.isNegative) {
      text = 'Đã hết hạn';
      color = AppColors.danger;
    } else if (left.inHours >= 1) {
      text = 'Hạn ${formatDayTime(widget.deadline)} · ${formatDueIn(widget.deadline)}';
      color = AppColors.warning;
    } else {
      final minutes = left.inMinutes.toString().padLeft(2, '0');
      final seconds = (left.inSeconds % 60).toString().padLeft(2, '0');
      text = 'Còn $minutes:$seconds';
      color = AppColors.danger;
    }
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(Icons.schedule_rounded, size: 16, color: color),
        const SizedBox(width: 4),
        Flexible(
          child: Text(
            text,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(color: color, fontWeight: FontWeight.w600, fontSize: 13),
          ),
        ),
      ],
    );
  }
}

/// Thẻ khoản cần chuyển: số tiền, nội dung chuyển khoản có nút sao chép, hạn, nút mở web để quét VietQR.
class PayCard extends ConsumerWidget {
  const PayCard({
    super.key,
    required this.title,
    required this.amount,
    required this.orderNo,
    this.reference,
    this.deadline,
    this.primary = true,
  });
  final String title;
  final int amount;
  final String orderNo;
  final String? reference;
  final DateTime? deadline;

  /// false khi phía trên đã có một việc khác giữ nút chính của màn: nút mở web chuyển sang dạng viền.
  final bool primary;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final code = reference ?? '';
    void pay() => openOnWeb(context, ref, orderWebPath(orderNo));
    const icon = Icon(Icons.open_in_new_rounded, size: 18);
    const label = Text('Thanh toán trên web');
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              const IconTile(icon: Icons.account_balance_wallet_outlined),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: Theme.of(context).textTheme.titleMedium),
                    if (deadline != null) ...[const SizedBox(height: 2), DueCountdown(deadline: deadline!)],
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Text(formatVnd(amount), style: AppFonts.figure(32)),
          if (code.isNotEmpty) ...[
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.fromLTRB(14, 6, 4, 6),
              decoration: BoxDecoration(color: AppColors.background, borderRadius: BorderRadius.circular(AppRadius.chip)),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Nội dung chuyển khoản', style: Theme.of(context).textTheme.bodySmall),
                        Text(code, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, letterSpacing: 0.5)),
                      ],
                    ),
                  ),
                  IconButton(
                    tooltip: 'Sao chép',
                    icon: const Icon(Icons.copy_rounded),
                    onPressed: () async {
                      await Clipboard.setData(ClipboardData(text: code));
                      if (context.mounted) showAppToast(context, 'Đã sao chép nội dung chuyển khoản');
                    },
                  ),
                ],
              ),
            ),
          ],
          const SizedBox(height: 14),
          if (primary)
            FilledButton.icon(onPressed: pay, icon: icon, label: label)
          else
            OutlinedButton.icon(
              style: OutlinedButton.styleFrom(
                minimumSize: const Size.fromHeight(56),
                foregroundColor: AppColors.ink,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.pill)),
                textStyle: const TextStyle(fontFamily: AppFonts.text, fontSize: 16, fontWeight: FontWeight.w600),
              ),
              onPressed: pay,
              icon: icon,
              label: label,
            ),
        ],
      ),
    );
  }
}

/// Dãy nút chọn một trong vài giá trị (loại khiếu nại, vấn đề, đợt giao).
class PillChoice<T> extends StatelessWidget {
  const PillChoice({super.key, required this.options, required this.value, required this.onChanged});
  final List<(T, String)> options;
  final T? value;
  final ValueChanged<T> onChanged;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final (option, label) in options)
          Semantics(
            button: true,
            selected: option == value,
            child: Material(
              color: option == value ? AppColors.ink : AppColors.surface,
              borderRadius: BorderRadius.circular(AppRadius.pill),
              clipBehavior: Clip.antiAlias,
              child: InkWell(
                onTap: () => onChanged(option),
                child: ConstrainedBox(
                  constraints: const BoxConstraints(minHeight: 48),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 18),
                    child: Center(
                      widthFactor: 1,
                      child: Text(
                        label,
                        style: TextStyle(fontWeight: FontWeight.w600, color: option == value ? Colors.white : AppColors.ink),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }
}
