import 'package:material_ui/material_ui.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/routes.dart';
import '../../../app/theme/app_theme.dart';
import '../../../core/api/api_client.dart';
import '../../../core/auth/session.dart';
import '../../../core/format/dates.dart';
import '../../../shared/widgets/app_ui.dart';
import 'evidence_explanation_repository.dart';

String _date(DateTime value) => '${formatDate(value)} ${formatTime(value)}';

String _status(String value) => switch (value) {
  'Flagged' => 'Chờ thẩm định',
  'Accepted' => 'Đã chấp nhận',
  'Rejected' => 'Đã từ chối',
  'Watch' => 'Theo dõi',
  _ => value,
};

class FlaggedEvidencePage extends ConsumerWidget {
  const FlaggedEvidencePage({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final query = ref.watch(flaggedEvidenceProvider);
    return Scaffold(
      body: SafeArea(
        child: AppRefreshIndicator(
          onRefresh: () => ref.refresh(flaggedEvidenceProvider.future),
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
            children: [
              const SubPageHeader(title: 'Bằng chứng bị gắn cờ'),
              Text(
                'Xem phản hồi thẩm định và gửi giải trình cho bằng chứng của hộ nuôi.',
                style: Theme.of(context).textTheme.bodySmall,
              ),
              const SizedBox(height: 16),
              ...query.when(
                loading: () => [const LoadingSkeleton(rows: 2)],
                error: (error, _) => [
                  ErrorView(
                    message: apiErrorMessage(error),
                    onRetry: () => ref.invalidate(flaggedEvidenceProvider),
                  ),
                ],
                data: (items) => [
                  if (items.isEmpty)
                    const EmptyState(
                      icon: Icons.check_circle_outline,
                      title: 'Không có bằng chứng bị gắn cờ',
                    ),
                  for (final item in items) ...[
                    AppCard(
                      onTap: () => context
                          .push(Routes.evidenceExplanation(item.id))
                          .then((_) {
                            if (context.mounted) {
                              ref.invalidate(flaggedEvidenceProvider);
                            }
                          }),
                      child: Row(
                        children: [
                          const IconTile(icon: Icons.flag_outlined),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'Hộp ${item.slotCode ?? '—'} · #${item.id}',
                                  style: Theme.of(context)
                                      .textTheme
                                      .titleMedium,
                                ),
                                Text(
                                  item.batchCode,
                                  style: Theme.of(context).textTheme.bodySmall,
                                ),
                                const SizedBox(height: 6),
                                Text(
                                  item.explanation == null
                                      ? 'Cần giải trình'
                                      : 'Đã có giải trình · chờ thẩm định',
                                  style: const TextStyle(
                                    color: AppColors.accentText,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const Icon(Icons.chevron_right),
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),
                  ],
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class EvidenceExplanationPage extends ConsumerWidget {
  const EvidenceExplanationPage({super.key, required this.id});
  final int id;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (id <= 0) {
      return const Scaffold(
        body: SafeArea(
          child: Center(child: Text('Mã bằng chứng không hợp lệ.')),
        ),
      );
    }
    final query = ref.watch(operatorEvidenceProvider(id));
    final userId = ref.watch(
      sessionProvider.select((session) => session.user?.userId),
    );
    return Scaffold(
      body: SafeArea(
        child: AppRefreshIndicator(
          onRefresh: () => ref.refresh(operatorEvidenceProvider(id).future),
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
            children: [
              const SubPageHeader(title: 'Giải trình bằng chứng'),
              ...query.when(
                loading: () => [const LoadingSkeleton(rows: 2)],
                error: (error, _) => [
                  ErrorView(
                    message: apiErrorMessage(error),
                    onRetry: () => ref.invalidate(operatorEvidenceProvider(id)),
                  ),
                ],
                data: (item) => [
                  AppCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '${item.batchCode} · Hộp ${item.slotCode ?? '—'} · #${item.id}',
                          style: Theme.of(context).textTheme.titleMedium,
                        ),
                        const SizedBox(height: 12),
                        if (item.mediaType == 'Photo')
                          _EvidencePhoto(key: ValueKey('$userId-$id'), id: id),
                        const SizedBox(height: 12),
                        Text(
                          _status(item.reviewStatus),
                          style: const TextStyle(
                            color: AppColors.accentText,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        Text(
                          'Nhận tại máy chủ: ${_date(item.receivedAt)}',
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                        if (item.capturedAt != null)
                          Text(
                            'Chụp lúc: ${_date(item.capturedAt!)}',
                            style: Theme.of(context).textTheme.bodySmall,
                          ),
                        if (item.latitude != null && item.longitude != null)
                          Text(
                            'GPS: ${item.latitude}, ${item.longitude}',
                            style: Theme.of(context).textTheme.bodySmall,
                          ),
                        Text(
                          'Điểm rủi ro: ${item.riskScore == null ? 'Chưa có' : '${item.riskScore}/100'}',
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                      ],
                    ),
                  ),
                  if (item.reviewNote != null) ...[
                    const SizedBox(height: 12),
                    AppCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Phản hồi thẩm định',
                            style: Theme.of(context).textTheme.titleMedium,
                          ),
                          const SizedBox(height: 6),
                          Text(item.reviewNote!),
                        ],
                      ),
                    ),
                  ],
                  if (item.explanation != null) ...[
                    const SizedBox(height: 12),
                    AppCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Giải trình đã gửi',
                            style: Theme.of(context).textTheme.titleMedium,
                          ),
                          const SizedBox(height: 6),
                          Text(item.explanation!),
                          if (item.explainedAt != null)
                            Text(
                              _date(item.explainedAt!),
                              style: Theme.of(context).textTheme.bodySmall,
                            ),
                        ],
                      ),
                    ),
                  ],
                  const SizedBox(height: 12),
                  _ExplanationForm(key: ValueKey('$userId-$id'), item: item),
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
        loading: () => const SizedBox(
          height: 220,
          child: Center(child: CircularProgressIndicator()),
        ),
        error: (error, _) => Column(
          children: [
            Text(apiErrorMessage(error)),
            TextButton(
              onPressed: () =>
                  ref.invalidate(operatorEvidenceImageProvider(id)),
              child: const Text('Tải lại ảnh'),
            ),
          ],
        ),
        data: (bytes) => ClipRRect(
          borderRadius: BorderRadius.circular(16),
          child: Image.memory(
            bytes,
            height: 260,
            width: double.infinity,
            fit: BoxFit.contain,
            errorBuilder: (_, _, _) =>
                const Text('Không đọc được ảnh bằng chứng.'),
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
  final _form = GlobalKey<FormState>();
  bool _busy = false;
  String? _error, _notice;
  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_busy || !widget.item.canExplain || !_form.currentState!.validate()) {
      return;
    }
    final userId = ref.read(sessionProvider).user?.userId;
    setState(() {
      _busy = true;
      _error = null;
      _notice = null;
    });
    try {
      final saved = await ref
          .read(evidenceExplanationRepositoryProvider)
          .explain(widget.item.id, _text.text.trim());
      if (!mounted || ref.read(sessionProvider).user?.userId != userId) return;
      _text.text = saved.explanation ?? '';
      ref.invalidate(operatorEvidenceProvider(widget.item.id));
      ref.invalidate(flaggedEvidenceProvider);
      setState(() {
        _busy = false;
        _notice = 'Đã gửi giải trình. Bằng chứng đang chờ thẩm định.';
      });
    } catch (error) {
      if (!mounted) return;
      ref.invalidate(operatorEvidenceProvider(widget.item.id));
      setState(() {
        _busy = false;
        _error = apiErrorMessage(error);
      });
    }
  }

  @override
  Widget build(BuildContext context) => AppCard(
    child: Form(
      key: _form,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Nội dung giải trình',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 8),
          TextFormField(
            controller: _text,
            onChanged: (_) => setState(() {}),
            enabled: !_busy && widget.item.canExplain,
            minLines: 3,
            maxLines: 6,
            maxLength: 1000,
            decoration: const InputDecoration(
              hintText: 'Lý do ảnh bị gắn cờ, thông tin cần đối chiếu…',
            ),
            validator: (value) => value == null || value.trim().isEmpty
                ? 'Vui lòng nhập nội dung giải trình.'
                : value.length > 1000
                ? 'Tối đa 1000 ký tự.'
                : null,
          ),
          if (!widget.item.canExplain)
            const Text(
              'Bằng chứng không còn chờ thẩm định; không thể gửi thêm giải trình.',
            ),
          if (_error != null)
            Text(_error!, style: const TextStyle(color: AppColors.danger)),
          if (_notice != null)
            Text(_notice!, style: const TextStyle(color: AppColors.success)),
          if (widget.item.explanation != null)
            const Text('Bổ sung nội dung mới trước khi gửi lại giải trình.'),
          const SizedBox(height: 12),
          FilledButton(
            onPressed:
                _busy ||
                    !widget.item.canExplain ||
                    _text.text.trim() == widget.item.explanation
                ? null
                : _submit,
            child: Text(_busy ? 'Đang gửi…' : 'Gửi giải trình'),
          ),
        ],
      ),
    ),
  );
}
