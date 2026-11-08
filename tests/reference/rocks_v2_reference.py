"""Independent sparse-rock v2 hashes/transforms/flat selection; no production imports."""
import json
import math
import struct
from terrain_reference import noise, fbm


def f32(x):
    return struct.unpack('f', struct.pack('f', x))[0]


def smooth(a, b, x):
    u = max(0, min(1, (x-a)/(b-a)))
    return u*u*(3-2*u)


def candidate(x, z, seed, kind):
    seed &= 0xffffffff
    h = lambda salt: noise(x, z, seed ^ salt)
    size, cls = h(0x9FB21C65), h(0x3C6EF372)
    cls = 2 if cls < .10 else 1 if cls < .45 else 0
    if kind == 2 and cls == 2:
        cls = 1
    ranges = {0: [(.22,.23,.22,.23),(.70,.65,.70,.50),(1.80,1.20,1.60,1.00)],
              1: [(.30,.20,.45,.25),(.80,.60,1.10,.70),(1.80,1.20,2.00,1.20)],
              2: [(.18,.17,.12,.10),(.40,.25,.25,.15)]}
    ax, bx, ay, by = ranges[kind][cls]
    sx, sy = f32(ax+bx*size), f32(ay+by*size)
    aspect = .35+.20*h(0xC13FA9A9) if kind == 1 else .65+.30*h(0xC13FA9A9)
    return dict(x=f32(x+.04+.92*h(0xD192ED03)), z=f32(z+.04+.92*h(0xA24BAED5)),
                scaleX=sx, scaleY=sy, scaleZ=f32(sx*aspect), rotation=f32(2*math.pi*h(0xF39CC061)),
                variant=0 if h(0xB7E15163)<.5 else 1, priority=h(0x8AED2A6B), sizeClass=cls)


def flat_indices(w, h, seed):
    seed &= 0xffffffff
    candidates = []
    for z in range(h-1):
        for x in range(w-1):
            cluster = fbm(x/48+71, z/48+29, seed ^ 0x6C8E9CF5, 2)
            chance = (.003+.05*smooth(.48,.72,cluster))*.35
            if noise(x,z,seed ^ 0x91E10DA5) >= chance:
                continue
            c = candidate(x,z,seed,0)
            r = c['scaleX']
            if c['x']-r < 0 or c['x']+r > w-1 or c['z']-r < 0 or c['z']+r > h-1:
                continue
            candidates.append((c['priority'],z*w+x,c))
    accepted = []
    for _, i, c in sorted(candidates):
        if all((c['x']-a['x'])**2+(c['z']-a['z'])**2 >= (c['scaleX']+a['scaleX']+.40)**2 for _,a in accepted):
            accepted.append((i,c))
    return sorted(i for i,_ in accepted)


if __name__ == '__main__':
    for x,z,seed,kind in [(0,0,42,0),(17,23,-7,1),(64,91,-2147483648,2),(127,3,2147483647,0)]:
        print(json.dumps(dict(cell=[x,z],seed=seed,kind=kind,**candidate(x,z,seed,kind))))
    for seed in [42,-7,-2147483648,2147483647]:
        print(json.dumps(dict(seed=seed,indices=flat_indices(33,25,seed))))
