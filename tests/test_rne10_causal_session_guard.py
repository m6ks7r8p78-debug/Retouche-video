"""27 synthetic-only RNE10 tests. No user frames or trained model weights."""
import sys, unittest
from unittest.mock import patch
from pathlib import Path
import numpy as np, torch
from torch.nn import functional as F
sys.path[:0]=[str(Path(__file__).resolve().parents[1]/'outils'/'rne'/'rne10'),
             str(Path(__file__).resolve().parents[1]/'outils'/'rne')]
from causal_session_guard import CausalSessionGuard

class Model:
    def __call__(self,cur,p1,p2,c1,c2):
        trust=torch.maximum(c1,c2)
        return (F.interpolate(cur,scale_factor=2,mode='bicubic',align_corners=False)
                + .01*F.interpolate(trust,scale_factor=2,mode='nearest').repeat(1,3,1,1)).clamp(0,1)

class TestSession(unittest.TestCase):
    def setUp(self):
        self.frame=np.full((48,48,3),110,np.uint8)
        self.g=CausalSessionGuard()
        self.a='a'*32
        self.b='b'*32
    def c(self,i,frame=None,token=None,opt=True,model=None):
        return self.g.consume(self.frame if frame is None else frame,frame_index=i,
            session_token=self.a if token is None else token,manual_research_opt_in=opt,model=model)
    def start(self):
        for i in (0,1):self.c(i)
    def test_default_refuses_and_does_not_retain(self):
        _,audit=self.c(0,opt=False)
        self.assertEqual(audit.reason,'research_not_authorized')
        self.assertEqual(len(self.g._history),0)
    def test_first_frame_fallback(self):
        self.assertEqual(self.c(0)[1].reason,'warming_up')
    def test_second_frame_fallback(self):
        self.start();self.assertEqual(len(self.g._history),2)
    def test_third_uses_model(self):
        self.start();self.assertEqual(self.c(2,model=Model())[1].status,'neural_research')
    def test_one_frame_gap_resets(self):
        self.start();self.assertEqual(self.c(5,model=Model())[1].reason,'frame_sequence_broken')
    def test_duplicate_sequence_resets(self):
        self.start();self.assertEqual(self.c(1,model=Model())[1].reason,'frame_sequence_broken')
    def test_reversed_sequence_resets(self):
        self.start();self.assertEqual(self.c(0,model=Model())[1].reason,'frame_sequence_broken')
    def test_new_stream_resets(self):
        self.start();self.assertEqual(self.c(2,token=self.b,model=Model())[1].reason,'stream_changed')
    def test_dimensions_change_resets(self):
        self.start();self.assertEqual(self.c(2,np.full((48,56,3),110,np.uint8),model=Model())[1].reason,'dimensions_changed')
    def test_scene_cut_resets(self):
        self.start();self.assertEqual(self.c(2,np.full_like(self.frame,255),model=Model())[1].reason,'scene_discontinuity')
    def test_zero_confidence_fallback(self):
        self.start()
        fake=(torch.zeros(3,48,48),torch.zeros(3,48,48),torch.zeros(3,48,48),
              torch.zeros(1,48,48),torch.zeros(1,48,48))
        with patch('triad.make_arrays',return_value=fake):
            _,audit=self.c(2,model=Model())
        self.assertEqual(audit.reason,'no_trust')
    def test_no_model_fallback(self):
        self.start();self.assertEqual(self.c(2)[1].reason,'no_model')
    def test_bad_model_fallback(self):
        class Broken:
            def __call__(self,*a):raise RuntimeError('bad')
        self.start();self.assertEqual(self.c(2,model=Broken())[1].reason,'alignment_or_model_failure')
    def test_bad_shape_model_fallback(self):
        class Broken:
            def __call__(self,*a):return torch.zeros((1,1,2,2))
        self.start();self.assertEqual(self.c(2,model=Broken())[1].reason,'alignment_or_model_failure')
    def test_no_frame_mutation(self):
        old=self.frame.copy()
        self.c(0)
        self.frame[0,0,0]=5
        self.assertEqual(self.g._history[0][0,0,0],old[0,0,0])
    def test_bad_input_type(self):
        with self.assertRaises(TypeError):self.c(0,frame=self.frame.astype('float32'))
    def test_bad_input_dims(self):
        with self.assertRaises(TypeError):self.c(0,frame=self.frame[:,:,0])
    def test_too_small(self):
        with self.assertRaises(ValueError):self.c(0,frame=np.zeros((15,30,3),np.uint8))
    def test_session_token_format(self):
        with self.assertRaises(ValueError):self.c(0,token='a_filename.mp4')
    def test_bool_index_rejected(self):
        with self.assertRaises(ValueError):
            self.g.consume(self.frame,frame_index=True,session_token=self.a)
    def test_negative_index(self):
        with self.assertRaises(ValueError):self.c(-1)
    def test_nonboolean_optin(self):
        with self.assertRaises(TypeError):
            self.g.consume(self.frame,frame_index=0,session_token=self.a,manual_research_opt_in=1)
    def test_no_export_or_deploy(self):
        _,audit=self.c(0)
        self.assertFalse(audit.media_export_authorized)
        self.assertFalse(audit.automatic_deployment)
    def test_not_facial_validation(self):
        _,audit=self.c(0)
        self.assertFalse(audit.real_alignment_verified)
        self.assertFalse(audit.generalization_proven)
    def test_research_pred_output_shape(self):
        self.start();img,_=self.c(2,model=Model())
        self.assertEqual(img.shape,(96,96,3))
        self.assertEqual(img.dtype,np.uint8)
    def test_reset_clears_history(self):
        self.start();self.g.reset()
        self.assertEqual(self.g._history,[])
        self.assertIsNone(self.g._token)
    def test_no_precomputed_trust_input(self):
        with self.assertRaises(TypeError):
            self.g.consume(self.frame,frame_index=0,session_token=self.a,
                           confidence=np.ones((48,48)))

if __name__=='__main__':unittest.main()
