#!/usr/bin/env python3
"""Creates a 6-second two-clip procedural placeholder with NO video AI or personal media."""
from pathlib import Path
import argparse
import hashlib
import json
import shutil
import subprocess

def sha(path):
 return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def build(folder):
 folder=Path(folder).resolve();folder.mkdir(parents=True,exist_ok=True)
 if not shutil.which('ffmpeg'):raise RuntimeError('ffmpeg missing')
 for index,color in [(1,'0x564e62'),(2,'0x6e766b')]:
  path=folder/f'clip_{index}.mp4'
  subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-nostdin','-f','lavfi','-i',f'color=c={color}:s=480x270:r=24:d=3','-an','-c:v','libx264','-preset','veryfast','-pix_fmt','yuv420p','-y',str(path)],timeout=40,check=True)
 lines="file 'clip_1.mp4'\nfile 'clip_2.mp4'\n"
 (folder/'concat.txt').write_text(lines)
 out=folder/'demo_sans_voix.mp4'
 subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-nostdin','-f','concat','-safe','0','-i',str(folder/'concat.txt'),'-c','copy','-movflags','+faststart','-y',str(out)],timeout=45,check=True)
 proof={'status':'synthetic_demo_not_model_generated','video_model_connected':False,'clips':2,'sha256':sha(out),'media_sent':False,'reference_media_included':False}
 out.with_suffix('.provenance.json').write_text(json.dumps(proof,indent=2))
 return out

if __name__=='__main__':
 ap=argparse.ArgumentParser();ap.add_argument('folder');args=ap.parse_args()
 print(build(args.folder))
