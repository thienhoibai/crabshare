import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../../app/routes.dart';
import '../../../app/theme/app_theme.dart';
import '../../../core/api/api_client.dart';
import '../../../core/format/dates.dart';
import '../../../shared/widgets/app_parts.dart';
import '../../../shared/widgets/app_ui.dart';
import '../data/operator_repository.dart';
import 'evidence_explanation_repository.dart';

String _dateTime(DateTime value) => '${formatTime(value)} ${formatDate(value)}';

/// Ảnh chụp tại hộp bị gắn cờ của hộ nuôi. Bấm một ảnh để xem và gửi giải trình.
class FlaggedEvidencePage extends ConsumerWidget {
  const FlaggedEvidencePage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final query = ref.watch(flaggedEvidenceProvider);
    return Scaffold(
      body: SafeArea(
        child: AsyncContent<List<FlaggedEvidence>>(
          value: query,
          onRefresh: () => ref.refresh(flaggedEvidenceProvider.future),
          header: const Padding(
            padding: EdgeInsets.fromLTRB(20, 12, 20, 0),
            child: SubPageHeader(title: 'Ảnh cần giải trình'),
          ),
          data: (items) => ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
            children: [
              const SubPageHeader(title: 'Ảnh cần giải trình'),
              const SizedBox(height: 14),
              if (items.isEmpty) const EmptyState(icon: Icons.check_circle_outline_rounded, title: 'Không có ảnh nào bị gắn cờ'),
              for (final item in items) ...[
                AppCard(
                  onTap: () => context.push(Routes.evidenceExplanation(item.id)),
                  child: Row(
                    children: [
                      const IconTile(icon: Icons.flag_outlined),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Hộp ${item.slotCode ?? '—'}', style: Theme.of(context).textTheme.titleMedium),
                            Text('${item.batchCode} · ${formatDate(item.receivedAt)}', style: Theme.of(context).textTheme.bodySmall),
                            const SizedBox(height: 4),
                            Text(
                              item.explanation == null ? 'Cần giải trình' : 'Đã giải trình, chờ thẩm định',
                              style: TextStyle(
                                color: item.explanation == null ? AppColors.accentText : AppColors.inkMuted,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                        ),
                      ),
                      const Icon(Icons.chevron_right_rounded, color: AppColors.inkMuted),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// Một ảnh bị gắn cờ: xem ảnh, câu hỏi của người thẩm định và gửi giải trình.
class EvidenceExplanationPage extends ConsumerWidget {
  const EvidenceExplanationPage({super.key, required this.id});
  final int id;

  static const _header = Padding(
    padding: EdgeInsets.fromLTRB(20, 12, 20, 0),
    child: SubPageHeader(title: 'Giải trình ảnh'),
  );

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (id <= 0) {
      return const Scaffold(
        body: SafeArea(
          child: Column(
            children: [
              _header,
              EmptyState(icon: Icons.image_not_supported_outlined, title: 'Không tìm thấy ảnh này'),
            ],
          ),
        ),
      );
    }
    final query = ref.watch(operatorEvidenceProvider(id));
    final account = ref.watch(farmAccountProvider);
    return Scaffold(
      body: SafeArea(
        child: AsyncContent<FlaggedEvidence>(
          value: query,
          onRefresh: () => ref.refresh(operatorEvidenceProvider(id).future),
          header: _header,
          data: (item) => ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
            children: [
              const SubPageHeader(title: 'Giải trình ảnh'),
              const SizedBox(height: 14),
              Row(
                children: [
                  Expanded(child: Text('Hộp ${item.slotCode ?? '—'} · ${item.batchCode}', style: Theme.of(context).textTheme.titleMedium)),
                  StatusPill(kind: 'evidence', value: item.reviewStatus),
                ],
              ),
              const SizedBox(height: 12),
              if (item.mediaType == 'Photo') _EvidencePhoto(key: ValueKey('photo-$account-$id'), id: id),
              if (item.reviewNote != null) ...[
                const SizedBox(height: 12),
                AppCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Người thẩm định hỏi', style: Theme.of(context).textTheme.titleMedium),
                      const SizedBox(height: 6),
                      Text(item.reviewNote!),
                    ],
                  ),
                ),
              ],
              const SizedBox(height: 12),
              _ExplanationForm(key: ValueKey('form-$account-$id'), item: item),
              MoreSection(
                label: 'Chi tiết ảnh',
                children: [
                  KeyValueList(
                    rows: [
                      ('Chụp lúc', item.capturedAt == null ? null : _dateTime(item.capturedAt!)),
                      ('Máy chủ nhận lúc', _dateTime(item.receivedAt)),
                      ('Vị trí chụp', item.latitude == null || item.longitude == null ? null : '${item.latitude}, ${item.longitude}'),
                      ('Giải trình gửi lúc', item.explainedAt == null ? null : _dateTime(item.explainedAt!)),
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

class _EvidencePhoto extends ConsumerWidget {
  const _EvidencePhoto({super.key, required this.id});
  final int id;

  @override
  Widget build(BuildContext context, WidgetRef ref) => ref
      .watch(operatorEvidenceImageProvider(id))
      .when(
        loading: () => const SizedBox(height: 220, child: Center(child: CircularProgressIndicator())),
        error: (error, _) => Column(
          children: [
            Text(apiErrorMessage(error)),
            TextButton(onPressed: () => ref.invalidate(operatorEvidenceImageProvider(id)), child: const Text('Tải lại ảnh')),
          ],
        ),
        data: (bytes) => ClipRRect(
          borderRadius: BorderRadius.circular(16),
          child: Image.memory(
            bytes,
            height: 260,
            width: double.infinity,
            fit: BoxFit.contain,
            errorBuilder: (_, _, _) => const Text('Không đọc được ảnh.'),
          ),
        ),
      );
}

class _ExplanationForm extends ConsumerStatefulWidget {
  const _ExplanationForm({super.key, required this.item});
  final FlaggedEvidence item;

  @override
  ConsumerState<_ExplanationForm> createState() => _ExplanationFormState();
}

class _ExplanationFormState extends ConsumerState<_ExplanationForm> {
  late final _text = TextEditingController(text: widget.item.explanation ?? '');
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final text = _text.text.trim();
    if (_busy || !widget.item.canExplain || text.isEmpty) return;
    final account = ref.read(farmAccountProvider);
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final saved = await ref.read(evidenceExplanationRepositoryProvider).explain(widget.item.id, text);
      if (!mounted || ref.read(farmAccountProvider) != account) return;
      _text.text = saved.explanation ?? '';
      ref.invalidate(operatorEvidenceProvider(widget.item.id));
      ref.invalidate(flaggedEvidenceProvider);
      setState(() => _busy = false);
      showAppToast(context, 'Đã gửi giải trình.');
    } catch (error) {
      if (!mounted) return;
      // Ảnh có thể vừa được thẩm định xong: tải lại để hiện đúng tình trạng.
      ref.invalidate(operatorEvidenceProvider(widget.item.id));
      setState(() {
        _busy = false;
        _error = apiErrorMessage(error);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final item = widget.item;
    final text = _text.text.trim();
    final unchanged = text == (item.explanation ?? '');
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(item.explanation == null ? 'Giải trình' : 'Giải trình đã gửi', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Text(_error!, style: const TextStyle(color: AppColors.danger)),
            ),
          if (!item.canExplain)
            Text(item.explanation ?? 'Ảnh không còn chờ thẩm định.')
          else ...[
            TextField(
              controller: _text,
              onChanged: (_) => setState(() {}),
              enabled: !_busy,
              minLines: 3,
              maxLines: 6,
              maxLength: 1000,
              decoration: const InputDecoration(hintText: 'Vì sao ảnh bị gắn cờ?', fillColor: AppColors.background),
            ),
            FilledButton(
              onPressed: _busy || text.isEmpty || unchanged ? null : _submit,
              child: Text(
                _busy
                    ? 'Đang gửi…'
                    : item.explanation == null
                    ? 'Gửi giải trình'
                    : 'Gửi lại giải trình',
              ),
            ),
          ],
        ],
      ),
    );
  }
}
