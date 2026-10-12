import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import '../../app/theme/app_theme.dart';
import '../../core/api/api_client.dart';
import '../../core/auth/session.dart';
import '../../shared/widgets/app_ui.dart';
import 'data/payout_repository.dart';

class PayoutAccountPage extends ConsumerStatefulWidget {
  const PayoutAccountPage({super.key});
  @override
  ConsumerState<PayoutAccountPage> createState() => _PayoutAccountPageState();
}

class _PayoutAccountPageState extends ConsumerState<PayoutAccountPage> {
  String? _ownerType;
  @override
  Widget build(BuildContext context) {
    final user = ref.watch(sessionProvider).user;
    if (user == null) return const SizedBox.shrink();
    final owner = _ownerType ?? (user.isOperator ? 'Operator' : 'Investor');
    final query = ref.watch(payoutProfileProvider(owner));
    return Scaffold(
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
          children: [
            const SubPageHeader(title: 'Tài khoản nhận tiền'),
            const SizedBox(height: 20),
            if (user.isInvestor && user.isOperator) ...[
              Wrap(
                spacing: 8,
                children: [
                  for (final type in ['Investor', 'Operator'])
                    ChoiceChip(
                      label: Text(type == 'Investor' ? 'Cá nhân' : 'Hộ nuôi'),
                      selected: owner == type,
                      onSelected: (_) => setState(() => _ownerType = type),
                      showCheckmark: false,
                      backgroundColor: AppColors.surface,
                      selectedColor: AppColors.ink,
                      labelStyle: TextStyle(
                        color: owner == type ? Colors.white : AppColors.ink,
                      ),
                      side: BorderSide.none,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(AppRadius.pill),
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 16),
            ],
            query.when(
              loading: () => const Padding(
                padding: EdgeInsets.all(40),
                child: Center(child: CircularProgressIndicator()),
              ),
              error: (e, _) => ErrorView(
                message: apiErrorMessage(e),
                onRetry: () => ref.invalidate(payoutProfileProvider(owner)),
              ),
              data: (profile) => _PayoutForm(
                key: ValueKey(
                  '${user.userId}-$owner-${profile.account?.updatedAt ?? 'new'}',
                ),
                profile: profile,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PayoutForm extends ConsumerStatefulWidget {
  const _PayoutForm({super.key, required this.profile});
  final PayoutProfile profile;
  @override
  ConsumerState<_PayoutForm> createState() => _PayoutFormState();
}

class _PayoutFormState extends ConsumerState<_PayoutForm> {
  final _form = GlobalKey<FormState>();
  late final _bank = TextEditingController(
    text: widget.profile.account?.bankCode ?? '',
  );
  late final _number = TextEditingController(
    text: widget.profile.account?.accountNo ?? '',
  );
  late final _holder = TextEditingController(
    text:
        widget.profile.account?.accountHolderName ??
        widget.profile.expectedHolderName,
  );
  bool _saving = false;
  String? _error;
  @override
  void dispose() {
    _bank.dispose();
    _number.dispose();
    _holder.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_saving || !_form.currentState!.validate()) return;
    final userId = ref.read(sessionProvider).user?.userId;
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final result = await ref
          .read(payoutRepositoryProvider)
          .save(
            widget.profile.ownerType,
            PayoutInput(
              bankCode: _bank.text.trim().toUpperCase(),
              accountNo: _number.text.trim(),
              accountHolderName: _holder.text.trim(),
            ),
          );
      if (!mounted || ref.read(sessionProvider).user?.userId != userId) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            result.account?.status == 'Active'
                ? 'Đã lưu tài khoản nhận tiền.'
                : 'Tên chưa khớp. Kiểm tra lại thông tin chủ tài khoản.',
          ),
        ),
      );
      ref.invalidate(payoutProfileProvider(widget.profile.ownerType));
    } catch (e) {
      if (mounted) setState(() => _error = apiErrorMessage(e));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final profile = widget.profile;
    final account = profile.account;
    final active = account?.status == 'Active';
    final mismatch = account?.nameMatchStatus == 'Mismatched';
    final locked =
        account?.status == 'Locked' && account?.nameMatchStatus == 'Matched';
    return PopScope(
      canPop: !_saving,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          AppCard(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const IconTile(icon: Icons.account_balance_outlined),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        active
                            ? 'Sẵn sàng nhận tiền'
                            : mismatch
                            ? 'Tên chủ tài khoản chưa khớp'
                            : locked
                            ? 'Tài khoản đã bị khoá'
                            : 'Thêm tài khoản ngân hàng',
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                      const SizedBox(height: 6),
                      Text(
                        mismatch
                            ? 'Kiểm tra lại tên và lưu để đối chiếu lại.'
                            : locked
                            ? 'Liên hệ quản trị để được hỗ trợ.'
                            : 'Mỗi chủ sở hữu dùng một tài khoản đang hoạt động.',
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                      if (active) ...[
                        const SizedBox(height: 10),
                        const InfoChip(
                          label: 'Đã khớp tên',
                          icon: Icons.check_circle_outline,
                          foreground: AppColors.success,
                        ),
                      ],
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  profile.ownerType == 'Operator'
                      ? 'Tên pháp lý hộ nuôi'
                      : 'Tên trong hồ sơ',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
                const SizedBox(height: 6),
                Text(
                  profile.expectedHolderName,
                  style: Theme.of(context).textTheme.titleMedium,
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          Form(
            key: _form,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _input(
                  'Mã ngân hàng',
                  _bank,
                  hint: 'Ví dụ: VCB',
                  max: 20,
                  validate: (v) => RegExp(r'^[A-Za-z0-9_-]+$').hasMatch(v)
                      ? null
                      : 'Mã ngân hàng chỉ gồm chữ, số, - hoặc _.',
                ),
                const SizedBox(height: 16),
                _input(
                  'Số tài khoản',
                  _number,
                  max: 30,
                  numeric: true,
                  validate: (v) => RegExp(r'^[0-9]{4,30}$').hasMatch(v)
                      ? null
                      : 'Nhập từ 4 đến 30 chữ số.',
                ),
                const SizedBox(height: 16),
                _input('Tên chủ tài khoản', _holder, max: 150),
                const SizedBox(height: 14),
                Text(
                  'Nhập tên như trên tài khoản ngân hàng. Khi đổi ngân hàng hoặc số tài khoản, tài khoản cũ sẽ ngừng nhận tiền.',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
                if (_error != null) ...[
                  const SizedBox(height: 14),
                  Text(
                    _error!,
                    style: const TextStyle(color: AppColors.danger),
                  ),
                ],
                const SizedBox(height: 22),
                FilledButton(
                  onPressed: _saving || locked ? null : _save,
                  child: _saving
                      ? const SizedBox(
                          width: 22,
                          height: 22,
                          child: CircularProgressIndicator(
                            strokeWidth: 2.5,
                            color: Colors.white,
                          ),
                        )
                      : Text(
                          account == null
                              ? 'Lưu tài khoản nhận tiền'
                              : 'Lưu và đối chiếu lại',
                        ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _input(
    String label,
    TextEditingController controller, {
    String? hint,
    required int max,
    bool numeric = false,
    String? Function(String)? validate,
  }) {
    final locked =
        widget.profile.account?.status == 'Locked' &&
        widget.profile.account?.nameMatchStatus == 'Matched';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: Theme.of(context).textTheme.titleSmall),
        const SizedBox(height: 8),
        TextFormField(
          controller: controller,
          enabled: !_saving && !locked,
          maxLength: max,
          keyboardType: numeric ? TextInputType.number : TextInputType.text,
          autocorrect: false,
          decoration: InputDecoration(hintText: hint, counterText: ''),
          validator: (value) {
            final v = (value ?? '').trim();
            return v.isEmpty ? 'Vui lòng nhập $label.' : validate?.call(v);
          },
        ),
      ],
    );
  }
}
