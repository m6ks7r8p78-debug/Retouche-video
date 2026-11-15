"""P13 offline CPU face/eye detector + mouth-region *heuristic*, no anatomical landmarks.

OpenCV Haar cascades are pretrained detectors included in the installed OpenCV package.
No re-identification, identity, age, action, inhale/exhale or lip landmark inferred.
No frames/audio are written. Raw per-video metadata MUST be handled privately.
"""
from __future__ import annotations
import argparse
import json
import math
import subprocess
from pathlib import Path

import cv2
import numpy as np

SCHEMA = 'retouche-cinema-p13-cascade-roi-v1'


def detector_paths():
    home = Path(cv2.data.haarcascades)
    return home / 'haarcascade_frontalface_default.xml', home / 'haarcascade_eye.xml'


def load_detectors():
    face_path, eye_path = detector_paths()
    face, eyes = cv2.CascadeClassifier(str(face_path)), cv2.CascadeClassifier(str(eye_path))
    if face.empty() or eyes.empty():
        raise RuntimeError('OpenCV local face/eye models are missing')
    return face, eyes


def normalize_box(box, w, h):
    x, y, bw, bh = map(float, box)
    if min(w,h) <= 0 or bw <= 0 or bh <= 0 or x < 0 or y < 0 or x + bw > w + .01 or y + bh > h + .01:
        raise ValueError('Invalid crop geometry')
    return [round(x/w, 6), round(y/h, 6), round(bw/w, 6), round(bh/h, 6)]


def detect_face_eye_rois(frame, cascade_pair=None, max_side=480):
    """Returns face box, two eye detections *if available* and heuristic mouth box.

    All boxes normalized to ORIGINAL frame. Missing faces -> None, never fake.
    """
    if not isinstance(frame, np.ndarray) or frame.ndim != 3 or frame.shape[2] != 3:
        raise ValueError('Expected BGR frame')
    h0, w0 = frame.shape[:2]
    if min(h0,w0) < 32: return None
    face, eye = cascade_pair or load_detectors()
    scale = min(1., max_side/max(w0,h0))
    small = cv2.resize(frame,(int(round(w0*scale)),int(round(h0*scale))),interpolation=cv2.INTER_AREA) if scale < 1 else frame
    gray = cv2.equalizeHist(cv2.cvtColor(small,cv2.COLOR_BGR2GRAY))
    h,w = gray.shape
    rects = face.detectMultiScale(gray, scaleFactor=1.11, minNeighbors=4, minSize=(max(28,round(w*.08)),max(28,round(h*.08))))
    if len(rects) == 0: return None
    x,y,bw,bh = sorted(rects,key=lambda a:a[2]*a[3],reverse=True)[0]
    x,y,bw,bh = map(int,(x,y,bw,bh))
    roi = gray[y+int(bh*.1):y+int(bh*.62), x:x+bw]
    eyerects = eye.detectMultiScale(roi,scaleFactor=1.08,minNeighbors=3,minSize=(max(9,int(bw*.1)),max(9,int(bh*.06)))) if roi.size else []
    eyes=[]
    for a,b,ww,hh in sorted(eyerects,key=lambda a:a[2]*a[3],reverse=True):
        center=(x+a+ww/2,y+int(bh*.1)+b+hh/2)
        if not any(np.linalg.norm(np.subtract(center,z['center_px'])) < ww*.5 for z in eyes):
            eyes.append({'center_px':center,'box':normalize_box((x+a,y+int(bh*.1)+b,ww,hh),w,h)})
        if len(eyes)>=2:break
    eyes=sorted(eyes,key=lambda z:z['center_px'][0]);clean_eyes=[e['box'] for e in eyes]
    # This ROI is only a coarse face-relative region, NOT lip positions.
    mouth=(x+int(bw*.18), y+int(bh*.59), int(bw*.64), int(bh*.31))
    mouth=(mouth[0],mouth[1],min(mouth[2],w-mouth[0]),min(mouth[3],h-mouth[1]))
    return {'face_box':normalize_box((x,y,bw,bh),w,h),
            'eye_candidate_boxes':clean_eyes,
            'mouth_region_HEURISTIC_not_lips':normalize_box(mouth,w,h),
            'candidate_detector':'opencv_haar_cpu',
            'face_identity_proven':False,'lips_detected':False,'hands_detected':False,
            'smoking_or_breath_detected':False}


def probe_window(video_path:Path,start_s:float,end_s:float,hz:int=8,cascades=None):
    if not (isinstance(start_s,(float,int)) and isinstance(end_s,(float,int)) and math.isfinite(start_s) and math.isfinite(end_s) and 0<=start_s<end_s and end_s-start_s<=12):
        raise ValueError('P13 requires a finite window <= 12s')
    if not 1<=hz<=30:raise ValueError('Invalid sample hz')
    cap=cv2.VideoCapture(str(video_path))
    if not cap.isOpened():raise RuntimeError('Cannot open video')
    fps=float(cap.get(cv2.CAP_PROP_FPS))
    if not 1<=fps<=240:cap.release();raise RuntimeError('Bad FPS')
    frames=int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    seen=set();observations=[];skipped=0
    try:
        n=math.ceil((end_s-start_s)*hz)
        for i in range(n+1):
            frame_no=round((start_s+i/hz)*fps)
            if frame_no in seen: skipped+=1;continue
            if frame_no>=frames:break
            seen.add(frame_no)
            cap.set(cv2.CAP_PROP_POS_FRAMES,frame_no)
            ok,bgr=cap.read()
            if not ok:break
            res=detect_face_eye_rois(bgr,cascades)
            observations.append({'t_s':round(frame_no/fps,4),'source_frame':frame_no,
                'face_candidate':res})
    finally: cap.release()
    found=[o['face_candidate'] for o in observations if o['face_candidate'] is not None]
    with_eyes=[r for r in found if len(r['eye_candidate_boxes'])>=2]
    return {'source_fps':round(fps,3),'sampled_original_frames':len(observations),
        'source_frame_reuse_avoided':skipped,'face_candidate_frames':len(found),
        'two_eye_candidate_frames':len(with_eyes),
        'face_coverage':round(len(found)/max(1,len(observations)),4),
        'two_eyes_coverage':round(len(with_eyes)/max(1,len(observations)),4),
        'observations':observations}



def probe_window_ffmpeg(video_path:Path,start_s:float,end_s:float,hz:int=6,cascades=None,max_frames=60):
    """Fast crop-first FFmpeg decoder. Time and source frame indices are APPROXIMATED.

    The payload holds temporary 320x320 frames in RAM only, discarded after scanning;
    no extracted face, full frame, audio or thumbnails are persisted.
    """
    if not (0<=start_s<end_s and end_s-start_s<=12 and 1<=hz<=30):
        raise ValueError('invalid time window or cadence')
    vf=f'fps={hz},scale=320:320:force_original_aspect_ratio=decrease,pad=320:320:(ow-iw)/2:(oh-ih)/2'
    cmd=['ffmpeg','-nostdin','-hide_banner','-loglevel','error','-ss',str(start_s),'-i',str(video_path),
         '-t',str(end_s-start_s),'-vf',vf,'-an','-f','rawvideo','-pix_fmt','bgr24','pipe:1']
    proc=subprocess.run(cmd,capture_output=True,timeout=30,check=False)
    if proc.returncode!=0:
        raise RuntimeError('FFmpeg decoding failed: '+proc.stderr[:200].decode('utf-8','replace'))
    chunk=320*320*3
    n=len(proc.stdout)//chunk
    if n<=0 or n>max_frames or len(proc.stdout)%chunk: raise RuntimeError('Invalid decoded frame count')
    frames=np.frombuffer(proc.stdout,dtype=np.uint8).reshape(n,320,320,3)
    observations=[]
    for i,frame in enumerate(frames):
        res=detect_face_eye_rois(frame,cascades,max_side=320)
        observations.append({'t_s_approx':round(start_s+i/hz,4),'source_frame_index':None,'face_candidate':res})
    faces=[o['face_candidate'] for o in observations if o['face_candidate']]
    eyes=[z for z in faces if len(z['eye_candidate_boxes'])>=2]
    return {'sampling_method':'ffmpeg_sequential_decoding_scaled_320',
            'frame_times_are_nominal_approx':True,'sampled_original_decoded_frames':n,
            'face_candidate_frames':len(faces),'two_eye_candidate_frames':len(eyes),
            'face_coverage':round(len(faces)/n,4),'two_eyes_coverage':round(len(eyes)/n,4),
            'observations':observations}

def validate_private_tasks(doc):
    if doc.get('schema')!='retouche-cinema-p11-private-review-tasks-v1':raise ValueError('Bad private task schema')
    tasks=doc.get('tasks')
    if len(tasks)!=60:raise ValueError('Expected exact P11 60 tasks')
    if set(x.get('split') for x in tasks)!={'train','validation','test'}:raise ValueError('Missing split')
    return tasks


def audit(tasks_json,source_root,output_path,limit=60,hz=8):
    root=Path(source_root).resolve(strict=True)
    tasks=validate_private_tasks(json.loads(Path(tasks_json).read_text()))
    rows=[]
    cascades=load_detectors()
    for i,t in enumerate(tasks[:limit]):
        filename=t['private_filename']
        if Path(filename).name != filename:raise ValueError('Path traversal in filename')
        path=(root/filename).resolve(strict=True)
        if not path.is_relative_to(root):raise ValueError('Path escapes private root')
        measured=probe_window_ffmpeg(path,t['start_s'],t['end_s'],hz,cascades)
        rows.append({'video_id':t['video_id'],'private_filename':filename,'scene_group':t['scene_group'],
                     'split':t['split'],'start_s':t['start_s'],'end_s':t['end_s'],**measured})
        if (i+1)%10==0: print('processed',i+1,'/',min(limit,len(tasks)),flush=True)
    summary={'schema':SCHEMA,'count':len(rows),'source_files_public':False,'original_media_included':False,
      'automatic_facelip_landmarks':False,'automatic_eyes_approx':True,'automatic_hands':False,
      'eye_candidate_not_identity_verified':True,'action_inferred':False,'age_inferred':False,
      'supervised_labels_confirmed':0,
      'total_original_frames_sampled':sum(x['sampled_original_decoded_frames'] for x in rows),
      'total_faces_candidate_frames':sum(x['face_candidate_frames'] for x in rows),
      'total_two_eyes_candidate_frames':sum(x['two_eye_candidate_frames'] for x in rows),
      'passages_with_face_candidates':sum(x['face_candidate_frames']>0 for x in rows),
      'passages_with_two_eye_candidates':sum(x['two_eye_candidate_frames']>0 for x in rows),
      'splits':{s:sum(x['split']==s for x in rows) for s in ('train','validation','test')},
      'results':rows}
    Path(output_path).write_text(json.dumps(summary,indent=2,ensure_ascii=False))
    return summary


def main():
    p=argparse.ArgumentParser();p.add_argument('--tasks',required=True);p.add_argument('--source-dir',required=True)
    p.add_argument('--out',required=True);p.add_argument('--limit',type=int,default=60);p.add_argument('--hz',type=int,default=8)
    a=p.parse_args();s=audit(a.tasks,a.source_dir,a.out,a.limit,a.hz)
    print(json.dumps({k:v for k,v in s.items() if k!='results'},indent=2))
if __name__=='__main__':main()

