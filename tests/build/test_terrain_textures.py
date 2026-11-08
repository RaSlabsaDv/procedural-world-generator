"""Asset limits and deterministic offline reproduction, without imaging dependencies."""
import importlib.util
import hashlib
import statistics
import zlib
from pathlib import Path
import struct
import tempfile
import unittest

REPO = Path(__file__).resolve().parents[2]


class TerrainTextureTests(unittest.TestCase):
    def test_original_assets_reproduce_and_fit_texture_budget(self):
        spec = importlib.util.spec_from_file_location('terrain_textures', REPO / 'scripts/generate-terrain-textures.py')
        generator = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(generator)
        assets = REPO / 'src/client/public/textures/terrain'
        names = {'grass.png', 'soil.png', 'sand.png', 'rock.png', 'snow.png'}
        self.assertEqual({p.name for p in assets.glob('*.png')}, names)
        manifest = (assets / 'ASSETS.md').read_text()
        total = 0
        with tempfile.TemporaryDirectory() as temp:
            generator.OUTPUT = Path(temp)
            generator.generate()
            for name in names:
                data = (assets / name).read_bytes()
                total += len(data)
                self.assertEqual(data, (Path(temp) / name).read_bytes())
                self.assertIn(hashlib.sha256(data).hexdigest(), manifest)
                self.assertEqual(data[24:26], bytes([8, 0]))
                self.assertEqual(data[:8], b'\x89PNG\r\n\x1a\n')
                self.assertEqual(struct.unpack('>II', data[16:24]), (256, 256))
        self.assertLessEqual(total, 2 * 1024 * 1024)
        self.assertLessEqual(5 * 256 * 256 * 4 * 4 / 3, 8 * 1024 * 1024)

    def test_sampler_is_periodic_in_both_axes_without_border_copying(self):
        spec = importlib.util.spec_from_file_location('terrain_textures', REPO / 'scripts/generate-terrain-textures.py')
        generator = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(generator)
        for seed, name in enumerate(generator.PROFILES, 103):
            sample = generator.detail_sampler(name, seed)
            for x, y in [(0, 0), (.375, 31.625), (255.75, 128.25), (-.25, -.75)]:
                with self.subTest(texture=name, point=(x, y)):
                    self.assertAlmostEqual(sample(x, y), sample(x + 256, y), places=12)
                    self.assertAlmostEqual(sample(x, y), sample(x, y + 256), places=12)
                    self.assertGreaterEqual(sample(x, y), 0)
                    self.assertLessEqual(sample(x, y), 1)

    def test_tiles_have_detail_without_clipping_or_boundary_jumps(self):
        for path in (REPO / 'src/client/public/textures/terrain').glob('*.png'):
            data, offset, packed = path.read_bytes(), 8, b''
            while offset < len(data):
                length = int.from_bytes(data[offset:offset + 4], 'big')
                if data[offset + 4:offset + 8] == b'IDAT':
                    packed += data[offset + 8:offset + 8 + length]
                offset += length + 12
            raw = zlib.decompress(packed)
            self.assertTrue(all(raw[y * 257] == 0 for y in range(256)))
            pixels = [v for y in range(256) for v in raw[y * 257 + 1:(y + 1) * 257]]
            edge = [abs(pixels[y * 256] - pixels[y * 256 + 255]) for y in range(256)]
            edge += [abs(pixels[x] - pixels[255 * 256 + x]) for x in range(256)]
            interior = [abs(pixels[y * 256 + x] - pixels[y * 256 + x + 1])
                        for y in range(256) for x in range(255)]
            interior += [abs(pixels[y * 256 + x] - pixels[(y + 1) * 256 + x])
                         for y in range(255) for x in range(256)]
            with self.subTest(texture=path.name):
                self.assertGreater(min(pixels), 0)
                self.assertLess(max(pixels), 255)
                self.assertGreater(statistics.pstdev(pixels), 2)
                self.assertLessEqual(statistics.mean(edge), 1.75 * statistics.mean(interior))


if __name__ == '__main__':
    unittest.main()
