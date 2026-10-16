import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../../../core/api/api_client.dart';
import '../../../core/format/money.dart';
import '../../../shared/widgets/app_ui.dart';
import '../data/operator_orders_repository.dart';
import '../data/packing_models.dart';
import 'ship_order_sheet.dart';

/// Chi tiết một đơn: Paid → quét tem đóng gói; Packed → giao cho nhà xe; Shipping → báo đã giao. Camera chỉ mở khi bấm Quét.
class PackOrderPage extends ConsumerStatefulWidget {
  const PackOrderPage({super.key, required this.orderNo});

  final String orderNo;

  @override
  ConsumerState<PackOrderPage> createState() => _PackOrderPageState();
}

class _PackOrderPageState extends ConsumerState<PackOrderPage> {
  final _manual = TextEditingController();
  final _tags = <String>[];
  OperatorOrderDetail? _order;
  Object? _loadError;
  bool _loading = true;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _manual.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _loadError = null;
    });
    try {
      final order = await ref
          .read(operatorOrdersRepositoryProvider)
          .detail(widget.orderNo);
      if (!mounted) return;
      setState(() {
        _order = order;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loadError = e;
        _loading = false;
      });
    }
  }

  void _addTag(String raw) {
    if (_saving) return;
    final code = _normalize(raw);
    if (code == null) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Mã tem gồm 12 ký tự.')));
      return;
    }
    if (_tags.contains(code)) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Tem $code đã có trong danh sách.')),
      );
      return;
    }
    setState(() => _tags.add(code));
    _manual.clear();
  }

  static String? _normalize(String raw) {
    var text = raw.trim().toUpperCase();
    final slash = text.lastIndexOf('/');
    if (slash >= 0 && slash < text.length - 1) text = text.substring(slash + 1);
    text = text.replaceAll(RegExp(r'[^A-Z0-9]'), '');
    if (text.length >= 12) text = text.substring(text.length - 12);
    return text.length == 12 ? text : null;
  }

  Future<void> _scan() async {
    final value = await Navigator.of(
      context,
    ).push<String>(MaterialPageRoute(builder: (_) => const _TagScannerPage()));
    if (value != null && mounted) _addTag(value);
  }

  Future<void> _pack() async {
    if (_saving || _tags.isEmpty) return;
    setState(() => _saving = true);
    try {
      final result = await ref
          .read(operatorOrdersRepositoryProvider)
          .pack(widget.orderNo, List.of(_tags));
      if (!mounted) return;
      setState(() {
        _order = result;
        _saving = false;
      });
      ref.invalidate(operatorOrdersProvider);
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Đã đóng gói đơn.')));
    } catch (e) {
      if (!mounted) return;
      setState(() => _saving = false);
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(apiErrorMessage(e))));
    }
  }

  Future<void> _run(
    Future<OperatorOrderDetail> Function() action,
    String done,
  ) async {
    setState(() => _saving = true);
    try {
      final result = await action();
      if (!mounted) return;
      setState(() {
        _order = result;
        _saving = false;
      });
      ref.invalidate(operatorOrdersProvider);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(done)));
    } catch (e) {
      if (!mounted) return;
      setState(() => _saving = false);
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(apiErrorMessage(e))));
    }
  }

  Future<void> _ship() async {
    final input = await showShipOrderSheet(context);
    if (input == null || !mounted) return;
    await _run(
      () => ref
          .read(operatorOrdersRepositoryProvider)
          .ship(widget.orderNo, input),
      'Đã giao cho nhà xe.',
    );
  }

  Future<void> _deliver() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Xác nhận đã giao'),
        content: const Text(
          'Chỉ xác nhận khi nhà xe báo khách đã nhận hàng. Từ lúc này khách có 72 giờ để báo lỗi trước khi đơn tự hoàn tất.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Huỷ'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Đã giao'),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    await _run(
      () => ref.read(operatorOrdersRepositoryProvider).deliver(widget.orderNo),
      'Đã báo giao hàng.',
    );
  }

  @override
  Widget build(BuildContext context) {
    final order = _order;
    return Scaffold(
      body: SafeArea(
        child: AppRefreshIndicator(
          onRefresh: () async {
            if (!_saving) await _load();
          },
          child: _loading
              ? ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  children: [
                    Padding(
                      padding: const EdgeInsets.all(20),
                      child: SubPageHeader(title: 'Đơn ${widget.orderNo}'),
                    ),
                    const LoadingSkeleton(),
                  ],
                )
              : _loadError != null
              ? ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
                  children: [
                    SubPageHeader(title: 'Đơn ${widget.orderNo}'),
                    const SizedBox(height: 16),
                    Text(apiErrorMessage(_loadError!)),
                    const SizedBox(height: 12),
                    FilledButton(
                      onPressed: _load,
                      child: const Text('Thử lại'),
                    ),
                  ],
                )
              : ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
                  children: [
                    SubPageHeader(title: 'Đơn ${widget.orderNo}'),
                    const SizedBox(height: 12),
                    if (order != null) ...[
                      AppCard(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              '${order.customerName} · ${order.batchCode}',
                              style: Theme.of(context).textTheme.titleMedium,
                            ),
                            const SizedBox(height: 4),
                            Text(
                              '${order.recipientName} · ${order.recipientPhone}',
                              style: Theme.of(context).textTheme.bodySmall,
                            ),
                            Text(
                              order.shippingAddress,
                              style: Theme.of(context).textTheme.bodySmall,
                            ),
                            const SizedBox(height: 8),
                            Text(
                              '${formatVnd(order.totalAmount)} · ${order.totalKg.toString().replaceAll('.', ',')} kg · ${operatorOrderStatusLabel(order.status)}',
                            ),
                          ],
                        ),
                      ),
                      const SectionHeader(title: 'Dòng hàng'),
                      for (final line in order.lines) ...[
                        AppCard(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                line.title,
                                style: const TextStyle(
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                              Text(
                                '${line.gradeName} · cần ${line.quantityKg} kg · đã gán ${line.assignedKg} kg (${line.assignedCount} con)',
                                style: Theme.of(context).textTheme.bodySmall,
                              ),
                              for (final tag in line.tags)
                                Text(
                                  '${tag.tagCode} · ${tag.weightG} g',
                                  style: const TextStyle(letterSpacing: 0.5),
                                ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 10),
                      ],
                      if (order.status == 'Paid') ...[
                        const SectionHeader(title: 'Tem đã quét'),
                        AppCard(
                          child: Column(
                            children: [
                              TextField(
                                controller: _manual,
                                enabled: !_saving,
                                onChanged: (_) => setState(() {}),
                                maxLength: 12,
                                textCapitalization:
                                    TextCapitalization.characters,
                                decoration: const InputDecoration(
                                  labelText: 'Nhập mã tem',
                                  counterText: '',
                                ),
                                onSubmitted: _addTag,
                              ),
                              const SizedBox(height: 8),
                              Row(
                                children: [
                                  Expanded(
                                    child: OutlinedButton.icon(
                                      onPressed: _saving ? null : _scan,
                                      icon: const Icon(
                                        Icons.qr_code_scanner_rounded,
                                      ),
                                      label: const Text('Quét'),
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                  Expanded(
                                    child: FilledButton(
                                      onPressed:
                                          _saving || _manual.text.trim().isEmpty
                                          ? null
                                          : () => _addTag(_manual.text),
                                      child: const Text('Thêm'),
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                        for (final code in _tags) ...[
                          const SizedBox(height: 8),
                          AppCard(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 12,
                              vertical: 8,
                            ),
                            child: Row(
                              children: [
                                Expanded(
                                  child: Text(
                                    code,
                                    style: const TextStyle(
                                      fontWeight: FontWeight.w700,
                                      letterSpacing: 1,
                                    ),
                                  ),
                                ),
                                IconButton(
                                  onPressed: _saving
                                      ? null
                                      : () =>
                                            setState(() => _tags.remove(code)),
                                  icon: const Icon(Icons.close_rounded),
                                ),
                              ],
                            ),
                          ),
                        ],
                        const SizedBox(height: 16),
                        FilledButton.icon(
                          onPressed: _saving || _tags.isEmpty ? null : _pack,
                          icon: const Icon(Icons.inventory_2_outlined),
                          label: Text(
                            _saving ? 'Đang đóng gói…' : 'Xác nhận đóng gói',
                          ),
                        ),
                      ] else ...[
                        if (order.shipment != null) ...[
                          const SectionHeader(title: 'Giao hàng'),
                          _ShipmentCard(shipment: order.shipment!),
                        ],
                        const SizedBox(height: 16),
                        if (order.status == 'Packed')
                          FilledButton.icon(
                            onPressed: _saving ? null : _ship,
                            icon: const Icon(Icons.local_shipping_outlined),
                            label: Text(
                              _saving ? 'Đang lưu…' : 'Giao cho nhà xe',
                            ),
                          )
                        else if (order.status == 'Shipping')
                          FilledButton.icon(
                            onPressed: _saving ? null : _deliver,
                            icon: const Icon(
                              Icons.check_circle_outline_rounded,
                            ),
                            label: Text(
                              _saving ? 'Đang lưu…' : 'Đã giao tới khách',
                            ),
                          )
                        else
                          InfoChip(
                            icon: Icons.check_rounded,
                            label:
                                'Đơn ${operatorOrderStatusLabel(order.status).toLowerCase()}',
                            background: const Color(0xFFE3F2E9),
                          ),
                      ],
                    ],
                  ],
                ),
        ),
      ),
    );
  }
}

class _ShipmentCard extends StatelessWidget {
  const _ShipmentCard({required this.shipment});

  final OrderShipment shipment;

  static String _at(DateTime d) =>
      '${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')} ${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';

  @override
  Widget build(BuildContext context) {
    final s = shipment;
    final small = Theme.of(context).textTheme.bodySmall;
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (s.carrierName != null)
            Text(
              'Nhà xe: ${s.carrierName}${s.vehiclePlate != null ? ' · ${s.vehiclePlate}' : ''}',
              style: const TextStyle(fontWeight: FontWeight.w700),
            ),
          if (s.driverPhone != null) Text('Tài xế: ${s.driverPhone}'),
          if (s.shippedAt != null)
            Text('Gửi lúc ${_at(s.shippedAt!)}', style: small),
          if (s.expectedArrivalAt != null && s.deliveredAt == null)
            Text('Dự kiến tới ${_at(s.expectedArrivalAt!)}', style: small),
          if (s.deliveredAt != null)
            Text('Đã giao lúc ${_at(s.deliveredAt!)}', style: small),
          if (s.receivedAt != null)
            Text('Khách xác nhận lúc ${_at(s.receivedAt!)}', style: small),
          if (s.returnWindowEndsAt != null && s.completedAt == null)
            Text('Hạn đổi trả ${_at(s.returnWindowEndsAt!)}', style: small),
          if (s.completedAt != null)
            Text('Hoàn tất lúc ${_at(s.completedAt!)}', style: small),
        ],
      ),
    );
  }
}

/// Màn camera tách riêng — không gắn vào cây widget cho tới khi người dùng bấm Quét.
class _TagScannerPage extends StatefulWidget {
  const _TagScannerPage();

  @override
  State<_TagScannerPage> createState() => _TagScannerPageState();
}

class _TagScannerPageState extends State<_TagScannerPage> {
  final _controller = MobileScannerController(
    detectionSpeed: DetectionSpeed.noDuplicates,
  );
  var _handled = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        child: Stack(
          children: [
            MobileScanner(
              controller: _controller,
              errorBuilder: (context, _) => const Center(
                child: Padding(
                  padding: EdgeInsets.all(28),
                  child: Text(
                    'Không mở được camera. Kiểm tra quyền camera, hoặc quay lại để nhập mã tem.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: Colors.white),
                  ),
                ),
              ),
              onDetect: (capture) {
                final value = capture.barcodes.firstOrNull?.rawValue;
                if (value == null || _handled) return;
                _handled = true;
                Navigator.of(context).pop(value);
              },
            ),
            Padding(
              padding: const EdgeInsets.all(16),
              child: CircleIconButton(
                icon: Icons.close_rounded,
                background: Colors.white24,
                foreground: Colors.white,
                onTap: () => Navigator.of(context).maybePop(),
              ),
            ),
            const Align(
              alignment: Alignment.bottomCenter,
              child: Padding(
                padding: EdgeInsets.only(bottom: 32),
                child: Text(
                  'Đưa tem vào khung hình',
                  style: TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
