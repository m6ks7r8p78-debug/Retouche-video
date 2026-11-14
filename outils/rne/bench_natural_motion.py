#!/usr/bin/env python3
"""Post-training RNE motion QA on local authorized footage. Not an unseen test.

Never publish video pixels, paths, metadata, SHA, weights or per-scene results.
Output JSON is private and refused inside a Git checkout.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import time
from pathlib import Path
import cv2
import numpy as np
import torch
from triad import load_weights,RNE03Renderer
from temporal_safety import compare_temporal_pair,review_segment
from residual_temporal import stabilize_detail

def sha(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda:f.read(1<<20),b''):h.update(chunk)
    return h.hexdigest()

def private_representatives(manifest,expected_count=157,expected_groups=37):
    items=json.loads(Path(manifest).read_text(encoding='utf8'))
    if not isinstance(items,list) or len(items)!=expected_count or not all(isinstance(x,dict) for x in items):
        raise ValueError('Incorrect private corpus size')
    groups={};seen=set()
    for item in sorted(items,key=lambda x:x['id']):
        if not all(k in item for k in ('id','group','path','sha256','private_evaluation_consent','publication')):
            raise ValueError('Missing private corpus fields')
        if item['id'] in seen:raise ValueError('Repeated video ID')
        seen.add(item['id'])
        if item['private_evaluation_consent'] is not True or item['publication'] is not False:
            raise PermissionError('Private evaluation only; publication not permitted')
        groups.setdefault(item['group'],item)
    if len(groups)!=expected_groups:raise ValueError('Scene group count differs from protocol')
    return [groups[g] for g in sorted(groups)]

def get_small_frames(path,count=9):
    cap=cv2.VideoCapture(str(path))
    if not cap.isOpened():raise ValueError('Cannot decode a selected source')
    count_all=int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    cap.set(cv2.CAP_PROP_POS_FRAMES,max(0,int(count_all*.18)))
    result=[]
    for i in range(count):
        ok,frame=cap.read()
        if not ok:break
        h,w=frame.shape[:2]
        ratio=min(1.,128/max(h,w))
        nw=max(16,int(round(w*ratio))//2*2)
        nh=max(16,int(round(h*ratio))//2*2)
        result.append(cv2.resize(frame,(nw,nh),
                      interpolation=cv2.INTER_AREA if ratio<1 else cv2.INTER_CUBIC))
    cap.release()
    return result

def summarize(records,method):
    cases=[x[method] for x in records]
    valid=[x for x in cases if x.get('transitions',0)>=3]
    def avg(key):
        v=[x[key] for x in valid if isinstance(x.get(key),(int,float))]
        return round(float(np.mean(v)),5) if v else None
    return {'groups':len(cases),'groups_with_data':len(valid),
            'segments_flagged':sum(x.get('disposition')=='fallback_bicubic_for_research' for x in cases),
            'manual_lab_preview_only':sum(x.get('disposition')=='manual_laboratory_preview_only' for x in cases),
            'harmful_transitions':sum(x.get('worse_transitions',0) for x in cases),
            'bicubic_mean_of_segment_medians_mae_255':avg('bicubic_temporal_median_mae_255'),
            'rne_mean_of_segment_medians_mae_255':avg('rne_temporal_median_mae_255')}

def run(*,manifest,weights,output,expected_count=157,expected_groups=37,
        groups_to_audit=37,alpha=.25):
    output=Path(output).resolve()
    if any((p/'.git').exists() for p in (output.parent,*output.parent.parents)):
        raise ValueError('No private test reports inside Git')
    if groups_to_audit<1 or groups_to_audit>expected_groups or not np.isfinite(alpha) or not 0<=alpha<=.35:
        raise ValueError('Invalid number of groups or conservative alpha')
    records=private_representatives(manifest,expected_count,expected_groups)[:groups_to_audit]
    torch.set_num_threads(2);cv2.setNumThreads(1)
    model=load_weights(weights)
    started=time.monotonic();details=[];decoded=usable=0
    for i,item in enumerate(records):
        path=Path(item['path'])
        if not path.is_file() or sha(path)!=item['sha256']:
            raise ValueError('Private source missing or SHA mismatch')
        original=get_small_frames(path)
        decoded+=len(original)
        if len(original)<4:
            details.append({'group_index':i,
                            'raw':{'disposition':'no_preview','transitions':0},
                            'corrected':{'disposition':'no_preview','transitions':0}})
            continue
        renderer=RNE03Renderer(model,tile=64,context=8)
        predicted=[renderer.frame(frame) for frame in original]
        cubic=[cv2.resize(f,(2*f.shape[1],2*f.shape[0]),interpolation=cv2.INTER_CUBIC)
               for f in original]
        adjusted=[predicted[0]]
        for j in range(1,len(original)):
            f,_=stabilize_detail(original[j-1],original[j],cubic[j-1],cubic[j],
                                 predicted[j-1],predicted[j],alpha=alpha)
            adjusted.append(f)
        before=[];after=[]
        for j in range(1,len(original)):
            before.append(compare_temporal_pair(original[j-1],original[j],cubic[j-1],
                                                 cubic[j],predicted[j-1],predicted[j]))
            after.append(compare_temporal_pair(original[j-1],original[j],cubic[j-1],
                                                cubic[j],adjusted[j-1],adjusted[j]))
        usable+=sum(int(x.get('usable',False)) for x in before)
        details.append({'group_index':i,
                        'raw':review_segment(before,manual_opt_in=True),
                        'corrected':review_segment(after,manual_opt_in=True)})
    summary={'protocol':'Post-training temporal QA on previously seen natural clips, NOT independent',
             'manifest_videos':expected_count,'scene_group_representatives':len(details),
             'frames_decoded':decoded,'usable_motion_pairs':usable,'detail_blend_alpha':alpha,
             'raw':summarize(details,'raw'),'corrected':summarize(details,'corrected'),
             'heldout_proof':False,'face_identity_proof':False,
             'real_iphone_tested':False,'deployment_allowed':False,
             'nvidia_sdk_used':False,'no_media_or_pixels_exported':True,
             'elapsed_sec':round(time.monotonic()-started,2)}
    output.parent.mkdir(parents=True,exist_ok=True)
    output.write_text(json.dumps({'aggregate':summary,'groups_private':details},
                                 ensure_ascii=False,indent=2),encoding='utf8')
    return summary

def main():
    p=argparse.ArgumentParser()
    p.add_argument('--manifest',type=Path,required=True)
    p.add_argument('--weights',type=Path,required=True)
    p.add_argument('--output',type=Path,required=True)
    p.add_argument('--groups',type=int,default=37)
    p.add_argument('--expected-count',type=int,default=157)
    p.add_argument('--expected-groups',type=int,default=37)
    p.add_argument('--alpha',type=float,default=.25)
    p.add_argument('--private-evaluation-authorized',action='store_true',required=True)
    a=p.parse_args()
    if not a.private_evaluation_authorized:raise PermissionError('Private authorization required')
    print(json.dumps(run(manifest=a.manifest,weights=a.weights,output=a.output,
                        expected_count=a.expected_count,expected_groups=a.expected_groups,
                        groups_to_audit=a.groups,alpha=a.alpha),ensure_ascii=False,indent=2))

if __name__=='__main__':main()
