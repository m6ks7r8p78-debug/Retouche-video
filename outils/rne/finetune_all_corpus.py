#!/usr/bin/env python3
"""RNE 0.3 — optional private fine-tuning on EVERY authorized corpus clip.

Use only AFTER the previous model's independent validation and evaluation
are complete. Once this starts, the old test set becomes training data.
The result has NO independent held-out test and MUST NOT be deployed blindly.
This code contains no personal manifest, video, frame, hash, or weights.
"""
from __future__ import annotations

import argparse
import json
import random
import time
from pathlib import Path

import cv2
import numpy as np
import torch
from torch.nn import functional as F

from prepare_triad import require_outside_git, verify_manifest
from triad import RNE03, alignment


def audit_all_corpus(entries: list[dict], expected_count: int) -> dict:
    """Check all clips are eligible for the post-evaluation, all-in stage."""
    if not isinstance(entries, list) or len(entries) != expected_count or expected_count < 3:
        raise ValueError('Incomplete or unexpected corpus length')
    ids = set()
    groups = set()
    for entry in entries:
        if not isinstance(entry, dict) or not isinstance(entry.get('id'), str):
            raise ValueError('Invalid corpus entry')
        if entry['id'] in ids:
            raise ValueError('Duplicate opaque video ID')
        ids.add(entry['id'])
        groups.add(entry.get('group'))
        if entry.get('private_training_consent') is not True:
            raise PermissionError('Every source needs private training authorization')
        if entry.get('private_evaluation_consent') is not True:
            raise PermissionError('Private evaluation authorization missing')
        if entry.get('publication', False) is not False:
            raise PermissionError('Publishing media is prohibited')
    return {'videos': len(ids), 'groups': len(groups)}


def create_sample(path: Path, seed: int) -> dict:
    rng = random.Random(seed)
    with np.load(path, allow_pickle=False) as arr:
        prev2, prev1, current = arr['prev2'], arr['prev1'], arr['current']
    def lower(img):
        h, w = img.shape[:2]
        lo = cv2.resize(img, (w // 2, h // 2), interpolation=cv2.INTER_AREA)
        if rng.random() < .3:
            ok, data = cv2.imencode('.jpg', lo,
                                    [cv2.IMWRITE_JPEG_QUALITY, rng.choice([50,65,80,90])])
            if ok:
                lo = cv2.imdecode(data, cv2.IMREAD_COLOR)
        if rng.random() < .4:
            noise = np.random.default_rng(rng.getrandbits(64)).normal(
                0, rng.choice([1.5,3.,5.]), lo.shape)
            lo = np.clip(lo.astype(np.float32) + noise, 0, 255).astype(np.uint8)
        return lo
    p2, p1, curr = [lower(x) for x in (prev2, prev1, current)]
    w1, c1 = alignment(curr, p1)
    w2, c2 = alignment(curr, p2)
    def rgb(x):
        return torch.from_numpy(np.ascontiguousarray(x[:, :, ::-1])).permute(2,0,1).float() / 255
    return {'cur': rgb(curr), 'prev1': rgb(w1), 'prev2': rgb(w2),
            'conf1': torch.from_numpy(c1.copy())[None],
            'conf2': torch.from_numpy(c2.copy())[None],
            'hr': rgb(current)}


def crop_sample(case, rng, size=32):
    h, w = case['cur'].shape[-2:]
    if min(h,w) < size:
        raise ValueError('Insufficient source dimensions')
    x, y = rng.randrange(w-size+1), rng.randrange(h-size+1)
    result = {k: (v[:,2*y:2*(y+size),2*x:2*(x+size)] if k == 'hr'
                  else v[:,y:y+size,x:x+size]) for k,v in case.items()}
    if rng.random() < .5:
        result = {k:v.flip(-1) for k,v in result.items()}
    if rng.random() < .5:
        result = {k:v.flip(-2) for k,v in result.items()}
    return result


def finetune(*, manifest: Path, cache_dir: Path, initial_weights: Path, output: Path,
             expected_count: int, steps: int = 450, batch: int = 8,
             seed: int = 2026111403) -> dict:
    if not 40 <= steps <= 5000 or not 1 <= batch <= 32:
        raise ValueError('Training budget outside safe limits')
    if initial_weights.resolve() == (output/'rne03_all_corpus_private.pt').resolve():
        raise ValueError('Do not overwrite initial benchmark checkpoint')
    output = require_outside_git(output)
    records = json.loads(manifest.read_text(encoding='utf-8'))
    summary = audit_all_corpus(records, expected_count)
    # Re-verify SHA-256 of every original video and legacy split integrity.
    verify_manifest(records, expected_count=expected_count)
    ids = {rec['id'] for rec in records}
    paths = sorted(cache_dir.glob('*_*.npz'))
    if not paths:
        raise ValueError('Empty private triplet cache')
    counts = {i:0 for i in ids}
    for path in paths:
        stem, sep, suffix = path.stem.rpartition('_')
        if not sep or stem not in counts or not suffix.isdigit():
            raise ValueError('Unknown private cache entry')
        counts[stem] += 1
    if not all(counts.values()):
        raise ValueError('Not all authorized videos have a cached triplet')
    if steps * batch < len(paths) + batch:
        raise ValueError('Training schedule too short to cover every sample')
    torch.set_num_threads(2)
    cv2.setNumThreads(1)
    torch.manual_seed(seed)
    rng = random.Random(seed)
    model = RNE03()
    old = torch.load(initial_weights, map_location='cpu', weights_only=True)
    if not isinstance(old, dict) or set(old) != set(model.state_dict()):
        raise ValueError('Incompatible initial tensor weights')
    model.load_state_dict(old, strict=True)
    model.train()
    clock = time.monotonic()
    cases = [(p.stem.rpartition('_')[0],
              create_sample(p, seed + sum((i+1)*ord(ch) for i,ch in enumerate(p.stem))))
             for p in paths]
    seen = set()
    seen_triples = set()
    opt = torch.optim.Adam(model.parameters(), lr=.0002)
    losses = []
    rng.shuffle(cases)
    cursor = 0
    for index in range(steps):
        if cursor + batch > len(cases):
            rng.shuffle(cases)
            cursor = 0
        rows = cases[cursor:cursor+batch]
        cursor += batch
        seen.update(k for k,_ in rows)
        seen_triples.update(id(c) for _,c in rows)
        samples = [crop_sample(c, rng) for _,c in rows]
        pack = lambda k:torch.stack([s[k] for s in samples])
        cur, p1, p2, c1, c2, hr = [pack(k) for k in ('cur','prev1','prev2','conf1','conf2','hr')]
        loss = F.mse_loss(model(cur,p1,p2,c1,c2), hr)
        opt.zero_grad(set_to_none=True)
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(),1.)
        opt.step()
        losses.append(float(loss.detach()))
        if index+1 in (100,225,350):
            new_lr = {100:.00012, 225:.00008, 350:.00004}[index+1]
            for group in opt.param_groups:
                group['lr'] = new_lr
    if seen != ids or len(seen_triples) != len(paths):
        raise RuntimeError('Some authorized videos were not used during training')
    output.mkdir(parents=True, exist_ok=True)
    name = 'rne03_all_corpus_private.pt'
    torch.save(model.cpu().state_dict(), output/name)
    report = {
      'version':'RNE 0.3 post-benchmark all-corpus fine-tune',
      'consented_videos_used':len(seen), 'groups':summary['groups'],
      'real_video_triplets_used':len(seen_triples), 'steps':steps,'batch':batch,
      'first_30_training_loss':round(float(np.mean(losses[:30])),7),
      'last_30_training_loss':round(float(np.mean(losses[-30:])),7),
      'training_seconds':round(time.monotonic()-clock,2),
      'new_untouched_test_after_finetune':False,
      'model_never_auto_deployed':True,
      'reference_benchmark_checkpoint_preserved':True,
      'warning':'All prior train/validation/test videos are now used in training. '
                'Only an independent new corpus can establish generalization.'
    }
    (output/'rne03_all_corpus_report_private.json').write_text(
        json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    return report


def main():
    p = argparse.ArgumentParser(description='RNE 0.3 post-evaluation private all-corpus training')
    p.add_argument('--manifest', type=Path, required=True)
    p.add_argument('--cache-dir', type=Path, required=True)
    p.add_argument('--initial-weights', type=Path, required=True)
    p.add_argument('--output', type=Path, required=True)
    p.add_argument('--expected-count', type=int, default=157)
    p.add_argument('--steps', type=int, default=450)
    p.add_argument('--batch', type=int, default=8)
    p.add_argument('--private-training-authorized', action='store_true', required=True)
    p.add_argument('--acknowledge-evaluation-complete', action='store_true', required=True)
    args = p.parse_args()
    if not args.private_training_authorized or not args.acknowledge_evaluation_complete:
        raise PermissionError('Private training consent and completed benchmark required')
    print(json.dumps(finetune(manifest=args.manifest,cache_dir=args.cache_dir,
                            initial_weights=args.initial_weights,output=args.output,
                            expected_count=args.expected_count,steps=args.steps,batch=args.batch),
                     ensure_ascii=False,indent=2))


if __name__ == '__main__':
    main()
