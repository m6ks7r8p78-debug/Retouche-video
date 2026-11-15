"""RNE13: 26 synthetic-only unit tests for regional motion diagnostics."""
import sys, unittest
from pathlib import Path
import cv2, numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'outils'/'rne'/'rne13'))
from regional_motion_audit import audit_regions,anonymous_summary

def pair(seed=11,dx=3,dy=0):
    rng=np.random.default_rng(seed)
    old=rng.integers(12,243,(192,192,3),np.uint8)
    old=cv2.GaussianBlur(old,(3,3),.65)
    new=cv2.warpAffine(old,np.float32([[1,0,dx],[0,1,dy]]),
        (192,192),borderMode=cv2.BORDER_REFLECT101)
    return new,old

def flow_of(cur,prev):
    return cv2.calcOpticalFlowFarneback(cv2.cvtColor(cur,cv2.COLOR_BGR2GRAY),
       cv2.cvtColor(prev,cv2.COLOR_BGR2GRAY),None,.5,3,15,3,5,1.2,0)

class RegionalTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.cur,cls.prev=pair()
        cls.dense=flow_of(cls.cur,cls.prev)
    def call(self,cur=None,prev=None,flow=None,opt=True):
        return audit_regions(self.cur if cur is None else cur,
            self.prev if prev is None else prev,
            self.dense if flow is None else flow,manual_research_opt_in=opt)
    def test_default_disabled(self):
        self.assertEqual(self.call(opt=False).status,'research_disabled')
    def test_disabled_has_no_tile_data(self):
        self.assertEqual(self.call(opt=False).tiles,tuple())
    def test_valid_translation_has_supported_tiles(self):
        self.assertGreaterEqual(self.call().supported_tiles,14)
    def test_intentional_2px_error_rejected(self):
        w=self.dense.copy();w[...,0]+=2
        self.assertGreaterEqual(self.call(flow=w).disagreement_tiles,12)
    def test_local_error_is_local(self):
        w=self.dense.copy();w[:48,:48,0]+=3
        a=self.call(flow=w)
        self.assertEqual(a.tiles[0].status,'disagreement')
        self.assertEqual(a.tiles[15].status,'supported')
    def test_1px_error_on_half_image(self):
        w=self.dense.copy();w[:,:96,0]+=1
        a=self.call(flow=w)
        self.assertGreaterEqual(a.disagreement_tiles,6)
        self.assertGreaterEqual(a.supported_tiles,6)
    def test_flat_image_abstains(self):
        x=np.full_like(self.cur,120)
        a=self.call(cur=x,prev=x,flow=np.zeros_like(self.dense))
        self.assertEqual(a.insufficient_tiles,16)
    def test_zero_confidence_not_claimed(self):
        self.assertFalse(self.call().motion_truth_certified)
    def test_research_only(self):
        self.assertTrue(self.call().manual_research_only)
    def test_not_deployed(self):
        self.assertFalse(self.call().automatic_rendering_allowed)
    def test_no_media_export(self):
        self.assertFalse(self.call().exports_personal_media)
    def test_not_real_calibrated(self):
        self.assertFalse(self.call().calibrated_for_real_video)
    def test_exactly_16_tiles(self):
        a=self.call();self.assertEqual(len(a.tiles),16)
        self.assertEqual(sum((a.supported_tiles,a.disagreement_tiles,a.insufficient_tiles)),16)
    def test_row_col_layout(self):
        a=self.call()
        self.assertEqual((a.tiles[0].row,a.tiles[0].col),(0,0))
        self.assertEqual((a.tiles[-1].row,a.tiles[-1].col),(3,3))
    def test_numpy_dtypes(self):
        with self.assertRaises(ValueError):
            self.call(cur=self.cur.astype('float32'))
    def test_mismatched_shapes(self):
        with self.assertRaises(ValueError):self.call(prev=self.prev[:20])
    def test_flow_wrong_type(self):
        with self.assertRaises(ValueError):self.call(flow=self.dense.astype('float64'))
    def test_flow_wrong_shape(self):
        with self.assertRaises(ValueError):self.call(flow=self.dense[:20])
    def test_nan_flow(self):
        x=self.dense.copy();x[0,0,0]=np.nan
        with self.assertRaises(ValueError):self.call(flow=x)
    def test_invalid_optin_type(self):
        with self.assertRaises(TypeError):
            audit_regions(self.cur,self.prev,self.dense,manual_research_opt_in=1)
    def test_wrong_color_channels(self):
        with self.assertRaises(ValueError):self.call(cur=self.cur[:,:,0])
    def test_missing_input(self):
        with self.assertRaises(TypeError):
            audit_regions(None,self.prev,self.dense,manual_research_opt_in=True)
    def test_too_small(self):
        with self.assertRaises(ValueError):
            audit_regions(self.cur[:60],self.prev[:60],self.dense[:60],manual_research_opt_in=True)
    def test_inputs_not_mutated(self):
        a,b,c=self.cur.copy(),self.prev.copy(),self.dense.copy()
        self.call()
        self.assertTrue(np.array_equal(self.cur,a))
        self.assertTrue(np.array_equal(self.prev,b))
        self.assertTrue(np.array_equal(self.dense,c))
    def test_anonymous_serialization(self):
        d=anonymous_summary(self.call())
        self.assertNotIn('filename',d)
        self.assertEqual(len(d['tiles']),16)
    def test_serialization_reject_wrong_type(self):
        with self.assertRaises(TypeError):anonymous_summary(None)

if __name__=='__main__':unittest.main()
