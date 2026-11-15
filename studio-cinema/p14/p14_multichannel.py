"""RetoucheCinema P14 - region-relative motion and audio cues on permitted videos.

No automatic lip, hand, breathing or gesture labels. P13 face boxes are
candidates, not landmarks. This module does not save video frames or audio.
"""
from __future__ import annotations
import argparse
import json
import math
import subprocess
from pathlib import Path
import cv2
import numpy as np

SCHEMA = 'retouche-cinema-p14-visual-audio-candidates-v1'
CROP_SIZE = 320
REGIONS = ('mouth_approx', 'cheek_left_approx', 'cheek_right_approx', 'eyes_approx', 'face_approx')


def normalize_patch(frame: np.ndarray, box: list[float], out=(40, 32)) -> np.ndarray | None:
    if len(box) != 4 or not all(np.isfinite(box)):
        raise ValueError('Invalid ROI')
    x, y, w, h = box
    if min(w,h) <= 0 or x < 0 or y < 0 or x+w > 1.00001 or y+h > 1.00001:
        raise ValueError('ROI outside image')
    H,W=frame.shape[:2]
    a,b=max(0,round(x*W)),max(0,round(y*H))
    c,d=min(W,round((x+w)*W)),min(H,round((y+h)*H))
    if c-a < 6 or d-b < 6:
        return None
    roi=frame[b:d,a:c]
    gray=cv2.cvtColor(roi,cv2.COLOR_BGR2GRAY) if roi.ndim==3 else roi
    return cv2.resize(gray,out,interpolation=cv2.INTER_AREA).astype(np.float32)


def region_boxes(facebox: list[float]) -> dict[str,list[float]]:
    """ONLY coarse face-relative hypotheses, never anatomical landmarks."""
    x,y,w,h=facebox
    if min(w,h)<.06 or x<0 or y<0 or x+w>1.00001 or y+h>1.00001:
        raise ValueError('Bad face candidate')
    b={
      'mouth_approx':(.19,.62,.62,.24),
      'cheek_left_approx':(.05,.48,.27,.22),
      'cheek_right_approx':(.68,.48,.27,.22),
      'eyes_approx':(.13,.25,.74,.24),
      'face_approx':(.1,.14,.8,.75)
    }
    return {k:[x+fx*w,y+fy*h,fw*w,fh*h] for k,(fx,fy,fw,fh) in b.items()}


def normalized_change(before: np.ndarray | None, after: np.ndarray | None) -> float | None:
    """Brightness-centered mean absolute difference in [0,1], not motion direction."""
    if before is None or after is None:return None
    if before.shape!=after.shape:raise ValueError('Mismatched patch shape')
    a=before.astype(np.float32);b=after.astype(np.float32)
    a-=np.median(a);b-=np.median(b)
    return round(float(np.mean(np.abs(a-b))/255),6)


def nearest_face(t_s:float, p13_obs:list[dict], max_lag_s:float=.125)->list[float]|None:
    valid=[(abs(o['t_s_approx']-t_s),o) for o in p13_obs if o.get('face_candidate') is not None]
    if not valid:return None
    lag,o=min(valid,key=lambda v:v[0])
    if lag>max_lag_s:return None
    return o['face_candidate']['face_box']


def decode_window(video:Path,start:float,end:float,hz:int=12,max_frames:int=150) -> np.ndarray:
    if not (0<=start<end and end-start<=12 and 1<=hz<=30):raise ValueError('Invalid window')
    vf=f'fps={hz},scale={CROP_SIZE}:{CROP_SIZE}:force_original_aspect_ratio=decrease,pad={CROP_SIZE}:{CROP_SIZE}:(ow-iw)/2:(oh-ih)/2'
    cmd=['ffmpeg','-nostdin','-v','error','-ss',str(start),'-i',str(video),'-t',str(end-start),'-vf',vf,'-an','-f','rawvideo','-pix_fmt','bgr24','pipe:1']
    p=subprocess.run(cmd,capture_output=True,timeout=40)
    if p.returncode:raise RuntimeError('Video decode failed')
    size=CROP_SIZE*CROP_SIZE*3
    if len(p.stdout)%size:raise RuntimeError('Malformed decoded frames')
    n=len(p.stdout)//size
    if n<=1 or n>max_frames:raise RuntimeError('Unexpected frame count')
    return np.frombuffer(p.stdout,dtype=np.uint8).reshape(n,CROP_SIZE,CROP_SIZE,3)


def audio_rms(video:Path,start:float,end:float,hz:int=10,sr:int=8000)->dict:
    cmd=['ffmpeg','-nostdin','-v','error','-ss',str(start),'-i',str(video),'-t',str(end-start),'-vn','-ac','1','-ar',str(sr),'-f','s16le','pipe:1']
    p=subprocess.run(cmd,capture_output=True,timeout=25)
    if p.returncode or not p.stdout:
        return {'audio_available':False,'rms':[],'audio_is_breath_classified':False}
    samples=np.frombuffer(p.stdout,dtype='<i2').astype(np.float32)/32768.
    width=sr//hz
    vals=[round(float(np.sqrt(np.mean(samples[i:i+width]**2))),6) for i in range(0,len(samples)-width+1,width)]
    return {'audio_available':True,'rms':vals,'audio_is_breath_classified':False}



def grid_residual_flow(before: np.ndarray, after: np.ndarray) -> dict:
    """Optical flow for the ENTIRE frame, not a hand/body detector.

    Motion is compensated by the spatial median to reduce camera translation.
    All nine grid cells are source-frame evidence, not anatomical labels.
    """
    def downsample(frame):
        gray=cv2.cvtColor(frame,cv2.COLOR_BGR2GRAY) if frame.ndim==3 else frame
        return cv2.resize(gray,(96,96),interpolation=cv2.INTER_AREA)
    a,b=downsample(before),downsample(after)
    flow=cv2.calcOpticalFlowFarneback(a,b,None,.5,2,13,2,5,1.1,0)
    translation=np.median(flow.reshape(-1,2),axis=0)
    resid=flow-translation
    mag=np.linalg.norm(resid,axis=2)
    vals=[]
    for gy in range(3):
        for gx in range(3):
            tile=mag[gy*32:(gy+1)*32,gx*32:(gx+1)*32]
            vals.append(round(float(np.percentile(tile,90)),5))
    return {'global_translation_px96':[round(float(v),4) for v in translation],
            'residual_grid_p90_px96':vals,
            'grid_is_not_body_part_detection':True}

def analyze_frames(frames:np.ndarray, start:float, hz:int, p13_obs:list[dict]) -> dict:
    if frames.ndim!=4 or frames.shape[-1]!=3:raise ValueError('Expected array of decoded frames')
    prev=None;prevframe=None;series=[];found=0;validpairs=0;full_flow_count=0
    for i,fr in enumerate(frames):
        t=start+i/hz
        flow=grid_residual_flow(prevframe,fr) if prevframe is not None else None
        if flow is not None:full_flow_count+=1
        prevframe=fr
        face=nearest_face(t,p13_obs)
        if face is None:
            series.append({'t_approx_s':round(t,4),'face_candidate':False,'regions':{k:None for k in REGIONS},'mouth_relative_to_cheeks':None,'whole_frame_motion':flow});prev=None;continue
        found+=1
        boxes=region_boxes(face)
        patches={name:normalize_patch(fr,box) for name,box in boxes.items()}
        v={name:normalized_change(prev[name],patches[name]) if prev is not None else None for name in REGIONS}
        if v['mouth_approx'] is not None:
            validpairs+=1
        cheeks=[v[z] for z in ('cheek_left_approx','cheek_right_approx') if v[z] is not None]
        relative=round(v['mouth_approx']-np.median(cheeks),6) if v['mouth_approx'] is not None and cheeks else None
        series.append({'t_approx_s':round(t,4),'face_candidate':True,'regions':v,'mouth_relative_to_cheeks':relative,'whole_frame_motion':flow})
        prev=patches
    return {'frames_analyzed':len(frames),'frames_with_face_candidate':found,'continuous_face_pairs':validpairs,
            'face_coverage':round(found/max(1,len(frames)),4),'whole_frame_flow_pairs':full_flow_count,'relative_change_is_not_lip_aperture':True,
            'series':series}


def audit_one(video:Path,task:dict,p13:dict,hz:int=12)->dict:
    a=float(task['start_s']);b=float(task['end_s'])
    if abs(a-float(p13['start_s']))>.001 or abs(b-float(p13['end_s']))>.001 or task['video_id']!=p13['video_id']:
        raise ValueError('Source window mismatch')
    video=Path(video)
    if not video.is_file():raise ValueError('Source not found')
    f=decode_window(video,a,b,hz)
    v=analyze_frames(f,a,hz,p13['observations'])
    au=audio_rms(video,a,b)
    return {'video_id':task['video_id'],'split':task['split'],'scene_group':task['scene_group'],
            'source_filename_PRIVATE':video.name,'start_s':a,'end_s':b,'sample_hz':hz,
            'pixels_or_pcm_exported':False,'landmark_inference_executed':False,'human_event_labels':0,
            'breathing_detected':False,'hand_contact_detected':False,
            'visual':v,'audio':au}


def audit_all(tasks_path:Path,p13_path:Path,source_dir:Path,out_path:Path,hz:int=12,limit:int=60)->dict:
    tasks=json.loads(Path(tasks_path).read_text())['tasks']
    p13=json.loads(Path(p13_path).read_text())['results']
    if len(tasks)!=60 or len(p13)!=60:raise ValueError('Expected exact P11/P13 corpus')
    # CRITICAL: 60 windows contain repeated video IDs. Use positional pairing and validate time.
    for i, (t, p) in enumerate(zip(tasks,p13)):
        if (t['video_id'] != p['video_id'] or t['split'] != p['split']
            or abs(float(t['start_s'])-float(p['start_s'])) > .001
            or abs(float(t['end_s'])-float(p['end_s'])) > .001):
            raise ValueError(f'P11/P13 window mismatch at index {i}')
    root=Path(source_dir).resolve(strict=True)
    results=[];errors=[]
    for t, p13_row in zip(tasks[:limit], p13[:limit]):
        video=root/t['private_filename']
        if video.resolve().parent!=root:raise ValueError('Unsafe path')
        try:results.append(audit_one(video,t,p13_row,hz=hz))
        except (RuntimeError,ValueError,subprocess.TimeoutExpired) as e:errors.append({'video_id':t['video_id'],'error_type':type(e).__name__})
    doc={'schema':SCHEMA,'private':True,'contains_original_media':False,'contains_private_metadata':True,
         'source_detector':'p13_opencv_haar_face_candidate_6hz','analysis_video_hz':hz,
         'estimated_regions_not_landmarks':list(REGIONS),'automatic_lip_landmarks':False,
         'automatic_hand_landmarks':False,'audio_is_not_breath_classification':True,
         'mouth_relative_signal_is_not_evidence_of_inhalation':True,
         'total_passages':len(results),'failures':errors,
         'total_decoded_frames':sum(r['visual']['frames_analyzed'] for r in results),
         'face_candidate_frames':sum(r['visual']['frames_with_face_candidate'] for r in results),
         'face_continuous_pairs':sum(r['visual']['continuous_face_pairs'] for r in results),
         'whole_frame_flow_pairs':sum(r['visual']['whole_frame_flow_pairs'] for r in results),
         'audio_available_passages':sum(r['audio']['audio_available'] for r in results),
         'results':results}
    Path(out_path).parent.mkdir(parents=True,exist_ok=True)
    Path(out_path).write_text(json.dumps(doc,ensure_ascii=False,indent=1))
    return {k:v for k,v in doc.items() if k!='results'}

if __name__=='__main__':
    p=argparse.ArgumentParser()
    p.add_argument('--tasks',required=True);p.add_argument('--p13',required=True)
    p.add_argument('--source-dir',required=True);p.add_argument('--out',required=True)
    p.add_argument('--hz',type=int,default=12);p.add_argument('--limit',type=int,default=60)
    a=p.parse_args(); print(json.dumps(audit_all(Path(a.tasks),Path(a.p13),Path(a.source_dir),Path(a.out),a.hz,a.limit),indent=2))

