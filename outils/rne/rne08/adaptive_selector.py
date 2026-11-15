"""RNE 0.8 experimental conservative per-scene selection, NO deployment.

All features are computed from the observed low-resolution frame, motion
confidence, bicubic and neural predictions. Never uses ground truth at inference.
Model parameters are fitted privately on authorized historical footage only.
"""
from __future__ import annotations
from dataclasses import dataclass
import json
from pathlib import Path
import cv2
import numpy as np

FEATURE_NAMES = (
 'lr_luma_mean','lr_luma_std','lr_laplace_log','lr_edge_mean',
 'lr_dark_fraction','lr_bright_fraction','lr_blockiness',
 'motion_conf_mean','motion_conf_p10','motion_conf2_mean',
 'aligned_luma_mae','lr_temporal_mae',
 'residual_rgb_mae','residual_luma_mae','residual_laplace_log',
 'residual_vs_edge','residual_clipped_fraction',
 'downsample_luma_disagreement', 'sr_edge_change'
)


def extract_features(cur:np.ndarray, aligned:np.ndarray, c1:np.ndarray,c2:np.ndarray,
                     bic:np.ndarray,sr:np.ndarray)->np.ndarray:
    """Frames BGR8; two trust maps HxW float32; no original HR reference."""
    for x in (cur,aligned,bic,sr):
        if not isinstance(x,np.ndarray) or x.ndim!=3 or x.shape[2]!=3 or x.dtype!=np.uint8:
            raise TypeError('All video frames must be BGR uint8')
    if cur.shape!=aligned.shape: raise ValueError('Aligned and current size mismatch')
    h,w=cur.shape[:2]
    if min(h,w)<16 or h*w>1280*720 or bic.shape!=(2*h,2*w,3) or sr.shape!=bic.shape:
        raise ValueError('Expected exact 2x image with memory cap')
    for a in (c1,c2):
        if not isinstance(a,np.ndarray) or a.shape!=(h,w) or not np.isfinite(a).all() or a.min()<0 or a.max()>1:
            raise ValueError('Finite [0,1] HxW confidence required')
    y=cv2.cvtColor(cur,cv2.COLOR_BGR2GRAY).astype(np.float32)
    yy=cv2.cvtColor(aligned,cv2.COLOR_BGR2GRAY).astype(np.float32)
    by=cv2.cvtColor(bic,cv2.COLOR_BGR2GRAY).astype(np.float32)
    ny=cv2.cvtColor(sr,cv2.COLOR_BGR2GRAY).astype(np.float32)
    lap=cv2.Laplacian(y,cv2.CV_32F)
    g1=cv2.Sobel(y,cv2.CV_32F,1,0,ksize=3)
    g2=cv2.Sobel(y,cv2.CV_32F,0,1,ksize=3)
    edge=float(np.mean(cv2.magnitude(g1,g2)))/255
    def block(a):
        a=a.astype(np.float32)
        dv=np.abs(a[:,1:]-a[:,:-1]);dh=np.abs(a[1:]-a[:-1])
        ve=dv[:,7::8].mean() if dv.shape[1]>=8 else 0.
        he=dh[7::8,:].mean() if dh.shape[0]>=8 else 0.
        return float((ve+he)/(dv.mean()+dh.mean()+1.))
    delta=sr.astype(np.float32)-bic.astype(np.float32)
    dyl=ny-by
    highlap=cv2.Laplacian(dyl,cv2.CV_32F)
    sr_sobel=cv2.Sobel(ny,cv2.CV_32F,1,0,ksize=3)
    bic_sobel=cv2.Sobel(by,cv2.CV_32F,1,0,ksize=3)
    cy=cv2.resize(ny,(w,h),interpolation=cv2.INTER_AREA)
    vals=(
      y.mean()/255.,y.std()/255.,np.log1p(np.var(lap))/10.,edge,
      float((y<35).mean()),float((y>220).mean()),block(y),
      float(c1.mean()),float(np.quantile(c1,.1)),float(c2.mean()),
      np.mean(np.abs(y-yy))/255.,np.mean(np.abs(cur.astype(float)-aligned.astype(float)))/255.,
      np.mean(np.abs(delta))/255.,np.mean(np.abs(dyl))/255.,
      np.log1p(np.var(highlap))/10.,np.mean(np.abs(dyl))/(np.mean(np.abs(bic_sobel))+1.),
      float((np.abs(delta)>16).any(axis=2).mean()),
      np.mean(np.abs(cy-y))/255.,
      np.mean(np.abs(sr_sobel-bic_sobel))/255.,
    )
    out=np.asarray(vals,dtype=np.float64)
    if out.shape!=(len(FEATURE_NAMES),) or not np.isfinite(out).all():
        raise ValueError('Invalid feature vector')
    return out


@dataclass(frozen=True)
class LinearPolicy:
    mean:list[float]
    scale:list[float]
    weights:list[float]
    bias:float
    ridge_lambda:float
    training_samples:int
    manual_preview_only:bool=True

    def predict_expected_gain(self,features):
        a=np.asarray(features,dtype=np.float64)
        if a.shape[-1]!=len(FEATURE_NAMES) or not np.isfinite(a).all():
            raise ValueError('Invalid inference features')
        if len(self.weights)!=len(FEATURE_NAMES) or len(self.mean)!=len(FEATURE_NAMES) or len(self.scale)!=len(FEATURE_NAMES):
            raise ValueError('Incompatible model features')
        z=(a-np.asarray(self.mean))/np.asarray(self.scale)
        return z@np.asarray(self.weights)+self.bias


def train_policy(features, gains, *, ridge_lambda=35.):
    """Ridge predicts quality margin; train ONLY on historical consented groups."""
    x=np.asarray(features,dtype=np.float64)
    y=np.asarray(gains,dtype=np.float64)
    if x.ndim!=2 or x.shape[1]!=len(FEATURE_NAMES) or x.shape[0]<30 or y.shape!=(x.shape[0],):
        raise ValueError('At least 30 paired samples required')
    if not np.isfinite(x).all() or not np.isfinite(y).all() or not 1<=ridge_lambda<=1000:
        raise ValueError('Invalid or nonfinite training data')
    mean=x.mean(0);scale=np.maximum(x.std(0),1e-5)
    z=(x-mean)/scale
    y=np.clip(y,-2,2)
    w=np.linalg.solve(z.T@z+ridge_lambda*np.eye(x.shape[1]),z.T@(y-y.mean()))
    return LinearPolicy(mean.tolist(),scale.tolist(),w.tolist(),float(y.mean()),
                        ridge_lambda,len(y))


def preview_decision(model:LinearPolicy,features,*,manual_opt_in:bool=False,
                     expected_gain_threshold_db:float=.20):
    """Default bicubic, conservatively permit RESEARCH preview only, no export."""
    if type(manual_opt_in) is not bool:raise TypeError('Explicit opt-in Boolean required')
    if not .1<=expected_gain_threshold_db<=1.:raise ValueError('Invalid quality margin')
    predicted=float(model.predict_expected_gain(features))
    if not np.isfinite(predicted):raise ValueError('Nonfinite expected gain')
    route='rne04_laboratory_preview' if manual_opt_in and predicted>=expected_gain_threshold_db else 'bicubic_faithful'
    return {'route':route,'predicted_gain_db':round(predicted,5),
        'trusted_quality_proof':False,'deployed':False,
        'media_export_authorized':False,'original_preserved':True,
        'may_be_applied_without_operator_review':False}


def save_policy(model:LinearPolicy,path:Path):
    """Never save private fitted weights inside a Git checkout."""
    path=Path(path).resolve()
    if any((p/'.git').exists() for p in (path.parent,*path.parent.parents)):
        raise ValueError('Cannot save personal fitted model in Git')
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps({'format':'rne08_linear_quality_ridge_private',
      'feature_names':list(FEATURE_NAMES),'mean':model.mean,'scale':model.scale,
      'weights':model.weights,'bias':model.bias,
      'ridge_lambda':model.ridge_lambda,'training_samples':model.training_samples,
      'manual_preview_only':True},indent=2),encoding='utf8')


def load_policy(path:Path):
    d=json.loads(Path(path).read_text(encoding='utf8'))
    if d.get('format')!='rne08_linear_quality_ridge_private' or d.get('feature_names')!=list(FEATURE_NAMES) or d.get('manual_preview_only') is not True:
        raise ValueError('Wrong schema or incompatible/unsafe policy')
    p=LinearPolicy(d['mean'],d['scale'],d['weights'],d['bias'],d['ridge_lambda'],d['training_samples'])
    if any(np.asarray(z).shape!=(len(FEATURE_NAMES),) or not np.isfinite(z).all() for z in (p.mean,p.scale,p.weights)) or np.min(p.scale)<=0 or not np.isfinite(p.bias):
        raise ValueError('Invalid parameters')
    return p