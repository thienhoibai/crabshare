"""Read-only HTTPS deployment smoke. Does not seed, migrate or change accounts."""
import argparse
import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path


def origin(value):
    parsed = urllib.parse.urlsplit(value)
    if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in ('', '/'):
        raise ValueError('Use an HTTPS origin without credentials, query or path')
    return value.rstrip('/')


class SameOriginRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, new_url):
        if urllib.parse.urlsplit(request.full_url)[:2] != urllib.parse.urlsplit(new_url)[:2]:
            raise ValueError('Refusing cross-origin or HTTPS downgrade redirect')
        return super().redirect_request(request, fp, code, message, headers, new_url)


def request(url):
    opener = urllib.request.build_opener(SameOriginRedirect())
    try:
        response = opener.open(urllib.request.Request(url, headers={'User-Agent': 'CrabShare-DeploymentSmoke'}), timeout=30)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        return response.code, response.read(2_000_000), response.headers


def run(api, web, expected_revision=None):
    results = []

    def check(name, action):
        try:
            action()
            results.append({'check': name, 'status': 'PASS'})
        except Exception as error:
            # Never include response bodies, request headers, secrets or exception connection details.
            results.append({'check': name, 'status': 'FAIL', 'reason': str(error) if isinstance(error, AssertionError) else type(error).__name__})

    def health(path):
        status, body, _ = request(api + path)
        assert status == 200, f'Expected HTTP 200, got {status}'
        payload = json.loads(body)
        assert payload.get('status') == 'ok', 'API did not report ok'
        if path.endswith('ready'):
            assert payload.get('database') == 'connected', 'Database not ready'

    def anonymous():
        status, _, _ = request(api + '/api/auth/me')
        assert status == 401, f'Expected HTTP 401, got {status}'

    def website():
        status, body, _ = request(web)
        assert status == 200, f'Expected HTTP 200, got {status}'
        match = re.search(rb'<script[^>]+src="(/assets/[^"?]+\.js)"', body)
        assert match, 'Web HTML has no production JavaScript asset'
        status, asset, _ = request(web + match[1].decode())
        assert status == 200 and len(asset) > 100 and not asset.lstrip().startswith(b'<!'), 'Web JavaScript asset is unavailable'

    def revision():
        status, body, _ = request(api + '/api/health/version')
        assert status == 200, f'Version endpoint expected HTTP 200, got {status}'
        assert expected_revision in json.loads(body).get('version', ''), 'Deployed revision does not match workflow SHA'

    check('api-liveness-https', lambda: health('/api/health/live'))
    check('database-readiness-https', lambda: health('/api/health/ready'))
    check('anonymous-private-route-401', anonymous)
    check('web-and-bundled-asset-https', website)
    if expected_revision:
        check('deployed-revision', revision)
    return {'checkedAt': datetime.now(timezone.utc).isoformat(), 'api': api, 'web': web, 'results': results,
            'passed': all(item['status'] == 'PASS' for item in results)}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--api', type=origin, default='https://crabshare-api.azurewebsites.net')
    parser.add_argument('--web', type=origin, default='https://crabshare.vercel.app')
    parser.add_argument('--expected-revision')
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    report = run(args.api, args.web, args.expected_revision)
    output = json.dumps(report, ensure_ascii=False, indent=2)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(output, encoding='utf-8')
    print(output)
    sys.exit(0 if report['passed'] else 1)
