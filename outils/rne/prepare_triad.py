#!/usr/bin/env python3
"""RNE 0.3: private, consent-gated 3-frame extraction from an explicit manifest.

No network and no media/weights in a public checkout. Output is a PRIVATE cache.
"""
from __future__ import annotations
import argparse, hashlib, json, time
from pathlib import Path
from collections import Counter
import cv2
import numpy as np


def require_outside_git(path):
    path = Path(path).resolve()
    if any((d/'.git').exists() for d in (path,*path.parents)):
        raise ValueError('Never write private media or weights into a Git checkout')
    return path


def verify_manifest(entries, expected_count=None):
    if not isinstance(entries,list) or len(entries)<3 or (expected_count is not None and len(entries)!=expected_count):
        raise ValueError('Incomplete manifest')
    names, groups, hashes, ids = set(), {}, {}, set()
    for entry in entries:
        required={'id','path','split','group','sha256','private_training_consent','private_evaluation_consent'}
        if not isinstance(entry,dict) or not required.issubset(entry):
            raise ValueError('Manifest entry missing required fields')
        if entry.get('publication',False) is not False:
            raise ValueError('Media publication is forbidden in this workflow')
        if entry['split'] not in ('train','validation','test'):
            raise ValueError('Unknown partition')
        if not isinstance(entry['group'],str) or not entry['group'] or len(entry['group'])>100:
            raise ValueError('Invalid scene group')
        if not isinstance(entry['id'],str) or not entry['id'].replace('_','').replace('-','').isalnum() or len(entry['id'])>40 or entry['id'] in ids:
            raise ValueError('Invalid or duplicate opaque id')
        ids.add(entry['id'])
        if not isinstance(entry['private_evaluation_consent'],bool) or not entry['private_evaluation_consent']:
            raise PermissionError('Private evaluation consent missing')
        if entry['split']=='train' and entry.get('private_training_consent') is not True:
            raise PermissionError('Private training consent missing')
        if entry['group'] in groups and groups[entry['group']]!=entry['split']:
            raise ValueError('Scene leakage between train and evaluation partitions')
        groups[entry['group']]=entry['split']
        path=Path(entry['path']).resolve()
        if not path.is_file() or path.suffix.lower() not in ('.mp4','.mov','.m4v') or path in names:
            raise ValueError('Missing, invalid or duplicate media path')
        names.add(path)
        sha=entry['sha256']
        if not isinstance(sha,str) or len(sha)!=64 or any(c not in '0123456789abcdef' for c in sha.lower()):
            raise ValueError('Invalid SHA-256')
        if sha in hashes and hashes[sha]!=entry['split']:
            raise ValueError('Exact duplicate leaked across partitions')
        hashes[sha]=entry['split']
        digest=hashlib.sha256()
        with path.open('rb') as handle:
            for chunk in iter(lambda:handle.read(4*1024*1024),b''):
                digest.update(chunk)
        if digest.hexdigest()!=sha.lower():
            raise ValueError('Source integrity check failed')
    if any(not any(e['split']==s for e in entries) for s in ('train','validation','test')):
        raise ValueError('Three non-empty partitions required')
    return {s:sum(e['split']==s for e in entries) for s in ('train','validation','test')}


def get_three(cap,start):
    cap.set(cv2.CAP_PROP_POS_FRAMES,max(0,int(start)))
    result=[]
    for _ in range(3):
        ok, frame=cap.read()
        if not ok or frame is None:
            return []
        result.append(frame)
    return result


def resize(frame):
    h,w=frame.shape[:2]
    factor=min(192/max(1,min(h,w)),256/max(1,max(h,w)),1.)
    outw,outh=max(32,2*(int(w*factor)//2)),max(32,2*(int(h*factor)//2))
    return cv2.resize(frame,(outw,outh),interpolation=cv2.INTER_AREA)


def prepare(manifest_path, output, expected_count=None):
    output=require_outside_git(output)
    data=json.loads(Path(manifest_path).read_text(encoding='utf-8'))
    sizes=verify_manifest(data,expected_count)
    output.mkdir(parents=True,exist_ok=True)
    cv2.setNumThreads(1)
    counts=Counter();bad=0;t0=time.monotonic()
    for entry in data:
        cap=cv2.VideoCapture(entry['path'])
        if not cap.isOpened():
            bad+=1;continue
        n=cap.get(cv2.CAP_PROP_FRAME_COUNT)
        n=int(n) if np.isfinite(n) and n>=3 else 0
        fractions=(.32,.69) if entry['split']=='train' else (.55,)
        good=0
        for index,fraction in enumerate(fractions):
            position=max(0,min(max(0,n-3),int(n*fraction)-1))
            triples=get_three(cap,position) or get_three(cap,0)
            if len(triples)!=3 or any(z.shape!=triples[0].shape for z in triples):continue
            trio=[resize(z) for z in triples]
            if min(trio[0].shape[:2])<64:continue
            np.savez_compressed(output/f"{entry['id']}_{index}.npz",prev2=trio[0],prev1=trio[1],current=trio[2])
            good+=1
        cap.release()
        if not good:bad+=1
        counts[entry['split']]+=good
    result={'media_count':len(data),'consent_and_sha_checked':len(data),
        'partitions':sizes,'triples':dict(counts),'undecodable_media':bad,
        'seconds':round(time.monotonic()-t0,2),
        'warning':'Cache contains PRIVATE derived frames and must never be published or pushed to Git.'}
    (output/'summary_private.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    if bad:raise RuntimeError('Some sources could not yield valid consecutive frames; see private extraction log')
    return result


def main():
    a=argparse.ArgumentParser()
    a.add_argument('--manifest',type=Path,required=True)
    a.add_argument('--out',type=Path,required=True)
    a.add_argument('--expected-count',type=int,default=None)
    a.add_argument('--authorized-private-training',action='store_true',required=True)
    args=a.parse_args()
    if not args.authorized_private_training:raise PermissionError('Explicit private training authorization required')
    print(json.dumps(prepare(args.manifest,args.out,args.expected_count),ensure_ascii=False))

if __name__=='__main__':main()