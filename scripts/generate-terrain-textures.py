"""Atlas periodic linear detail maps. Offline preparation; Python standard library only."""
from pathlib import Path
import math
import random
import struct
import zlib

SIZE = 256
OUTPUT = Path(__file__).resolve().parents[1] / 'src/client/public/textures/terrain'
REVISION = 'atlas-detail-v1'
FREQUENCIES = (4, 8, 16, 32, 64, 128)
# Mean detail and restrained contrast; tints remain in the unchanged Lambert material.
PROFILES = {
    'grass': (.47, .75, (.025, .065, .13, .23, .30, .25)),
    'soil': (.47, .70, (.03, .07, .14, .25, .29, .22)),
    'sand': (.53, .70, (.01, .03, .08, .18, .30, .40)),
    'rock': (.50, .90, (.04, .10, .20, .28, .23, .15)),
    'snow': (.54, .35, (.02, .05, .10, .23, .30, .30)),
}



def noise(rng, frequency, stretch=1):
    nx, ny = frequency, max(1, frequency // stretch)
    lattice = [[rng.random() for _ in range(nx)] for _ in range(ny)]
    def sample(x, y):
        u, v = x * nx / SIZE, y * ny / SIZE
        ix, iy = math.floor(u), math.floor(v)
        fx, fy = u - ix, v - iy
        fx, fy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
        a, b = lattice[iy % ny][ix % nx], lattice[iy % ny][(ix + 1) % nx]
        c, d = lattice[(iy + 1) % ny][ix % nx], lattice[(iy + 1) % ny][(ix + 1) % nx]
        return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy
    return sample


def png(pixels):
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))
    scanlines = b''.join(b'\0' + bytes(pixels[y * SIZE:(y + 1) * SIZE]) for y in range(SIZE))
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>2I5B', SIZE, SIZE, 8, 0, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(scanlines, 9)) + chunk(b'IEND', b''))


def detail_sampler(name, seed):
    """Periodic scalar microdetail, with no baked directional illumination."""
    rng = random.Random(seed)
    center, contrast, weights = PROFILES[name]
    layers = [noise(rng, frequency, 2 if name == 'grass' and frequency >= 32 else 1)
              for frequency in FREQUENCIES]
    fracture = noise(rng, 32) if name == 'rock' else None

    def sample(x, y):
        value = sum(weight * layer(x, y) for weight, layer in zip(weights, layers))
        value = center + contrast * (value - .5)
        if fracture:
            # Narrow, nondirectional mineral boundaries; at most 0.03 in the shader multiplier.
            distance = abs(fracture(x, y) - .5)
            t = min(1, distance / .045)
            value -= .05 * (1 - t * t * (3 - 2 * t))
        return max(0, min(1, value))
    return sample


def generate():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for seed, name in enumerate(PROFILES, 103):
        sample = detail_sampler(name, seed)
        pixels = [round(sample(x, y) * 255) for y in range(SIZE) for x in range(SIZE)]
        (OUTPUT / (name + '.png')).write_bytes(png(pixels))


if __name__ == '__main__':
    generate()
