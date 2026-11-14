#!/usr/bin/env python3
"""RNE 0.3+ private fine-tune on diverse original-video triplets.

Requires per-video consent and SHA-256 for all 157 sources. Exact copies are
excluded from optimization, with balanced sampling by conservative scene group.
Every extracted triplet is presented before group-balanced resampling begins.
Comparisons are IN-SAMPLE since all 157 videos have been trained on already.
"""
from __future__ import annotations
import argparse, json, random, time
from collections import Counter, defaultdict
from pathlib import Path
import cv2
import numpy as np
import torch
from torch.nn import functional as F
from expanded_sampler import outside_checkout, check_manifest
from triad import RNE03, alignment


def image_tensor(frame: np.ndarray):
    return torch.from_numpy(np.ascontiguousarray(frame[:, :, ::-1])).permute(2,0,1).float() / 255.


def crop_case(filename: Path, seed: int, crop: int=32) -> dict:
    rng = random.Random(seed)
    with np.load(filename, allow_pickle=False) as pack:
        high = [pack[k] for k in ('prev2','prev1','current')]
    if any(x.dtype != np.uint8 or x.shape != high[0].shape or x.ndim != 3 or x.shape[-1] != 3 for x in high):
        raise ValueError('Invalid private cached triplet')
    sigma = rng.choice((0, 1, 2.5, 4))
    quality = rng.choice((45, 65, 82, 100))
    low=[]
    for img in high:
        h,w=img.shape[:2]
        arr=cv2.resize(img,(w//2,h//2),interpolation=cv2.INTER_AREA)
        if quality<100:
            ok, coded=cv2.imencode('.jpg',arr,[cv2.IMWRITE_JPEG_QUALITY,quality])
            if ok:arr=cv2.imdecode(coded,cv2.IMREAD_COLOR)
        if sigma:
            noise=np.random.default_rng(rng.getrandbits(64)).normal(0,sigma,arr.shape)
            arr=np.clip(arr.astype(np.float32)+noise,0,255).astype(np.uint8)
        low.append(arr)
    p2,p1,cur=low
    aligned1,c1=alignment(cur,p1)
    aligned2,c2=alignment(cur,p2)
    h,w=cur.shape[:2]
    if min(h,w)<crop:raise ValueError('Insufficient source size')
    y=rng.randrange(h-crop+1);x=rng.randrange(w-crop+1)
    def patch(t):return t[y:y+crop,x:x+crop]
    def target(t):return t[2*y:2*(y+crop),2*x:2*(x+crop)]
    return {'cur':image_tensor(patch(cur)), 'one':image_tensor(patch(aligned1)),
            'two':image_tensor(patch(aligned2)),
            'co1':torch.from_numpy(c1[y:y+crop,x:x+crop].copy())[None],
            'co2':torch.from_numpy(c2[y:y+crop,x:x+crop].copy())[None],
            'high':image_tensor(target(high[2]))}


def tensors(rows, key):return torch.stack([r[key] for r in rows])


def measure(model, rows, batch=16):
    values = []
    model.eval()
    with torch.inference_mode():
        for i in range(0,len(rows),batch):
            cur=tensors(rows[i:i+batch],'cur');prev=tensors(rows[i:i+batch],'one')
            prev2=tensors(rows[i:i+batch],'two');c1=tensors(rows[i:i+batch],'co1')
            c2=tensors(rows[i:i+batch],'co2');hr=tensors(rows[i:i+batch],'high')
            bic=F.interpolate(cur,scale_factor=2,mode='bicubic',align_corners=False).clamp(0,1)
            pred=model(cur,prev,prev2,c1,c2,bic)
            mse_pred=((pred-hr)**2).flatten(1).mean(1).clamp(min=1e-10)
            mse_bic=((bic-hr)**2).flatten(1).mean(1).clamp(min=1e-10)
            for p,b in zip((-10*torch.log10(mse_pred)).tolist(),(-10*torch.log10(mse_bic)).tolist()):
                values.append((p,b))
    return np.asarray(values)


def run(*, manifest: Path, cache: Path, weights: Path, output: Path, steps=420,batch=8,seed=2026111404):
    if not 60 <= steps <= 5000 or not 1 <= batch <= 32:
        raise ValueError('Invalid training budget')
    output=outside_checkout(output)
    if not weights.is_file():raise ValueError('Missing original trained private checkpoint')
    if weights.resolve()==(output/'rne03_balanced_private.pt').resolve():
        raise ValueError('Refuse to overwrite input checkpoint')
    entries=json.loads(manifest.read_text(encoding='utf-8'))
    unique, groups=check_manifest(entries,157,True)
    records={x['id']:x for x in unique.values()}
    cache=cache.resolve()
    paths=sorted(cache.glob('V???_??.npz'))
    if not paths:raise ValueError('No cached triplets')
    by_clip=Counter(p.stem.split('_')[0] for p in paths)
    if set(by_clip)!=set(records):raise ValueError('Some unique source has no sampled triplet')
    if sum(by_clip.values())!=len(paths):raise ValueError('Duplicated or ambiguous cache names')
    torch.set_num_threads(2);cv2.setNumThreads(1);torch.manual_seed(seed)
    start=time.monotonic();rows=[];ids=[]
    for p in paths:
        video_id=p.stem.split('_')[0]
        case=crop_case(p,seed+sum((j+1)*ord(c) for j,c in enumerate(p.stem)))
        rows.append(case);ids.append(video_id)
    model=RNE03()
    state=torch.load(weights,map_location='cpu',weights_only=True)
    if not isinstance(state,dict) or set(state)!=set(model.state_dict()):raise ValueError('Private checkpoint incompatible')
    model.load_state_dict(state,strict=True)
    old=measure(model,rows)
    base_by_group=defaultdict(list)
    for idx,id_ in enumerate(ids):base_by_group[records[id_]['group']].append(idx)
    all_indices=list(range(len(rows)))
    rng=random.Random(seed)
    rng.shuffle(all_indices)
    ordered_groups=sorted(base_by_group)
    total=steps*batch
    if total < len(rows):raise ValueError('Not enough optimizer exposures to cover all triplets')
    idxs=all_indices[:]
    while len(idxs)<total:
        g=rng.choice(ordered_groups)
        idxs.append(rng.choice(base_by_group[g]))
    optimizer=torch.optim.Adam(model.parameters(),lr=.00015)
    loss_history=[]
    model.train()
    for it in range(steps):
        batch_idx=idxs[it*batch:(it+1)*batch]
        pack=[rows[j] for j in batch_idx]
        cur=tensors(pack,'cur');a=tensors(pack,'one');b=tensors(pack,'two')
        ca=tensors(pack,'co1');cb=tensors(pack,'co2');hr=tensors(pack,'high')
        pred=model(cur,a,b,ca,cb)
        baseline=F.interpolate(cur,scale_factor=2,mode='bicubic',align_corners=False).clamp(0,1)
        loss=F.mse_loss(pred,hr)+.003*F.l1_loss(pred,baseline)
        optimizer.zero_grad(set_to_none=True);loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(),1.)
        optimizer.step();loss_history.append(float(loss.detach()))
        if it==int(steps*.65):
            for x in optimizer.param_groups:x['lr']=.00005
    new=measure(model,rows)
    scores=new[:,0]-old[:,0]
    vs_bic=new[:,0]-new[:,1]
    group_means={g:float(np.mean(scores[indexes])) for g,indexes in base_by_group.items()}
    output.mkdir(parents=True,exist_ok=True)
    path=output/'rne03_balanced_private.pt'
    torch.save(model.state_dict(),path)
    stats={
      'stage':'RNE 0.3+ diverse triplets, trained on all 157 source catalogue after prior evaluation',
      'catalogue_videos_considered':len(entries),
      'unique_content_trained':len(records),
      'exact_copies_suppressed':len(entries)-len(records),
      'scene_groups':len(groups),
      'triplets_trained':len(rows),
      'optimizer_steps':steps,
      'batch':batch,
      'all_triplets_seen_before_resampling':True,
      'group_balanced_resampling':True,
      'optimizer_exposures':len(idxs),
      'old_in_sample_psnr_db':float(np.mean(old[:,0])),
      'new_in_sample_psnr_db':float(np.mean(new[:,0])),
      'bicubic_in_sample_psnr_db':float(np.mean(new[:,1])),
      'gain_new_vs_old_db':float(np.mean(scores)),
      'gain_new_vs_bicubic_db':float(np.mean(vs_bic)),
      'regression_gt_0_5db_vs_old':int(np.sum(scores<-.5)),
      'regression_gt_0_5db_vs_bicubic':int(np.sum(vs_bic<-.5)),
      'groups_improved_vs_old':sum(delta>0 for delta in group_means.values()),
      'groups_total':len(group_means),
      'loss_first_20_mean':float(np.mean(loss_history[:20])),
      'loss_last_20_mean':float(np.mean(loss_history[-20:])),
      'elapsed_seconds':round(time.monotonic()-start,2),
      'no_independent_test':True,
      'not_deployable':True,
      'weights_private_file':path.name,
      'warning':'All 157 source scenes have been used in prior training. PSNR here is only in-sample and cannot prove generalization.'
    }
    (output/'rne03_balanced_training_private.json').write_text(json.dumps(stats,ensure_ascii=False,indent=2))
    return stats


def main():
    p=argparse.ArgumentParser()
    p.add_argument('--manifest',type=Path,required=True)
    p.add_argument('--cache',type=Path,required=True)
    p.add_argument('--weights',type=Path,required=True)
    p.add_argument('--output',type=Path,required=True)
    p.add_argument('--steps',type=int,default=420)
    p.add_argument('--batch',type=int,default=8)
    p.add_argument('--authorized-private-training',action='store_true',required=True)
    a=p.parse_args()
    if not a.authorized_private_training:raise PermissionError('Consent required')
    print(json.dumps(run(manifest=a.manifest,cache=a.cache,weights=a.weights,output=a.output,
                        steps=a.steps,batch=a.batch),ensure_ascii=False,indent=2))


if __name__=='__main__':main()
