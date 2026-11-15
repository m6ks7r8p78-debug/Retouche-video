#!/usr/bin/env python3
"""Private, consent-gated temporal training; never sends original media or trained weights to GitHub."""
from __future__ import annotations
import argparse
import json
from pathlib import Path
import random
import time
import cv2
import numpy as np
import torch
from torch.nn import functional as F
from engine import load_model as load_base
from train import verify_manifest
from temporal import RNETemporal2x, align_previous


def video_pairs(paths, frames_per_video=2):
    pairs=[]
    for path in paths:
        reader=cv2.VideoCapture(str(path))
        if not reader.isOpened():raise RuntimeError('Clip non decodable')
        n=max(int(reader.get(cv2.CAP_PROP_FRAME_COUNT)),3)
        seen=0
        for fraction in (.33,.66)[:frames_per_video]:
            start=min(n-2,max(0,int(n*fraction)))
            reader.set(cv2.CAP_PROP_POS_FRAMES,start)
            ok,a=reader.read(); ok2,b=reader.read()
            if not ok or not ok2:continue
            h,w=b.shape[:2]
            scale=min(192/min(h,w),320/max(h,w))
            out_w=max(48,2*(int(w*scale)//2));out_h=max(48,2*(int(h*scale)//2))
            a=cv2.resize(a,(out_w,out_h),interpolation=cv2.INTER_AREA if scale<1 else cv2.INTER_CUBIC)
            b=cv2.resize(b,(out_w,out_h),interpolation=cv2.INTER_AREA if scale<1 else cv2.INTER_CUBIC)
            # Real adjacent source frames: no synthetic translation or future-frame access.
            pairs.append((a,b));seen+=1
        reader.release()
        if not seen:raise RuntimeError('Deux images consecutives absentes')
    return pairs


def degraded(img,rng):
    h,w=img.shape[:2];lo=cv2.resize(img,(w//2,h//2),interpolation=cv2.INTER_AREA)
    if rng.random()<.35:
        ok,buf=cv2.imencode('.jpg',lo,[cv2.IMWRITE_JPEG_QUALITY,rng.choice([50,70,85])])
        if ok:lo=cv2.imdecode(buf,cv2.IMREAD_COLOR)
    if rng.random()<.5:
        noise=np.random.default_rng(rng.getrandbits(64)).normal(0,rng.choice([1.5,3,5]),lo.shape)
        lo=np.clip(lo.astype(np.float32)+noise,0,255).astype(np.uint8)
    return lo


def cases_for_pairs(pairs,seed):
    rng=random.Random(seed);out=[]
    for prev,cur in pairs:
        lr_prev=degraded(prev,rng);lr_cur=degraded(cur,rng)
        aligned,confidence,cut=align_previous(lr_cur,lr_prev)
        if cut:confidence[:]=0
        out.append({'lr':lr_cur,'warped':aligned,'confidence':confidence,'hr':cur})
    return out


def sample(case,rng,crop=48):
    h,w=case['hr'].shape[:2]
    if min(h,w)<crop:raise ValueError('Image d entrainement trop petite')
    x=2*rng.randint(0,(w-crop)//2);y=2*rng.randint(0,(h-crop)//2)
    u,v=x//2,y//2;c=crop//2
    def to_tensor(a):return torch.from_numpy(np.ascontiguousarray(a[:,:,::-1])).permute(2,0,1).float()/255.
    cur=to_tensor(case['lr'][v:v+c,u:u+c])
    old=to_tensor(case['warped'][v:v+c,u:u+c])
    conf=torch.from_numpy(np.ascontiguousarray(case['confidence'][v:v+c,u:u+c])).float()[None]
    hr=to_tensor(case['hr'][y:y+crop,x:x+crop])
    return cur,old,conf,hr


def quality(base,model,cases,seed,per=4):
    rng=random.Random(seed);measures=[]
    with torch.inference_mode():
        for ci,c in enumerate(cases):
            for _ in range(per):
                cur,old,conf,hr=sample(c,rng)
                cur=cur[None];old=old[None];conf=conf[None];hr=hr[None]
                bic=F.interpolate(cur,scale_factor=2,mode='bicubic',align_corners=False).clamp(0,1)
                b=base(cur).clamp(0,1)
                new=model(cur,old,conf,b)
                def score(a):return float(10*np.log10(1/max(float(F.mse_loss(a,hr)),1e-10)))
                measures.append((ci,score(bic),score(b),score(new),float(conf.mean())))
    arr=np.array(measures)
    old_mean=float(np.mean(arr[:,2]));new_mean=float(np.mean(arr[:,3]))
    return {'patches':len(measures),'pairs':len(cases),
            'psnr_bicubic_db':round(float(np.mean(arr[:,1])),5),
            'psnr_rne01_db':round(old_mean,5),'psnr_rne02_db':round(new_mean,5),
            'gain_vs_rne01_db':round(new_mean-old_mean,5),
            'gains_positive':int(np.sum(arr[:,3]>arr[:,2])),
            'regressions_over_half_db':int(np.sum(arr[:,3]-arr[:,2]<-.5)),
            'confidence_mean':round(float(np.mean(arr[:,4])),4)}


def run(manifest:Path,base_weights:Path,out:Path,steps=600,seed=20261114,batch=8):
    if not 20<=steps<=3000 or not 1<=batch<=32:raise ValueError('Budget de recherche invalide')
    out=out.resolve()
    if any((p/'.git').exists() for p in (out,*out.parents)):
        raise ValueError('Impossible d ecrire des poids prives dans Git')
    with manifest.open(encoding='utf-8') as f:items=json.load(f)
    splits=verify_manifest(items)
    torch.set_num_threads(2);torch.manual_seed(seed);random.seed(seed)
    base=load_base(base_weights).eval()
    for p in base.parameters():p.requires_grad_(False)
    t0=time.monotonic()
    data={k:cases_for_pairs(video_pairs(paths),seed+{'train':1,'validation':2,'test':3}[k]) for k,paths in splits.items()}
    net=RNETemporal2x();optimizer=torch.optim.Adam(net.parameters(),lr=.001)
    evals=[];rng=random.Random(seed)
    checks=sorted(set([max(20,steps//3),max(20,2*steps//3),steps]))
    best=None;best_val=-1e9
    for it in range(1,steps+1):
        parts=[sample(rng.choice(data['train']),rng) for _ in range(batch)]
        cur=torch.stack([p[0] for p in parts]);old=torch.stack([p[1] for p in parts]);co=torch.stack([p[2] for p in parts]);hr=torch.stack([p[3] for p in parts])
        with torch.no_grad():baseline=base(cur)
        corrected=net(cur,old,co,baseline)
        loss=F.mse_loss(corrected,hr)
        optimizer.zero_grad(set_to_none=True);loss.backward();torch.nn.utils.clip_grad_norm_(net.parameters(),1.0);optimizer.step()
        if it in checks:
            net.eval();val=quality(base,net,data['validation'],seed+555,per=4);evals.append({'steps':it,'validation':val})
            if val['gain_vs_rne01_db']>best_val:
                best_val=val['gain_vs_rne01_db'];best={k:v.detach().clone() for k,v in net.state_dict().items()};best_step=it
            net.train()
    net.load_state_dict(best);net.eval()
    # The test cohort existed already for RNE 0.1: exploratory, NOT a sealed independent result.
    test=quality(base,net,data['test'],seed+999,per=4)
    out.mkdir(parents=True,exist_ok=True)
    path=out/'rne_02_temporal_prive.pt';torch.save(net.state_dict(),path)
    result={'engine':'RNE 0.2','date':'2026-11-14','architecture':'causal 2-frame learned luminance residual over frozen RNE 0.1',
        'train_videos':len(splits['train']),'validation_videos':len(splits['validation']),'test_videos':len(splits['test']),
        'video_pairs':{k:len(v) for k,v in data.items()},'steps_executed':steps,'best_step_on_validation':best_step,
        'temporal_params':sum(p.numel() for p in net.parameters()),'base_rne01_params':sum(p.numel() for p in base.parameters()),
        'validation_evolution':evals,'test_exploratoire':test,'seconds_cpu':round(time.monotonic()-t0,2),
        'private_weights':path.name,'safe_to_deploy':False,'transferred_to_git':False,
        'limitations':['existing RNE 0.1 test cohort used to select previous hyperparameters: not sealed or historically unseen',
                       'training pairs are real adjacent source frames but downsampling and noise are synthetic',
                       'paired images can already include real filters/compression',
                       'not evaluated in iPhone Safari or realtime 4K/8K',
                       'PSNR alone does not establish perceptual or temporal aesthetic quality']}
    (out/'rne_02_rapport_prive.json').write_text(json.dumps(result,indent=2,ensure_ascii=False),encoding='utf-8')
    return result


def main():
    p=argparse.ArgumentParser()
    p.add_argument('--manifest',type=Path,required=True);p.add_argument('--base-weights',type=Path,required=True)
    p.add_argument('--output',type=Path,required=True);p.add_argument('--authorized-private-training',action='store_true',required=True)
    p.add_argument('--steps',type=int,default=600);p.add_argument('--batch',type=int,default=8)
    a=p.parse_args()
    if not a.authorized_private_training:raise PermissionError('Entrainement prive explicitement autorise requis')
    result=run(a.manifest,a.base_weights,a.output,a.steps,batch=a.batch)
    # No private paths or per-media info in stdout.
    print(json.dumps({k:v for k,v in result.items() if k not in ('private_weights',)},ensure_ascii=False))

if __name__=='__main__':main()