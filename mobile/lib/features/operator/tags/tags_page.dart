import 'package:material_ui/material_ui.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/auth/session.dart';
import '../../../core/api/api_client.dart';
import '../../../shared/widgets/app_ui.dart';
import '../../../app/routes.dart';
import 'tag_repository.dart';

class TagsPage extends ConsumerStatefulWidget {
  const TagsPage({super.key});

  @override
  ConsumerState<TagsPage> createState() => _TagsPageState();
}

class _TagsPageState extends ConsumerState<TagsPage> {
  int _page = 1;

  Future<void> _refresh() async {
    final request = (ref.read(sessionProvider), _page);
    ref.invalidate(printedTagsProvider(request));
    await ref.read(printedTagsProvider(request).future);
  }

  @override
  Widget build(BuildContext context) {
    final request = (ref.watch(sessionProvider), _page);
    final tags = ref.watch(printedTagsProvider(request));
    return Scaffold(
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: _refresh,
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
            children: [
              const SubPageHeader(title: 'Quản lý tem'),
              const SizedBox(height: 8),
              Text(
                'Tem đã in · ${tags.asData?.value.total ?? '—'} tem',
                style: Theme.of(context).textTheme.bodySmall,
              ),
              ...tags.when(
                loading: () => [
                  const Padding(
                    padding: EdgeInsets.only(top: 20),
                    child: LoadingSkeleton(rows: 2),
                  ),
                ],
                error: (error, _) => [
                  Padding(
                    padding: const EdgeInsets.only(top: 20),
                    child: Text(
                      apiErrorMessage(error),
                      style: TextStyle(
                        color: Theme.of(context).colorScheme.error,
                      ),
                    ),
                  ),
                  TextButton(
                    onPressed: () =>
                        ref.invalidate(printedTagsProvider(request)),
                    child: const Text('Thử tải lại'),
                  ),
                ],
                data: (result) => [
                  if (result.items.isEmpty)
                    const Padding(
                      padding: EdgeInsets.only(top: 24),
                      child: Text('Chưa có tem nào ở trạng thái đã in.'),
                    ),
                  for (final tag in result.items) ...[
                    const SizedBox(height: 12),
                    _PrintedTagCard(
                      key: ValueKey(tag.tagId),
                      tag: tag,
                      onOpenCapture: () =>
                          context.push(Routes.captureTag(tag.tagCode)),
                      onActivated: () => ref.invalidate(printedTagsProvider),
                    ),
                  ],
                  if (result.items.isNotEmpty) ...[
                    const SizedBox(height: 12),
                    Wrap(
                      spacing: 8,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        TextButton(
                          onPressed: _page > 1
                              ? () => setState(() => _page--)
                              : null,
                          child: const Text('Trang trước'),
                        ),
                        Text('Trang ${result.page}'),
                        TextButton(
                          onPressed:
                              result.page * result.pageSize < result.total
                              ? () => setState(() => _page++)
                              : null,
                          child: const Text('Trang sau'),
                        ),
                      ],
                    ),
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

class _PrintedTagCard extends ConsumerStatefulWidget {
  const _PrintedTagCard({
    super.key,
    required this.tag,
    required this.onOpenCapture,
    required this.onActivated,
  });

  final TagListItem tag;
  final VoidCallback onOpenCapture;
  final VoidCallback onActivated;

  @override
  ConsumerState<_PrintedTagCard> createState() => _PrintedTagCardState();
}

class _PrintedTagCardState extends ConsumerState<_PrintedTagCard> {
  final _evidenceId = TextEditingController();
  String? _error;
  bool _busy = false;

  @override
  void dispose() {
    _evidenceId.dispose();
    super.dispose();
  }

  Future<void> _activate() async {
    final evidenceId = int.tryParse(_evidenceId.text.trim());
    if (evidenceId == null || evidenceId < 1) {
      setState(() => _error = 'Nhập Evidence ID là số nguyên dương.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final result = await ref
          .read(tagRepositoryProvider)
          .activate(widget.tag.tagCode, evidenceId);
      if (!mounted) return;
      widget.onActivated();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Đã kích hoạt tem ${result.tagCode}.')),
      );
    } catch (error) {
      if (mounted) setState(() => _error = apiErrorMessage(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => AppCard(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        InkWell(
          onTap: _busy ? null : widget.onOpenCapture,
          child: Row(
            children: [
              const IconTile(icon: Icons.qr_code_2_rounded),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      widget.tag.tagCode,
                      style: const TextStyle(fontWeight: FontWeight.w700),
                    ),
                    Text(
                      'Lô ${widget.tag.batchCode} · Mã cá thể ${widget.tag.itemUuid}',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right_rounded),
            ],
          ),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _evidenceId,
          enabled: !_busy,
          keyboardType: TextInputType.number,
          decoration: const InputDecoration(
            labelText: 'Evidence ID đã được duyệt',
            helperText: 'Dùng để tiếp tục một lần tải lên đã được duyệt.',
          ),
        ),
        if (_error != null) ...[
          const SizedBox(height: 6),
          Semantics(
            liveRegion: true,
            child: Text(
              _error!,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          ),
        ],
        const SizedBox(height: 8),
        FilledButton(
          onPressed: _busy ? null : _activate,
          child: Text(_busy ? 'Đang kích hoạt…' : 'Kích hoạt tem'),
        ),
        if (_busy) const LinearProgressIndicator(),
      ],
    ),
  );
}
