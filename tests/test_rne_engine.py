"""RNE v0.1 synthetic-only tests. No personal pixels are committed or copied."""
from pathlib import Path
import sys
import tempfile
import unittest

import cv2
import numpy as np
import torch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'outils'/'rne'))
from engine import RNE2x, RNERenderer, neural_upscale, load_model, video_render
from train import verify_manifest, make_pair


class TestRNE(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        torch.set_num_threads(1)
        cls.model=RNE2x().eval()
        cls.image=np.random.default_rng(42).integers(0,255,(32,40,3),dtype=np.uint8)

    def test_architecture_is_owned_and_runs(self):
        with torch.inference_mode():
            y=self.model(torch.rand((1,3,16,20)))
        self.assertEqual(tuple(y.shape),(1,3,32,40))
        self.assertEqual(sum(p.numel() for p in self.model.parameters()),13692)
    def test_deterministic_forward(self):
        with torch.inference_mode():
            a=torch.rand((1,3,16,20));self.assertTrue(torch.equal(self.model(a),self.model(a)))
    def test_neural_tiled_output(self):
        v=neural_upscale(self.image,self.model,tile=32,context=8)
        self.assertEqual(v.shape,(64,80,3));self.assertEqual(v.dtype,np.uint8)
    def test_strength_zero_baseline(self):
        a=neural_upscale(self.image,self.model,tile=32,context=8,strength=0)
        expected=cv2.resize(self.image,(80,64),interpolation=cv2.INTER_CUBIC)
        self.assertLess(np.abs(a.astype(int)-expected.astype(int)).max(),3)
    def test_invalid_strength(self):
        with self.assertRaises(ValueError):neural_upscale(self.image,self.model,tile=32,strength=float('nan'))
    def test_protected_pixels_remain_bicubic_exact(self):
        protected=np.zeros(self.image.shape[:2],dtype=np.uint8);protected[:,:20]=255
        r=RNERenderer(self.model,temporal=False,tile=32)
        a=r.frame(self.image,protected);b=cv2.resize(self.image,(80,64),interpolation=cv2.INTER_CUBIC)
        self.assertTrue(np.array_equal(a[:,:40],b[:,:40]))
    def test_static_frame_temporal_uses_history(self):
        r=RNERenderer(None,temporal=True);a=r.frame(self.image);b=r.frame(self.image)
        self.assertEqual(r.state.frames_temporal,1);self.assertTrue(np.array_equal(a,b))
    def test_scene_cut_reinitializes(self):
        r=RNERenderer(None,temporal=True)
        r.frame(np.zeros((32,40,3),np.uint8));r.frame(np.full((32,40,3),255,np.uint8))
        self.assertEqual(r.state.scene_resets,1);self.assertEqual(r.state.frames_temporal,0)
    def test_does_not_modify_source(self):
        before=self.image.copy();RNERenderer(self.model,temporal=False,tile=32).frame(self.image)
        self.assertTrue(np.array_equal(before,self.image))
    def test_invalid_mask(self):
        with self.assertRaises(TypeError):RNERenderer(None).frame(self.image,np.zeros((4,5),np.uint8))
    def test_untrusted_weight_file_is_rejected_safely(self):
        with tempfile.TemporaryDirectory() as td:
            p=Path(td)/'weights.pt';torch.save({'not_expected':torch.zeros(1)},p)
            with self.assertRaises(ValueError):load_model(p)
    def test_valid_weights_reload_identical(self):
        with tempfile.TemporaryDirectory() as td:
            p=Path(td)/'weights.pt';torch.save(self.model.state_dict(),p)
            loaded=load_model(p)
            with torch.inference_mode():
                x=torch.rand((1,3,18,22))
                self.assertTrue(torch.equal(loaded(x),self.model(x)))
    def test_no_duplicate_group_leak(self):
        with tempfile.TemporaryDirectory() as td:
            f=Path(td)/'synthetic.mp4';f.write_bytes(b'test bytes')
            import hashlib
            h=hashlib.sha256(b'test bytes').hexdigest()
            o={'path':str(f),'group':'A','split':'train','sha256':h,
               'private_training_consent':False,'private_evaluation_consent':True}
            with self.assertRaises(PermissionError):verify_manifest([o,o,o,o])
    def test_cannot_train_without_consent(self):
        with tempfile.TemporaryDirectory() as td:
            f=Path(td)/'synthetic.mp4';f.write_bytes(b'test bytes')
            import hashlib
            h=hashlib.sha256(b'test bytes').hexdigest()
            o={'path':str(f),'group':'A','split':'train','sha256':h,
               'private_training_consent':False,'private_evaluation_consent':False}
            with self.assertRaises(PermissionError):verify_manifest([o,o,o,o])
    def test_make_pair_shapes_and_range(self):
        src=np.random.default_rng(7).integers(0,255,(128,128,3),dtype=np.uint8)
        import random
        lo,hi=make_pair(src,random.Random(4),crop=48)
        self.assertEqual(tuple(lo.shape),(3,24,24));self.assertEqual(tuple(hi.shape),(3,48,48))
        self.assertGreaterEqual(float(lo.min()),0);self.assertLessEqual(float(lo.max()),1)
    def test_video_output_is_real_and_decodable(self):
        with tempfile.TemporaryDirectory() as td:
            src=Path(td)/'synthetic.mp4';dst=Path(td)/'processed.mp4'
            w=cv2.VideoWriter(str(src),cv2.VideoWriter_fourcc(*'mp4v'),12,(40,32))
            self.assertTrue(w.isOpened())
            for i in range(4):
                fr=np.zeros((32,40,3),dtype=np.uint8);fr[8:20,8+i:20+i]=180;w.write(fr)
            w.release()
            m=video_render(src,dst,self.model,max_frames=3,temporal=True)
            self.assertEqual(m['frames'],3);self.assertTrue(m['modele_neuronal_charge'])
            cap=cv2.VideoCapture(str(dst));self.assertTrue(cap.isOpened())
            self.assertEqual(int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)),80)
            self.assertEqual(int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)),64)
            self.assertTrue(cap.read()[0]);cap.release()
    def test_source_never_overwritten(self):
        with tempfile.TemporaryDirectory() as td:
            f=Path(td)/'x.mp4';f.write_bytes(b'a')
            with self.assertRaises(ValueError):video_render(f,f,None)

if __name__=='__main__':unittest.main()
