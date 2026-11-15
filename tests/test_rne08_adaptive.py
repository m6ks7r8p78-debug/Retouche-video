"""All synthetic; no video, weight or personal media in CI."""
import unittest
import tempfile
from pathlib import Path
import numpy as np
import cv2
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'outils'/'rne'/'rne08'))
from adaptive_selector import FEATURE_NAMES,extract_features,train_policy,preview_decision,save_policy,load_policy
from scene_router import SceneRouter

class AdaptiveTests(unittest.TestCase):
 def setUp(self):
  rng=np.random.default_rng(8)
  self.cur=rng.integers(0,255,(40,40,3),dtype=np.uint8)
  self.pr=np.roll(self.cur,1,axis=1)
  self.bic=cv2.resize(self.cur,(80,80),interpolation=cv2.INTER_CUBIC)
  self.sr=np.clip(self.bic.astype(np.int16)+2,0,255).astype(np.uint8)
  self.c=np.ones((40,40),np.float32)
  self.f=extract_features(self.cur,self.pr,self.c,self.c,self.bic,self.sr)
  x=np.stack([self.f*(1+i*.002) for i in range(44)])
  self.model=train_policy(x,np.linspace(-.3,.5,44))
 def test_feature_count(self):self.assertEqual(len(self.f),len(FEATURE_NAMES))
 def test_features_finite(self):self.assertTrue(np.isfinite(self.f).all())
 def test_features_do_not_need_high_reference(self):self.assertEqual(len(extract_features(self.cur,self.pr,self.c,self.c,self.bic,self.sr)),len(self.f))
 def test_features_no_mutation(self):
  old=self.cur.copy();extract_features(self.cur,self.pr,self.c,self.c,self.bic,self.sr);self.assertTrue(np.array_equal(old,self.cur))
 def test_reject_wrong_image_size(self):
  with self.assertRaises(ValueError):extract_features(self.cur,self.pr,self.c,self.c,self.bic[:40],self.sr)
 def test_reject_bad_motion_confidence(self):
  with self.assertRaises(ValueError):extract_features(self.cur,self.pr,self.c*2,self.c,self.bic,self.sr)
 def test_reject_nan_motion(self):
  c=self.c.copy();c[0,0]=float('nan')
  with self.assertRaises(ValueError):extract_features(self.cur,self.pr,c,self.c,self.bic,self.sr)
 def test_ridge_training(self):self.assertEqual(self.model.training_samples,44)
 def test_ridge_no_nan_targets(self):
  with self.assertRaises(ValueError):train_policy(np.repeat(self.f[None],44,0),np.full(44,float('nan')))
 def test_ridge_min_samples(self):
  with self.assertRaises(ValueError):train_policy(np.repeat(self.f[None],5,0),np.ones(5))
 def test_predict_finite(self):self.assertTrue(np.isfinite(self.model.predict_expected_gain(self.f)))
 def test_default_preview_denied(self):self.assertEqual(preview_decision(self.model,self.f)['route'],'bicubic_faithful')
 def test_auto_export_never_authorized(self):self.assertFalse(preview_decision(self.model,self.f,manual_opt_in=True)['media_export_authorized'])
 def test_user_opt_in_still_requires_positive_prediction(self):
  a=preview_decision(self.model,self.f,manual_opt_in=True)
  self.assertIn(a['route'],('bicubic_faithful','rne04_laboratory_preview'))
 def test_cannot_enable_with_nonbool(self):
  with self.assertRaises(TypeError):preview_decision(self.model,self.f,manual_opt_in=1)
 def test_secure_private_roundtrip(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'policy.json';save_policy(self.model,p)
   m=load_policy(p)
   self.assertAlmostEqual(m.predict_expected_gain(self.f),self.model.predict_expected_gain(self.f))
 def test_schema_mismatch_rejected(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'policy.json';p.write_text('{}')
   with self.assertRaises(ValueError):load_policy(p)

class RouterTests(unittest.TestCase):
 def step(self,r,g,**kw):
  return r.next_frame(estimated_gain_db=g,manual_opt_in=True,model_trusted=True,**kw)
 def test_default_never_preview(self):self.assertEqual(SceneRouter().next_frame(estimated_gain_db=1)['route'],'bicubic_faithful')
 def test_requires_three_stable_frames(self):
  r=SceneRouter();self.assertEqual(self.step(r,.3)['route'],'bicubic_faithful')
  self.assertEqual(self.step(r,.3)['route'],'bicubic_faithful')
  self.assertEqual(self.step(r,.3)['route'],'rne04_manual_research_preview')
 def test_oscillation_no_flicker(self):
  r=SceneRouter();x=[self.step(r,.3)['route'] for _ in range(3)]
  x.extend(self.step(r,a)['route'] for a in (.09,.15,.09,.15,.09,.15))
  self.assertEqual(x.count('rne04_manual_research_preview'),7)
 def test_two_low_frames_leave_preview(self):
  r=SceneRouter();[self.step(r,.3) for _ in range(3)]
  self.assertEqual(self.step(r,.08)['route'],'rne04_manual_research_preview')
  self.assertEqual(self.step(r,.08)['route'],'bicubic_faithful')
 def test_cut_resets(self):
  r=SceneRouter();[self.step(r,.3) for _ in range(3)]
  self.assertEqual(self.step(r,.4,scene_cut=True)['route'],'bicubic_faithful')
 def test_memory_fallback(self):
  r=SceneRouter();[self.step(r,.3) for _ in range(3)]
  self.assertTrue(self.step(r,.4,memory_ok=False)['state_reset'])
 def test_bad_confidence_fallback(self):
  r=SceneRouter();[self.step(r,.3) for _ in range(3)]
  self.assertEqual(r.next_frame(estimated_gain_db=.4,manual_opt_in=True,model_trusted=False)['route'],'bicubic_faithful')
 def test_explicit_source_guard(self):
  r=SceneRouter();self.assertEqual(self.step(r,.4,protected_source=False)['route'],'bicubic_faithful')
 def test_nonfinite_refused(self):
  with self.assertRaises(ValueError):SceneRouter().next_frame(estimated_gain_db=float('nan'))
 def test_wrong_boolean_refused(self):
  with self.assertRaises(TypeError):SceneRouter().next_frame(estimated_gain_db=.3,model_trusted=1)
 def test_wrong_margins_refused(self):
  with self.assertRaises(ValueError):SceneRouter(enter_margin_db=.1,exit_margin_db=.2)
 def test_never_deploy(self):
  r=SceneRouter();o=[self.step(r,.9) for _ in range(10)]
  self.assertFalse(any(x['deployment_allowed'] or x['auto_export'] for x in o))

if __name__=='__main__':unittest.main()