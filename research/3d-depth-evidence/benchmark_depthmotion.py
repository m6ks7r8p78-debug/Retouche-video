"""Reproducible *synthetic* benchmark. No real images, no neural inference."""
from __future__ import annotations
import argparse
import hashlib
import json
import statistics
import time
from pathlib import Path
import numpy as np
from depthmotion_evidence import analyze_sequence
from scenes_depthmotion import make_scene_with_oracle
try:
    from multimotion_evidence import analyze_sequence as baseline_analyze_sequence
    from scenes_multimotion import CASES
except ModuleNotFoundError:
    from baseline_multimotion import analyze_sequence as baseline_analyze_sequence
    from baseline_scenes import CASES  # archive-only fallback

EXPECTED_INDEPENDENT={'two_depths_mimic','broad_object','local_object'}
EXPECTED_STATIC={'two_depths','two_depths_rotated','two_depths_compressed',
                 'two_depths_low_delta','single_plane','occlusion'}
EXPECTED_ABSTAIN={'blank','two_depths_cut'}


def summarize(counts, cases):
    return {'expected_independent_cases': sorted(EXPECTED_INDEPENDENT),
            'expected_static_cases': sorted(EXPECTED_STATIC),
            'expected_abstain_cases': sorted(EXPECTED_ABSTAIN),
            'true_candidate_on_independent':sum(x['candidate'] for x in cases if x['scenario'] in EXPECTED_INDEPENDENT),
            'false_candidate_on_static':sum(x['candidate'] for x in cases if x['scenario'] in EXPECTED_STATIC),
            'static_explained':sum(x['explained'] for x in cases if x['scenario'] in EXPECTED_STATIC),
            'abstain_on_expected_abstain':sum(x['abstain'] for x in cases if x['scenario'] in EXPECTED_ABSTAIN),
            'miss_independent':sum(not x['candidate'] for x in cases if x['scenario'] in EXPECTED_INDEPENDENT),
            'total_cases':len(cases)}


def benchmark(seeds):
    rows=[]
    times=[]
    for case in CASES:
        for seed in seeds:
            frames,depth,motion,meta=make_scene_with_oracle(case,seed=seed)
            start=time.perf_counter()
            evidence=analyze_sequence(frames,depth,motion,depth_source='synthetic_oracle',camera_source='synthetic_oracle')
            times.append(round(1000*(time.perf_counter()-start),3))
            old=baseline_analyze_sequence(frames)
            status=evidence['status']
            rows.append({'scenario':case,'seed':seed,'status':status,'baseline_status':old['status'],
                         'candidate':status=='repeated_independent_motion_candidate',
                         'explained':status=='motion_explained_by_depth_and_camera',
                         'abstain':status.startswith('abstain_'),
                         'transition_counts':evidence['counts']})
    # Focused calibration stress tests on identical inputs, seeded independently.
    ablations=[]
    for case in ('two_depths','two_depths_mimic','broad_object','two_depths_rotated'):
        for seed in seeds:
            frames,d,m,meta=make_scene_with_oracle(case,seed=seed)
            base=analyze_sequence(frames,d,m,depth_source='synthetic_oracle',camera_source='synthetic_oracle')['status']
            # Ablation A: depth assigned to wrong physical plane; physically wrong 'sensor'.
            zwrong=[np.full_like(x,float(meta['Z_background_m'])) for x in d]
            false_z=analyze_sequence(frames,zwrong,m,depth_source='synthetic_oracle',camera_source='synthetic_oracle')['status']
            # Ablation B: pixel-model depth is not independent, regardless of its numeric values.
            correlated=analyze_sequence(frames,d,m,depth_source='rgb_inferred',camera_source='synthetic_oracle')['status']
            # Ablation C: camera translation calibration biased by +40%.
            wrong_motion=[dict(x,translation_x_m=x['translation_x_m']*1.4) for x in m]
            wrong_cam=analyze_sequence(frames,d,wrong_motion,depth_source='synthetic_oracle',camera_source='synthetic_oracle')['status']
            ablations.append({'scenario':case,'seed':seed,'oracle':base,'incorrect_depth':false_z,
                              'rgb_only_depth_source':correlated,'biased_camera_40pc':wrong_cam})
    q=sorted(times)
    return {'schema':'retouche-depthmotion-controlled-synthetic-v1',
            'seeds':list(seeds),'dataset':'same synthetic generator as MultiMotion; not real videos',
            'dependency_versions':{'numpy':np.__version__},
            'result':summarize({},rows),'runtime_ms':{'median':round(statistics.median(q),2),
                         'p95':round(q[int(.95*(len(q)-1))],2)},
            'rows':rows,'ablations':ablations,
            'limitations':['Oracle depths and camera motions are provided from simulator; not a real sensor',
                           'Repeated synthetic seeds are not independent scenes or real-world accuracy',
                           'Incorrect depth or camera calibration may create false apparent independent motion',
                           'RGB-derived depth is not independent evidence; conservative gate refuses causal inference',
                           'No test of Video Depth Anything neural inference or iPhone hardware']}


if __name__=='__main__':
    p=argparse.ArgumentParser()
    p.add_argument('--seeds',type=int,default=12)
    p.add_argument('--offset',type=int,default=0)
    p.add_argument('--out',type=str,required=True)
    a=p.parse_args()
    out=benchmark(range(a.offset,a.offset+a.seeds))
    Path(a.out).parent.mkdir(parents=True,exist_ok=True)
    Path(a.out).write_text(json.dumps(out,indent=2,ensure_ascii=False)+'\n')
    print(json.dumps({'summary':out['result'],'runtime_ms':out['runtime_ms'],
                      'ablation_12':out['ablations'][:3]},indent=2,ensure_ascii=False))