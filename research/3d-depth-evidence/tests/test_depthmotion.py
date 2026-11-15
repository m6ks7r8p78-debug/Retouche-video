from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))

import numpy as np
import pytest

from depthmotion_evidence import analyze_sequence, analyze_pair
from scenes_depthmotion import make_scene_with_oracle


def dataset(case='two_depths',seed=0):
    return make_scene_with_oracle(case,seed=seed,n=6,h=240,w=320)


def detect(case='two_depths',seed=0,depth_source='synthetic_oracle',camera_source='synthetic_oracle'):
    f,d,m,_=dataset(case,seed)
    return analyze_sequence(f,d,m,depth_source=depth_source,camera_source=camera_source)


@pytest.mark.parametrize('case',('two_depths','two_depths_rotated','two_depths_compressed',
                                  'two_depths_low_delta','single_plane'))
def test_static_scenes_explained(case):
    out=detect(case)
    assert out['status']=='motion_explained_by_depth_and_camera'
    assert out['counts']['independent']==0
    assert out['causal_claim'] is False


@pytest.mark.parametrize('case',('two_depths_mimic','broad_object'))
def test_broad_moving_object_remains_candidate_only(case):
    out=detect(case)
    assert out['status']=='repeated_independent_motion_candidate'
    assert out['counts']['independent']>=3
    assert out['causal_claim'] is False


def test_identical_pixels_different_independent_oracle():
    parallax,dep_a,mot_a,_=dataset('two_depths',6)
    mimic,dep_b,mot_b,_=dataset('two_depths_mimic',6)
    assert all(np.array_equal(a,b) for a,b in zip(parallax,mimic))
    assert any(not np.array_equal(a,b) for a,b in zip(dep_a,dep_b))
    out_a=analyze_sequence(parallax,dep_a,mot_a,depth_source='synthetic_oracle',camera_source='synthetic_oracle')
    out_b=analyze_sequence(mimic,dep_b,mot_b,depth_source='synthetic_oracle',camera_source='synthetic_oracle')
    assert out_a['status']=='motion_explained_by_depth_and_camera'
    assert out_b['status']=='repeated_independent_motion_candidate'


def test_same_pixels_and_same_depth_give_same_result_even_with_different_causal_story():
    pa,za,ma,_=dataset('two_depths',3)
    pb,zb,mb,_=dataset('two_depths_mimic',3)
    assert all(np.array_equal(a,b) for a,b in zip(pa,pb))
    # Without independent depth, the same pixels *cannot* reveal causation.
    xa=analyze_sequence(pa,za,ma,depth_source='rgb_inferred',camera_source='synthetic_oracle')
    xb=analyze_sequence(pb,za,mb,depth_source='rgb_inferred',camera_source='synthetic_oracle')
    assert xa['status']==xb['status']=='abstain_non_independent_evidence'


@pytest.mark.parametrize('depth_source,camera_source',(
  ('rgb_inferred','synthetic_oracle'),('synthetic_oracle','rgb_inferred'),
  ('independent_sensor','unknown'),('unknown','independent_sensor'),
  ('independent_sensor','synthetic_oracle')))
def test_refuse_partially_independent_inputs(depth_source,camera_source):
    f,d,m,_=dataset()
    out=analyze_sequence(f,d,m,depth_source=depth_source,camera_source=camera_source)
    assert out['status']=='abstain_non_independent_evidence'
    assert out['transitions']==[]


def test_synthetic_oracle_cannot_be_asserted_for_real():
    f,d,m,_=dataset()
    x=analyze_sequence(f,d,m,depth_source='synthetic_oracle',camera_source='synthetic_oracle',origin='real_unvalidated')
    assert x['status']=='abstain_non_independent_evidence'


def test_independent_sensor_provenance_is_declared_not_certified():
    f,d,m,_=dataset()
    x=analyze_sequence(f,d,m,depth_source='independent_sensor',camera_source='independent_sensor',origin='real_unvalidated')
    assert x['status']=='abstain_unquantified_sensor_uncertainty'
    assert 'not cryptographically verified' in x['limitations'][2]
    assert x['scope']=='unvalidated_real'


@pytest.mark.parametrize('case',('blank','two_depths_cut'))
def test_untrusted_temporal_result_abstains(case):
    x=detect(case)
    assert x['status'].startswith('abstain_')


def test_occlusion_does_not_imply_independent_object():
    x=detect('occlusion')
    assert x['counts']['independent']==0


def test_local_object_known_miss_is_documented():
    x=detect('local_object')
    assert x['counts']['independent']==0


def test_invalid_depth_count():
    f,d,m,_=dataset()
    with pytest.raises(ValueError):analyze_sequence(f,d[:-1],m,depth_source='synthetic_oracle',camera_source='synthetic_oracle')


def test_invalid_depth_shape():
    f,d,m,_=dataset()
    d[2]=d[2][:,2:]
    with pytest.raises(ValueError):analyze_sequence(f,d,m,depth_source='synthetic_oracle',camera_source='synthetic_oracle')


def test_invalid_depth_dtype():
    f,d,m,_=dataset()
    d[0]=d[0].astype('uint8')
    with pytest.raises(ValueError):analyze_sequence(f,d,m,depth_source='synthetic_oracle',camera_source='synthetic_oracle')


def test_invalid_negative_depth():
    f,d,m,_=dataset()
    d[0][2,3]=-1
    with pytest.raises(ValueError):analyze_sequence(f,d,m,depth_source='synthetic_oracle',camera_source='synthetic_oracle')


def test_missing_depth_abstains():
    f,d,m,_=dataset()
    for a in d:a[:]=np.nan
    x=analyze_sequence(f,d,m,depth_source='synthetic_oracle',camera_source='synthetic_oracle')
    assert x['status']=='abstain_temporal_or_geometric_gap'
    assert x['counts']['abstain']==len(f)-1


def test_wrong_camera_schema():
    f,d,m,_=dataset()
    m[0]['mystery']=4
    with pytest.raises(ValueError):analyze_sequence(f,d,m,depth_source='synthetic_oracle',camera_source='synthetic_oracle')


def test_nonfinite_camera_motion():
    f,d,m,_=dataset()
    m[0]['translation_x_m']=float('inf')
    with pytest.raises(ValueError):analyze_sequence(f,d,m,depth_source='synthetic_oracle',camera_source='synthetic_oracle')


def test_wrong_timestamps():
    f,d,m,_=dataset()
    with pytest.raises(ValueError):analyze_sequence(f,d,m,depth_source='synthetic_oracle',camera_source='synthetic_oracle',timestamps_ms=[0]*len(f))


def test_unsupported_origin():
    f,d,m,_=dataset()
    with pytest.raises(ValueError):analyze_sequence(f,d,m,depth_source='synthetic_oracle',camera_source='synthetic_oracle',origin='real_validated')


def test_too_few_frames():
    f,d,m,_=dataset()
    with pytest.raises(ValueError):analyze_sequence(f[:4],d[:4],m[:3],depth_source='synthetic_oracle',camera_source='synthetic_oracle')


def test_incorrect_calibration_can_cause_false_candidate_not_truth():
    f,d,m,_=dataset('two_depths')
    false_depth=[np.full_like(x,7.2) for x in d]
    x=analyze_sequence(f,false_depth,m,depth_source='synthetic_oracle',camera_source='synthetic_oracle')
    assert x['counts']['independent']>=3
    assert x['causal_claim'] is False


def test_outputs_do_not_include_frames_or_depth():
    f,d,m,_=dataset()
    x=analyze_sequence(f,d,m,depth_source='synthetic_oracle',camera_source='synthetic_oracle')
    import json
    payload=json.dumps(x)
    assert len(payload)<25000
    assert 'frames' not in x and 'depths' not in x


def test_deterministic_repeat():
    f,d,m,_=dataset('broad_object',5)
    x=analyze_sequence(f,d,m,depth_source='synthetic_oracle',camera_source='synthetic_oracle')
    y=analyze_sequence(f,d,m,depth_source='synthetic_oracle',camera_source='synthetic_oracle')
    assert x==y


def test_pair_dimensions_rejected():
    f,d,m,_=dataset()
    with pytest.raises(ValueError): analyze_pair(f[0],f[1][:-1],d[0],m[0])


def test_independent_sensor_with_known_uncertainty_runs_audit():
    f,d,m,_=dataset('broad_object')
    x=analyze_sequence(f,d,m,depth_source='independent_sensor',camera_source='independent_sensor',
                      origin='real_unvalidated',depth_uncertainty_rel=.1,camera_uncertainty_rel=.1)
    assert x['scope']=='unvalidated_real'
    assert x['status'] in ('repeated_independent_motion_candidate','abstain_calibration_sensitivity')
    assert x['calibration_sensitivity']['tested']==4
    assert not x['causal_claim']


def test_invalid_uncertainty_rejected():
    f,d,m,_=dataset()
    with pytest.raises(ValueError):
        analyze_sequence(f,d,m,depth_source='synthetic_oracle',camera_source='synthetic_oracle',
                         depth_uncertainty_rel=1.)


def test_sensitivity_guard_can_abstain_on_camera_error():
    f,d,m,_=dataset('two_depths_mimic')
    x=analyze_sequence(f,d,m,depth_source='synthetic_oracle',camera_source='synthetic_oracle',
                      camera_uncertainty_rel=.4,depth_uncertainty_rel=0)
    assert x['status']=='abstain_calibration_sensitivity'
    assert not x['calibration_sensitivity']['all_same_status']