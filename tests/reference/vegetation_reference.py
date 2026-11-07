"""Independent vegetation structure/variant fixture; no production project imports."""
import json
from terrain_reference import fbm, noise as lattice


def smooth(a,b,x):
    u=max(0,min(1,(x-a)/(b-a)))
    return u*u*(3-2*u)


def structure(x,y,seed,noise_scale=.03,savanna=False):
    seed &= 0xffffffff
    px,py=x*noise_scale,y*noise_scale
    grove=fbm(px*.45+37,py*.45+19,seed ^ 0xD6E8FEB9,3)
    clearing=fbm(px*1.7+53,py*1.7+7,seed ^ 0xA5A3564D,2)
    cluster,opening=smooth(.32,.62,grove),smooth(.30,.52,clearing)
    return ((.70+.30*cluster)*(.65+.35*opening) if savanna else (.12+.88*cluster)*(.20+.80*opening))


if __name__=='__main__':
    for x,y,seed in [(0,0,42),(17,23,42),(64,91,-2147483648),(127,3,2147483647)]:
        print(json.dumps(dict(x=x,y=y,seed=seed,forest=structure(x,y,seed),savanna=structure(x,y,seed,savanna=True),variant=0 if lattice(x,y,(seed&0xffffffff)^0xF1357AE5)<.4 else 1)))
