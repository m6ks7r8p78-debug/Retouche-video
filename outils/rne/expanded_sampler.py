#!/usr/bin/env python3
"""RNE expanded, scene-aware and deduplicated private triplet sampler.

NO cloud, no media in Git; this program uses only a private manifest with
consent, SHA-256 and local paths. Copies are counted but never oversampled.
Frame positions are stratified across the *duration*, not all frames scanned.
"""
from __future__ import annotations
import argparse, hashlib, json, math, time
from collections import Counter, defaultdict
from pathlib import Path
import cv2
import numpy as np

ALLOWED = {'.mp4', '.mov', '.m4v'}


def outside_checkout(path: Path) -> Path:
    path = Path(path).resolve()
    if any((p / '.git').exists() for p in (path, *path.parents)):
        raise ValueError('Refusing private data in a Git checkout')
    return path


def check_manifest(records: list[dict], expected_count: int, verify_sha: bool = True):
    if not isinstance(records, list) or len(records) != expected_count or expected_count < 3:
        raise ValueError('Incomplete corpus')
    by_id, by_sha, by_group = set(), {}, defaultdict(list)
    for record in records:
        required = {'id', 'path', 'sha256', 'group', 'private_training_consent', 'private_evaluation_consent'}
        if not isinstance(record, dict) or not required.issubset(record):
            raise ValueError('Malformed entry')
        if not isinstance(record['id'], str) or not record['id'].startswith('V') or len(record['id']) != 4 or not record['id'][1:].isdigit() or record['id'] in by_id:
            raise ValueError('Invalid or duplicate opaque identifier')
        by_id.add(record['id'])
        if record['private_training_consent'] is not True or record['private_evaluation_consent'] is not True or record.get('publication', False) is not False:
            raise PermissionError('Explicit private training consent and no publication required for each video')
        path = Path(record['path']).resolve()
        if path.suffix.lower() not in ALLOWED or not path.is_file():
            raise ValueError('Missing or unsupported source')
        sha = record['sha256']
        if not isinstance(sha, str) or len(sha) != 64 or any(c not in '0123456789abcdef' for c in sha):
            raise ValueError('Invalid SHA-256')
        group = record['group']
        if not isinstance(group, str) or not group or len(group) > 100:
            raise ValueError('Invalid group')
        if verify_sha:
            digest = hashlib.sha256()
            with path.open('rb') as stream:
                for chunk in iter(lambda: stream.read(4 * 1024 * 1024), b''):
                    digest.update(chunk)
            if digest.hexdigest() != sha:
                raise ValueError('Source checksum mismatch')
        if sha in by_sha and by_sha[sha]['group'] != group:
            raise ValueError('Identical media in different scene groups')
        by_sha.setdefault(sha, record)
        by_group[group].append(record['id'])
    return by_sha, by_group


def resize_even(frame: np.ndarray, shortest: int = 144, longest: int = 192):
    h, w = frame.shape[:2]
    ratio = min(1., shortest / min(h, w), longest / max(h, w))
    nw, nh = 2 * max(16, round(w * ratio / 2)), 2 * max(16, round(h * ratio / 2))
    return cv2.resize(frame, (nw, nh), interpolation=cv2.INTER_AREA)


def extract_triplet(capture, start: int):
    capture.set(cv2.CAP_PROP_POS_FRAMES, max(0, int(start)))
    frames = []
    for _ in range(3):
        ok, image = capture.read()
        if not ok or image is None or image.ndim != 3 or min(image.shape[:2]) < 64:
            return None
        frames.append(resize_even(image))
    if not all(img.shape == frames[0].shape for img in frames):
        return None
    return frames


def selection_info(frames):
    a, b, c = frames
    gray = cv2.cvtColor(c, cv2.COLOR_BGR2GRAY)
    motion = max(float(np.mean(cv2.absdiff(a, b))), float(np.mean(cv2.absdiff(b, c)))) / 255.
    return {
        'motion': round(motion, 5),
        'luma': round(float(np.mean(gray)), 3),
        'laplacian': round(float(cv2.Laplacian(gray, cv2.CV_32F).var()), 3),
        'scene_cut': motion > .24,
        'low_information': float(np.std(gray)) < 2.5,
    }


def sample(records: list[dict], output: Path, count: int = 6, expected_count: int = 157, verify_sha=True):
    if not 2 <= count <= 12:
        raise ValueError('Use between 2 and 12 temporal positions per unique video')
    output = outside_checkout(output)
    by_sha, groups = check_manifest(records, expected_count, verify_sha)
    output.mkdir(parents=True, exist_ok=True)
    cv2.setNumThreads(1)
    starts = time.monotonic()
    stats = Counter()
    private_rows = []
    for record in by_sha.values():
        cap = cv2.VideoCapture(record['path'])
        if not cap.isOpened():
            stats['unreadable'] += 1
            continue
        total = cap.get(cv2.CAP_PROP_FRAME_COUNT)
        n = int(total) if math.isfinite(total) and total >= 3 else 0
        if n < 3:
            stats['unreadable'] += 1
            cap.release()
            continue
        starts_for_video = sorted(set(max(0, min(n - 3, round((k + .5) / count * (n - 3)))) for k in range(count)))
        good = 0
        for index, pos in enumerate(starts_for_video):
            frames = extract_triplet(cap, pos)
            if frames is None:
                stats['decode_windows_failed'] += 1
                continue
            info = selection_info(frames)
            if info['scene_cut']:
                stats['cut_windows_excluded'] += 1
                continue
            if info['low_information']:
                stats['uninformative_windows_excluded'] += 1
                continue
            checksum = hashlib.blake2b(frames[-1].tobytes(), digest_size=12).hexdigest()
            if any(x['frame_digest'] == checksum for x in private_rows if x['id'] == record['id']):
                stats['within_video_duplicate_window'] += 1
                continue
            destination = output / f"{record['id']}_{index:02d}.npz"
            np.savez_compressed(destination, prev2=frames[0], prev1=frames[1], current=frames[2])
            private_rows.append({'id': record['id'], 'group': record['group'], 'position': pos,
                                 'file': destination.name, 'frame_digest': checksum, **info})
            good += 1
        cap.release()
        stats['unique_files_decoded'] += 1
        stats['windows_saved'] += good
        if good == 0:
            stats['sources_without_valid_window'] += 1
    full = {
        'expected_videos': expected_count, 'unique_content': len(by_sha),
        'exact_copies_skipped': len(records) - len(by_sha),
        'groups': len(groups), 'samples': private_rows,
    }
    (output / 'sampling_private.json').write_text(json.dumps(full, ensure_ascii=False, indent=1), encoding='utf-8')
    public = {
        'videos_in_manifest': len(records), 'sha_checked': len(records) if verify_sha else 0,
        'unique_contents_attempted': len(by_sha), 'exact_copies_not_oversampled': len(records) - len(by_sha),
        'scene_groups': len(groups), 'nominal_windows_per_unique_video': count,
        'triplets_saved': stats['windows_saved'],
        'files_successfully_decoded': stats['unique_files_decoded'],
        'files_without_triplet': stats['sources_without_valid_window'] + stats['unreadable'],
        'cuts_rejected': stats['cut_windows_excluded'],
        'blank_or_static_rejected': stats['uninformative_windows_excluded'],
        'repeat_frames_rejected': stats['within_video_duplicate_window'],
        'windows_decode_failures': stats['decode_windows_failed'],
        'seconds': round(time.monotonic() - starts, 2),
        'status': 'private_training_corpus_only',
        'limitations': 'Sparse temporal sampling, not a full analysis of all video frames; no independent test set remains after all-corpus training.'
    }
    (output / 'sampling_aggregate.json').write_text(json.dumps(public, ensure_ascii=False, indent=2), encoding='utf-8')
    return public


def main():
    p = argparse.ArgumentParser(description='RNE diverse private sampling, all-consent corpus')
    p.add_argument('--manifest', type=Path, required=True)
    p.add_argument('--out', type=Path, required=True)
    p.add_argument('--expected-count', type=int, default=157)
    p.add_argument('--windows', type=int, default=6)
    p.add_argument('--authorized-private-training', action='store_true', required=True)
    args = p.parse_args()
    if not args.authorized_private_training:
        raise PermissionError('No consent')
    data = json.loads(args.manifest.read_text(encoding='utf-8'))
    print(json.dumps(sample(data, args.out, count=args.windows, expected_count=args.expected_count),
                     ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
