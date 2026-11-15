"""RNE21 locked synthetic benchmark: simulator truth used for SCORING ONLY.

No private video input. Heldout seeds from a distinct numerical range but from
same procedural renderer family. Never call this independent real-world proof.
"""
from __future__ import annotations
import json, math, time, hashlib
from pathlib import Path
from statistics import median
import numpy as np
from anchorage import render_fiducials,solve_single,solve_sequence,PARTS


def make_case(seed:int,condition='clean'):
    rng=np.random.default_rng(seed)
    upper=float(rng.uniform(.49,1.00))
    fore=float(rng.uniform(.45,.98))
    yaw_start=float(rng.uniform(-.98,-.52))
    yaw_finish=float(rng.uniform(.52,.98))
    phase_start=float(rng.uniform(.19,.56))
    phase_finish=float(rng.uniform(1.5,2.3))
    frames=[]; truths=[]
    for i in range(5):
        u=i/4
        yaw=(1-u)*yaw_start+u*yaw_finish
        phase=(1-u)*phase_start+u*phase_finish
        zoom=float(rng.uniform(44,58))
        tx=float(rng.uniform(-7,7));ty=float(rng.uniform(-6,6))
        drop=[];corrupt=[]
        if condition in ('partial_occlusion','marker_outliers','mixed'):
            if i in (1,3):drop+=['left_wrist','object']
            if i==2:drop.append('left_elbow')
        if condition in ('marker_outliers','mixed'):
            if i in (1,3):
                corrupt.append(('right_elbow',(int(rng.choice([-1,1])*rng.integers(6,11)),
                                               int(rng.choice([-1,1])*rng.integers(4,9)))))
        image,coords=render_fiducials(upper=upper,forearm=fore,phase=phase,yaw=yaw,
                          scale=zoom,tx=tx,ty=ty,drop=drop,corrupt=corrupt)
        if condition=='mixed':
            # Camera shake/pixel acquisition noise; fiducials still known colors.
            # No added RGB noise: detector intentionally requires crisp fiducials.
            pass
        frames.append(image);truths.append((yaw,phase,zoom))
    return frames,{'upper':upper,'forearm':fore,'poses':truths,'condition':condition}


def aggregate(items):
    valid=[d for d in items if d['status']=='provisional']
    def val(k):return float(np.mean([r[k] for r in valid])) if valid else None
    return {'cases':len(items),'provisional':len(valid),'abstentions':len(items)-len(valid),
           'upper_mae_relative':val('upper_abs_error'),
           'forearm_mae_relative':val('forearm_abs_error'),
           'yaw_mae_deg':val('yaw_abs_error_deg'),
           'phase_mae_deg':val('phase_abs_error_deg'),
           'median_px_reprojection':val('median_px_reprojection'),
           'correct_lengths_within_0_10':int(sum(r['upper_abs_error']<.1 and r['forearm_abs_error']<.1 for r in valid))}


def score_solution(out,truth):
    if out.status!='provisional':return {'status':out.status}
    y=np.array([a for a,b,c in truth['poses']]);p=np.array([b for a,b,c in truth['poses']])
    return {'status':'provisional',
        'upper_abs_error':round(abs(out.upper_relative-truth['upper']),5),
        'forearm_abs_error':round(abs(out.forearm_relative-truth['forearm']),5),
        'yaw_abs_error_deg':round(float(np.mean(abs(np.asarray(out.yaw_rad)-y)))*180/math.pi,4),
        'phase_abs_error_deg':round(float(np.mean(abs(np.asarray(out.phase_rad)-p)))*180/math.pi,4),
        'median_px_reprojection':out.reprojection_median_px}


def score_independent(outs,truth):
    good=[x for x in outs if x.status=='provisional']
    if len(good)<3:return {'status':'insufficient_evidence'}
    upper=float(np.median([x.upper_relative for x in good]))
    fore=float(np.median([x.forearm_relative for x in good]))
    ae=[];pe=[]
    for i,x in enumerate(outs):
        if x.status=='provisional':
            ae.append(abs(x.yaw_rad[0]-truth['poses'][i][0])*180/math.pi)
            pe.append(abs(x.phase_rad[0]-truth['poses'][i][1])*180/math.pi)
    return {'status':'provisional',
      'upper_abs_error':round(abs(upper-truth['upper']),5),
      'forearm_abs_error':round(abs(fore-truth['forearm']),5),
      'yaw_abs_error_deg':round(float(np.mean(ae)),4),
      'phase_abs_error_deg':round(float(np.mean(pe)),4),
      'median_px_reprojection':round(float(np.median([x.reprojection_median_px for x in good])),5)}


def run(seeds,condition='clean'):
    labels=('fixed_shape_multiframe','independent_shape_per_frame','shared_shape_multiframe')
    scores={k:[] for k in labels};per_case=[]
    for idx,seed in enumerate(seeds):
        frames,truth=make_case(int(seed),condition)
        # No metadata or truth passed into inverse solver.
        ref=solve_sequence(frames,variable_shape=False,manual_research_opt_in=True,extra_seeds=2)
        one=[solve_single(f,manual_research_opt_in=True) for f in frames]
        shared=solve_sequence(frames,variable_shape=True,manual_research_opt_in=True,extra_seeds=2)
        metrics={
          'fixed_shape_multiframe':score_solution(ref,truth),
          'independent_shape_per_frame':score_independent(one,truth),
          'shared_shape_multiframe':score_solution(shared,truth)
        }
        for k in labels:scores[k].append(metrics[k])
        per_case.append({'case_id':f'proc_{idx:03d}', 'scores':metrics})
    return {'condition':condition,'count':len(seeds), 'models':{k:aggregate(v) for k,v in scores.items()},
      'cases_anonymous':per_case,
      'caveat':'All scenes synthetic fiducials; same generator family, different locked numerical seeds. Metrics do not transfer to real unmarked faces or video.'}


if __name__=='__main__':
    root=Path(__file__).parent
    start=time.perf_counter()
    controls={
      'clean':[81010+i*337 for i in range(18)],
      'partial_occlusion':[91020+i*307 for i in range(12)],
      'marker_outliers':[101010+i*173 for i in range(12)],
    }
    reports={name:run(seeds,name) for name,seeds in controls.items()}
    report={'method':'RNE21 ANCRAGE shared-shape 2D fiducial-only multi-frame inversion',
            'status':'research_only', 'total_sequences':sum(len(x) for x in controls.values()),
            'total_frames':sum(len(x)*5 for x in controls.values()),
            'all_private_media_unused':True, 'reserved_41_videos_unused':True,
            'locked_seed_sets':{name:{'count':len(seq),'seed_digest':hashlib.sha256(str(seq).encode()).hexdigest()[:16]} for name,seq in controls.items()},
            'benchmarks':reports,'wall_seconds':round(time.perf_counter()-start,3)}
    (root/'rne21_locked_report.json').write_text(json.dumps(report,indent=2,ensure_ascii=False))
    print(json.dumps({'sequences':report['total_sequences'],'time_s':report['wall_seconds'],
       'aggregate':{name:data['models'] for name,data in reports.items()}},indent=2))

