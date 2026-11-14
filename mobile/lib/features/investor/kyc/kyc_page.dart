import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import '../../../app/theme/app_theme.dart';
import '../../../core/api/api_client.dart';
import '../../../core/auth/session.dart';
import '../../../shared/widgets/app_ui.dart';
import 'kyc_camera.dart';
import 'kyc_repository.dart';

/// Xác minh danh tính: đồng ý, chụp ba ảnh bằng camera (hai mặt giấy tờ và khuôn mặt), gửi.
/// Ảnh chỉ giữ trong bộ nhớ tới khi gửi xong.
class KycPage extends ConsumerWidget {
  const KycPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) =>
      _KycForm(key: ValueKey(ref.watch(sessionProvider.select((s) => s.user?.userId))));
}

class _KycForm extends ConsumerStatefulWidget {
  const _KycForm({super.key});

  @override
  ConsumerState<_KycForm> createState() => _KycFormState();
}

class _KycFormState extends ConsumerState<_KycForm> {
  static const _labels = ['Mặt trước', 'Mặt sau', 'Khuôn mặt'];
  final _images = List<KycImage?>.filled(3, null);
  bool _consent = false;
  bool _sending = false;
  int? _capturing;
  String? _error;

  bool get _busy => _sending || _capturing != null;

  @override
  void dispose() {
    _clearImages();
    super.dispose();
  }

  void _evict(KycImage? image) {
    if (image != null) PaintingBinding.instance.imageCache.evict(MemoryImage(image.bytes));
  }

  void _clearImages() {
    _images.forEach(_evict);
    _images.fillRange(0, 3, null);
  }

  Future<void> _capture(int index) async {
    if (!_consent || _busy) return;
    setState(() {
      _capturing = index;
      _error = null;
    });
    try {
      final photo = await ref.read(kycCameraProvider).capture(selfie: index == 2);
      if (!mounted || photo == null) return;
      setState(() {
        _evict(_images[index]);
        _images[index] = photo;
      });
    } on PlatformException catch (e) {
      if (mounted) {
        setState(
          () => _error = e.code.toLowerCase().contains('denied')
              ? 'Chưa có quyền camera. Cho phép camera trong cài đặt ứng dụng rồi thử lại.'
              : 'Không mở được camera. Hãy thử lại.',
        );
      }
    } on FormatException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } catch (_) {
      if (mounted) setState(() => _error = 'Không chụp được ảnh. Hãy thử lại.');
    } finally {
      if (mounted) setState(() => _capturing = null);
    }
  }

  Future<void> _submit() async {
    if (!_consent || _images.any((image) => image == null) || _busy) return;
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      await ref.read(kycDetailsProvider.notifier).verify(images: _images.cast<KycImage>(), consent: _consent);
      if (mounted) setState(_clearImages);
    } catch (e) {
      if (mounted) {
        setState(() => _error = apiErrorMessage(e));
        ref.invalidate(kycDetailsProvider);
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final verification = ref.watch(kycDetailsProvider);
    return PopScope(
      canPop: !_busy,
      child: Scaffold(
        body: SafeArea(
          child: AppRefreshIndicator(
            onRefresh: () async {
              if (!_busy) return await ref.refresh(kycDetailsProvider.future);
            },
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
              children: [
                const SubPageHeader(title: 'Xác minh danh tính'),
                const SizedBox(height: 16),
                verification.when(
                  skipError: true,
                  loading: () => const LoadingSkeleton(rows: 2),
                  error: (error, _) => ErrorView(
                    message: apiErrorMessage(error),
                    onRetry: () => ref.invalidate(kycDetailsProvider),
                  ),
                  data: (result) => Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      _StatusCard(result: result),
                      if (result.status != KycStatus.verified) ..._form(),
                    ],
                  ),
                ),
                if (_error != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 12),
                    child: Text(_error!, style: const TextStyle(color: AppColors.danger)),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  List<Widget> _form() => [
    const SizedBox(height: 8),
    CheckboxListTile(
      key: const ValueKey('kyc-consent'),
      contentPadding: EdgeInsets.zero,
      controlAffinity: ListTileControlAffinity.leading,
      activeColor: AppColors.ink,
      value: _consent,
      onChanged: _busy ? null : (value) => setState(() => _consent = value ?? false),
      title: const Text('Tôi đồng ý để ảnh giấy tờ và khuôn mặt được dùng cho việc xác minh danh tính.'),
    ),
    const SizedBox(height: 8),
    Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (var i = 0; i < 3; i++) ...[
          if (i > 0) const SizedBox(width: 10),
          Expanded(
            child: _CaptureTile(
              key: ValueKey('kyc-capture-$i'),
              label: _labels[i],
              icon: i == 2 ? Icons.face_outlined : Icons.badge_outlined,
              image: _images[i],
              busy: _capturing == i,
              onTap: !_consent || _busy ? null : () => _capture(i),
            ),
          ),
        ],
      ],
    ),
    const SizedBox(height: 18),
    FilledButton(
      key: const ValueKey('kyc-submit'),
      onPressed: !_consent || _busy || _images.any((image) => image == null) ? null : _submit,
      child: Text(_sending ? 'Đang xác minh…' : 'Gửi xác minh'),
    ),
  ];
}

class _StatusCard extends StatelessWidget {
  const _StatusCard({required this.result});
  final KycVerification result;

  @override
  Widget build(BuildContext context) {
    final verified = result.status == KycStatus.verified;
    return AppCard(
      color: AppColors.ink,
      child: Row(
        children: [
          IconTile(
            icon: verified ? Icons.verified_user_rounded : Icons.verified_user_outlined,
            background: verified ? AppColors.success : AppColors.accent,
            foreground: verified ? Colors.white : AppColors.ink,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  switch (result.status) {
                    KycStatus.verified => 'Đã xác minh danh tính',
                    KycStatus.rejected => 'Xác minh chưa đạt, hãy thử lại',
                    KycStatus.pending => 'Đang chờ xác minh',
                    KycStatus.unverified => 'Chưa xác minh danh tính',
                  },
                  style: const TextStyle(color: Colors.white, fontSize: 17, fontWeight: FontWeight.w700),
                ),
                if (result.failureReason != null && !verified) ...[
                  const SizedBox(height: 4),
                  Text(result.failureReason!, style: const TextStyle(color: AppColors.accent)),
                ] else if (!verified) ...[
                  const SizedBox(height: 2),
                  const Text('Cần có trước khi góp vốn', style: TextStyle(color: Colors.white70, fontSize: 13)),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Ô chụp một ảnh: bấm để mở camera, chụp xong hiện ảnh thu nhỏ, bấm lại để chụp lại.
class _CaptureTile extends StatelessWidget {
  const _CaptureTile({
    super.key,
    required this.label,
    required this.icon,
    required this.image,
    required this.busy,
    required this.onTap,
  });
  final String label;
  final IconData icon;
  final KycImage? image;
  final bool busy;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final enabled = onTap != null;
    return Semantics(
      button: true,
      enabled: enabled,
      label: image == null ? 'Chụp $label' : 'Chụp lại $label',
      child: Column(
        children: [
          Material(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(AppRadius.chip),
            clipBehavior: Clip.antiAlias,
            child: InkWell(
              onTap: onTap,
              child: SizedBox(
                height: 104,
                width: double.infinity,
                child: image != null
                    ? Image.memory(image!.bytes, fit: BoxFit.cover, gaplessPlayback: true)
                    : busy
                    ? const Center(child: SizedBox(width: 24, height: 24, child: CircularProgressIndicator(strokeWidth: 3)))
                    : Icon(icon, size: 30, color: enabled ? AppColors.accentText : AppColors.inkMuted),
              ),
            ),
          ),
          const SizedBox(height: 6),
          Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: enabled || image != null ? AppColors.ink : AppColors.inkMuted),
          ),
        ],
      ),
    );
  }
}
