"""RNE16 frozen-weight second evaluation, distinct procedural generator.
No optimizer, no personal media, no reuse of training/test image families.
"""
from __future__ import annotations
import json,math,time
from pathlib import Path
from collections import defaultdict
import numpy as np,cv2,torch
from torch.nn import functional as F
from rne16 import RNE16ANCRE,psnr
FAMILIES=('spirals','glyph_mosaic','woven_noise')

def fresh_image(seed:int,family:str,side:int=64):
    rng=np.random.default_rng(seed)
    y,x=np.mgrid[:side,:side].astype(np.float32)
    img=np.full((side,side,3),rng.integers(35,150),np.float32)
    img+=rng.uniform(-15,15)*np.sin((x+y)/side*2*np.pi)[:,:,None]
    if family=='spirals':
        cx,cy=float(rng.uniform(20,44)),float(rng.uniform(20,44))
        rad=np.hypot(x-cx,y-cy)
        theta=np.arctan2(y-cy,x-cx)
        val=128+70*np.sin(rad*.75+theta*3)+20*np.sin(rad*1.4)
        img=np.stack((val,val*.6+40,255-val*.55),axis=2)
    elif family=='glyph_mosaic':
        img=np.clip(img,0,255).astype(np.uint8)
        for j in range(6,side,12):
            for i in range(4,side,11):
                letter=chr(int(rng.choice([ord('7'),ord('Q'),ord('E'),ord('5')])) )
                cv2.putText(img,letter,(i,j),cv2.FONT_HERSHEY_SIMPLEX,.31,
                            tuple(int(v) for v in rng.integers(0,255,3)),1,cv2.LINE_AA)
        return img
    elif family=='woven_noise':
        v=110+42*np.sin(x*1.5+3*np.sin(y/6))+42*np.cos(y*1.25+2*np.sin(x/9))
        img=np.stack((v,255-v*.8,100+v*.48),axis=2)
        img+=rng.normal(0,5,(side,side,3)).astype(np.float32)
    else:raise ValueError(family)
    return np.clip(img,0,255).astype(np.uint8)

def example(seed:int,family:str):
    rng=np.random.default_rng(seed+990191)
    hr=fresh_image(seed,family)
    lr=cv2.resize(hr,(32,32),interpolation=cv2.INTER_AREA)
    p=cv2.resize(cv2.GaussianBlur(hr,(3,3),.55),(32,32),interpolation=cv2.INTER_AREA)
    sigma=float(rng.choice([0,4,9,14]))
    c=np.clip(lr.astype(np.float32)+rng.normal(0,sigma,lr.shape),0,255).astype(np.uint8)
    previous=np.clip(p.astype(np.float32)+rng.normal(0,sigma,p.shape),0,255).astype(np.uint8)
    trust=np.ones((32,32),np.float32)
    if seed%3==0:
        y=int(rng.integers(4,16));x=int(rng.integers(4,16))
        previous[y:y+8,x:x+8]=rng.integers(0,256,(8,8,3),dtype=np.uint8)
        trust[y:y+8,x:x+8]=0
    def t(a):return torch.from_numpy(a[:,:,::-1].copy()).permute(2,0,1).float()/255
    return t(c),t(previous),torch.from_numpy(trust[None]),t(hr)

def run(weights:Path,out:Path):
    torch.set_num_threads(2)
    model=RNE16ANCRE().eval()
    model.load_state_dict(torch.load(weights,map_location='cpu',weights_only=True),strict=True)
    summaries={}
    with torch.no_grad():
        for fam_i,fam in enumerate(FAMILIES):
            data=[example(3400000+i*71+fam_i*57000,fam) for i in range(50)]
            records=[]
            for start in range(0,len(data),10):
                c,p,t,hr=[torch.stack([sample[j] for sample in data[start:start+10]]) for j in range(4)]
                bic=F.interpolate(c,scale_factor=2,mode='bicubic',align_corners=False).clamp(0,1)
                spa=model(c)
                dual=model(c,p,t)
                zero=model(c,p,t*0)
                assert torch.equal(zero,spa), 'Unsafe zero-trust leakage'
                for j in range(len(c)):
                    records.append([psnr(bic[j],hr[j]),psnr(spa[j],hr[j]),psnr(dual[j],hr[j])])
            q=np.array(records)
            summaries[fam]={'samples':len(q),'bicubic_db':round(float(q[:,0].mean()),5),
                 'spatial_db':round(float(q[:,1].mean()),5),'dual_db':round(float(q[:,2].mean()),5),
                 'dual_gain_vs_bicubic_db':round(float((q[:,2]-q[:,0]).mean()),5),
                 'dual_win_vs_bicubic':int((q[:,2]>q[:,0]).sum()),
                 'severe_losses_gt_0_5db':int((q[:,2]<q[:,0]-.5).sum())}
    # Eval speed on CPU; no iPhone extrapolation.
    rng=np.random.default_rng(424)
    c=torch.from_numpy(rng.random((1,3,256,256),dtype=np.float32))
    p=torch.from_numpy(rng.random((1,3,256,256),dtype=np.float32))
    t=torch.ones((1,1,256,256))
    with torch.no_grad():
        for _ in range(2):model(c,p,t)
        speed=[]
        for _ in range(8):
            start=time.perf_counter()
            model(c,p,t)
            speed.append((time.perf_counter()-start)*1000)
    result={'model':'RNE16-ANCRE','test':'new procedural generator: no train updates or threshold fitting',
            'families':summaries,'sample_total':150,'cpu_lr256_to_hr512_median_ms':round(float(np.median(speed)),2),
            'source_private_media_used':False,'neural_weights_frozen':True,
            'strong_generalization_claim':False,'iphone_validated':False,
            'promotion_blocked':True,'reasons_for_block':['synthetic test only','no human movement or AR pairs',
               'no video-native stability test', 'no iPhone Safari hardware validation']}
    out.write_text(json.dumps(result,indent=2,ensure_ascii=False)+'\n')
    print(json.dumps(result,ensure_ascii=False))

if __name__=='__main__':
    import argparse
    parser=argparse.ArgumentParser()
    parser.add_argument('--weights',type=Path,required=True)
    parser.add_argument('--out',type=Path,required=True)
    a=parser.parse_args();run(a.weights,a.out)
