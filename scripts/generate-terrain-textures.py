"""Original periodic detail maps. Offline asset preparation; Python standard library only."""
from pathlib import Path
import math
import random
import struct
import zlib

SIZE = 256
OUTPUT = Path(__file__).resolve().parents[1] / 'src/client/public/textures/terrain'


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


def generate():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for seed, name in enumerate(['grass', 'soil', 'sand', 'rock', 'snow'], 103):
        rng = random.Random(seed)
        layers = [noise(rng, frequency, 4 if name == 'grass' else 1) for frequency in [4, 8, 16, 32, 64, 128]]
        weights = {'grass': [.1,.1,.15,.2,.25,.2], 'soil': [.2,.2,.2,.15,.15,.1],
                   'sand': [.05,.1,.1,.15,.25,.35], 'rock': [.3,.25,.15,.15,.1,.05],
                   'snow': [.15,.15,.2,.2,.2,.1]}[name]
        pixels = []
        for y in range(SIZE):
            for x in range(SIZE):
                value = sum(weight * layer(x, y) for weight, layer in zip(weights, layers))
                if name == 'rock':
                    value = .5 + .7 * math.tanh(4 * (value - .5))
                elif name == 'snow':
                    value = .5 + .55 * (value - .5)
                elif name == 'grass':
                    value = .5 + 1.4 * (value - .5)
                pixels.append(round(max(0, min(1, value)) * 255))
        (OUTPUT / (name + '.png')).write_bytes(png(pixels))


if __name__ == '__main__':
    generate()
