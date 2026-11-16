import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../../app/routes.dart';
import '../../../app/theme/app_theme.dart';
import '../../../shared/widgets/app_parts.dart';
import '../../../shared/widgets/nav_shell.dart';
import '../data/qc_models.dart';
import '../widgets/task_rows.dart';

/// Tab "Phân hạng": buổi đo được phân cho tôi (mỗi Lô một việc) và các con bị giữ lại chờ tôi xác nhận lần hai.
/// Việc của một Lô tự đóng khi mọi con đã có quyết định, nên có ô mở Lô theo mã để xem lại hoặc đổi hạng.
class GradingListPage extends StatelessWidget {
  const GradingListPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 4),
              child: Text('Duyệt phân hạng', style: Theme.of(context).textTheme.headlineMedium),
            ),
            const Expanded(
              child: KindTaskList(
                kinds: [QcKinds.grading, QcKinds.second],
                emptyIcon: Icons.straighten_rounded,
                emptyTitle: 'Chưa có buổi đo nào được phân cho bạn',
                bottomPadding: kNavBarClearance,
                footer: _OpenByCode(),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _OpenByCode extends StatefulWidget {
  const _OpenByCode();
  @override
  State<_OpenByCode> createState() => _OpenByCodeState();
}

class _OpenByCodeState extends State<_OpenByCode> {
  final _code = TextEditingController();

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  void _open() {
    final code = _code.text.trim().toUpperCase();
    if (code.isNotEmpty) context.push(Routes.qcGradingBatch(code));
  }

  @override
  Widget build(BuildContext context) {
    return MoreSection(
      label: 'Mở Lô khác theo mã',
      children: [
        Row(
          children: [
            Expanded(
              child: TextField(
                controller: _code,
                textCapitalization: TextCapitalization.characters,
                textInputAction: TextInputAction.go,
                onSubmitted: (_) => _open(),
                decoration: const InputDecoration(labelText: 'Mã Lô'),
              ),
            ),
            const SizedBox(width: 10),
            FilledButton(
              style: FilledButton.styleFrom(minimumSize: const Size(84, 52), backgroundColor: AppColors.ink),
              onPressed: _open,
              child: const Text('Mở'),
            ),
          ],
        ),
      ],
    );
  }
}
