import 'package:material_ui/material_ui.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../../app/theme/app_theme.dart';
import '../../../core/api/api_client.dart';
import '../../../core/format/money.dart';
import '../../../shared/models/batch_enums.dart';
import '../../../shared/widgets/app_ui.dart';
import '../data/operator_models.dart';
import '../data/operator_repository.dart';
import 'grading.dart';

/// Thu hoạch từng con: cân → xếp hạng → in tem (máy in nhãn của trại) → dán → chụp 1 ảnh xác nhận để kích hoạt tem.
class HarvestPage extends ConsumerStatefulWidget {
  const HarvestPage({super.key, required this.batchCode});

  final String batchCode;

  @override
  ConsumerState<HarvestPage> createState() => _HarvestPageState();
}

class _HarvestPageState extends ConsumerState<HarvestPage> {
  final _weight = TextEditingController();
  final _items = <HarvestedCrab>[];
  bool _saving = false;

  @override
  void dispose() {
    _weight.dispose();
    super.dispose();
  }

  Future<void> _record(CrabType crabType) async {
    if (_saving) return;
    final weight = int.tryParse(_weight.text.trim());
    if (weight == null || weight <= 0) return;
    setState(() => _saving = true);
    try {
      final tag = await ref
          .read(operatorRepositoryProvider)
          .recordHarvestedCrab(batchCode: widget.batchCode, weightG: weight);
      if (!mounted) return;
      setState(() {
        _items.insert(
          0,
          HarvestedCrab(
            tagCode: tag,
            weightG: weight,
            gradeCode: gradeFor(weightG: weight, crabType: crabType).code,
          ),
        );
        _weight.clear();
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Đã tạo tem minh hoạ $tag trong phiên này')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(apiErrorMessage(e))));
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  /// Demo only: mark the local row as photographed, without activating a server tag.
  Future<void> _activate(int index) async {
    if (_saving) return;
    setState(() => _saving = true);
    try {
      final photo = await ImagePicker().pickImage(
        source: ImageSource.camera,
        maxWidth: 1600,
        imageQuality: 85,
      );
      if (!mounted || photo == null) return;
      setState(() => _items[index] = _items[index].activate());
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Không mở được camera. Kiểm tra quyền camera rồi thử lại.',
            ),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final batch =
        (ref.watch(activeBatchesProvider).value ?? const <OperatorBatch>[])
            .where((b) => b.code == widget.batchCode)
            .firstOrNull;
    final crabType = batch?.crabType ?? CrabType.fattening;
    final weight = int.tryParse(_weight.text.trim());
    final grade = weight == null
        ? null
        : gradeFor(weightG: weight, crabType: crabType);
    final total = batch?.aliveCount ?? 0;

    return Scaffold(
      body: SafeArea(
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
          children: [
            SubPageHeader(title: 'Thu hoạch · ${widget.batchCode}'),
            const SizedBox(height: 16),
            const DemoNotice(),
            AppCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text.rich(
                    TextSpan(
                      children: [
                        TextSpan(
                          text: formatCount(_items.length),
                          style: const TextStyle(
                            fontSize: 26,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        TextSpan(
                          text: ' / ${formatCount(total)} con đã cân',
                          style: const TextStyle(color: AppColors.inkMuted),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 10),
                  SoftProgressBar(
                    value: total == 0 ? 0 : _items.length / total,
                    height: 10,
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            AppCard(
              child: Column(
                children: [
                  TextField(
                    controller: _weight,
                    onChanged: (_) => setState(() {}),
                    keyboardType: TextInputType.number,
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      fontSize: 48,
                      fontWeight: FontWeight.w700,
                      letterSpacing: -1,
                    ),
                    decoration: const InputDecoration(
                      hintText: '0',
                      suffixText: 'g',
                      filled: false,
                      border: InputBorder.none,
                    ),
                  ),
                  const SizedBox(height: 4),
                  AnimatedSwitcher(
                    duration: const Duration(milliseconds: 200),
                    child: grade == null
                        ? Text(
                            'Nhập khối lượng từ cân',
                            key: const ValueKey('hint'),
                            style: Theme.of(context).textTheme.bodySmall,
                          )
                        : InfoChip(
                            key: ValueKey(grade),
                            icon: Icons.workspace_premium_outlined,
                            label: 'Hạng ${grade.code} · ${grade.range}',
                            background: AppColors.accent,
                          ),
                  ),
                  const SizedBox(height: 14),
                  FilledButton.icon(
                    onPressed: _saving || weight == null || weight <= 0
                        ? null
                        : () => _record(crabType),
                    icon: const Icon(Icons.print_outlined),
                    label: const Text('Tạo tem minh hoạ'),
                  ),
                ],
              ),
            ),
            if (_items.isNotEmpty) const SectionHeader(title: 'Vừa cân'),
            for (final (i, item) in _items.indexed) ...[
              AppCard(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        IconTile(
                          icon: item.activated
                              ? Icons.qr_code_2_rounded
                              : Icons.print_outlined,
                          size: 42,
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                item.tagCode,
                                style: const TextStyle(
                                  fontWeight: FontWeight.w700,
                                  letterSpacing: 1,
                                ),
                              ),
                              Text(
                                '${item.weightG} g · hạng ${item.gradeCode}',
                                style: Theme.of(context).textTheme.bodySmall,
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    item.activated
                        ? const InfoChip(
                            icon: Icons.check_rounded,
                            label: 'Đã chụp mẫu',
                            background: Color(0xFFE3F2E9),
                            foreground: AppColors.success,
                          )
                        : TextButton.icon(
                            onPressed: _saving ? null : () => _activate(i),
                            icon: const Icon(
                              Icons.photo_camera_outlined,
                              size: 18,
                            ),
                            label: const Text('Ảnh minh hoạ'),
                          ),
                  ],
                ),
              ),
              const SizedBox(height: 8),
            ],
          ],
        ),
      ),
    );
  }
}
