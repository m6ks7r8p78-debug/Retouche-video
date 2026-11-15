import sys,json, pathlib, base64
import cv2
import numpy as np
import pytest
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
import p13_face_eye_detector as p
FIXTURE=ROOT/'examples'/'fictional_adult_frame.jpg'

def load_fiction():
    if FIXTURE.is_file():return cv2.imread(str(FIXTURE))
    raw=base64.b64decode((ROOT/'examples'/'fictional_adult_frame.jpg.base64').read_text())
    return cv2.imdecode(np.frombuffer(raw,dtype=np.uint8),cv2.IMREAD_COLOR)

def test_cascades_present():
    a,b=p.detector_paths();assert a.is_file() and b.is_file()
    a,b=p.load_detectors();assert not a.empty() and not b.empty()

def test_fictional_face_actually_detected():
    frame=load_fiction();ans=p.detect_face_eye_rois(frame)
    assert ans is not None
    assert ans['candidate_detector']=='opencv_haar_cpu'
    assert ans['lips_detected'] is False
    assert ans['face_identity_proven'] is False
    assert 0 <= ans['face_box'][0] <=1

def test_eyes_are_independent_candidates():
    ans=p.detect_face_eye_rois(load_fiction())
    assert 0<=len(ans['eye_candidate_boxes'])<=2
    assert ans['smoking_or_breath_detected'] is False

def test_blank_no_false_face():
    assert p.detect_face_eye_rois(np.zeros((240,320,3),dtype=np.uint8)) is None

def test_geometry_normalized():
    assert p.normalize_box((10,10,30,40),200,100)==[.05,.1,.15,.4]

def test_geometry_bad_rejected():
    with pytest.raises(ValueError):p.normalize_box((-1,2,30,30),100,100)
    with pytest.raises(ValueError):p.normalize_box((20,20,90,30),100,100)

def test_bad_image_rejected():
    with pytest.raises(ValueError):p.detect_face_eye_rois(np.zeros((240,320),dtype=np.uint8))

def test_invalid_window_rejected():
    with pytest.raises(ValueError):p.probe_window_ffmpeg(FIXTURE,-3,2)

def test_video_scan_with_actual_fake_media(tmp_path):
    img=load_fiction()
    pth=tmp_path/'fiction.avi';out=cv2.VideoWriter(str(pth),cv2.VideoWriter_fourcc(*'MJPG'),10,(img.shape[1],img.shape[0]))
    assert out.isOpened()
    for _ in range(20):out.write(img)
    out.release()
    r=p.probe_window_ffmpeg(pth,0,1.5,4,p.load_detectors())
    assert 4<=r['sampled_original_decoded_frames']<=8
    assert r['face_candidate_frames']>0
    assert r['frame_times_are_nominal_approx'] is True
    assert all(o['source_frame_index'] is None for o in r['observations'])

def test_task_must_be_private_60_schema():
    with pytest.raises(ValueError):p.validate_private_tasks({'schema':'wrong','tasks':[]})

def test_private_path_traversal_rejected(tmp_path):
    tasks={'schema':'retouche-cinema-p11-private-review-tasks-v1','tasks':[]}
    for i in range(60):tasks['tasks'].append({'video_id':str(i),'private_filename':'../bad.mov','split':('train','validation','test')[i%3],'scene_group':i,'start_s':0,'end_s':3})
    file=tmp_path/'task.json';file.write_text(json.dumps(tasks))
    with pytest.raises(ValueError):p.audit(file,tmp_path,tmp_path/'out.json',limit=1)

def test_no_identity_or_anatomical_claims(tmp_path):
    img=load_fiction();a=p.detect_face_eye_rois(img)
    assert a['lips_detected'] is False
    assert a['hands_detected'] is False
    assert a['smoking_or_breath_detected'] is False

