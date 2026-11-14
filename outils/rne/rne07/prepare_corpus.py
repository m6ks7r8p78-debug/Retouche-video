"""RNE07 — prepare private consented historical triplets; never new holdouts.

All video filenames, per-video SHA and frames remain in the owner's PRIVATE
working directory. No private training tensors or manifests in GitHub.
"""
from __future__ import annotations
import argparse,csv,hashlib,json,os
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor,as_completed
import cv2,numpy as np

def load_catalogue(catalogue:Path,originals:Path):
    with catalogue.open(encoding='utf-8-sig',newline='') as f:rows=list(csv.DictReader(f))
    if len(rows)!=157:raise ValueError('Expected 157 authorized historical records')
    seen=set();selected=[];all_rows=[]
    for row in rows:
        ident=row['ID'];source=originals/row['Nom de fichier'];sha=row['SHA-256'].lower()
        if not ident.startswith('V') or not source.is_file() or len(sha)!=64:
            raise ValueError('Incomplete private source')
        with source.open('rb') as f:digest=hashlib.file_digest(f,'sha256').hexdigest()
        if digest!=sha:raise ValueError('Private file integrity mismatch')
        entry={'id':ident,'path':str(source),'sha256':sha,'group':row['Groupe anti-fuite'],
               'private_training_consent':True,'private_evaluation_consent':True,'publication':False}
        all_rows.append(entry)
        if sha not in seen:seen.add(sha);selected.append(entry)
    if len(seen)!=154:raise ValueError('Expected 154 distinct older video contents')
    return selected,all_rows

def sample_triplet(source:Path,position:float):
    cap=cv2.VideoCapture(str(source))
    if not cap.isOpened():raise RuntimeError('Video unavailable')
    count=int(cap.get(cv2.CAP_PROP_FRAME_COUNT));fps=float(cap.get(cv2.CAP_PROP_FPS))
    if count>6:cap.set(cv2.CAP_PROP_POS_FRAMES,max(0,min(count-3,int(count*position))))
    elif 1<=fps<240:cap.set(cv2.CAP_PROP_POS_MSEC,0.)
    frames=[]
    for _ in range(3):
        ok,im=cap.read()
        if not ok:break
        h,w=im.shape[:2]
        if min(h,w)<80:break
        scale=min(1.,256/max(h,w))
        new=(max(80,(int(w*scale)//2)*2),max(80,(int(h*scale)//2)*2))
        frames.append(cv2.resize(im,new,
                      interpolation=cv2.INTER_AREA if scale<1 else cv2.INTER_LINEAR))
    cap.release()
    if len(frames)!=3 or any(x.shape!=frames[0].shape for x in frames):
        raise RuntimeError('No valid full triplet')
    return frames

def prepare(catalogue:Path,originals:Path,output:Path,workers:int=6):
    output=Path(output).resolve();output.mkdir(parents=True,exist_ok=True)
    if any((parent/'.git').exists() for parent in (output,*output.parents)):
        raise ValueError('Cannot store private material inside a git repository')
    selected,rows=load_catalogue(Path(catalogue),Path(originals))
    (output/'consent_manifest_PRIVATE.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2))
    jobs=[(r,idx,at) for r in selected for idx,at in enumerate((.18,.64))]
    errors=[];saved=0
    def one(job):
        row,k,at=job;dest=output/'triplets'/f"{row['id']}_{k:02d}.npz"
        dest.parent.mkdir(parents=True,exist_ok=True)
        if dest.exists():
            with np.load(dest,allow_pickle=False) as z:
                if all(key in z for key in ('prev2','prev1','current')):return True
        images=sample_triplet(Path(row['path']),at)
        temp=dest.with_suffix('.tmp.npz')
        np.savez_compressed(temp,prev2=images[0],prev1=images[1],current=images[2])
        os.replace(temp,dest)
        return True
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures={pool.submit(one,j):j for j in jobs}
        for future in as_completed(futures):
            j=futures[future]
            try:saved+=int(future.result())
            except Exception as exc:errors.append({'id':j[0]['id'],'moment':j[1],'error':str(exc)})
    report={'catalogue_files_checked':len(rows),'distinct_content_sources':len(selected),
            'extracted_triplets':saved,'expected_triplets':len(jobs),'errors':len(errors),
            'new_41_uploads_used_for_training':False,'source_files_unmodified':True}
    (output/'preparation_report_PRIVATE.json').write_text(
        json.dumps({'summary':report,'private_errors':errors},indent=2))
    if errors:raise RuntimeError('Some private samples failed; review private report')
    return report

if __name__=='__main__':
    p=argparse.ArgumentParser()
    p.add_argument('--catalogue',type=Path,required=True)
    p.add_argument('--originals',type=Path,required=True)
    p.add_argument('--output',type=Path,required=True)
    p.add_argument('--workers',type=int,default=6)
    p.add_argument('--private-consent-confirmed',action='store_true',required=True)
    a=p.parse_args()
    if not a.private_consent_confirmed:raise PermissionError('Private consent required')
    print(json.dumps(prepare(a.catalogue,a.originals,a.output,a.workers),indent=2))
