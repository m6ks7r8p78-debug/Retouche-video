"""Retouche Cinema P10 — balanced and PRIVATE screening-window review queue.
Uses only P9 metadata; cannot identify smoking, breaths, adult ages, or identity.
"""
from __future__ import annotations
from collections import Counter,defaultdict
from pathlib import Path
import json,math,hashlib


def create_worklist(p9_queue,split_manifest,video_audit,model_prior=None,per_group_train=3):
    queue=json.loads(Path(p9_queue).read_text())
    manifest=json.loads(Path(split_manifest).read_text())
    audit=json.loads(Path(video_audit).read_text())
    split={v:s for s,vs in manifest['split_members'].items() for v in vs}
    group={v:i+1 for i,g in enumerate(manifest['groups']) for v in g['ids']}
    if len(group)!=157 or len(split)!=157 or set(group)!=set(split):raise ValueError('P10 requires complete 157-video scene-group manifest')
    if any(g['split']!=split[v] for g in manifest['groups'] for v in g['ids']):raise ValueError('group leakage across splits')
    for pair in manifest['exact_duplicate_groups']:
        if len({split[v] for v in pair})>1:raise ValueError('exact duplicates across splits')
    vids={x['id']:x for x in audit['videos']}
    windows=queue['windows']
    if len(windows)!=471 or set(x['id'] for x in windows)!=set(split):raise ValueError('unexpected P9 screening coverage')
    novelty=defaultdict(list)
    if model_prior is not None:
        for o in json.loads(Path(model_prior).read_text()).get('windows',[]):
            novelty[o['video_id']].append(o)
    items=[]
    for w in windows:
        v=w['id'];x=vids[v]
        # The sorting score is NOT a smoking probability. It is a coverage/inspectability heuristic.
        motion=math.log1p(max(0,w.get('review_priority_proxy') or 0))
        face=int(bool(w.get('face_bbox_candidate')))
        audio=int(bool(x.get('has_audio')))
        model_bonus=0.
        if novelty[v]:
            # Without labels, high reconstruction loss only makes a window worth inspecting.
            near=min(novelty[v],key=lambda y:abs(y['t_s']-w['center_s']))
            if abs(near['t_s']-w['center_s'])<2:model_bonus=.15
        score=round(min(motion,2.6)+.7*face+.2*audio+model_bonus,4)
        items.append({'video_id':v,'private_filename':w['private_filename'],'start_s':w['start_s'],'end_s':w['end_s'],'center_s':w['center_s'],
          'split':split[v],'scene_group':group[v],'source_sha256_verified':x['source_sha256_verified'],
          'face_box_candidate':bool(face),'has_audio':bool(audio),'review_utility_proxy':score,
          'label_smoking':'UNKNOWN_NOT_ANNOTATED','age_status':'UNVERIFIED',
          'annotation_requirements':['main','doigts','poignet','filtre','levres','joues','regard','paupieres','tete','torse','fumee','audio'],
          'training_eligible_without_adjudication':False})
    items.sort(key=lambda x:(-x['review_utility_proxy'],x['video_id'],x['start_s']))
    selected=[];group_counter=Counter();source_counter=Counter()
    # Preserve all groups; limit to 3 train windows and 1 validation/test window per scene group.
    for sp in ('train','validation','test'):
        limit=per_group_train if sp=='train' else 1
        for item in [x for x in items if x['split']==sp]:
            if group_counter[(sp,item['scene_group'])]>=limit or source_counter[(sp,item['video_id'])]>=1:continue
            group_counter[(sp,item['scene_group'])]+=1;source_counter[(sp,item['video_id'])]+=1
            selected.append(item)
    # Fill under-capacity groups with an extra window from same source only if source diversity exhausted.
    for sp in ('train','validation','test'):
        limit=per_group_train if sp=='train' else 1
        for item in [x for x in items if x['split']==sp]:
            if item in selected or group_counter[(sp,item['scene_group'])]>=limit:continue
            group_counter[(sp,item['scene_group'])]+=1;selected.append(item)
    counts=Counter(x['split'] for x in selected)
    expected_groups=Counter(g['split'] for g in manifest['groups'])
    covered_groups={sp:len({x['scene_group'] for x in selected if x['split']==sp}) for sp in expected_groups}
    if any(covered_groups[s]!=expected_groups[s] for s in expected_groups):raise ValueError('not all scene groups covered')
    return {'schema':'retouche-cinema-p10-private-prioritized-annotation-worklist-v1',
      'privacy':'PRIVATE_TIMESTAMPS_AND_FILE_NAMES_NO_MEDIA_BYTES',
      'candidate_pool':len(windows),'selected_first_pass':len(selected),
      'source_videos':len(vids),'videos_directly_manually_annotated_at_creation':0,
      'split_selected_counts':dict(counts),'scene_groups_covered':covered_groups,
      'split_isolation':'v35_exact_and_near_scene_group_manifest',
      'review_utility_is_not_smoking_probability':True,
      'adult_age_and_rights_must_be_verifiably_qualified_before_training':True,
      'initial_pass':selected,'remaining_later':[x for x in items if x not in selected]}

if __name__=='__main__':
    import argparse
    p=argparse.ArgumentParser()
    for name in ('p9-queue','split-manifest','video-audit','model-prior','output'):
        p.add_argument('--'+name,required=name!='model-prior')
    a=vars(p.parse_args());r=create_worklist(a['p9_queue'],a['split_manifest'],a['video_audit'],a['model_prior']);Path(a['output']).write_text(json.dumps(r,indent=2,ensure_ascii=False));print(json.dumps({k:r[k] for k in ['candidate_pool','selected_first_pass','source_videos','split_selected_counts','scene_groups_covered']}))

