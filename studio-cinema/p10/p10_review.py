"""Retouche Cinema P10 — independent human-annotation agreement.
No media bytes, identity recognition or smoking-action classifier. Python stdlib only.
"""
from __future__ import annotations
import json
import math
from collections import defaultdict

CHANNELS = {'main','doigts','poignet','cigarette','filtre','levres','joues','regard','paupieres','tete','torse','fumee','audio','autre'}
PHASES = {'preparation','approche','contact','inspiration','maintien','retrait','pause','expiration','dispersion','regard_camera','clignement','autre'}
VISIBILITY = {'observe','incertain','non_visible'}

class AnnotationError(ValueError):
    pass


def _finite(x):
    return isinstance(x,(int,float)) and not isinstance(x,bool) and math.isfinite(x)


def validate(project):
    if not isinstance(project,dict) or project.get('schema')!='retouche-cinema-p9-private-human-annotations-v1':
        raise AnnotationError('not a Retouche P9 annotation export')
    src=project.get('source') or {}
    dur=src.get('duration_s')
    if not _finite(dur) or dur<=0 or dur>14400:
        raise AnnotationError('invalid video duration')
    ann=project.get('annotations')
    if not isinstance(ann,list) or len(ann)>20000:
        raise AnnotationError('invalid annotation list')
    for a in ann:
        if not isinstance(a,dict) or a.get('channel') not in CHANNELS or a.get('phase') not in PHASES or a.get('visibility') not in VISIBILITY:
            raise AnnotationError('invalid ontology')
        b,e=a.get('start_s'),a.get('end_s')
        if not _finite(b) or not _finite(e) or b<0 or e<=b or e>dur+.12:
            raise AnnotationError('invalid annotation timing')
        pt=a.get('point')
        if pt is not None and (not isinstance(pt,list) or len(pt)!=2 or not all(_finite(x) and 0<=x<=1 for x in pt)):
            raise AnnotationError('invalid normalized coordinates')
    return project


def _iou(a,b):
    lo=max(a['start_s'],b['start_s']);hi=min(a['end_s'],b['end_s'])
    return max(0,hi-lo)/max(a['end_s']-a['start_s']+b['end_s']-b['start_s']-max(0,hi-lo),1e-9)


def match_annotations(left,right,minimum_iou=.35,center_tolerance_s=.15,point_tolerance=.08):
    """One-to-one annotation comparison. Pairing relies on channel+phase+temporal overlap.
    Visibility & spatial point disagreements are retained as actionable conflicts.
    """
    A=validate(left)['annotations'];B=validate(right)['annotations']
    # Never match different videos even if they have overlapping time stamps.
    la=(left.get('source') or {});rb=(right.get('source') or {})
    if la.get('video_id') and rb.get('video_id') and la['video_id']!=rb['video_id']:
        raise AnnotationError('different source video IDs')
    if la.get('local_filename') and rb.get('local_filename') and la['local_filename']!=rb['local_filename']:
        raise AnnotationError('different source filenames')
    if abs(la['duration_s']-rb['duration_s'])>.20:
        raise AnnotationError('incompatible media durations')
    pairs=[]
    for i,a in enumerate(A):
        for j,b in enumerate(B):
            if a['channel']!=b['channel'] or a['phase']!=b['phase']:continue
            iou=_iou(a,b)
            center_delta=abs((a['start_s']+a['end_s']-b['start_s']-b['end_s'])/2)
            if iou>=minimum_iou or center_delta<=center_tolerance_s:
                pairs.append((iou,-center_delta,i,j))
    pairs.sort(reverse=True)
    chosenA=set();chosenB=set();matched=[];disagreements=[]
    for iou,negd,i,j in pairs:
        if i in chosenA or j in chosenB:continue
        a=A[i];b=B[j]
        chosenA.add(i);chosenB.add(j)
        issues=[]
        if a['visibility']!=b['visibility']:issues.append('visibility_conflict')
        if a.get('smoke_origin','unknown')!=b.get('smoke_origin','unknown') and a['channel']=='fumee':issues.append('smoke_origin_conflict')
        if a.get('point') is not None and b.get('point') is not None:
            d=math.dist(a['point'],b['point'])
            if d>point_tolerance:issues.append('spatial_point_conflict')
        if abs(a['start_s']-b['start_s'])>.25 or abs(a['end_s']-b['end_s'])>.25:issues.append('timing_conflict')
        matched.append({'a_index':i,'b_index':j,'iou':round(iou,4),'start_delta_s':round(a['start_s']-b['start_s'],3),'end_delta_s':round(a['end_s']-b['end_s'],3),'issues':issues,'channel':a['channel'],'phase':a['phase']})
        if issues:disagreements.append({'a_index':i,'b_index':j,'channel':a['channel'],'phase':a['phase'],'issues':issues})
    for i,a in enumerate(A):
        if i not in chosenA:disagreements.append({'a_index':i,'b_index':None,'channel':a['channel'],'phase':a['phase'],'issues':['unmatched_a']})
    for j,b in enumerate(B):
        if j not in chosenB:disagreements.append({'a_index':None,'b_index':j,'channel':b['channel'],'phase':b['phase'],'issues':['unmatched_b']})
    tp=len(matched); precision=tp/(tp+len(B)-len(chosenB)) if tp+len(B)-len(chosenB) else None
    recall=tp/(tp+len(A)-len(chosenA)) if tp+len(A)-len(chosenA) else None
    f1=(2*precision*recall/(precision+recall)) if precision is not None and recall is not None and precision+recall else None
    # Pairwise agreement is NOT ground truth. Keep human review mandatory.
    return {'schema':'retouche-cinema-p10-independent-annotation-audit-v1',
      'comparison_type':'two_human_annotation_exports_not_ground_truth',
      'source':{'video_id':la.get('video_id') or rb.get('video_id') or None,'duration_s':la['duration_s']},
      'annotation_counts':{'reviewer_a':len(A),'reviewer_b':len(B),'matched':tp,'unmatched_a':len(A)-len(chosenA),'unmatched_b':len(B)-len(chosenB),'matched_with_disagreements':sum(bool(x['issues']) for x in matched)},
      'matching_thresholds':{'min_iou':minimum_iou,'center_tolerance_s':center_tolerance_s,'point_tolerance_norm':point_tolerance},
      'matched':matched,'disagreements':disagreements,'matching_event_f1':round(f1,4) if f1 is not None else None,
      'independent_human_adjudication':'REQUIRED','consensus_proves_realism':False,'ready_for_training':False,
      'source_pixels_or_sound_exported':False}


def run_cli():
    import argparse
    p=argparse.ArgumentParser();p.add_argument('review_a');p.add_argument('review_b');p.add_argument('--out',required=True)
    x=p.parse_args()
    with open(x.review_a,encoding='utf-8') as f:a=json.load(f)
    with open(x.review_b,encoding='utf-8') as f:b=json.load(f)
    result=match_annotations(a,b)
    with open(x.out,'w',encoding='utf-8') as f:json.dump(result,f,ensure_ascii=False,indent=2)
    print(json.dumps(result['annotation_counts']))
if __name__=='__main__':run_cli()

