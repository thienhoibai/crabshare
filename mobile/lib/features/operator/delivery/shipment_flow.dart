import 'package:material_ui/material_ui.dart';

import '../../../app/theme/app_theme.dart';
import 'delivery_models.dart';

enum FlowState { done, now, todo, bad }

class FlowStep {
  const FlowStep(this.label, this.state);
  final String label;
  final FlowState state;
}

/// Bốn bước của một chuyến giao: xuất hàng, giao tới khách, khách xác nhận, thu tiền.
List<FlowStep> shipmentSteps(Shipment s) {
  final acc = s.acceptance;
  final confirmed = acc?.customerConfirmedAt != null;
  final paid = acc?.balancePaidAt != null || (confirmed && (acc?.balanceDue ?? 0) == 0);
  return [
    FlowStep(
      'Xuất hàng',
      s.dispatchedAt != null
          ? FlowState.done
          : s.needsDispatch
          ? FlowState.now
          : FlowState.todo,
    ),
    FlowStep(
      'Giao tới khách',
      acc != null
          ? FlowState.done
          : s.status == 'Dispatched'
          ? FlowState.now
          : FlowState.todo,
    ),
    FlowStep(
      s.refused ? 'Khách từ chối' : 'Khách xác nhận',
      s.refused
          ? FlowState.bad
          : confirmed
          ? FlowState.done
          : acc != null
          ? FlowState.now
          : FlowState.todo,
    ),
    FlowStep(
      'Thu tiền',
      s.refused
          ? FlowState.todo
          : paid
          ? FlowState.done
          : confirmed
          ? FlowState.now
          : FlowState.todo,
    ),
  ];
}

/// Dải bước nằm ngang ở đầu màn chuyến giao: chấm tròn nối nhau, nhãn ngắn bên dưới.
class ShipmentFlow extends StatelessWidget {
  const ShipmentFlow({super.key, required this.steps});
  final List<FlowStep> steps;

  static Color _color(FlowState state) => switch (state) {
    FlowState.done => AppColors.success,
    FlowState.now => AppColors.accent,
    FlowState.bad => AppColors.danger,
    FlowState.todo => AppColors.surfaceMuted,
  };

  @override
  Widget build(BuildContext context) {
    Widget line(bool visible, bool filled) => Expanded(
      child: Container(height: 3, color: !visible ? Colors.transparent : (filled ? AppColors.success : AppColors.surfaceMuted)),
    );
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final (i, step) in steps.indexed)
          Expanded(
            child: Semantics(
              label: '${step.label}: ${switch (step.state) {
                FlowState.done => 'đã xong',
                FlowState.now => 'đang làm',
                FlowState.bad => 'không thành',
                FlowState.todo => 'chưa tới',
              }}',
              child: ExcludeSemantics(
                child: Column(
                  children: [
                    Row(
                      children: [
                        line(i > 0, i > 0 && steps[i - 1].state == FlowState.done),
                        Container(
                          width: 24,
                          height: 24,
                          decoration: BoxDecoration(color: _color(step.state), shape: BoxShape.circle),
                          child: switch (step.state) {
                            FlowState.done => const Icon(Icons.check_rounded, size: 16, color: Colors.white),
                            FlowState.bad => const Icon(Icons.close_rounded, size: 16, color: Colors.white),
                            FlowState.now => const Icon(Icons.circle, size: 8, color: Colors.white),
                            FlowState.todo => null,
                          },
                        ),
                        line(i < steps.length - 1, step.state == FlowState.done),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Text(
                      step.label,
                      textAlign: TextAlign.center,
                      maxLines: 2,
                      style: TextStyle(
                        fontSize: 12,
                        height: 1.2,
                        fontWeight: step.state == FlowState.now ? FontWeight.w700 : FontWeight.w500,
                        color: step.state == FlowState.todo ? AppColors.inkMuted : AppColors.ink,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
      ],
    );
  }
}
