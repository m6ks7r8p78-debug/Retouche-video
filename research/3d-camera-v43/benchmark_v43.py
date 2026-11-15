"""Controlled synthetic head-to-head camera-motion experiment.

Baseline v4.2 optional; set --v42-root to an extracted PRIVATE archive. The
baseline is imported locally and its source is never included in public output.
"""
from __future__ import annotations
import argparse
import importlib
import json
import sys
import time
from pathlib import Path
from camera_guard_v43 import analyse_frames
from scenes_v43 import CASES,make_scene


def evaluate(seeds=(0,1,2), v42_root=None):
    previous=None
    if v42_root is not None:
        sys.path.insert(0,str(Path(v42_root).resolve()))
        previous=importlib.import_module('evaluation_v42.pixel_tracks_v42').analyse_frames
    engines=[('v4.3',analyse_frames)]
    if previous is not None:engines.insert(0,('v4.2',previous))
    results={engine:{c:{'runs':0,'processed':0,'abstained':0,
                        'regions':0,'regions_without_gt':0,'objects_covered':0,
                        'objects_possible':0,'duration_ms':0.0,'statuses':{}}
                      for c in CASES} for engine,_ in engines}
    for case in CASES:
        for seed in seeds:
            frames,gt=make_scene(case,seed)
            for name,runner in engines:
                start=time.perf_counter()
                out=runner(frames)
                elapsed=(time.perf_counter()-start)*1e3
                row=results[name][case]
                row['duration_ms']+=elapsed;row['runs']+=1
                status=out['status'];row['statuses'][status]=row['statuses'].get(status,0)+1
                if status!='processed_unvalidated':
                    row['abstained']+=1;continue
                row['processed']+=1
                for i,f in enumerate(out['frames']):
                    if f['state'].startswith('abstain'):continue
                    reg=f['regions'];row['regions']+=len(reg)
                    centers=[]
                    for r in reg:
                        if 'center' in r:
                            c=r['center']
                            # v4.2 returns normalized; v4.3 returns pixels
                            centers.append((c[0]*frames[i].shape[1],c[1]*frames[i].shape[0]) if name=='v4.2' else tuple(c))
                    row['objects_possible']+=len(gt[i])
                    for gx,gy in gt[i]:
                        if any(abs(gx-x)+abs(gy-y)<35 for x,y in centers):row['objects_covered']+=1
                    if not gt[i]:row['regions_without_gt']+=len(reg)
    for records in results.values():
        for case,row in records.items():
            row['duration_ms']=round(row['duration_ms'],1)
    return {'schema':'retouche-v43-comparison-synthetic','warning':
            'Artificial texture & planar transforms; no real-video accuracy, no hand or contact labels.',
            'seeds':list(seeds),'results':results}

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--v42-root',default=None)
    parser.add_argument('--seeds',type=int,default=3)
    parser.add_argument('--output',default=None)
    args=parser.parse_args()
    report=evaluate(tuple(range(args.seeds)),args.v42_root)
    payload=json.dumps(report,indent=2,ensure_ascii=False)
    if args.output:Path(args.output).write_text(payload+'\n',encoding='utf8')
    else:print(payload)