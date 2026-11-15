"""Small but adversarial tests. No generalization claims."""
import sys
from pathlib import Path
import numpy as np
import pytest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from scenes_multimotion import make_scene
from multimotion_evidence import analyze_pair,analyze_sequence

@pytest.mark.parametrize('case',['two_depths','two_depths_rotated'])
@pytest.mark.parametrize('seed',[0,1,2,3])
def test_multiple_broad_fields(case,seed):
    f,gt=make_scene(case,seed)
    o=analyze_sequence(f)
    assert o['status']=='repeated_two_motion_evidence',(case,seed,o['status'],o['counts'])
    assert o['no_semantic_claims'] is True
    assert not any('depth' in k or 'contact' in k or 'hand' in k for k in o['transitions'][0])

@pytest.mark.parametrize('seed',[0,1,2,3])
def test_one_plane(seed):
    f,_=make_scene('single_plane',seed)
    assert analyze_sequence(f)['status']=='single_dominant_evidence'

@pytest.mark.parametrize('seed',[0,1,2,3])
def test_small_moving_object_is_not_multiplane(seed):
    f,_=make_scene('local_object',seed)
    assert analyze_sequence(f)['status']!='repeated_two_motion_evidence'

@pytest.mark.parametrize('seed',[0,1])
def test_blanks_abstain(seed):
    f,_=make_scene('blank',seed)
    assert analyze_sequence(f)['status']=='abstain_insufficient_evidence'

def test_reject_bad_origin_and_frames():
    f,_=make_scene()
    with pytest.raises(ValueError):analyze_sequence(f,origin='validated_real')
    with pytest.raises(ValueError):analyze_sequence(f,timestamps_ms=[0]*len(f))
    with pytest.raises(ValueError):analyze_sequence(f[:3])
    with pytest.raises(ValueError):analyze_sequence([q.astype(np.float32) for q in f])

def test_broad_independent_object_is_ambiguous_not_depth():
    f,_=make_scene('broad_object',0)
    o=analyze_sequence(f)
    assert o['no_semantic_claims'] is True
    assert all('Z_foreground_m' not in x for x in o['transitions'])


def test_indistinguishable_physical_causes():
    near,meta_near=make_scene('two_depths',77)
    move,meta_move=make_scene('two_depths_mimic',77)
    assert meta_near['is_camera_parallax'] and meta_move['is_independent_object']
    # These scene descriptions have exactly the same pixels yet different
    # causal labels; any pixels-only method must return the same evidence.
    assert all(np.array_equal(a,b) for a,b in zip(near,move))
    assert analyze_sequence(near)['status']==analyze_sequence(move)['status']

@pytest.mark.parametrize('seed',[0,1,2])
def test_scene_cut_abstains(seed):
    frames,_=make_scene('two_depths_cut',seed)
    o=analyze_sequence(frames)
    assert o['status']=='abstain_temporal_gap',(o['status'],o['counts'])

@pytest.mark.parametrize('seed',[0,1,2])
def test_compression_still_reports_evidence_or_ambiguous(seed):
    frames,_=make_scene('two_depths_compressed',seed)
    o=analyze_sequence(frames)
    assert o['no_semantic_claims'] is True
    assert o['status'] in ('repeated_two_motion_evidence','ambiguous_mixed_motion_evidence','abstain_temporal_gap')