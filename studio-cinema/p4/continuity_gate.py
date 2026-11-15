#!/usr/bin/env python3
"""Retouche Cinema P4 — auditable, conservative cross-shot continuity *candidate* checks.

No identity recognition, no GPU model, no uploads, no frame export. Visual scores
are weak appearance evidence only. A positive score NEVER proves identity.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import math
from pathlib import Path
from typing import Any

import cv2
import numpy as np

VERSION = 'cinema-p4-review-v01'
STATES = {'flagged', 'compatible_unverified', 'needs_review'}

class ContinuityError(ValueError):
    pass

def check(ok: bool, message: str) -> None:
    if not ok:
        raise ContinuityError(message)

def load_json(path: str | Path) -> dict:
    f = Path(path)
    check(f.is_file() and f.stat().st_size <= 2_000_000, 'JSON absent ou trop grand')
    data = json.loads(f.read_text('utf-8'))
    check(isinstance(data, dict), 'JSON non objet')
    return data

def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda: f.read(1048576), b''):
            h.update(chunk)
    return h.hexdigest()

def verify_manifest(m: dict) -> dict[str, dict]:
    check(m.get('schema_version') == 'cinema-p2-render-v01', 'Manifeste P2 incompatible')
    check(m.get('consent', {}).get('reference_media_included') is False, 'Manifest contenant des références privées interdit')
    clips = m.get('clips')
    check(isinstance(clips, list) and 1 <= len(clips) <= 300, 'Nombre de clips incorrect')
    by_id = {}
    known = {c.get('id') for c in m.get('characters', []) if isinstance(c, dict)}
    for i, c in enumerate(clips):
        check(isinstance(c, dict), 'Clip non objet')
        cid = c.get('clip_id')
        check(isinstance(cid, str) and cid.isascii() and cid.replace('_','').isalnum() and 1 <= len(cid) <= 80, 'ID clip non sûr')
        check(cid not in by_id and c.get('sequence') == i+1, 'Ordre de clip invalide')
        check(c.get('continuity', {}).get('character_ids') is not None, 'Continuité manquante')
        check(all(j in known for j in c['continuity']['character_ids']), 'Personnage non référencé')
        by_id[cid] = c
    return by_id

def verify_evidence(e: dict, by_id: dict[str, dict]) -> tuple[list[dict], dict[str, dict]]:
    check(e.get('schema_version') == 'cinema-p4-evidence-v01', 'Format d’annotations incompatible')
    check(e.get('media_transfer_approved') is False, 'Transfert distant non permis dans cet outil')
    checks = e.get('checks')
    check(isinstance(checks, list) and len(checks) <= 1000, 'Liste d’observations invalide')
    cache = e.get('clip_sha256', {})
    check(isinstance(cache, dict) and all(k in by_id for k in cache), 'Empreintes hors manifeste')
    ids = set()
    for obs in checks:
        check(isinstance(obs, dict), 'Observation non objet')
        oid = obs.get('check_id')
        check(isinstance(oid, str) and 0 < len(oid) <= 80 and oid not in ids, 'ID d’observation invalide')
        ids.add(oid)
        a,b = obs.get('from_clip'),obs.get('to_clip')
        check(a in by_id and b in by_id, 'Clip inconnu')
        i,j = by_id[a]['sequence'],by_id[b]['sequence']
        check(i < j and j == i+1, 'Comparer uniquement les plans consécutifs')
        entity = obs.get('entity_id')
        check(isinstance(entity,str) and entity in by_id[a]['continuity']['character_ids'] and entity in by_id[b]['continuity']['character_ids'], 'Personnage absent dans un clip')
        check(obs.get('transition') in ('continuous','cut'), 'Déclarer coupure ou continuité')
        regions = obs.get('regions')
        if regions is not None:
            check(isinstance(regions, dict) and set(regions) == {'before','after'}, 'Regions avant/après manquantes')
            for bb in regions.values():
                check(isinstance(bb,list) and len(bb) == 4 and all(type(v) in (int,float) and math.isfinite(v) for v in bb), 'Rectangle non numérique')
                x,y,w,h=bb
                check(0 <= x < 1 and 0 <= y < 1 and 0.03 <= w <= 1-x and 0.03 <= h <= 1-y, 'Rectangle hors image')
    return checks,cache

def read_frame(path: Path, which: str) -> np.ndarray:
    video = cv2.VideoCapture(str(path))
    try:
        check(video.isOpened(), 'Clip illisible')
        width = int(video.get(cv2.CAP_PROP_FRAME_WIDTH)); height = int(video.get(cv2.CAP_PROP_FRAME_HEIGHT))
        count = int(video.get(cv2.CAP_PROP_FRAME_COUNT))
        check(0 < width <= 4096 and 0 < height <= 4096 and width * height <= 8_500_000 and count >= 2, 'Vidéo hors limites')
        # Avoid transition-black frames: use a representative frame 15% inwards.
        at = round((0.15 if which == 'start' else 0.85)*(count-1))
        video.set(cv2.CAP_PROP_POS_FRAMES, at)
        ok,frame = video.read()
        check(ok and frame is not None, 'Décodage impossible')
        return frame
    finally:
        video.release()

def roi(frame: np.ndarray, bb: list[float]) -> np.ndarray:
    height,width = frame.shape[:2]
    x,y,w,h=bb
    x0=int(x*width); y0=int(y*height);x1=int((x+w)*width);y1=int((y+h)*height)
    crop=frame[y0:y1,x0:x1]
    check(crop.size>0 and min(crop.shape[:2])>=8, 'Zone annotée trop petite')
    return cv2.resize(crop,(96,96),interpolation=cv2.INTER_AREA)

def digest_features(im: np.ndarray) -> tuple[np.ndarray,np.ndarray]:
    hsv=cv2.cvtColor(im,cv2.COLOR_BGR2HSV)
    # Hue/saturation emphasizes visual palette; brightness is deliberately less important.
    hist=cv2.calcHist([hsv],[0,1],None,[24,16],[0,180,0,256]);cv2.normalize(hist,hist,alpha=1,norm_type=cv2.NORM_L1)
    gray=cv2.cvtColor(cv2.resize(im,(9,8)),cv2.COLOR_BGR2GRAY)
    # dHash is insensitive to moderate brightness shifts (not to geometric transformations).
    dh=(gray[:,1:]>gray[:,:-1]).reshape(-1)
    return hist,dh

def visual_distance(a: np.ndarray,b: np.ndarray) -> dict[str, float]:
    h1,d1=digest_features(a);h2,d2=digest_features(b)
    return {'hsv_bhattacharyya':round(float(cv2.compareHist(h1,h2,cv2.HISTCMP_BHATTACHARYYA)),4),
            'dhash_difference':round(float(np.mean(d1 != d2)),4)}

def assess(manifest: dict,evidence: dict,clips_dir: Path) -> dict:
    by_id=verify_manifest(manifest)
    observations,expected_sha=verify_evidence(evidence,by_id)
    # No arbitrary paths from JSON: clip_id + a fixed extension only.
    directory=clips_dir.resolve()
    check(directory.is_dir(),'Répertoire de clips absent')
    checked={}
    results=[]
    for item in observations:
        cid=item['check_id']; a=item['from_clip']; b=item['to_clip']
        base={'check_id':cid,'from_clip':a,'to_clip':b,'entity_id':item['entity_id'],
              'transition':item['transition'],'identity_proven':False,
              'reviewed_by_human':False}
        if item['transition']=='cut':
            results.append(dict(base,status='needs_review',reason='Coupure : les couleurs et formes peuvent varier avec le cadrage'))
            continue
        if not item.get('regions'):
            results.append(dict(base,status='needs_review',reason='Régions manuelles manquantes; aucune identité inférée'))
            continue
        crops=[]
        for clip_id,which,region in [(a,'end',item['regions']['before']), (b,'start',item['regions']['after'])]:
            path=(directory/(clip_id+'.mp4')).resolve()
            check(path.parent==directory and path.is_file(), 'Vidéo manquante ou hors répertoire')
            check(clip_id in expected_sha and isinstance(expected_sha[clip_id],str) and len(expected_sha[clip_id])==64,
                  'Empreinte vidéo obligatoire pour la mesure visuelle')
            if clip_id not in checked:
                check(sha256_file(path)==expected_sha[clip_id], 'Vidéo altérée depuis l’annotation')
                checked[clip_id]=True
            crops.append(roi(read_frame(path,which),region))
        score=visual_distance(*crops)
        # Deliberately conservative; thresholds are heuristic, NOT calibrated human accuracy.
        drift=score['hsv_bhattacharyya']>=.55 or (score['hsv_bhattacharyya']>=.30 and score['dhash_difference']>=.48)
        results.append(dict(base,status='flagged' if drift else 'compatible_unverified',
                            reason=('Écart d’apparence à examiner' if drift else 'Apparence compatible; identité NON prouvée'),metrics=score))
    counts={state:sum(r['status']==state for r in results) for state in sorted(STATES)}
    return {'schema_version':VERSION,'evaluation_type':'local_heuristic_visual_review',
            'video_model_connected':False,'identity_proven':False,'automatically_approved':False,
            'samples_original_pixels_exported':False,'frames_saved':False,'network_requests':False,
            'checks':results,'counts':counts,'limitations':[
              'Aucune preuve biométrique ou anatomique d’identité',
              'Des sujets différents mais similaires peuvent recevoir un score compatible',
              'Changements légitimes de lumière ou de plan peuvent déclencher une alarme',
              'Toute continuité entre deux cadrages différents exige une vérification humaine'
            ]}

def cli() -> None:
    p=argparse.ArgumentParser(description='P4 QA de continuité locale, sans moteur vidéo GPU')
    p.add_argument('manifest');p.add_argument('evidence');p.add_argument('clips_dir')
    p.add_argument('--output',default=None)
    a=p.parse_args()
    report=assess(load_json(a.manifest),load_json(a.evidence),Path(a.clips_dir))
    data=json.dumps(report,ensure_ascii=False,indent=2)+'\n'
    if a.output:
        target=Path(a.output);check(target.suffix.lower()=='.json','Sortie JSON uniquement')
        target.write_text(data,encoding='utf-8')
    else: print(data)

if __name__=='__main__':cli()
