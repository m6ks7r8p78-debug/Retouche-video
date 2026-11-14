import unittest,sys,tempfile,shutil
from pathlib import Path
import numpy as np,cv2,torch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'outils'/'rne'))
from triad import RNE03,alignment,RNE03Renderer,load_weights,render_video
class TestTriad(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  torch.set_num_threads(1)
  cls.model=RNE03().eval()
  cls.frame=np.random.default_rng(7).integers(0,256,(40,48,3),dtype=np.uint8)
 def test_11ch_architecture(self):
  self.assertEqual(self.model.net[0].in_channels,11)
  self.assertEqual(sum(x.numel() for x in self.model.parameters()),13684)
 def test_2x_rgb(self):
  c=torch.rand(2,3,24,20);co=torch.ones(2,1,24,20)
  self.assertEqual(tuple(self.model(c,c,c,co,co).shape),(2,3,48,40))
 def test_cuts_zero_confidence(self):
  a=np.zeros((40,48,3),np.uint8);b=np.full_like(a,255)
  warped,conf=alignment(a,b)
  self.assertEqual(float(conf.max()),0.)
 def test_identical_confidence(self):
  w,c=alignment(self.frame,self.frame)
  self.assertTrue(np.array_equal(w,self.frame));self.assertTrue(np.all(c==1))
 def test_invalid_alignment(self):
  with self.assertRaises(ValueError):alignment(self.frame,np.zeros((20,30,3),np.uint8))
 def test_warp_memory_and_confidence_bounded(self):
  b=np.roll(self.frame,1,axis=1);w,c=alignment(self.frame,b)
  self.assertEqual(w.shape,self.frame.shape);self.assertTrue(np.isfinite(c).all());self.assertGreaterEqual(float(c.min()),0.);self.assertLessEqual(float(c.max()),1.)
 def test_shape_guard(self):
  a=torch.rand(1,3,20,18);co=torch.ones(1,1,20,17)
  with self.assertRaises(ValueError):self.model(a,a,a,co,co)
 def test_zero_confidence_bicubic(self):
  a=torch.rand(1,3,20,18);co=torch.zeros(1,1,20,18)
  out=self.model(a,a,a,co,co)
  expect=torch.nn.functional.interpolate(a,scale_factor=2,mode='bicubic',align_corners=False).clamp(0,1)
  self.assertTrue(torch.equal(out,expect))
 def test_renderer_two_frame_warmup(self):
  r=RNE03Renderer(self.model,tile=32,context=8)
  r.frame(self.frame);r.frame(self.frame)
  self.assertEqual(r.temporal_frames,0)
  self.assertEqual(r.frames,2)
 def test_renderer_third_frame(self):
  r=RNE03Renderer(self.model,tile=32,context=8)
  for _ in range(3):fr=r.frame(self.frame)
  self.assertEqual(fr.shape,(80,96,3));self.assertEqual(r.temporal_frames,1)
 def test_reset_on_large_cut(self):
  r=RNE03Renderer(self.model,tile=32,context=8)
  r.frame(np.zeros_like(self.frame));r.frame(np.zeros_like(self.frame));r.frame(np.full_like(self.frame,255))
  self.assertEqual(r.resets,1);self.assertEqual(r.temporal_frames,0)
 def test_protected_pixels_exact_bicubic(self):
  r=RNE03Renderer(self.model,tile=32,context=8)
  m=np.zeros(self.frame.shape[:2],np.uint8);m[:20,:]=255
  for _ in range(3):out=r.frame(self.frame,m)
  ref=cv2.resize(self.frame,(96,80),interpolation=cv2.INTER_CUBIC)
  self.assertTrue(np.array_equal(out[:40],ref[:40]))
 def test_inputs_immutable(self):
  r=RNE03Renderer(self.model,tile=32,context=8);arr=self.frame.copy()
  for _ in range(3):r.frame(self.frame)
  self.assertTrue(np.array_equal(arr,self.frame))
 def test_save_and_load_safe(self):
  with tempfile.TemporaryDirectory() as td:
   p=Path(td)/'w.pt';torch.save(self.model.state_dict(),p)
   loaded=load_weights(p)
   self.assertEqual(sum(x.numel() for x in loaded.parameters()),13684)
 def test_bad_weights_rejected(self):
  with tempfile.TemporaryDirectory() as td:
   p=Path(td)/'w.pt';torch.save({'unknown':torch.ones(1)},p)
   with self.assertRaises(ValueError):load_weights(p)
 def test_no_untrained_video_claim(self):
  with tempfile.TemporaryDirectory() as td:
   inp=Path(td)/'test.mp4';inp.write_bytes(b'not a real video')
   with self.assertRaises(ValueError):render_video(inp,Path(td)/'out.mp4',None)
 def test_synthetic_video_encodes(self):
  with tempfile.TemporaryDirectory() as td:
   inp=Path(td)/'test.mp4';out=Path(td)/'out.mp4';weights=Path(td)/'w.pt';torch.save(self.model.state_dict(),weights)
   vw=cv2.VideoWriter(str(inp),cv2.VideoWriter_fourcc(*'mp4v'),10,(48,40))
   self.assertTrue(vw.isOpened())
   for i in range(5):
    a=np.zeros((40,48,3),dtype=np.uint8);a[8:24,8+i:24+i]=150;vw.write(a)
   vw.release();diag=render_video(inp,out,weights,max_frames=5,tile=32)
   self.assertEqual(diag['frames'],5);self.assertEqual(diag['temporal_frames'],3)
   self.assertFalse(diag['audio_included']);self.assertTrue(diag['not_nvidia_dlss5'])
   cap=cv2.VideoCapture(str(out));self.assertTrue(cap.isOpened());self.assertEqual(int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)),96);self.assertTrue(cap.read()[0]);cap.release()
 def test_no_git_media_output(self):
  with tempfile.TemporaryDirectory() as td:
   git=Path(td)/'repo';git.mkdir();(git/'.git').mkdir()
   inp=Path(td)/'src.mp4';inp.write_bytes(b'hi')
   with self.assertRaises(ValueError):render_video(inp,git/'out.mp4','invalid')
 def test_reject_bad_masks(self):
  r=RNE03Renderer(self.model,tile=32,context=8)
  with self.assertRaises(TypeError):r.frame(self.frame,np.zeros((2,3),np.uint8))
if __name__=='__main__':unittest.main()