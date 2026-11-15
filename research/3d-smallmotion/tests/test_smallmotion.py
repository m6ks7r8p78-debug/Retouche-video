"""Synthetic-only regression of dense local candidate detector against DepthMotion."""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import cv2
import numpy as np
import pytest
from smallmotion_evidence import analyze_pair, analyze_sequence, SCHEMA
from depthmotion_evidence import analyze_sequence as old_depth
from scenes_depthmotion import make_scene_with_oracle

def data(case='local_object',seed=1):
    return make_scene_with_oracle(case,seed=seed,n=6)

@pytest.mark.parametrize('seed',[0,1,2,3,4,5,100,101,102,103,104,105])
def test_improves_local_object(seed):
    frames, depths, motion,_=data('local_object',seed)
    old=old_depth(frames,depths,motion,depth_source='synthetic_oracle',camera_source='synthetic_oracle')
    new=analyze_sequence(frames,depths,motion)
    assert old['counts']['independent']==0
    assert new['status']=='repeated_local_2d_motion_candidate'
    assert new['causal_claim'] is False

@pytest.mark.parametrize('case',['single_plane','two_depths','two_depths_rotated','two_depths_compressed','two_depths_low_delta'])
@pytest.mark.parametrize('seed',[0,3,100])
def test_static_scenes_do_not_invent_small_object(case,seed):
    frames,depths,motion,_=data(case,seed)
    r=analyze_sequence(frames,depths,motion)
    assert r['status']=='no_repeated_small_motion_evidence'

@pytest.mark.parametrize('seed',[0,3,100])
def test_broad_motion_not_local(seed):
    f,d,m,_=data('broad_object',seed)
    assert analyze_sequence(f,d,m)['status']=='repeated_broad_2d_motion_candidate'

def test_scene_cut_abstains():
    f,d,m,_=data('two_depths_cut')
    assert analyze_sequence(f,d,m)['status'].startswith('abstain_')

def test_blank_abstains():
    f,d,m,_=data('blank')
    assert analyze_sequence(f,d,m)['status'].startswith('abstain_')

@pytest.mark.parametrize('source',['rgb_inferred','independent_sensor','unknown'])
def test_rgb_inferred_depth_abstains(source):
    f,d,m,_=data()
    assert analyze_sequence(f,d,m,source=source)['status']=='abstain_unverified_depth_source'

def test_no_semantic_claim():
    f,d,m,_=data()
    a=analyze_sequence(f,d,m)
    assert a['schema']==SCHEMA and not a['causal_claim']
    assert all(c['class']=='unclassified_2d_motion_region' for tr in a['transitions'] for c in tr.get('candidates',[]))

def test_invalid_dimensions():
    f,d,m,_=data()
    with pytest.raises(ValueError): analyze_pair(f[0],f[1][1:],d[0],m[0])

def test_invalid_depth_shape():
    f,d,m,_=data()
    with pytest.raises(ValueError): analyze_pair(f[0],f[1],d[0][:40],m[0])

def test_invalid_motion():
    f,d,m,_=data()
    with pytest.raises(ValueError):analyze_sequence(f,d,m[:-1])

def test_nonfinite_depth_does_not_become_object():
    f,d,m,_=data('occlusion')
    a=analyze_sequence(f,d,m)
    assert a['status']!='repeated_local_2d_motion_candidate'

def test_camera_wrong_calibration_not_physical_proof():
    f,d,m,_=data('two_depths')
    wrong=[dict(x,translation_x_m=x['translation_x_m']*1.4) for x in m]
    a=analyze_sequence(f,d,wrong)
    assert a['causal_claim'] is False