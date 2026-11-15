"""Retouche Cinema P11 - privacy-preserving high-frequency image-motion probes.

No action/identity/age inference. Never writes frames. Optional approximate
face-region probes are *not* anatomical landmarks. CPU OpenCV only.
"""
from __future__ import annotations
import argparse, collections, json, math
from pathlib import Path
import numpy as np
import cv2

SCHEMA = 'retouche-cinema-p11-micro-motion-probe-v1'
REGIONS = ('eye_left_approx','eye_right_approx','cheek_left_approx','cheek_right_approx','mouth_approx','chin_approx')


def _safe(v, digits=5):
    if v is None or not math.isfinite(float(v)):
        return None
    return round(float(v), digits)


def relative_flow(prev_gray, gray, prev_face=None, max_corners=450):
    """Median camera-flow subtraction, robust summary; no face recognition."""
    pts = cv2.goodFeaturesToTrack(prev_gray, maxCorners=max_corners, qualityLevel=.008, minDistance=5)
    if pts is None or len(pts)<8:
        return {'usable':False,'tracks':0,'flow_median':None,'flow_p90':None,'regions':{},'camera_flow':None}
    q, status, _ = cv2.calcOpticalFlowPyrLK(prev_gray, gray, pts, None, winSize=(17,17), maxLevel=2,
                                               criteria=(cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT,20,.03))
    if q is None or status is None:
        return {'usable':False,'tracks':0,'flow_median':None,'flow_p90':None,'regions':{},'camera_flow':None}
    good = status.reshape(-1).astype(bool)
    p=pts.reshape(-1,2)[good]; nxt=q.reshape(-1,2)[good]
    valid = np.isfinite(p).all(axis=1)&np.isfinite(nxt).all(axis=1)
    p=p[valid]; delta=(nxt-p)[valid]
    if len(p)<8:
        return {'usable':False,'tracks':len(p),'flow_median':None,'flow_p90':None,'regions':{},'camera_flow':None}
    camera=np.median(delta,axis=0)
    resid=delta-camera
    lengths=np.linalg.norm(resid,axis=1)
    h,w=prev_gray.shape[:2]
    regions={}
    for row in range(3):
        for col in range(3):
            m=(p[:,0]>=col*w/3)&(p[:,0]<(col+1)*w/3)&(p[:,1]>=row*h/3)&(p[:,1]<(row+1)*h/3)
            regions[f'grid_{row}_{col}']={'tracks':int(m.sum()),'motion_p90_px':_safe(np.percentile(lengths[m],90)) if m.sum()>=3 else None}
    if prev_face is not None:
        x,y,fw,fh=prev_face
        # face boxes are weak proxy regions, not mouth/lip landmarks
        coords={
          'eye_left_approx':(.15,.40,.48,.60), 'eye_right_approx':(.52,.40,.85,.60),
          'cheek_left_approx':(.09,.57,.40,.78), 'cheek_right_approx':(.60,.57,.91,.78),
          'mouth_approx':(.30,.72,.72,.91), 'chin_approx':(.30,.90,.72,1.05)}
        for name,(xa,ya,xb,yb) in coords.items():
            m=(p[:,0]>=x+xa*fw)&(p[:,0]<x+xb*fw)&(p[:,1]>=y+ya*fh)&(p[:,1]<y+yb*fh)
            regions[name]={'tracks':int(m.sum()),'motion_p90_px':_safe(np.percentile(lengths[m],90)) if m.sum()>=3 else None}
    return {'usable':True,'tracks':len(p),'flow_median':_safe(np.median(lengths)),
      'flow_p90':_safe(np.percentile(lengths,90)), 'regions':regions,
      'camera_flow':[_safe(camera[0]),_safe(camera[1])]}


def _resize(gray,max_side=320):
    h,w=gray.shape; scale=min(1,max_side/max(h,w))
    return cv2.resize(gray,(int(w*scale),int(h*scale)),interpolation=cv2.INTER_AREA) if scale<1 else gray


def probe_video(path:Path,start_s:float,end_s:float,sample_hz=12.,max_side=320,face_detector=None):
    if not path.is_file():raise FileNotFoundError(str(path))
    if not (0<=start_s<end_s and 1<=sample_hz<=30 and max_side>=160):raise ValueError('invalid clip or probe settings')
    cap=cv2.VideoCapture(str(path))
    if not cap.isOpened():raise RuntimeError('cannot decode video')
    fps=cap.get(cv2.CAP_PROP_FPS) or 0
    duration_frames=cap.get(cv2.CAP_PROP_FRAME_COUNT)
    if fps<=0 or fps>240:
        cap.release();raise RuntimeError('source fps unavailable')
    source_duration=duration_frames/fps if duration_frames else None
    # JPEG-like temporal sampling to avoid overstating 60 independent poses per second.
    wanted=[start_s+i/sample_hz for i in range(int(math.floor((end_s-start_s)*sample_hz))+1)]
    if len(wanted)>1800: cap.release();raise ValueError('too many samples')
    prev=None;last_frame=-1; observations=[]; duplicate_frame_reuse=0;face_box=None
    for sec in wanted:
        frame_idx=int(round(sec*fps));
        if frame_idx==last_frame:
            duplicate_frame_reuse+=1;continue
        if source_duration is not None and sec>=source_duration:break
        if last_frame<0 or frame_idx<last_frame or frame_idx-last_frame>max(8,int(fps*.5)):
            cap.set(cv2.CAP_PROP_POS_FRAMES,frame_idx)
            ok,frame=cap.read()
        else:
            ok=True;frame=None
            for _ in range(frame_idx-last_frame):
                ok,frame=cap.read()
                if not ok:break
        if not ok or frame is None:break
        last_frame=frame_idx
        gray=_resize(cv2.cvtColor(frame,cv2.COLOR_BGR2GRAY),max_side)
        # A detector is optional: keep proper unknown vs fabricated anatomical labels.
        if face_detector is not None and face_box is None:
            faces=face_detector.detectMultiScale(gray,scaleFactor=1.12,minNeighbors=4,minSize=(30,30))
            if len(faces):face_box=tuple(map(int,max(faces,key=lambda b:int(b[2])*int(b[3]))))
        if prev is not None:
            obs=relative_flow(prev,gray,face_box)
            observations.append({'t_s':_safe(sec,3),'source_frame':int(frame_idx),**obs})
        prev=gray
    cap.release()
    p90=[o['flow_p90'] for o in observations if o['flow_p90'] is not None]
    return {'source_fps':_safe(fps,3), 'requested_probe_hz':sample_hz,
      'sampled_source_frames':len(observations)+int(prev is not None),
      'compared_pairs':len(observations), 'sample_resampling_repeats_avoided':duplicate_frame_reuse,
      'face_box_found_approximate':face_box is not None,
      'relative_flow_p90_median_px':_safe(np.median(p90)) if p90 else None,
      'observations':observations}


def process_worklist(worklist,root,limit=None,sample_hz=12,face=False):
    data=json.loads(Path(worklist).read_text())
    if data.get('schema')!='retouche-cinema-p10-private-prioritized-annotation-worklist-v1':raise ValueError('wrong worklist schema')
    items=data['initial_pass'][:limit] if limit else data['initial_pass']
    cascade=None
    if face:
        cascade=cv2.CascadeClassifier(str(Path(cv2.data.haarcascades)/'haarcascade_frontalface_default.xml'))
        if cascade.empty():raise RuntimeError('face cascade missing')
    outputs=[]
    for n,it in enumerate(items,1):
        try:
            path=Path(root)/it['private_filename']
            result=probe_video(path,it['start_s'],it['end_s'],sample_hz=sample_hz,face_detector=cascade)
            outputs.append({'video_id':it['video_id'],'split':it['split'],'scene_group':it['scene_group'],
                            'start_s':it['start_s'],'end_s':it['end_s'],'status':'measured',**result})
        except Exception as e:
            outputs.append({'video_id':it['video_id'],'split':it['split'],'scene_group':it['scene_group'],
                            'status':'failed','error':type(e).__name__})
        if n%10==0:print('Analyzed',n,'/',len(items),flush=True)
    split_groups=collections.defaultdict(set)
    for x in outputs:split_groups[x['split']].add(x['scene_group'])
    if len(set.intersection(*list(split_groups.values()))) if len(split_groups)>1 else False:
        raise ValueError('scene-group leakage')
    return {'schema':SCHEMA,'privacy':'private_metadata_only_no_frames','source_worklist':'P10_60_window_first_pass',
     'requested_windows':len(items),'completed_windows':sum(x['status']=='measured' for x in outputs),
     'failed_windows':sum(x['status']=='failed' for x in outputs),
     'source_video_frames_saved':0,'source_sound_saved':0,
     'automatic_lip_landmarks':False,'face_box_not_anatomical_landmarks':True,
     'smoking_action_recognized':False,'breath_detected':False,
     'eligible_for_supervised_training':False,
     'results':outputs}


def main():
    p=argparse.ArgumentParser()
    p.add_argument('--worklist',required=True);p.add_argument('--root',required=True);p.add_argument('--out',required=True)
    p.add_argument('--limit',type=int);p.add_argument('--sample-hz',type=float,default=12);p.add_argument('--face',action='store_true')
    a=p.parse_args();z=process_worklist(a.worklist,a.root,a.limit,a.sample_hz,a.face)
    Path(a.out).write_text(json.dumps(z,ensure_ascii=False,indent=2))
    print(json.dumps({k:z[k] for k in ('requested_windows','completed_windows','failed_windows')},ensure_ascii=False))

if __name__=='__main__':main()
