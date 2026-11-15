"""Cinema P24 — H.264 decoded-pixel audit of ORIGINAL synthetic P23 vector frames.

Distinguishes P19/P23 authoring differences from losses introduced by H.264.
No real media, no network, no semantic inference, no identity, no training.
Runtime RAM bounded: consumes two FFmpeg rawvideo decoders frame by frame.
"""
from __future__ import annotations

import argparse
import io
import json
import math
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import cv2
import numpy as np

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/"p23"/"src"))
from temporal_blend import (
    GESTURES, strength, draw_p19, blend_p23, mouth_roi, load_controls, W, H,
)

VERSION="retouche-cinema-p24-h264-decoded-qa-v1"
EXPECTED_VIDEO_NAME="P23_temporal_blend_synthetic_60fps.mp4"
NFRAMES=480
FPS="60/1"


def ensure_movie(path: Path):
    path=Path(path)
    if path.name!=EXPECTED_VIDEO_NAME or not path.is_file() or path.stat().st_size<=10_000:
        raise ValueError("Only the generated P23 synthetic review movie is accepted")
    return path


def probe_video(path:Path,expect_audio:bool):
    result=subprocess.run([
        "ffprobe","-v","error","-count_frames",
        "-show_entries","stream=codec_type,codec_name,r_frame_rate,nb_read_frames,width,height:format=duration",
        "-of","json",str(path)
    ],capture_output=True,text=True,check=True)
    return inspect_probe(json.loads(result.stdout),expect_audio=expect_audio)


def inspect_probe(data,expect_audio):
    if not isinstance(data,dict) or not isinstance(data.get("streams"),list):
        raise ValueError("Invalid ffprobe response")
    videos=[s for s in data["streams"] if s.get("codec_type")=="video"]
    audios=[s for s in data["streams"] if s.get("codec_type")=="audio"]
    if len(videos)!=1 or videos[0].get("codec_name")!="h264":
        raise ValueError("Exactly one H264 video stream required")
    v=videos[0]
    if v.get("r_frame_rate")!=FPS or int(v.get("nb_read_frames",0))!=NFRAMES:
        raise ValueError("Missing, repeated or mis-timed decoded video frames")
    if int(v.get("width",0))!=W or int(v.get("height",0))!=H:
        raise ValueError("Encoded dimensions invalid")
    if expect_audio:
        if len(audios)!=1 or audios[0].get("codec_name")!="aac":
            raise ValueError("P23 original synthetic AAC track must be preserved")
    elif audios:
        raise ValueError("Baseline comparison track must have no audio")
    duration=float(data.get("format",{}).get("duration",0))
    if not math.isfinite(duration) or abs(duration-8.0)>.12:
        raise ValueError("Video duration drifted")
    return {"codec":"h264","frames":NFRAMES,"fps":FPS,"duration_s":round(duration,4),
            "aac_synthetic":bool(expect_audio),"width":W,"height":H}


def build_baseline_video(data,out):
    """Encode the true P19 renderer with identical P23 libx264 video settings."""
    if not shutil.which("ffmpeg"):
        raise RuntimeError("FFmpeg required")
    target=Path(out)
    cmd=["ffmpeg","-nostdin","-y","-hide_banner","-loglevel","error",
        "-f","rawvideo","-pixel_format","bgr24","-video_size",f"{W}x{H}",
        "-framerate","60","-i","pipe:0",
        "-c:v","libx264","-preset","ultrafast","-crf","25",
        "-pix_fmt","yuv420p","-an","-movflags","+faststart",str(target)]
    process=subprocess.Popen(cmd,stdin=subprocess.PIPE,stderr=subprocess.PIPE)
    try:
        for i,pose in enumerate(data["frames"]):
            frame=draw_p19(pose,i,NFRAMES)
            process.stdin.write(frame.tobytes())
    except Exception:
        process.kill()
        process.wait()
        raise
    finally:
        if not process.stdin.closed:process.stdin.close()
    stderr=process.stderr.read()
    ret=process.wait()
    if ret:
        raise RuntimeError("Baseline vector encoding failed: "+stderr.decode(errors="replace")[:800])
    return probe_video(target,expect_audio=False)


def decoder(path:Path):
    cmd=["ffmpeg","-nostdin","-v","error","-i",str(path),
        "-map","0:v:0","-vsync","0","-pix_fmt","bgr24","-f","rawvideo","pipe:1"]
    return subprocess.Popen(cmd,stdout=subprocess.PIPE,stderr=subprocess.PIPE)


def exact_bytes(stream,n):
    if not isinstance(n,int) or n<1:
        raise ValueError("Invalid frame size")
    raw=stream.read(n)
    if len(raw)!=n:
        raise EOFError("Truncated decoded video frame")
    return raw


def decode_one(process):
    blob=exact_bytes(process.stdout,W*H*3)
    return np.frombuffer(blob,dtype=np.uint8).reshape(H,W,3)


def frame_delta(a,b,threshold=8):
    if a.shape!=b.shape or a.dtype!=np.uint8 or b.dtype!=np.uint8:
        raise ValueError("Frames must be aligned 8-bit RGB-like buffers")
    diff=np.abs(a.astype(np.int16)-b.astype(np.int16))
    return float(np.mean(diff)),int(np.count_nonzero(np.any(diff>=threshold,axis=2)))


def percentile95(xs):
    if not xs or not all(isinstance(x,(int,float)) and math.isfinite(x) for x in xs):
        raise ValueError("Expected finite numeric measurements")
    return round(float(np.percentile(xs,95)),6)


def evaluate_movie(data,movie,output_dir):
    if len(data["frames"])!=NFRAMES or data.get("fps")!=60 or data.get("provenance")!="synthetic_procedural_only":
        raise ValueError("Verified P22/P23 synthetic frame contract required")
    movie=ensure_movie(movie)
    video_info=probe_video(movie,expect_audio=True)
    target=Path(output_dir)
    target.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="retouche-p24-") as temp:
        baseline=Path(temp)/"P19_baseline_60fps_synthetic.mp4"
        baseline_info=build_baseline_video(data,baseline)
        a=decoder(baseline)
        b=decoder(movie)
        raw_energies=[]
        decoded_energies=[]
        codec_mae=[]
        encoded_peak={}
        changed_at_idle=[]
        outside_roi_artifacts=[]
        peaks={name:max(range(NFRAMES),key=lambda i:strength(data["frames"][i],name)) for name,_ in GESTURES}
        relevant=set(peaks.values())
        try:
            for i,pose in enumerate(data["frames"]):
                before=draw_p19(pose,i,NFRAMES)
                after=blend_p23(before,pose)
                decoded_before=decode_one(a)
                decoded_after=decode_one(b)
                x0,y0,x1,y1=mouth_roi(before,pose)
                roi=(slice(y0,y1),slice(x0,x1))
                raw_e,raw_px=frame_delta(before[roi],after[roi])
                decoded_e,encoded_px=frame_delta(decoded_before[roi],decoded_after[roi])
                err,_=frame_delta(after[roi],decoded_after[roi])
                raw_energies.append(raw_e)
                decoded_energies.append(decoded_e)
                codec_mae.append(err)
                if raw_e==0:
                    changed_at_idle.append({"frame":i,"residual_encoded_delta":round(decoded_e,6)})
                if i in relevant:
                    for name,idx in peaks.items():
                        if i==idx:
                            encoded_peak[name]={
                                "peak_frame":i,"raw_changed_pixels":raw_px,
                                "decoded_changed_pixels":encoded_px,
                                "raw_mean_abs_delta":round(raw_e,6),
                                "decoded_mean_abs_delta":round(decoded_e,6),
                                "codec_mae_vs_uncompressed_p23":round(err,6)}
                    # H264 may spill into other macroblocks after encoding.
                    full=np.any(np.abs(decoded_after.astype(np.int16)-decoded_before.astype(np.int16))>=12,axis=2)
                    full[y0:y1,x0:x1]=False
                    outside_roi_artifacts.append({"frame":i,"pixels":int(np.count_nonzero(full))})
            if a.stdout.read(1) or b.stdout.read(1):
                raise ValueError("Unexpected decoded trailing frames")
        finally:
            for p in (a,b):
                if p.stdout:p.stdout.close()
                if p.poll() is None:p.wait(timeout=20)
                if p.stderr:p.stderr.close()
        if a.returncode or b.returncode:
            raise RuntimeError("FFmpeg decoder reported an error")
        if len(raw_energies)!=NFRAMES or set(encoded_peak)!=set(peaks):
            raise ValueError("Video/frame alignment or gesture peak missing")
        temporal_error=[
            abs((decoded_energies[i]-decoded_energies[i-1])-
                (raw_energies[i]-raw_energies[i-1]))
            for i in range(1,NFRAMES)
        ]
        # The report is diagnostic, not a score of realism or an automatic edit authorization.
        status=("synthetic_codec_measured" if all(p["decoded_changed_pixels"]>=1 for p in encoded_peak.values())
                else "review_required_lost_gesture")
        result={
            "schema":VERSION,"status":status,
            "source":"real_P19_P21_P22_P23_synthetic_controls_only",
            "video_info":video_info,"baseline_video_info":baseline_info,
            "frames_compared":NFRAMES,"codec":"libx264 CRF25 preset ultrafast yuv420p",
            "decoded_peak_visibility":encoded_peak,
            "p95_extra_temporal_delta_in_mouth":percentile95(temporal_error),
            "p95_codec_abs_error_in_mouth":percentile95(codec_mae),
            "idle_frames_tested":len(changed_at_idle),
            "idle_decoded_delta_mean":round(float(np.mean([x["residual_encoded_delta"] for x in changed_at_idle])),6)
               if changed_at_idle else None,
            "outside_mouth_encoded_artifacts_on_peak_frames":outside_roi_artifacts,
            "encoded_locality_is_not_guaranteed":True,
            "metric_not_calibrated_for_human_perception":True,
            "not_neurally_generated":True,
            "real_human_gestures_verified":False,
            "safari_iphone_physically_tested":False,
            "real_user_media_used":False,"network_transferred":False,"model_trained":False,
            "production_integration_allowed":False}
    (target/"p24_h264_temporal_report.json").write_text(json.dumps(result,indent=2),encoding="utf-8")
    return result


def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--data",type=Path,required=True)
    ap.add_argument("--movie",type=Path,required=True)
    ap.add_argument("--out",type=Path,required=True)
    opts=ap.parse_args()
    d=load_controls(opts.data)
    report=evaluate_movie(d,opts.movie,opts.out)
    print(json.dumps(report,indent=2))
    if report["status"]!="synthetic_codec_measured":
        raise SystemExit("At least one gesture lost after H264; human review required")


if __name__=="__main__":
    main()
