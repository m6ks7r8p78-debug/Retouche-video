"""Synthetic blinded evaluation: GT used strictly AFTER fits, never passed to the solvers."""
from __future__ import annotations
import argparse,json,math,time
from pathlib import Path
import cv2
import numpy as np
from markerless_perspective import fit_markerless,fit_single_markerless,render_toy


def make_case(seed:int,condition:str):
    rng=np.random.default_rng(seed)
    u=float(rng.uniform(.62,.97)); f=float(rng.uniform(.52,.84))
    camera_yaws=rng.uniform(-.46,.46,3)
    phases=rng.uniform(.38,1.55,3)
    focal=float(rng.uniform(155.,198.)); distance=float(rng.uniform(3.85,4.85))
    ims=[]
    for k in range(3):
        img=render_toy(u,f,float(camera_yaws[k]),float(phases[k]),focal,distance)
        if condition=='appearance_shift':
            if k%2:img=cv2.dilate(img,np.ones((2,2),np.uint8),iterations=1)
            else:img=cv2.GaussianBlur(img,(3,3),.8)
        if condition=='partial_missing':
            # Missing arm or overlap simulates unverifiable evidence; do not fabricate it
            img[72:89,79:99]=0
        ims.append(img)
    return ims,dict(upper=u,fore=f,ratio=focal/distance,phases=phases.tolist(),yaws=camera_yaws.tolist())


def scored(r,truth,which=None):
    # All scorer interactions with truth are exclusively here.
    if r.upper_torso_units is None:return None
    if which is None:
        yaw=np.asarray(r.yaw_rad);phase=np.asarray(r.phase_rad)
        correctyaw=np.asarray(truth['yaws']);correctphase=np.asarray(truth['phases'])
    else:
        yaw=np.asarray(r.yaw_rad);phase=np.asarray(r.phase_rad)
        correctyaw=np.asarray([truth['yaws'][which]]);correctphase=np.asarray([truth['phases'][which]])
    return dict(shape_mae=(abs(r.upper_torso_units-truth['upper'])+abs(r.forearm_torso_units-truth['fore']))/2,
                angle_mae_deg=float(np.mean(np.abs(yaw-correctyaw)+np.abs(phase-correctphase)))*90/math.pi,
                magnification_absolute_err=abs(r.magnification_f_over_d-truth['ratio']),
                residual=r.chamfer_residual_px,
                status=r.status)


def evaluate(seeds,conditions=('clean','appearance_shift','partial_missing'),nfev=65):
    rows=[];begin=time.monotonic()
    for condition in conditions:
        for seed in seeds:
            ims,truth=make_case(seed,condition)
            multi=fit_markerless(ims,manual_research_opt_in=True,max_nfev=nfev,starts=2)
            indiv=[fit_single_markerless(im,manual_research_opt_in=True,max_nfev=nfev,starts=2) for im in ims]
            a=scored(multi,truth)
            bb=[scored(r,truth,k) for k,r in enumerate(indiv)]
            b={key:float(np.mean([x[key] for x in bb])) for key in ('shape_mae','angle_mae_deg','magnification_absolute_err','residual')}
            b['status']='provisional' if all(x['status']=='provisional' for x in bb) else 'ambiguous_or_poor_fit'
            rows.append(dict(condition=condition,seed=seed,multi=a,single=b,
                             # Keep no images or personal data in report.
                             relative_scale_only=True))
    grouped={}
    for condition in conditions:
        cases=[r for r in rows if r['condition']==condition]
        grouped[condition]={}
        for method in ('multi','single'):
            grouped[condition][method]={key:round(float(np.mean([r[method][key] for r in cases])),4)
                                       for key in ('shape_mae','angle_mae_deg','magnification_absolute_err','residual')}
            grouped[condition][method]['provisional_count']=sum(r[method]['status']=='provisional' for r in cases)
    return dict(n_seeds=len(seeds),n_sequences=len(rows),n_images=3*len(rows),conditions=list(conditions),
                aggregates=grouped,rows=rows,duration_s=round(time.monotonic()-begin,2),
                synthetic_only=True,ground_truth_never_available_to_fit=True,
                no_real_person_reconstruction=True,metric_scale_unknown=True,
                camera_focal_length_not_identifiable_from_ratio=True,model_training_performed=False)

if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--locked',action='store_true');ap.add_argument('--nfev',type=int,default=65)
    args=ap.parse_args()
    seeds=range(1001,1010) if args.locked else range(11,20)
    obj=evaluate(seeds,nfev=args.nfev)
    filename='RNE22_LOCKED_eval.json' if args.locked else 'RNE22_DEVELOPMENT_eval.json'
    out=Path(__file__).resolve().parent/filename
    out.write_text(json.dumps(obj,indent=2,ensure_ascii=False))
    print(json.dumps(obj['aggregates'],ensure_ascii=False,indent=2));print('Wrote',out)