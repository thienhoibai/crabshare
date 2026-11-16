import 'package:material_ui/material_ui.dart';

import '../../../shared/widgets/app_ui.dart';
import '../data/qc_models.dart';
import '../widgets/task_rows.dart';

/// Nút giữa "Thăm trại": các lần thăm trại giữa vụ được phân cho tôi.
class SiteVisitsPage extends StatelessWidget {
  const SiteVisitsPage({super.key});

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: EdgeInsets.fromLTRB(20, 12, 20, 8),
              child: SubPageHeader(title: 'Thăm trại giữa vụ'),
            ),
            Expanded(
              child: KindTaskList(
                kinds: [QcKinds.visit],
                emptyIcon: Icons.place_outlined,
                emptyTitle: 'Chưa có lần thăm trại nào được phân cho bạn',
              ),
            ),
          ],
        ),
      ),
    );
  }
}
