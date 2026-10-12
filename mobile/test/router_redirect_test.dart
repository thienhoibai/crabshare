import 'package:crabshare_mobile/app/router.dart';
import 'package:crabshare_mobile/app/routes.dart';
import 'package:crabshare_mobile/core/auth/session.dart';
import 'package:flutter_test/flutter_test.dart';

SessionState _as(List<String> roles) => SessionState(
      token: 't',
      user: AppUser(userId: 1, email: 'a@b.c', fullName: 'Test', roles: roles),
    );

void main() {
  const guest = SessionState();

  test('khách chưa đăng nhập chỉ vào được trang công khai', () {
    expect(redirectFor(guest, Routes.onboarding), isNull);
    expect(redirectFor(guest, Routes.scan), isNull);
    expect(redirectFor(guest, Routes.trace('CSAB23CD45EF')), isNull);
    expect(redirectFor(guest, Routes.investorHome), Routes.onboarding);
    expect(redirectFor(guest, Routes.operatorToday), Routes.onboarding);
    expect(redirectFor(guest, Routes.payoutAccount), Routes.onboarding);
  });

  test('đăng nhập xong về trang chủ theo vai trò', () {
    expect(redirectFor(_as([Roles.operatorMember]), Routes.login), Routes.operatorToday);
    expect(redirectFor(_as([Roles.investor, Roles.customer]), Routes.login), Routes.investorHome);
    expect(redirectFor(_as([Roles.platformAdmin]), Routes.login), Routes.unsupported);
  });

  test('không vào được khu vực của vai khác', () {
    expect(redirectFor(_as([Roles.investor]), Routes.operatorToday), Routes.investorHome);
    expect(redirectFor(_as([Roles.operatorMember]), Routes.investorHome), Routes.operatorToday);
    expect(redirectFor(_as([Roles.investor]), Routes.batch('CS-2610-01')), isNull);
    expect(redirectFor(_as([Roles.investor]), Routes.payoutAccount), isNull);
    expect(redirectFor(_as([Roles.operatorMember]), Routes.payoutAccount), isNull);
    expect(redirectFor(_as([Roles.customer]), Routes.payoutAccount), Routes.unsupported);
  });
}
