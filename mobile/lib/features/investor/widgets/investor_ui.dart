import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:material_ui/material_ui.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../app/theme/app_images.dart';
import '../../../app/theme/app_theme.dart';
import '../../../core/api/api_client.dart';
import '../../../core/format/dates.dart';
import '../../../core/format/money.dart';
import '../../../shared/widgets/app_parts.dart';
import '../../../shared/widgets/app_ui.dart';
import '../data/portfolio_models.dart';

/// Phần dùng chung của khu nhà đầu tư: mở web, ảnh theo loại cua, thẻ ba số tiền, hàng chip chọn mục.

/// Các trang làm trên web CrabShare (thanh toán VietQR, ký hợp đồng, góp ý quyết toán).
abstract final class WebPaths {
  static String contribute(String batchCode) => '/nha-dau-tu/gop-von/${Uri.encodeComponent(batchCode)}';
  static String preorder(String batchCode) => '/khach/dat-truoc/${Uri.encodeComponent(batchCode)}';
  static String portfolio(String batchCode) => '/nha-dau-tu/danh-muc/${Uri.encodeComponent(batchCode)}';
  static const contracts = '/nha-dau-tu/hop-dong';
  static String settlement(int id) => '/nha-dau-tu/quyet-toan/$id';
}

/// Mở một địa chỉ bằng trình duyệt của máy. Test thay bằng bản giả.
final webLauncherProvider = Provider<Future<bool> Function(Uri)>(
  (ref) => (uri) => launchUrl(uri, mode: LaunchMode.externalApplication),
);

/// Mở `webUrl + path`; không mở được thì báo ngắn ở đáy màn hình.
Future<void> openWeb(BuildContext context, WidgetRef ref, String path) async {
  var opened = false;
  try {
    opened = await ref.read(webLauncherProvider)(Uri.parse('$webUrl$path'));
  } catch (_) {
    opened = false;
  }
  if (!opened && context.mounted) showAppToast(context, 'Không mở được trình duyệt. Hãy thử lại.', error: true);
}

/// Ảnh minh hoạ theo loại cua.
String crabImage(String crabType) => switch (crabType) {
  'FatteningMudCrab' => AppImages.crabFattening,
  'RoeCrab' || 'OilRoeCrab' || 'YoungFemaleCrab' => AppImages.crabRoe,
  'SoftShellCrab' => AppImages.crabSoft,
  _ => AppImages.crabBasket,
};

/// 12/11/2026 19:06
String dateTimeText(DateTime value) => '${formatDate(value)} ${formatTime(value)}';

final _ratio = NumberFormat('#,##0.##', 'vi_VN');

/// "60%" từ tỷ lệ vốn 0,6. Đây là tỷ lệ vốn góp trong Lô.
String ratioText(double? ratio) => ratio == null ? '—' : '${_ratio.format(ratio * 100)}%';

/// Thẻ nền tối với ba số đã ghi nhận: đã góp (số lớn), đã giải ngân theo mốc và còn giữ.
class MoneyCard extends StatelessWidget {
  const MoneyCard({super.key, required this.title, required this.figures, this.sub, this.partsKnown = true});
  final String title;
  final MoneyFigures figures;
  final String? sub;

  /// false khi máy chủ chưa cho hai số đã giải ngân và còn giữ (Lô chưa chốt vốn): chỉ hiện số đã góp.
  final bool partsKnown;

  @override
  Widget build(BuildContext context) {
    final share = figures.contributed <= 0 ? 0.0 : figures.disbursed / figures.contributed;
    return AppCard(
      color: AppColors.ink,
      padding: const EdgeInsets.all(18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: const TextStyle(color: Colors.white70, fontSize: 13)),
          const SizedBox(height: 4),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(
              formatVnd(figures.contributed),
              style: AppFonts.figure(34, color: Colors.white),
            ),
          ),
          if (sub != null) ...[
            const SizedBox(height: 2),
            Text(sub!, style: const TextStyle(color: AppColors.accent, fontSize: 13, fontWeight: FontWeight.w600)),
          ],
          if (partsKnown) ...[
            const SizedBox(height: 14),
            Semantics(
              label: 'Phần đã giải ngân theo mốc trên số đã góp',
              child: SoftProgressBar(value: share),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(child: _Part(color: AppColors.accent, label: 'Đã giải ngân', amount: figures.disbursed)),
                const SizedBox(width: 12),
                Expanded(child: _Part(color: AppColors.surfaceMuted, label: 'Còn giữ', amount: figures.held)),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _Part extends StatelessWidget {
  const _Part({required this.color, required this.label, required this.amount});
  final Color color;
  final String label;
  final int amount;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Container(width: 8, height: 8, decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
            const SizedBox(width: 6),
            Flexible(
              child: Text(label, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.white70, fontSize: 12)),
            ),
          ],
        ),
        const SizedBox(height: 2),
        Text(formatVnd(amount), style: const TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.w700)),
      ],
    );
  }
}

/// Nút viền bo tròn cao 52 px cho thao tác phụ, cùng dáng với nút chính của app.
ButtonStyle outlinedPillStyle({Color color = AppColors.ink}) => OutlinedButton.styleFrom(
  minimumSize: const Size.fromHeight(52),
  foregroundColor: color,
  side: BorderSide(color: color.withValues(alpha: 0.35)),
  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.pill)),
  textStyle: const TextStyle(fontFamily: AppFonts.text, fontSize: 15, fontWeight: FontWeight.w600),
);

/// Một hàng chip bo tròn cuộn ngang để chọn bộ lọc hoặc mục của màn (chạm rộng 44 px trở lên).
class PillTabs<T> extends StatelessWidget {
  const PillTabs({super.key, required this.items, required this.value, required this.onChanged, this.wrap = false});
  final List<(T, String)> items;
  final T value;
  final ValueChanged<T> onChanged;

  /// true: xuống hàng để mọi lựa chọn luôn nhìn thấy (các mục của một màn); false: một hàng cuộn ngang (bộ lọc).
  final bool wrap;

  Widget _chip((T, String) item) {
    final (key, label) = item;
    final selected = key == value;
    return ChoiceChip(
      label: Text(label),
      selected: selected,
      onSelected: (_) => onChanged(key),
      showCheckmark: false,
      materialTapTargetSize: MaterialTapTargetSize.padded,
      labelPadding: const EdgeInsets.symmetric(horizontal: 6),
      backgroundColor: AppColors.surface,
      selectedColor: AppColors.ink,
      labelStyle: TextStyle(color: selected ? Colors.white : AppColors.ink, fontWeight: FontWeight.w600),
      side: BorderSide.none,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.pill)),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (wrap) return Wrap(spacing: 8, children: [for (final item in items) _chip(item)]);
    return SizedBox(
      height: 48,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: items.length,
        separatorBuilder: (_, _) => const SizedBox(width: 8),
        itemBuilder: (context, i) => _chip(items[i]),
      ),
    );
  }
}

/// Khung của một màn con: nút quay lại và tiêu đề, kéo để tải lại, đủ ba trạng thái tải, lỗi, có dữ liệu.
class SubPageBody<T> extends StatelessWidget {
  const SubPageBody({
    super.key,
    required this.title,
    required this.value,
    required this.onRefresh,
    required this.children,
    this.trailing,
  });
  final String title;
  final AsyncValue<T> value;
  final Future<dynamic> Function() onRefresh;
  final List<Widget> Function(T) children;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: AppRefreshIndicator(
        onRefresh: onRefresh,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
          children: [
            SubPageHeader(title: title, trailing: trailing),
            const SizedBox(height: 16),
            ...value.when(
              skipLoadingOnReload: true,
              loading: () => const [LoadingSkeleton(rows: 2)],
              error: (error, _) => [
                ErrorView(
                  message: apiErrorMessage(error),
                  onRetry: () async {
                    try {
                      await onRefresh();
                    } catch (_) {
                      /* Lỗi nằm lại trong provider và hiện ở đây. */
                    }
                  },
                ),
              ],
              data: children,
            ),
          ],
        ),
      ),
    );
  }
}

/// Ghi chú một dòng ở đầu một mục: chưa lấy được số liệu phụ, Lô chưa chốt vốn...
class QuietNote extends StatelessWidget {
  const QuietNote(this.text, {super.key});
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 8),
    child: Text(text, style: Theme.of(context).textTheme.bodySmall),
  );
}

/// Lỗi của một mục trong màn (không chiếm cả màn): một dòng và nút thử lại.
class SectionError extends StatelessWidget {
  const SectionError({super.key, required this.error, required this.onRetry});
  final Object error;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => AppCard(
    child: Row(
      children: [
        Expanded(child: Text(apiErrorMessage(error))),
        TextButton(onPressed: onRetry, child: const Text('Thử lại')),
      ],
    ),
  );
}

/// Chỗ chờ gọn của một mục trong màn.
class SectionLoading extends StatelessWidget {
  const SectionLoading({super.key});

  @override
  Widget build(BuildContext context) => const Padding(
    padding: EdgeInsets.symmetric(vertical: 28),
    child: Center(child: SizedBox(width: 26, height: 26, child: CircularProgressIndicator(strokeWidth: 3))),
  );
}
