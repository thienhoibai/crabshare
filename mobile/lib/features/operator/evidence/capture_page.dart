import 'dart:typed_data';

import 'package:material_ui/material_ui.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../../app/theme/app_theme.dart';
import '../../../core/api/api_client.dart';
import '../../../shared/widgets/app_ui.dart';
import '../data/operator_models.dart';
import '../data/operator_repository.dart';

/// Chụp bằng chứng: chọn số hộp → chụp TRỰC TIẾP bằng camera (không lấy ảnh có sẵn) → gửi.
/// Server ghi giờ nhận, vị trí, số hộp, băm ảnh và chạy nhận diện cua (TSK-13).
class CapturePage extends ConsumerStatefulWidget {
  const CapturePage({super.key, this.initialSlot});

  final String? initialSlot;

  @override
  ConsumerState<CapturePage> createState() => _CapturePageState();
}

class _CapturePageState extends ConsumerState<CapturePage> {
  final _search = TextEditingController();
  String? _slot;
  Uint8List? _photo;
  DateTime? _capturedAt;
  bool _sending = false;
  bool _onlyRequested = false;

  @override
  void initState() {
    super.initState();
    _slot = widget.initialSlot;
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  Future<void> _takePhoto() async {
    // Chỉ dùng camera; vị trí GPS và dấu thời gian sẽ thêm ở task bằng chứng (geolocator).
    final file = await ImagePicker().pickImage(source: ImageSource.camera, maxWidth: 1600, imageQuality: 85);
    if (file == null) return;
    final bytes = await file.readAsBytes();
    setState(() {
      _photo = bytes;
      _capturedAt = DateTime.now();
    });
  }

  Future<void> _send(BoxSlot box) async {
    setState(() => _sending = true);
    try {
      await ref.read(operatorRepositoryProvider).uploadEvidence(
            batchCode: box.batchCode!,
            slotCode: box.slotCode,
            bytes: _photo!,
            capturedAt: _capturedAt!,
          );
      ref.invalidate(captureRequestsProvider);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Đã gửi ảnh hộp ${box.slotCode}')));
      setState(() {
        _photo = null;
        _slot = null;
      });
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(apiErrorMessage(e))));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final boxes = ref.watch(boxesProvider).value ?? const <BoxSlot>[];
    final requested = {for (final r in ref.watch(captureRequestsProvider).value ?? const <CaptureRequest>[]) r.slotCode};
    final query = _search.text.trim();
    final visible = boxes
        .where((b) => b.status == SlotStatus.occupied)
        .where((b) => query.isEmpty || b.slotCode.contains(query))
        .where((b) => !_onlyRequested || requested.contains(b.slotCode))
        .toList();
    final selected = boxes.where((b) => b.slotCode == _slot).firstOrNull;

    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SubPageHeader(title: 'Chụp bằng chứng'),
              const SizedBox(height: 14),
              AppCard(
                color: AppColors.ink,
                padding: const EdgeInsets.all(14),
                child: const Row(
                  children: [
                    IconTile(icon: Icons.verified_outlined, background: AppColors.accent, foreground: AppColors.ink, size: 40),
                    SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        'Ảnh chụp trực tiếp trong app. Hệ thống ghi giờ máy chủ, vị trí và số hộp vào bằng chứng.',
                        style: TextStyle(color: Colors.white, fontSize: 13),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 14),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _search,
                      onChanged: (_) => setState(() {}),
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(hintText: 'Tìm số hộp', prefixIcon: Icon(Icons.search_rounded)),
                    ),
                  ),
                  const SizedBox(width: 10),
                  FilterChip(
                    label: Text('Yêu cầu (${requested.length})'),
                    selected: _onlyRequested,
                    onSelected: (v) => setState(() => _onlyRequested = v),
                    selectedColor: AppColors.accent,
                    backgroundColor: AppColors.surface,
                    side: BorderSide.none,
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Expanded(
                child: GridView.builder(
                  itemCount: visible.length,
                  gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(maxCrossAxisExtent: 76, mainAxisSpacing: 8, crossAxisSpacing: 8),
                  itemBuilder: (context, i) {
                    final box = visible[i];
                    final isSelected = box.slotCode == _slot;
                    final isRequested = requested.contains(box.slotCode);
                    return Material(
                      color: isSelected ? AppColors.ink : (isRequested ? AppColors.accent : AppColors.surface),
                      borderRadius: BorderRadius.circular(16),
                      child: InkWell(
                        borderRadius: BorderRadius.circular(16),
                        onTap: () => setState(() {
                          _slot = box.slotCode;
                          _photo = null;
                        }),
                        child: Center(
                          child: Text(
                            box.slotCode,
                            style: TextStyle(fontWeight: FontWeight.w700, color: isSelected ? Colors.white : AppColors.ink),
                          ),
                        ),
                      ),
                    );
                  },
                ),
              ),
              if (selected != null) _CaptureSheet(box: selected, photo: _photo, sending: _sending, onShoot: _takePhoto, onSend: () => _send(selected)),
            ],
          ),
        ),
      ),
    );
  }
}

class _CaptureSheet extends StatelessWidget {
  const _CaptureSheet({required this.box, required this.photo, required this.sending, required this.onShoot, required this.onSend});

  final BoxSlot box;
  final Uint8List? photo;
  final bool sending;
  final VoidCallback onShoot;
  final VoidCallback onSend;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 10, bottom: 16),
      child: AppCard(
        child: Row(
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(14),
              child: photo == null
                  ? Container(width: 64, height: 64, color: AppColors.surfaceMuted, child: const Icon(Icons.photo_camera_outlined))
                  : Image.memory(photo!, width: 64, height: 64, fit: BoxFit.cover),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Hộp ${box.slotCode}', style: Theme.of(context).textTheme.titleMedium),
                  Text(box.batchCode ?? '', style: Theme.of(context).textTheme.bodySmall),
                ],
              ),
            ),
            FilledButton(
              style: FilledButton.styleFrom(minimumSize: const Size(110, 48)),
              onPressed: sending ? null : (photo == null ? onShoot : onSend),
              child: Text(photo == null ? 'Chụp' : (sending ? 'Đang gửi…' : 'Gửi ảnh')),
            ),
          ],
        ),
      ),
    );
  }
}
