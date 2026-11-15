"""Aggregate only previously committed synthetic result files; no recalibration."""
from pathlib import Path
import json
import numpy as np
from evaluate_inverse import _stats

def aggregate(folder):
    folder=Path(folder)
    result={}
    for partition,expected in [('dev',8),('locked',16),('stress',8)]:
        files=sorted(folder.glob(f'RNE20_{partition}_??_synthetic_metrics.json'))
        rows={'photometric_refined':[],'photometric_coarse':[],'silhouette_coarse':[]}
        ids=[]
        for f in files:
            report=json.loads(f.read_text())
            assert report['section']==partition
            entries=report['rows_without_image_or_private_media']
            assert len(entries)==4
            for e in entries:ids.append(e['case_id'])
            # Other benchmark baseline results are aggregated from their own per-chunk
            # summary using exact fixed-count moments only for counts, full fine rows for errors.
            for algo in ('photometric_coarse','silhouette_coarse'):
                # Each report includes aggregate stats but not raw baseline rows.
                rows[algo].append(report['algorithms'][algo])
            rows['photometric_refined']+=entries
        if len(ids)!=expected or len(set(ids))!=expected:
            raise ValueError(f'Incomplete or duplicate partition {partition}: {len(ids)}')
        reference=_stats(rows['photometric_refined'])
        baselines={}
        for algo in ('photometric_coarse','silhouette_coarse'):
            chunks=rows[algo];total=sum(c['cases'] for c in chunks)
            baselines[algo]={
               'cases':total,
               'yaw_mean_error_deg':round(sum(c['yaw_mean_error_deg']*c['cases'] for c in chunks)/total,4),
               'phase_mean_error_deg':round(sum(c['phase_mean_error_deg']*c['cases'] for c in chunks)/total,4),
               'yaw_within_10deg':sum(c['yaw_within_10deg'] for c in chunks),
               'phase_within_10deg':sum(c['phase_within_10deg'] for c in chunks),
               'contact_abstentions':sum(c['contact_abstentions'] for c in chunks)
            }
        result[partition]={'photometric_refined':reference,'baselines':baselines,
                           'input_images':expected,'image_only_inverse':True,
                           'image_variations':('night/blur/jpeg synthetic' if partition=='stress' else 'disjoint procedural texture seeds; sometimes foreground occlusion')}
    output={
      'program':'RetoucheProAI RNE20 experimental inverse toy mannequin',
      'decision':'RESEARCH ONLY — template-fitting is not real-person 3D reconstruction',
      'experimental_sections':result,
      'neural_weights_trained':False,
      'synthetic_renderer_ground_truth_used_by_estimator':False,
      'simulator_known_template_and_camera_model_used_by_estimator':True,
      'all_images_procedurally_generated':True,
      '157_historic_videos_used':False,'41_recent_videos_used':False,
      'real_person_models_created':False,'real_world_pose_accuracy_verified':False,
      'no_deployment':True,
      'thresholds_frozen_before_locked':True,\n      'thresholds_not_externally_preregistered':True,
      'locked_eval_not_retuned':True,
      'warning':'Very small synthetic eval sets, same underlying geometry and render engine. Texture seeds and corruptions are different; not independent real-domain validation.'
    }
    (folder/'RNE20_FULL_LOCKED_SYNTHETIC_REPORT.json').write_text(json.dumps(output,indent=2,ensure_ascii=False)+'\n')
    return output

if __name__=='__main__':
    import sys
    r=aggregate(sys.argv[1])
    print(json.dumps(r['experimental_sections'],indent=2,ensure_ascii=False))