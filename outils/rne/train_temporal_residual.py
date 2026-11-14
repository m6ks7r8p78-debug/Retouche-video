#!/usr/bin/env python3
"""Retouche Neural Engine 0.4: train a temporal detail residual, offline and private.

The supervising frames are real, but LR degradations are synthetic. Both candidates
start from the same RNE 0.3+ private checkpoint. A frozen teacher estimates the
prior frame's detail and its warp to current time; the new network is penalized
for inconsistent *detail residual*, only in trustworthy flow regions. It is
NOT a NVIDIA DLSS 5 implementation, not a guarantee of true restored details.
"""
from __future__ import annotations
import argparse
from collections import Counter,defaultdict
import hashlib
import json
from pathlib import Path
import random
import time

import cv2
import numpy as np
import torch
from torch.nn import functional as F
from triad import RNE03,alignment


def ensure_private(p:Path):
    p=p.resolve()
    if any((d/'.git').exists() for d in [p,*p.parents]):
        raise ValueError('Private data/weights cannot be written inside a Git checkout')
    return p


def verify_corpus(manifest:Path,cache:Path,expected=157):
    rows=json.loads(manifest.read_text(encoding='utf8'))
    if not isinstance(rows,list) or len(rows)!=expected:raise ValueError('Incomplete catalogue')
    seen=set();sha_set=set();groups={};ids=[]
    for row in rows:
        if row.get('private_training_consent') is not True or row.get('private_evaluation_consent') is not True or row.get('publication') is not False:
            raise PermissionError('Private training/benchmark consent required and publication prohibited')
        k=row['id']
        if k in seen:raise ValueError('Duplicate ID')
        seen.add(k)
        path=Path(row['path']);dig=hashlib.sha256()
        with path.open('rb') as f:
            for block in iter(lambda:f.read(1024*1024),b''):dig.update(block)
        if dig.hexdigest()!=row['sha256']:raise ValueError('Source SHA-256 changed')
        if row['sha256'] not in sha_set:ids.append(k)
        sha_set.add(row['sha256']);groups[k]=row['group']
    paths=sorted(cache.glob('V???_??.npz'))
    count=Counter(p.stem.split('_')[0] for p in paths)
    if len(paths)<len(ids) or set(count)!=set(ids):raise ValueError('Missing or unexpected cached sequences')
    return paths,groups,{'catalogue':len(rows),'unique_sha256':len(ids),'groups':len(set(groups.values())),'sequences':len(paths)}


def as_rgb(img):
    return torch.from_numpy(np.ascontiguousarray(img[:,:,::-1])).permute(2,0,1).float()/255


def example(path:Path,seed:int,teacher:RNE03,patch_size=32):
    rng=random.Random(seed)
    with np.load(path,allow_pickle=False) as pack:
        high=[pack[k] for k in ('prev2','prev1','current')]
    if any(x.ndim!=3 or x.dtype!=np.uint8 or x.shape!=high[0].shape for x in high):
        raise ValueError('Invalid private triple')
    h,w=high[0].shape[:2]
    if min(h,w)<patch_size*2:raise ValueError('Small triple')
    sigma=rng.choice((0,0,1,2.5,4))
    quality=rng.choice((48,70,88,100))
    low=[]
    for img in high:
        im=cv2.resize(img,(w//2,h//2),interpolation=cv2.INTER_AREA)
        if quality<100:
            ok,encoded=cv2.imencode('.jpg',im,[cv2.IMWRITE_JPEG_QUALITY,quality])
            if not ok:raise RuntimeError('JPEG encoder error')
            im=cv2.imdecode(encoded,cv2.IMREAD_COLOR)
        if sigma:
            noise=np.random.default_rng(rng.getrandbits(64)).normal(0,sigma,im.shape)
            im=np.clip(im.astype(np.float32)+noise,0,255).astype(np.uint8)
        low.append(im)
    older,prev,cur=low
    aligned1,c1=alignment(cur,prev)
    aligned2,c2=alignment(cur,older)
    prior2,prior_c=alignment(prev,older)
    # Teacher's previous-frame prediction is independent of the current frame.
    with torch.inference_mode():
        p=as_rgb(prev)[None];prev2=as_rgb(prior2)[None]
        cp=torch.from_numpy(prior_c.copy())[None,None]
        prev_out=teacher(p,prev2,prev2,cp,cp).squeeze(0)
        bic_prev=F.interpolate(p,scale_factor=2,mode='bicubic',align_corners=False).clamp(0,1).squeeze(0)
        residual=(prev_out-bic_prev).permute(1,2,0).numpy().astype(np.float32)
    # True backward flow current->previous; use trusted regions only.
    cg=cv2.cvtColor(cur,cv2.COLOR_BGR2GRAY)
    pg=cv2.cvtColor(prev,cv2.COLOR_BGR2GRAY)
    if np.array_equal(cur,prev):flow=np.zeros((*cg.shape,2),np.float32)
    else:flow=cv2.calcOpticalFlowFarneback(cg,pg,None,.5,3,15,3,5,1.2,0)
    h2,w2=cur.shape[:2]
    yy,xx=np.mgrid[0:2*h2,0:2*w2].astype(np.float32)
    flow_hr=cv2.resize(flow,(2*w2,2*h2),interpolation=cv2.INTER_LINEAR)*2
    source_x=xx+flow_hr[:,:,0];source_y=yy+flow_hr[:,:,1]
    projected=cv2.remap(residual,source_x,source_y,cv2.INTER_LINEAR,borderMode=cv2.BORDER_CONSTANT)
    confidence=cv2.resize(c1,(2*w2,2*h2),interpolation=cv2.INTER_LINEAR)
    inside=(source_x>=2)&(source_x<2*w2-3)&(source_y>=2)&(source_y<2*h2-3)
    confidence*=inside
    # Detach target: the network learns stable details instead of copying noise.
    x=rng.randrange(w2-patch_size+1);y=rng.randrange(h2-patch_size+1)
    patch=lambda a:a[y:y+patch_size,x:x+patch_size]
    target=lambda a:a[2*y:2*(y+patch_size),2*x:2*(x+patch_size)]
    result={'cur':as_rgb(patch(cur)),'one':as_rgb(patch(aligned1)),'two':as_rgb(patch(aligned2)),
            'c1':torch.from_numpy(patch(c1).copy())[None],
            'c2':torch.from_numpy(patch(c2).copy())[None],
            'high':as_rgb(target(high[2])),
            'prior':torch.from_numpy(np.ascontiguousarray(target(projected))).permute(2,0,1),
            'trust':torch.from_numpy(np.ascontiguousarray(target(confidence)))[None]}
    if rng.random()<.5:result={k:v.flip(-1) for k,v in result.items()}
    if rng.random()<.5:result={k:v.flip(-2) for k,v in result.items()}
    return result


def scores(model:RNE03,examples:list,batch=24):
    model.eval();out=[]
    with torch.inference_mode():
        for i in range(0,len(examples),batch):
            rows=examples[i:i+batch];g=lambda name:torch.stack([r[name] for r in rows])
            pred=model(g('cur'),g('one'),g('two'),g('c1'),g('c2'))
            bic=F.interpolate(g('cur'),scale_factor=2,mode='bicubic',align_corners=False).clamp(0,1)
            hr=g('high')
            psnr=lambda x: -10*torch.log10(((x-hr)**2).flatten(1).mean(1).clamp(min=1e-10))
            e=torch.abs((pred-bic)-g('prior'))*g('trust')
            temporal=(e.flatten(1).sum(1)/(g('trust').flatten(1).sum(1)*3+1e-6))
            for x,y,z in zip(psnr(pred).tolist(),psnr(bic).tolist(),temporal.tolist()):out.append([x,y,z])
    return np.asarray(out)


def train(*,manifest:Path,cache:Path,checkpoint:Path,output:Path,steps=180,batch=8,
          seed=2026111412,lambda_temporal=.025,expected=157):
    if not 20<=steps<=2000 or not 1<=batch<=24 or not 0<=lambda_temporal<=.1:
        raise ValueError('Invalid budget or temporal weight')
    output=ensure_private(output)
    paths,groups,metadata=verify_corpus(manifest,cache,expected)
    torch.set_num_threads(2);cv2.setNumThreads(1);torch.manual_seed(seed)
    teacher=RNE03()
    state=torch.load(checkpoint,map_location='cpu',weights_only=True)
    if not isinstance(state,dict) or set(state)!=set(teacher.state_dict()):raise ValueError('Wrong model weights')
    teacher.load_state_dict(state,strict=True);teacher.eval()
    start=time.monotonic()
    all_cases=[];source_group=[]
    # All 919 cases actually sampled, with privacy and SHA checks.
    for path in paths:
        s=seed+sum((i+1)*ord(c) for i,c in enumerate(path.stem))
        all_cases.append(example(path,s,teacher))
        source_group.append(groups[path.stem.split('_')[0]])
    group_ix=defaultdict(list)
    for i,g in enumerate(source_group):group_ix[g].append(i)
    group_list=sorted(group_ix)
    rng=random.Random(seed)
    order=list(range(len(paths)));rng.shuffle(order)
    while len(order)<steps*batch:
        g=rng.choice(group_list);order.append(rng.choice(group_ix[g]))
    # Paired control: identical samples, optimizer, batch order and start weights.
    results={}; models={}
    for label,lam in [('supervised_control',0.),('temporal_candidate',lambda_temporal)]:
        model=RNE03();model.load_state_dict(state,strict=True);opt=torch.optim.Adam(model.parameters(),lr=.00012)
        losses=[]
        for it in range(steps):
            rows=[all_cases[i] for i in order[it*batch:(it+1)*batch]]
            g=lambda name:torch.stack([r[name] for r in rows])
            cur,one,two,c1,c2,hr=[g(k) for k in ('cur','one','two','c1','c2','high')]
            pred=model(cur,one,two,c1,c2)
            spatial=F.mse_loss(pred,hr)
            baseline=F.interpolate(cur,scale_factor=2,mode='bicubic',align_corners=False).clamp(0,1)
            diff=torch.abs((pred-baseline)-g('prior'))*g('trust')
            temporal=diff.sum()/(g('trust').sum()*3+1e-6)
            loss=spatial+lam*temporal
            opt.zero_grad(set_to_none=True);loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(),1.);opt.step()
            losses.append(float(loss.detach()))
        models[label]=model.cpu().eval()
        results[label]={'first20_loss':round(float(np.mean(losses[:20])),7),
                        'last20_loss':round(float(np.mean(losses[-20:])),7)}
    base=scores(teacher,all_cases)
    for name,model in models.items():
        sc=scores(model,all_cases)
        delta=sc[:,0]-base[:,0]
        psnrvsbc=sc[:,0]-sc[:,1]
        results[name].update({'psnr_db':round(float(sc[:,0].mean()),5),
            'bicubic_psnr_db':round(float(sc[:,1].mean()),5),
            'gain_vs_initial_db':round(float(delta.mean()),5),
            'gain_vs_bicubic_db':round(float(psnrvsbc.mean()),5),
            'regressions_over_half_db_vs_initial':int((delta<-.5).sum()),
            'temporal_detail_residual_mae':round(float(sc[:,2].mean()),6),
            'stronger_temporal_than_initial_count':int((sc[:,2]<base[:,2]).sum())})
    results['initial']={'psnr_db':round(float(base[:,0].mean()),5),
        'bicubic_psnr_db':round(float(base[:,1].mean()),5),
        'temporal_detail_residual_mae':round(float(base[:,2].mean()),6)}
    # Record in-sample motion-only proxy; natural video QA is separately required.
    output.mkdir(parents=True,exist_ok=True)
    for name,model in models.items():torch.save(model.state_dict(),output/(f'rne04_{name}_private.pt'))
    report={'protocol':'RNE04 paired supervised-only vs supervised+temporal residual loss',
        'date':'2026-11-14','all_media_private':True,'corpus':metadata,
        'triplets_exposed_to_optimizer':len(set(order[:steps*batch])),
        'steps_per_candidate':steps,'batch':batch,'lambda_temporal':lambda_temporal,
        'teacher_original':'RNE03+ checkpoint frozen for prior-detail supervision',
        'results_on_training_triplets':results,
        'seconds_total':round(time.monotonic()-start,2),
        'no_unseen_scene_in_corpus':True,'cannot_prove_temporal_fidelity':True,
        'iphone_safari_tested':False,'deployment_authorized':False,
        'nvidia_dlss5_used':False,
        'warning':'Training-sample metrics, no independent unseen scenes; reductions in temporal error might blur real details.'}
    (output/'rne04_training_report_private.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
    return report


def main():
    p=argparse.ArgumentParser()
    p.add_argument('--manifest',type=Path,required=True);p.add_argument('--cache',type=Path,required=True)
    p.add_argument('--checkpoint',type=Path,required=True);p.add_argument('--output',type=Path,required=True)
    p.add_argument('--steps',type=int,default=180);p.add_argument('--batch',type=int,default=8)
    p.add_argument('--lambda-temporal',type=float,default=.025)
    p.add_argument('--private-training-authorized',action='store_true',required=True)
    p.add_argument('--acknowledge-all-157-already-trained',action='store_true',required=True)
    args=p.parse_args()
    if not args.private_training_authorized or not args.acknowledge_all_157_already_trained:
        raise PermissionError('Explicit consent and knowledge of in-sample testing required')
    print(json.dumps(train(manifest=args.manifest,cache=args.cache,checkpoint=args.checkpoint,
                           output=args.output,steps=args.steps,batch=args.batch,
                           lambda_temporal=args.lambda_temporal),ensure_ascii=False,indent=2))

if __name__=='__main__':main()