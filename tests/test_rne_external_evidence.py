"""RNE external evidence policy: tests use synthetic aggregate numbers only."""
import sys
from pathlib import Path
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'outils'/'rne'))
from external_evidence import interpret_external_photos

def sample():
    return {
      'sources':6,'reconstructions':108,'model_wins':97,'model_losses':11,
      'model_regressions_below_minus_half_db':0,'mean_psnr_gain_db':.29936,
      'worst_psnr_gain_db':-.06953,'roi_face_frame_proposals':14,
      'mean_bicubic_temporal_mae_255':12.643,
      'mean_rne_temporal_mae_255':13.07629
    }

class RNEExternalEvidenceTests(unittest.TestCase):
    def test_lab_only(self):
        r=interpret_external_photos(sample())
        self.assertEqual(r['status'],'research_only')
        self.assertFalse(r['automatic_deployment_allowed'])
        self.assertFalse(r['automatic_export_allowed'])
    def test_never_claim_video_proof(self):
        self.assertFalse(interpret_external_photos(sample())['independent_real_video_proof'])
    def test_never_claim_face_identity(self):
        self.assertFalse(interpret_external_photos(sample())['verified_face_identity_or_geometry'])
    def test_never_claim_iphone_compatibility(self):
        self.assertFalse(interpret_external_photos(sample())['iphone_safari_validated'])
    def test_no_nvidia_model(self):
        self.assertFalse(interpret_external_photos(sample())['nvidia_dlss5_integrated'])
    def test_higher_temporal_error_flagged(self):
        self.assertIn('temporal_error_higher_than_bicubic',
                      interpret_external_photos(sample())['limitations'])
    def test_spatial_regressions_flagged(self):
        self.assertIn('some_spatial_regressions',
                      interpret_external_photos(sample())['limitations'])
    def test_nonpositive_spatial_gain_flagged(self):
        x=sample();x['mean_psnr_gain_db']=0
        self.assertIn('mean_psnr_not_improved',
                      interpret_external_photos(x)['limitations'])
    def test_even_ideal_numbers_cannot_deploy(self):
        x=sample();x['model_losses']=0;x['model_wins']=108
        x['mean_rne_temporal_mae_255']=1.;x['mean_psnr_gain_db']=10.
        self.assertFalse(interpret_external_photos(x)['weights_promotion_allowed'])
    def test_rejects_extra_personal_fields(self):
        x=sample();x['private_video_path']='IMG_2026.MOV'
        with self.assertRaises(ValueError):interpret_external_photos(x)
    def test_rejects_missing_fields(self):
        x=sample();del x['sources']
        with self.assertRaises(ValueError):interpret_external_photos(x)
    def test_rejects_nan(self):
        x=sample();x['mean_psnr_gain_db']=float('nan')
        with self.assertRaises(ValueError):interpret_external_photos(x)
    def test_rejects_wrong_count_types(self):
        x=sample();x['model_losses']=True
        with self.assertRaises(ValueError):interpret_external_photos(x)
    def test_rejects_counter_overflow(self):
        x=sample();x['model_losses']=1000
        with self.assertRaises(ValueError):interpret_external_photos(x)
    def test_rejects_negative_temporal(self):
        x=sample();x['mean_rne_temporal_mae_255']=-3.
        with self.assertRaises(ValueError):interpret_external_photos(x)
    def test_rejects_fake_face_roi_count(self):
        x=sample();x['roi_face_frame_proposals']=120
        with self.assertRaises(ValueError):interpret_external_photos(x)

if __name__=='__main__':unittest.main()
