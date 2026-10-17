import json
import unittest
from server_acceptance import Client, Acceptance, multipart


class SyntheticClient:
    base = 'https://test.example'
    def __init__(self):
        self._tokens = {'admin': 'secret-admin-token'}
        self.mutations = []
        self.number = ''
        self.locked = False
    def call(self, method, path, role=None, body=None, content_type=None):
        if method != 'GET': self.mutations.append((method, path))
        if path == '/api/auth/register': return 200, {'user': {'userId': 9284}, 'accessToken': 'secret-new-token'}, b'', {}
        if path == '/api/kyc/ekyc': return (400, {}, b'', {}) if b'\r\nfalse\r\n' in body else (200, {'verificationStatus': 'Verified'}, b'', {})
        if path == '/api/me/kyc': return 200, {'verificationStatus': 'Verified'}, b'', {}
        if path == '/api/me/payout-account':
            if method == 'PUT': self.number = body['accountNo']
            return 200, {'account': {'accountNo': self.number, 'nameMatchStatus': 'Matched'}}, b'', {}
        if path == '/api/me/addresses': raise RuntimeError('secret-response-must-never-enter-report')
        if path.startswith('/api/admin/users/9284/'):
            self.locked = path.endswith('/lock'); return 200, {}, b'', {}
        if path == '/api/auth/me': return (401 if self.locked else 200), {}, b'', {}
        raise AssertionError('Unexpected test path')


class AcceptanceTests(unittest.TestCase):
    def test_http_opt_in_only_permits_loopback(self):
        for address in ['http://192.168.1.2:5233', 'http://public.example', 'https://user:password@example.com']:
            with self.assertRaises(ValueError): Client(address, allow_local_http=True)
        Client('http://127.0.0.1:5329', allow_local_http=True)
        with self.assertRaises(ValueError): Client('http://127.0.0.1:5329')

    def test_absolute_request_path_is_rejected_before_network(self):
        with self.assertRaises(ValueError): Client('https://api.example').call('GET', 'https://other.example/api/auth/me')

    def test_synthetic_account_is_disabled_even_when_address_check_fails_and_report_is_redacted(self):
        client = SyntheticClient(); acceptance = Acceptance(client)
        acceptance.synthetic()
        self.assertTrue(client.locked)
        self.assertEqual(('POST', '/api/admin/users/9284/lock'), client.mutations[-1])
        report = json.dumps(acceptance.report())
        self.assertNotIn('secret-', report)
        self.assertNotIn(client.number, report)
        self.assertFalse(acceptance.report()['automatedChecksPassed'])
        self.assertFalse(acceptance.report()['fullAcceptancePassed'])
        for _, path in client.mutations:
            self.assertTrue(path in ('/api/auth/register','/api/kyc/ekyc','/api/me/payout-account','/api/me/addresses') or path.startswith('/api/admin/users/9284/'))

    def test_kyc_fixture_contains_only_three_synthetic_images(self):
        data, content_type = multipart(False)
        self.assertEqual(3, data.count(b'filename="synthetic-test.png"'))
        self.assertIn(b'\r\nfalse\r\n', data)
        self.assertIn('boundary=CS92-', content_type)


if __name__ == '__main__': unittest.main()
