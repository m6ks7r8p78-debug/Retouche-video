"""RNE0.10 research-only session isolation and trusted in-function re-alignment.

Accept RAW BGR frames only: callers cannot mix an aligned prior with stale
confidence. Uses triad.make_arrays (optical flow); this is provenance, NOT
a proof of correct flow or of fidelity on new user videos.
No media writer, exporter, model deployment or user-data telemetry.
"""
from __future__ import annotations
from dataclasses import dataclass
import re
import cv2
import numpy as np
import torch
from torch.nn import functional as F


@dataclass(frozen=True)
class SessionAudit:
    status: str
    reason: str
    frames_in_history: int
    confidence_mean: float
    manual_research_only: bool = True
    real_alignment_verified: bool = False
    generalization_proven: bool = False
    automatic_deployment: bool = False
    media_export_authorized: bool = False


class CausalSessionGuard:
    """Keep raw frames from one video and reject frame-order discontinuities.

    A fresh unpredictable 32-hex token is required per imported video.
    Never derive it from a filename. History resides in memory only.
    """
    def __init__(self):
        self.reset()

    def reset(self):
        self._token = None
        self._last_index = None
        self._history = []

    @staticmethod
    def _check(frame, frame_index, session_token):
        if not isinstance(frame,np.ndarray) or frame.dtype!=np.uint8 or frame.ndim!=3 or frame.shape[2]!=3:
            raise TypeError('BGR uint8 image required')
        h,w=frame.shape[:2]
        if min(h,w)<16 or h*w>1280*720:
            raise ValueError('Outside local CPU preview memory budget')
        if type(frame_index) is not int or frame_index<0:
            raise ValueError('Nonnegative ordered integer frame index required')
        if not isinstance(session_token,str) or re.fullmatch('[a-f0-9]{32}',session_token) is None:
            raise ValueError('Ephemeral 32-hex session token required, not a filename')

    @staticmethod
    def _rgb(frame):
        return torch.from_numpy(np.ascontiguousarray(frame[:,:,::-1])).permute(2,0,1)[None].float()/255

    @staticmethod
    def _bgr(tensor):
        return np.clip(np.rint(tensor[0].permute(1,2,0).cpu().numpy()[:,:,::-1]*255),0,255).astype(np.uint8)

    def consume(self,frame,*,frame_index,session_token,model=None,manual_research_opt_in=False):
        self._check(frame,frame_index,session_token)
        if type(manual_research_opt_in) is not bool:
            raise TypeError('Research opt-in must be Boolean')
        with torch.inference_mode():
            base=F.interpolate(self._rgb(frame),scale_factor=2,mode='bicubic',align_corners=False).clamp(0,1)
            def baseline(reason):
                return self._bgr(base),SessionAudit('bicubic',reason,len(self._history),0.)
            if not manual_research_opt_in:
                self.reset()
                return baseline('research_not_authorized')
            reason=None
            if self._token is not None:
                if session_token!=self._token:
                    reason='stream_changed'
                elif self._last_index is None or frame_index!=self._last_index+1:
                    reason='frame_sequence_broken'
                elif self._history and self._history[-1].shape!=frame.shape:
                    reason='dimensions_changed'
                elif self._history and float(np.mean(cv2.absdiff(frame,self._history[-1])))/255.>.24:
                    reason='scene_discontinuity'
                if reason is not None:self.reset()
            self._token=session_token
            self._last_index=frame_index
            previous=list(self._history)
            self._history.append(frame.copy())
            self._history=self._history[-2:]
            if reason is not None:return baseline(reason)
            if len(previous)<2:return baseline('warming_up')
            if model is None:return baseline('no_model')
            try:
                from triad import make_arrays  # repository's RNE optical flow
                cur,p1,p2,c1,c2=make_arrays(frame,previous[-1],previous[-2])
                avg_trust=float((c1.mean()+c2.mean())/2)
                if not np.isfinite(avg_trust) or avg_trust<=0:
                    return baseline('no_trust')
                tensors=[x[None].float() for x in (cur,p1,p2,c1,c2)]
                prediction=model(*tensors)
                if not isinstance(prediction,torch.Tensor) or prediction.shape!=base.shape or not bool(torch.isfinite(prediction).all()):
                    raise RuntimeError('Model prediction invalid')
                return self._bgr(prediction.clamp(0,1)),SessionAudit(
                    'neural_research','provenance_rebuilt_from_raw_history',len(self._history),round(avg_trust,6))
            except (RuntimeError,ValueError,TypeError,ImportError,cv2.error):
                self.reset()
                return baseline('alignment_or_model_failure')
