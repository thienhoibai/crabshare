"""CS-92: actual API acceptance, redacted evidence, optional isolated synthetic account exercises."""
import argparse
import base64
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import secrets
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid


class SameOriginRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, new_url):
        if urllib.parse.urlsplit(request.full_url)[:2] != urllib.parse.urlsplit(new_url)[:2]:
            raise ValueError('Refusing cross-origin/downgrade redirect')
        return super().redirect_request(request, fp, code, message, headers, new_url)


class Client:
    def __init__(self, base, allow_local_http=False):
        parsed = urllib.parse.urlsplit(base)
        local = allow_local_http and parsed.scheme == 'http' and parsed.hostname in ('localhost', '127.0.0.1', '::1')
        if (parsed.scheme != 'https' and not local) or not parsed.hostname or parsed.username or parsed.password or parsed.path not in ('', '/') or parsed.query or parsed.fragment:
            raise ValueError('Expected HTTPS origin; HTTP requires explicit loopback-only opt-in')
        self.base = base.rstrip('/')
        self._tokens = {}
        self._opener = urllib.request.build_opener(SameOriginRedirect())

    def call(self, method, path, role=None, body=None, content_type=None):
        if not path.startswith('/api/') or path.startswith('//'):
            raise ValueError('Expected a relative API path')
        headers = {'User-Agent': 'CrabShare-CS92-Acceptance'}
        if role is not None:
            if role not in self._tokens: raise ValueError('Login prerequisite unavailable')
            headers['Authorization'] = 'Bearer ' + self._tokens[role]
        if body is not None and not isinstance(body, bytes):
            body = json.dumps(body).encode()
            content_type = 'application/json'
        if content_type: headers['Content-Type'] = content_type
        request = urllib.request.Request(self.base + path, data=body, headers=headers, method=method)
        try:
            response = self._opener.open(request, timeout=45)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            data = response.read(4_000_000)
            parsed = json.loads(data) if 'application/json' in response.headers.get('Content-Type', '') or 'application/problem+json' in response.headers.get('Content-Type', '') else None
            return response.code, parsed, data, response.headers

    def login(self, key, email, password, expected_role):
        status, body, _, _ = self.call('POST', '/api/auth/login', body={'email': email, 'password': password})
        require(status == 200, f'Login expected HTTP 200, got {status}')
        require(expected_role in body['user']['roles'], 'Login role mismatch')
        self._tokens[key] = body['accessToken']


def require(condition, message):
    if not condition: raise AssertionError(message)


def multipart(consent):
    boundary = 'CS92-' + uuid.uuid4().hex
    png = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC9sAAAAASUVORK5CYII=')
    parts = [f'--{boundary}\r\nContent-Disposition: form-data; name="consent"\r\n\r\n{str(consent).lower()}\r\n'.encode()]
    for field in ['idCardFront', 'idCardBack', 'selfie']:
        parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{field}"; filename="synthetic-test.png"\r\nContent-Type: image/png\r\n\r\n'.encode() + png + b'\r\n')
    return b''.join(parts) + f'--{boundary}--\r\n'.encode(), 'multipart/form-data; boundary=' + boundary


class Acceptance:
    def __init__(self, client):
        self.client = client
        self.results = []
        self.synthetic_user_id = None

    def check(self, use_case, name, action, record_success=True):
        try:
            action()
            if record_success:
                self.results.append({'useCase': use_case, 'check': name, 'status': 'PASS'})
        except Exception as error:
            # Never copy response bodies, URLs with credentials, tokens or raw exception connection details.
            self.results.append({'useCase': use_case, 'check': name, 'status': 'FAIL',
                                 'reason': str(error) if isinstance(error, AssertionError) else type(error).__name__})

    def endpoint(self, use_case, name, role, path, status=200, validate=None, new_feature=False):
        def action():
            actual, body, data, headers = self.client.call('GET', path, role)
            require(actual == status, f'Expected HTTP {status}, got {actual}')
            if validate: validate(body, data, headers)
        self.check(use_case, name, action)
        if new_feature and self.results[-1].get('reason', '').endswith('got 404'):
            self.results[-1]['status'] = 'BLOCKED_DEPLOYMENT'

    def read_only(self, password):
        for role, email in [('admin', 'admin@crabshare.local'), ('operator', 'operator@crabshare.local'),
                            ('investor', 'investor1@crabshare.local'), ('reviewer', 'reviewer@crabshare.local'), ('customer', 'customer@crabshare.local')]:
            expected = {'admin': 'PlatformAdmin', 'operator': 'OperatorMember', 'investor': 'Investor', 'reviewer': 'EvidenceReviewer', 'customer': 'Customer'}[role]
            self.check('Setup', 'login-' + role, lambda r=role, e=email, x=expected: self.client.login(r, e, password, x))
        self.endpoint('Security', 'anonymous-private-route', None, '/api/auth/me', 401)
        routes = [
            ('UC02', 'kyc-status', 'investor', '/api/me/kyc'),
            ('UC03', 'investor-payout', 'investor', '/api/me/payout-account'),
            ('UC03', 'operator-payout', 'operator', '/api/me/payout-account'),
            ('UC03', 'customer-addresses', 'customer', '/api/me/addresses'),
            ('UC06/45', 'admin-users', 'admin', '/api/admin/users?pageSize=1'),
            ('UC06', 'admin-kyc-checks', 'admin', '/api/admin/kyc-checks?pageSize=1'),
            ('UC16', 'boxes', 'operator', '/api/boxes?pageSize=1'),
            ('UC16', 'capture-requests', 'operator', '/api/operators/me/capture-requests?pageSize=1'),
            ('UC19', 'operator-alerts', 'operator', '/api/operators/me/alerts'),
            ('UC20', 'review-evidence', 'reviewer', '/api/review/evidence?pageSize=1'),
            ('UC20', 'operator-explanations', 'operator', '/api/operators/me/evidence?pageSize=1'),
            ('UC42', 'portfolio', 'investor', '/api/investor/portfolio?pageSize=1'),
            ('UC43', 'notifications', 'investor', '/api/me/notifications?pageSize=1'),
        ]
        for uc, name, role, path in routes: self.endpoint(uc, name, role, path)
        for role, path in [('investor','/api/admin/users'), ('operator','/api/investor/portfolio'),
                            ('customer','/api/me/payout-account'), ('admin','/api/boxes'), ('reviewer','/api/admin/users')]:
            self.endpoint('Security', role + '-cross-role-403-' + path.rsplit('/', 1)[-1], role, path, 403)
        for role, path, name in [('admin','/api/admin/dashboard','admin-dashboard'), ('operator','/api/operators/me/dashboard','operator-dashboard')]:
            self.endpoint('UC47', name, role, path, new_feature=True)
        for report in ['capital', 'batches', 'orders', 'payouts']:
            self.endpoint('UC47', 'csv-' + report, 'admin', f'/api/admin/reports/{report}.csv',
                          validate=lambda _, data, headers: require(data.startswith(b'\xef\xbb\xbf') and 'text/csv' in headers.get('Content-Type',''), 'Expected Excel UTF-8 CSV'), new_feature=True)
        self.endpoint('UC48', 'audit-chain', 'admin', '/api/admin/audit-log?pageSize=1',
                      validate=lambda body, *_: require(body.get('chain', {}).get('isValid') is True, 'Audit chain is not valid'), new_feature=True)
        self.endpoint('UC48', 'audit-export', 'admin', '/api/admin/audit-log/export?entityType=CS92_NoSuchType',
                      validate=lambda _, data, headers: require(data.startswith(b'\xef\xbb\xbf'), 'Expected UTF-8 audit export'), new_feature=True)

    def synthetic(self):
        require('admin' in self.client._tokens, 'Admin login is required before creating a synthetic account')
        client = self.client
        email = 'cs92-' + uuid.uuid4().hex + '@test.crabshare.local'
        status, created, _, _ = client.call('POST', '/api/auth/register', body={
            'email': email, 'password': secrets.token_urlsafe(30), 'fullName': 'CS92 Synthetic Test', 'role': 'Investor'})
        require(status == 200, f'Synthetic registration expected HTTP 200, got {status}')
        self.synthetic_user_id = created['user']['userId']
        client._tokens['synthetic'] = created['accessToken']
        self.results.append({'useCase': 'Setup', 'check': 'synthetic-account-created', 'status': 'PASS'})
        try:
            def kyc():
                data, content_type = multipart(False)
                status, _, _, _ = client.call('POST', '/api/kyc/ekyc', 'synthetic', data, content_type)
                require(status == 400, f'Consent rejection expected HTTP 400, got {status}')
                data, content_type = multipart(True)
                status, body, _, _ = client.call('POST', '/api/kyc/ekyc', 'synthetic', data, content_type)
                require(status == 200 and body.get('verificationStatus') == 'Verified', f'Synthetic KYC expected Verified/200, got {status}')
                status, body, _, _ = client.call('GET', '/api/me/kyc', 'synthetic')
                require(status == 200 and body.get('verificationStatus') == 'Verified', 'Verified state did not persist')
            self.check('UC02', 'synthetic-consent-400-then-verified', kyc)

            def payout():
                number = '0092' + str(secrets.randbelow(10**12)).zfill(12)
                status, body, _, _ = client.call('PUT', '/api/me/payout-account', 'synthetic', {
                    'bankCode': 'VCB', 'accountNo': number, 'accountHolderName': 'CS92 Synthetic Test'})
                require(status == 200 and body.get('account', {}).get('nameMatchStatus') == 'Matched', f'Bank name match expected HTTP 200/Matched, got {status}')
                status, body, _, _ = client.call('GET', '/api/me/payout-account', 'synthetic')
                require(status == 200 and body.get('account', {}).get('accountNo') == number, 'Payout round trip failed')
            self.check('UC03', 'synthetic-bank-match-and-round-trip', payout)

            def address():
                payload = {'recipientName': 'CS92 Synthetic Test', 'recipientPhone': '0900000092', 'addressLine': 'Synthetic acceptance address', 'province': 'Test', 'isDefault': True}
                status, body, _, _ = client.call('POST', '/api/me/addresses', 'synthetic', payload)
                require(status == 201, f'Address create expected HTTP 201, got {status}')
                path = '/api/me/addresses/' + str(body['addressId'])
                try:
                    payload['addressLine'] = 'Updated synthetic acceptance address'
                    status, _, _, _ = client.call('PUT', path, 'synthetic', payload)
                    require(status == 200, f'Address update expected HTTP 200, got {status}')
                finally:
                    status, _, _, _ = client.call('DELETE', path, 'synthetic')
                    require(status == 204, f'Synthetic address cleanup expected HTTP 204, got {status}')
            self.check('UC03', 'synthetic-address-crud', address)

            def lock_round_trip():
                path = f'/api/admin/users/{self.synthetic_user_id}'
                reason = {'reason': 'CS-92 synthetic acceptance account lock/unlock check'}
                for action, expected in [('lock', 401), ('unlock', 200)]:
                    status, _, _, _ = client.call('POST', path + '/' + action, 'admin', reason)
                    require(status == 200, f'Synthetic {action} expected HTTP 200, got {status}')
                    actual, _, _, _ = client.call('GET', '/api/auth/me', 'synthetic')
                    require(actual == expected, f'Synthetic JWT after {action} expected HTTP {expected}, got {actual}')
            self.check('UC06/45', 'synthetic-lock-revokes-unexpired-token', lock_round_trip)
        finally:
            # Preserve audit/history but disable only the synthetic account this invocation just created.
            def final_lock():
                status, _, _, _ = client.call('POST', f'/api/admin/users/{self.synthetic_user_id}/lock', 'admin',
                                             {'reason': 'CS-92 synthetic acceptance complete; disable test-only identity'})
                require(status == 200, f'Synthetic final lock expected HTTP 200, got {status}')
            self.check('Cleanup', 'synthetic-account-disabled', final_lock)

    def report(self):
        return {'checkedAt': datetime.now(timezone.utc).isoformat(), 'api': self.client.base,
                'syntheticUserId': self.synthetic_user_id, 'results': self.results,
                'automatedChecksPassed': all(row['status'] == 'PASS' for row in self.results),
                'physicalDevices': 'PENDING: install/login/camera/GPS/upload on two real phones',
                'qrAcceptance': 'PENDING: CS-82 real scanner/trace and an activated tag',
                'identityImageRetention': 'Not observable over HTTP; covered by isolated backend storage tests',
                'bankEncryptionAtRest': 'Not observable over HTTP; requires CS-88 SQL/key validation on deployment',
                'fullAcceptancePassed': False}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--api', default='https://crabshare-api.azurewebsites.net')
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--exercise-synthetic-account', action='store_true', help='Create one isolated fake investor, test KYC/payout/address/lock and disable that account afterwards')
    parser.add_argument('--allow-local-http', action='store_true', help='Only permits loopback HTTP for an isolated local integration host')
    args = parser.parse_args()
    password = os.environ.get('CRABSHARE_DEMO_PASSWORD')
    if not password: raise SystemExit('Set CRABSHARE_DEMO_PASSWORD privately; never pass it on the command line')
    acceptance = Acceptance(Client(args.api, args.allow_local_http))
    acceptance.read_only(password)
    if args.exercise_synthetic_account:
        acceptance.check('Setup', 'synthetic-scenario', acceptance.synthetic, record_success=False)
    report = acceptance.report()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False, indent=2))
    sys.exit(0 if report['automatedChecksPassed'] else 1)
