"""P22 isolated synthetic vector observability proof using the ORIGINAL P19 renderer.
P19 unchanged; P21 overlay is added only in local synthetic preview pixels.
Not an anatomical/photorealistic result, not a user's video, no internet/upload.
"""
from __future__ import annotations
import argparse
import json
import math
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import cv2
import numpy as np

CINEMA = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(CINEMA / "p19" / "src"))
from render_p19 import W, H, draw as draw_p19, breath_audio

SCHEMA = "retouche-cinema-p22-vector-preview-v1"
LABELS = {
    "lower_lip_bite": "p21_lower_lip_bite",
    "lip_lick_lower": "p21_lip_lick_lower",
    "tongue_visible": "p21_tongue_visible",
    "tongue_retract": "p21_tongue_retract",
}
MOUTH_RADIUS_X = 46
MOUTH_RADIUS_Y = 31
# These are purely illustrative prototype thresholds, not calibrated clinical
# visibility thresholds or human-naturalness scores.
MIN_CHANGED_PIXELS = 15
MIN_SAMPLES = 3


def load_controls(path: Path):
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(data, dict) or data.get("schema") != SCHEMA:
        raise ValueError("Incorrect synthetic preview schema")
    if data.get("provenance") != "synthetic_procedural_only" or data.get("source_media_accessed") is not False:
        raise ValueError("Cannot accept real video or unknown provenance")
    if data.get("visual_qa_not_human_realism") is not True:
        raise ValueError("Preview must not claim human realism")
    if data.get("fps") != 60 or data.get("clip_duration_s") != 8:
        raise ValueError("P22 pilot requires an 8s / 60 fps synthetic sequence")
    frames = data.get("frames")
    if not isinstance(frames, list) or len(frames) != 480:
        raise ValueError("Expected 480 original P21 synthetic control poses")
    for i, f in enumerate(frames):
        if not isinstance(f, dict) or abs(f.get("t", -100) - i / 60) > 1e-4:
            raise ValueError("Frame timestamp invalid")
        if f.get("generated_control_pose") is not True or f.get("pixel_frame_generated") is not False:
            raise ValueError("P19 provenance invalid")
        if f.get("p21_generated_semantics", {}).get("source") != "fictional_procedural":
            raise ValueError("P21 procedural source invalid")
        if f["p21_generated_semantics"].get("human_gesture_verified") is not False:
            raise ValueError("Human motion cannot be certified")
        if not isinstance(f.get("mouth_xy"), list) or len(f["mouth_xy"]) != 2:
            raise ValueError("Mouth control missing")
        if not all(isinstance(v, (int, float)) and math.isfinite(v) and 0 <= v <= 1 for v in f["mouth_xy"]):
            raise ValueError("Mouth coordinates invalid")
        for field in LABELS.values():
            if not isinstance(f.get(field), bool):
                raise ValueError("New gesture flag missing")
        if f["p21_tongue_visible"] and not isinstance(f.get("p21_tongue_tip_xy"), list):
            raise ValueError("P21 tip missing")
    return data


def mouth_roi(frame, pose):
    mx = int(round(pose["mouth_xy"][0] * W))
    my = int(round(pose["mouth_xy"][1] * H))
    x0 = max(0, mx - MOUTH_RADIUS_X)
    x1 = min(W, mx + MOUTH_RADIUS_X + 1)
    y0 = max(0, my - MOUTH_RADIUS_Y)
    y1 = min(H, my + MOUTH_RADIUS_Y + 1)
    if x1 <= x0 or y1 <= y0:
        raise ValueError("Mouth ROI out of image")
    return x0, y0, x1, y1


def overlay_p21(original, pose):
    """Adds localized graphics in the P19 mouth ROI, never replaces P19 content."""
    frame = original.copy()
    mx = int(round(pose["mouth_xy"][0] * W))
    my = int(round(pose["mouth_xy"][1] * H))
    if pose["p21_lower_lip_bite"]:
        strength = float(pose["p21_lower_lip_fold"]) / .006
        cv2.ellipse(frame, (mx, my + 7), (max(8, int(13 * strength)), 3), 0,
                    12, 168, (54, 48, 91), 2, cv2.LINE_AA)
        cv2.line(frame, (mx - 8, my + 10), (mx + 8, my + 10),
                 (94, 114, 160), 1, cv2.LINE_AA)
    if pose["p21_tongue_visible"]:
        tip = pose["p21_tongue_tip_xy"]
        tx, ty = (int(round(tip[0] * W)), int(round(tip[1] * H)))
        cv2.ellipse(frame, (mx, my + 6), (8, 5), 0, 0, 360,
                    (120, 112, 202), -1, cv2.LINE_AA)
        cv2.line(frame, (mx, my + 5), (tx, ty), (119, 106, 210), 5, cv2.LINE_AA)
        cv2.circle(frame, (tx, ty), 3, (136, 122, 228), -1, cv2.LINE_AA)
    if pose["p21_lip_lick_lower"]:
        strength = float(pose["p21_lip_lick_strength"])
        cv2.ellipse(frame, (mx, my + 9), (max(7, int(10 + 5 * strength)), 3),
                    0, 195, 343, (199, 182, 236), 2, cv2.LINE_AA)
    if pose["p21_tongue_retract"]:
        strength = float(pose["p21_tongue_retract_strength"])
        cv2.ellipse(frame, (mx, my + 8), (6, max(1, int(2 + strength))), 0,
                    0, 175, (102, 85, 143), 2, cv2.LINE_AA)
    return frame


def pixel_metrics(before, after, pose):
    if before.shape != after.shape or before.dtype != np.uint8 or after.dtype != np.uint8:
        raise ValueError("Pixel comparison requires matching 8-bit images")
    difference = np.abs(after.astype(np.int16) - before.astype(np.int16))
    mask = np.any(difference >= 12, axis=2)
    x0, y0, x1, y1 = mouth_roi(before, pose)
    inside = mask[y0:y1, x0:x1]
    outside = mask.copy()
    outside[y0:y1, x0:x1] = False
    roi_delta = difference[y0:y1, x0:x1]
    return {
        "mouth_changed_pixels": int(np.count_nonzero(inside)),
        "outside_mouth_changed_pixels": int(np.count_nonzero(outside)),
        "mouth_mean_rgb_abs_delta": round(float(np.mean(roi_delta)), 5),
    }


def audit(data):
    frames = data["frames"]
    results = {name: [] for name in LABELS}
    idle = []
    for i, f in enumerate(frames):
        is_active = any(f[field] for field in LABELS.values())
        if not is_active and i % 30 != 0:
            continue
        # This is the real P19 vector frame, not a stand-in renderer.
        before = draw_p19(f, i, len(frames))
        after = overlay_p21(before, f)
        metrics = pixel_metrics(before, after, f)
        if metrics["outside_mouth_changed_pixels"]:
            raise ValueError("Gesture overlay edited outside mouth ROI")
        if is_active:
            for name, key in LABELS.items():
                if f[key]:
                    results[name].append(metrics["mouth_changed_pixels"])
        else:
            idle.append(metrics["mouth_changed_pixels"])
    checks = {}
    for name, values in results.items():
        checks[name] = {
            "samples": len(values),
            "maximum_changed_pixels": max(values, default=0),
            "median_changed_pixels": int(np.median(values)) if values else 0,
            "meets_vector_visibility_gate": len(values) >= MIN_SAMPLES and max(values, default=0) >= MIN_CHANGED_PIXELS,
        }
    passed = bool(idle) and all(x == 0 for x in idle) and all(c["meets_vector_visibility_gate"] for c in checks.values())
    return {
        "schema": "retouche-cinema-p22-pixel-qa-v1",
        "status": "synthetic_vector_pixel_gate_pass" if passed else "review_required",
        "proof": "original_P19_vector_frame_plus_localized_P21_overlay",
        "frame_count": len(frames),
        "fps": data["fps"],
        "gesture_checks": checks,
        "idle_samples": len(idle),
        "idle_has_no_overlay": bool(idle) and all(x == 0 for x in idle),
        "all_modifications_inside_mouth_roi": True,
        "min_changed_pixel_gate_experimental": MIN_CHANGED_PIXELS,
        "no_media_upload": True,
        "human_realism_certified": False,
        "photographic_faces_generated": 0,
        "anatomical_accuracy_certified": False,
        "safari_iphone_physically_tested": False,
    }


def render_preview(data, output_dir):
    """Optional offline artifact; never written to main or served on a website."""
    if not shutil.which("ffmpeg"):
        raise RuntimeError("ffmpeg is required for reproducible H264/AAC preview")
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    frames = data["frames"]
    selected = {
        "initial": 0,
        "bite": 291,            # 4.85 seconds
        "lick": 446,            # 7.433 seconds
        "retract": 457,         # 7.616 seconds
    }
    with tempfile.TemporaryDirectory(prefix="cinema-p22-") as tmp:
        sound = Path(tmp) / "fictional_synthetic_breath.wav"
        breath_audio(sound, fps=24000, seconds=8, seed=data["seed"])
        movie = output_dir / "P22_vector_microgestures_synthetic_60fps.mp4"
        command = ["ffmpeg", "-nostdin", "-y", "-hide_banner", "-loglevel", "error",
                   "-f", "rawvideo", "-pixel_format", "bgr24", "-video_size", f"{W}x{H}",
                   "-framerate", "60", "-i", "pipe:0", "-i", str(sound),
                   "-map", "0:v:0", "-map", "1:a:0",
                   "-c:v", "libx264", "-preset", "ultrafast", "-crf", "25",
                   "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "96k", "-ar", "24000",
                   "-t", "8", "-movflags", "+faststart", str(movie)]
        process = subprocess.Popen(command, stdin=subprocess.PIPE)
        try:
            for i, pose in enumerate(frames):
                original = draw_p19(pose, i, len(frames))
                image = overlay_p21(original, pose)
                if i in selected.values():
                    label = next(k for k, v in selected.items() if v == i)
                    cv2.imwrite(str(output_dir / f"P22_{label}_baseline.png"), original)
                    cv2.imwrite(str(output_dir / f"P22_{label}_microgesture.png"), image)
                process.stdin.write(image.tobytes())
        finally:
            process.stdin.close()
        if process.wait() != 0:
            raise RuntimeError("Synthetic vector video encoding failed")
    return movie


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--render-preview", action="store_true")
    opts = parser.parse_args()
    data = load_controls(opts.data)
    report = audit(data)
    opts.out.mkdir(parents=True, exist_ok=True)
    (opts.out / "p22_visual_qa.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    if report["status"] != "synthetic_vector_pixel_gate_pass":
        raise SystemExit("P22 vector observability gate failed")
    if opts.render_preview:
        movie = render_preview(data, opts.out)
        print("SYNTHETIC_MP4", movie)
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
