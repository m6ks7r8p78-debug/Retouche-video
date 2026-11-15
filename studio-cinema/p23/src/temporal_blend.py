"""Cinema P23 — temporal alpha blending and measured continuity of fictional P21 vector controls.

This is NOT a video restoration algorithm and makes no claim of anatomical fidelity.
It executes the checked-in P19 renderer via the P22 bridge and changes no production media.
No source pixels from a real person, network calls, private media, or AI training.
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

SRC = Path(__file__).resolve()
CINEMA = SRC.parents[2]
sys.path.insert(0, str(CINEMA / "p22" / "src"))
from render_p22 import load_controls, draw_p19, overlay_p21, mouth_roi, breath_audio, W, H

VERSION = "retouche-cinema-p23-temporal-blend-v1"
GESTURES = (
    ("lower_lip_bite", "p21_lower_lip_bite"),
    ("lip_lick_lower", "p21_lip_lick_lower"),
    ("tongue_visible", "p21_tongue_visible"),
    ("tongue_retract", "p21_tongue_retract"),
)
BOOL_FIELDS = tuple(field for _, field in GESTURES)


def clamp01(v):
    if not isinstance(v, (int, float)) or not math.isfinite(v) or v < 0 or v > 1.001:
        raise ValueError("Invalid synthetic gesture intensity")
    return min(1.0, max(0.0, float(v)))


def strength(pose, name):
    if name == "lower_lip_bite":
        value = pose["p21_lower_lip_fold"] / 0.006
    elif name == "lip_lick_lower":
        value = pose["p21_lip_lick_strength"]
    elif name == "tongue_visible":
        value = pose["p21_tongue_extension"] / 0.008
    elif name == "tongue_retract":
        value = pose["p21_tongue_retract_strength"]
    else:
        raise ValueError("Unsupported P21 label")
    return clamp01(value)


def ease(v):
    u = clamp01(v)
    return u*u*(3 - 2*u)


def _isolated_pose(pose, name, force=False):
    f = dict(pose)
    key = dict(GESTURES)[name]
    for field in BOOL_FIELDS:
        f[field] = False
    # When a numeric envelope is just starting, allow a faint draw even though
    # P21's categorical flag has not yet crossed its observational threshold.
    f[key] = bool(force or pose[key])
    if name == "tongue_visible" and f[key] and f.get("p21_tongue_tip_xy") is None:
        # P21 only publishes a vector tip after the categorical threshold.
        # Never guess a missing landmark or claim a real measured point.
        f[key] = False
    return f


def isolate(original, pose, name, soft):
    """Return one P21 gesture only, using the authentic P22 overlay."""
    if name not in dict(GESTURES):
        raise ValueError("Unknown P21 gesture")
    u = strength(pose, name)
    if u <= 0:
        return original.copy()
    src = _isolated_pose(pose, name, force=soft)
    if not src[dict(GESTURES)[name]]:
        return original.copy()
    target = overlay_p21(original, src)
    if not soft:
        return target
    alpha = ease(u)
    # Elementwise alpha compositing is deterministic at 8 bit output.
    if alpha <= 0:
        return original.copy()
    return cv2.addWeighted(original, 1.0 - alpha, target, alpha, 0)


def blend_p23(original, pose):
    """Compose independent softened gestures; original P19 pixels stay untouched outside ROI."""
    image = original.copy()
    for name, _ in GESTURES:
        u = strength(pose, name)
        if not u:
            continue
        f = _isolated_pose(pose, name, force=True)
        if not f[dict(GESTURES)[name]]:
            continue
        candidate = overlay_p21(image, f)
        image = cv2.addWeighted(image, 1-ease(u), candidate, ease(u), 0)
    x0, y0, x1, y1 = mouth_roi(original, pose)
    # Enforce locality even if the existing renderer changes in a future PR.
    if np.any(image[:y0] != original[:y0]) or np.any(image[y1:] != original[y1:]) or (
        np.any(image[y0:y1, :x0] != original[y0:y1, :x0]) or
        np.any(image[y0:y1, x1:] != original[y0:y1, x1:])):
        raise ValueError("P23 rendered outside the P19 mouth ROI")
    return image


def residual_energy(base, frame, pose):
    x0,y0,x1,y1 = mouth_roi(base, pose)
    a = base[y0:y1,x0:x1].astype(np.int16)
    b = frame[y0:y1,x0:x1].astype(np.int16)
    return float(np.mean(np.abs(a-b)))


def changed_pixels(base, output, pose, threshold=8):
    x0,y0,x1,y1=mouth_roi(base,pose)
    a=base[y0:y1,x0:x1].astype(np.int16)
    b=output[y0:y1,x0:x1].astype(np.int16)
    return int(np.count_nonzero(np.any(np.abs(a-b)>=threshold, axis=2)))


def mobile_changed_pixels(before, after, width=360):
    if width not in (240, 360):
        raise ValueError("Synthetic preview supports 240 and 360 px checks only")
    a=cv2.resize(before,(width,width),interpolation=cv2.INTER_AREA)
    b=cv2.resize(after,(width,width),interpolation=cv2.INTER_AREA)
    return int(np.count_nonzero(np.any(np.abs(a.astype(np.int16)-b.astype(np.int16))>=6,axis=2)))


def audit(data):
    frames=data["frames"]
    if len(frames)!=480 or data.get("fps")!=60 or data.get("provenance")!="synthetic_procedural_only":
        raise ValueError("Only P22 verified 480-pose synthetic source supported")
    results={}
    for label, flag in GESTURES:
        first = next((i for i,f in enumerate(frames) if f[flag]), None)
        if first is None or first < 1:
            raise ValueError("Missing P21 synthetic gesture sample")
        peak = max(range(len(frames)), key=lambda i: strength(frames[i],label))
        if strength(frames[peak],label)<0.98:
            raise ValueError("Gesture did not reach its synthetic control peak")
        before=frames[first-1]
        at=frames[first]
        f0=draw_p19(before,first-1,len(frames))
        f1=draw_p19(at,first,len(frames))
        old0=isolate(f0,before,label,soft=False)
        old1=isolate(f1,at,label,soft=False)
        new0=isolate(f0,before,label,soft=True)
        new1=isolate(f1,at,label,soft=True)
        old_jump=abs(residual_energy(f1,old1,at)-residual_energy(f0,old0,before))
        new_jump=abs(residual_energy(f1,new1,at)-residual_energy(f0,new0,before))
        fpeak=frames[peak]
        raw=draw_p19(fpeak,peak,len(frames))
        drawn=isolate(raw,fpeak,label,soft=True)
        results[label]={
            "onset_frame":first,
            "onset_seconds":round(first/60,4),
            "raw_p22_onset_residual_jump":round(old_jump,6),
            "p23_onset_residual_jump":round(new_jump,6),
            "onset_jump_reduced":new_jump<old_jump,
            "peak_frame":peak,
            "peak_synthetic_visible_pixels":changed_pixels(raw,drawn,fpeak),
            "peak_changed_pixels_360px":mobile_changed_pixels(raw,drawn,360),
            "peak_changed_pixels_240px":mobile_changed_pixels(raw,drawn,240),
        }
    # Cross-gesture and idle pixel locality over every P19/P21 source frame.
    idle_samples=0
    max_outside=0
    for i,f in enumerate(frames):
        # Include every active sample and a representative set of idle frames.
        active=any(strength(f,name)>0 for name,_ in GESTURES)
        if not active and i%30!=0:
            continue
        base=draw_p19(f,i,len(frames))
        out=blend_p23(base,f)
        x0,y0,x1,y1=mouth_roi(base,f)
        if np.any(out[:y0]!=base[:y0]) or np.any(out[y1:]!=base[y1:]):
            max_outside+=1
        if not active:
            idle_samples+=1
            if not np.array_equal(out,base):
                raise ValueError("P23 changed an inactive frame")
    ok=(all(v["onset_jump_reduced"] for v in results.values()) and
        all(v["peak_synthetic_visible_pixels"]>=15 for v in results.values()) and
        all(v["peak_changed_pixels_360px"]>0 for v in results.values()) and
        max_outside==0 and idle_samples>=10)
    return {"schema":"retouche-cinema-p23-temporal-qa-v1",
        "status":"synthetic_temporal_gate_pass" if ok else "review_required",
        "frames":len(frames),"source":"P19_P21_P22_synthetic_only",
        "gesture_onsets":results,"idle_frames_checked":idle_samples,
        "outside_mouth_violations":max_outside,
        "comparisons_are_exploratory_not_perceptually_calibrated":True,
        "reduced_resolution_pixel_changes_are_not_mobile_readability_proof":True,
        "human_motion_certified":False,"anatomy_certified":False,
        "physical_iphone_tested":False,"person_media_accessed":False,
        "model_trained":False,"automatic_video_restoration":False}


def render_movie(data, target_dir):
    if not shutil.which("ffmpeg"):
        raise RuntimeError("FFmpeg needed to encode synthetic preview")
    target=Path(target_dir)
    target.mkdir(parents=True, exist_ok=True)
    frames=data["frames"]
    with tempfile.TemporaryDirectory(prefix="cinema-p23-") as tmp:
        audio=Path(tmp)/"synthetic_audio.wav"
        breath_audio(audio,fps=24000,seconds=8,seed=data["seed"])
        movie=target/"P23_temporal_blend_synthetic_60fps.mp4"
        cmd=["ffmpeg","-nostdin","-y","-hide_banner","-loglevel","error",
            "-f","rawvideo","-pixel_format","bgr24","-video_size",f"{W}x{H}",
            "-framerate","60","-i","pipe:0","-i",str(audio),
            "-map","0:v:0","-map","1:a:0",
            "-c:v","libx264","-preset","ultrafast","-crf","25",
            "-pix_fmt","yuv420p","-c:a","aac","-b:a","96k",
            "-ar","24000","-t","8","-movflags","+faststart",str(movie)]
        process=subprocess.Popen(cmd,stdin=subprocess.PIPE)
        try:
            for i,pose in enumerate(frames):
                base=draw_p19(pose,i,len(frames))
                frame=blend_p23(base,pose)
                if i in (0,285,291,430,446,457):
                    label=f"frame_{i:03d}"
                    cv2.imwrite(str(target/f"{label}_P19.png"),base)
                    cv2.imwrite(str(target/f"{label}_P23.png"),frame)
                process.stdin.write(frame.tobytes())
        finally:
            process.stdin.close()
        if process.wait()!=0:
            raise RuntimeError("P23 FFmpeg encoding failed")
    return movie


def main():
    p=argparse.ArgumentParser()
    p.add_argument("--data",type=Path,required=True)
    p.add_argument("--out",type=Path,required=True)
    p.add_argument("--render-preview",action="store_true")
    args=p.parse_args()
    data=load_controls(args.data)
    report=audit(data)
    args.out.mkdir(parents=True,exist_ok=True)
    (args.out/"p23_temporal_qa.json").write_text(json.dumps(report,indent=2),encoding="utf-8")
    print(json.dumps(report,indent=2))
    if report["status"]!="synthetic_temporal_gate_pass":
        raise SystemExit("P23 continuity checks require review")
    if args.render_preview:
        print("P23_SYNTHETIC_MOVIE",render_movie(data,args.out))


if __name__=="__main__":
    main()
