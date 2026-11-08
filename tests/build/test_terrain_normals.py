"""Packed layer reproduction, scalar normal conventions and periodic seams."""
import hashlib
import importlib.util
import json
from pathlib import Path
import struct
import unittest
import zlib

REPO = Path(__file__).resolve().parents[2]


def generator():
    spec = importlib.util.spec_from_file_location('terrain_normals', REPO/'scripts/generate-terrain-normals.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class TerrainNormalTests(unittest.TestCase):
    def test_reproduction_dimensions_and_budget(self):
        module = generator()
        data = (module.OUTPUT/'normals.png').read_bytes()
        self.assertEqual(data, module.generate())
        self.assertEqual(struct.unpack('>II', data[16:24]), (128, 640))
        self.assertEqual(data[24:26], bytes([8, 2]))
        self.assertLessEqual(len(data), 256*1024)
        self.assertIn(hashlib.sha256(data).hexdigest(), (module.OUTPUT/'ASSETS.md').read_text())
        config = json.loads((REPO/'src/client/ngsw-config.json').read_text())
        self.assertIn('/textures/microdetail/*.png$', config['assetGroups'][0]['resources']['files'])

    def test_periodicity_and_bounded_unit_normals(self):
        module = generator()
        for i, strength in enumerate(module.STRENGTHS):
            sample = module.sampler(1801+i, strength)
            for u, v in [(0, 0), (.375, .624), (-.125, 1.5)]:
                self.assertEqual(sample(u, v), sample(u+1, v))
                self.assertEqual(sample(u, v), sample(u, v+1))
            for y in range(32):
                for x in range(32):
                    normal = [(n-128)/127 for n in sample(x/32, y/32)]
                    self.assertGreater(normal[2], .25)
                    self.assertAlmostEqual(sum(n*n for n in normal), 1, delta=.016)
            self.assertEqual(module.sampler(1801+i, 0)(.3, .4), (128, 128, 255))

    def test_layer_seams_have_no_large_jump(self):
        module = generator()
        for i, strength in enumerate(module.STRENGTHS):
            sample = module.sampler(1801+i, strength)
            edges = []
            interior = []
            for y in range(128):
                for x in range(128):
                    p = sample(x/128, y/128)
                    q = sample(((x+1) % 128)/128, y/128)
                    difference = sum(abs(a-b) for a, b in zip(p, q))
                    (edges if x == 127 else interior).append(difference)
            self.assertLess(sum(edges)/len(edges), 3*sum(interior)/len(interior)+1)
