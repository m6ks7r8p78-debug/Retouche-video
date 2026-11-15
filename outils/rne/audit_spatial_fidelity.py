#!/usr/bin/env python3
"""Private RNE spatial QA: synthetic downsampling of authorized, real video frames.

All source videos have already appeared in training; these are INTERNAL checks,
not proof of generalization or removal of a real AR filter. No media export.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import math
from pathlib import Path
import time

import cv2
import numpy as np
import torch
from torch.nn import functional as F

from fidelity_guard import limit_fidelity
from triad import RNE03,alignment

def verify_and_select(manifest:Path,*,expected=157,unique=154,groups=37)->list[dict]:
    rows=json.loads(manifest.read_text(encoding='utf8'))
    if not isinstance(rows,list) or len(rows)!=expected:raise ValueError('Incorrect private corpus cardinality')
    seen_ids=set();seen_hash=set();selected={}
    for row in sorted(rows,key=lambda r:r['id']):
        if not isinstance(row,dict) or not isinstance(row.get('id'),str) or row['id'] in seen_ids:
            raise ValueError('Repeated/invalid media ID')
        seen_ids.add(row['id'])
        if row.get('private_evaluation_consent') is not True or row.get('publication') is not False:
            raise PermissionError('Private evaluation consent missing or publication enabled')
        p=Path(row['path'])
        if not p.is_file():raise ValueError('Private source missing')
        d=hashlib.sha256()
        with p.open('rb') as f:
            for chunk in iter(lambda:f.read(1<<20),b''):d.update(chunk)
        if d.hexdigest()!=row['sha256']:raise ValueError('SHA-256 mismatch')
        if row['sha256'] not in seen_hash:
            seen_hash.add(row['sha256']);g=row.get('group')
            if not isinstance(g,str) or not g:raise ValueError('Invalid group')
            if g not in selected:selected[g]=row
    if len(seen_hash)!=unique or len(selected)!=groups:
        raise ValueError('Unexpected corpus duplicates or grouping')
    return [selected[g] for g in sorted(selected)]

def sample_triplet(path:Path,fraction:float,side=256):
    reader=cv2.VideoCapture(str(path))
    if not reader.isOpened():raise RuntimeError('Cannot decode private source')
    count=int(reader.get(cv2.CAP_PROP_FRAME_COUNT))
    if count<3:reader.release();return None
    target=max(2,min(count-1,int(count*fraction)))
    reader.set(cv2.CAP_PROP_POS_FRAMES,target-2)
    frames=[]
    for _ in range(3):
        ok,fr=reader.read()
        if not ok:break
        h,w=fr.shape[:2];ratio=min(1.,side/max(h,w))
        hh=max(32,round(h*ratio)//2*2);ww=max(32,round(w*ratio)//2*2)
        frames.append(cv2.resize(fr,(ww,hh),interpolation=cv2.INTER_AREA if ratio<1 else cv2.INTER_CUBIC))
    reader.release()
    if len(frames)!=3 or any(x.shape!=frames[0].shape for x in frames):return None
    return frames

def degradation(frames,jpeg_quality=None):
    out=[]
    for x in frames:
        h,w=x.shape[:2]
        lr=cv2.resize(x,(w//2,h//2),interpolation=cv2.INTER_AREA)
        if jpeg_quality is not None:
            ok,buf=cv2.imencode('.jpg',lr,[cv2.IMWRITE_JPEG_QUALITY,int(jpeg_quality)])
            if not ok:raise RuntimeError('JPEG encode failed')
            lr=cv2.imdecode(buf,cv2.IMREAD_COLOR)
        out.append(lr)
    return out

def tensor_rgb(x):
    return torch.from_numpy(np.ascontiguousarray(x[:,:,::-1])).permute(2,0,1).float()[None]/255.

@torch.inference_mode()
def infer_rne(model,low):
    old,prev,cur=low
    w1,c1=alignment(cur,prev);w2,c2=alignment(cur,old)
    t=tensor_rgb(cur)
    pred=model(t,tensor_rgb(w1),tensor_rgb(w2),torch.from_numpy(c1[None,None].copy()),torch.from_numpy(c2[None,None].copy()))
    bic=F.interpolate(t,scale_factor=2,mode='bicubic',align_corners=False).clamp(0,1)
    def bgr(z):
        return (z[0].permute(1,2,0).cpu().numpy()[:,:,::-1].copy()*255.+.5).clip(0,255).astype(np.uint8)
    return bgr(pred),bgr(bic)

def source_masks(reference):
    gray=cv2.cvtColor(reference,cv2.COLOR_BGR2GRAY)
    lap=np.abs(cv2.Laplacian(gray,cv2.CV_32F,ksize=3))
    pos=lap[lap>2]
    boundary=float(np.quantile(pos,.75)) if len(pos)>20 else math.inf
    edge=(lap>=boundary)&(lap>2) if math.isfinite(boundary) else np.zeros(gray.shape,bool)
    local=cv2.GaussianBlur(lap,(9,9),0)
    texture=(local>=float(np.quantile(local,.75))) & (~edge)
    # Haar bounding boxes are UNVERIFIED region proposals, not face identity.
    detector=cv2.CascadeClassifier(cv2.data.haarcascades+'haarcascade_frontalface_default.xml')
    roi=np.zeros(gray.shape,np.uint8)
    if not detector.empty():
        found=detector.detectMultiScale(gray,scaleFactor=1.1,minNeighbors=4,minSize=(22,22))
        for x,y,w,h in found:
            padx=max(3,w//10);pady=max(3,h//10)
            roi[max(0,y-pady):min(gray.shape[0],y+h+pady),max(0,x-padx):min(gray.shape[1],x+w+padx)]=255
    return edge,texture,roi

def metrics(reference,pred,edges,textures,faces):
    err=np.abs(reference.astype(np.float32)-pred.astype(np.float32))
    mse=float(np.mean((reference.astype(np.float32)-pred.astype(np.float32))**2))
    select=lambda mask:round(float(err[mask].mean()),5) if mask.sum()>=25 else None
    return {'psnr_db':round(float(10*math.log10(255*255/max(1e-6,mse))),5),
        'mae_255':round(float(err.mean()),5),
        'edge_mae_255':select(edges),'texture_mae_255':select(textures),
        'face_proposal_mae_255':select(faces==255)}

def aggregate(rows):
    models=['bicubic','rne04_control','rne04_temporal','rne04_guarded']
    summ={}
    for k in models:
        subset=[r[k] for r in rows]
        res={}
        for m in ('psnr_db','mae_255','edge_mae_255','texture_mae_255','face_proposal_mae_255'):
            vals=[x[m] for x in subset if x.get(m) is not None]
            res[m+'_mean']=round(float(np.mean(vals)),5) if vals else None
            res[m+'_n']=len(vals)
        summ[k]=res
    bas=np.array([r['bicubic']['psnr_db'] for r in rows])
    pred=np.array([r['rne04_temporal']['psnr_db'] for r in rows])
    guard=np.array([r['rne04_guarded']['psnr_db'] for r in rows])
    summ['comparisons']={
      'samples':len(rows),
      'temporal_vs_bicubic_mean_psnr_gain_db':round(float((pred-bas).mean()),5),
      'guarded_vs_bicubic_mean_psnr_gain_db':round(float((guard-bas).mean()),5),
      'temporal_regressions_gt_0_5_db_vs_bicubic':int(((pred-bas)<-.5).sum()),
      'guarded_regressions_gt_0_5_db_vs_bicubic':int(((guard-bas)<-.5).sum()),
      'guard_helped_psnr_samples':int((guard>pred+1e-6).sum()),
      'guard_worsened_psnr_samples':int((guard<pred-1e-6).sum())}
    return summ

def main(args):
    output=Path(args.output).resolve()
    if any((p/'.git').exists() for p in (output.parent,*output.parent.parents)):
        raise ValueError('No private report inside Git repository')
    torch.set_num_threads(2);cv2.setNumThreads(1)
    selected=verify_and_select(Path(args.manifest),expected=args.expected,unique=args.unique,groups=args.groups)
    weights=[]
    for path in (args.control,args.temporal):
        m=RNE03();s=torch.load(str(path),map_location='cpu',weights_only=True)
        if not isinstance(s,dict) or set(s)!=set(m.state_dict()):raise ValueError('Invalid private checkpoint')
        m.load_state_dict(s,strict=True);m.eval();weights.append(m)
    records=[];skipped=[];started=time.monotonic()
    for i,entry in enumerate(selected):
        for frac,quality in ((.62,None),(.83,60)):
            frames=sample_triplet(Path(entry['path']),frac,side=args.side)
            if frames is None:skipped.append([i,frac]);continue
            low=degradation(frames,jpeg_quality=quality)
            a,bic=infer_rne(weights[0],low)
            b,_=infer_rne(weights[1],low)
            guarded,info=limit_fidelity(bic,b,edge_limit=8,flat_limit=16)
            ref=frames[-1];edges,textures,faces=source_masks(ref)
            records.append({'group_index':i,'fraction':frac,'jpeg_quality':quality,
                'face_proposals_detected':bool(faces.any()),
                'guard_changed_pixels_fraction':info['changed_pixels_fraction'],
                'bicubic':metrics(ref,bic,edges,textures,faces),
                'rne04_control':metrics(ref,a,edges,textures,faces),
                'rne04_temporal':metrics(ref,b,edges,textures,faces),
                'rne04_guarded':metrics(ref,guarded,edges,textures,faces)})
    report={'protocol':'RNE spatial QA, real source frames synthetically downsampled 2x, in-corpus only',
        'groups_selected':len(selected),'target_moments':[.62,.83],'jpeg_at_second_moment':60,
        'samples':len(records),'frame_source_untouched_in_training':False,
        'source_may_contain_existing_AR_filters':True,
        'faces_recognized_or_identified':False,
        'face_region_proposals_with_pixels':sum(int(r['face_proposals_detected']) for r in records),
        'safety':'No automatic face protection unless explicit verified mask supplied',
        'aggregate':aggregate(records),'samples_skipped':len(skipped),
        'seconds_cpu':round(time.monotonic()-started,2),
        'nvidia_dlss5_used':False,'iphone_tested':False,'deployment_authorized':False,
        'remark':'No independent held-out videos, no proof of restoration of invisible original details.'}
    output.parent.mkdir(parents=True,exist_ok=True)
    output.write_text(json.dumps({'aggregate':report,'private_per_group_metrics':records,'private_skips':skipped},
                                 ensure_ascii=False,indent=2),encoding='utf8')
    print(json.dumps(report,ensure_ascii=False,indent=2))

if __name__=='__main__':
    p=argparse.ArgumentParser()
    for field in ('manifest','control','temporal','output'):
        p.add_argument('--'+field,type=Path,required=True)
    p.add_argument('--expected',type=int,default=157)
    p.add_argument('--unique',type=int,default=154)
    p.add_argument('--groups',type=int,default=37)
    p.add_argument('--side',type=int,default=256)
    p.add_argument('--private-evaluation-authorized',action='store_true',required=True)
    a=p.parse_args()
    if not a.private_evaluation_authorized:raise PermissionError('Private authorization required')
    main(a)
