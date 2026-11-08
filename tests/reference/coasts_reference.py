"""Independent coastal distance and float32 blending reference. No production imports."""
from collections import deque
import struct, json

def f32(x): return struct.unpack('<f',struct.pack('<f',x))[0]
def smooth(a,b,x):
    u=max(0,min(1,(x-a)/(b-a)))
    return u*u*(3-2*u)
def distances(ocean,w,h):
    result=[0 if v else 255 for v in ocean];q=deque()
    for i,v in enumerate(ocean):
        if v:q.append(i)
    while q:
        i=q.popleft()
        if result[i]>=8:continue
        x,z=i%w,i//w
        for j in ([i-1]if x else [])+([i+1]if x<w-1 else [])+([i-w]if z else [])+([i+w]if z<h-1 else []):
            if result[j]==255:result[j]=result[i]+1;q.append(j)
    return result

def blend(base,d,e,m,t,s):
    base=[f32(v) for v in base];m,t,s=map(f32,(m,t,s))
    if d==0 or d>=8 or e<=0:return base
    a=(1-smooth(2,8,d))*(1-smooth(.01,.05,e))
    if a==0:return base
    r=smooth(.35,.90,s)
    b=(.45+.45*smooth(.20,.50,t))*(1-.65*smooth(.65,.90,m))
    g=smooth(.30,.65,m)*smooth(.20,.40,t)
    ground=(1-base[4])*(1-r)
    target=[ground*(1-b)*g,ground*(1-b)*(1-g),ground*b,(1-base[4])*r]
    return [f32(v+(target[i]-v)*a)for i,v in enumerate(base[:4])]+[base[4]]

if __name__=='__main__':
    for args in [([.5,.5,0,0,0],1,.005,.5,.7,.1),([.2,.3,0,.4,.1],4,.025,.8,.25,.6),([0,0,0,.2,.8],2,.01,.65,.15,1.1)]:
        print(json.dumps(dict(args=args,weights=blend(*args))))
    o=[False]*24;o[0]=True;o[17]=True
    print(json.dumps(dict(width=6,height=4,ocean=[0,17],distances=distances(o,6,4))))
