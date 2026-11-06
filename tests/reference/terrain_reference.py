"""Small independent scalar reference for warped-ridged-hydraulic-v1; no project imports."""
import json
import math
import struct


def noise(x, y, seed):
    def lattice(a, b):
        h = (a * 0x8DA6B343 + b * 0xD8163841 + seed * 0xCB1AB31F) & 0xffffffff
        h ^= h >> 16
        h = h * 0x7FEB352D & 0xffffffff
        h ^= h >> 15
        h = h * 0x846CA68B & 0xffffffff
        return (h ^ (h >> 16)) / 4294967296
    a, b = math.floor(x), math.floor(y)
    u, v = x-a, y-b
    u = u*u*u*(u*(u*6-15)+10)
    v = v*v*v*(v*(v*6-15)+10)
    nw, ne, sw, se = [lattice(a+dx, b+dy) for dx, dy in [(0, 0), (1, 0), (0, 1), (1, 1)]]
    top, bottom = nw+(ne-nw)*u, sw+(se-sw)*u
    return top+(bottom-top)*v


def fbm(x, y, seed, octaves=3):
    terms = [noise(x*2**k, y*2**k, seed)*(.5**k) for k in range(octaves)]
    return min(1, max(0, sum(terms)/sum(.5**k for k in range(octaves))))


def reference(steps):
    width, height, bound, seed = 3, 2, 30, 42
    terrain = []
    for y in range(height):
        for x in range(width):
            px, py = x*.37, y*.37
            wx = px + 2*(2*fbm(px*.35+17, py*.35+31, seed ^ 0xA341316C)-1)
            wy = py + 2*(2*fbm(px*.35+47, py*.35+13, seed ^ 0xC8013EA4)-1)
            broad = fbm(wx*.2, wy*.2, seed ^ 0xAD90777D)**2
            ridge = 1-abs(2*fbm(wx*.8, wy*.8, seed ^ 0x7E95761E)-1)
            ridge = ridge*ridge*ridge
            detail = fbm(wx*2, wy*2, seed ^ 0x9E3779B9)
            terrain.append(min(1, max(0, (1-.55)*broad+.55*ridge+.1*(detail-.5)))*bound)
    adjacency = []
    for y in range(height):
        for x in range(width):
            adjacency.append([ny*width+nx for nx, ny in [(x-1, y), (x+1, y), (x, y-1), (x, y+1)]
                              if 0 <= nx < width and 0 <= ny < height])
    water, sediment = [0.]*6, [0.]*6
    for _ in range(steps):
        water = [w+.05*.2 for w in water]
        outgoing = []
        for i, neighbors in enumerate(adjacency):
            amounts = [.2*.25*max(0, (terrain[i]+water[i])-(terrain[j]+water[j])) for j in neighbors]
            scale = min(1, water[i]/sum(amounts)) if sum(amounts) else 1
            outgoing.append([q*scale for q in amounts])
        slopes = [max([0]+[terrain[i]-terrain[j] for j in ns]) for i, ns in enumerate(adjacency)]
        for i in range(6):
            capacity = 4*sum(outgoing[i])*max(slopes[i], .01)
            if sediment[i] > capacity:
                amount = min((sediment[i]-capacity)*.25, max(0, bound-terrain[i]))
                terrain[i] += amount
                sediment[i] -= amount
            else:
                amount = min((capacity-sediment[i])*.25, terrain[i])
                terrain[i] -= amount
                sediment[i] += amount
        destination_water, destination_sediment = [0.]*6, [0.]*6
        for i, ns in enumerate(adjacency):
            moved_s = [sediment[i]*(q/water[i]) if water[i] > 1e-12 else 0 for q in outgoing[i]]
            for j, q, s in zip(ns, outgoing[i], moved_s):
                destination_water[j] += q
                destination_sediment[j] += s
            destination_water[i] += max(0, water[i]-sum(outgoing[i]))
            destination_sediment[i] += max(0, sediment[i]-sum(moved_s))
        water = [w-w*.1*.2 for w in destination_water]
        sediment = destination_sediment
    return [struct.unpack('f', struct.pack('f', value))[0] for value in terrain]


if __name__ == '__main__':
    print(json.dumps({steps: reference(steps) for steps in [0, 2]}, indent=2))
