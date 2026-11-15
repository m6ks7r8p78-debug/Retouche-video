#!/usr/bin/env python3
"""Deterministic SYNTHETIC-ONLY tests for the AV fidelity evidence gate.

No private media, saved derived video, raw packet digest, PCM, or frame is
committed. Samples are generated and deleted in a temporary directory.
"""
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import wave
from pathlib import Path

import numpy as np

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from export_fidelity_gate import analyze, _audio_offset_ms


def run(*args):
    p=subprocess.run(args,capture_output=True,text=True,timeout=60)
    if p.returncode:
        raise AssertionError('Synthetic ffmpeg fixture command failed: '+p.stderr[-1000:])


def fixture(temp:Path, sample_rate=48000):
    rng=np.random.default_rng(916)
    # Wideband noise + short audible pulses to disambiguate correlation from
    # periodic speech/music harmonics. Artificial audio, no source media.
    count=int(3.0*sample_rate)
    w=rng.uniform(-1,1,count).astype('float32')*0.06
    for t in [0.08,0.41,0.93,1.37,1.92,2.49,2.85]:
        start=int(t*sample_rate)
        end=min(start+int(.028*sample_rate),count)
        w[start:end]+=(np.hanning(end-start)*.52).astype('float32')
    pcm=np.clip(w,-.99,.99)
    wav=temp/f'synthetic_{sample_rate}.wav'
    with wave.open(str(wav),'wb') as out:
        out.setnchannels(1);out.setsampwidth(2);out.setframerate(sample_rate)
        out.writeframes((pcm*32767).astype('<i2').tobytes())
    video=temp/f'synthetic_{sample_rate}.mp4'
    run('ffmpeg','-nostdin','-hide_banner','-loglevel','error','-y',
        '-f','lavfi','-i','testsrc2=size=160x128:rate=15','-i',str(wav),
        '-t','3','-c:v','libx264','-preset','ultrafast','-crf','34',
        '-bf','0','-g','15','-pix_fmt','yuv420p',
        '-c:a','aac','-ac','1','-b:a','96k','-movflags','+faststart',str(video))
    assert video.stat().st_size>25000
    return video


def main():
    outcomes=[]
    with tempfile.TemporaryDirectory(prefix='retouche_synthetic_av_') as tmp:
        root=Path(tmp)
        for sr in [44100,48000]:
            original=fixture(root,sr)
            copied=root/f'copy_{sr}.mp4'
            run('ffmpeg','-nostdin','-hide_banner','-loglevel','error','-y','-i',str(original),
                '-c','copy','-movflags','+faststart',str(copied))
            ok=analyze(original,copied,max_audio_s=5)
            assert ok['verdict']=='pass',('unmodified remux must pass',sr,ok)
            assert ok['differences']['videoFrameDelta']==0,ok
            assert ok['audio']['signalAlignment']['offsetMs']==0,ok
            assert ok['audio']['originalSkipSamples']==ok['audio']['exportSkipSamples'],ok
            outcomes.append({'fixture':'identical_remux','rate':sr,'verdict':ok['verdict'],
                             'alignmentMs':ok['audio']['signalAlignment']['offsetMs']})
            # Video-only mux is not a faithful export when source has a voice track.
            without=root/f'no_audio_{sr}.mp4'
            run('ffmpeg','-nostdin','-hide_banner','-loglevel','error','-y','-i',str(original),
                '-map','0:v:0','-c:v','copy','-an',str(without))
            na=analyze(original,without,max_audio_s=5)
            assert na['verdict']=='fail' and 'audio_track_mismatch' in na['alerts'],na
            outcomes.append({'fixture':'missing_audio','rate':sr,'verdict':na['verdict']})
            # Retain early frames while losing terminal video images: must fail.
            short=root/f'frames_missing_{sr}.mp4'
            run('ffmpeg','-nostdin','-hide_banner','-loglevel','error','-y','-i',str(original),
                '-map','0:v:0','-map','0:a:0','-c','copy','-frames:v','39',str(short))
            vf=analyze(original,short,max_audio_s=5)
            assert vf['verdict']=='fail' and 'missing_video_frames' in vf['alerts'],vf
            assert vf['differences']['missingFrameCount']>0,vf
            outcomes.append({'fixture':'missing_tail_video_frames','rate':sr,'verdict':vf['verdict'],
                             'missingFrames':vf['differences']['missingFrameCount']})
            # Move only the AAC track, leaving video untouched.
            shifted=root/f'shifted_aac_{sr}.mp4'
            run('ffmpeg','-nostdin','-hide_banner','-loglevel','error','-y',
                '-i',str(original),'-itsoffset','0.080','-i',str(original),
                '-map','0:v:0','-map','1:a:0','-c','copy','-movflags','+faststart',str(shifted))
            bad=analyze(original,shifted,max_audio_s=5)
            assert bad['verdict']=='fail' and 'audio_offset_gt_20ms' in bad['alerts'],bad
            lag=bad['audio']['signalAlignment']['offsetMs']
            assert lag is not None and 65<=lag<=95,(sr,lag,bad)
            outcomes.append({'fixture':'audio_shift_80ms','rate':sr,'verdict':bad['verdict'],
                             'measuredDelayMs':lag})
    # Self-test: zero-energy snippets and arbitrary waveform mismatch must abstain.
    assert _audio_offset_ms(np.zeros(16000,dtype=np.float32),
                            np.zeros(16000,dtype=np.float32))['offsetMs'] is None
    report={'schema':'retouche.export_fidelity_gate.synthetic_tests.v1',
            'caseCount':len(outcomes),'results':outcomes,
            'privateMediaUsed':False,'mediaArtifactsCommitted':False}
    print(json.dumps(report,indent=2))
    return report


if __name__=='__main__':main()