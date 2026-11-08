"""Independent regional-climate v1 literals. Standard library; no production imports."""
import json
import struct
from terrain_reference import fbm


def f32(x):
    return struct.unpack('f', struct.pack('f', x))[0]


def smooth(a, b, x):
    u = max(0, min(1, (x-a)/(b-a)))
    return u*u*(3-2*u)


def climate(x, y, seed, height, moisture, warmth):
    seed &= 0xffffffff
    humidity = fbm(x/144+11, y/144+23, seed ^ 0xB5297A4D, 3)
    thermal = fbm(x/128+17, y/128+31, seed ^ 0x1B56C4E9, 3)
    return [f32(max(0, min(1, moisture+.8*(humidity-.5)-.15*height-.10*max(0, warmth-.6)))),
            f32(max(0, min(1, warmth+.12-.95*height+.5*(thermal-.5))))]


def coverage(h, m, t, s):
    m, t, s = map(f32, (m, t, s))
    snow = smooth(.38, .60, h)*(1-smooth(.20, .38, t))*(1-smooth(1, 1.4, s))
    rock = smooth(.45, 1.05, s)
    grass = smooth(.28, .60, m)*smooth(.18, .38, t)
    rest = (1-snow)*(1-rock)
    return list(map(f32, (rest*grass, rest*(1-grass), 0, (1-snow)*rock, snow)))


def reference():
    points = [(0, 0, 42, .55, .65, .6), (64, 48, 42, .2, .65, .6),
              (255, 127, -2147483648, .6, .8, .38),
              (511, 511, 2147483647, 0, .2, .9), (97, 33, -7, .48, .45, .6)]
    surfaces = [(.49, .44, .29, .75), (.7, .65, .1, 1.2),
                (.4, .65, .35, 0), (.7, .65, .9, 0)]
    return dict(climate=[dict(input=p, output=climate(*p)) for p in points],
                coverage=[dict(input=p, output=coverage(*p)) for p in surfaces])


if __name__ == '__main__':
    print(json.dumps(reference(), indent=2))
