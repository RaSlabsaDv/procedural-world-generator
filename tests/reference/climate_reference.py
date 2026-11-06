"""Independent v3 composition/climate fixture; no production project imports."""
import json
from terrain_reference import fbm
from landscape_reference import f32


def reference(scale=2, warmth=.35):
    values, moistures, temperatures = [], [], []
    for y in range(2):
        for x in range(3):
            px, py, seed = x*.37, y*.37, 42
            wx = px+2*(2*fbm(px*.35+17, py*.35+31, seed ^ 0xA341316C)-1)
            wy = py+2*(2*fbm(px*.35+47, py*.35+13, seed ^ 0xC8013EA4)-1)
            region = max(0, min(1, 2*(fbm(wx*.65/scale, wy*.65/scale, seed ^ 0xD1B54A35)-.25)))
            def smooth(a,b,n):
                u=max(0,min(1,(n-a)/(b-a)))
                return u*u*(3-2*u)
            p=1-smooth(.45-.08,.45+.08,region)
            m=smooth(1-.30-.08,1-.30+.08,region)
            hill=max(0,1-p-m)
            basis=.08+.26*fbm(wx*.18,wy*.18,seed ^ 0xAD90777D)
            roll=fbm(wx*.6,wy*.6,seed ^ 0x68E31DA4)
            detail=fbm(wx*2,wy*2,seed ^ 0x9E3779B9)
            ridge=1-abs(2*fbm(wx*.8,wy*.8,seed ^ 0x7E95761E)-1)
            ridge=ridge*ridge*ridge
            height=f32(max(0,min(1,p*(basis+.012*(2*roll-1)+.003*(2*detail-1))+hill*(basis+.07+.13*roll+.015*detail)+m*(basis+.10+.62*.55*ridge+.025*detail)))*30)
            h=height/30
            moisture=f32(max(0,min(1,.65+.7*(fbm(px*.65+11,py*.65+23,seed ^ 0xB5297A4D,4)-.5)-.15*h-.10*max(0,warmth-.6))))
            temperature=f32(max(0,min(1,warmth+.18-.5*h+.24*(fbm(px*.3,py*.3,seed ^ 0x1B56C4E9)-.5))))
            values.append(height);moistures.append(moisture);temperatures.append(temperature)
    return dict(values=values,moisture=moistures,temperature=temperatures)


if __name__ == '__main__':
    print(json.dumps(reference(),indent=2))
