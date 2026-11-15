#!/usr/bin/env python3
"""Privacy-first RetoucheProAI export fidelity evidence gate.

READ-ONLY on input media. No uploads, screenshots, source names, raw packet
hashes, waveforms or image pixels in generated output. Run this only on the
owner's computer or an explicitly authorized private lab, never in public CI
with personal files. CI uses ephemeral FFmpeg-generated synthetic media.

This tool does NOT correct codec priming or prove perceptual quality. Its output
is evidence for NOVA to test the real exporter, not an automatic modification.
"""
from __future__ import annotations

import argparse
import json
import math
import subprocess
from pathlib import Path
from typing import Any

import numpy as np


class EvidenceError(RuntimeError):
    pass


def _command(args: list[str], *, data: bytes | None = None, limit_s: int = 90) -> bytes:
    try:
        p = subprocess.run(args, input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                           check=True, timeout=limit_s)
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, FileNotFoundError) as exc:
        # No original path or codec stderr in raised exception (paths can be private).
        raise EvidenceError('media_tool_failed_or_timed_out') from None
    return p.stdout


def _ffprobe(path: Path, *fields: str) -> dict[str, Any]:
    args=['ffprobe','-v','error','-of','json',*fields,str(path)]
    try:
        return json.loads(_command(args))
    except (json.JSONDecodeError, UnicodeError):
        raise EvidenceError('invalid_ffprobe_metadata') from None


def _meta(path: Path) -> dict[str, Any]:
    return _ffprobe(path,'-count_frames','-show_entries',
       'stream=index,codec_type,codec_name,sample_rate,channels,width,height,nb_read_frames,avg_frame_rate,duration,start_time:format=duration',
       '-show_streams','-show_format')


def _audio_packets(path: Path) -> list[dict[str, Any]]:
    return _ffprobe(path,'-select_streams','a:0','-show_packets','-show_data_hash','sha256',
       '-show_entries','packet=pts_time,duration_time,data_hash,side_data_list').get('packets',[])


def _streams(meta: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {s['codec_type']:s for s in meta.get('streams',[]) if s.get('codec_type') in ('audio','video')}


def _float(x: Any) -> float | None:
    try:
        n=float(x)
        return n if math.isfinite(n) else None
    except (TypeError,ValueError):return None


def _int(x: Any) -> int | None:
    try:return int(x)
    except (ValueError,TypeError):return None


def _skip(packet: dict[str, Any]) -> int:
    for s in packet.get('side_data_list',[]) or []:
        if s.get('side_data_type')=='Skip Samples':return int(s.get('skip_samples',0))
    return 0


def _decoded_pcm(path: Path, *, max_duration_s: float, rate: int=8000) -> np.ndarray:
    # Decode a bounded excerpt in memory. No intermediate file and no audio
    # samples are written into the report. Keep range bounded for mobile labs.
    output=_command(['ffmpeg','-nostdin','-hide_banner','-loglevel','error','-i',str(path),
       '-map','0:a:0','-vn','-af','aresample=async=1:first_pts=0','-ac','1','-ar',str(rate),'-t',str(max_duration_s),
       '-f','s16le','-acodec','pcm_s16le','-'],limit_s=90)
    return np.frombuffer(output,dtype='<i2').astype(np.float32)/32768


def _audio_offset_ms(reference: np.ndarray, exported: np.ndarray, *, sample_rate:int=8000,
                     max_lag_ms:float=250) -> dict[str, Any]:
    """Cross-correlate PCM on a finite, energy-bearing snippet.

    Positive offset means exported audio is heard LATER than original. FFT
    estimates delay, and a normalized score refuses arbitrary noisy matches.
    """
    cap=min(len(reference),len(exported),int(sample_rate*20))
    if cap<int(0.3*sample_rate):return {'offsetMs':None,'reliability':'insufficient_audio'}
    # Keep a 0..20s window so a sharp transient near the start is not erased.
    a=reference[:cap].astype(np.float64)
    b=exported[:cap].astype(np.float64)
    a-=a.mean();b-=b.mean()
    if max(float(np.std(a)),float(np.std(b)))<0.0005 or min(float(np.std(a)),float(np.std(b)))<0.00015:
        return {'offsetMs':None,'reliability':'low_audio_energy'}
    N=1<<(len(a)+len(b)-2).bit_length()
    # irfft(FFT(export)*conj(FFT(original))): positive index => export delayed.
    corr=np.fft.irfft(np.fft.rfft(b,N)*np.conj(np.fft.rfft(a,N)),N)
    maxlag=int(sample_rate*max_lag_ms/1000)
    lags=np.arange(-maxlag,maxlag+1)
    vals=corr[np.mod(lags,N)]
    best=int(lags[int(np.argmax(vals))])
    if best>=0:
        va=a[:min(len(a),len(b)-best)]
        vb=b[best:best+len(va)]
    else:
        vb=b[:min(len(b),len(a)+best)]
        va=a[-best:-best+len(vb)]
    den=float(np.linalg.norm(va)*np.linalg.norm(vb))
    score=float(np.dot(va,vb)/den) if den>0 else 0
    reliable=score>=0.60 and abs(best)<maxlag
    return {'offsetMs':round(1000*best/sample_rate,3) if reliable else None,
            'normalizedCorrelation':round(score,4),
            'reliability':'matched' if reliable else 'inconclusive'}


def analyze(original: Path, exported: Path, *, max_audio_s:float=20.0) -> dict[str, Any]:
    """Return a metadata-only diagnostic; intentionally no user file paths."""
    if not (original.is_file() and exported.is_file()):raise EvidenceError('input_missing')
    if max_audio_s<=0 or max_audio_s>30:raise EvidenceError('unsupported_analysis_duration')
    mo,me=_meta(original),_meta(exported)
    so,se=_streams(mo),_streams(me)
    if 'video' not in so or 'video' not in se:raise EvidenceError('missing_video_track')
    v0,v1=so['video'],se['video']
    audio0,audio1=so.get('audio'),se.get('audio')
    f0=_int(v0.get('nb_read_frames'))
    f1=_int(v1.get('nb_read_frames'))
    dur0=_float(mo.get('format',{}).get('duration'))
    dur1=_float(me.get('format',{}).get('duration'))
    if dur0 is None or dur1 is None:raise EvidenceError('unknown_duration')

    observed={'original':{'videoFrames':f0,'videoCodec':v0.get('codec_name'),
                          'dimensions':[v0.get('width'),v0.get('height')],
                          'durationSec':round(dur0,5),'hasAudio':bool(audio0)},
              'exported':{'videoFrames':f1,'videoCodec':v1.get('codec_name'),
                          'dimensions':[v1.get('width'),v1.get('height')],
                          'durationSec':round(dur1,5),'hasAudio':bool(audio1)}}
    frame_delta=(f1-f0) if f0 is not None and f1 is not None else None
    diffs={'videoFrameDelta':frame_delta,
           'missingFrameCount':max(0,-frame_delta) if frame_delta is not None else None,
           'durationDeltaMs':round((dur1-dur0)*1000,3),
           'dimensionsPreserved':observed['original']['dimensions']==observed['exported']['dimensions']}
    audio_evidence:dict[str,Any]={'status':'no_audio_in_both' if not audio0 and not audio1 else 'insufficient'}
    if audio0 and audio1:
        packets0,packets1=_audio_packets(original),_audio_packets(exported)
        hashes0=[p.get('data_hash') for p in packets0]
        hashes1=[p.get('data_hash') for p in packets1]
        same_prefix=0
        for a,b in zip(hashes0,hashes1):
            if not a or a!=b:break
            same_prefix+=1
        # Never write individual hashes or AAC packets into JSON.
        has_copy=bool(packets0 and packets1 and same_prefix==min(len(packets0),len(packets1)))
        sample_rate=_int(audio0.get('sample_rate'))
        audio_evidence={'status':'packet_copy_prefix' if has_copy else 'audio_reencoded_or_changed',
            'originalCodec':audio0.get('codec_name'), 'exportedCodec':audio1.get('codec_name'),
            'packetCountOriginal':len(packets0),'packetCountExported':len(packets1),
            'identicalPrefixPackets':same_prefix,
            'missingTailPackets':max(0,len(packets0)-len(packets1)) if has_copy else None,
            'originalFirstPtsSec':_float(packets0[0].get('pts_time')) if packets0 else None,
            'exportFirstPtsSec':_float(packets1[0].get('pts_time')) if packets1 else None,
            'originalSkipSamples':_skip(packets0[0]) if packets0 else None,
            'exportSkipSamples':_skip(packets1[0]) if packets1 else None,
            'sampleRate':sample_rate}
        if sample_rate and packets0 and packets1 and has_copy:
            original_skip=_skip(packets0[0]);export_skip=_skip(packets1[0])
            audio_evidence['primingDifferenceMs']=round(1000*(original_skip-export_skip)/sample_rate,3)
        try:
            pcm0=_decoded_pcm(original,max_duration_s=max_audio_s)
            pcm1=_decoded_pcm(exported,max_duration_s=max_audio_s)
            audio_evidence['signalAlignment']=_audio_offset_ms(pcm0,pcm1)
        except EvidenceError:
            audio_evidence['signalAlignment']={'offsetMs':None,'reliability':'decode_unavailable'}
    elif bool(audio0)!=bool(audio1):
        audio_evidence={'status':'audio_track_added_or_dropped'}
    flags=[]
    if frame_delta is not None and frame_delta<0:flags.append('missing_video_frames')
    if bool(audio0)!=bool(audio1):flags.append('audio_track_mismatch')
    if (audio0 and audio1) and audio0.get('codec_name')!=audio1.get('codec_name'):
        flags.append('audio_codec_changed')
    if audio_evidence.get('missingTailPackets') is not None and audio_evidence['missingTailPackets']>0:
        flags.append('missing_aac_tail_packets')
    al=audio_evidence.get('signalAlignment',{})
    if al.get('offsetMs') is not None and abs(al['offsetMs'])>20:flags.append('audio_offset_gt_20ms')
    if audio_evidence.get('primingDifferenceMs') is not None and audio_evidence['primingDifferenceMs']>20:
        flags.append('aac_priming_metadata_not_preserved')
    status='fail' if flags else 'pass'
    if audio0 and audio1 and (al.get('offsetMs') is None):
        status='fail' if flags else 'inconclusive'
    if frame_delta is None:status='fail' if flags else 'inconclusive'
    return {'schema':'retouche.export_fidelity_evidence.v1',
            'scope':'unaltered-timeline-export-only',
            'verdict':status,'alerts':flags,
            'video':observed,'differences':diffs,'audio':audio_evidence,
            'privacy':{'containsMedia':False,'containsFilePaths':False,'containsPacketHashes':False},
            'limits':'No perceptual reconstruction score; cannot judge intentional trims, edits, HDR or actual Safari hardware; signals decoded locally.'}


def main() -> int:
    ap=argparse.ArgumentParser(description='Read-only privacy-preserving AV export evidence')
    ap.add_argument('--original',type=Path,required=True)
    ap.add_argument('--exported',type=Path,required=True)
    ap.add_argument('--output',type=Path,default=None,help='Sanitized JSON only (no images/audio)')
    ap.add_argument('--max-audio-sec',type=float,default=20)
    a=ap.parse_args()
    try:report=analyze(a.original,a.exported,max_audio_s=a.max_audio_sec)
    except EvidenceError as e:
        print(json.dumps({'schema':'retouche.export_fidelity_evidence.v1','verdict':'inconclusive','errorCode':str(e)}))
        return 2
    content=json.dumps(report,indent=2,ensure_ascii=False)
    if a.output:
        a.output.parent.mkdir(parents=True,exist_ok=True)
        a.output.write_text(content+'\n',encoding='utf-8')
    print(content)
    return 0 if report['verdict']=='pass' else (1 if report['verdict']=='fail' else 2)


if __name__=='__main__':raise SystemExit(main())