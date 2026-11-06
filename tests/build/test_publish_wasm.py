"""Exercise publishing transactions without downloading or compiling .NET."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import shlex
import subprocess
import tempfile
import unittest

REPO = Path(__file__).resolve().parents[2]

FAKE_DOTNET = r'''#!/usr/bin/env bash
set -euo pipefail
if [[ "${PWG_TEST_FAIL:-}" == "$1" ]]; then exit 42; fi
if [[ "$1" == restore ]]; then exit 0; fi
while [[ "$#" -gt 0 ]]; do
  if [[ "$1" == --output ]]; then shift; output="$1"; fi
  shift
done
mkdir -p "$output/wwwroot/_framework"
printf 'loader' > "$output/wwwroot/world-generator-host.js"
printf 'worker' > "$output/wwwroot/world-generator-worker.js"
printf 'bootstrap' > "$output/wwwroot/_framework/dotnet.js"
for name in "dotnet.native.${PWG_TEST_VERSION}.wasm" "dotnet.runtime.${PWG_TEST_VERSION}.js" "WorldGenerator.Core.${PWG_TEST_VERSION}.wasm" "WorldGenerator.Wasm.${PWG_TEST_VERSION}.wasm"; do
  printf '%s' "$PWG_TEST_VERSION" > "$output/wwwroot/_framework/$name"
done
if [[ "${PWG_TEST_FAIL:-}" == worker ]]; then rm "$output/wwwroot/world-generator-worker.js"; fi
if [[ "${PWG_TEST_FAIL:-}" == invalid ]]; then rm "$output/wwwroot/_framework/dotnet.native.${PWG_TEST_VERSION}.wasm"; fi
'''


class PublishTransactionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="pwg publish ")
        self.root = Path(self.temp.name)
        (self.root / "scripts").mkdir()
        shutil.copy(REPO / "scripts/publish-wasm.sh", self.root / "scripts/publish-wasm.sh")
        (self.root / "bin").mkdir()
        fake = self.root / "bin/dotnet"
        fake.write_text(FAKE_DOTNET)
        fake.chmod(0o755)
        move = self.root / "bin/mv"
        move.write_text('''#!/usr/bin/env bash
set -euo pipefail
if [[ "${PWG_TEST_FAIL:-}" == promotion && "$1" == */assets ]]; then exit 43; fi
exec ''' + shlex.quote(shutil.which('mv')) + ' "$@"\n')
        move.chmod(0o755)

    def tearDown(self):
        self.temp.cleanup()

    def publish(self, version, failure=""):
        env = dict(os.environ, PWG_TEST_VERSION=version, PWG_TEST_FAIL=failure)
        env["PATH"] = str(self.root / "bin") + os.pathsep + env["PATH"]
        return subprocess.run(["bash", str(self.root / "scripts/publish-wasm.sh")], env=env, capture_output=True, text=True, timeout=15)

    def snapshot(self):
        return {str(path.relative_to(self.root)): path.read_bytes()
                for base in [self.root / "artifacts/wasm", self.root / "src/client/public/wasm"]
                for path in base.rglob("*") if path.is_file()}

    def test_repeated_publish_removes_old_hashes_and_temporary_files(self):
        self.assertEqual(self.publish("old").returncode, 0)
        result = self.publish("current")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse(any("old" in name for name in self.snapshot()))
        self.assertEqual(len(list((self.root / "artifacts/wasm/wwwroot/_framework").glob("WorldGenerator.Core.*.wasm"))), 1)
        self.assertFalse(list((self.root / "artifacts").glob(".wasm-publish.*")))

    def test_failures_preserve_both_previous_outputs(self):
        for failure in ["restore", "publish", "invalid", "worker", "promotion"]:
            with self.subTest(failure=failure):
                self.assertEqual(self.publish("old").returncode, 0)
                before = self.snapshot()
                self.assertNotEqual(self.publish("new", failure).returncode, 0)
                self.assertEqual(self.snapshot(), before)
                self.assertFalse(list((self.root / "artifacts").glob(".wasm-publish.*")))


class PwaManifestTests(unittest.TestCase):
    def test_catalog_matches_final_assets_and_excludes_api_and_compressed_copies(self):
        with tempfile.TemporaryDirectory(prefix="pwg pwa ") as temp:
            output = Path(temp)
            framework = output / "wasm/_framework"
            framework.mkdir(parents=True)
            files = {
                "index.html": '<html><head></head><body><script src="main.js"></script></body></html>',
                "main.js": 'console.log("app");', "chunk-terrain.js": "deferred visualization", "styles.css": "",
                "wasm/world-generator-host.js": "export const host = true;",
                "wasm/_framework/dotnet.js": "runtime",
                "wasm/_framework/System.Private.CoreLib.current.wasm": "assembly",
                "wasm/_framework/Core.current.wasm.br": "compressed",
                "wasm/_framework/debug.js.map": "debug",
            }
            for name, content in files.items():
                (output / name).write_text(content)
            command = ["node", str(REPO / "scripts/finalize-pwa.mjs"), str(output)]
            subprocess.run(command, check=True, capture_output=True, timeout=20)
            catalog_path = next(output.glob("offline-assets.*.json"))
            catalog = json.loads(catalog_path.read_text())
            manifest = json.loads((output / "ngsw.json").read_text())
            self.assertIn('/chunk-terrain.js', catalog['assets'])
            self.assertIn('/chunk-terrain.js', manifest['assetGroups'][0]['urls'])
            self.assertIn('/' + catalog_path.name, manifest['hashTable'])
            self.assertIn('worldgen-offline-catalog', (output / 'index.html').read_text())
            self.assertEqual(len(manifest['assetGroups']), 1)
            self.assertEqual(manifest['assetGroups'][0]['installMode'], 'prefetch')
            self.assertEqual(manifest['dataGroups'], [])
            self.assertFalse(any(path.startswith('/api/') or path.endswith(('.br', '.gz', '.map', '.pdb')) for path in manifest['hashTable']))
            for path, expected in catalog['assets'].items():
                self.assertEqual(hashlib.sha1((output / path.lstrip('/')).read_bytes()).hexdigest(), expected)
                self.assertEqual(manifest['hashTable'][path], expected)
            # A second finalization is idempotent and does not accumulate catalogs.
            subprocess.run(command, check=True, capture_output=True, timeout=20)
            self.assertEqual(len(list(output.glob('offline-assets.*.json'))), 1)
            self.assertEqual(next(output.glob('offline-assets.*.json')).name, catalog_path.name)


if __name__ == '__main__':
    unittest.main()
