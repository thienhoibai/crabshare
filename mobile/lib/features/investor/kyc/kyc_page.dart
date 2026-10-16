import 'package:flutter/services.dart';
import 'package:material_ui/material_ui.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/theme/app_theme.dart';
import '../../../core/api/api_client.dart';
import '../../../core/auth/session.dart';
import '../../../shared/widgets/app_ui.dart';
import '../data/investor_models.dart';
import 'kyc_camera.dart';
import 'kyc_repository.dart';

class KycPage extends ConsumerWidget {
  const KycPage({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) =>
      _KycForm(key: ValueKey(ref.watch(sessionProvider).user?.userId));
}

class _KycForm extends ConsumerStatefulWidget {
  const _KycForm({super.key});
  @override
  ConsumerState<_KycForm> createState() => _KycFormState();
}

class _KycFormState extends ConsumerState<_KycForm> {
  static const _labels = ['CCCD mặt trước', 'CCCD mặt sau', 'Ảnh khuôn mặt'];
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

  void _clearImages() {
    for (final image in _images) {
      if (image != null) {
        PaintingBinding.instance.imageCache.evict(MemoryImage(image.bytes));
      }
    }
    _images.fillRange(0, 3, null);
  }

  Future<void> _capture(int index) async {
    if (!_consent || _busy) return;
    setState(() {
      _capturing = index;
      _error = null;
    });
    try {
      final photo = await ref
          .read(kycCameraProvider)
          .capture(selfie: index == 2);
      if (!mounted || photo == null) return;
      setState(() {
        final previous = _images[index];
        if (previous != null) {
          PaintingBinding.instance.imageCache.evict(
            MemoryImage(previous.bytes),
          );
        }
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
      await ref
          .read(kycDetailsProvider.notifier)
          .verify(images: _images.cast<KycImage>(), consent: _consent);
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
                const SizedBox(height: 20),
                verification.when(
                  skipError: true,
                  loading: () => const LoadingSkeleton(),
                  error: (error, _) => ErrorView(
                    message: apiErrorMessage(error),
                    onRetry: () => ref.invalidate(kycDetailsProvider),
                  ),
                  data: (result) => Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      AppCard(
                        color: AppColors.ink,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              result.status == KycStatus.verified
                                  ? 'Đã xác minh danh tính'
                                  : result.status == KycStatus.rejected
                                  ? 'Xác minh không đạt — hãy thử lại'
                                  : 'Chưa xác minh danh tính',
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 18,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            const SizedBox(height: 6),
                            const Text(
                              'Cần xác minh trước khi góp vốn. CrabShare chỉ lưu kết quả xác minh.',
                              style: TextStyle(color: Color(0xFFBDB7B1)),
                            ),
                            if (result.failureReason != null) ...[
                              const SizedBox(height: 8),
                              Text(
                                result.failureReason!,
                                style: const TextStyle(color: AppColors.accent),
                              ),
                            ],
                          ],
                        ),
                      ),
                      if (result.status != KycStatus.verified) ...[
                        const SizedBox(height: 14),
                        const Text(
                          'Đồng ý điều khoản, chụp đủ 3 ảnh rồi gửi xác minh. Mỗi ảnh tối đa 5 MB.',
                        ),
                        CheckboxListTile(
                          key: const ValueKey('kyc-consent'),
                          contentPadding: EdgeInsets.zero,
                          controlAffinity: ListTileControlAffinity.leading,
                          value: _consent,
                          onChanged: _busy
                              ? null
                              : (value) =>
                                    setState(() => _consent = value ?? false),
                          title: const Text(
                            'Tôi đồng ý cho nhà cung cấp eKYC xử lý ảnh CCCD và khuôn mặt để xác minh danh tính.',
                          ),
                        ),
                        for (var i = 0; i < 3; i++) ...[
                          AppCard(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                Text(
                                  '${i + 1}. ${_labels[i]}',
                                  style: Theme.of(context)
                                      .textTheme
                                      .titleMedium,
                                ),
                                const SizedBox(height: 8),
                                if (_images[i] != null)
                                  ClipRRect(
                                    borderRadius: BorderRadius.circular(12),
                                    child: Image.memory(
                                      _images[i]!.bytes,
                                      height: 150,
                                      fit: BoxFit.contain,
                                      gaplessPlayback: true,
                                    ),
                                  ),
                                OutlinedButton.icon(
                                  key: ValueKey('kyc-capture-$i'),
                                  onPressed: !_consent || _busy
                                      ? null
                                      : () => _capture(i),
                                  icon: const Icon(Icons.photo_camera_outlined),
                                  label: Text(
                                    _capturing == i
                                        ? 'Đang mở camera…'
                                        : _images[i] == null
                                        ? 'Chụp ${_labels[i]}'
                                        : 'Chụp lại ${_labels[i]}',
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 10),
                        ],
                        FilledButton(
                          key: const ValueKey('kyc-submit'),
                          onPressed:
                              !_consent ||
                                  _busy ||
                                  _images.any((image) => image == null)
                              ? null
                              : _submit,
                          child: Text(
                            _sending ? 'Đang xác minh…' : 'Gửi xác minh',
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
                if (_error != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 12),
                    child: Text(
                      _error!,
                      style: const TextStyle(color: AppColors.danger),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
