import 'package:material_ui/material_ui.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/routes.dart';
import '../../../app/theme/app_theme.dart';
import '../../../core/api/api_client.dart';
import '../../../core/format/dates.dart';
import '../../../shared/widgets/app_ui.dart';
import '../../../shared/widgets/nav_shell.dart';
import '../data/operator_models.dart';
import '../data/operator_repository.dart';

/// Tab "Nhật ký": các bản ghi ngày (pH, nhiệt độ nước, độ mặn, thức ăn) theo từng lô.
class DailyLogsPage extends ConsumerWidget {
  const DailyLogsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final logs = ref.watch(dailyLogsProvider);
    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: logs.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => ErrorView(message: apiErrorMessage(e), onRetry: () => ref.invalidate(dailyLogsProvider)),
          data: (list) => RefreshIndicator(
            onRefresh: () => ref.refresh(dailyLogsProvider.future),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, kNavBarClearance),
              children: [
                Text('Nhật ký nuôi', style: Theme.of(context).textTheme.headlineMedium),
                const SizedBox(height: 14),
                AddBar(label: 'Ghi nhật ký hôm nay', onTap: () => context.push(Routes.dailyLogNew)),
                const SizedBox(height: 8),
                for (final log in list) ...[
                  const SizedBox(height: 10),
                  _LogCard(log: log),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _LogCard extends StatelessWidget {
  const _LogCard({required this.log});

  final DailyLog log;

  String _num(double? v, {int digits = 1}) => v == null ? '—' : v.toStringAsFixed(digits).replaceAll('.', ',');

  @override
  Widget build(BuildContext context) {
    final flagged = log.flag != PlausibilityFlag.ok;
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text('${formatDate(log.logDate)} · ${log.batchCode}', style: Theme.of(context).textTheme.titleMedium),
              ),
              InfoChip(
                label: log.flag.label,
                background: flagged ? AppColors.accentSoft : const Color(0xFFE3F2E9),
                foreground: flagged ? AppColors.accentText : AppColors.success,
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              _Value(label: 'pH', value: _num(log.ph)),
              _Value(label: 'Nhiệt độ °C', value: _num(log.waterTempC)),
              _Value(label: 'Độ mặn ‰', value: _num(log.salinityPpt, digits: 0)),
              _Value(label: 'Thức ăn kg', value: _num(log.feedKg)),
            ],
          ),
          if (log.note != null) ...[
            const SizedBox(height: 10),
            Text(log.note!, style: Theme.of(context).textTheme.bodySmall),
          ],
        ],
      ),
    );
  }
}

class _Value extends StatelessWidget {
  const _Value({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(value, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
          Text(label, style: Theme.of(context).textTheme.bodySmall),
        ],
      ),
    );
  }
}
