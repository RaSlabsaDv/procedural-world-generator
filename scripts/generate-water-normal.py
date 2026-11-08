"""Deterministic periodic RGB normal tile, CC0; no imaging dependencies."""
from pathlib import Path
import math
import random
import struct
import zlib

SIZE = 128
OUTPUT = Path(__file__).resolve().parents[1] / 'src/client/public/textures/water/waves-normal.png'


# Independent phases and perpendicular pairs avoid one dominant stripe direction.
# Integer frequencies keep both borders exactly periodic; randomness is offline only.
def wave_components():
    rng = random.Random(20261109)
    candidates = [(a, b) for a in range(1, 16) for b in range(16)
                  if 3 <= math.hypot(a, b) <= 16]
    components = []
    for a, b in rng.sample(candidates, 32):
        weight = .035 / math.hypot(a, b)
        components.append((a, b, weight, rng.random() * 2 * math.pi))
        components.append((-b, a, weight, rng.random() * 2 * math.pi))
    return tuple(components)


COMPONENTS = wave_components()


def normal(u, v):
    dx = dz = 0.0
    for a, b, weight, phase in COMPONENTS:
        c = math.cos(2*math.pi*(a*u+b*v)+phase)*weight
        dx += a*c
        dz += b*c
    length = math.sqrt(dx*dx+dz*dz+1)
    return tuple(round((value/length*.5+.5)*255) for value in (-dx, -dz, 1))


def generate():
    raw = b''.join(b'\0'+bytes(c for x in range(SIZE) for c in normal(x/SIZE,y/SIZE)) for y in range(SIZE))
    def chunk(kind, data):
        return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)
    return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',SIZE,SIZE,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(raw,9))+chunk(b'IEND',b'')


if __name__ == '__main__':
    OUTPUT.parent.mkdir(parents=True,exist_ok=True)
    OUTPUT.write_bytes(generate())
