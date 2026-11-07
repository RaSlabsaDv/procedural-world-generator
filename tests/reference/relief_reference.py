"""Independent local relief scalar reference; imports frozen Python noise only."""
import json
from terrain_reference import fbm, noise

def smooth(a,b,n):
    u=max(0,min(1,(n-a)/(b-a)))
    return u*u*(3-2*u)

def relief(x,z,seed,p,h,m,ridge,strength):
    seed &= 0xffffffff
    mask=smooth(.48,.72,fbm(x/96+17,z/96+31,seed^0x243F6A89,2))
    hill=2*fbm(x/32+47,z/32+13,seed^0x85A308D3,2)-1
    detail=2*fbm(x/16+29,z/16+53,seed^0x13198A2E,2)-1
    gate=smooth(.08,.25,ridge)*(1-smooth(.70,.90,ridge))
    mountain=0
    if m and strength and gate:
        bend=2*noise(x/64+7,z/64+19,seed^0x03707344)-1
        u=(.8*x+.6*z)/12+.35*bend+13
        v=(-.6*x+.8*z)/40+43
        mountain=strength*gate*(-.035*smooth(.35,.75,noise(u,v,seed^0xA4093822))+.006*detail)
    return (p*(mask*(.008*hill+.0015*detail))+h*(.025*hill+.006*detail))+m*mountain

if __name__=='__main__':
    for x,z,seed,p,h,m,r,s in [(0,0,42,1,0,0,.4,.55),(17,23,-7,0,1,0,.4,.55),(64,91,-2147483648,0,0,1,.4,.8),(127,3,2147483647,.3,.4,.3,.2,1),(511,511,42,1,0,0,.5,.55)]:
        print(json.dumps(dict(x=x,z=z,seed=seed,p=p,h=h,m=m,ridge=r,strength=s,delta=relief(x,z,seed,p,h,m,r,s))))

if __name__=='__main__':
    import struct
    heights=[]
    for z in range(2):
        for x in range(3):
            px,pz=x*.03,z*.03
            base=(.08+.26*fbm(px*.18,pz*.18,42^0xAD90777D,4))+.012*(2*fbm(px*.6,pz*.6,42^0x68E31DA4,4)-1)+.003*(2*fbm(px*2,pz*2,42^0x9E3779B9,4)-1)
            d=relief(x,z,42,1,0,0,.4,.55)
            level=max(0,min(1,base+d*min(1,min(base,1-base)/.05)))*30
            heights.append(struct.unpack('<f',struct.pack('<f',level))[0])
    print(json.dumps(dict(zeroWarpPurePlainHeights=heights)))
