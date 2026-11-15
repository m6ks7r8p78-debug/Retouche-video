"""Cinema P25: reproducible H.264 CRF matrix on ORIGINAL P19/P23 fictional frames.

Compares three independently encoded profile pairs against two verified FFV1
lossless masters (P19 baseline, P23 with synthetic gestures). Audio is a
P19/P23 generated noise fixture. The report is exploratory, never an
automatic recommendation for actual people or publication to an app.

No private media, no identifying metadata, no network, no AI training.
"""
from __future__ import annotations

import argparse
import json
import math
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/"p24"/"src"))
from p24_h264_audit import (
    decoder,decode_one,frame_delta,percentile95,probe_video,
)
from temporal_blend import (
    GESTURES,W,H,draw_p19,blend_p23,mouth_roi,strength,load_controls,breath_audio,
)

SCHEMA="retouche-cinema-p25-crf-comparative-v1"
PROFILES=(18,25,32)
NFRAMES=480
FPS=60
EXPERIMENTAL_PIXEL_THRESHOLD=8


def verify_source(data):
    if not isinstance(data,dict) or data.get("schema")!="retouche-cinema-p22-vector-preview-v1":
        raise ValueError("Real P22 synthetic controls required")
    if data.get("provenance")!="synthetic_procedural_only" or data.get("source_media_accessed") is not False:
        raise ValueError("Private or unknown provenance rejected")
    if data.get("fps")!=FPS or data.get("clip_duration_s")!=8 or len(data.get("frames",[]))!=NFRAMES:
        raise ValueError("Wrong P19 timeline")
    if data.get("control_qa",{}).get("issue_count")!=0:
        raise ValueError("Source failed P21 control QA")
    return data


def validate_crfs(profiles):
    if type(profiles) not in (list,tuple) or tuple(profiles)!=PROFILES or any(type(x) is not int for x in profiles):
        raise ValueError("P25 only compares fixed CRF 18,25,32 synthetic profiles")
    return profiles


def run_checked(argv):
    p=subprocess.run(argv,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    if p.returncode:
        raise RuntimeError("FFmpeg command failed: "+p.stderr.decode("utf-8",errors="replace")[-900:])
    return p.stdout


def build_lossless_master(data,path,variant):
    if variant not in ("p19","p23"):
        raise ValueError("Unknown synthetic master")
    # Encoder input: the actual vector frames rendered via the existing P19/P23 code.
    command=["ffmpeg","-nostdin","-y","-hide_banner","-loglevel","error",
        "-f","rawvideo","-pixel_format","bgr24","-video_size",f"{W}x{H}",
        "-framerate",str(FPS),"-i","pipe:0","-map","0:v:0",
        "-c:v","ffv1","-level","3","-pix_fmt","bgr0","-threads","2",
        "-an",str(path)]
    proc=subprocess.Popen(command,stdin=subprocess.PIPE,stderr=subprocess.PIPE)
    try:
        for i,pose in enumerate(data["frames"]):
            original=draw_p19(pose,i,NFRAMES)
            image=original if variant=="p19" else blend_p23(original,pose)
            proc.stdin.write(image.tobytes())
    except Exception:
        proc.kill()
        proc.wait()
        raise
    finally:
        if not proc.stdin.closed:proc.stdin.close()
    error=proc.stderr.read()
    if proc.wait():
        raise RuntimeError("Synthetic FFV1 master failed: "+error.decode(errors="replace")[-900:])
    summary=json.loads(run_checked(["ffprobe","-v","error","-count_frames",
        "-show_entries","stream=codec_name,nb_read_frames,r_frame_rate,width,height","-of","json",str(path)]))
    streams=summary.get("streams",[])
    if len(streams)!=1 or streams[0].get("codec_name")!="ffv1" or streams[0].get("nb_read_frames")!="480":
        raise ValueError("Lossless master has missing or wrong frames")
    return path


def verify_lossless_master(data,path,variant):
    """Decode all 480 frames; verify BGR samples exactly to detect color conversion."""
    proc=decoder(path)
    samples=0
    try:
        for i,pose in enumerate(data["frames"]):
            if i in (0,120,287,431,434,454,479):
                image=draw_p19(pose,i,NFRAMES)
                expected=image if variant=="p19" else blend_p23(image,pose)
                actual=decode_one(proc)
                if not np.array_equal(actual,expected):
                    raise ValueError("FFV1 source is NOT lossless in BGR after decoding")
                samples+=1
            else:
                decode_one(proc)
        if proc.stdout.read(1):
            raise ValueError("Unexpected FFV1 trailing frame")
    finally:
        proc.stdout.close()
        proc.wait(timeout=25)
        proc.stderr.close()
    if proc.returncode or samples!=7:
        raise RuntimeError("Lossless original-frame comparison incomplete")
    return samples


def encode_profile(master,path,crf,audio=None):
    if crf not in PROFILES or type(crf) is not int:
        raise ValueError("Only preapproved H264 CRF profiles may run")
    args=["ffmpeg","-nostdin","-y","-hide_banner","-loglevel","error",
        "-i",str(master)]
    if audio is not None:
        args+=["-i",str(audio)]
    args+=["-map","0:v:0"]
    if audio is not None:
        args+=["-map","1:a:0"]
    args+=["-c:v","libx264","-preset","ultrafast","-crf",str(crf),
        "-pix_fmt","yuv420p","-g","60","-keyint_min","60","-sc_threshold","0",
        "-threads","2"]
    if audio is None:
        args+=["-an"]
    else:
        args+=["-c:a","aac","-b:a","96k","-ar","24000","-ac","1"]
    args+=["-t","8","-movflags","+faststart",str(path)]
    run_checked(args)
    return probe_video(path,expect_audio=audio is not None)


def peaks_for(data):
    peaks={name:max(range(NFRAMES),key=lambda i:strength(data["frames"][i],name)) for name,_ in GESTURES}
    if len(peaks)!=4 or any(strength(data["frames"][i],name)<.98 for name,i in peaks.items()):
        raise ValueError("Missing original synthetic gesture peaks")
    return peaks


def assess_pair(data,crf,base_movie,gesture_movie):
    validate_crfs(PROFILES)
    base_info=probe_video(base_movie,expect_audio=False)
    gesture_info=probe_video(gesture_movie,expect_audio=True)
    peaks=peaks_for(data)
    inv={i:name for name,i in peaks.items()}
    baseproc=decoder(base_movie)
    testproc=decoder(gesture_movie)
    observed=[]
    raw=[]
    per_frame_codec=[]
    idle=[]
    peak_results={}
    n=0
    try:
        for i,pose in enumerate(data["frames"]):
            base=draw_p19(pose,i,NFRAMES)
            added=blend_p23(base,pose)
            decoded_base=decode_one(baseproc)
            decoded_added=decode_one(testproc)
            x0,y0,x1,y1=mouth_roi(base,pose)
            roi=np.s_[y0:y1,x0:x1]
            raw_energy,_=frame_delta(base[roi],added[roi],EXPERIMENTAL_PIXEL_THRESHOLD)
            output_energy,pixels=frame_delta(decoded_base[roi],decoded_added[roi],EXPERIMENTAL_PIXEL_THRESHOLD)
            error,_=frame_delta(added[roi],decoded_added[roi],EXPERIMENTAL_PIXEL_THRESHOLD)
            raw.append(raw_energy)
            observed.append(output_energy)
            per_frame_codec.append(error)
            if raw_energy==0:
                idle.append(output_energy)
            if i in inv:
                label=inv[i]
                diff=np.any(np.abs(decoded_base.astype(np.int16)-
                                   decoded_added.astype(np.int16))>=12,axis=2)
                diff[y0:y1,x0:x1]=False
                peak_results[label]={
                    "source_frame_index":i,
                    "decoded_mouth_changed_pixels":pixels,
                    "source_delta_rgb_mean":round(raw_energy,6),
                    "decoded_delta_rgb_mean":round(output_energy,6),
                    "outside_mouth_decoded_difference_pixels":int(np.count_nonzero(diff)),
                }
            n+=1
        if baseproc.stdout.read(1) or testproc.stdout.read(1):
            raise ValueError("Too many H264 decoded frames")
    finally:
        for p in (baseproc,testproc):
            p.stdout.close()
            if p.poll() is None:p.wait(timeout=25)
            p.stderr.close()
    if baseproc.returncode or testproc.returncode or n!=NFRAMES:
        raise RuntimeError("H264 decoding stopped unexpectedly")
    if set(peak_results)!=set(peaks) or not idle:
        raise ValueError("P25 missing synthetic mouth peaks or idle frames")
    jump_error=[
        abs((observed[i]-observed[i-1])-(raw[i]-raw[i-1]))
        for i in range(1,NFRAMES)
    ]
    missing=[name for name,p in peak_results.items() if p["decoded_mouth_changed_pixels"]==0]
    return {
        "crf":crf,"p19_video_info":base_info,"p23_video_info":gesture_info,
        "p23_mp4_bytes_including_aac":int(gesture_movie.stat().st_size),
        "p19_mp4_bytes_without_audio":int(base_movie.stat().st_size),
        "decoded_frames":n,"temporal_transitions":len(jump_error),
        "p95_h264_color_error_in_mouth":percentile95(per_frame_codec),
        "mean_h264_color_error_in_mouth":round(float(np.mean(per_frame_codec)),6),
        "p95_extra_temporal_delta_in_mouth":percentile95(jump_error),
        "idle_frame_count":len(idle),
        "mean_idle_residual_after_encoding":round(float(np.mean(idle)),6),
        "peak_results":peak_results,"gesture_labels_without_detectable_delta":missing,
        "status":"synthetic_profile_measured" if not missing else "human_review_required_signal_lost",
    }


def compare_profiles(data,output_dir):
    data=verify_source(data)
    validate_crfs(PROFILES)
    output_dir=Path(output_dir)
    output_dir.mkdir(parents=True,exist_ok=True)
    rows=[]
    with tempfile.TemporaryDirectory(prefix="retouche-cinema-p25-") as tmp:
        path=Path(tmp)
        base=build_lossless_master(data,path/"P19_master_FFV1_synthetic.mkv","p19")
        gesture=build_lossless_master(data,path/"P23_master_FFV1_synthetic.mkv","p23")
        lossless_samples={
            "p19":verify_lossless_master(data,base,"p19"),
            "p23":verify_lossless_master(data,gesture,"p23"),
        }
        audio=path/"synthetic_audio.wav"
        breath_audio(audio,fps=24000,seconds=8,seed=data["seed"])
        for crf in PROFILES:
            base_mov=path/f"P19_CRF{crf}_synthetic_reference.mp4"
            movie=output_dir/f"P25_CRF{crf}_synthetic_H264_AAC.mp4"
            encode_profile(base,base_mov,crf)
            encode_profile(gesture,movie,crf,audio=audio)
            rows.append(assess_pair(data,crf,base_mov,movie))
    if len(rows)!=3 or {r["crf"] for r in rows}!={18,25,32}:
        raise ValueError("H264 CRF comparison incomplete")
    # Size relation is empirical, not assumed as a mathematical CRF guarantee.
    size_order=[r["p23_mp4_bytes_including_aac"] for r in rows]
    report={
        "schema":SCHEMA,"status":"synthetic_matrix_measured",
        "comparison_basis":"paired_H264_encodes_from_exact_BRG_FFV1_synthetic_masters",
        "lossless_master_BRG_roundtrip_samples_checked":lossless_samples,
        "source":"P19_P21_P22_P23_procedural_only",
        "crfs_compared":list(PROFILES),"fps":FPS,"frame_count":NFRAMES,
        "profiles":rows,
        "files_get_smaller_as_crf_increases_on_this_fixture":size_order==sorted(size_order,reverse=True),
        "best_profile_for_users_certified":False,
        "no_fidelity_model_or_human_perception_calibration":True,
        "increased_decoded_pixel_differences_do_not_prove_better_detail":True,
        "no_real_users_or_private_media":True,
        "iphone_safari_physically_tested":False,
        "no_training":True,"no_network_or_public_deployment":True,
        "no_automatic_export_choice":True,
    }
    (output_dir/"p25_crf_matrix_synthetic_report.json").write_text(json.dumps(report,indent=2),encoding="utf-8")
    return report


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--data",type=Path,required=True)
    parser.add_argument("--out",type=Path,required=True)
    args=parser.parse_args()
    data=load_controls(args.data)
    report=compare_profiles(data,args.out)
    print(json.dumps({
        "schema":report["schema"],"status":report["status"],
        "crfs":report["crfs_compared"],
        "lossless_roundtrip_samples":report["lossless_master_BRG_roundtrip_samples_checked"],
        "profiles":[{
            "crf":r["crf"],"bytes":r["p23_mp4_bytes_including_aac"],
            "p95_codec_error":r["p95_h264_color_error_in_mouth"],
            "p95_temporal_extra":r["p95_extra_temporal_delta_in_mouth"],
            "gesture_delta_px":{k:v["decoded_mouth_changed_pixels"] for k,v in r["peak_results"].items()},
            "status":r["status"],
        } for r in report["profiles"]],
    },indent=2))


if __name__=="__main__":
    main()
