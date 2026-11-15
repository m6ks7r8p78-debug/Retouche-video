import cv2,numpy as np,sys
s=cv2.imread("/home/claude/cas/src.png"); a=cv2.imread(sys.argv[1]); a=cv2.resize(a,(640,360),interpolation=cv2.INTER_AREA)
L1=cv2.cvtColor(s,cv2.COLOR_BGR2LAB).astype(float);L2=cv2.cvtColor(a,cv2.COLOR_BGR2LAB).astype(float)
dE=np.sqrt(((L1-L2)**2).sum(2))
h1=cv2.cvtColor(s,cv2.COLOR_BGR2HSV)[...,1].mean();h2=cv2.cvtColor(a,cv2.COLOR_BGR2HSV)[...,1].mean()
g1=cv2.cvtColor(s,cv2.COLOR_BGR2GRAY).astype(float);g2=cv2.cvtColor(a,cv2.COLOR_BGR2GRAY).astype(float)
def ssim(a,b):
  k=(11,11);C1,C2=6.5025,58.5225;ma,mb=cv2.GaussianBlur(a,k,1.5),cv2.GaussianBlur(b,k,1.5)
  va=cv2.GaussianBlur(a*a,k,1.5)-ma*ma;vb=cv2.GaussianBlur(b*b,k,1.5)-mb*mb;c=cv2.GaussianBlur(a*b,k,1.5)-ma*mb
  return (((2*ma*mb+C1)*(2*c+C2))/((ma*ma+mb*mb+C1)*(va+vb+C2))).mean()
# halos : dépassement au-delà du min/max local de la source (fenêtre 5x5), à pleine résolution
# écart LOCAL : après ajustement global affine par canal (sépare la retouche voulue de la dénaturation locale)
X=np.c_[a.reshape(-1,3).astype(float),np.ones(a.shape[0]*a.shape[1])];Y=s.reshape(-1,3).astype(float)
Wt=np.linalg.lstsq(X,Y,rcond=None)[0];af=np.clip(X@Wt,0,255).reshape(s.shape).astype(np.uint8)
dEl=np.sqrt(((L1-cv2.cvtColor(af,cv2.COLOR_BGR2LAB).astype(float))**2).sum(2))
A=cv2.resize(af,(cv2.imread(sys.argv[1]).shape[1],cv2.imread(sys.argv[1]).shape[0]),interpolation=cv2.INTER_CUBIC) if False else cv2.imread(sys.argv[1]);A=np.clip(np.c_[A.reshape(-1,3).astype(float),np.ones(A.shape[0]*A.shape[1])]@Wt,0,255).reshape(A.shape).astype(np.uint8);S=cv2.resize(s,(A.shape[1],A.shape[0]),interpolation=cv2.INTER_CUBIC)
ga=cv2.cvtColor(A,cv2.COLOR_BGR2GRAY).astype(float);gs=cv2.cvtColor(S,cv2.COLOR_BGR2GRAY).astype(float)
k=np.ones((7,7),np.uint8);mx=cv2.dilate(gs,k);mn=cv2.erode(gs,k)
halo=(np.maximum(ga-mx,0)+np.maximum(mn-ga,0)).mean()
print(f"{sys.argv[1].split('/')[-1]:22s} ΔE moyen {dE.mean():5.2f}  ΔE p95 {np.percentile(dE,95):5.2f}  saturation {h2/h1:5.3f}  SSIM {ssim(g1,g2):.4f}  halos {halo:.3f}  ΔE local {dEl.mean():5.2f}")
