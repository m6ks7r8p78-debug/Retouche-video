"""Aggregate QA for *candidate* detections. Non-biometric; false positives unmeasured."""
from __future__ import annotations
import json
import math
from statistics import median
from pathlib import Path


def iou(a,b):
    if not a or not b:return None
    ax,ay,aw,ah=a;bx,by,bw,bh=b
    l=max(ax,bx);t=max(ay,by);r=min(ax+aw,bx+bw);bottom=min(ay+ah,by+bh)
    inter=max(0,r-l)*max(0,bottom-t)
    union=aw*ah+bw*bh-inter
    return (inter/union) if union>0 else 0


def summarize(doc):
    if doc.get('schema')!='retouche-cinema-p13-cascade-roi-v1':raise ValueError('Unexpected schema')
    rows=doc.get('results',[])
    if not rows or len(rows)>300:raise ValueError('Missing/too many observations')
    overlaps=[];per=[]
    for r in rows:
        a=r['observations']
        boxes=[(z.get('face_candidate') or {}).get('face_box') for z in a]
        local=[]
        for x,y in zip(boxes,boxes[1:]):
            v=iou(x,y)
            if v is not None:local.append(v);overlaps.append(v)
        per.append({'video_id':r['video_id'],'face_frames':r['face_candidate_frames'],
            'total_frames':len(a),'face_coverage':round(r['face_candidate_frames']/max(len(a),1),4),
            'adjacent_detections':len(local),'adjacent_bbox_iou_median':round(median(local),4) if local else None,
            'warning_if_face_rare':r['face_candidate_frames']<max(1,len(a)*.5)})
    return {'schema':'retouche-cinema-p13-quality-v1','passages':len(rows),'adjacent_face_pairs':len(overlaps),
      'median_candidate_box_iou':round(median(overlaps),4) if overlaps else None,
      'face_majority_passages':sum(not x['warning_if_face_rare'] for x in per),
      'low_face_coverage_passages':sum(x['warning_if_face_rare'] for x in per),
      'real_landmark_accuracy_evaluated':False,'face_detector_precision_evaluated':False,
      'human_reviewed':False,'per_passage_PRIVATE':per}
if __name__=='__main__':
 import sys
 src=json.loads(Path(sys.argv[1]).read_text());result=summarize(src)
 print(json.dumps({k:v for k,v in result.items() if k!='per_passage_PRIVATE'},indent=2))
 if len(sys.argv)>2:Path(sys.argv[2]).write_text(json.dumps(result,indent=2))

