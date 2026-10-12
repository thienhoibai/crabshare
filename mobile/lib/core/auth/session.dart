import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Vai trò — trùng với backend (Common/Auth/Roles.cs).
abstract final class Roles {
  static const investor = 'Investor';
  static const customer = 'Customer';
  static const operatorMember = 'OperatorMember';
  static const platformAdmin = 'PlatformAdmin';
  static const evidenceReviewer = 'EvidenceReviewer';
}

class AppUser {
  const AppUser({required this.userId, required this.email, required this.fullName, required this.roles, this.operatorId});

  final int userId;
  final String email;
  final String fullName;
  final List<String> roles;
  final int? operatorId;

  bool get isOperator => roles.contains(Roles.operatorMember);
  bool get isInvestor => roles.contains(Roles.investor);

  factory AppUser.fromJson(Map<String, dynamic> json) => AppUser(
        userId: json['userId'] as int,
        email: json['email'] as String,
        fullName: json['fullName'] as String,
        roles: (json['roles'] as List).cast<String>(),
        operatorId: json['operatorId'] as int?,
      );

  Map<String, dynamic> toJson() => {'userId': userId, 'email': email, 'fullName': fullName, 'roles': roles, 'operatorId': operatorId};
}

class SessionState {
  const SessionState({this.token, this.user});
  final String? token;
  final AppUser? user;
  bool get isSignedIn => token != null && user != null;
}

/// Phiên đăng nhập. Token lưu trong secure storage (Keychain/Keystore) để mở lại app không phải đăng nhập.
class SessionController extends Notifier<SessionState> {
  SessionController([this._initial = const SessionState()]);

  static const _storage = FlutterSecureStorage();
  static const _key = 'crabshare.session';
  final SessionState _initial;

  @override
  SessionState build() => _initial;

  /// Đọc phiên đã lưu, gọi một lần trong main() trước runApp.
  static Future<SessionState> restore() async {
    try {
      final raw = await _storage.read(key: _key);
      if (raw == null) return const SessionState();
      final json = jsonDecode(raw) as Map<String, dynamic>;
      return SessionState(token: json['token'] as String?, user: AppUser.fromJson(json['user'] as Map<String, dynamic>));
    } catch (_) {
      // Dữ liệu hỏng hoặc máy không đọc được kho bảo mật → coi như chưa đăng nhập.
      return const SessionState();
    }
  }

  Future<void> signIn(String token, AppUser user) async {
    state = SessionState(token: token, user: user);
    await _storage.write(key: _key, value: jsonEncode({'token': token, 'user': user.toJson()}));
  }

  Future<void> signOut() async {
    state = const SessionState();
    await _storage.delete(key: _key);
  }
}

final sessionProvider = NotifierProvider<SessionController, SessionState>(SessionController.new);
