import 'package:material_ui/material_ui.dart';

import '../data/packing_models.dart';

/// UC30 — hộ nuôi khai nhà xe khi giao đơn Packed. Trả về null nếu người dùng đóng sheet.
Future<ShipOrderInput?> showShipOrderSheet(BuildContext context) =>
    showModalBottomSheet<ShipOrderInput>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (context) => Padding(
        padding: EdgeInsets.only(
          bottom: MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: const ShipOrderSheet(),
      ),
    );

class ShipOrderSheet extends StatefulWidget {
  const ShipOrderSheet({super.key});

  @override
  State<ShipOrderSheet> createState() => _ShipOrderSheetState();
}

class _ShipOrderSheetState extends State<ShipOrderSheet> {
  static final _phone = RegExp(r'^(0\d{9}|\+84\d{9})$');
  static const _etaHours = <int?>[null, 2, 4, 8, 24];

  final _form = GlobalKey<FormState>();
  final _carrier = TextEditingController();
  final _plate = TextEditingController();
  final _driverPhone = TextEditingController();
  final _note = TextEditingController();
  int? _eta;

  @override
  void dispose() {
    _carrier.dispose();
    _plate.dispose();
    _driverPhone.dispose();
    _note.dispose();
    super.dispose();
  }

  void _submit() {
    if (!_form.currentState!.validate()) return;
    final plate = _plate.text.trim();
    final note = _note.text.trim();
    Navigator.of(context).pop(
      ShipOrderInput(
        carrierName: _carrier.text.trim(),
        driverPhone: _driverPhone.text.trim(),
        vehiclePlate: plate.isEmpty ? null : plate.toUpperCase(),
        expectedArrivalAt: _eta == null
            ? null
            : DateTime.now().add(Duration(hours: _eta!)),
        note: note.isEmpty ? null : note,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
      child: Form(
        key: _form,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Giao cho nhà xe',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 4),
            Text(
              'Nền tảng không thu phí vận chuyển. Khách sẽ gọi thẳng cho tài xế theo số bạn nhập.',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _carrier,
              maxLength: 150,
              decoration: const InputDecoration(
                labelText: 'Tên nhà xe',
                counterText: '',
              ),
              validator: (v) =>
                  (v ?? '').trim().isEmpty ? 'Nhập tên nhà xe.' : null,
            ),
            TextFormField(
              controller: _plate,
              maxLength: 20,
              textCapitalization: TextCapitalization.characters,
              decoration: const InputDecoration(
                labelText: 'Biển số xe (không bắt buộc)',
                counterText: '',
              ),
            ),
            TextFormField(
              controller: _driverPhone,
              maxLength: 12,
              keyboardType: TextInputType.phone,
              decoration: const InputDecoration(
                labelText: 'Số điện thoại tài xế',
                counterText: '',
              ),
              validator: (v) => _phone.hasMatch((v ?? '').trim())
                  ? null
                  : 'Cần 10 chữ số bắt đầu bằng 0, hoặc dạng +84.',
            ),
            const SizedBox(height: 12),
            Text(
              'Dự kiến tới khách sau',
              style: Theme.of(context).textTheme.labelLarge,
            ),
            const SizedBox(height: 6),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final h in _etaHours)
                  ChoiceChip(
                    label: Text(h == null ? 'Không rõ' : '$h giờ'),
                    selected: _eta == h,
                    onSelected: (_) => setState(() => _eta = h),
                  ),
              ],
            ),
            TextFormField(
              controller: _note,
              maxLength: 300,
              maxLines: 2,
              decoration: const InputDecoration(
                labelText: 'Ghi chú cho khách (không bắt buộc)',
                counterText: '',
              ),
            ),
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: _submit,
              icon: const Icon(Icons.local_shipping_outlined),
              label: const Text('Lưu và giao'),
            ),
          ],
        ),
      ),
    );
  }
}
