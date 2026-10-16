import 'package:material_ui/material_ui.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/theme/app_theme.dart';
import '../../../core/api/api_client.dart';
import '../../../core/format/dates.dart';
import '../../../core/format/money.dart';
import '../../../shared/widgets/app_ui.dart';
import '../data/portfolio_repository.dart';

const _paymentStates = {
  'Confirmed': 'Đã xác nhận',
  'Reserved': 'Đang giữ chỗ',
  'Expired': 'Hết hạn',
  'Refunded': 'Đã hoàn',
};
const _contractStates = {
  'Draft': 'Nháp',
  'OperatorSigned': 'Hộ nuôi đã ký',
  'FullySigned': 'Đã đủ chữ ký',
  'Void': 'Đã huỷ',
};
String _time(DateTime at) => '${formatDate(at)} ${formatTime(at)}';

class InvestorPortfolioDetailPage extends ConsumerWidget {
  const InvestorPortfolioDetailPage({super.key, required this.code});
  final String code;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final provider = portfolioDetailProvider(code);
    final query = ref.watch(provider);
    final text = Theme.of(context).textTheme;
    return Scaffold(
      body: SafeArea(
        child: AppRefreshIndicator(
          onRefresh: () => ref.refresh(provider.future),
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
            children: [
              const SubPageHeader(title: 'Chi tiết danh mục'),
              const SizedBox(height: 16),
              ...query.when(
                loading: () => [const LoadingSkeleton(rows: 2)],
                error: (e, _) => [
                  ErrorView(
                    message: apiErrorMessage(e),
                    onRetry: () => ref.invalidate(provider),
                  ),
                ],
                data: (detail) {
                  final p = detail.position;
                  final b = p.batch;
                  final log = detail.latestProduction;
                  final s = p.settlement;
                  return [
                    AppCard(
                      color: AppColors.ink,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            '${b.code} · ${b.status.label}',
                            style: const TextStyle(color: Colors.white70),
                          ),
                          const SizedBox(height: 12),
                          Text(
                            formatVnd(p.amount),
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 30,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          Text(
                            p.ratioLabel,
                            style: const TextStyle(color: AppColors.accent),
                          ),
                          const SizedBox(height: 8),
                          Text(
                            p.capitalFrozen ? 'Vốn đã chốt' : 'Vốn đã xác nhận, tỷ lệ tạm tính đến khi chốt vốn',
                            style: const TextStyle(color: Colors.white70),
                          ),
                        ],
                      ),
                    ),
                    SectionHeader(title: b.title),
                    Text(b.operatorName, style: text.bodySmall),
                    const SizedBox(height: 12),
                    AppCard(
                      child: Column(
                        children: [
                          MetricRow(
                            metrics: [
                              Metric(
                                'ngày nuôi',
                                b.dayOfCycle == null
                                    ? '—'
                                    : '${b.dayOfCycle}/${b.cycleDays}',
                              ),
                              Metric(
                                'con',
                                b.aliveCount == null
                                    ? '—'
                                    : formatCount(b.aliveCount!),
                              ),
                              Metric('cảnh báo', '${b.openAlerts}'),
                            ],
                          ),
                          const SizedBox(height: 12),
                          LinearProgressIndicator(
                            value: b.cycleProgress,
                            borderRadius: BorderRadius.circular(12),
                          ),
                          const SizedBox(height: 12),
                          _Fact(
                            'Dự kiến thu',
                            b.expectedHarvestDate == null
                                ? 'Chưa có lịch'
                                : formatDate(b.expectedHarvestDate!),
                          ),
                          _Fact(
                            'Vốn xác nhận của lô',
                            formatVnd(b.raisedCapital),
                          ),
                        ],
                      ),
                    ),
                    const SectionHeader(title: 'Lịch sử khoản góp'),
                    if (detail.contributions.isEmpty)
                      Text('Chưa có lịch sử khoản góp.', style: text.bodySmall),
                    for (final c in detail.contributions) ...[
                      AppCard(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              '#${c.id} · ${formatVnd(c.amount)}',
                              style: text.titleMedium,
                            ),
                            Text(_paymentStates[c.status] ?? c.status),
                            Text(
                              c.confirmedAt == null
                                  ? 'Giữ chỗ ${_time(c.reservedAt)}'
                                  : 'Xác nhận ${_time(c.confirmedAt!)}',
                              style: text.bodySmall,
                            ),
                            if (c.contractNo != null)
                              Text(
                                'Hợp đồng ${c.contractNo} · ${_contractStates[c.contractStatus] ?? c.contractStatus}',
                                style: text.bodySmall,
                              ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 12),
                    ],
                    const SectionHeader(title: 'Nhật ký nuôi mới nhất'),
                    AppCard(
                      child: log == null
                          ? const Text('Chưa có nhật ký nuôi.')
                          : Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  formatDate(log.logDate),
                                  style: text.titleMedium,
                                ),
                                _Fact('pH', '${log.ph ?? '—'}'),
                                _Fact(
                                  'Nhiệt độ',
                                  log.waterTempC == null
                                      ? '—'
                                      : '${log.waterTempC} °C',
                                ),
                                _Fact(
                                  'Độ mặn',
                                  log.salinityPpt == null
                                      ? '—'
                                      : '${log.salinityPpt} ‰',
                                ),
                                _Fact(
                                  'Thức ăn',
                                  log.feedKg == null ? '—' : '${log.feedKg} kg',
                                ),
                                Text(
                                  log.verifiedAt == null
                                      ? 'Chưa kiểm tra'
                                      : 'Đã kiểm tra ${_time(log.verifiedAt!)}',
                                  style: text.bodySmall,
                                ),
                                if (log.plausibilityFlag != 'Ok')
                                  Text(
                                    'Có dấu hiệu cần kiểm tra',
                                    style: text.bodySmall,
                                  ),
                              ],
                            ),
                    ),
                    const SectionHeader(title: 'Quyết toán đã duyệt'),
                    AppCard(
                      child: s == null
                          ? const Text('Chưa có quyết toán được duyệt.')
                          : Column(
                              children: [
                                _Fact('Hoàn vốn', formatVnd(s.capitalReturn)),
                                _Fact(
                                  'Phần chia thực tế',
                                  formatVnd(s.profitShare),
                                ),
                                _Fact(
                                  'Thuế khấu trừ',
                                  formatVnd(s.taxWithheld),
                                ),
                                _Fact(
                                  'Tiền nhận theo quyết toán',
                                  formatVnd(s.netPayout),
                                ),
                                _Fact('Hiện vật', '${s.inKindQtyKg} kg'),
                                _Fact(
                                  'Trạng thái',
                                  s.status == 'PaidOut'
                                      ? 'Đã chi trả'
                                      : s.status == 'Closed'
                                      ? 'Đã đóng'
                                      : 'Đã duyệt, chờ chi trả',
                                ),
                              ],
                            ),
                    ),
                    const SectionHeader(title: 'Hành trình lô'),
                    if (detail.timeline.isEmpty)
                      Text('Chưa có sự kiện.', style: text.bodySmall),
                    for (final event in detail.timeline) ...[
                      AppCard(
                        child: Row(
                          children: [
                            const IconTile(icon: Icons.history_rounded),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(event.label, style: text.titleSmall),
                                  Text(_time(event.at), style: text.bodySmall),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 10),
                    ],
                  ];
                },
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Fact extends StatelessWidget {
  const _Fact(this.label, this.value);
  final String label, value;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 6),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Text(label, style: Theme.of(context).textTheme.bodySmall),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Text(
            value,
            textAlign: TextAlign.end,
            style: const TextStyle(fontWeight: FontWeight.w600),
          ),
        ),
      ],
    ),
  );
}
