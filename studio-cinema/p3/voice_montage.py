#!/usr/bin/env python3
"""Retouche Cinema P3 — offline synthetic French voice + captions on P2-rendered movie.

No cloud processing, no voice cloning, no pretrained photorealistic video generation.
CLI is dry-run unless the operator supplies --execute.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import wave

import numpy as np

GATEWAY = Path(__file__).resolve().parents[1] / 'p2' / 'gateway'
sys.path.insert(0, str(GATEWAY))
from retouche_render_gateway import load_manifest, ensure, RenderError

SCHEMA = 'cinema-p3-dialogue-v01'
RATE = 44100

def sha256(path):
 h=hashlib.sha256()
 with open(path,'rb') as f:
  for block in iter(lambda:f.read(1024*1024),b''):h.update(block)
 return h.hexdigest()

def validate_plan(plan,manifest):
 ensure(type(plan) is dict and set(plan) == {'schema_version','project_kind','video_manifest_schema','total_duration_seconds','format','source_mode','voice_engine','rendered_audio','consent','shots','lines'},'Champs dialogue inconnus')
 ensure(plan['schema_version']==SCHEMA and plan['project_kind']=='dialogue_timing_only','Schéma dialogue invalide')
 ensure(plan['video_manifest_schema']==manifest['schema_version'],'Schéma vidéo non cohérent')
 ensure(plan['total_duration_seconds']==manifest['total_duration_seconds'] and plan['format']==manifest['format'] and plan['source_mode']==manifest['source_mode'],'Durée, format ou provenance modifié')
 ensure(plan['voice_engine']=='offline_not_connected' and plan['rendered_audio'] is None,'Faux statut de voix rendue')
 ensure(plan['consent']=={'reference_media_included':False,'voice_cloning_allowed':False,'remote_transfer_approved':False,'training_allowed':False},'Consentement invalide')
 shots=plan['shots'];ensure(type(shots) is list and len(shots)==len(manifest['shots']),'Plans manquants')
 at=0; ids=set();by_id={}
 for i,(s,m) in enumerate(zip(shots,manifest['shots'])):
  ensure(type(s) is dict and set(s)=={'shot_id','start_seconds','duration_seconds','character_ids'},'Structure de plan inconnue')
  ensure(s['shot_id']==m['id'] and s['start_seconds']==at and s['duration_seconds']==m['duration_seconds'] and s['character_ids']==m['character_ids'],'Plan ou distribution falsifiés')
  ensure(s['shot_id'] not in ids,'Plan dupliqué');ids.add(s['shot_id']);by_id[s['shot_id']]=s;at+=s['duration_seconds']
 ensure(at==manifest['total_duration_seconds'],'Durée hors limites')
 lines=plan['lines'];ensure(type(lines) is list and len(lines)<=len(shots),'Trop de répliques')
 observed=set()
 for ln in lines:
  ensure(type(ln) is dict and set(ln)=={'line_id','shot_id','speaker_id','start_seconds','end_seconds','text','voice','status'},'Champ ligne inconnu')
  sid=ln['shot_id'];s=by_id.get(sid)
  ensure(s is not None and ln['line_id']=='line_'+sid and sid not in observed,'Ligne ou plan dupliqué');observed.add(sid)
  ensure(ln['speaker_id'] in s['character_ids'],'Identité de locuteur inconnue')
  ensure(type(ln['start_seconds']) in (int,float) and type(ln['end_seconds']) in (int,float),'Horodatage invalide')
  ensure(s['start_seconds']<=ln['start_seconds']<ln['end_seconds']<=s['start_seconds']+s['duration_seconds'],'Dialogue hors du plan')
  ensure(type(ln['text']) is str and 1<=len(ln['text'].strip())<=280 and len(ln['text'])<=280 and not re.search(r'[\x00-\x08\x0b-\x1f]',ln['text']),'Texte de réplique invalide')
  ensure(ln['voice']=='fr' and ln['status']=='not_generated','Voix ou état de rendu inconnu')
 return True

def srt_stamp(seconds):
 milli=round(seconds*1000)
 h,milli=divmod(milli,3600000);m,milli=divmod(milli,60000);s,milli=divmod(milli,1000)
 return f'{h:02d}:{m:02d}:{s:02d},{milli:03d}'

def write_srt(lines,out):
 segments=[]
 for i,ln in enumerate(lines,1):
  # Plain text SRT. No HTML/XML interpretation.
  line=ln['text'].replace('\r',' ').replace('\n',' ').replace('<','‹').replace('>','›')
  segments.append(f"{i}\n{srt_stamp(ln['start_seconds'])} --> {srt_stamp(ln['end_seconds'])}\n{line}\n")
 out.write_text('\n'.join(segments),encoding='utf-8')

def audio_array(path):
 with wave.open(str(path),'rb') as r:
  assert r.getframerate()==RATE and r.getnchannels()==1 and r.getsampwidth()==2
  return np.frombuffer(r.readframes(r.getnframes()),dtype='<i2').astype(np.float64)/32768.0

def synthesize(plan,dirpath,espeak='espeak',ffmpeg='ffmpeg'):
 ensure(shutil.which(espeak) and shutil.which(ffmpeg),'espeak et ffmpeg nécessaires')
 total=plan['total_duration_seconds'];samples=np.zeros(round(total*RATE),dtype=np.float64)
 meta=[]
 for i,ln in enumerate(plan['lines']):
  raw=dirpath/f'line_{i:03d}_raw.wav';norm=dirpath/f'line_{i:03d}_44k.wav'
  subprocess.run([espeak,'-v','fr','-s','175','-a','130','-w',str(raw),ln['text']],check=True,timeout=30,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
  subprocess.run([ffmpeg,'-hide_banner','-loglevel','error','-nostdin','-i',str(raw),'-ar',str(RATE),'-ac','1','-c:a','pcm_s16le','-y',str(norm)],check=True,timeout=30)
  arr=audio_array(norm);pos=round(ln['start_seconds']*RATE)
  # Never silently chop phonemes at the end of the shot; reject and let operator fix.
  maxsamples=round((ln['end_seconds']-ln['start_seconds'])*RATE)
  if len(arr)>maxsamples:
   raise RenderError(f"Voix trop longue pour {ln['shot_id']} : {len(arr)/RATE:.2f} s pour {maxsamples/RATE:.2f} s. Raccourcir le texte ou allonger le plan.")
  ensure(pos+len(arr)<=len(samples),'Audio dépassant le film')
  samples[pos:pos+len(arr)]+=arr*.8
  meta.append({'line_id':ln['line_id'],'spoken_seconds':round(len(arr)/RATE,3),'start_seconds':ln['start_seconds']})
 peak=max(1.0,np.max(np.abs(samples))/.95)
 samples=(samples/peak*32767).clip(-32768,32767).astype('<i2')
 out=dirpath/'voices_final.wav'
 with wave.open(str(out),'wb') as w:
  w.setnchannels(1);w.setsampwidth(2);w.setframerate(RATE);w.writeframes(samples.tobytes())
 return out,meta

def check_video(movie,manifest):
 movie=Path(movie).resolve()
 ensure(movie.is_file() and movie.suffix.lower()=='.mp4','Film MP4 manquant')
 proof=movie.with_suffix('.provenance.json')
 ensure(proof.is_file(),'Rapport de montage P2 manquant')
 report=json.loads(proof.read_text(encoding='utf-8'))
 ensure(report.get('sha256')==sha256(movie),'Empreinte film P2 incorrecte')
 ensure(report.get('clips')==len(manifest['clips']) and ((report.get('status')=='montage_video_reel_de_clips_externes' and report.get('video_model_connected') is True) or (report.get('status')=='synthetic_demo_not_model_generated' and report.get('video_model_connected') is False)), 'Rapport de montage incompatible')
 r=subprocess.run(['ffprobe','-v','error','-show_entries','format=duration','-of','json',str(movie)],capture_output=True,text=True,check=True,timeout=30)
 duration=float(json.loads(r.stdout)['format']['duration'])
 ensure(abs(duration-manifest['total_duration_seconds'])<=.55,'Durée film incohérente')
 return movie

def render(manifest_path,plan_path,movie,out):
 manifest=load_manifest(manifest_path)
 plan=json.loads(Path(plan_path).read_text(encoding='utf-8'))
 validate_plan(plan,manifest)
 film=check_video(movie,manifest)
 out=Path(out).resolve();ensure(out.suffix.lower()=='.mp4','Sortie MP4 requise')
 ensure(out!=film,'Interdiction d’écraser le film source')
 ensure(out!=Path(manifest_path).resolve() and out!=Path(plan_path).resolve(),'Sortie interdit')
 out.parent.mkdir(parents=True,exist_ok=True)
 with tempfile.TemporaryDirectory(prefix='cinema_p3_') as d:
  td=Path(d);wav,voice_meta=synthesize(plan,td)
  target=td/'movie_with_voice.mp4'
  subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-nostdin','-i',str(film),'-i',str(wav),'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','128k','-t',str(manifest['total_duration_seconds']),'-movflags','+faststart','-y',str(target)],check=True,timeout=120)
  check=subprocess.run(['ffprobe','-v','error','-show_entries','stream=codec_type,codec_name','-of','json',str(target)],capture_output=True,text=True,check=True,timeout=30)
  streams=json.loads(check.stdout)['streams'];ensure(any(s['codec_type']=='audio' for s in streams) and any(s['codec_type']=='video' for s in streams),'Export audio ou vidéo manquant')
  target.replace(out)
 srt=out.with_suffix('.srt');write_srt(plan['lines'],srt)
 proof={'product':'Retouche Cinema P3','status':'offline_tts_and_audio_mux_completed','audio_engine':'espeak_fr_synthetic_voice','is_video_ai_generated_by_p3':False,'input_video_ai_model_connected':json.loads(film.with_suffix('.provenance.json').read_text()).get('video_model_connected') is True,'original_video_sha256':sha256(film),'output':out.name,'sha256':sha256(out),'srt_file':srt.name,'srt_sha256':sha256(srt),'lines':voice_meta,'media_uploaded':False,'voice_cloned':False,'training_performed':False,'duration_seconds_expected':manifest['total_duration_seconds']}
 out.with_suffix('.provenance.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2),encoding='utf-8')
 return proof

def main(argv=None):
 p=argparse.ArgumentParser(description='P3 : ajoute une voix synthétique française au film MP4 P2, uniquement en local.')
 p.add_argument('manifest');p.add_argument('dialogues');p.add_argument('movie');p.add_argument('output')
 p.add_argument('--execute',action='store_true',help='Activer explicitement le rendu audio et le montage local')
 a=p.parse_args(argv)
 m=load_manifest(a.manifest);d=json.loads(Path(a.dialogues).read_text(encoding='utf-8'));validate_plan(d,m)
 if not a.execute:
  print(json.dumps({'valid':True,'lines':len(d['lines']),'duration_seconds':d['total_duration_seconds'],'audio_generated':False,'network_requests':0},ensure_ascii=False));return 0
 print(json.dumps(render(a.manifest,a.dialogues,a.movie,a.output),ensure_ascii=False,indent=2));return 0
if __name__=='__main__':raise SystemExit(main())
