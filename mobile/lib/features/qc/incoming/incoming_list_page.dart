import 'package:material_ui/material_ui.dart';

import '../../../shared/widgets/nav_shell.dart';
import '../data/qc_models.dart';
import '../widgets/task_rows.dart';

/// Tab "Đầu vào": các phiếu nhận hàng đang chờ tôi kiểm.
class IncomingListPage extends StatelessWidget {
  const IncomingListPage({super.key});

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
              child: Text('Kiểm đầu vào', style: Theme.of(context).textTheme.headlineMedium),
            ),
            const Expanded(
              child: KindTaskList(
                kinds: [QcKinds.incoming],
                emptyIcon: Icons.fact_check_outlined,
                emptyTitle: 'Chưa có phiếu nhận nào chờ bạn kiểm',
                bottomPadding: kNavBarClearance,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
