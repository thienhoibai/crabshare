"""Read the kernel route to CrabShare; never change networking or inspect secrets."""
import ipaddress
import json
from pathlib import Path
import re
import socket
import subprocess
import time
from urllib.parse import urlsplit


class NetworkStatus:
    def __init__(self):
        self.checked_at = float('-inf')
        self.cached = {}
        self.url = None

    def read(self, url):
        if url == self.url and time.monotonic() - self.checked_at < 10:
            return self.cached.copy()
        result = {'connectionType': 'unknown', 'networkInterface': None, 'networkIp': None}
        try:
            host = urlsplit(url).hostname
            try:
                target = str(ipaddress.ip_address(host))
            except ValueError:
                target = socket.getaddrinfo(host, None, socket.AF_INET, socket.SOCK_STREAM)[0][4][0]
            route = json.loads(subprocess.run(
                ['ip', '-j', 'route', 'get', target], capture_output=True, text=True,
                timeout=1, check=True).stdout)[0]
            interface = route.get('dev', '')
            if re.fullmatch(r'[A-Za-z0-9_.:-]{1,32}', interface):
                root = Path('/sys/class/net') / interface
                if (root / 'wireless').is_dir() or (root / 'phy80211').exists():
                    kind = 'wifi'
                elif (root / 'type').read_text().strip() == '1' and (root / 'device').exists():
                    kind = 'ethernet'
                else:
                    kind = 'unknown'
                source = route.get('prefsrc') or route.get('src')
                result.update(connectionType=kind, networkInterface=interface,
                              networkIp=str(ipaddress.ip_address(source)) if source else None)
        except (OSError, ValueError, TypeError, IndexError, KeyError, subprocess.SubprocessError):
            pass
        self.cached, self.url, self.checked_at = result, url, time.monotonic()
        return result.copy()
