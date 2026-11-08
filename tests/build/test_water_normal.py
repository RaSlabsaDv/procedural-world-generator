"""Normal asset reproduction, periodicity and PWA inclusion."""
import hashlib
import importlib.util
from pathlib import Path
import json
import unittest

REPO = Path(__file__).resolve().parents[2]


class WaterNormalTests(unittest.TestCase):
    def test_reproduces_periodic_linear_normal_tile(self):
        spec = importlib.util.spec_from_file_location('water_normal',REPO/'scripts/generate-water-normal.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        data=(REPO/'src/client/public/textures/water/waves-normal.png').read_bytes()
        self.assertEqual(data,module.generate())
        self.assertLess(len(data),65536)
        self.assertEqual(data[24:26],bytes([8,2]))
        self.assertIn(hashlib.sha256(data).hexdigest(),(REPO/'src/client/public/textures/water/ASSETS.md').read_text())
        for u,v in [(0,0),(.375,.62),(-.25,1.2)]:
            self.assertEqual(module.normal(u,v),module.normal(u+1,v))
            self.assertEqual(module.normal(u,v),module.normal(u,v+1))
        config=json.loads((REPO/'src/client/ngsw-config.json').read_text())
        self.assertIn('/textures/water/*.png$',config['assetGroups'][0]['resources']['files'])

    def test_ripples_have_no_dominant_stripe_direction(self):
        spec = importlib.util.spec_from_file_location('water_normal', REPO/'scripts/generate-water-normal.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        # Directional normal energy across the full tile; the former three-wave
        # asset was strongly anisotropic. Eigenvalues detect diagonal bands too.
        samples = [module.normal(x/128, y/128) for y in range(128) for x in range(128)]
        mean_x = sum(p[0] for p in samples)/len(samples)
        mean_y = sum(p[1] for p in samples)/len(samples)
        xx = sum((p[0]-mean_x)**2 for p in samples)
        yy = sum((p[1]-mean_y)**2 for p in samples)
        xy = sum((p[0]-mean_x)*(p[1]-mean_y) for p in samples)
        spread = ((xx-yy)**2+4*xy*xy)**.5
        self.assertGreater(xx+yy-spread, 0)
        self.assertLess((xx+yy+spread)/(xx+yy-spread), 1.25)
