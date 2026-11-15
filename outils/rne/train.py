#!/usr/bin/env python3
"""Train independent RNE2x weights on authorized private video frames, offline only.

Requires a private manifest with explicit consent, split and expected SHA-256.
No video, derived frame, private hash, personalized weight or identity is sent anywhere.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import random
import time

import cv2
import numpy as np
import torch
from torch.nn import functional as F

from engine import RNE2x


def sha256(path: Path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for buf in iter(lambda: f.read(1<<20), b''):h.update(buf)
    return h.hexdigest()


def verify_manifest(items: list, require_consent=True):
    if not isinstance(items,list) or len(items)<4 or len(items)>2000:raise ValueError('Manifest invalide')
    groups={};seen=set();sets={'train':[], 'validation':[], 'test':[]}
    for item in items:
        if set(item)!={'path','group','split','sha256','private_training_consent','private_evaluation_consent'}:
            raise ValueError('Champs du manifest invalides')
        p=Path(item['path']).resolve()
        if not p.is_file() or p.suffix.lower() not in ('.mp4','.mov','.m4v'):raise ValueError('Vidéo privée illisible')
        if p in seen:raise ValueError('Vidéo répétée')
        seen.add(p)
        sp=item['split']; grp=item['group']
        if sp not in sets or not isinstance(grp,str) or len(grp)<1 or len(grp)>80:
            raise ValueError('Groupe ou partition invalide')
        if grp in groups and groups[grp]!=sp:raise ValueError('Fuite de groupe entre partitions')
        groups[grp]=sp
        if require_consent and (not item['private_evaluation_consent'] or
            (sp=='train' and not item['private_training_consent'])):
            raise PermissionError('Consentement entraînement/evaluation manquant')
        if len(item['sha256'])!=64 or sha256(p)!=item['sha256']:
            raise ValueError('Empreinte privée non conforme')
        sets[sp].append(p)
    if not all(sets.values()):raise ValueError('Entraînement, validation et test requis')
    return sets


def frames(paths: list[Path], per_video=2):
    results=[]
    for path in paths:
        cap=cv2.VideoCapture(str(path))
        if not cap.isOpened():raise RuntimeError('Média illisible')
        n=max(1,int(cap.get(cv2.CAP_PROP_FRAME_COUNT)))
        fs=[]
        for i in range(per_video):
            target=min(n-1,int(n*(i+1)/(per_video+1)))
            cap.set(cv2.CAP_PROP_POS_FRAMES,target)
            ok,arr=cap.read()
            if ok and min(arr.shape[:2])>=128:
                # Fixed small canonical crop size, keeping geometry and ratios.
                scale=256/min(arr.shape[:2]);new=(max(128,int(arr.shape[1]*scale)),max(128,int(arr.shape[0]*scale)))
                arr=cv2.resize(arr,new,interpolation=cv2.INTER_AREA if scale<1 else cv2.INTER_CUBIC)
                fs.append(cv2.cvtColor(arr,cv2.COLOR_BGR2RGB))
        cap.release()
        if not fs: raise RuntimeError('Échec du décodage vidéo')
        results.extend(fs)
    return results


def make_pair(img:np.ndarray, rng:random.Random, crop=48, corrupt=True):
    h,w=img.shape[:2]
    if min(h,w)<crop:raise ValueError('Image trop petite')
    y=rng.randint(0,h-crop);x=rng.randint(0,w-crop)
    hi=np.ascontiguousarray(img[y:y+crop,x:x+crop])
    if rng.random()<.5:hi=np.ascontiguousarray(hi[:,::-1])
    if rng.random()<.5:hi=np.ascontiguousarray(hi[::-1])
    lo=cv2.resize(hi,(crop//2,crop//2),interpolation=cv2.INTER_AREA)
    if corrupt:
        k=rng.choice(['clean','jpeg','noise','jpeg_noise'])
        if 'jpeg' in k:
            q=rng.choice([45,60,75,90])
            ok,encoded=cv2.imencode('.jpg',cv2.cvtColor(lo,cv2.COLOR_RGB2BGR),[cv2.IMWRITE_JPEG_QUALITY,q])
            if ok:lo=cv2.cvtColor(cv2.imdecode(encoded,cv2.IMREAD_COLOR),cv2.COLOR_BGR2RGB)
        if 'noise' in k:
            sigma=rng.choice([2,4,8])
            # Per-sample local deterministic PRNG; reproducible given seed.
            nrng=np.random.default_rng(rng.getrandbits(64))
            lo=np.clip(lo.astype(np.float32)+nrng.normal(0,sigma,lo.shape),0,255).astype(np.uint8)
    return torch.from_numpy(np.ascontiguousarray(lo)).permute(2,0,1).float()/255,torch.from_numpy(np.ascontiguousarray(hi)).permute(2,0,1).float()/255


def psnr(pred,ref):
    mse=F.mse_loss(pred,ref).item()
    return 10*np.log10(1/max(mse,1e-10))


def benchmark(model, data, seed, per=4):
    rng=random.Random(seed)
    metrics={'baseline':[],'rne':[]}
    with torch.inference_mode():
        for img in data:
            for _ in range(per):
                lo,hi=make_pair(img,rng,corrupt=True)
                lo=lo.unsqueeze(0);hi=hi.unsqueeze(0)
                baseline=F.interpolate(lo,scale_factor=2,mode='bicubic',align_corners=False).clamp(0,1)
                metrics['baseline'].append(psnr(baseline,hi))
                metrics['rne'].append(psnr(model(lo),hi))
    return {k:round(float(np.mean(v)),4) for k,v in metrics.items()}|{'cases':len(metrics['baseline'])}


def train(manifest_path:Path, out_dir:Path, steps:int, seed:int, batch:int, crop:int=48):
    if not 10<=steps<=5000 or not 1<=batch<=32:raise ValueError('Taille entraînement hors limite')
    out_dir=out_dir.resolve();out_dir.mkdir(parents=True,exist_ok=True)
    # Defense in depth: avoid writing personalized weights anywhere within a repository checkout.
    if any((x/'.git').exists() for x in [out_dir,*out_dir.parents]):
        raise ValueError('Refus de sauvegarder les poids privés dans un dépôt Git')
    with manifest_path.open(encoding='utf-8') as f:parts=verify_manifest(json.load(f))
    torch.set_num_threads(min(2,max(1,os.cpu_count() or 1)))
    torch.manual_seed(seed);rng=random.Random(seed)
    t=time.monotonic()
    data={split:frames(paths) for split,paths in parts.items()}
    model=RNE2x();opt=torch.optim.Adam(model.parameters(),lr=.001)
    before=benchmark(model,data['validation'],seed=seed+1234,per=4)
    losses=[]
    for step in range(steps):
        samples=[make_pair(rng.choice(data['train']),rng,crop=crop) for _ in range(batch)]
        lr=torch.stack([s[0] for s in samples]); hr=torch.stack([s[1] for s in samples]);
        opt.zero_grad(set_to_none=True);pred=model(lr)
        loss=F.mse_loss(pred,hr)
        loss.backward();torch.nn.utils.clip_grad_norm_(model.parameters(),1.0);opt.step()
        losses.append(float(loss.detach()))
    after=benchmark(model,data['validation'],seed=seed+1234,per=4)
    confirmation=benchmark(model,data['test'],seed=seed+9876,per=4)
    weights=out_dir/'rne_2x_prive_non_deployable.pt'
    torch.save(model.state_dict(),weights)
    result={
        'nom':'Retouche Neural Engine (RNE) 0.1',
        'date_protocol':'2026-11-14','sequences':{k:len(v) for k,v in parts.items()},
        'frames':{k:len(v) for k,v in data.items()},'steps':steps,'batch':batch,'seed':seed,
        'channels':24,'parameters':sum(p.numel() for p in model.parameters()),
        'task':'2x RGB SR supervised on synthetically downsampled/corrupted frames from authorized real videos',
        'validation_before':before,'validation_after':after,
        'test_after':confirmation, 'test_gain_db':round(confirmation['rne']-confirmation['baseline'],4),
        'loss_first_20':round(float(np.mean(losses[:20])),6),'loss_last_20':round(float(np.mean(losses[-20:])),6),
        'elapsed_sec':round(time.monotonic()-t,2), 'weights_private':weights.name,
        'limitations':['reference frames from source files may already include existing filters/compression',
                       'random patch test not full natural video',
                       'neural architecture is an independently implemented tiny CNN, not NVIDIA DLSS 5',
                       'no iPhone Safari or realtime 4K evidence',
                       'quality improvement must be confirmed before promotion']}
    (out_dir/'rne_2x_rapport_prive.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    return result


def main():
    p=argparse.ArgumentParser(description='Entraînement privé du Retouche Neural Engine (RNE)')
    p.add_argument('--manifest',type=Path,required=True)
    p.add_argument('--out',type=Path,required=True)
    p.add_argument('--private-training-authorized',action='store_true',required=True)
    p.add_argument('--steps',type=int,default=120)
    p.add_argument('--seed',type=int,default=20261114)
    p.add_argument('--batch',type=int,default=8)
    args=p.parse_args()
    if not args.private_training_authorized:raise PermissionError('Consentement distinct nécessaire')
    print(json.dumps(train(args.manifest,args.out,args.steps,args.seed,args.batch),ensure_ascii=False,indent=2))

if __name__=='__main__':main()
