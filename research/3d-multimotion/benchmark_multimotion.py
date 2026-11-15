"""Predefined synthetic head-to-head. Explicitly not an accuracy dataset."""
from __future__ import annotations
import argparse
import json
import statistics
import time
from pathlib import Path
from multimotion_evidence import analyze_sequence
from scenes_multimotion import CASES,make_scene


def benchmark(seeds=range(12)):
    result={'schema':'retouche-multimotion-synthetic-1','seeds':list(seeds),
        'warning':'SIMULATED two 2D planes, not physical real video accuracy; model has no hand/object classes.',
        'cases':{}}
    for c in CASES:
        statuses={};pairs={'two':0,'one':0,'unresolved':0};time_ms=[];cases=[]
        for s in seeds:
            frames,groundtruth=make_scene(c,s)
            start=time.perf_counter();out=analyze_sequence(frames)
            time_ms.append((time.perf_counter()-start)*1000)
            statuses[out['status']]=statuses.get(out['status'],0)+1
            for k in pairs:pairs[k]+=out['counts'][k]
            cases.append({'seed':s,'status':out['status'],'two_pairs':out['counts']['two']})
        result['cases'][c]={'statuses':statuses,'pair_counts':pairs,
             'mean_time_ms':round(statistics.mean(time_ms),1),
             'p95_time_ms':round(sorted(time_ms)[int(.95*(len(time_ms)-1))],1),
             'runs':cases}
    return result

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--seeds',type=int,default=12)
    p.add_argument('--out',default=None)
    a=p.parse_args();r=benchmark(range(a.seeds))
    data=json.dumps(r,indent=2,ensure_ascii=False)
    if a.out:Path(a.out).write_text(data+'\n',encoding='utf8')
    else:print(data)