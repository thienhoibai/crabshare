import 'package:material_ui/material_ui.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/routes.dart';
import '../../app/theme/app_theme.dart';
import '../../core/api/api_client.dart';
import '../../core/auth/auth_repository.dart';
import '../../core/auth/session.dart';
import '../../shared/widgets/app_ui.dart';
import 'demo_accounts.dart';

/// Đăng nhập bằng POST /api/auth/login. Đăng nhập xong router tự đưa về trang chủ theo vai trò.
class LoginPage extends ConsumerStatefulWidget {
  const LoginPage({super.key});

  @override
  ConsumerState<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends ConsumerState<LoginPage> {
  final _formKey = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _busy = false;
  bool _obscure = true;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final (token, user) = await ref.read(authRepositoryProvider).login(_email.text.trim(), _password.text);
      await ref.read(sessionProvider.notifier).signIn(token, user);
    } catch (e) {
      if (mounted) setState(() => _error = apiErrorMessage(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Scaffold(
      body: SafeArea(
        child: Form(
          key: _formKey,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(24, 12, 24, 32),
            children: [
              Align(
                alignment: Alignment.centerLeft,
                child: CircleIconButton(icon: Icons.arrow_back_rounded, onTap: () => context.go(Routes.onboarding)),
              ),
              const SizedBox(height: 28),
              const Align(
                alignment: Alignment.centerLeft,
                child: IconTile(icon: Icons.set_meal_rounded, background: AppColors.accent, foreground: AppColors.ink, size: 64),
              ),
              const SizedBox(height: 20),
              Text('Chào mừng\ntrở lại', style: text.displaySmall),
              const SizedBox(height: 8),
              Text('Đăng nhập bằng tài khoản CrabShare của bạn.', style: text.bodyLarge?.copyWith(color: AppColors.inkMuted)),
              const SizedBox(height: 28),
              TextFormField(
                controller: _email,
                keyboardType: TextInputType.emailAddress,
                autofillHints: const [AutofillHints.email],
                decoration: const InputDecoration(hintText: 'Email', prefixIcon: Icon(Icons.mail_outline_rounded)),
                validator: (v) => (v == null || !v.contains('@')) ? 'Nhập email hợp lệ' : null,
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _password,
                obscureText: _obscure,
                autofillHints: const [AutofillHints.password],
                onFieldSubmitted: (_) => _submit(),
                decoration: InputDecoration(
                  hintText: 'Mật khẩu',
                  prefixIcon: const Icon(Icons.lock_outline_rounded),
                  suffixIcon: IconButton(
                    icon: Icon(_obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined),
                    onPressed: () => setState(() => _obscure = !_obscure),
                  ),
                ),
                validator: (v) => (v == null || v.length < 8) ? 'Mật khẩu tối thiểu 8 ký tự' : null,
              ),
              if (_error != null) ...[
                const SizedBox(height: 12),
                Text(_error!, style: const TextStyle(color: AppColors.danger, fontWeight: FontWeight.w600)),
              ],
              const SizedBox(height: 22),
              FilledButton(
                onPressed: _busy ? null : _submit,
                child: _busy
                    ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white))
                    : const Text('Đăng nhập'),
              ),
              const SizedBox(height: 14),
              Center(
                child: Text('Chưa có tài khoản? Đăng ký trên web CrabShare.', style: text.bodySmall),
              ),
              if (showDemoAccounts) ...[
                const SizedBox(height: 28),
                Text('Tài khoản demo (chỉ dùng với dữ liệu seed)', style: text.bodySmall),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final a in demoAccounts)
                      ActionChip(
                        label: Text(a.label),
                        backgroundColor: AppColors.surface,
                        side: BorderSide.none,
                        onPressed: () {
                          _email.text = a.email;
                          _password.text = demoPassword;
                          _submit();
                        },
                      ),
                  ],
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
