"""RNE18: standalone synthetic evidence-based 3D atlas tests. No real images or faces."""
import unittest,dataclasses
from unittest.mock import patch
import numpy as np
from outils.rne.rne18.observable_atlas import (synthetic_texture,project_texture,accumulate_visible_surface,
                               render_known_surface,metrics_on_novel_view,EvidenceFrame,AtlasResult)

class TestEvidenceAtlas(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tex=synthetic_texture(96,192,seed=5)
        cls.a=project_texture(cls.tex,0,size=128,occlusion='ellipse',phase=0)
        cls.b=project_texture(cls.tex,1.2,size=128,occlusion='band',phase=1)
    def model(self,*frames):return accumulate_visible_surface(list(frames),shape=(96,192))
    def test_texture_format(self):
        self.assertEqual(self.tex.shape,(96,192,3));self.assertEqual(self.tex.dtype,np.uint8)
    def test_texture_seed_reproducible(self):
        self.assertTrue(np.array_equal(synthetic_texture(96,192,5),self.tex))
    def test_texture_seed_changes(self):
        self.assertFalse(np.array_equal(synthetic_texture(96,192,6),self.tex))
    def test_synthetic_geometry_contains_only_finite(self):
        self.assertTrue(np.isfinite(self.a.u).all());self.assertTrue(np.isfinite(self.a.v).all())
    def test_ellipse_hides_some_pixels(self):
        clear=project_texture(self.tex,0,size=128)
        self.assertLess(int(self.a.visible.sum()),int(clear.visible.sum()))
    def test_single_view_yields_no_corroboration(self):
        x=self.model(self.a);self.assertTrue(x.observed.any());self.assertFalse(x.corroborated.any())
    def test_two_views_cover_more_surface(self):
        x=self.model(self.a);y=self.model(self.a,self.b)
        self.assertGreater(y.observed.sum(),x.observed.sum())
    def test_observed_never_decreases(self):
        x=self.model(self.a);y=self.model(self.a,self.b)
        self.assertTrue(np.all(y.observed>=x.observed))
    def test_two_views_provide_corroboration(self):
        x=self.model(self.a,self.b)
        self.assertGreater(int(x.corroborated.sum()),0)
    def test_corroborated_subset_of_observed(self):
        x=self.model(self.a,self.b)
        self.assertFalse(np.any(x.corroborated&(~x.observed)))
    def test_evidence_view_count_bounded(self):
        x=self.model(self.a,self.b)
        self.assertLessEqual(int(x.evidence_views.max()),2)
    def test_duplicate_id_rejected(self):
        with self.assertRaises(ValueError):self.model(self.a,self.a)
    def test_valid_mask_false_all_is_unknown(self):
        bad=dataclasses.replace(self.a,visible=np.zeros_like(self.a.visible))
        x=self.model(bad)
        self.assertEqual(int(x.observed.sum()),0)
    def test_corrupt_occlusion_colors_do_not_change_atlas(self):
        base=self.model(self.a)
        altered=self.a.bgr.copy();altered[~self.a.visible]=[255,0,255]
        x=self.model(dataclasses.replace(self.a,bgr=altered))
        self.assertTrue(np.array_equal(base.bgr,x.bgr))
        self.assertTrue(np.array_equal(base.observed,x.observed))
    def test_unobserved_atlas_is_zero_and_unfilled(self):
        x=self.model(self.a)
        self.assertTrue(np.all(x.bgr[~x.observed]==0))
    def test_backside_never_known_from_front(self):
        x=self.model(self.a)
        p,known,_,disk=render_known_surface(x,np.pi,size=128)
        self.assertEqual(int(known.sum()),0)
        self.assertTrue(np.all(p[~known]==0))
    def test_known_view_returns_some_pixels(self):
        x=self.model(self.a)
        p,k,c,d=render_known_surface(x,0,size=128)
        self.assertGreater(int(k.sum()),0)
        self.assertFalse(c.any())
    def test_never_synthesize_unknown_in_preview(self):
        x=self.model(self.a)
        p,k,c,d=render_known_surface(x,1.1,size=128)
        self.assertTrue(np.all(p[~k]==0))
    def test_render_shape(self):
        x=self.model(self.a)
        p,_,_,_=render_known_surface(x,1.1,size=128)
        self.assertEqual(p.shape,(128,128,3))
    def test_novel_view_metric_is_qualified(self):
        x=self.model(self.a)
        m=metrics_on_novel_view(x,self.tex,1.2,size=128)
        self.assertTrue(m['truth_evaluation_has_unknown_excluded'])
        self.assertGreater(m['unknown_pixels'],0)
    def test_invalid_empty_views(self):
        with self.assertRaises(ValueError):accumulate_visible_surface([])
    def test_invalid_frame_dtype(self):
        with self.assertRaises(TypeError):self.model(dataclasses.replace(self.a,bgr=self.a.bgr.astype(float)))
    def test_invalid_visible_dtype(self):
        with self.assertRaises(ValueError):self.model(dataclasses.replace(self.a,visible=self.a.visible.astype(np.uint8)))
    def test_invalid_incidence(self):
        z=self.a.incidence.copy();z[0,0]=2.
        with self.assertRaises(ValueError):self.model(dataclasses.replace(self.a,incidence=z))
    def test_invalid_uv_shape(self):
        with self.assertRaises(ValueError):self.model(dataclasses.replace(self.a,u=self.a.u[:50]))
    def test_invalid_uv_nan(self):
        u=self.a.u.copy();u[0,0]=float('nan')
        with self.assertRaises(ValueError):self.model(dataclasses.replace(self.a,u=u))
    def test_invalid_atlas_bounds(self):
        with self.assertRaises(ValueError):accumulate_visible_surface([self.a],shape=(3,4))
    def test_bad_incidence_min(self):
        with self.assertRaises(ValueError):accumulate_visible_surface([self.a],min_incidence=2)
    def test_duplicate_frame_ids_even_if_different(self):
        with self.assertRaises(ValueError):self.model(self.a,dataclasses.replace(self.b,frame_id=0))
    def test_input_not_mutated(self):
        old=self.a.bgr.copy();u=self.a.u.copy()
        self.model(self.a,self.b)
        self.assertTrue(np.array_equal(old,self.a.bgr));self.assertTrue(np.array_equal(u,self.a.u))
    def test_private_media_not_necessary(self):
        x=self.model(self.a)
        self.assertTrue(x.research_only)
        self.assertFalse(x.real_identity_reconstructed)
        self.assertFalse(x.automatic_deployment)
    def test_geometry_is_not_estimated(self):
        self.assertFalse(self.model(self.a).geometry_3d_estimated)
    def test_unknown_not_synthesized(self):
        self.assertFalse(self.model(self.a).unobserved_surface_synthesized)
    def test_invalid_render_type(self):
        with self.assertRaises(TypeError):render_known_surface(None,0)
    def test_invalid_texture_shape(self):
        with self.assertRaises(TypeError):project_texture(np.zeros((12,12),np.uint8),0)
    def test_invalid_occlusion_type(self):
        with self.assertRaises(ValueError):project_texture(self.tex,0,size=128,occlusion='fake')

if __name__=='__main__':unittest.main()