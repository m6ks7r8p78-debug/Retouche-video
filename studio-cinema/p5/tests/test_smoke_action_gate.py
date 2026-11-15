import copy, hashlib, json, pathlib, sys
import pytest
sys.path.insert(0, str(pathlib.Path(__file__).parents[1]))
from smoke_action_gate import (GateError, evaluate_annotation, audit_private_sources,
                               write_privacy_safe_json)

EX = pathlib.Path(__file__).parents[1] / 'examples' / 'synthetic_annotations.json'


def example():
    return json.loads(EX.read_text(encoding='utf-8'))


def test_valid():
    r = evaluate_annotation(example())
    assert r['status'] == 'candidate_only' and r['identity_verified'] is False

@pytest.mark.parametrize('flag', ['adult_verified','rights_verified','nonsexual_scene_verified','local_training_authorized'])
def test_missing_eligibility(flag):
    x=example(); x['eligibility'][flag]=False
    assert evaluate_annotation(x)['status']=='rejected'

def test_smoke_missing():
    x=example();x['frames'][-1]['smoke_center']=None
    assert 'smoke_visibility_unconfirmed' in evaluate_annotation(x)['reasons']

def test_wrong_lip_contact():
    x=example(); x['frames'][2]['cigarette_tip']=[0.1,0.1]
    assert 'lip_contact_mismatch' in evaluate_annotation(x)['reasons']

def test_cigarette_changes_id():
    x=example();x['frames'][3]['cigarette_id']='second'
    assert 'entity_id_changes' in evaluate_annotation(x)['reasons']

def test_wrong_order():
    x=example();x['frames'][1]['phase']='exhale'
    assert 'phase_order_regression' in evaluate_annotation(x)['reasons']

def test_time_must_increase():
    x=example();x['frames'][1]['t']=0.0
    with pytest.raises(GateError): evaluate_annotation(x)

def test_invalid_coord():
    x=example();x['frames'][1]['mouth']=[1.2,0.5]
    with pytest.raises(GateError): evaluate_annotation(x)

def test_invalid_subject():
    x=example();x['subject_id']=''
    with pytest.raises(GateError): evaluate_annotation(x)

def test_missing_phase():
    x=example();x['frames'][3]['phase']='lip_contact'
    assert 'missing_phase_inhale' in evaluate_annotation(x)['reasons']

def test_invalid_schema():
    x=example();x['schema']='evil'
    with pytest.raises(GateError): evaluate_annotation(x)

def test_source_audit(tmp_path):
    src=tmp_path/'clip.mp4';src.write_bytes(b'fictional')
    rec={'id':'V001','path':str(src),'expected_sha256':hashlib.sha256(b'fictional').hexdigest(),
         'group':'a','split':'train','adult_verified':False, 'training_authorized':True}
    result=audit_private_sources([rec])
    assert result['sources_verified']==1 and result['eligible_for_action_training']==0
    assert 'path' not in result['sources'][0]

def test_hash_mismatch(tmp_path):
    f=tmp_path/'s';f.write_bytes(b'data')
    r={'id':'V001','path':str(f),'expected_sha256':'0'*64,'group':'a','split':'train'}
    with pytest.raises(GateError): audit_private_sources([r])

def test_group_leak(tmp_path):
    a=tmp_path/'a';a.write_bytes(b'one');b=tmp_path/'b';b.write_bytes(b'two')
    rows=[{'id':v,'path':str(p),'expected_sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'group':'same','split':s}
          for v,p,s in [('V001',a,'train'),('V002',b,'validation')]]
    with pytest.raises(GateError): audit_private_sources(rows)

def test_privacy_serializer(tmp_path):
    with pytest.raises(GateError):write_privacy_safe_json({'filename':'private.mp4'},tmp_path/'bad.json')
    write_privacy_safe_json({'okay':True},tmp_path/'good.json')
    assert json.loads((tmp_path/'good.json').read_text())['okay']
