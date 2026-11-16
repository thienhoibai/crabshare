import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../../app/theme/app_theme.dart';
import '../../../core/capture/captured_photo.dart';
import '../../../shared/status_labels.dart';
import '../../../shared/widgets/app_parts.dart';
import '../../../shared/widgets/app_ui.dart';
import '../customer_routes.dart';
import '../data/customer_models.dart';
import '../data/customer_providers.dart';
import '../widgets/customer_parts.dart';

/// Báo vấn đề về hàng đã nhận: chọn đợt giao và quy cách, loại yêu cầu, vấn đề, số con hoặc số kg, mô tả và một ảnh chụp
/// bằng camera trong ứng dụng. Mỗi chuyến giao một khiếu nại, gửi trong hạn đổi trả.
class ClaimFormPage extends ConsumerStatefulWidget {
  const ClaimFormPage({super.key, required this.orderNo, this.shipmentNo});
  final String orderNo;

  /// Chuyến giao chọn sẵn khi mở từ một chuyến cụ thể.
  final String? shipmentNo;

  @override
  ConsumerState<ClaimFormPage> createState() => _ClaimFormPageState();
}

class _ClaimFormPageState extends ConsumerState<ClaimFormPage> {
  late String? _shipmentNo = widget.shipmentNo;
  String? _specCode;
  String _claimType = 'Complaint';
  String _issueType = 'Dead';
  final _crabs = TextEditingController();
  final _kg = TextEditingController();
  final _description = TextEditingController();
  CapturedPhoto? _photo;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _crabs.dispose();
    _kg.dispose();
    _description.dispose();
    super.dispose();
  }

  Future<void> _submit(Shipment shipment, ShipmentLine line) async {
    final crabs = int.tryParse(_crabs.text.trim());
    final kg = double.tryParse(_kg.text.trim().replaceAll(',', '.'));
    final description = _description.text.trim();
    final photo = _photo;
    final problem = (crabs ?? 0) <= 0 && (kg ?? 0) <= 0
        ? 'Ghi số con hoặc số kg bị ảnh hưởng.'
        : (crabs ?? 0) > (line.acceptedCrabs ?? 0) || (kg ?? 0) > (line.acceptedKg ?? 0)
        ? 'Số bị ảnh hưởng không vượt số đã nghiệm thu.'
        : description.length < 3
        ? 'Mô tả sự việc ít nhất 3 ký tự.'
        : photo == null
        ? 'Cần một ảnh chụp bằng chứng.'
        : null;
    if (problem != null || photo == null) {
      setState(() => _error = problem);
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final claim = await ref
          .read(customerActionsProvider)
          .createClaim(
            widget.orderNo,
            ClaimDraft(
              shipmentNo: shipment.shipmentNo,
              specCode: line.specCode,
              claimType: _claimType,
              issueType: _issueType,
              affectedCrabs: (crabs ?? 0) > 0 ? crabs : null,
              affectedKg: (kg ?? 0) > 0 ? kg : null,
              description: description,
              photo: photo,
            ),
          );
      if (!mounted) return;
      showAppToast(context, 'Đã gửi cho người nuôi.');
      context.pushReplacement(CustomerRoutes.claim(claim.claimNo));
    } catch (error) {
      if (mounted) {
        setState(() {
          _error = customerErrorMessage(error);
          _busy = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    const header = SubPageHeader(title: 'Báo vấn đề');
    final order = ref.watch(orderProvider(widget.orderNo)).value;
    final known = ref.watch(orderClaimsProvider(widget.orderNo)).value ?? const <Claim>[];
    return Scaffold(
      body: SafeArea(
        child: AsyncContent<OrderDeliveries>(
          value: ref.watch(orderDeliveriesProvider(widget.orderNo)),
          onRefresh: () => ref.refresh(orderDeliveriesProvider(widget.orderNo).future),
          header: const Padding(padding: EdgeInsets.fromLTRB(20, 12, 20, 0), child: header),
          data: (d) {
            final shipments = [
              for (final s in d.shipments)
                if (s.inReturnWindow() && !known.any((c) => c.shipmentNo == s.shipmentNo)) s,
            ];
            final shipment = shipments.where((s) => s.shipmentNo == _shipmentNo).firstOrNull ?? shipments.firstOrNull;
            final lines = [
              for (final l in shipment?.lines ?? const <ShipmentLine>[])
                if ((l.acceptedCrabs ?? 0) > 0) l,
            ];
            final line = lines.where((l) => l.specCode == _specCode).firstOrNull ?? lines.firstOrNull;
            String specName(String code) => order?.specName(code) ?? code;
            final label = Theme.of(context).textTheme.titleMedium;

            return ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
              children: [
                header,
                if (shipment == null || line == null)
                  const EmptyState(icon: Icons.event_busy_outlined, title: 'Không còn chuyến giao nào trong hạn đổi trả')
                else ...[
                  if (shipments.length > 1) ...[
                    const SizedBox(height: 16),
                    Text('Đợt giao', style: label),
                    const SizedBox(height: 8),
                    PillChoice<String>(
                      options: [for (final s in shipments) (s.shipmentNo, 'Đợt ${s.trancheSeq}')],
                      value: shipment.shipmentNo,
                      onChanged: (v) => setState(() {
                        _shipmentNo = v;
                        _specCode = null;
                      }),
                    ),
                  ],
                  if (lines.length > 1) ...[
                    const SizedBox(height: 16),
                    Text('Quy cách', style: label),
                    const SizedBox(height: 8),
                    PillChoice<String>(
                      options: [for (final l in lines) (l.specCode, specName(l.specCode))],
                      value: line.specCode,
                      onChanged: (v) => setState(() => _specCode = v),
                    ),
                  ],
                  const SizedBox(height: 16),
                  Text('Bạn muốn', style: label),
                  const SizedBox(height: 8),
                  PillChoice<String>(
                    options: statusOptions('claimType').reversed.toList(),
                    value: _claimType,
                    onChanged: (v) => setState(() => _claimType = v),
                  ),
                  const SizedBox(height: 16),
                  Text('Vấn đề', style: label),
                  const SizedBox(height: 8),
                  PillChoice<String>(
                    options: statusOptions('issueType'),
                    value: _issueType,
                    onChanged: (v) => setState(() => _issueType = v),
                  ),
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      Expanded(
                        child: TextField(
                          controller: _crabs,
                          enabled: !_busy,
                          keyboardType: TextInputType.number,
                          inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                          decoration: const InputDecoration(labelText: 'Số con', suffixText: 'con'),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: TextField(
                          controller: _kg,
                          enabled: !_busy,
                          keyboardType: const TextInputType.numberWithOptions(decimal: true),
                          inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]'))],
                          decoration: const InputDecoration(labelText: 'hoặc số kg', suffixText: 'kg'),
                        ),
                      ),
                    ],
                  ),
                  Padding(
                    padding: const EdgeInsets.only(top: 6, left: 4),
                    child: Text(
                      'Đã nghiệm thu ${crabsAndKg(line.acceptedCrabs ?? 0, line.acceptedKg)}',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _description,
                    enabled: !_busy,
                    minLines: 2,
                    maxLines: 4,
                    maxLength: 1000,
                    decoration: const InputDecoration(labelText: 'Mô tả', counterText: ''),
                  ),
                  const SizedBox(height: 12),
                  PhotoField(photo: _photo, label: 'Chụp ảnh bằng chứng', onChanged: (p) => setState(() => _photo = p)),
                  if (_error != null) ...[
                    const SizedBox(height: 10),
                    Text(_error!, style: const TextStyle(color: AppColors.danger)),
                  ],
                  const SizedBox(height: 16),
                  FilledButton(
                    onPressed: _busy ? null : () => _submit(shipment, line),
                    child: Text(_busy ? 'Đang gửi…' : 'Gửi'),
                  ),
                ],
              ],
            );
          },
        ),
      ),
    );
  }
}
