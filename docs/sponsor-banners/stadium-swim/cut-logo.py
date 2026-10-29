import sys
from PIL import Image
import numpy as np
src,dst=sys.argv[1],sys.argv[2]
a=np.array(Image.open(src).convert('RGB')).astype(float)
LB=np.array([107,191,221.])
x0,x1,y0,y1=433,1216,486,789
c=a[y0:y1,x0:x1]; H,W,_=c.shape
out=np.zeros((H,W,4)); by=637-y0
out[:by,:,:3]=255; out[:by,:,3]=np.clip(c[:by,:,2]/110,0,1)*255
out[by:,:,:3]=LB; out[by:,:,3]=np.clip((c[by:,:,1]-59)/(LB[1]-59),0,1)*255
th=4; bx0,bx1=435-x0,1213-x0+1; byy1=785-y0+1
for (ys,ye,xs,xe) in [(by,by+th,bx0,bx1),(byy1-th,byy1,bx0,bx1),(by,byy1,bx0,bx0+th),(by,byy1,bx1-th,bx1)]:
    out[ys:ye,xs:xe,:3]=255; out[ys:ye,xs:xe,3]=255
Image.fromarray(out.astype('uint8'),'RGBA').save(dst)
