"""Synthetic-only P11 tests; no user media shipped in the test suite."""
import json, math, sys, tempfile
from pathlib import Path
import cv2, numpy as np, pytest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from p11_micro_motion import relative_flow,probe_video,_safe,process_worklist
from p11_review_dataset import make_review_tasks,gate_supervised_example


def pattern():
    rng=np.random.default_rng(21)
    x=(rng.random((180,240))*255).astype(np.uint8)
    return cv2.GaussianBlur(x,(3,3),0)

def test_camera_translation_cancelled():
    a=pattern(); M=np.float32([[1,0,3],[0,1,2]])
    b=cv2.warpAffine(a,M,(240,180))
    r=relative_flow(a,b)
    assert r['usable'] and r['tracks']>=8
    assert r['flow_median'] < .5
    assert abs(r['camera_flow'][0]-3)<.5

def test_local_move_remains():
    a=pattern();b=a.copy()
    # local altered patch should generate motion, not silently be classified 'identity'.
    patch=a[40:90,50:100].copy()
    b[40:90,50:100]=a[40:90,50:100].mean().astype(np.uint8)
    b[45:95,55:105]=patch
    r=relative_flow(a,b)
    assert r['usable'] and r['flow_p90']>.01

def test_blank_abstains():
    a=np.zeros((150,150),np.uint8)
    r=relative_flow(a,a)
    assert not r['usable'] and r['flow_p90'] is None

def test_no_landmarks_claimed():
    a=pattern();r=relative_flow(a,a,(30,25,100,100))
    assert 'mouth_approx' in r['regions']
    assert 'mouth_landmark' not in r['regions']

def test_private_video_probe(tmp_path):
    p=tmp_path/'synth.mp4'
    w=cv2.VideoWriter(str(p),cv2.VideoWriter_fourcc(*'mp4v'),15,(240,180))
    assert w.isOpened()
    base=pattern()
    for i in range(40):
        img=cv2.warpAffine(base,np.float32([[1,0,i*.7],[0,1,0]]),(240,180))
        w.write(cv2.cvtColor(img,cv2.COLOR_GRAY2BGR))
    w.release()
    r=probe_video(p,.2,1.9,sample_hz=12)
    assert r['source_fps']==15.0
    assert 15<=r['compared_pairs']<=22
    assert r['sample_resampling_repeats_avoided']==0
    assert 'action' not in str(r).lower()

def test_missing_media_fails():
    with pytest.raises(FileNotFoundError):probe_video(Path('/no/such/file.mp4'),0,1)

@pytest.mark.parametrize('a,b,hz',[(-1,1,12),(2,1,12),(0,1,0),(0,1,31)])
def test_invalid_args(a,b,hz):
    with pytest.raises((ValueError,FileNotFoundError)):
        probe_video(Path('/missing.mp4'),a,b,sample_hz=hz)

def tiny_fixture():
    work={'schema':'retouche-cinema-p10-private-prioritized-annotation-worklist-v1',
      'initial_pass':[{'video_id':'S001','private_filename':'synthetic1.mp4','start_s':0,'end_s':1,
                       'split':'train','scene_group':1}]}
    probe={'schema':'retouche-cinema-p11-micro-motion-probe-v1',
     'results':[{'video_id':'S001','split':'train','scene_group':1,'status':'measured',
        'face_box_found_approximate':True,'source_fps':30,'compared_pairs':2,
        'observations':[{'t_s':.12,'flow_p90':2,'regions':{'mouth_approx':{'motion_p90_px':.2,'tracks':3}}},
                        {'t_s':.3,'flow_p90':3,'regions':{}}]}]}
    return work,probe

def test_review_queue_remains_unlabeled():
    work,probe=tiny_fixture(); z=make_review_tasks(work,probe)
    assert z['supervised_training_eligible_count']==0
    assert not z['tasks'][0]['eligible_for_training']
    assert z['tasks'][0]['label_smoking']=='UNKNOWN'
    assert len(z['tasks'][0]['motion_review_anchors'])==1

def test_bad_probe_rejected():
    work,probe=tiny_fixture(); probe['results'][0]['video_id']='OTHER'
    with pytest.raises(ValueError):make_review_tasks(work,probe)

def test_bad_window_count_rejected():
    work,probe=tiny_fixture();probe['results']=[]
    with pytest.raises(ValueError):make_review_tasks(work,probe)

def test_scene_split_leak_rejected():
    work,probe=tiny_fixture()
    work['initial_pass'].append({**work['initial_pass'][0],'video_id':'S002','split':'test'})
    probe['results'].append({**probe['results'][0],'video_id':'S002','split':'test'})
    with pytest.raises(ValueError):make_review_tasks(work,probe)

def test_training_missing_adult_or_reviewer_fails():
    r=gate_supervised_example({'record_id':'fictional','source_sha256_verified':True,
        'training_permission_verified':True,'adult_evidence':'unknown','action_confirmed':True,
        'independent_reviewers':['reviewer-1'],'human_adjudication_status':'pending',
        'evidence_locations':[1.2],'split':'train'})
    assert r['metadata_gate']=='blocked'
    assert 'adult_status_unverified' in r['block_reasons']

def test_identical_reviewers_rejected():
    r=gate_supervised_example({'source_sha256_verified':True,'training_permission_verified':True,
        'adult_evidence':'verified_adult','action_confirmed':True,'independent_reviewers':['a','a'],
        'human_adjudication_status':'approved','evidence_locations':[1.3],'split':'train'})
    assert 'two_independent_human_reviewers_required' in r['block_reasons']

def test_metadata_gate_not_identity_proof():
    r=gate_supervised_example({'source_sha256_verified':True,'training_permission_verified':True,
        'adult_evidence':'verified_adult','action_confirmed':True,
        'independent_reviewers':['a','b'],'human_adjudication_status':'approved',
        'evidence_locations':[1.3],'split':'train'})
    assert r['metadata_gate']=='review_ready'
    assert r['human_verified_truth_automatic'] is False
