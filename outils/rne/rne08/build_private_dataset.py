"""Private RNE 0.8 research dataset: frozen RNE0.4; never use new 41 uploads."""
from __future__ import annotations
import argparse,json,hashlib,time
from pathlib import Path
import numpy as np
import cv2,torch
from torch.nn import functional as F
from adaptive_selector import extract_features,FEATURE_NAMES
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from triad import RNE03

MODES=('clean_area','jpeg55','blur_noise','h264_crf34')

def dataset(manifest,cache,weights,out):
    rows=json.loads(Path(manifest).read_text())
    if len(rows)!=157 or any(r.get('private_training_consent') is not True or r.get('publication') is not False for r in rows):
        raise PermissionError('Expected 157 private authorized historical media')
    groups={};seen=set()
    for r in rows:
        if r['sha256'] in seen:continue
        seen.add(r['sha256']);groups[r['id']]=r['group']
    if len(groups)!=154:raise ValueError('Incorrect historical distinct-source count')
    actual=list(Path(cache).glob('*.pt'))
    if len(actual)!=154*2*4:raise ValueError('Incomplete historical cache')
    torch.set_num_threads(2);cv2.setNumThreads(1)
    model=RNE03();d=torch.load(weights,map_location='cpu',weights_only=True)
    if set(d)!=set(model.state_dict()):raise ValueError('Checkpoint incompatible')
    model.load_state_dict(d,strict=True);model.eval()
    t0=time.monotonic()
    out_rows=[]
    for i,path in enumerate(sorted(actual)):
        stem=path.stem;name,moment,mode=stem.split('_',2)
        if name not in groups or mode not in MODES or moment not in ('0','1'):raise ValueError('Unexpected cache file')
        case=torch.load(path,map_location='cpu',weights_only=True)
        with torch.inference_mode():
            cur,one,two,c1,c2=[case[k].unsqueeze(0) for k in ('cur','one','two','c1','c2')]
            high=case['high'].unsqueeze(0)
            pred=model(cur,one,two,c1,c2).clamp(0,1)
            bic=F.interpolate(cur,scale_factor=2,mode='bicubic',align_corners=False).clamp(0,1)
            mse_p=((pred-high)**2).mean().clamp(min=1e-10)
            mse_b=((bic-high)**2).mean().clamp(min=1e-10)
            gain=float(10*torch.log10(mse_b/mse_p))
            def bgr(img):
                x=img.squeeze(0).permute(1,2,0).numpy()[:,:,::-1]
                return np.clip(np.rint(x*255),0,255).astype(np.uint8)
            feats=extract_features(bgr(cur),bgr(one),c1[0,0].numpy(),c2[0,0].numpy(),bgr(bic),bgr(pred))
            out_rows.append({'opaque_id':name,'group':groups[name],'moment':int(moment),
               'mode':mode,'gain_db':round(gain,6),'features':[round(float(x),9) for x in feats]})
        if i%200==0:print('computed',i+1,'/',len(actual),flush=True)
    doc={'protocol':'RNE08 candidate scene selector; all historic subjects previously seen by RNE04. No new41.',
         'count':len(out_rows),'distinct_sources':len(groups),'trainable_classes':list(MODES),
         'features':list(FEATURE_NAMES),'rows':out_rows,'elapsed_seconds':round(time.monotonic()-t0,2)}
    o=Path(out).resolve()
    if any((p/'.git').exists() for p in (o.parent,*o.parent.parents)):
        raise ValueError('Cannot save row-level labels in Git')
    o.parent.mkdir(parents=True,exist_ok=True);o.write_text(json.dumps(doc),encoding='utf8')
    print(json.dumps({'rows':len(out_rows),'unique':len(groups),'time_seconds':doc['elapsed_seconds']}))

if __name__=='__main__':
    p=argparse.ArgumentParser()
    for v in ('manifest','cache','weights','output'):p.add_argument('--'+v,required=True)
    p.add_argument('--private-training-authorized',action='store_true',required=True)
    a=p.parse_args()
    if not a.private_training_authorized:raise PermissionError('Authorization required')
    dataset(a.manifest,a.cache,a.weights,a.output)