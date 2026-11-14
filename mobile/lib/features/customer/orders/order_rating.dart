import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import '../../../app/theme/app_theme.dart';
import '../../../shared/widgets/app_parts.dart';
import '../../../shared/widgets/app_ui.dart';
import '../data/customer_providers.dart';

/// Đánh giá đơn đã giao: bấm một ngôi sao rồi xác nhận. Mỗi đơn một lần.
/// API chưa trả lại đánh giá đã gửi nên số sao được nhớ trên máy này.
class OrderRatingCard extends ConsumerStatefulWidget {
  const OrderRatingCard({super.key, required this.orderNo});
  final String orderNo;

  @override
  ConsumerState<OrderRatingCard> createState() => _OrderRatingCardState();
}

class _OrderRatingCardState extends ConsumerState<OrderRatingCard> {
  bool _busy = false;

  Future<void> _rate(int stars) async {
    final comment = await showConfirmSheet(
      context,
      title: 'Gửi đánh giá $stars sao',
      message: 'Mỗi đơn đánh giá một lần, gửi rồi không sửa được.',
      confirmLabel: 'Gửi đánh giá',
      reasonLabel: 'Nhận xét (không bắt buộc)',
    );
    if (comment == null || !mounted) return;
    setState(() => _busy = true);
    try {
      await ref.read(customerActionsProvider).rate(widget.orderNo, stars: stars, comment: comment);
      if (mounted) showAppToast(context, 'Cảm ơn bạn đã đánh giá.');
    } catch (error) {
      if (mounted) showAppToast(context, customerErrorMessage(error), error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final saved = ref.watch(orderRatingProvider(widget.orderNo)).value;
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(saved == null ? 'Đánh giá đơn' : 'Bạn đã đánh giá', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 4),
          Row(
            children: [
              for (var n = 1; n <= 5; n++)
                IconButton(
                  tooltip: '$n sao',
                  iconSize: 34,
                  onPressed: saved != null || _busy ? null : () => _rate(n),
                  icon: Icon(
                    n <= (saved ?? 0) ? Icons.star_rounded : Icons.star_outline_rounded,
                    color: n <= (saved ?? 0) ? AppColors.accent : AppColors.inkMuted,
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}
