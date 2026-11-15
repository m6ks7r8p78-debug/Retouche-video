import copy
import hashlib
import json
import sys
from pathlib import Path
import cv2
import numpy as np
import pytest

DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(DIR))
import continuity_gate as c

DEMO=Path(__file__).resolve().parents[3]/'demo'

@pytest.fixture()
def env(tmp_path):
    manifest=json.loads((DEMO/'manifest_p2.json').read_text())
    clips=tmp_path/'clips';clips.mkdir()
    # All pixels entirely synthetic: same stylized fictional actor, alternate costume.
    def write(cid,color):
        path=clips/(cid+'.mp4')
        wr=cv2.VideoWriter(str(path),cv2.VideoWriter_fourcc(*'mp4v'),12,(320,180))
        assert wr.isOpened()
        for i in range(36):
            f=np.full((180,320,3),(32,38,42),dtype=np.uint8)
            # Synthetic figure region used by the manually supplied ROI.
            cv2.rectangle(f,(112,42),(208,151),color,-1)
            cv2.circle(f,(160,55),14,(182,186,190),-1)
            wr.write(f)
        wr.release()
        return path
    a,b=[z['clip_id'] for z in manifest['clips']]
    r1=write(a,(40,40,215));r2=write(b,(40,40,215))
    ev={'schema_version':'cinema-p4-evidence-v01','media_transfer_approved':False,
        'clip_sha256':{a:c.sha256_file(r1),b:c.sha256_file(r2)},
        'checks':[{'check_id':'one','from_clip':a,'to_clip':b,'entity_id':'character_01',
                   'transition':'continuous','regions':{'before':[.33,.2,.34,.7],'after':[.33,.2,.34,.7]}}]}
    return manifest,ev,clips,write

def test_compatible_but_never_identity_proven(env):
    m,e,d,_=env;out=c.assess(m,e,d)
    assert out['counts']['compatible_unverified']==1
    assert out['identity_proven'] is False and out['automatically_approved'] is False
    assert out['frames_saved'] is False and out['samples_original_pixels_exported'] is False

def test_blue_red_costume_shift_flagged(env):
    m,e,d,write=env;b=m['clips'][1]['clip_id'];p=write(b,(220,50,40));e['clip_sha256'][b]=c.sha256_file(p)
    out=c.assess(m,e,d)
    assert out['counts']['flagged']==1
    assert out['checks'][0]['metrics']['hsv_bhattacharyya']>.55

def test_sha_mismatch_rejected(env):
    m,e,d,write=env;b=m['clips'][1]['clip_id'];write(b,(10,10,10))
    with pytest.raises(c.ContinuityError,match='altérée'):c.assess(m,e,d)

def test_annotation_absent_abstains(env):
    m,e,d,_=env;e['checks'][0].pop('regions')
    assert c.assess(m,e,d)['counts']['needs_review']==1

def test_cut_requires_review_even_with_perfect_match(env):
    m,e,d,_=env;e['checks'][0]['transition']='cut'
    assert c.assess(m,e,d)['counts']['needs_review']==1

def test_no_unreferenced_character(env):
    m,e,d,_=env;e['checks'][0]['entity_id']='ghost'
    with pytest.raises(c.ContinuityError,match='absent'):c.assess(m,e,d)

def test_unsafe_clip_id_rejected(env):
    m,e,d,_=env;m['clips'][0]['clip_id']='../secret'
    with pytest.raises(c.ContinuityError,match='sûr'):c.assess(m,e,d)

def test_duplicate_check_id_rejected(env):
    m,e,d,_=env;e['checks'].append(copy.deepcopy(e['checks'][0]))
    with pytest.raises(c.ContinuityError,match='observation'):c.assess(m,e,d)

def test_invalid_bbox_rejected(env):
    m,e,d,_=env;e['checks'][0]['regions']['after']=[.9,.9,.9,.9]
    with pytest.raises(c.ContinuityError,match='hors image'):c.assess(m,e,d)

def test_mismatched_ids_rejected(env):
    m,e,d,_=env;e['checks'][0]['to_clip']=e['checks'][0]['from_clip']
    with pytest.raises(c.ContinuityError,match='consécutifs'):c.assess(m,e,d)

def test_video_missing_detected(env):
    m,e,d,_=env;(d/(m['clips'][0]['clip_id']+'.mp4')).unlink()
    with pytest.raises(c.ContinuityError,match='manquante'):c.assess(m,e,d)

def test_wrong_media_consent_detected(env):
    m,e,d,_=env;e['media_transfer_approved']=True
    with pytest.raises(c.ContinuityError,match='distant'):c.assess(m,e,d)

def test_private_reference_in_manifest_rejected(env):
    m,e,d,_=env;m['consent']['reference_media_included']=True
    with pytest.raises(c.ContinuityError,match='privées'):c.assess(m,e,d)

def test_missing_hash_for_visual_measure_rejected(env):
    m,e,d,_=env;e['clip_sha256'].clear()
    with pytest.raises(c.ContinuityError,match='Empreinte'):c.assess(m,e,d)

def test_empty_reviews_still_no_pass(env):
    m,e,d,_=env;e['checks']=[]
    out=c.assess(m,e,d);assert out['checks']==[] and not out['automatically_approved']

def test_json_report_no_paths_pixels_or_filenames(env):
    m,e,d,_=env;out=c.assess(m,e,d);txt=json.dumps(out)
    assert str(d) not in txt and '.mp4' not in txt and 'data:image' not in txt

def test_feature_similarity_identical_image():
    a=np.full((96,96,3),(40,90,240),dtype=np.uint8)
    assert c.visual_distance(a,a)=={'hsv_bhattacharyya':0.0,'dhash_difference':0.0}

def test_appearance_similar_must_not_be_treated_as_identity(env):
    # Two different subjects in a synthetic example may wear the same outfit.
    # A low histogram distance cannot certify the subject is the same person.
    m,e,d,_=env
    assert c.assess(m,e,d)['checks'][0]['identity_proven'] is False
