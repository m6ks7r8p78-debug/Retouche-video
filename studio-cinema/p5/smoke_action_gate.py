"""RetoucheCinema P5: non-biometric, 2D smoke-action QA and private source audit.

A candidate-only gate: geometric consistency is not proof that a person smokes,
that a video is authentic, or that the motion is physically correct in 3D.
No raw frames, face embeddings, or identifying media are exported.
"""
from __future__ import annotations
from dataclasses import dataclass
from pathlib import Path
import hashlib, json, math, re
from typing import Any

SCHEMA = 'retouche-smoke-action-v1'
PHASES = ('idle', 'raise', 'lip_contact', 'inhale', 'lower', 'exhale', 'smoke_drift')
PHASE_RANK = {x: i for i, x in enumerate(PHASES)}
HEX64 = re.compile(r'^[0-9a-f]{64}$')


class GateError(ValueError):
    pass


def sha256(path: str | Path) -> str:
    h = hashlib.sha256()
    with open(path, 'rb') as fp:
        for block in iter(lambda: fp.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def _point(f: dict, name: str, required: bool = True):
    v = f.get(name)
    if v is None and not required:
        return None
    if not (isinstance(v, list) and len(v) == 2 and all(type(x) in (int, float) and math.isfinite(x) and 0 <= x <= 1 for x in v)):
        raise GateError(f'{name}: expected a normalized x/y pair in [0,1]')
    return v


def _distance(a, b):
    return math.hypot(a[0]-b[0], a[1]-b[1])


def evaluate_annotation(doc: dict[str, Any]) -> dict[str, Any]:
    """Evaluate a HUMAN-reviewed annotation only; no recognition is performed.

    Always returns candidate/review/rejected, never identity_verified or realistic.
    Rights and verified-adult gating precede any geometric score.
    """
    if not isinstance(doc, dict) or doc.get('schema') != SCHEMA:
        raise GateError('unsupported schema')
    flags = doc.get('eligibility') or {}
    required = ('rights_verified', 'adult_verified', 'nonsexual_scene_verified', 'local_training_authorized')
    if not all(flags.get(k) is True for k in required):
        return {'schema': SCHEMA, 'status': 'rejected', 'reasons': ['manual_eligibility_not_verified'], 'events': {}, 'identity_verified': False}
    identifier = doc.get('subject_id')
    obj = doc.get('cigarette_id')
    if not isinstance(identifier, str) or not identifier or not isinstance(obj, str) or not obj:
        raise GateError('stable subject_id and cigarette_id required')
    frames = doc.get('frames')
    if not isinstance(frames, list) or len(frames) < 6 or len(frames) > 12000:
        raise GateError('6–12000 annotated frames required')
    previous_t, previous_rank, last_smoke = -1.0, -1, None
    issues = []
    events = {}
    for i, f in enumerate(frames):
        if not isinstance(f, dict):
            raise GateError('invalid frame')
        t = f.get('t')
        if type(t) not in (int, float) or not math.isfinite(t) or t < 0 or t <= previous_t:
            raise GateError('nonmonotonic or invalid frame time')
        previous_t = t
        phase = f.get('phase')
        if phase not in PHASE_RANK:
            raise GateError('unknown phase')
        rank = PHASE_RANK[phase]
        if rank < previous_rank:
            issues.append('phase_order_regression')
        previous_rank = rank
        if f.get('subject_id') != identifier or f.get('cigarette_id') != obj:
            issues.append('entity_id_changes')
        mouth, tip, fingers = _point(f, 'mouth'), _point(f, 'cigarette_tip'), _point(f, 'fingers')
        smoke = _point(f, 'smoke_center', required=False)
        events[phase] = events.get(phase, 0) + 1
        # Normalized screen distances are *heuristics*, not 3D physics.
        if _distance(tip, fingers) > 0.17:
            issues.append('cigarette_hand_contact_uncertain')
        if phase in ('lip_contact', 'inhale') and _distance(tip, mouth) > 0.11:
            issues.append('lip_contact_mismatch')
        if phase in ('exhale', 'smoke_drift') and smoke is None:
            issues.append('smoke_visibility_unconfirmed')
        if smoke is not None:
            if phase == 'exhale' and last_smoke is None and _distance(smoke, mouth) > 0.25:
                issues.append('smoke_origin_uncertain')
            if last_smoke is not None and _distance(smoke, last_smoke) > 0.33:
                issues.append('smoke_motion_jump')
            last_smoke = smoke
    for mandatory in ('raise', 'lip_contact', 'inhale', 'lower', 'exhale'):
        if mandatory not in events:
            issues.append('missing_phase_' + mandatory)
    issues = sorted(set(issues))
    return {'schema': SCHEMA, 'status': 'review_required' if issues else 'candidate_only',
            'reasons': issues, 'events': events, 'frame_count': len(frames),
            'duration_seconds': round(frames[-1]['t'] - frames[0]['t'], 3),
            'identity_verified': False, 'physical_realism_verified': False}


def audit_private_sources(records: list[dict[str, Any]]) -> dict[str, Any]:
    """Verifies hash and group-split integrity. Does NOT auto-label smoking or adults.

    Records may contain local file paths but output never includes them.
    Unknown adult status -> excludes source from supervised learning.
    """
    ids = set()
    seen_hash = {}
    group_splits = {}
    entries = []
    for r in records:
        ident = r['id']
        if not re.fullmatch(r'V\d{3}', ident) or ident in ids:
            raise GateError('duplicate or invalid source ID')
        ids.add(ident)
        if r['split'] not in ('train', 'validation', 'test'):
            raise GateError('invalid split')
        group = r['group']
        split = r['split']
        if group in group_splits and group_splits[group] != split:
            raise GateError('near-duplicate group crosses train/validation/test')
        group_splits[group] = split
        path = Path(r['path'])
        digest = sha256(path)
        expected = r['expected_sha256']
        if not isinstance(expected, str) or not HEX64.fullmatch(expected) or digest != expected:
            raise GateError(f'hash mismatch for {ident}')
        if digest in seen_hash and seen_hash[digest] != split:
            raise GateError('exact duplicate crosses train/validation/test')
        seen_hash[digest] = split
        eligible = (r.get('adult_verified') is True and r.get('nonsexual_scene_verified') is True
                    and r.get('rights_verified') is True and r.get('training_authorized') is True)
        entries.append({'id': ident, 'split': split, 'source_sha256': digest,
                        'verified_original': True, 'eligible_for_action_training': eligible,
                        'annotation_status': 'needs_manual_phase_labels' if eligible else 'needs_scene_review'})
    return {'schema': 'retouche-smoke-source-audit-v1', 'sources_verified': len(entries),
            'eligible_for_action_training': sum(1 for e in entries if e['eligible_for_action_training']),
            'sources': entries, 'raw_frames_exported': False, 'identity_features_exported': False}


def write_privacy_safe_json(obj, path: str | Path):
    data = json.dumps(obj, ensure_ascii=False, indent=2, sort_keys=True)
    # No original local file paths, explicit file names, or raw media in public outputs.
    if any(token in data.lower() for token in ('"path"', '"filename"', '"image_bytes"', '"face_embedding"')):
        raise GateError('privacy-sensitive field found in serialized output')
    Path(path).write_text(data + '\n', encoding='utf-8')
