"""Behavioral tests. No claim of performance on humans or iPhone Safari."""
import sys
from pathlib import Path
import numpy as np
import pytest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from camera_guard_v43 import analyse_frames,EvidenceError
from scenes_v43 import make_scene

@pytest.mark.parametrize('case', ['translation','rotation','zoom','rotation_object','camera_object'])
@pytest.mark.parametrize('seed',[0,1,2])
def test_estimable_camera(case,seed):
    frames,_=make_scene(case,seed)
    o=analyse_frames(frames)
    assert o['status']=='processed_unvalidated',(case,seed,o['status'])
    assert len(o['frames'])==len(frames)
    assert len(o['camera_quality'])==len(frames)-1

@pytest.mark.parametrize('case', ['rotation','zoom','translation'])
def test_camera_only_yields_few_regions(case):
    frames,_=make_scene(case,2)
    o=analyse_frames(frames)
    assert o['status']=='processed_unvalidated'
    assert sum(len(f['regions']) for f in o['frames'])<=3,(case,o['frames'])

def test_motion_not_hand():
    frames,gt=make_scene('camera_object',0)
    o=analyse_frames(frames)
    assert o['status']=='processed_unvalidated'
    assert o['no_semantic_claims'] is True
    assert not any('track_id' in r or 'hand' in r for f in o['frames'] for r in f['regions'])
    assert sum(len(f['regions']) for f in o['frames'])>=4

def test_occlusion_not_identity():
    frames,_=make_scene('occlusion',0)
    o=analyse_frames(frames)
    if o['status']=='processed_unvalidated':
        assert not any('track_id' in r for f in o['frames'] for r in f['regions'])
    else: assert o['status'].startswith('abstain_')

def test_blank_abstains():
    frames,_=make_scene('blank',0)
    assert analyse_frames(frames)['status'].startswith('abstain_')

def test_invalid_origin_and_inputs():
    frames,_=make_scene('translation',0)
    with pytest.raises(EvidenceError): analyse_frames(frames,origin='real_annotated')
    with pytest.raises(EvidenceError): analyse_frames(frames,threshold=True)
    with pytest.raises(EvidenceError): analyse_frames(frames,timestamps_ms=[0]*len(frames))
    with pytest.raises(EvidenceError): analyse_frames(frames[:3])
    wrong=frames.copy();wrong[2]=wrong[2].astype(np.float32)
    with pytest.raises(EvidenceError): analyse_frames(wrong)

@pytest.mark.parametrize('seed',range(12))
def test_parallax_refuses_or_marks_large_residual(seed):
    frames,_=make_scene('parallax',seed)
    o=analyse_frames(frames)
    assert o['status'].startswith('abstain_') or any(
        f['state']=='abstain_large_residual' for f in o.get('frames',[])),o['status']