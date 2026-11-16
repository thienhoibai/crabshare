import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import subprocess
from package_demo import https_origin, package


class PackageTests(unittest.TestCase):
    def test_refuses_non_https_or_embedded_credentials(self):
        for value in ['http://localhost:5233', 'https://user:secret@api.test', 'https://api.test/path', 'https://api.test?token=x']:
            with self.assertRaises(ValueError): https_origin(value)

    def test_debug_certificate_cannot_be_released(self):
        with tempfile.TemporaryDirectory(prefix='CrabShareReleaseTest-') as directory:
            root = Path(directory)
            (root / 'build-tools' / '36.0.0').mkdir(parents=True)
            result = subprocess.CompletedProcess([], 0, stdout='Signer #1 certificate DN: CN=Android Debug\n', stderr='')
            with patch('package_demo.subprocess.run', return_value=result):
                with self.assertRaisesRegex(ValueError, 'debug certificate'):
                    package(root / 'app.apk', root / 'output', 'a' * 40, 'https://api.test', 'https://web.test', root)
            self.assertFalse((root / 'output').exists())


if __name__ == '__main__':
    unittest.main()
