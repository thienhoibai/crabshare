import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import '../../../app/theme/app_theme.dart';
import '../../../core/format/dates.dart';
import '../../../core/format/money.dart';
import '../../../shared/status_labels.dart';
import '../../../shared/widgets/app_parts.dart';
import '../../../shared/widgets/app_ui.dart';
import '../data/customer_models.dart';
import '../data/customer_providers.dart';
import '../data/customer_repository.dart';

/// Một khiếu nại: ảnh và mô tả đã gửi, phản hồi của người nuôi, và câu trả lời của khách (Đồng ý / Không đồng ý).
class ClaimDetailPage extends ConsumerStatefulWidget {
  const ClaimDetailPage({super.key, required this.claimNo});
  final String claimNo;

  @override
  ConsumerState<ClaimDetailPage> createState() => _ClaimDetailPageState();
}

class _ClaimDetailPageState extends ConsumerState<ClaimDetailPage> {
  bool _busy = false;

  Future<void> _reply(Claim claim, bool agree) async {
    final accepted = claim.status == 'OperatorAccepted';
    final ok = await showConfirmSheet(
      context,
      title: agree ? 'Đồng ý với người nuôi' : 'Chuyển cho Admin quyết định',
      message: !agree
          ? 'Quyết định của Admin là quyết định cuối cùng.'
          : accepted
          ? 'Khiếu nại được chấp nhận và bạn được hoàn tiền phần bị ảnh hưởng.'
          : 'Khiếu nại đóng lại, không có tiền hoàn.',
      confirmLabel: agree ? 'Đồng ý và chốt' : 'Chuyển Admin',
    );
    if (ok == null || !mounted) return;
    setState(() => _busy = true);
    try {
      final updated = await ref.read(customerActionsProvider).replyClaim(claim, agree: agree);
      if (mounted) {
        showAppToast(context, updated.status == 'Escalated' ? 'Đã chuyển khiếu nại cho Admin quyết định.' : 'Đã chốt khiếu nại.');
      }
    } catch (error) {
      if (mounted) showAppToast(context, customerErrorMessage(error), error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    const header = SubPageHeader(title: 'Khiếu nại');
    return Scaffold(
      body: SafeArea(
        child: AsyncContent<Claim>(
          value: ref.watch(claimProvider(widget.claimNo)),
          onRefresh: () => ref.refresh(claimProvider(widget.claimNo).future),
          header: const Padding(padding: EdgeInsets.fromLTRB(20, 12, 20, 0), child: header),
          data: (c) => ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
            children: [
              header,
              const SizedBox(height: 14),
              AppCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    StatusPill(kind: 'claim', value: c.status),
                    const SizedBox(height: 8),
                    Text(
                      [statusLabel('issueType', c.issueType), if (c.affected.isNotEmpty) c.affected].join(' · '),
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                    const SizedBox(height: 12),
                    AuthImage(claimPhotoPath(c.claimNo), height: 200),
                    const SizedBox(height: 12),
                    Text(c.description),
                    if (c.status == 'Open' && c.responseDueAt != null) ...[
                      const SizedBox(height: 8),
                      Text('Người nuôi phản hồi trước ${formatDayTime(c.responseDueAt!)}', style: Theme.of(context).textTheme.bodySmall),
                    ],
                  ],
                ),
              ),
              if (c.operatorResponse != null) ...[
                const SizedBox(height: 12),
                _Reply(icon: Icons.agriculture_outlined, who: 'Người nuôi', text: c.operatorResponse!),
              ],
              if (c.adminDecision != null) ...[
                const SizedBox(height: 12),
                _Reply(icon: Icons.gavel_rounded, who: 'Admin', text: c.adminDecision!),
              ],
              if (c.refundAmount != null) ...[
                const SizedBox(height: 12),
                FactGrid(
                  facts: [
                    Fact('Được hoàn', formatVnd(c.refundAmount!), color: AppColors.success),
                    Fact('Tính trên', formatKg(c.refundKg)),
                  ],
                ),
              ],
              if (c.awaitsMyReply) ...[
                const SizedBox(height: 16),
                FilledButton(onPressed: _busy ? null : () => _reply(c, true), child: const Text('Đồng ý')),
                const SizedBox(height: 4),
                TextButton(
                  style: TextButton.styleFrom(minimumSize: const Size.fromHeight(48), foregroundColor: AppColors.ink),
                  onPressed: _busy ? null : () => _reply(c, false),
                  child: const Text('Không đồng ý'),
                ),
              ],
              MoreSection(
                label: 'Chi tiết',
                children: [
                  KeyValueList(
                    rows: [
                      ('Mã khiếu nại', c.claimNo),
                      ('Loại', statusLabel('claimType', c.claimType)),
                      ('Đơn', c.orderNo),
                      ('Gửi lúc', c.createdAt == null ? null : '${formatDate(c.createdAt!)} ${formatTime(c.createdAt!)}'),
                    ],
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Reply extends StatelessWidget {
  const _Reply({required this.icon, required this.who, required this.text});
  final IconData icon;
  final String who;
  final String text;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          IconTile(icon: icon, size: 40),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(who, style: Theme.of(context).textTheme.bodySmall),
                const SizedBox(height: 2),
                Text(text),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
