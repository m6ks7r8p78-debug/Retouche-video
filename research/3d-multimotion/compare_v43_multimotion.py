"""Head-to-head decisions, not an 'accuracy' contest: v4.3 is designed to abstain
when multiple broad motions occur; new evidence layer reports the ambiguity.
Both run on identical new synthetic scene frames. Never loads private archives.
"""
from __future__ import annotations
import argparse
import json
import statistics
import sys
import time
from pathlib import Path

from multimotion_evidence import analyze_sequence
from scenes_multimotion import make_scene

v43_dir=Path(__file__).resolve().parents[1] / '3d-camera-v43'
if not v43_dir.exists():
    # For the standalone demo unpacked adjacent to this file (no private data).
    v43_dir=Path(__file__).resolve().parent / 'previous_v43'
if not (v43_dir/'camera_guard_v43.py').exists():
    raise SystemExit('v4.3 baseline unavailable: place public camera_guard_v43.py in '+str(v43_dir))
sys.path.insert(0,str(v43_dir))
from camera_guard_v43 import analyse_frames

CASES=('two_depths','two_depths_rotated','two_depths_low_delta','two_depths_cut',
       'single_plane','local_object','broad_object','blank','occlusion')


def compare(seeds=range(12)):
    report={'schema':'retouche-head-to-head-2d-evidence',
            'warning':'Different tasks: v4.3 outputs motion regions or abstains; new layer reports competing hypotheses. Not accuracy metrics.',
            'seeds':list(seeds),'cases':{}}
    for case in CASES:
        rows=[]
        for seed in seeds:
            frames,_=make_scene(case,seed)
            start=time.perf_counter();before=analyse_frames(frames);elapsed1=(time.perf_counter()-start)*1000
            start=time.perf_counter();after=analyze_sequence(frames);elapsed2=(time.perf_counter()-start)*1000
            rows.append({'seed':seed,'v43':before['status'],'multi':after['status'],
                         'v43_time_ms':elapsed1,'multi_time_ms':elapsed2})
        report['cases'][case]={
            'v43_status_counts':{status:sum(r['v43']==status for r in rows) for status in sorted({r['v43'] for r in rows})},
            'multimotion_status_counts':{status:sum(r['multi']==status for r in rows) for status in sorted({r['multi'] for r in rows})},
            'v43_mean_ms':round(statistics.mean(r['v43_time_ms'] for r in rows),1),
            'multi_mean_ms':round(statistics.mean(r['multi_time_ms'] for r in rows),1)}
    return report

if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--seeds',type=int,default=12);ap.add_argument('--out');a=ap.parse_args()
    result=json.dumps(compare(range(a.seeds)),ensure_ascii=False,indent=2)
    if a.out:Path(a.out).write_text(result+'\n',encoding='utf8')
    else:print(result)