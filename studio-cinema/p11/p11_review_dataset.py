"""P11: private review-task prioritization and fail-closed supervised training gates.

This module processes metadata, never videos/images/voices. It does NOT assert
that any real person is an adult or that a smoking action has been confirmed.
"""
from __future__ import annotations
import json, math
from collections import Counter, defaultdict
from pathlib import Path

SCHEMA='retouche-cinema-p11-private-review-tasks-v1'


def make_review_tasks(worklist, probe):
    if worklist.get('schema')!='retouche-cinema-p10-private-prioritized-annotation-worklist-v1':
        raise ValueError('invalid P10 worklist')
    if probe.get('schema')!='retouche-cinema-p11-micro-motion-probe-v1':
        raise ValueError('invalid P11 probe')
    chosen=worklist.get('initial_pass',[])
    observed=probe.get('results',[])
    if len(chosen)!=len(observed):raise ValueError('window count mismatch')
    task=[];seen=set();groups=defaultdict(set)
    for original,motion in zip(chosen,observed):
        id=original['video_id'];key=(id,original['start_s'],original['end_s'])
        if key in seen:raise ValueError('duplicated review window')
        seen.add(key)
        if motion.get('status')!='measured' or id!=motion['video_id'] or original['split']!=motion['split'] or original['scene_group']!=motion['scene_group']:
            raise ValueError('unmatched or failed probe')
        if len(motion['observations'])!=motion['compared_pairs']:
            raise ValueError('incomplete step records')
        groups[original['scene_group']].add(original['split'])
        # Densely moving parts are candidates for *human inspection*, NOT action predictions.
        highlights=[]
        for step in motion['observations']:
            if step['flow_p90'] is None:continue
            highlights.append({'t_s':step['t_s'],'motion_p90_px':step['flow_p90'],
             'mouth_region_approx_p90_px':(step['regions'].get('mouth_approx') or {}).get('motion_p90_px'),
             'mouth_region_tracks':(step['regions'].get('mouth_approx') or {}).get('tracks',0)})
        highlights.sort(key=lambda z:-z['motion_p90_px'])
        chosen_highlights=[]
        for h in highlights:
            if all(abs(h['t_s']-g['t_s'])>=.30 for g in chosen_highlights):chosen_highlights.append(h)
            if len(chosen_highlights)==4:break
        chosen_highlights.sort(key=lambda z:z['t_s'])
        task.append({'video_id':id,'private_filename':original['private_filename'],
         'split':original['split'],'scene_group':original['scene_group'],
         'start_s':original['start_s'],'end_s':original['end_s'],
         'face_region_candidate_not_landmark':motion['face_box_found_approximate'],
         'source_fps':motion['source_fps'],'frames_compared':motion['compared_pairs'],
         'motion_review_anchors':chosen_highlights,
         'human_review_needed':['verify_source_age_and_rights','confirm_actual_action',
            'mark_fingers_cigarette_filter','mark_lip_contact_and_shapes',
            'mark_cheek_and_breath_visibility','mark_eye_gaze_and_blinks',
            'mark_exhalation_origin','audio_breath_vs_noise_if_audio_present',
            'second_independent_human_review'],
         'label_smoking':'UNKNOWN','lip_contact_verified':False,
         'adult_evidence':'UNKNOWN','independent_reviewers':0,
         'eligible_for_training':False})
    if any(len(v)>1 for v in groups.values()):raise ValueError('scene leakage across train/validation/test')
    return {'schema':SCHEMA,'privacy':'PRIVATE source filenames and anchor times; never publish',
      'count':len(task),'counts_by_split':dict(Counter(z['split'] for z in task)),
      'review_anchors_are_motion_not_smoking_labels':True,'human_labels_confirmed_count':0,
      'adult_status_automatically_inferred':False,
      'supervised_training_eligible_count':0,
      'tasks':task}


def gate_supervised_example(record):
    """Fail-closed: a completed two-reviewer record is evidence TO AUDIT, not automatic ground truth."""
    reasons=[]
    if record.get('source_sha256_verified') is not True:reasons.append('source_integrity_unverified')
    if record.get('training_permission_verified') is not True:reasons.append('training_scope_unverified')
    if record.get('adult_evidence')!='verified_adult':reasons.append('adult_status_unverified')
    if record.get('action_confirmed') is not True:reasons.append('action_unconfirmed')
    reviewers=record.get('independent_reviewers') or []
    if not isinstance(reviewers,list) or len(reviewers)<2 or len(set(reviewers))!=len(reviewers):
        reasons.append('two_independent_human_reviewers_required')
    if record.get('human_adjudication_status')!='approved':reasons.append('human_adjudication_pending')
    if not record.get('evidence_locations'):reasons.append('evidence_locations_absent')
    if record.get('split') not in ('train','validation','test'):reasons.append('invalid_data_split')
    return {'record_id':record.get('record_id'),'metadata_gate':'review_ready' if not reasons else 'blocked',
            'block_reasons':reasons,'human_verified_truth_automatic':False,
            'action_label_not_inferred_by_optical_flow':True}


def main():
    import argparse
    p=argparse.ArgumentParser();p.add_argument('--worklist',required=True);p.add_argument('--probe',required=True);p.add_argument('--out',required=True)
    a=p.parse_args();z=make_review_tasks(json.loads(Path(a.worklist).read_text()),json.loads(Path(a.probe).read_text()))
    Path(a.out).write_text(json.dumps(z,ensure_ascii=False,indent=2))
    print(json.dumps({k:z[k] for k in ['count','counts_by_split','supervised_training_eligible_count']}))

if __name__=='__main__':main()
