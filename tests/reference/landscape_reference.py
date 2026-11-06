"""Independent diverse-landscape-v2 composition fixture, no production code imports.
Shares only the independently implemented frozen scalar noise from the v1 reference.
"""
import json
import struct
from terrain_reference import fbm


def f32(x):
    return struct.unpack('f', struct.pack('f', x))[0]


def smooth(a, b, x):
    u = max(0, min(1, (x-a)/(b-a)))
    return u*u*(3-2*u)


def compose():
    values = []
    for y in range(2):
        for x in range(3):
            px, py, seed = x*.37, y*.37, 42
            wx = px+2*(2*fbm(px*.35+17, py*.35+31, seed ^ 0xA341316C)-1)
            wy = py+2*(2*fbm(px*.35+47, py*.35+13, seed ^ 0xC8013EA4)-1)
            region = max(0, min(1, 2*(fbm(wx*.65, wy*.65, seed ^ 0xD1B54A35)-.25)))
            p = 1-smooth(.45-.08, .45+.08, region)
            m = smooth(1-.30-.08, 1-.30+.08, region)
            h = max(0, 1-p-m)
            basis = .08+.26*fbm(wx*.18, wy*.18, seed ^ 0xAD90777D)
            roll = fbm(wx*.6, wy*.6, seed ^ 0x68E31DA4)
            detail = fbm(wx*2, wy*2, seed ^ 0x9E3779B9)
            ridge = 1-abs(2*fbm(wx*.8, wy*.8, seed ^ 0x7E95761E)-1)
            ridge = ridge*ridge*ridge
            raw = p*(basis+.012*(2*roll-1)+.003*(2*detail-1))+h*(basis+.07+.13*roll+.015*detail)+m*(basis+.10+.62*.55*ridge+.025*detail)
            values.append(f32(max(0, min(1, raw))*30))
    return values


if __name__ == '__main__':
    print(json.dumps(compose(), indent=2))
