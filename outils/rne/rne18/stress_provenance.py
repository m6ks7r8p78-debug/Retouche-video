"""Frozen no-training stress on new procedural textures and intentionally wrong calibration.

Thresholds are fixed beforehand by source code. Does not use any user media.
"""
import json
from pathlib import Path
import numpy as np
from dataclasses import replace
from outils.rne.rne18.observable_atlas import synthetic_texture,project_texture,accumulate_visible_surface

def experiment(seed):
    tex=synthetic_texture(128,256,seed=seed)
    a=project_texture(tex,0,192,occlusion='none',phase=0)
    b=project_texture(tex,.38,192,occlusion='none',phase=1)
    normal=accumulate_visible_surface([a,b],shape=(128,256))
    forged=accumulate_visible_surface([a,replace(b,u=(b.u+.12)%1)],shape=(128,256))
    repeated=accumulate_visible_surface([a,replace(a,frame_id=4)],shape=(128,256))
    return {'seed':seed,'normal_observed_cells':int(normal.observed.sum()),
            'normal_distinct_view_confirmed_cells':int(normal.corroborated.sum()),
            'normal_contested_cells':int(normal.contested.sum()),
            'forged_camera_contested_cells':int(forged.contested.sum()),
            'forged_camera_corroborated_cells':int(forged.corroborated.sum()),
            'repeated_same_view_false_confirmations':int(repeated.corroborated.sum())}
if __name__=='__main__':
    rows=[experiment(i) for i in (1001,1007,1013,1021,1033,1049,1061,1087)]
    out={'status':'frozen_synthetic_stress','privacy':'no personal data','samples':len(rows),
         'geometry_camera_pose_known':True,'model_training':False,
         'calibration_is_deliberately_wrong_in_one_arm':True,
         'threshold_tuning_on_these_samples':False,
         'rows':rows,
         'all_repeats_not_corroborated':all(x['repeated_same_view_false_confirmations']==0 for x in rows),
         'all_forged_yaw_more_contested':all(x['forged_camera_contested_cells']>x['normal_contested_cells'] for x in rows),
         'mean_contested_normal':float(np.mean([x['normal_contested_cells'] for x in rows])),
         'mean_contested_forged':float(np.mean([x['forged_camera_contested_cells'] for x in rows]))}
    print(json.dumps(out,indent=2))
    print(json.dumps({k:v for k,v in out.items() if k!='rows'},indent=2))