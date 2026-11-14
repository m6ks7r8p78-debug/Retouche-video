#!/usr/bin/env python3
"""Retouche Neural Engine RNE 0.3: independent 3-frame causal super-resolution (research).

No NVIDIA runtime, SDK, weights or proprietary model. No network. Confidence from
backward-forward optical-flow consistency, photometric agreement and edge validity.
Predictions never overwrite the source video and do not prove recovered details.
"""
from __future__ import annotations

import cv2
import numpy as np
import torch
from torch import nn
from torch.nn import functional as F


def alignment(current: np.ndarray, previous: np.ndarray):
    """Returns (previous aligned to current, confidence) at the SAME low resolution.

    Current -> previous displacement via Farneback; consistency tested by previous
    -> current displacement. No future input; occlusions and scene cuts get low trust.
    """
    if current.ndim != 3 or current.shape[2] != 3 or current.dtype != np.uint8 or previous.shape != current.shape or previous.dtype != np.uint8:
        raise ValueError('Expected equally sized BGR uint8 frames')
    h, w = current.shape[:2]
    if min(h, w) < 16 or h * w > 1920*1080:
        raise ValueError('Frame outside research CPU memory budget')
    delta = float(np.mean(cv2.absdiff(current, previous))) / 255.
    if delta > .24:
        return np.zeros_like(current), np.zeros((h, w), np.float32)
    if np.array_equal(current, previous):
        return previous.copy(), np.ones((h, w), np.float32)
    cgray = cv2.cvtColor(current, cv2.COLOR_BGR2GRAY)
    pgray = cv2.cvtColor(previous, cv2.COLOR_BGR2GRAY)
    backward = cv2.calcOpticalFlowFarneback(cgray, pgray, None, .5, 3, 15, 3, 5, 1.2, 0)
    forward = cv2.calcOpticalFlowFarneback(pgray, cgray, None, .5, 3, 15, 3, 5, 1.2, 0)
    gy, gx = np.mgrid[0:h, 0:w].astype(np.float32)
    mx, my = gx+backward[:, :, 0], gy+backward[:, :, 1]
    inside = (mx >= 0)&(mx <= w-1)&(my >= 0)&(my <= h-1)
    warped = cv2.remap(previous, mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)
    consistency = cv2.remap(forward, mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)+backward
    fb_error = np.linalg.norm(consistency, axis=2)
    photo = np.mean(np.abs(warped.astype(np.float32)-current.astype(np.float32)), axis=2)
    trust = np.exp(-fb_error/2.) * np.clip((30.-photo)/22., 0, 1)
    trust *= inside
    return warped, np.clip(trust, 0, 1).astype(np.float32)


class RNE03(nn.Module):
    """Learned 2x luminance correction conditioned on 3 aligned consecutive frames."""
    def __init__(self, channels: int = 24):
        super().__init__()
        self.net = nn.Sequential(
            nn.Conv2d(11, channels, 3, padding=1), nn.ReLU(inplace=True),
            nn.Conv2d(channels, channels, 3, padding=1), nn.ReLU(inplace=True),
            nn.Conv2d(channels, channels, 3, padding=1), nn.ReLU(inplace=True),
            nn.Conv2d(channels, 4, 3, padding=1), nn.PixelShuffle(2),
        )
        nn.init.zeros_(self.net[-2].weight); nn.init.zeros_(self.net[-2].bias)

    def forward(self, current: torch.Tensor, previous1: torch.Tensor, previous2: torch.Tensor,
                conf1: torch.Tensor, conf2: torch.Tensor, baseline: torch.Tensor | None = None):
        if current.ndim != 4 or current.shape[1] != 3 or current.shape != previous1.shape or current.shape != previous2.shape:
            raise ValueError('Expected three batches of RGB images')
        if any(x.shape != (current.shape[0], 1, *current.shape[-2:]) for x in (conf1, conf2)):
            raise ValueError('Confidence maps must be N x 1 x H x W')
        if baseline is None:
            baseline = F.interpolate(current, scale_factor=2, mode='bicubic', align_corners=False).clamp(0, 1)
        if baseline.shape != (current.shape[0], 3, current.shape[-2]*2, current.shape[-1]*2):
            raise ValueError('Invalid baseline shape')
        x = torch.cat((current, previous1, previous2, conf1, conf2), dim=1)
        detail = .16 * torch.tanh(self.net(x))
        trust = F.interpolate(torch.maximum(conf1, conf2), scale_factor=2, mode='bilinear', align_corners=False)
        return (baseline + trust * detail).clamp(0, 1)


def make_arrays(current_bgr, prev1_bgr, prev2_bgr):
    if current_bgr.shape != prev1_bgr.shape or current_bgr.shape != prev2_bgr.shape:
        raise ValueError('Frame size mismatch')
    w1, c1 = alignment(current_bgr, prev1_bgr)
    w2, c2 = alignment(current_bgr, prev2_bgr)
    def rgb(a):
        return torch.from_numpy(np.ascontiguousarray(a[:, :, ::-1])).permute(2, 0, 1).float()/255
    return rgb(current_bgr), rgb(w1), rgb(w2), torch.from_numpy(c1[None]), torch.from_numpy(c2[None])


class RNE03Renderer:
    """Simple CPU-only sequential renderer, safe fallback on early/uncertain frames."""
    def __init__(self, model: RNE03, tile: int = 96, context: int = 12):
        if tile < 32 or context < 4 or context > tile//2:
            raise ValueError('Invalid tile budget')
        self.model = model.eval(); self.tile = tile; self.context = context
        self.history = []
        self.frames = self.temporal_frames = self.resets = 0

    @torch.inference_mode()
    def frame(self, bgr: np.ndarray, protected: np.ndarray | None = None):
        if bgr.ndim != 3 or bgr.dtype != np.uint8 or bgr.shape[2] != 3:
            raise TypeError('BGR8 image required')
        h,w = bgr.shape[:2]
        if min(h,w) < 16 or h*w > 1280*720:
            raise ValueError('Input size exceeds CPU research budget')
        if protected is not None and (protected.shape != (h,w) or protected.dtype != np.uint8):
            raise TypeError('Protected mask uint8 HxW required')
        baseline = cv2.resize(bgr, (2*w,2*h), interpolation=cv2.INTER_CUBIC)
        if self.history and np.mean(cv2.absdiff(bgr, self.history[-1]))/255.>.24:
            self.history=[]; self.resets+=1
        if len(self.history)<2:
            result=baseline
        else:
            cur,one,two,co1,co2 = make_arrays(bgr,self.history[-1],self.history[-2])
            result = np.empty((2*h,2*w,3),dtype=np.uint8)
            for y in range(0,h,self.tile):
                for x in range(0,w,self.tile):
                    y1,x1=min(h,y+self.tile),min(w,x+self.tile)
                    ys,xs=max(0,y-self.context),max(0,x-self.context)
                    ye,xe=min(h,y1+self.context),min(w,x1+self.context)
                    idx = (slice(None),slice(ys,ye),slice(xs,xe))
                    pred=self.model(cur[idx][None],one[idx][None],two[idx][None],
                                    co1[idx][None],co2[idx][None]).squeeze(0)
                    crop=pred[:,2*(y-ys):2*(y1-ys),2*(x-xs):2*(x1-xs)]
                    result[2*y:2*y1,2*x:2*x1]=np.clip(crop.permute(1,2,0).numpy()[:,:,::-1]*255+.5,0,255).astype(np.uint8)
            self.temporal_frames+=1
        if protected is not None:
            mask=cv2.resize(protected,(2*w,2*h),interpolation=cv2.INTER_NEAREST)
            result[mask>0]=baseline[mask>0]
        self.history.append(bgr.copy());self.history=self.history[-2:]
        self.frames+=1
        return result


def load_weights(path):
    """Safely load tensor-only private model weights. No pickle execution."""
    from pathlib import Path
    path = Path(path)
    model = RNE03()
    state = torch.load(str(path), map_location='cpu', weights_only=True)
    if not isinstance(state, dict) or set(state) != set(model.state_dict()):
        raise ValueError('RNE03 private weights have incompatible keys')
    model.load_state_dict(state, strict=True)
    model.eval()
    return model


def render_video(source, destination, weights=None, max_frames=0, tile=96):
    """CPU MP4 demo; preserve audio when source has it and local FFmpeg works."""
    import tempfile, shutil, subprocess, time
    from pathlib import Path
    source, destination = Path(source).resolve(), Path(destination).resolve()
    if not source.is_file() or source == destination:
        raise ValueError('Invalid source or destination')
    if not isinstance(max_frames, int) or max_frames < 0:
        raise ValueError('Invalid frame limit')
    if any((d/'.git').exists() for d in (destination.parent, *destination.parent.parents)):
        raise ValueError('Cannot write media into a Git checkout')
    model = load_weights(weights) if weights else RNE03().eval()
    if weights is None:
        raise ValueError('Neural output requires validated private weights; no random-weight demo')
    inp = cv2.VideoCapture(str(source))
    if not inp.isOpened():
        raise ValueError('Cannot open source video')
    w,h = int(inp.get(cv2.CAP_PROP_FRAME_WIDTH)),int(inp.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = float(inp.get(cv2.CAP_PROP_FPS))
    fps = fps if np.isfinite(fps) and 1 <= fps <= 240 else 30.
    if min(h,w)<16 or h*w>1280*720:
        inp.release();raise ValueError('Source exceeds CPU budget')
    t0=time.monotonic();renderer=RNE03Renderer(model,tile=tile)
    count=0;audio=False
    destination.parent.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='rne03-') as tmp:
        silent = Path(tmp)/'mute.mp4'
        wr = cv2.VideoWriter(str(silent),cv2.VideoWriter_fourcc(*'mp4v'),fps,(2*w,2*h))
        if not wr.isOpened():inp.release();raise RuntimeError('Cannot create MP4 output')
        try:
            while max_frames==0 or count < max_frames:
                ok,frame = inp.read()
                if not ok:break
                wr.write(renderer.frame(frame))
                count += 1
        finally:
            wr.release();inp.release()
        if count==0:raise RuntimeError('Empty decoded video')
        ffmpeg, ffprobe = shutil.which('ffmpeg'),shutil.which('ffprobe')
        had_audio=False
        if ffprobe:
            chk=subprocess.run([ffprobe,'-v','error','-select_streams','a:0',
                                '-show_entries','stream=index','-of','csv=p=0',str(source)],
                               capture_output=True,text=True,timeout=15)
            had_audio=chk.returncode==0 and bool(chk.stdout.strip())
        if ffmpeg and had_audio:
            cmd=[ffmpeg,'-y','-v','error','-i',str(silent),'-i',str(source),'-map','0:v:0',
                 '-map','1:a:0','-c:v','copy','-c:a','aac','-shortest',str(destination)]
            ret=subprocess.run(cmd,capture_output=True,timeout=120)
            if ret.returncode==0:audio=True
            else:shutil.copy2(silent,destination)
        else:
            shutil.copy2(silent,destination)
    return {'frames':count,'width':2*w,'height':2*h,'fps':fps,
            'temporal_frames':renderer.temporal_frames,'scene_resets':renderer.resets,
            'source_audio_detected':had_audio,'audio_included':audio,
            'seconds_cpu':round(time.monotonic()-t0,2),
            'model':'RNE 0.3 (independent 3-frame 2D super-resolution)',
            'not_nvidia_dlss5':True,'iphone_safari_tested':False}