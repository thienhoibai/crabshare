import json
import unittest
from unittest.mock import patch
from smoke import origin, run, SameOriginRedirect
from urllib.request import Request


class SmokeTests(unittest.TestCase):
    def test_rejects_credentials_http_and_non_origin_urls(self):
        for value in ['http://example.test', 'https://user:password@example.test', 'https://example.test/path', 'https://example.test?secret=x']:
            with self.assertRaises(ValueError):
                origin(value)

    def test_redirect_cannot_downgrade_or_send_to_another_host(self):
        for value in ['http://api.test/live', 'https://other.test/live']:
            with self.assertRaises(ValueError):
                SameOriginRedirect().redirect_request(Request('https://api.test/live'), None, 302, '', {}, value)

    def test_expected_revision_fails_even_when_health_is_ok(self):
        def fake(url):
            if url.endswith('/api/auth/me'): return 401, b'', {}
            if url.endswith('/api/health/version'): return 200, b'{"version":"1.0.0+wrong"}', {}
            if '/api/health/' in url: return 200, b'{"status":"ok","database":"connected"}', {}
            if url.endswith('.js'): return 200, b'const bundled = true;' * 20, {}
            return 200, b'<script type="module" src="/assets/index-abc.js"></script>', {}
        with patch('smoke.request', side_effect=fake):
            result = run('https://api.test', 'https://web.test', 'expected-commit')
        self.assertFalse(result['passed'])
        self.assertEqual(['deployed-revision'], [x['check'] for x in result['results'] if x['status'] == 'FAIL'])


if __name__ == '__main__':
    unittest.main()
