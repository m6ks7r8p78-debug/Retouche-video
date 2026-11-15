"""One-off frozen RNE21 evidence audit on new seed range; no parameter updates."""
import json,math,time,hashlib
from pathlib import Path
import numpy as np
from anchorage import render_fiducials,solve_sequence
from evidence_audit import audit_evidence
from locked_evaluation import make_case


def samples():
    rows=[]
    for condition in ('clean','partial_occlusion','marker_outliers'):
        for i in range(8):
            frames,truth=make_case(310201+int(i*1549)+{'clean':0,'partial_occlusion':20000,'marker_outliers':40000}[condition],condition)
            rows.append((condition,frames,truth))
    for i in range(6):
        sample,truth=make_case(800202+i*707,'clean')
        rows.append(('repeated_view',[sample[0].copy() for _ in range(5)],truth))
    for i in range(6):
        rng=np.random.default_rng(900200+i*797)
        upper=float(rng.uniform(.51,.99));fore=float(rng.uniform(.45,.95))
        frames=[]
        for j in range(5):
            img,_=render_fiducials(upper=upper,forearm=fore,phase=.4+.37*j,
               yaw=-.75+.35*j,scale=50,drop=('right_wrist',) if j<4 else ())
            frames.append(img)
        rows.append(('mostly_hidden_wrist',frames,{'upper':upper,'forearm':fore}))
    return rows


def main():
    start=time.perf_counter();out=[]
    for condition,frames,truth in samples():
        r=audit_evidence(frames,manual_research_opt_in=True)
        fit=solve_sequence(frames,manual_research_opt_in=True,extra_seeds=2)
        known_error=None
        if fit.upper_relative is not None:
            known_error=max(abs(fit.upper_relative-truth['upper']),abs(fit.forearm_relative-truth['forearm']))
        out.append({'condition':condition,'audit_verdict':r.verdict,'audit_reason':r.reason,
             'shared_fit_status':fit.status,'max_relative_length_error':None if known_error is None else round(float(known_error),5),
             'yaw_span_deg':r.estimated_yaw_span_deg,'wrist_frames':r.wrist_frames})
    groups={}
    for condition in sorted(set(z['condition'] for z in out)):
        rows=[z for z in out if z['condition']==condition]
        groups[condition]={
            'count':len(rows),'provisional_agreement':sum(z['audit_verdict']=='provisional_agreement' for z in rows),
            'abstained':sum(z['audit_verdict']=='abstain' for z in rows),
            'provisional_bad_length_gt_0_1':sum(z['audit_verdict']=='provisional_agreement' and (z['max_relative_length_error'] is not None and z['max_relative_length_error']>.1) for z in rows),
            'mean_length_error_given_provisional':round(float(np.mean([z['max_relative_length_error'] for z in rows if z['audit_verdict']=='provisional_agreement' and z['max_relative_length_error'] is not None])),5) if any(z['audit_verdict']=='provisional_agreement' and z['max_relative_length_error'] is not None for z in rows) else None,
            'reasons':{reason:sum(z['audit_reason']==reason for z in rows) for reason in sorted(set(z['audit_reason'] for z in rows))}
        }
    result={'experiment':'RNE21 frozen audit of view diversity and cross-view morphology',
            'evaluation_type':'procedural_new_seed_range_same_generator_family',
            'sample_sequences':len(out),'sample_frames':len(out)*5,
            'groups':groups,'full_anonymous_rows':out,
            'time_seconds':round(time.perf_counter()-start,2),
            'no_private_content_accessed':True,'no_weights_trained':True,'no_production_claim':True}
    path=Path(__file__).with_name('rne21_audit_frozen_report.json')
    path.write_text(json.dumps(result,indent=2,ensure_ascii=False))
    print(json.dumps({'samples':len(out),'groups':groups,'time_s':result['time_seconds']},indent=2,ensure_ascii=False))

if __name__=='__main__':main()

