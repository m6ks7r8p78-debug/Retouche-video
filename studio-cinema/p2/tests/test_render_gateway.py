import importlib.util
import json
from pathlib import Path
from unittest.mock import Mock
import pytest

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('gateway', ROOT/'gateway'/'retouche_render_gateway.py')
g=importlib.util.module_from_spec(spec);spec.loader.exec_module(g)

def manifest():
    return {'schema_version':g.SCHEMA,'model_engine':'not_connected','rendered_video':None,'source_mode':'text','format':'16:9','total_duration_seconds':5,
     'consent':{'reference_media_included':False,'remote_transfer_approved':False,'training_allowed':False,'project_rights_confirmed':True},
     'clips':[{'clip_id':'shot_01_part_01','duration_seconds':5,'start_seconds':0,'prompt':'Cinematic story with a character','status':'not_submitted','output':None,'continuity':{'character_ids':['character_01']}}]}

def test_valid_manifest():assert g.validate_manifest(manifest())
@pytest.mark.parametrize('path,value', [('model_engine','comfyui'),('rendered_video','movie.mp4'),('source_mode','invalid'),('format','4:3'),('total_duration_seconds',200)])
def test_invalid_top_level(path,value):
    x=manifest();x[path]=value
    with pytest.raises(g.RenderError):g.validate_manifest(x)
@pytest.mark.parametrize('name', ['remote_transfer_approved','reference_media_included','training_allowed'])
def test_invalid_consent(name):
    x=manifest();x['consent'][name]=True
    with pytest.raises(g.RenderError):g.validate_manifest(x)
@pytest.mark.parametrize('mod', [{'duration_seconds':10},{'start_seconds':2},{'status':'completed'},{'prompt':'x'},{'reference_uri':'file:///secret'}])
def test_invalid_clip(mod):
    x=manifest();x['clips'][0].update(mod)
    with pytest.raises(g.RenderError):g.validate_manifest(x)

def test_duplicate_ids():
    x=manifest();x['clips'].append(dict(x['clips'][0]));x['total_duration_seconds']=10;x['clips'][1]['start_seconds']=5
    with pytest.raises(g.RenderError):g.validate_manifest(x)

def test_url_loopback_by_default():
    assert g.check_server_url('http://127.0.0.1:8188')=='http://127.0.0.1:8188'
    for x in ['https://public.example.com','http://example.org','http://127.0.0.1:8188/a','http://x:y@127.0.0.1:8188']:
        with pytest.raises(g.RenderError):g.check_server_url(x)
    assert g.check_server_url('https://gpu.example.com',allow_remote=True)=='https://gpu.example.com'

def test_make_workflow_does_not_change_original():
    template={'3':{'class_type':'Sampler','inputs':{'seed':1}},'6':{'class_type':'Text','inputs':{'text':'old'}}}
    mapping={'seed_node':'3','seed_input':'seed','prompt_node':'6','prompt_input':'text'}
    x=manifest()['clips'][0];x['seed']=99
    y=g.make_workflow(template,mapping,x)
    assert y['3']['inputs']['seed']==99 and y['6']['inputs']['text']==x['prompt']
    assert template['6']['inputs']['text']=='old'

def test_read_and_validate_workflow(tmp_path):
    w={'3':{'class_type':'Sampler','inputs':{'seed':1}},'6':{'class_type':'Text','inputs':{'text':'old'}}}
    f=tmp_path/'workflow.json';f.write_text(json.dumps(w)); m=g.load_mapping(ROOT/'gateway'/'COMFYUI_MAPPING_EXEMPLE.json')
    assert g.load_workflow(f,m)==w
    w['3']['inputs'].pop('seed');f.write_text(json.dumps(w))
    with pytest.raises(g.RenderError):g.load_workflow(f,m)

def test_mock_comfy_submission_and_history():
    s=Mock();r=Mock();r.json.return_value={'prompt_id':'test-id-123'};s.post.return_value=r
    record={'test-id-123':{'outputs':{'51':{'videos':[{'filename':'demo.mp4','type':'output','subfolder':''}]}}}}; rr=Mock();rr.json.return_value=record;s.get.return_value=rr
    c=g.ComfyClient('http://127.0.0.1:8188',session=s)
    assert c.post_prompt({'3':{'class_type':'Test','inputs':{}}})=='test-id-123'
    assert c.wait_for_video('test-id-123',timeout=1,poll_seconds=0)==record['test-id-123']['outputs']['51']['videos'][0]
    assert s.post.call_args.kwargs['timeout']==60

def test_dont_claim_images_are_videos():
    s=Mock();r=Mock();r.json.return_value={'test-id-123':{'outputs':{'7':{'images':[{'filename':'frame.png'}]}}}};s.get.return_value=r
    with pytest.raises(g.RenderError, match='sans fichier vidéo'):g.ComfyClient('http://localhost:8188',session=s).wait_for_video('test-id-123',timeout=1,poll_seconds=0)

def test_mock_binary_video_saved_with_hash(tmp_path):
    s=Mock();r=Mock();data=b'\x00\x00\x00\x18ftypisom'+b'0'*256;r.iter_content.return_value=[data];s.get.return_value=r
    out=g.ComfyClient('http://localhost:8188',session=s).download_video({'filename':'example.mp4'},tmp_path/'clip.mp4')
    assert (tmp_path/'clip.mp4').read_bytes()==data and len(out['sha256'])==64

def test_reject_traversal_and_fake_video(tmp_path):
    s=Mock();r=Mock();r.iter_content.return_value=[b'<html>fake data</html>'*100];s.get.return_value=r;c=g.ComfyClient('http://localhost:8188',session=s)
    for item in [{'filename':'../../secret.mp4'},{'filename':'story.png'},{'filename':'clip.mp4','subfolder':'../secret'}]:
        with pytest.raises(g.RenderError):c.download_video(item,tmp_path/'x.mp4')
    with pytest.raises(g.RenderError,match='en-tête'):c.download_video({'filename':'story.mp4'},tmp_path/'x.mp4')
    assert not (tmp_path/'x.mp4').exists() and not (tmp_path/'x.mp4.part').exists()

def test_dry_run_makes_no_network(tmp_path,capsys):
    src=tmp_path/'manifest.json';src.write_text(json.dumps(manifest()))
    assert g.main([str(src)])==0
    assert json.loads(capsys.readouterr().out)['network_requests']==0


def test_reject_unknown_media_top_level_and_clip_keys():
    x=manifest();x["media"]={"filename":"private.png"}
    with pytest.raises(g.RenderError):g.validate_manifest(x)
    x=manifest();x["clips"][0]["media"]="data:image/png;base64,abc"
    with pytest.raises(g.RenderError):g.validate_manifest(x)

