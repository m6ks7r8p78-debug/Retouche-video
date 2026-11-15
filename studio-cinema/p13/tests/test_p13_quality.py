import sys,pathlib,json
import pytest
ROOT=pathlib.Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from p13_quality import iou,summarize

def test_identical_boxes():assert abs(iou([.1,.1,.2,.2],[.1,.1,.2,.2])-1)<1e-12

def test_partial_overlap():
 v=iou([0,0,.5,.5],[.25,.25,.5,.5]);assert abs(v-1/7)<1e-8

def test_no_overlap():assert iou([0,0,.1,.1],[.8,.8,.1,.1])==0

def test_missing_box_is_unavailable():assert iou(None,[.2,.2,.1,.1]) is None

def test_quality_summary_no_anatomical_claim():
 a={'schema':'retouche-cinema-p13-cascade-roi-v1','results':[
 {'video_id':'fiction','face_candidate_frames':2,'observations':[{'face_candidate':{'face_box':[.1,.1,.2,.2]}},{'face_candidate':{'face_box':[.1,.1,.2,.2]}}]}]}
 r=summarize(a);assert r['median_candidate_box_iou']==1;assert not r['real_landmark_accuracy_evaluated'];assert not r['face_detector_precision_evaluated'];assert r['face_majority_passages']==1

def test_quality_summary_no_confidence_hallucinations():
 a={'schema':'retouche-cinema-p13-cascade-roi-v1','results':[
 {'video_id':'fiction','face_candidate_frames':0,'observations':[{'face_candidate':None}]}]}
 r=summarize(a);assert r['median_candidate_box_iou'] is None;assert r['low_face_coverage_passages']==1

def test_bad_schema_rejected():
 with pytest.raises(ValueError):summarize({'schema':'wrong','results':[1]})

