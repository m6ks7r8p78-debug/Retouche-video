"""RNE19 public synthetic-only provenance tests, no private videos."""
from dataclasses import replace
from pathlib import Path
import sys
import unittest
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'outils'/'rne'/'rne19'))
from part_provenance import CalibratedPartFrame,accumulate_part_evidence

def sample(frame_id=0,angle=0,wrong_color=False):
    n=24
    bgr=np.zeros((n,n,3),np.uint8)
    part=np.zeros((n,n),np.int16)
    part[:,n//2:]=1
    bgr[:,:n//2]=(25,50,75)
    bgr[:,n//2:]=(130,160,195) if not wrong_color else (230,220,210)
    u=np.full((n,n),.24,np.float32)
    u[:,n//2:]=.76
    v=np.full((n,n),.5,np.float32)
    inc=np.ones((n,n),np.float32)
    return CalibratedPartFrame(bgr,part,u,v,inc,((angle,0),(angle,0)),frame_id)

class TestRNE19Provenance(unittest.TestCase):
    def gate(self,fs,**kw):
        return accumulate_part_evidence(fs,part_count=2,manual_research_opt_in=True,**kw)

    def test_disabled_by_default(self):
        with self.assertRaises(PermissionError):
            accumulate_part_evidence([sample()],part_count=2)

    def test_one_view(self):
        x=self.gate([sample()])
        self.assertEqual(int(x.corroborated.sum()),0)
        self.assertEqual(int(x.observed.sum()),2)

    def test_distinct_angle_corroborated(self):
        x=self.gate([sample(0,0),sample(1,5)])
        self.assertEqual(int(x.corroborated.sum()),2)

    def test_duplicate_relative_angle_not_corroborated(self):
        x=self.gate([sample(0,0),sample(1,0)])
        self.assertEqual(int(x.corroborated.sum()),0)

    def test_part_colors_never_mixed(self):
        x=self.gate([sample()])
        self.assertTrue(np.array_equal(x.bgr[0][x.observed[0]][0],(25,50,75)))
        self.assertTrue(np.array_equal(x.bgr[1][x.observed[1]][0],(130,160,195)))

    def test_unobserved_black(self):
        x=self.gate([sample()])
        self.assertTrue((x.bgr[~x.observed]==0).all())

    def test_conflicting_colors_contested(self):
        x=self.gate([sample(0,0),sample(1,5,wrong_color=True)])
        self.assertGreater(int(x.contested.sum()),0)

    def test_conflicting_not_corroborated(self):
        x=self.gate([sample(0,0),sample(1,5,wrong_color=True)])
        self.assertTrue((~x.corroborated[x.contested]).all())

    def test_hidden_mask_excluded(self):
        f=sample()
        p=f.part_id.copy()
        p[:12,:12]=-2
        x=self.gate([replace(f,part_id=p)])
        self.assertEqual(int(x.observed.sum()),2)
        c=f.bgr.copy()
        c[:12,:12]=(250,250,250)
        y=self.gate([replace(f,part_id=p,bgr=c)])
        self.assertTrue(np.array_equal(x.bgr,y.bgr))

    def test_invalid_duplicate_id(self):
        with self.assertRaises(ValueError):self.gate([sample(),sample()])

    def test_wrong_viewbin(self):
        with self.assertRaises(ValueError):
            self.gate([replace(sample(),relative_view_bin=((0,0),))])

    def test_real_camera_blocked(self):
        with self.assertRaises(ValueError):
            self.gate([replace(sample(),inferred_from_personal_video=True)])

    def test_uncalibrated_blocked(self):
        with self.assertRaises(ValueError):
            self.gate([replace(sample(),simulator_ground_truth=False)])

    def test_invalid_part_rejected(self):
        f=sample()
        p=f.part_id.copy()
        p[0,0]=29
        with self.assertRaises(ValueError):
            self.gate([replace(f,part_id=p)])

    def test_nan_uv_rejected(self):
        f=sample()
        u=f.u.copy()
        u[0,0]=np.nan
        with self.assertRaises(ValueError):
            self.gate([replace(f,u=u)])

    def test_invalid_incidence_rejected(self):
        f=sample()
        inc=f.incidence.copy()
        inc[0,0]=2.
        with self.assertRaises(ValueError):
            self.gate([replace(f,incidence=inc)])

    def test_permission_type(self):
        with self.assertRaises(TypeError):
            accumulate_part_evidence([sample()],part_count=2,manual_research_opt_in=1)

    def test_no_production_claim(self):
        a=self.gate([sample()])
        self.assertTrue(a.research_only)
        self.assertFalse(a.inferred_human_shape)
        self.assertFalse(a.filled_unobserved)
        self.assertFalse(a.production_enabled)
        self.assertFalse(a.personal_media_exported)

if __name__=='__main__':unittest.main()
