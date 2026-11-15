#!/usr/bin/env python3
"""RNE 0.2 — own causal, learned temporal 2x luminance correction.

Python CPU research prototype, not NVIDIA DLSS. Uses previous decoded video frame
ONLY, estimated backward optical flow and per-pixel confidence. No cloud/network.
"""
from __future__ import annotations
import argparse
import json
import shutil
import subprocess
import tempfile
import time
from pathlib import Path
import cv2
import numpy as np
import torch
from torch import nn
from torch.nn import functional as F
from engine import RNE2x, load_model as load_rne01

MAX_PIXELS=1280*720  # explicit CPU research bound, 4K input not supported

class RNETemporal2x(nn.Module):
    """7-ch RGB current/warped-prev/confidence -> 2x one-channel residual."""
    def __init__(self,channels=20):
        super().__init__()
        self.conv=nn.Sequential(nn.Conv2d(7,channels,3,padding=1),nn.ReLU(),
            nn.Conv2d(channels,channels,3,padding=1),nn.ReLU(),
            nn.Conv2d(channels,channels,3,padding=1),nn.ReLU(),
            nn.Conv2d(channels,4,3,padding=1),nn.PixelShuffle(2))
        nn.init.zeros_(self.conv[-2].weight)
        nn.init.zeros_(self.conv[-2].bias)

    def forward(self,cur,prev_warp,confidence,base):
        if cur.shape != prev_warp.shape or cur.ndim!=4 or cur.shape[1]!=3:
            raise ValueError('Paire de frames incoherente')
        if confidence.shape!=(cur.shape[0],1,*cur.shape[2:]) or base.shape!=(cur.shape[0],3,cur.shape[2]*2,cur.shape[3]*2):
            raise ValueError('Masque de confiance / baseline invalide')
        delta=self.conv(torch.cat([cur,prev_warp,confidence],dim=1))
        confidence_hr=F.interpolate(confidence,scale_factor=2,mode='bilinear',align_corners=False)
        return (base+0.12*torch.tanh(delta)*confidence_hr).clamp(0,1)


def load_temporal(weights:Path,device='cpu'):
    model=RNETemporal2x().to(device)
    state=torch.load(str(weights),map_location=device,weights_only=True)
    if not isinstance(state,dict) or set(state)!=set(model.state_dict()):
        raise ValueError('Poids temporels invalides : format et structure stricts')
    model.load_state_dict(state,strict=True);model.eval();return model


def align_previous(current_bgr,previous_bgr):
    """Current -> previous low-res displacement (no future). Returns warped and 0..1 confidence."""
    if current_bgr.shape!=previous_bgr.shape or current_bgr.dtype!=np.uint8 or current_bgr.ndim!=3 or current_bgr.shape[2]!=3:
        raise ValueError('Paire BGR uint8 de dimensions identiques requise')
    h,w=current_bgr.shape[:2]
    if min(w,h)<16:raise ValueError('Frames trop petites')
    gray=cv2.cvtColor(current_bgr,cv2.COLOR_BGR2GRAY)
    old_gray=cv2.cvtColor(previous_bgr,cv2.COLOR_BGR2GRAY)
    diff=float(np.mean(cv2.absdiff(gray,old_gray)))/255.
    if diff>.24:
        return previous_bgr.copy(),np.zeros((h,w),dtype=np.float32),True
    if np.array_equal(current_bgr,previous_bgr):
        return previous_bgr.copy(),np.ones((h,w),dtype=np.float32),False
    flow=cv2.calcOpticalFlowFarneback(gray,old_gray,None,.5,3,15,3,5,1.2,0)
    gy,gx=np.mgrid[0:h,0:w].astype(np.float32)
    mx=gx+flow[...,0];my=gy+flow[...,1]
    warped=cv2.remap(previous_bgr,mx,my,cv2.INTER_LINEAR,borderMode=cv2.BORDER_CONSTANT)
    distance=np.mean(np.abs(current_bgr.astype(np.float32)-warped.astype(np.float32)),axis=2)
    valid=(mx>=0)&(mx<=w-1)&(my>=0)&(my<=h-1)
    confidence=(np.clip((25.-distance)/20.,0.,1.)*valid).astype(np.float32)
    return warped,confidence,False


def tensors_rgb(cur_bgr,prev_bgr,confidence):
    def norm(a):return torch.from_numpy(np.ascontiguousarray(a[:,:,::-1])).permute(2,0,1).float().unsqueeze(0)/255.
    c=norm(cur_bgr);p=norm(prev_bgr);co=torch.from_numpy(np.ascontiguousarray(confidence)).float()[None,None]
    return c,p,co


class RNE02Renderer:
    def __init__(self,base:RNE2x,temporal:RNETemporal2x,tile=96,context=10,temporal_enabled=True):
        if not (32<=tile<=256 and 4<=context<=tile//2):raise ValueError('Budget des tuiles invalide')
        self.base=base.eval();self.temporal=temporal.eval();self.tile=tile;self.context=context
        self.temporal_enabled=bool(temporal_enabled);self.previous=None
        self.frames=0;self.temporal_frames=0;self.cuts=0;self.low_confidence=0

    def reset(self):self.previous=None

    @torch.inference_mode()
    def frame(self,bgr:np.ndarray,protected_mask:np.ndarray|None=None):
        if not isinstance(bgr,np.ndarray) or bgr.dtype!=np.uint8 or bgr.ndim!=3 or bgr.shape[2]!=3:
            raise TypeError('Image BGR8 requise')
        h,w=bgr.shape[:2]
        if min(h,w)<16 or h*w>MAX_PIXELS:raise ValueError('Dimensions hors budget CPU RNE 0.2')
        if protected_mask is not None and (protected_mask.dtype!=np.uint8 or protected_mask.shape!=(h,w)):
            raise TypeError('Masque protecteur uint8 h x w requis')
        aligned=np.zeros_like(bgr);conf=np.zeros((h,w),dtype=np.float32);cut=False
        if self.temporal_enabled and self.previous is not None and self.previous.shape==bgr.shape:
            aligned,conf,cut=align_previous(bgr,self.previous)
            if cut:self.cuts+=1
            elif float(conf.mean())<.15:self.low_confidence+=1
            else:self.temporal_frames+=1
        use_temporal=self.temporal_enabled and not cut and float(conf.mean())>=.15
        rgb=bgr[:,:,::-1].copy();old=aligned[:,:,::-1].copy()
        output=np.empty((2*h,2*w,3),dtype=np.uint8)
        for y in range(0,h,self.tile):
            for x in range(0,w,self.tile):
                y1=min(y+self.tile,h);x1=min(x+self.tile,w)
                ys=max(0,y-self.context);xs=max(0,x-self.context)
                ye=min(h,y1+self.context);xe=min(w,x1+self.context)
                def t(a):return torch.from_numpy(np.ascontiguousarray(a)).permute(2,0,1).unsqueeze(0).float()/255.
                cur=t(rgb[ys:ye,xs:xe]);baseline=self.base(cur)
                if use_temporal:
                    prev=t(old[ys:ye,xs:xe]);c=torch.from_numpy(np.ascontiguousarray(conf[ys:ye,xs:xe])).float()[None,None]
                    pred=self.temporal(cur,prev,c,baseline)
                else:pred=baseline
                predicted=(pred.squeeze(0).permute(1,2,0).numpy()*255+0.5).clip(0,255).astype(np.uint8)
                patch=predicted[2*(y-ys):2*(y1-ys),2*(x-xs):2*(x1-xs)]
                output[2*y:2*y1,2*x:2*x1]=patch
        result=np.ascontiguousarray(output[:,:,::-1]);self.previous=bgr.copy();self.frames+=1
        if protected_mask is not None:
            reference=cv2.resize(bgr,(2*w,2*h),interpolation=cv2.INTER_CUBIC)
            mask=cv2.resize(protected_mask,(2*w,2*h),interpolation=cv2.INTER_NEAREST)
            result[mask>0]=reference[mask>0]
        return result


def _audio_present(path:Path):
    probe=shutil.which('ffprobe')
    if not probe:return False
    p=subprocess.run([probe,'-v','error','-select_streams','a:0','-show_entries','stream=index',
        '-of','csv=p=0',str(path)],capture_output=True,text=True,timeout=15)
    return p.returncode==0 and bool(p.stdout.strip())

def render_video(input_path:Path,output_path:Path,base:RNE2x,temporal:RNETemporal2x,max_frames=0):
    input_path=Path(input_path).resolve();output_path=Path(output_path).resolve()
    if not input_path.is_file() or input_path==output_path:raise ValueError('Source/destination invalide')
    if any((p/'.git').exists() for p in (output_path.parent,*output_path.parent.parents)):
        raise ValueError('Interdiction de publier un media dans Git')
    if not isinstance(max_frames,int) or max_frames<0:raise ValueError('Limite frames invalide')
    cap=cv2.VideoCapture(str(input_path))
    if not cap.isOpened():raise ValueError('Video source non decodable')
    fps=float(cap.get(cv2.CAP_PROP_FPS));fps=fps if np.isfinite(fps) and 0<fps<=240 else 30.
    w=int(cap.get(cv2.CAP_PROP_FRAME_WIDTH));h=int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    if min(h,w)<16 or w*h>MAX_PIXELS:cap.release();raise ValueError('Dimensions video non supportees')
    output_path.parent.mkdir(parents=True,exist_ok=True)
    renderer=RNE02Renderer(base,temporal);count=0;start=time.monotonic();audio_copied=False
    with tempfile.TemporaryDirectory(prefix='rne02-') as td:
        video=Path(td)/'video.mp4';writer=cv2.VideoWriter(str(video),cv2.VideoWriter_fourcc(*'mp4v'),fps,(2*w,2*h))
        if not writer.isOpened():cap.release();raise RuntimeError('Encodeur MP4 indisponible')
        try:
            while not max_frames or count<max_frames:
                ok,bgr=cap.read()
                if not ok:break
                writer.write(renderer.frame(bgr));count+=1
        finally:writer.release();cap.release()
        if count==0:raise RuntimeError('Aucune image decodee')
        ffmpeg=shutil.which('ffmpeg')
        if ffmpeg:
            args=[ffmpeg,'-y','-loglevel','error','-i',str(video),'-i',str(input_path),'-map','0:v:0','-map','1:a:0?',
                '-c:v','copy','-c:a','aac','-shortest',str(output_path)]
            run=subprocess.run(args,check=False,capture_output=True,timeout=120)
            if run.returncode:shutil.copyfile(video,output_path)
            else:audio_copied=_audio_present(output_path)
        else:shutil.copyfile(video,output_path)
    return dict(frames=count,width=w*2,height=h*2,temporal_frames=renderer.temporal_frames,
        cuts=renderer.cuts,low_confidence=renderer.low_confidence,remux_audio=audio_copied,
        elapsed_seconds=round(time.monotonic()-start,2),
        disclaimer='RNE 0.2 experimental CPU; pas de DLSS NVIDIA, pas de garantie 4K/iPhone ni de pixels d origine retrouves')


def main():
    p=argparse.ArgumentParser(description='RNE 0.2 — reconstruction temporelle neuronale 2x')
    p.add_argument('input',type=Path);p.add_argument('output',type=Path)
    p.add_argument('--base-weights',type=Path,required=True);p.add_argument('--temporal-weights',type=Path,required=True)
    p.add_argument('--max-frames',type=int,default=0)
    a=p.parse_args();print(json.dumps(render_video(a.input,a.output,load_rne01(a.base_weights),load_temporal(a.temporal_weights),a.max_frames),ensure_ascii=False))

if __name__=='__main__':main()