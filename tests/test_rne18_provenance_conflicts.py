"""Safety checks: same-camera repeats are not independent; inconsistent surface is contested."""
import dataclasses,unittest
import numpy as np
from outils.rne.rne18.observable_atlas import synthetic_texture,project_texture,accumulate_visible_surface,render_known_surface

class TestProvenance(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.texture=synthetic_texture(128,256,seed=33)
        cls.a=project_texture(cls.texture,0,192,occlusion='none',phase=0)
        cls.b=project_texture(cls.texture,.38,192,occlusion='none',phase=1)
    def atlas(self,*frames):return accumulate_visible_surface(list(frames),shape=(128,256))
    def test_same_camera_repeat_is_not_independent(self):
        duplicate=dataclasses.replace(self.a,frame_id=1)
        result=self.atlas(self.a,duplicate)
        self.assertFalse(result.corroborated.any())
        self.assertEqual(int(result.evidence_views.max()),1)
    def test_nearby_same_angular_bin_not_independent(self):
        near=project_texture(self.texture,.01,192,phase=2)
        result=self.atlas(self.a,near)
        self.assertFalse(result.corroborated.any())
    def test_different_viewpoints_have_independent_support(self):
        x=self.atlas(self.a,self.b)
        self.assertGreater(x.corroborated.sum(),1000)
    def test_distinct_yaw_2pi_is_same_view(self):
        near=project_texture(self.texture,2*np.pi,192,phase=2)
        x=self.atlas(self.a,near)
        self.assertFalse(x.corroborated.any())
    def test_wrong_calibration_leads_more_contested_cells(self):
        normal=self.atlas(self.a,self.b)
        forged=dataclasses.replace(self.b,u=(self.b.u+.12)%1)
        broken=self.atlas(self.a,forged)
        self.assertGreater(int(broken.contested.sum()),int(normal.contested.sum())+2000)
    def test_contested_is_not_corroborated(self):
        forged=dataclasses.replace(self.b,u=(self.b.u+.12)%1)
        a=self.atlas(self.a,forged)
        self.assertFalse(np.any(a.contested&a.corroborated))
    def test_color_std_unseen_nan(self):
        x=self.atlas(self.a)
        self.assertTrue(np.isnan(x.color_std_255[~x.observed]).all())
    def test_confidence_is_not_real_geometry(self):
        x=self.atlas(self.a,self.b)
        self.assertFalse(x.geometry_3d_estimated)
        self.assertFalse(x.real_identity_reconstructed)
    def test_bad_camera_yaw_nan(self):
        bad=dataclasses.replace(self.a,known_yaw=float('nan'))
        with self.assertRaises(ValueError):self.atlas(bad)
    def test_corrupted_frame_content_contested_not_auto_published(self):
        img=self.b.bgr.copy()
        img[self.b.visible]=255-img[self.b.visible]
        bad=dataclasses.replace(self.b,bgr=img)
        result=self.atlas(self.a,bad)
        self.assertGreater(int(result.contested.sum()),1000)
        self.assertFalse(result.automatic_deployment)
    def test_preview_corroboration_is_subset_of_known(self):
        x=self.atlas(self.a,self.b)
        _,known,trusted,_=render_known_surface(x,.19,192)
        self.assertFalse(np.any(trusted&(~known)))

if __name__=='__main__':unittest.main()