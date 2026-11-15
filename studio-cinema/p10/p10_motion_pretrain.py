"""Retouche Cinema P10 - self-supervised aggregate optical-flow pilot (CPU).
Trains only on P9 non-image motion descriptors. Not a smoking/identity/pose detector.
Private P9 statistics and exported model remain PRIVATE; this code is public-safe.
"""
from __future__ import annotations
import json, os, argparse, hashlib
from pathlib import Path
from collections import defaultdict
import numpy as np


def features_from_p9(audit_dir):
    files=sorted(Path(audit_dir).glob('micro_*.json'))
    if not files:raise ValueError('No P9 micro_*.json inputs')
    X=[]; ids=[]; metadata=[]; counts={}
    for file in files:
        data=json.loads(file.read_text())
        for r in data['results']:
            vid=r['id']
            for w in r.get('windows',[]):
                hz=w.get('sampling_rate_approx_hz') or 5
                for step in w.get('steps',[]):
                    grid=step['grid3x3_residual_flow_px']
                    face=step.get('face_approx_mouth_residual_flow_px')
                    values=list(grid)+[0 if face is None else face, step['p90_residual_flow_px']]
                    if len(values)!=11 or any(not np.isfinite(v) or v<0 for v in values):raise ValueError('invalid flow data')
                    v=[float(np.log1p(min(float(q)*float(hz),300))) for q in values]
                    v += [0.0 if face is None else 1.0]
                    X.append(v);ids.append(vid)
                    metadata.append({'id':vid,'center_s':w['center_s'],'t_s':step['t_s'],'sample_hz':hz})
                    counts[vid]=counts.get(vid,0)+1
    return np.asarray(X,dtype=np.float32),ids,metadata,counts


def split_indices(ids,manifest):
    m=json.loads(Path(manifest).read_text())
    members=m['split_members']; ref={video:s for s,vs in members.items() for video in vs}
    if len(ref)!=sum(map(len,members.values())):raise ValueError('source assigned multiple splits')
    if set(ids)-set(ref):raise ValueError('Some videos not represented in split manifest')
    ret={s:np.asarray([i for i,v in enumerate(ids) if ref[v]==s],dtype=np.int64) for s in ('train','validation','test')}
    for k,v in ret.items():
        if len(v)==0:raise ValueError('empty split '+k)
    for pair in m['exact_duplicate_groups']:
        if len({ref.get(x) for x in pair})>1: raise ValueError('exact duplicate across splits')
    if 'groups' in m:
        # Hard failure when scene group members cross splits.
        for grp in m['groups']:
            if isinstance(grp,dict):
                mem=grp.get('ids',grp.get('members',grp.get('video_ids',[])))
                if len({ref.get(x) for x in mem if x in ref})>1:raise ValueError('near-scene group crosses splits')
    return ret


def prepare_scaling(X,train_idx):
    med=np.median(X[train_idx,:11],axis=0); q25=np.percentile(X[train_idx,:11],25,axis=0); q75=np.percentile(X[train_idx,:11],75,axis=0)
    scale=np.maximum(q75-q25,.10)
    out=X.copy();out[:,:11]=np.clip((X[:,:11]-med)/scale,-5,8)
    return out,med,scale


def train_aggregate(input_dir,split_manifest,out_dir,seed=1026,epochs=55):
    import torch
    from torch import nn
    torch.manual_seed(seed);np.random.seed(seed);torch.set_num_threads(min(2,torch.get_num_threads()))
    X,ids,meta,counts=features_from_p9(input_dir)
    split=split_indices(ids,split_manifest)
    N,med,scale=prepare_scaling(X,split['train'])
    def net():return nn.Sequential(nn.Linear(12,24),nn.GELU(),nn.Linear(24,7),nn.GELU(),nn.Linear(7,24),nn.GELU(),nn.Linear(24,12))
    model=net();optim=torch.optim.AdamW(model.parameters(),lr=.0015,weight_decay=.0003)
    xT=torch.from_numpy(N)
    tr=split['train'];va=split['validation'];te=split['test']
    best=None;best_loss=float('inf');best_ep=None
    train_hist=[]
    for epoch in range(epochs):
        model.train();g=torch.Generator().manual_seed(seed+epoch)
        idx=torch.as_tensor(np.random.default_rng(seed+epoch).permutation(tr))
        for chunk in idx.split(256):
            target=xT[chunk]
            corrupt=target.clone()
            mask=torch.rand(corrupt.shape,generator=g)<.18
            corrupt[mask]=0
            corrupt[:,:11]+=torch.randn(corrupt[:,:11].shape,generator=g)*.04
            prediction=model(corrupt)
            loss=((prediction-target)**2).mean()
            optim.zero_grad();loss.backward();optim.step()
        model.eval()
        with torch.no_grad():
            vloss=((model(xT[va])-xT[va])**2).mean().item()
        train_hist.append(vloss)
        if vloss<best_loss-1e-5:
            best_loss=vloss;best={k:v.detach().clone() for k,v in model.state_dict().items()};best_ep=epoch+1
    model.load_state_dict(best);model.eval()
    med_vec=np.median(N[tr],axis=0)
    def get_mse(idx):
        with torch.no_grad():
            o=model(xT[idx]).numpy()
        return float(np.mean((o-N[idx])**2)), float(np.mean((med_vec-N[idx])**2)), np.mean((o-N[idx])**2,axis=1)
    tr_m,tr_base,_=get_mse(tr);v_m,v_base,_=get_mse(va);te_m,te_base,te_err=get_mse(te)
    # Synthetic discontinuities injected into held-out, not authentic smoking errors.
    rng=np.random.default_rng(seed+99)
    idx=te[:min(len(te),1500)]
    held=N[idx].copy();fake=held.copy();rows=rng.choice(np.arange(len(fake)),size=max(1,len(fake)//2),replace=False)
    for j in rows:
        region=rng.integers(0,9);fake[j,region]+=rng.uniform(3,6)
    with torch.no_grad():
        clean_score=np.mean((model(torch.from_numpy(held)).numpy()-held)**2,axis=1)
        fake_score=np.mean((model(torch.from_numpy(fake)).numpy()-fake)**2,axis=1)
    from sklearn.metrics import roc_auc_score
    synthetic_auc=float(roc_auc_score([0]*len(clean_score)+[1]*len(fake_score),np.r_[clean_score,fake_score]))
    out=Path(out_dir);out.mkdir(parents=True,exist_ok=True)
    weights={k:v.detach().numpy() for k,v in model.state_dict().items()}
    weights['p9_train_median_11']=med;weights['p9_train_scale_11']=scale
    model_path=out/'P10_MOTION_PRIOR_PRIVE.npz'
    np.savez_compressed(model_path,**weights)
    result={'schema':'retouche-cinema-p10-selfsupervised-motion-v1',
        'provenance':'p9_aggregate_optical_flow_features_only_no_private_pixels_or_audio',
        'training_task':'denoising_autoencoding_of_12dim_motion_descriptors',
        'not':'smoking_action_recognition_or_anatomy_or_realism_or_human_identity',
        'split_source':'v35_scene_group_split','source_videos':len(counts),'flow_steps_total':len(ids),
        'sources_by_split':{k:len({ids[i] for i in ix}) for k,ix in split.items()},
        'steps_by_split':{k:len(ix) for k,ix in split.items()},
        'epochs_tried':epochs,'selected_epoch_by_validation_only':best_ep,'seed':seed,
        'normalized_flow_mse':{'train':round(tr_m,6),'validation':round(v_m,6),'test':round(te_m,6)},
        'train_median_baseline_mse':{'train':round(tr_base,6),'validation':round(v_base,6),'test':round(te_base,6)},
        'synthetic_motion_perturbation_auc_on_test':round(synthetic_auc,4),
        'synthetic_test_is_not_validation_of_real_gesture_detection':True,
        'ready_for_supervised_smoking_training':False,'adult_or_rights_verified_by_model':False,
        'weights_file':model_path.name,'weights_sha256':hashlib.sha256(model_path.read_bytes()).hexdigest(),
        'private_non_reversible_motion_metadata_only':True}
    (out/'P10_MOTION_TRAINING_AUDIT_PRIVE.json').write_text(json.dumps(result,indent=2,ensure_ascii=False))
    # Rank high reconstruction-error TEST windows for human annotator evaluation; no labels.
    rank=np.argsort(-te_err)[:30]
    samples=[{'video_id':meta[int(te[i])]['id'],'t_s':meta[int(te[i])]['t_s'],'score':round(float(te_err[i]),4),'review_label':'UNVERIFIED_MOTION_OUTLIER'} for i in rank]
    (out/'P10_MOTION_REVIEW_TOP30_PRIVE.json').write_text(json.dumps({'schema':'p10-private-review-queue-v1','events_are_not_smoking_labels':True,'windows':samples},indent=2))
    return result

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--input-dir',required=True);p.add_argument('--split-manifest',required=True);p.add_argument('--output-dir',required=True);p.add_argument('--epochs',type=int,default=55)
    a=p.parse_args();print(json.dumps(train_aggregate(a.input_dir,a.split_manifest,a.output_dir,epochs=a.epochs),ensure_ascii=False,indent=2))

