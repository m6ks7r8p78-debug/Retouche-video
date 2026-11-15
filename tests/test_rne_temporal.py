"""Synthetic-only validation of RNE 0.2. No user file is loaded."""
import sys
from pathlib import Path
import tempfile
import unittest
import hashlib
import json
import cv2
import numpy as np
import torch

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'outils'/'rne'))
from engine import RNE2x
from temporal import RNETemporal2x,RNE02Renderer,align_previous,load_temporal,render_video
from train_temporal import sample,quality,run

class TemporalCases(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        torch.set_num_threads(1)
        cls.base=RNE2x().eval();cls.net=RNETemporal2x().eval()
        cls.frame=np.random.default_rng(12).integers(0,255,(48,64,3),dtype=np.uint8)

    def test_parameters(self):
        self.assertGreater(sum(x.numel() for x in self.net.parameters()),1000)
    def test_input_shapes(self):
        with torch.no_grad():
            c=torch.rand(1,3,24,28);co=torch.ones(1,1,24,28);base=self.base(c)
            self.assertEqual(tuple(self.net(c,c,co,base).shape),(1,3,48,56))
    def test_zero_init_exact_frozen_reference(self):
        with torch.no_grad():
            c=torch.rand(1,3,24,28);ref=self.base(c)
            self.assertTrue(torch.equal(self.net(c,c,torch.ones(1,1,24,28),ref),ref))
    def test_zero_confidence_preserves_base_after_training(self):
        with torch.no_grad():
            c=torch.rand(1,3,24,28);base=self.base(c)
            self.net.conv[-2].bias.data.fill_(1.)
            self.assertTrue(torch.equal(self.net(c,c,torch.zeros(1,1,24,28),base),base))
            self.net.conv[-2].bias.data.zero_()
    def test_bad_shape_rejected(self):
        with self.assertRaises(ValueError):self.net(torch.zeros(1,3,24,28),torch.zeros(1,3,25,28),torch.ones(1,1,24,28),torch.zeros(1,3,48,56))
    def test_constant_frame_alignment(self):
        b=np.full((48,64,3),128,np.uint8)
        warp,conf,cut=align_previous(b,b)
        self.assertFalse(cut);self.assertEqual(float(conf.min()),1.);self.assertTrue(np.array_equal(warp,b))
    def test_cut_confidence_reset(self):
        a=np.zeros((48,64,3),np.uint8);b=np.full((48,64,3),255,np.uint8)
        _,conf,cut=align_previous(b,a)
        self.assertTrue(cut);self.assertEqual(float(conf.max()),0.)
    def test_alignment_is_causal_no_future_needed(self):
        a=self.frame;out,c,cut=align_previous(np.roll(a,1,axis=1),a)
        self.assertEqual(out.shape,a.shape);self.assertEqual(c.shape,a.shape[:2]);self.assertFalse(cut)
    def test_renderer_creates_real_double_size_frame(self):
        r=RNE02Renderer(self.base,self.net,tile=32,context=6)
        out=r.frame(self.frame)
        self.assertEqual(out.shape,(96,128,3));self.assertEqual(out.dtype,np.uint8)
    def test_renderer_static_frame_temporal(self):
        r=RNE02Renderer(self.base,self.net,tile=32,context=6)
        a=r.frame(self.frame);b=r.frame(self.frame)
        self.assertEqual(r.temporal_frames,1);self.assertEqual(a.shape,b.shape)
    def test_scene_cut_renderer(self):
        r=RNE02Renderer(self.base,self.net,tile=32,context=6)
        r.frame(np.zeros((48,64,3),np.uint8));r.frame(np.full((48,64,3),255,np.uint8))
        self.assertEqual(r.cuts,1);self.assertEqual(r.temporal_frames,0)
    def test_protected_area_equals_bicubic(self):
        mask=np.zeros(self.frame.shape[:2],dtype=np.uint8);mask[:,:24]=255
        r=RNE02Renderer(self.base,self.net,tile=32,context=6)
        out=r.frame(self.frame,mask);bic=cv2.resize(self.frame,(128,96),interpolation=cv2.INTER_CUBIC)
        self.assertTrue(np.array_equal(out[:,:48],bic[:,:48]))
    def test_bad_mask(self):
        with self.assertRaises(TypeError):RNE02Renderer(self.base,self.net).frame(self.frame,np.zeros((3,5),np.uint8))
    def test_rejects_massive_frame(self):
        with self.assertRaises(ValueError):RNE02Renderer(self.base,self.net).frame(np.zeros((800,1280,3),np.uint8))
    def test_strict_private_weights_reload(self):
        with tempfile.TemporaryDirectory() as td:
            p=Path(td)/'valid.pt';torch.save(self.net.state_dict(),p)
            self.assertEqual(set(load_temporal(p).state_dict()),set(self.net.state_dict()))
            p=Path(td)/'bad.pt';torch.save({'surprise':torch.tensor(1)},p)
            with self.assertRaises(ValueError):load_temporal(p)
    def test_sample_pair_for_learning(self):
        rng=np.random.default_rng(1)
        case={'lr':rng.integers(0,255,(32,40,3),dtype=np.uint8),
              'warped':rng.integers(0,255,(32,40,3),dtype=np.uint8),
              'confidence':np.ones((32,40),np.float32),'hr':rng.integers(0,255,(64,80,3),dtype=np.uint8)}
        import random
        c,p,co,h=sample(case,random.Random(2),crop=48)
        self.assertEqual(tuple(c.shape),(3,24,24));self.assertEqual(tuple(co.shape),(1,24,24));self.assertEqual(tuple(h.shape),(3,48,48))
    def test_mp4_end_to_end(self):
        with tempfile.TemporaryDirectory() as td:
            source=Path(td)/'synthetic.mp4';dest=Path(td)/'out.mp4'
            w=cv2.VideoWriter(str(source),cv2.VideoWriter_fourcc(*'mp4v'),12,(48,48))
            self.assertTrue(w.isOpened())
            for i in range(4):
                img=np.zeros((48,48,3),np.uint8);img[10:35,9+i:29+i]=180;w.write(img)
            w.release()
            report=render_video(source,dest,self.base,self.net,max_frames=3)
            self.assertEqual(report['frames'],3)
            self.assertEqual(report['width'],96)
            check=cv2.VideoCapture(str(dest));self.assertTrue(check.isOpened());self.assertTrue(check.read()[0]);check.release()
    def test_never_overwrite_original(self):
        with tempfile.TemporaryDirectory() as td:
            p=Path(td)/'video.mp4';p.write_bytes(b'fake')
            with self.assertRaises(ValueError):render_video(p,p,self.base,self.net)
    def test_no_automatic_private_training(self):
        with tempfile.TemporaryDirectory() as td:
            p=Path(td)/'manifest.json';p.write_text('[]')
            with self.assertRaises(ValueError):run(p,Path(td)/'weights.pt',Path(td)/'out',steps=19)

if __name__=='__main__':unittest.main()