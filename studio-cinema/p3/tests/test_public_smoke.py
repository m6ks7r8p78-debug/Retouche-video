"""Public P3 tests: no personal video and no network."""
from pathlib import Path
import importlib.util
import json
import sys
import pytest

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'p3'))
import voice_montage as p3
EXAMPLES=ROOT/'p3'/'examples'

def fixture():
 return json.loads((EXAMPLES/'demo_manifest_p2.json').read_text()),json.loads((EXAMPLES/'demo_dialogue_p3.json').read_text())

def test_manifest_and_dialogue_valid():
 m,d=fixture()
 assert p3.validate_plan(d,p3.load_manifest(EXAMPLES/'demo_manifest_p2.json'))

def test_unknown_person_not_allowed():
 m,d=fixture();d['lines'][0]['speaker_id']='character_99'
 with pytest.raises(p3.RenderError):p3.validate_plan(d,m)

def test_fake_consent_not_allowed():
 m,d=fixture();d['consent']['voice_cloning_allowed']=True
 with pytest.raises(p3.RenderError):p3.validate_plan(d,m)

def test_forged_audio_not_allowed():
 m,d=fixture();d['rendered_audio']='fake.wav'
 with pytest.raises(p3.RenderError):p3.validate_plan(d,m)

def test_srt_has_timing(tmp_path):
 _,d=fixture();out=tmp_path/'captions.srt';p3.write_srt(d['lines'],out)
 assert '00:00:00,300' in out.read_text() and 'Allô.' in out.read_text()

def test_full_offline_voice_video(tmp_path):
 spec=importlib.util.spec_from_file_location('render_demo_video',EXAMPLES/'render_demo_video.py')
 module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
 movie=module.build(tmp_path)
 out=tmp_path/'film_voix.mp4'
 result=p3.render(EXAMPLES/'demo_manifest_p2.json',EXAMPLES/'demo_dialogue_p3.json',movie,out)
 assert result['media_uploaded'] is False and result['voice_cloned'] is False
 assert result['input_video_ai_model_connected'] is False
 assert result['sha256']==p3.sha256(out)
 assert out.with_suffix('.srt').exists()
