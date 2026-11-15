"""Reproduce 2D candidate comparison on same procedural scenes as DepthMotion."""
from __future__ import annotations
import argparse, json, time, statistics
from pathlib import Path
import cv2,numpy as np
from scenes_depthmotion import make_scene_with_oracle
try:
    from scenes_multimotion import CASES
except ModuleNotFoundError:
    from baseline_scenes import CASES
from depthmotion_evidence import analyze_sequence as baseline
from smallmotion_evidence import analyze_sequence as enhanced


def evaluate(seeds):
    rows=[];new_times=[];old_times=[]
    for case in CASES:
        for seed in seeds:
            frames,dep,motion,_=make_scene_with_oracle(case,seed=seed,n=6)
            t=time.perf_counter();old=baseline(frames,dep,motion,depth_source='synthetic_oracle',camera_source='synthetic_oracle');old_times.append((time.perf_counter()-t)*1000)
            t=time.perf_counter();new=enhanced(frames,dep,motion);new_times.append((time.perf_counter()-t)*1000)
            rows.append({'scenario':case,'seed':seed,'baseline_status':old['status'],'smallmotion_status':new['status'],
                'small_candidate':new['status']=='repeated_local_2d_motion_candidate',
                'broad_candidate':new['status']=='repeated_broad_2d_motion_candidate',
                'abstain':new['status'].startswith('abstain_')})
    static={'single_plane','two_depths','two_depths_rotated','two_depths_compressed','two_depths_low_delta'}
    independent={'local_object','broad_object','two_depths_mimic'}
    summary={'sequences':len(rows),'small_object_success':sum(x['small_candidate'] for x in rows if x['scenario']=='local_object'),
             'small_object_count':sum(x['scenario']=='local_object' for x in rows),
             'static_false_small_candidate':sum(x['small_candidate'] for x in rows if x['scenario'] in static),
             'static_count':sum(x['scenario'] in static for x in rows),
             'baseline_small_object_success':sum(x['baseline_status']=='repeated_independent_motion_candidate' for x in rows if x['scenario']=='local_object'),
             'broad_object_classed_broad':sum(x['broad_candidate'] for x in rows if x['scenario']=='broad_object'),
             'occlusion_false_small':sum(x['small_candidate'] for x in rows if x['scenario']=='occlusion'),
             'cut_abstain':sum(x['abstain'] for x in rows if x['scenario']=='two_depths_cut'),
             'blank_abstain':sum(x['abstain'] for x in rows if x['scenario']=='blank')}
    return {'schema':'retouche-smallmotion-procedural-benchmark-1','seeds':list(seeds),'cv2':cv2.__version__,'numpy':np.__version__,
            'runtime_ms_median':{'depthmotion':round(statistics.median(old_times),2),'smallmotion':round(statistics.median(new_times),2)},
            'summary':summary,'rows':rows,
            'limits':['Synthetic textures and oracle depth/motion, no generalization to real iPhone videos',
                      'Dense candidate needs depth and camera motion independent for physical interpretation',
                      'Separate browser JS proof-of-concept is NOT the Python algorithm',
                      'Elapsed times are per sequence in this CPU container; no iPhone energy/thermal measurements']}

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--seeds',type=int,default=12);p.add_argument('--offset',type=int,default=0);p.add_argument('--out',required=True)
    a=p.parse_args();o=evaluate(range(a.offset,a.offset+a.seeds));Path(a.out).parent.mkdir(parents=True,exist_ok=True);Path(a.out).write_text(json.dumps(o,indent=2,ensure_ascii=False)+'\n');print(json.dumps({'summary':o['summary'],'runtime':o['runtime_ms_median']}))