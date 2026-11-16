"""Verify a signed demo APK and write public checksums/provenance. Never reads signing passwords."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import urllib.parse


def https_origin(value):
    parsed = urllib.parse.urlsplit(value)
    if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password or parsed.path not in ('', '/') or parsed.query or parsed.fragment:
        raise ValueError('Expected HTTPS origin without credentials or path')
    return value.rstrip('/')


def package(apk, output, revision, api, web, sdk):
    if not re.fullmatch(r'[0-9a-f]{40}', revision):
        raise ValueError('Use the full source commit SHA')
    api, web = https_origin(api), https_origin(web)
    tools = sorted((sdk / 'build-tools').glob('*'), key=lambda p: tuple(int(x) for x in p.name.split('.') if x.isdigit()))
    if not tools:
        raise ValueError('Android build-tools not installed')
    suffix = '.bat' if os.name == 'nt' else ''
    signer = tools[-1] / ('apksigner' + suffix)
    aapt = tools[-1] / ('aapt.exe' if os.name == 'nt' else 'aapt')
    signed = subprocess.run([str(signer), 'verify', '--verbose', '--print-certs', str(apk)], capture_output=True, text=True, check=True)
    if 'Android Debug' in signed.stdout:
        raise ValueError('A debug certificate cannot be packaged as the demo release')
    certificate = re.search(r'certificate SHA-256 digest: ([0-9a-fA-F]+)', signed.stdout)
    if not certificate:
        raise ValueError('Signing certificate fingerprint missing')
    badging = subprocess.run([str(aapt), 'dump', 'badging', str(apk)], capture_output=True, text=True, check=True).stdout
    details = re.search(r"package: name='([^']+)' versionCode='(\d+)' versionName='([^']+)'", badging)
    if not details or details[1] != 'vn.crabshare.crabshare_mobile':
        raise ValueError('Unexpected APK application ID or version metadata')
    output.mkdir(parents=True, exist_ok=True)
    target = output / 'CrabShare-Sprint3-demo.apk'
    if apk.resolve() != target.resolve():
        shutil.copy2(apk, target)
    digest = hashlib.sha256(target.read_bytes()).hexdigest()
    (output / 'SHA256SUMS.txt').write_text(f'{digest}  {target.name}\n', encoding='ascii')
    (output / 'signature.txt').write_text(signed.stdout, encoding='utf-8')
    manifest = {'apk': target.name, 'applicationId': details[1], 'versionCode': int(details[2]), 'versionName': details[3],
                'sourceRevision': revision, 'apiUrl': api, 'webUrl': web, 'sha256': digest,
                'certificateSha256': certificate[1].lower(), 'sizeBytes': target.stat().st_size,
                'physicalDeviceAcceptance': 'PENDING: two real phones required; QR depends on CS-82'}
    (output / 'release-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    return manifest


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apk', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--revision', required=True)
    parser.add_argument('--api', required=True)
    parser.add_argument('--web', required=True)
    parser.add_argument('--sdk', type=Path, default=Path(os.environ.get('ANDROID_HOME', os.environ.get('ANDROID_SDK_ROOT', ''))))
    args = parser.parse_args()
    print(json.dumps(package(args.apk, args.output, args.revision, args.api, args.web, args.sdk), indent=2))
