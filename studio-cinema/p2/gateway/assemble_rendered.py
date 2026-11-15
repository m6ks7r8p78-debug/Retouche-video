#!/usr/bin/env python3
"""Retouche Cinema P2 — assemble actual rendered clips strictly in manifest order.

Refuses incomplete or incorrect provenance. Deliberately removes sound; dialogue/audio is P3.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import pathlib
import shutil
import subprocess
import tempfile
try:
 from retouche_render_gateway import load_manifest,RenderError,ensure
except ModuleNotFoundError:
 from gateway.retouche_render_gateway import load_manifest,RenderError,ensure

def file_hash(path):
 h=hashlib.sha256()
 with open(path,'rb') as f:
  for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
 return h.hexdigest()

def probe(path):
 r=subprocess.run(['ffprobe','-v','error','-select_streams','v:0','-show_entries','stream=width,height,codec_name','-show_entries','format=duration',
                   '-of','json',str(path)],capture_output=True,text=True,timeout=30,check=True)
 p=json.loads(r.stdout)
 ensure(p.get('streams') and p.get('format',{}).get('duration'), 'Vidéo corrompue ou illisible')
 return float(p['format']['duration'])

def assemble(manifest_path,report_path,clips_dir,output,ffmpeg='ffmpeg'):
 manifest=load_manifest(manifest_path)
 report=json.loads(pathlib.Path(report_path).read_text(encoding='utf-8'))
 ensure(report.get('video_model_connected') is True and report.get('completed')==len(manifest['clips']), 'Rendus incomplets ou moteur absent')
 ensure(report.get('media_sent') is False and report.get('reference_media_included') is False, 'Référence privée inconnue')
 results=report.get('results')
 ensure(isinstance(results,list) and len(results)==len(manifest['clips']),'Le rapport ne couvre pas tous les clips')
 directory=pathlib.Path(clips_dir).resolve();out=pathlib.Path(output).resolve()
 ensure(out.suffix.lower()=='.mp4','Sortie doit être MP4')
 out.parent.mkdir(parents=True,exist_ok=True)
 ensure(shutil.which(ffmpeg),'ffmpeg manquant')
 validated=[]
 for i,(clip,item) in enumerate(zip(manifest['clips'],results)):
  cid=clip['clip_id']
  ensure(item.get('clip_id')==cid and item.get('status')=='completed','Ordre ou statut des clips incorrect')
  suffix=pathlib.Path(item.get('file','')).suffix.lower()
  ensure(suffix in ('.mp4','.webm','.gif'),'Format de clip inconnu')
  # Ignore filenames from report; only canonical clip ID + extension is allowed.
  ensure(item['file']==cid+suffix,'Fichier de clip non canonique')
  path=(directory/item['file']).resolve()
  ensure(path.parent==directory and path.is_file(),'Clip manquant ou hors du coffre')
  ensure(path.stat().st_size==item.get('bytes'),'Taille du clip modifiée')
  ensure(file_hash(path)==item.get('sha256'),'Empreinte SHA-256 incorrecte')
  d=probe(path)
  ensure(abs(d-clip['duration_seconds'])<=0.45, f'Durée rendue incohérente pour {cid}: {d:.2f}s versus {clip["duration_seconds"]}s')
  validated.append((path,clip['duration_seconds'],cid))
 width,height=(540,960) if manifest['format']=='9:16' else (960,540)
 with tempfile.TemporaryDirectory(prefix='retouche_cinema_montage_') as td:
  td=pathlib.Path(td);texts=[]
  for idx,(path,dur,cid) in enumerate(validated):
   intermediate=td/f'clip_{idx:04d}.mp4'
   filter_v=f'scale={width}:{height}:force_original_aspect_ratio=decrease,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:black,fps=24,format=yuv420p'
   cmd=[ffmpeg,'-hide_banner','-loglevel','error','-nostdin','-i',str(path),'-vf',filter_v,'-an','-t',str(dur),'-c:v','libx264','-preset','veryfast','-crf','22','-movflags','+faststart','-y',str(intermediate)]
   subprocess.run(cmd,timeout=180,check=True)
   texts.append(f"file 'clip_{idx:04d}.mp4'")
  listfile=td/'concat.txt';listfile.write_text('\n'.join(texts)+'\n')
  tmpout=td/'finished_movie.mp4'
  subprocess.run([ffmpeg,'-hide_banner','-loglevel','error','-nostdin','-f','concat','-safe','0','-i',str(listfile),'-c','copy','-movflags','+faststart','-y',str(tmpout)],timeout=180,check=True)
  actual=probe(tmpout)
  ensure(abs(actual-manifest['total_duration_seconds'])<=1.0,'Durée finale incohérente')
  shutil.copy2(tmpout,out)
 result={'product':'Retouche Cinema P2', 'status':'montage_video_reel_de_clips_externes',
   'video_model_connected':True,'output':out.name,'sha256':file_hash(out),'duration_seconds_measured':actual,
   'clips':len(validated),'audio':'removed_intentionally_not_yet_supported','provenance':'text_prompt_only','file_bytes':out.stat().st_size}
 report_output=out.with_suffix('.provenance.json');report_output.write_text(json.dumps(result,indent=2,ensure_ascii=False))
 return result

def main():
 p=argparse.ArgumentParser();p.add_argument('manifest');p.add_argument('report');p.add_argument('clips_dir');p.add_argument('output')
 args=p.parse_args()
 print(json.dumps(assemble(args.manifest,args.report,args.clips_dir,args.output),ensure_ascii=False,indent=2))
if __name__=='__main__':main()

