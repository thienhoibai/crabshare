import json
import subprocess
import unittest
from unittest.mock import Mock, patch
from network_status import NetworkStatus


class NetworkStatusTests(unittest.TestCase):
    def route(self, interface):
        return Mock(stdout=json.dumps([{'dev': interface, 'prefsrc': '192.168.1.94'}]))

    def test_wifi_route_is_reported_and_cached(self):
        with patch('network_status.subprocess.run', return_value=self.route('wlan0')) as run, \
             patch('network_status.Path.is_dir', return_value=True):
            probe = NetworkStatus()
            report = probe.read('http://192.168.1.20:5233')
            self.assertEqual(report, {'connectionType': 'wifi', 'networkInterface': 'wlan0', 'networkIp': '192.168.1.94'})
            report['connectionType'] = 'bad'
            self.assertEqual(probe.read('http://192.168.1.20:5233')['connectionType'], 'wifi')
            run.assert_called_once()
            self.assertEqual(run.call_args.args[0][-1], '192.168.1.20')

    def test_ethernet_route_and_url_change_invalidate_cache(self):
        with patch('network_status.subprocess.run', return_value=self.route('eth0')) as run, \
             patch('network_status.Path.is_dir', return_value=False), \
             patch('network_status.Path.exists', side_effect=lambda p=None: False) as exists, \
             patch('network_status.Path.read_text', return_value='1'):
            exists.side_effect = [False, True, False, True]
            probe = NetworkStatus()
            self.assertEqual(probe.read('http://192.168.1.20')['connectionType'], 'ethernet')
            probe.read('http://192.168.1.21')
            self.assertEqual(run.call_count, 2)

    def test_failed_probe_does_not_guess_or_break_runtime(self):
        with patch('network_status.subprocess.run', side_effect=subprocess.TimeoutExpired('ip', 1)):
            self.assertEqual(NetworkStatus().read('http://192.168.1.20')['connectionType'], 'unknown')
