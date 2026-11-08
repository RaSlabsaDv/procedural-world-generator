"""Independent coastal-v2 scalar/distance reference. No production imports."""
import json
import struct
from collections import deque


def f32(x):
    return struct.unpack('<f', struct.pack('<f', x))[0]


def smooth(a, b, x):
    u = max(0, min(1, (x-a)/(b-a)))
    return u*u*(3-2*u)


def distances(ocean, width, height):
    result = [0 if v else 255 for v in ocean]
    queue = deque(i for i, v in enumerate(ocean) if v)
    while queue:
        i = queue.popleft()
        if result[i] >= 16:
            continue
        x, y = i % width, i // width
        neighbors = ([i-1] if x else [])+([i+1] if x < width-1 else [])
        neighbors += ([i-width] if y else [])+([i+width] if y < height-1 else [])
        for j in neighbors:
            if result[j] == 255:
                result[j] = result[i]+1
                queue.append(j)
    return result


def blend(base, d, e, m, t, s):
    base = list(map(f32, base))
    m, t, s = map(f32, (m, t, s))
    if d == 0 or d >= 16 or e <= 0:
        return base
    wet = smooth(.65, .90, m)
    room = (1-smooth(.15, .60, s))*(1-.35*wet)
    a = (1-smooth(1+3*room, 6+10*room, d))*(1-smooth(.005+.015*room, .03+.07*room, e))
    if a == 0:
        return base
    rock = smooth(.35, .90, s)
    sand = (.45+.45*smooth(.20, .50, t))*(1-.65*wet)
    grass = smooth(.30, .65, m)*smooth(.20, .40, t)
    available = 1-base[4]
    ground = available*(1-rock)
    target = [ground*(1-sand)*grass, ground*(1-sand)*(1-grass), ground*sand, available*rock]
    return [f32(v+(target[i]-v)*a) for i, v in enumerate(base[:4])]+[base[4]]


if __name__ == '__main__':
    for args in [([.5,.5,0,0,0],4,.02,.5,.7,.1),
                 ([.2,.3,0,.4,.1],8,.05,.8,.25,.3),
                 ([.5,.5,0,0,0],10,.04,.5,.7,.1),
                 ([.2,.3,0,.4,.1],4,.025,.8,.25,.6),
                 ([0,0,0,.2,.8],2,.01,.65,.15,1.1)]:
        print(json.dumps(dict(args=args, weights=blend(*args))))
    ocean = [False]*60
    ocean[0] = True
    print(json.dumps(dict(width=20, height=3, ocean=[0], distances=distances(ocean,20,3))))
