"""Asset limits and deterministic offline reproduction, without imaging dependencies."""
import importlib.util
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
        total = 0
        with tempfile.TemporaryDirectory() as temp:
            generator.OUTPUT = Path(temp)
            generator.generate()
            for name in names:
                data = (assets / name).read_bytes()
                total += len(data)
                self.assertEqual(data, (Path(temp) / name).read_bytes())
                self.assertEqual(data[:8], b'\x89PNG\r\n\x1a\n')
                self.assertEqual(struct.unpack('>II', data[16:24]), (256, 256))
        self.assertLessEqual(total, 2 * 1024 * 1024)
        self.assertLessEqual(5 * 256 * 256 * 4 * 4 / 3, 8 * 1024 * 1024)


if __name__ == '__main__':
    unittest.main()
