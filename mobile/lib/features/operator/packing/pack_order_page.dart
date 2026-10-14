import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../../../core/api/api_client.dart';
import '../../../core/format/money.dart';
import '../../../shared/widgets/app_ui.dart';
import '../data/operator_repository.dart';
import '../data/packing_models.dart';

/// Chi tiết một đơn Paid: nhập/quét tem, xác nhận đóng gói. Camera chỉ mở khi bấm Quét.
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
      final order = await ref.read(operatorRepositoryProvider).orderDetail(widget.orderNo);
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
    final code = _normalize(raw);
    if (code == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Mã tem gồm 12 ký tự.')));
      return;
    }
    if (_tags.contains(code)) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Tem $code đã có trong danh sách.')));
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
    final value = await Navigator.of(context).push<String>(MaterialPageRoute(builder: (_) => const _TagScannerPage()));
    if (value != null && mounted) _addTag(value);
  }

  Future<void> _pack() async {
    if (_tags.isEmpty) return;
    setState(() => _saving = true);
    try {
      final result = await ref.read(operatorRepositoryProvider).packOrder(widget.orderNo, List.of(_tags));
      if (!mounted) return;
      setState(() {
        _order = result;
        _saving = false;
      });
      ref.invalidate(ordersToPackProvider);
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Đã đóng gói đơn.')));
    } catch (e) {
      if (!mounted) return;
      setState(() => _saving = false);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(apiErrorMessage(e))));
    }
  }

  @override
  Widget build(BuildContext context) {
    final order = _order;
    return Scaffold(
      body: SafeArea(
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : _loadError != null
                ? ListView(padding: const EdgeInsets.fromLTRB(20, 12, 20, 32), children: [
                    SubPageHeader(title: 'Đơn ${widget.orderNo}'),
                    const SizedBox(height: 16),
                    Text('$_loadError'),
                    const SizedBox(height: 12),
                    FilledButton(onPressed: _load, child: const Text('Thử lại')),
                  ])
                : ListView(
                    padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
                    children: [
                      SubPageHeader(title: 'Đơn ${widget.orderNo}'),
                      const SizedBox(height: 12),
                      if (order != null) ...[
                        AppCard(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('${order.customerName} · ${order.batchCode}', style: Theme.of(context).textTheme.titleMedium),
                              const SizedBox(height: 4),
                              Text('${order.recipientName} · ${order.recipientPhone}', style: Theme.of(context).textTheme.bodySmall),
                              Text(order.shippingAddress, style: Theme.of(context).textTheme.bodySmall),
                              const SizedBox(height: 8),
                              Text('${formatVnd(order.totalAmount)} · ${order.totalKg.toString().replaceAll('.', ',')} kg · ${order.status}'),
                            ],
                          ),
                        ),
                        const SectionHeader(title: 'Dòng hàng'),
                        for (final line in order.lines) ...[
                          AppCard(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(line.title, style: const TextStyle(fontWeight: FontWeight.w700)),
                                Text(
                                  '${line.gradeName} · cần ${line.quantityKg} kg · đã gán ${line.assignedKg} kg (${line.assignedCount} con)',
                                  style: Theme.of(context).textTheme.bodySmall,
                                ),
                                for (final tag in line.tags)
                                  Text('${tag.tagCode} · ${tag.weightG} g', style: const TextStyle(letterSpacing: 0.5)),
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
                                  maxLength: 12,
                                  textCapitalization: TextCapitalization.characters,
                                  decoration: const InputDecoration(labelText: 'Nhập mã tem', counterText: ''),
                                  onSubmitted: _addTag,
                                ),
                                const SizedBox(height: 8),
                                Row(
                                  children: [
                                    Expanded(
                                      child: OutlinedButton.icon(
                                        onPressed: _saving ? null : _scan,
                                        icon: const Icon(Icons.qr_code_scanner_rounded),
                                        label: const Text('Quét'),
                                      ),
                                    ),
                                    const SizedBox(width: 8),
                                    Expanded(
                                      child: FilledButton(
                                        onPressed: _saving || _manual.text.trim().isEmpty ? null : () => _addTag(_manual.text),
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
                              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                              child: Row(
                                children: [
                                  Expanded(child: Text(code, style: const TextStyle(fontWeight: FontWeight.w700, letterSpacing: 1))),
                                  IconButton(onPressed: _saving ? null : () => setState(() => _tags.remove(code)), icon: const Icon(Icons.close_rounded)),
                                ],
                              ),
                            ),
                          ],
                          const SizedBox(height: 16),
                          FilledButton.icon(
                            onPressed: _saving || _tags.isEmpty ? null : _pack,
                            icon: const Icon(Icons.inventory_2_outlined),
                            label: Text(_saving ? 'Đang đóng gói…' : 'Xác nhận đóng gói'),
                          ),
                        ] else
                          const Padding(
                            padding: EdgeInsets.only(top: 8),
                            child: InfoChip(icon: Icons.check_rounded, label: 'Đơn đã đóng gói', background: Color(0xFFE3F2E9)),
                          ),
                      ],
                    ],
                  ),
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
  final _controller = MobileScannerController(detectionSpeed: DetectionSpeed.noDuplicates);
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
                child: Text('Đưa tem vào khung hình', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w600)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
