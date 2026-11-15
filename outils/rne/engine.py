#!/usr/bin/env python3
"""Retouche Neural Engine (RNE) v0.1: genuine causal 2x VIDEO upscaling prototype.

Private/offline by default. Native 2D video, no NVIDIA SDK, no 3D buffers and
no purported recovery of invisible pixels. CUDA is not assumed.
"""
from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path
import os
import shutil
import subprocess
import tempfile
import time

import cv2
import numpy as np
import torch
from torch import nn
from torch.nn import functional as F

MAX_FRAME_PIXELS = 4096 * 2160  # v0.1 CPU path is not certified for 8K input


class RNE2x(nn.Module):
    """Self-owned compact residual super-resolution architecture, 2x."""
    def __init__(self, channels: int = 24):
        super().__init__()
        self.body = nn.Sequential(
            nn.Conv2d(3, channels, 3, padding=1), nn.ReLU(inplace=True),
            nn.Conv2d(channels, channels, 3, padding=1), nn.ReLU(inplace=True),
            nn.Conv2d(channels, channels, 3, padding=1), nn.ReLU(inplace=True),
            nn.Conv2d(channels, 12, 3, padding=1), nn.PixelShuffle(2),
        )
        nn.init.zeros_(self.body[-2].weight)
        nn.init.zeros_(self.body[-2].bias)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        base = F.interpolate(x, scale_factor=2, mode='bicubic', align_corners=False)
        residual = self.body(x)
        return torch.clamp(base + .20 * torch.tanh(residual), 0, 1)


def load_model(weights: str | Path, device: str = 'cpu') -> RNE2x:
    # weights_only=True: never unpickle an arbitrary training object.
    model = RNE2x().to(device)
    state = torch.load(str(weights), map_location=device, weights_only=True)
    if not isinstance(state, dict) or set(state) != set(model.state_dict()):
        raise ValueError('Poids RNE incompatibles')
    model.load_state_dict(state, strict=True)
    model.eval()
    return model


@torch.inference_mode()
def neural_upscale(frame_bgr: np.ndarray, model: RNE2x, tile: int = 128,
                   context: int = 12, strength: float = 1.0) -> np.ndarray:
    """Bounded-memory upscaling with context-aware seam-free tile cropping."""
    if not np.isfinite(strength) or not 0 <= strength <= 1:
        raise ValueError('intensité hors [0,1]')
    if tile < 32 or context < 4 or context > tile // 2:
        raise ValueError('taille de tuile ou marge invalide')
    h, w = frame_bgr.shape[:2]
    src = frame_bgr[:, :, ::-1].copy()  # RGB
    dst = np.empty((h * 2, w * 2, 3), dtype=np.uint8)
    baseline = cv2.resize(src, (w * 2, h * 2), interpolation=cv2.INTER_CUBIC)
    for y in range(0, h, tile):
        for x in range(0, w, tile):
            y1, x1 = min(y + tile, h), min(x + tile, w)
            yy0, xx0 = max(0, y - context), max(0, x - context)
            yy1, xx1 = min(h, y1 + context), min(w, x1 + context)
            patch = src[yy0:yy1, xx0:xx1]
            t = torch.from_numpy(patch.copy()).permute(2, 0, 1).unsqueeze(0).float() / 255
            pred = model(t).squeeze(0).permute(1, 2, 0).numpy()
            pred = (np.clip(pred, 0, 1) * 255 + .5).astype(np.uint8)
            crop = pred[2 * (y - yy0):2 * (y1 - yy0), 2 * (x - xx0):2 * (x1 - xx0)]
            dst[2*y:2*y1, 2*x:2*x1] = crop
    if strength < 1:
        dst = cv2.addWeighted(dst, strength, baseline, 1 - strength, 0)
    # Preserve bicubic chroma to reduce hue changes of the learned RGB residual.
    ref_yuv = cv2.cvtColor(baseline, cv2.COLOR_RGB2YCrCb)
    out_yuv = cv2.cvtColor(dst, cv2.COLOR_RGB2YCrCb)
    out_yuv[:, :, 1:] = ref_yuv[:, :, 1:]
    return cv2.cvtColor(out_yuv, cv2.COLOR_YCrCb2BGR)


@dataclass
class RNEState:
    prev_gray: np.ndarray | None = None
    prev_lr: np.ndarray | None = None
    prev_output: np.ndarray | None = None
    frames: int = 0
    scene_resets: int = 0
    frames_temporal: int = 0


class RNERenderer:
    def __init__(self, model: RNE2x | None = None, temporal: bool = True,
                 strength: float = 1.0, tile: int = 128):
        if not np.isfinite(strength) or not 0 <= strength <= 1:
            raise ValueError('force invalide')
        self.model, self.temporal, self.strength, self.tile = model, temporal, strength, tile
        self.state = RNEState()

    def reset(self) -> None:
        self.state = RNEState()

    def frame(self, bgr: np.ndarray, protected_mask: np.ndarray | None = None) -> np.ndarray:
        if not isinstance(bgr, np.ndarray) or bgr.dtype != np.uint8 or bgr.ndim != 3 or bgr.shape[2] != 3:
            raise TypeError('frame BGR 8 bits uniquement')
        h, w = bgr.shape[:2]
        if min(h, w) < 16 or h * w > MAX_FRAME_PIXELS:
            raise ValueError('dimensions source hors limites prototype')
        if protected_mask is not None and (protected_mask.shape != (h, w) or protected_mask.dtype != np.uint8):
            raise TypeError('masque protecteur doit être uint8, une carte par frame')
        gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
        basic = cv2.resize(bgr, (w*2,h*2), interpolation=cv2.INTER_CUBIC)
        current = neural_upscale(bgr, self.model, tile=self.tile, strength=self.strength) if self.model else basic.copy()
        state = self.state
        if self.temporal and state.prev_gray is not None and state.prev_gray.shape == gray.shape:
            raw_diff = np.mean(cv2.absdiff(gray, state.prev_gray)) / 255
            # Strong discontinuity => reset. Not a certified semantic cut detector.
            if raw_diff > .24:
                state.scene_resets += 1
            elif np.array_equal(bgr, state.prev_lr):
                # Exact frame repeat: avoid optical-flow jitter and preserve deterministic output.
                current = state.prev_output.copy()
                state.frames_temporal += 1
            else:
                # Estimated backward current->previous motion, no future frame.
                flow = cv2.calcOpticalFlowFarneback(gray, state.prev_gray, None,
                                                    .5, 3, 15, 3, 5, 1.2, 0)
                gy, gx = np.mgrid[0:h, 0:w].astype(np.float32)
                prev_warp = cv2.remap(state.prev_lr, gx+flow[..., 0], gy+flow[..., 1],
                                      cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)
                difference = np.mean(cv2.absdiff(bgr, prev_warp), axis=2)
                # Conservative confidence and disocclusion proxy; do not drag old edges into new content.
                confidence = np.clip((18. - difference) / 14., 0., 1.).astype(np.float32)
                valid = (gx + flow[...,0] >= 0) & (gx + flow[...,0] <= w-1) & \
                        (gy + flow[...,1] >= 0) & (gy + flow[...,1] <= h-1)
                confidence *= valid
                # High-res backward flow maps the current target grid into previous target frame.
                hf = cv2.resize(flow, (2*w, 2*h), interpolation=cv2.INTER_LINEAR)*2
                hy, hx = np.mgrid[0:2*h, 0:2*w].astype(np.float32)
                old = cv2.remap(state.prev_output, hx+hf[...,0], hy+hf[...,1],
                                cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
                alpha = cv2.resize(confidence, (2*w,2*h), interpolation=cv2.INTER_LINEAR) * .18
                if protected_mask is not None:
                    allowed = cv2.resize(255-protected_mask, (2*w,2*h), interpolation=cv2.INTER_NEAREST) / 255.
                    alpha *= allowed
                alpha = alpha[...,None]
                current = np.clip(current.astype(np.float32)*(1-alpha)+old.astype(np.float32)*alpha,
                                  0,255).astype(np.uint8)
                state.frames_temporal += 1
        # Pixel-for-pixel preserve the protected area (e.g., identity / selected ROI).
        if protected_mask is not None:
            mask_hr = cv2.resize(protected_mask, (2*w,2*h), interpolation=cv2.INTER_NEAREST)
            current[mask_hr > 0] = basic[mask_hr > 0]
        state.prev_gray = gray.copy()
        state.prev_lr = bgr.copy()
        state.prev_output = current.copy()
        state.frames += 1
        return current


def video_render(input_path: Path, output_path: Path, model: RNE2x | None,
                 max_frames: int = 0, temporal: bool = True, strength: float = 1.) -> dict:
    if not input_path.is_file() or input_path.resolve() == output_path.resolve():
        raise ValueError('chemins source/destination invalides')
    if max_frames < 0:
        raise ValueError('max_frames négatif')
    if any((d/'.git').exists() for d in (output_path.parent.resolve(), *output_path.parent.resolve().parents)):
        raise ValueError('Refus de déposer un média traité dans un dépôt Git')
    output_path.parent.mkdir(parents=True, exist_ok=True)
    reader = cv2.VideoCapture(str(input_path))
    if not reader.isOpened():
        raise ValueError('vidéo impossible à lire')
    fps = reader.get(cv2.CAP_PROP_FPS)
    fps = float(fps) if np.isfinite(fps) and 0 < fps <= 240 else 30.
    w = int(reader.get(cv2.CAP_PROP_FRAME_WIDTH)); h = int(reader.get(cv2.CAP_PROP_FRAME_HEIGHT))
    if min(w,h) < 16 or w*h > MAX_FRAME_PIXELS:
        reader.release();raise ValueError('dimensions trop grandes pour le prototype CPU')
    r = RNERenderer(model=model, temporal=temporal, strength=strength)
    start=time.monotonic(); counter=0; remux_ok=False
    with tempfile.TemporaryDirectory(prefix='rne-') as td:
        silent = Path(td)/'sans_audio.mp4'
        writer=cv2.VideoWriter(str(silent), cv2.VideoWriter_fourcc(*'mp4v'), fps, (w*2,h*2))
        if not writer.isOpened():
            reader.release();raise RuntimeError('encodeur MP4 indisponible')
        try:
            while max_frames == 0 or counter < max_frames:
                ok,fr=reader.read()
                if not ok:break
                writer.write(r.frame(fr));counter+=1
        finally:
            writer.release();reader.release()
        if counter==0:raise RuntimeError('vidéo vide')
        # No network; optional local audio from original, if FFmpeg is present.
        ffmpeg=shutil.which('ffmpeg')
        if ffmpeg:
            cmd=[ffmpeg,'-hide_banner','-loglevel','error','-y','-i',str(silent),'-i',str(input_path),
                 '-map','0:v:0','-map','1:a:0?','-c:v','copy','-c:a','aac','-shortest',str(output_path)]
            p=subprocess.run(cmd,capture_output=True,timeout=120)
            if p.returncode:
                shutil.copy2(silent, output_path)
            else:
                remux_ok=True
        else:
            shutil.copy2(silent, output_path)
    return {'frames':counter,'width':w*2,'height':h*2,'fps':fps,
            'audio_remux_tente':bool(ffmpeg), 'remux_effectue':remux_ok, 'modele_neuronal_charge':model is not None,
            'frames_fusion_temporelle':r.state.frames_temporal, 'remises_a_zero':r.state.scene_resets,
            'secondes_cpu':round(time.monotonic()-start,2),
            'avertissement':'Prototype CPU local ; pas de fidélité retrouvée des détails absents ni compatibilité Safari certifiée.'}


def main() -> None:
    p=argparse.ArgumentParser(description='Retouche Neural Engine RNE v0.1 : conversion vidéo 2x locale')
    p.add_argument('input',type=Path);p.add_argument('output',type=Path)
    p.add_argument('--weights',type=Path,help='Poids RNE privés, facultatifs ; sans poids, bicubique + temporel')
    p.add_argument('--max-frames',type=int,default=0,help='Limiter pour un essai')
    p.add_argument('--no-temporal',action='store_true')
    p.add_argument('--strength',type=float,default=1.0)
    a=p.parse_args()
    model=load_model(a.weights) if a.weights else None
    import json
    print(json.dumps(video_render(a.input,a.output,model,max_frames=a.max_frames,temporal=not a.no_temporal,strength=a.strength),ensure_ascii=False))

if __name__=='__main__':main()
