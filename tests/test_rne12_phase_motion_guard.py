"""RNE0.12: completely procedural and privacy-preserving regression tests."""
import sys, unittest
from pathlib import Path
import numpy as np
import cv2
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from outils.rne.rne12.phase_motion_guard import phase_motion_gate, to_dict


def scene(seed=3,shift=3):
    rng=np.random.default_rng(seed)
    prev=rng.integers(5,249,(192,192,3),dtype=np.uint8)
    prev=cv2.GaussianBlur(prev,(3,3),.6)
    mat=np.float32([[1,0,shift],[0,1,0]])
    cur=cv2.warpAffine(prev,mat,(192,192),borderMode=cv2.BORDER_REFLECT101)
    prevg=cv2.cvtColor(prev,cv2.COLOR_BGR2GRAY)
    curg=cv2.cvtColor(cur,cv2.COLOR_BGR2GRAY)
    dense=cv2.calcOpticalFlowFarneback(curg,prevg,None,.5,3,15,3,5,1.2,0)
    return cur,prev,dense


class PhaseGuardTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.cur,cls.prev,cls.dense=scene()

    def audit(self,dense=None,cur=None,prev=None,opt=True):
        return phase_motion_gate(self.cur if cur is None else cur,
                                 self.prev if prev is None else prev,
                                 self.dense if dense is None else dense,
                                 manual_research_opt_in=opt)

    def test_default_no_opt_in_abstains(self):
        a=self.audit(opt=False)
        self.assertEqual(a.reason,'research_disabled')
    def test_default_always_no_deploy(self):
        a=self.audit()
        self.assertFalse(a.production_allowed)
    def test_never_exports_personal_data(self):
        self.assertFalse(self.audit().exports_personal_media)
    def test_never_claims_face_identity(self):
        self.assertFalse(self.audit().face_identity_verified)
    def test_never_claims_generalization(self):
        self.assertFalse(self.audit().generalization_proven)
    def test_known_translation_provisional_agreement(self):
        a=self.audit()
        self.assertEqual(a.verdict,'provisional_agreement')
        self.assertEqual(a.reason,'three_observers_consistent_global_shift')
    def test_known_shift_sign(self):
        a=self.audit()
        self.assertAlmostEqual(a.phase_shift_x,-3.,delta=.2)
        self.assertAlmostEqual(a.phase_shift_y,0.,delta=.2)
    def test_global_shift_only_flag(self):
        self.assertTrue(self.audit().rigid_translation_only)
    def test_dense_shifted_one_pixel_disagreement(self):
        wrong=self.dense.copy();wrong[:,:,0]+=1.
        a=self.audit(dense=wrong)
        self.assertEqual(a.verdict,'abstain')
    def test_dense_shifted_two_pixels_disagreement(self):
        wrong=self.dense.copy();wrong[:,:,0]+=2.
        a=self.audit(dense=wrong)
        self.assertEqual(a.verdict,'abstain')
    def test_dense_shifted_five_pixels_disagreement(self):
        wrong=self.dense.copy();wrong[:,:,0]+=5.
        a=self.audit(dense=wrong)
        self.assertEqual(a.verdict,'abstain')
    def test_zero_flow_on_moving_scene_abstains(self):
        a=self.audit(dense=np.zeros_like(self.dense))
        self.assertEqual(a.verdict,'abstain')
    def test_flat_content_abstains(self):
        z=np.full_like(self.cur,100)
        a=self.audit(cur=z,prev=z,dense=np.zeros_like(self.dense))
        self.assertEqual(a.verdict,'abstain')
    def test_wrong_shape_rejected(self):
        with self.assertRaises(ValueError):self.audit(cur=self.cur[:90])
    def test_wrong_dtype_rejected(self):
        with self.assertRaises(ValueError):self.audit(cur=self.cur.astype(np.float32))
    def test_missing_frame_rejected(self):
        with self.assertRaises(TypeError):
            phase_motion_gate(None,self.prev,self.dense,manual_research_opt_in=True)
    def test_wrong_dense_flow_shape(self):
        with self.assertRaises(ValueError):self.audit(dense=self.dense[:50])
    def test_wrong_dense_flow_dtype(self):
        with self.assertRaises(ValueError):self.audit(dense=self.dense.astype('float64'))
    def test_nan_flow_rejected(self):
        bad=self.dense.copy();bad[0,0,0]=np.nan
        with self.assertRaises(ValueError):self.audit(dense=bad)
    def test_opt_in_must_be_boolean(self):
        with self.assertRaises(TypeError):
            phase_motion_gate(self.cur,self.prev,self.dense,manual_research_opt_in=1)
    def test_does_not_modify_inputs(self):
        cur=self.cur.copy();prev=self.prev.copy();dense=self.dense.copy()
        self.audit()
        self.assertTrue(np.array_equal(self.cur,cur))
        self.assertTrue(np.array_equal(self.prev,prev))
        self.assertTrue(np.array_equal(self.dense,dense))
    def test_output_contains_no_filename(self):
        a=to_dict(self.audit());self.assertNotIn('filename',a)
    def test_serializable_results(self):
        import json
        self.assertIsInstance(json.dumps(to_dict(self.audit())),str)
    def test_invalid_conversion(self):
        with self.assertRaises(TypeError):to_dict('not an audit')
    def test_scene_cut_refusal(self):
        cur,_,_=scene(seed=90)
        self.assertEqual(self.audit(cur=cur).verdict,'abstain')
    def test_bounded_error_statistics(self):
        a=self.audit()
        self.assertTrue(0<=a.fraction_dense_phase_over_2px<=1)
        self.assertGreaterEqual(a.median_dense_phase_disagreement,0)

if __name__=='__main__':unittest.main()
