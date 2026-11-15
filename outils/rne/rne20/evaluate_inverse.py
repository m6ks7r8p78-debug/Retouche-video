"""RNE20: sealed procedural evaluation. Estimator receives ONLY frame.bgr.

Development and locked sets use disjoint explicit random seeds. No source videos.
The locked set is run without parameter changes; reference GT used only AFTER fit.
"""
from __future__ import annotations
from pathlib import Path
import json, math, argparse, time
import numpy as np
import cv2
from inverse_pose import ArticulatedInverse,circular_error
try:
    from outils.rne.rne19.articulated_observable import render_scene
except ModuleNotFoundError:
    from articulated_observable import render_scene


def manifest(section):
    if section not in ('dev','locked','stress'):
        raise ValueError('Use dev, locked or stress')
    base={'dev':1100,'locked':90000,'stress':180000}[section]
    n={'dev':8,'locked':16,'stress':8}[section]
    rng=np.random.default_rng(base)
    cases=[]
    for j in range(n):
        phase=float(rng.uniform(.05,2*math.pi-.05))
        yaw=float(rng.uniform(.03,2*math.pi-.03))
        hold=bool(j%2==0)
        occluder=bool(j%4==1)
        texture_seed=int(base+j+1) % 100000
        cases.append({'case_id':f'{section}-{j:02d}','phase':phase,'yaw':yaw,
                      'hold':hold,'occluder':occluder,'texture_seed':texture_seed})
    return cases


def _stats(rows):
    if not rows:return {}
    yaw=np.array([r['yaw_error_deg'] for r in rows]);phase=np.array([r['phase_error_deg'] for r in rows])
    known=[r for r in rows if r['predicted_contact']!='unknown']
    return {'cases':len(rows),'yaw_median_error_deg':round(float(np.median(yaw)),4),
      'yaw_mean_error_deg':round(float(np.mean(yaw)),4),
      'yaw_within_10deg':int((yaw<10).sum()),
      'phase_median_error_deg':round(float(np.median(phase)),4),
      'phase_mean_error_deg':round(float(np.mean(phase)),4),
      'phase_within_10deg':int((phase<10).sum()),
      'pose_ambiguity_flagged':sum(r['pose_ambiguous'] for r in rows),
      'contact_abstentions':len(rows)-len(known),
      'contact_known_decisions':len(known),
      'contact_correct_known':sum(r['predicted_contact']==r['true_contact'] for r in known),
      'low_fit_score_rejected':sum(not r['fit_valid'] for r in rows)}


def evaluate(section,output_dir=None,start_index=0,count=None):
    start=time.perf_counter()
    cache_path=Path(__file__).resolve().parent/'template_bank_synthetic.npz'
    estimator=ArticulatedInverse(bank_cache=cache_path)
    rows=[];coarse=[];silhouette=[]
    rows_to_fit=manifest(section)[start_index:(start_index+count if count is not None else None)]
    for row in rows_to_fit:
        frame=render_scene(row['phase'],row['yaw'],frame_id=13,size=128,
             hold=row['hold'],occluder=row['occluder'],texture_seed=row['texture_seed'])
        rgb=frame.bgr.copy()
        if section=='stress':
            # Domain shift: the library's fixed template texture is *not* changed.
            if len(rows)%3==0:
                rgb=np.clip(rgb.astype(np.float32)*.72+8,0,255).astype(np.uint8)
            elif len(rows)%3==1:
                rgb=cv2.GaussianBlur(rgb,(7,7),1.9)
            else:
                ok,b=cv2.imencode('.jpg',rgb,[cv2.IMWRITE_JPEG_QUALITY,25]);assert ok
                rgb=cv2.imdecode(b,cv2.IMREAD_COLOR)
        for method,refine,collector in [('rgb',True,rows),('rgb',False,coarse),('silhouette',False,silhouette)]:
            estimate=estimator.fit(rgb,method=method,refine=refine,manual_research_opt_in=True)
            collector.append({'case_id':row['case_id'],'occluder':row['occluder'],
              'true_contact':'holding' if row['hold'] else 'released',
              'predicted_contact':estimate.contact_hypothesis,
              'phase_error_deg':round(math.degrees(circular_error(estimate.articulation_phase_rad,row['phase'])),4),
              'yaw_error_deg':round(math.degrees(circular_error(estimate.yaw_rad,row['yaw'])),4),
              'score':estimate.score,'pose_ambiguous':estimate.pose_ambiguous,
              'fit_valid':estimate.fit_valid})
    report={'experiment':'RNE20/Pixels -> synthetic template pose (not a human reconstruction)',
        'section':section,'start_index':start_index,'source':'procedural images only; known synthetic body template/camera/appearance family',
        'estimated_from_image_pixels_only':True,
        'target_ground_truth_supplied_to_estimator':False,
        'person_3d_scanned':False,'personal_videos_used':False,'private_157_used':False,
        'reserved_41_used':False,'trained_neural_network':False,'contact_certified_from_real_video':False,
        'algorithms':{'photometric_refined':_stats(rows),'photometric_coarse':_stats(coarse),
                      'silhouette_coarse':_stats(silhouette)},
        'notes':['The inverse fits three low-dimensional variables: camera yaw, a one-dimensional articulation phase and a binary holding state.',
             'The 11-part body template, orthographic camera type, and appearance basis are known: no arbitrary real-world geometry is discovered.',
             'Contact is an inferred holding/released TEMPLATE hypothesis, not independently measured surface contact.',
             'Phase and yaw may remain non-identifiable under occlusion, symmetry and atypical appearance.',
             'Photometric matching is susceptible to lighting and blur; flags are heuristic, not calibrated posterior probabilities.'],
        'rows_without_image_or_private_media':rows,
        'seconds':round(time.perf_counter()-start,3)}
    if output_dir:
        out=Path(output_dir);out.mkdir(exist_ok=True,parents=True)
        (out/f'RNE20_{section}_{start_index:02d}_synthetic_metrics.json').write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
    return report

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('section',choices=['dev','locked','stress'])
    parser.add_argument('--output-dir',default=None)
    parser.add_argument('--start-index',type=int,default=0)
    parser.add_argument('--count',type=int,default=None)
    args=parser.parse_args()
    report=evaluate(args.section,args.output_dir,args.start_index,args.count)
    print(json.dumps({'section':args.section,'algorithms':report['algorithms'],'seconds':report['seconds']},ensure_ascii=False,indent=2))