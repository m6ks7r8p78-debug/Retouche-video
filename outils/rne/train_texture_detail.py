#!/usr/bin/env python3
"""RNE 0.4 texture experiment: matched-control vs gradient-supervised residual.

Offline, private. ALL sources previously trained: no independent holdout and
no new genuine detail recovery claims. Personalized weights stay outside Git.
"""
from __future__ import annotations
import argparse
import json
import random
from collections import defaultdict
from pathlib import Path
import time
import numpy as np
import torch
from torch.nn import functional as F
import cv2
from triad import RNE03
from train_temporal_residual import verify_corpus,example,ensure_private,scores

def spatial_gradient_loss(pred,truth):
    if pred.shape!=truth.shape or pred.ndim!=4:
        raise ValueError('Both RGB output tensors must have identical BCHW dimensions')
    x=torch.abs((pred[:,:,:,1:]-pred[:,:,:,:-1])-(truth[:,:,:,1:]-truth[:,:,:,:-1])).mean()
    y=torch.abs((pred[:,:,1:,:]-pred[:,:,:-1,:])-(truth[:,:,1:,:]-truth[:,:,:-1,:])).mean()
    return (x+y)/2

def run(*,manifest,cache,checkpoint,teacher_weights,output,expected=157,steps=220,
        batch=8,seed=20261114,temporal_weight=.025,gradient_weight=.015):
    if not 20<=steps<=1500 or not 1<=batch<=24 or not 0<=gradient_weight<=.1 or not 0<=temporal_weight<=.1:
        raise ValueError('Invalid experiment budget')
    out=ensure_private(Path(output))
    paths,groups,meta=verify_corpus(Path(manifest),Path(cache),expected)
    torch.set_num_threads(2);cv2.setNumThreads(1);torch.manual_seed(seed)
    teacher=RNE03()
    ts=torch.load(str(teacher_weights),map_location='cpu',weights_only=True)
    probe=RNE03()
    start_state=torch.load(str(checkpoint),map_location='cpu',weights_only=True)
    if not all(isinstance(s,dict) and set(s)==set(probe.state_dict()) for s in (ts,start_state)):
        raise ValueError('Incompatible private checkpoint')
    teacher.load_state_dict(ts,strict=True);teacher.eval()
    start=time.monotonic()
    examples=[];group_idx=defaultdict(list)
    for i,path in enumerate(paths):
        examples.append(example(path,seed+sum((j+1)*ord(c) for j,c in enumerate(path.stem)),teacher))
        group_idx[groups[path.stem.split('_')[0]]].append(i)
    rng=random.Random(seed)
    order=list(range(len(examples)));rng.shuffle(order)
    while len(order)<steps*batch:
        group=rng.choice(sorted(group_idx))
        order.append(rng.choice(group_idx[group]))
    summary={};models={}
    for label,weight in [('matched_control',0.),('gradient_candidate',gradient_weight)]:
        model=RNE03();model.load_state_dict(start_state,strict=True)
        opt=torch.optim.Adam(model.parameters(),lr=.000075)
        sl=[];gl=[];tl=[]
        for step in range(steps):
            rows=[examples[i] for i in order[step*batch:(step+1)*batch]]
            stack=lambda name:torch.stack([e[name] for e in rows])
            cur,one,two,c1,c2,high=(stack(k) for k in ('cur','one','two','c1','c2','high'))
            pred=model(cur,one,two,c1,c2)
            spatial=F.mse_loss(pred,high)
            bic=F.interpolate(cur,scale_factor=2,mode='bicubic',align_corners=False).clamp(0,1)
            diff=torch.abs((pred-bic)-stack('prior'))*stack('trust')
            temporal=diff.sum()/(stack('trust').sum()*3+1e-6)
            gradient=spatial_gradient_loss(pred,high)
            loss=spatial+temporal_weight*temporal+weight*gradient
            opt.zero_grad(set_to_none=True);loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(),1.);opt.step()
            sl.append(float(spatial.detach()));gl.append(float(gradient.detach()));tl.append(float(temporal.detach()))
        model.eval();models[label]=model
        res=scores(model,examples)
        summary[label]={
          'train_spatial_mse_last30':round(float(np.mean(sl[-30:])),7),
          'train_gradient_l1_last30':round(float(np.mean(gl[-30:])),7),
          'train_temporal_residual_mae_last30':round(float(np.mean(tl[-30:])),7),
          'psnr_avg_db_training_triplets':round(float(res[:,0].mean()),5),
          'bicubic_avg_psnr_db_training_triplets':round(float(res[:,1].mean()),5),
          'temporal_residual_mae_training_triplets':round(float(res[:,2].mean()),6)}
    out.mkdir(parents=True,exist_ok=True)
    for name,model in models.items():
        torch.save(model.cpu().state_dict(),out/('rne04_texture_'+name+'_private.pt'))
    report={'protocol':'RNE04 matched-control vs gradient regularization on already-trained corpus',
      'all_sources_previously_trained':True,'metadata':meta,
      'triplets_in_corpus':len(paths),'triplets_seen_in_optimizer':len(set(order[:steps*batch])),
      'steps_per_arm':steps,'batch':batch,'lambda_temporal':temporal_weight,
      'lambda_spatial_gradient_candidate':gradient_weight,'results':summary,
      'seconds_cpu':round(time.monotonic()-start,2),
      'deployment':False,'real_iphone':False,'model_NVIDIA_DLSS5':False,
      'limitation':'In-sample; no independent new scenes or validated identity details.'}
    (out/'rne04_texture_train_private.json').write_text(json.dumps(report,indent=2),encoding='utf8')
    return report

if __name__=='__main__':
    p=argparse.ArgumentParser()
    for flag in ('manifest','cache','checkpoint','teacher-weights','output'):
        p.add_argument('--'+flag,type=Path,required=True)
    p.add_argument('--steps',type=int,default=220)
    p.add_argument('--batch',type=int,default=8)
    p.add_argument('--gradient-weight',type=float,default=.015)
    p.add_argument('--private-training-authorized',action='store_true',required=True)
    p.add_argument('--acknowledge-in-sample',action='store_true',required=True)
    a=p.parse_args()
    if not a.private_training_authorized or not a.acknowledge_in_sample:
        raise PermissionError('Private permission and in-sample benchmark declaration required')
    print(json.dumps(run(manifest=a.manifest,cache=a.cache,checkpoint=a.checkpoint,
        teacher_weights=a.teacher_weights,output=a.output,steps=a.steps,
        batch=a.batch,gradient_weight=a.gradient_weight),ensure_ascii=False,indent=2))
