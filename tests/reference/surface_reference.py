"""Independent scalar surface-coverage fixture; no production code imports."""
import json
import struct


def f32(x):
    return struct.unpack('<f', struct.pack('<f', x))[0]


def smooth(a, b, x):
    u = max(0, min(1, (x-a)/(b-a)))
    return u*u*(3-2*u)


def reference(ocean, h, m, t, s):
    if ocean:
        return [0.] * 5
    m, t, s = map(f32, [m, t, s])
    snow = smooth(.45,.65,h)*(1-smooth(.18,.30,t))*(1-smooth(1,1.4,s))
    rock = smooth(.45,1.05,s)
    grass = smooth(.28,.60,m)*smooth(.18,.38,t)
    remaining = (1-snow)*(1-rock)
    return list(map(f32, [remaining*grass, remaining*(1-grass), 0, (1-snow)*rock, snow]))


if __name__ == '__main__':
    for case in [(False,.55,.44,.24,.75),(False,.7,.65,.1,1.2),(False,0,.65,.7,0),(False,.2,.1,.9,1.4)]:
        print(json.dumps(dict(input=case, expected=reference(*case))))
