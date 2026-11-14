"""RNE 0.7 — Synthetic three-frame LR degradation operators.

Research only: models noise/blur and JPEG; H264 is genuinely encoded/decoded
via ffmpeg in volatile RAM. Does not infer a real camera/codec inverse.
Never saves media to disk, sends it to a network, or enables deployment.
"""
from __future__ import annotations
import subprocess
import cv2
import numpy as np

MODES=('clean_area','jpeg55','blur_noise','h264_crf34')

def _validate(frames,min_side=64):
    if not isinstance(frames,(list,tuple)) or len(frames)!=3:
        raise TypeError('Exactly three successive BGR frames required')
    if any(not isinstance(f,np.ndarray) or f.ndim!=3 or f.shape[2]!=3 or f.dtype!=np.uint8 for f in frames):
        raise TypeError('BGR uint8 frames required')
    shape=frames[0].shape
    if any(f.shape!=shape for f in frames) or shape[0]<min_side or shape[1]<min_side or shape[0]%2 or shape[1]%2:
        raise ValueError('All frames must match, have even size and meet minimum dimensions')
    if shape[0]*shape[1]>512*512:raise ValueError('CPU research budget exceeded')

def h264_roundtrip(frames,crf=34):
    """True ffmpeg x264 YUV420p encode + decode in RAM; no saved video files."""
    _validate(frames,min_side=16)
    if not isinstance(crf,int) or not 18<=crf<=45:raise ValueError('Invalid CRF')
    h,w=frames[0].shape[:2]
    src=b''.join(np.ascontiguousarray(frame).tobytes() for frame in frames)
    cmd=['ffmpeg','-hide_banner','-loglevel','error','-threads','1',
         '-f','rawvideo','-pix_fmt','bgr24','-s:v',f'{w}x{h}','-r','12',
         '-i','pipe:0','-an','-c:v','libx264','-preset','ultrafast',
         '-crf',str(crf),'-g','12','-bf','0','-pix_fmt','yuv420p',
         '-f','matroska','pipe:1']
    proc=subprocess.run(cmd,input=src,stdout=subprocess.PIPE,stderr=subprocess.PIPE,
                        timeout=25,check=False)
    if proc.returncode or not proc.stdout:raise RuntimeError('H264 encode failed; never substitute JPEG silently')
    cmd=['ffmpeg','-hide_banner','-loglevel','error','-threads','1',
         '-f','matroska','-i','pipe:0','-frames:v','3',
         '-f','rawvideo','-pix_fmt','bgr24','pipe:1']
    dec=subprocess.run(cmd,input=proc.stdout,stdout=subprocess.PIPE,
                       stderr=subprocess.PIPE,timeout=25,check=False)
    if dec.returncode or len(dec.stdout)!=len(src):
        raise RuntimeError('H264 decoded frame count/size mismatch')
    return [f.copy() for f in np.frombuffer(dec.stdout,dtype=np.uint8).reshape(3,h,w,3)]

def degrade(frames,mode:str,seed:int=0):
    """Deterministic three-frame 2x degradation. No disk writes."""
    _validate(frames)
    if mode not in MODES:raise ValueError('Unknown simulated degradation')
    if type(seed) is not int or seed<0:raise TypeError('Nonnegative integer seed required')
    rng=np.random.default_rng(seed)
    h,w=frames[0].shape[:2]
    low=[]
    for frame in frames:
        before=frame
        if mode=='blur_noise':
            before=cv2.GaussianBlur(frame,(5,5),1.1,borderType=cv2.BORDER_REFLECT)
        lr=cv2.resize(before,(w//2,h//2),interpolation=cv2.INTER_AREA)
        if mode=='jpeg55':
            ok,encoded=cv2.imencode('.jpg',lr,[cv2.IMWRITE_JPEG_QUALITY,55])
            if not ok:raise RuntimeError('JPEG encode failed')
            lr=cv2.imdecode(encoded,cv2.IMREAD_COLOR)
        elif mode=='blur_noise':
            signal=lr.astype(np.float32)
            variance=4.**2+signal*.18
            noise=rng.normal(0,1,signal.shape).astype(np.float32)*np.sqrt(variance)
            noise=.85*noise+.15*cv2.GaussianBlur(noise,(3,3),.7)
            lr=np.clip(np.rint(signal+noise),0,255).astype(np.uint8)
        low.append(lr)
    return h264_roundtrip(low,34) if mode=='h264_crf34' else low
