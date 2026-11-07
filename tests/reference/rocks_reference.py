"""Independent rock hash/transform literals, using only the frozen Python noise reference."""
import json, struct, math
from terrain_reference import noise, fbm

def f32(x): return struct.unpack('<f',struct.pack('<f',x))[0]
def candidate(x,z,seed,kind):
    seed &= 0xffffffff
    h=lambda salt: noise(x,z,seed^salt)
    q=h(0x9FB21C65)
    sx=f32(([.22,.28,.12][kind])+([.10,.08,.06][kind])*q)
    return dict(cluster=fbm(x*.03*.8+71,z*.03*.8+29,seed^0x6C8E9CF5,3),
        x=f32(x+.4+.2*h(0xD192ED03)),z=f32(z+.4+.2*h(0xA24BAED5)),scaleX=sx,
        scaleY=f32([.24,.48,.10][kind]+[.18,.32,.10][kind]*q),
        scaleZ=f32(sx*(.7+.3*h(0xC13FA9A9))),rotation=f32(2*math.pi*h(0xF39CC061)),
        variant=0 if h(0xB7E15163)<.5 else 1,priority=h(0x8AED2A6B))
if __name__=='__main__':
    for x,z,seed,kind in [(0,0,42,0),(17,23,-7,1),(64,91,-2147483648,2),(127,3,2147483647,0)]:
        print(json.dumps(dict(cell=[x,z],seed=seed,kind=kind,**candidate(x,z,seed,kind))))

# Flat dry fixture: no trees, no ocean, slope/rock coverage zero. All candidates are boulders.
def flat_indices(width,height,seed):
    candidates=[]
    for z in range(height-1):
        for x in range(width-1):
            c=candidate(x,z,seed,0)
            if noise(x,z,(seed&0xffffffff)^0x91E10DA5) < .025+.10*c['cluster']:
                candidates.append((c['priority'],z*width+x,c))
    accepted=[]
    for _,i,c in sorted(candidates):
        if all((c['x']-other['x'])**2+(c['z']-other['z'])**2 >= (c['scaleX']+other['scaleX']+.12)**2 for _,other in accepted):
            accepted.append((i,c))
        if len(accepted)==8192: break
    return sorted(i for i,_ in accepted)

if __name__=='__main__':
    for seed in [42,-7,-2147483648,2147483647]:
        print(json.dumps(dict(flat=[17,13],seed=seed,indices=flat_indices(17,13,seed))))
