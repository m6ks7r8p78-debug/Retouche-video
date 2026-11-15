from pathlib import Path
import json
import subprocess
import importlib.util
import hashlib
import pytest
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('assembly',ROOT/'gateway'/'assemble_rendered.py')
import sys
sys.path.insert(0,str(ROOT/'gateway'))
mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)

def sample_manifest():
 d=json.loads((ROOT/'sample_manifest_390.json').read_text())
 d['clips']=d['clips'][:2];d['clips'][0]['duration_seconds']=1;d['clips'][1]['duration_seconds']=1;d['clips'][1]['start_seconds']=1;d['total_duration_seconds']=2
 return d

def setup(tmp_path):
 manifest=sample_manifest();src=tmp_path/'manifest.json';src.write_text(json.dumps(manifest))
 records=[]
 for idx,clip in enumerate(manifest['clips']):
  name=clip['clip_id']+'.mp4';path=tmp_path/name
  subprocess.run(['ffmpeg','-loglevel','error','-f','lavfi','-i','color=c='+('blue' if idx==0 else 'yellow')+':s=192x108:r=24:d=1',
                   '-an','-c:v','libx264','-pix_fmt','yuv420p','-y',str(path)],check=True,timeout=20)
  records.append({'clip_id':clip['clip_id'],'status':'completed','file':name,'bytes':path.stat().st_size,'sha256':mod.file_hash(path)})
 report={'video_model_connected':True,'completed':2,'total':2,'media_sent':False,'reference_media_included':False,'results':records}
 rep=tmp_path/'render_report.json';rep.write_text(json.dumps(report));return src,rep,records

def test_assemble_real_synthetic_clips(tmp_path):
 m,r,_=setup(tmp_path);out=tmp_path/'my_movie.mp4';result=mod.assemble(m,r,tmp_path,out)
 assert result['clips']==2 and result['audio']=='removed_intentionally_not_yet_supported'
 assert 1.9 <= mod.probe(out)<=2.1
 assert out.with_suffix('.provenance.json').is_file()
 assert result['sha256']==mod.file_hash(out)

def test_fail_on_missing_clip(tmp_path):
 m,r,x=setup(tmp_path);(tmp_path/x[1]['file']).unlink()
 with pytest.raises(ValueError):mod.assemble(m,r,tmp_path,tmp_path/'out.mp4')

def test_fail_on_hash_mismatch(tmp_path):
 m,r,x=setup(tmp_path);report=json.loads(r.read_text());report['results'][0]['sha256']='f'*64;r.write_text(json.dumps(report))
 with pytest.raises(ValueError,match='SHA-256'):mod.assemble(m,r,tmp_path,tmp_path/'out.mp4')

def test_fail_on_incomplete_report(tmp_path):
 m,r,x=setup(tmp_path);report=json.loads(r.read_text());report['completed']=1;r.write_text(json.dumps(report))
 with pytest.raises(ValueError,match='incomplets'):mod.assemble(m,r,tmp_path,tmp_path/'out.mp4')

