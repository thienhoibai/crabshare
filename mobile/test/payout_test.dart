import 'dart:convert';
import 'dart:typed_data';

import 'package:crabshare_mobile/app/theme/app_theme.dart';
import 'package:crabshare_mobile/core/auth/session.dart';
import 'package:crabshare_mobile/features/account/data/payout_repository.dart';
import 'package:crabshare_mobile/features/account/payout_account_page.dart';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';

const _user = AppUser(
  userId: 1,
  email: 'test@local',
  fullName: 'Trần Đăng Khôi',
  roles: [Roles.investor],
);

class _Repository implements PayoutRepository {
  int reads = 0;
  int saves = 0;
  bool fail = false;
  bool mismatch = false;
  PayoutProfile profile = const PayoutProfile(
    ownerType: 'Investor',
    expectedHolderName: 'Trần Đăng Khôi',
  );
  final List<String> owners = [];
  @override
  Future<PayoutProfile> get(String ownerType) async {
    reads++;
    owners.add(ownerType);
    return PayoutProfile(
      ownerType: ownerType,
      expectedHolderName: profile.expectedHolderName,
      account: profile.account,
    );
  }

  @override
  Future<PayoutProfile> save(String ownerType, PayoutInput input) async {
    saves++;
    expect(input.bankCode, 'VCB');
    expect(input.accountNo, '1234567890');
    if (fail) {
      throw DioException(
        requestOptions: RequestOptions(path: '/api/me/payout-account'),
        response: Response(
          requestOptions: RequestOptions(),
          statusCode: 409,
          data: {'detail': 'Tài khoản ngân hàng đã được đăng ký.'},
        ),
      );
    }
    return profile = PayoutProfile(
      ownerType: ownerType,
      expectedHolderName: profile.expectedHolderName,
      account: PayoutAccount(
        bankCode: input.bankCode,
        accountNo: input.accountNo,
        accountHolderName: input.accountHolderName,
        status: mismatch ? 'Locked' : 'Active',
        nameMatchStatus: mismatch ? 'Mismatched' : 'Matched',
        updatedAt: 'new',
      ),
    );
  }
}

class _Adapter implements HttpClientAdapter {
  final requests = <RequestOptions>[];
  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    if (requestStream != null) await requestStream.drain<void>();
    return ResponseBody.fromString(
      jsonEncode({
        'ownerType': 'Operator',
        'expectedHolderName': 'HTX Cua',
        'account': null,
      }),
      200,
      headers: {
        Headers.contentTypeHeader: ['application/json'],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

Future<void> _mount(
  WidgetTester tester,
  _Repository repo, {
  AppUser user = _user,
}) async {
  tester.view.physicalSize = const Size(360, 780);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        sessionProvider.overrideWith(
          () => SessionController(SessionState(token: 'test', user: user)),
        ),
        payoutRepositoryProvider.overrideWithValue(repo),
      ],
      child: MaterialApp(
        theme: buildAppTheme(),
        home: const PayoutAccountPage(),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

Future<void> _fill(WidgetTester tester) async {
  await tester.enterText(find.byType(TextFormField).at(0), 'vcb');
  await tester.enterText(find.byType(TextFormField).at(1), '1234567890');
  await tester.ensureVisible(find.text('Lưu tài khoản nhận tiền'));
  await tester.pumpAndSettle();
}

void main() {
  test('API repository uses explicit owner scope and PUT JSON', () async {
    final adapter = _Adapter();
    final dio = Dio(BaseOptions(baseUrl: 'http://test.local'))
      ..httpClientAdapter = adapter;
    final repo = ApiPayoutRepository(dio);
    expect((await repo.get('Operator')).ownerType, 'Operator');
    await repo.save(
      'Operator',
      const PayoutInput(
        bankCode: 'VCB',
        accountNo: '1234567890',
        accountHolderName: 'HTX Cua',
      ),
    );
    expect(adapter.requests.map((r) => r.method), ['GET', 'PUT']);
    expect(
      adapter.requests.every(
        (r) => r.queryParameters['ownerType'] == 'Operator',
      ),
      isTrue,
    );
    expect(adapter.requests.last.data, {
      'bankCode': 'VCB',
      'accountNo': '1234567890',
      'accountHolderName': 'HTX Cua',
    });
  });

  testWidgets('form validates before sending and displays saved API status', (
    tester,
  ) async {
    final repo = _Repository();
    await _mount(tester, repo);
    await tester.ensureVisible(find.text('Lưu tài khoản nhận tiền'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Lưu tài khoản nhận tiền'));
    await tester.pumpAndSettle();
    expect(repo.saves, 0);
    await _fill(tester);
    await tester.tap(find.text('Lưu tài khoản nhận tiền'));
    await tester.pumpAndSettle();
    expect(repo.saves, 1);
    expect(find.text('Sẵn sàng nhận tiền'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('mismatch stays locked and API failures remain editable', (
    tester,
  ) async {
    final repo = _Repository()..fail = true;
    await _mount(tester, repo);
    await _fill(tester);
    await tester.tap(find.text('Lưu tài khoản nhận tiền'));
    await tester.pumpAndSettle();
    expect(find.text('Tài khoản ngân hàng đã được đăng ký.'), findsOneWidget);
    repo.fail = false;
    repo.mismatch = true;
    await tester.ensureVisible(find.text('Lưu tài khoản nhận tiền'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Lưu tài khoản nhận tiền'));
    await tester.pumpAndSettle();
    expect(find.text('Tên chủ tài khoản chưa khớp'), findsOneWidget);
    expect(find.text('Sẵn sàng nhận tiền'), findsNothing);
  });

  testWidgets(
    'dual role can switch from operator account to personal account',
    (tester) async {
      final repo = _Repository();
      await _mount(
        tester,
        repo,
        user: const AppUser(
          userId: 1,
          email: 'test@local',
          fullName: 'Trần Đăng Khôi',
          roles: [Roles.investor, Roles.operatorMember],
        ),
      );
      expect(repo.owners.last, 'Operator');
      await tester.tap(find.text('Cá nhân'));
      await tester.pumpAndSettle();
      expect(repo.owners.last, 'Investor');
      expect(tester.takeException(), isNull);
    },
  );
}
