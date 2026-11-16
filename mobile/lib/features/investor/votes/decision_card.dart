import 'package:material_ui/material_ui.dart';

import '../../../app/theme/app_theme.dart';
import '../../../core/api/api_client.dart';
import '../../../core/format/money.dart';
import '../../../shared/status_labels.dart';
import '../../../shared/widgets/app_parts.dart';
import '../../../shared/widgets/app_ui.dart';
import '../data/decision_repository.dart';
import '../widgets/investor_ui.dart';

const _choiceLabels = {'Yes': 'Đồng ý', 'No': 'Không đồng ý'};

/// Hậu quả khi cuộc biểu quyết được thông qua; chỉ hiện trong hộp xác nhận.
const _effects = {
  'EarlyLiquidation': 'Nếu thông qua: Lô thanh lý sớm, các mốc chưa giải ngân dừng lại, cua còn lại được bán rồi quyết toán.',
  'SurplusSale': 'Nếu thông qua: người nuôi được mở bán phần dư mà bên cam kết thu mua không mua.',
};

/// Hỏi lại trước khi gửi phiếu, rồi gửi bằng [send] và báo kết quả ở đáy màn hình.
Future<void> confirmVote(
  BuildContext context,
  Decision decision,
  String choice,
  Future<void> Function(Decision decision, String choice) send,
) async {
  final label = _choiceLabels[choice]!;
  final confirmed = await showConfirmSheet(
    context,
    title: 'Biểu quyết: $label',
    message: [
      if (_effects[decision.kind] != null) _effects[decision.kind]!,
      'Phiếu tính theo vốn đã chốt của bạn và không đổi lại được.',
    ].join('\n\n'),
    confirmLabel: 'Gửi phiếu ${label.toLowerCase()}',
    danger: choice == 'No',
  );
  if (confirmed == null || !context.mounted) return;
  try {
    await send(decision, choice);
    if (context.mounted) showAppToast(context, 'Đã ghi nhận phiếu của bạn.');
  } catch (error) {
    if (context.mounted) showAppToast(context, apiErrorMessage(error), error: true);
  }
}

/// Một cuộc biểu quyết: đề xuất, hai thanh vốn đồng ý và không đồng ý, hạn, và hai nút khi tôi còn quyền biểu quyết.
class DecisionCard extends StatefulWidget {
  const DecisionCard({super.key, required this.decision, required this.onVote, this.showBatch = false});
  final Decision decision;
  final Future<void> Function(Decision decision, String choice) onVote;
  final bool showBatch;

  @override
  State<DecisionCard> createState() => _DecisionCardState();
}

class _DecisionCardState extends State<DecisionCard> {
  bool _sending = false;

  Future<void> _vote(String choice) async {
    setState(() => _sending = true);
    await confirmVote(context, widget.decision, choice, widget.onVote);
    if (mounted) setState(() => _sending = false);
  }

  @override
  Widget build(BuildContext context) {
    final d = widget.decision;
    final text = Theme.of(context).textTheme;
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  '${statusLabel('decisionKind', d.kind)}${widget.showBatch ? ' · Lô ${d.batchCode}' : ''}',
                  style: text.titleMedium,
                ),
              ),
              const SizedBox(width: 8),
              StatusPill(kind: 'decision', value: d.status),
            ],
          ),
          const SizedBox(height: 8),
          Text(d.proposal),
          const SizedBox(height: 12),
          _CapitalBar(label: 'Đồng ý', capital: d.yesCapital, pct: d.yesPct, eligible: d.eligibleCapital, color: AppColors.success),
          const SizedBox(height: 8),
          _CapitalBar(label: 'Không đồng ý', capital: d.noCapital, pct: d.noPct, eligible: d.eligibleCapital, color: AppColors.danger),
          const SizedBox(height: 10),
          Text(
            [
              d.isOpen ? 'Hạn ${dateTimeText(d.closesAt)}' : 'Kết thúc ${dateTimeText(d.decidedAt ?? d.closesAt)}',
              if (d.myChoice != null) 'Bạn đã chọn: ${_choiceLabels[d.myChoice] ?? d.myChoice}',
            ].join(' · '),
            style: text.bodySmall,
          ),
          if (d.canVote) ...[
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    style: outlinedPillStyle(color: AppColors.danger),
                    onPressed: _sending ? null : () => _vote('No'),
                    child: const Text('Không đồng ý'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: FilledButton(
                    style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
                    onPressed: _sending ? null : () => _vote('Yes'),
                    child: const Text('Đồng ý'),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _CapitalBar extends StatelessWidget {
  const _CapitalBar({required this.label, required this.capital, required this.pct, required this.eligible, required this.color});
  final String label;
  final int capital, eligible;
  final double pct;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(child: Text(label, style: const TextStyle(fontWeight: FontWeight.w600))),
            Text('${formatVnd(capital)} · ${formatCount(pct)}%', style: Theme.of(context).textTheme.bodySmall),
          ],
        ),
        const SizedBox(height: 4),
        SoftProgressBar(value: eligible <= 0 ? 0 : capital / eligible, color: color),
      ],
    );
  }
}
