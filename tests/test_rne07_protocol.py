"""RNE07: synthetic consent, complete-source coverage and evidence-gate tests."""
import hashlib,json,sys,tempfile,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'outils'/'rne'/'rne07'))
from train_robust import validate_private_manifest,SOURCE_MODES
from robust_gate import evaluate

class ProtocolTests(unittest.TestCase):
    def setUp(self):
        self.report={m:dict(delta_psnr_robust_minus_control_db=.1,
            delta_edge_robust_minus_control=-.0001,
            delta_motion_proxy_robust_minus_control=-.0001)
            for m in ('clean_area','jpeg55','blur_noise','h264_crf34')}
    def test_no_auto_deploy_even_full_quality_pass(self):
        x=evaluate(self.report,new_videos_independent=True,real_iphone_validated=True)
        self.assertEqual(x['status'],'human_review_required')
        self.assertFalse(x['automatic_deployment'])
    def test_holdout_required(self):
        self.assertIn('no_fresh_independent_videos',evaluate(self.report)['blockers'])
    def test_iphone_required(self):
        self.assertIn('no_real_iphone_safari_measurement',evaluate(self.report)['blockers'])
    def test_clean_regression_blocked(self):
        r={k:dict(v) for k,v in self.report.items()}
        r['clean_area']['delta_psnr_robust_minus_control_db']=-.03306
        self.assertIn('quality_regression_clean_area',evaluate(r)['blockers'])
    def test_insufficient_h264_gain(self):
        r={k:dict(v) for k,v in self.report.items()}
        r['h264_crf34']['delta_psnr_robust_minus_control_db']=.02433
        self.assertIn('insufficient_gain_h264_crf34',evaluate(r)['blockers'])
    def test_missing_mode(self):
        with self.assertRaises(ValueError):
            evaluate({'clean_area':self.report['clean_area']})
    def test_nan_rejected(self):
        r={k:dict(v) for k,v in self.report.items()}
        r['jpeg55']['delta_edge_robust_minus_control']=float('nan')
        with self.assertRaises(ValueError):evaluate(r)
    def test_bool_metric_rejected(self):
        r={k:dict(v) for k,v in self.report.items()}
        r['jpeg55']['delta_psnr_robust_minus_control_db']=True
        with self.assertRaises(ValueError):evaluate(r)
    def test_holdout_stays_excluded_from_training(self):
        self.assertFalse(evaluate(self.report)['retraining_on_holdout_permitted'])
    def test_matched_protocol(self):
        self.assertEqual(len(SOURCE_MODES['control']),len(SOURCE_MODES['robust_candidate']))
        self.assertEqual(SOURCE_MODES['control'][:3],SOURCE_MODES['robust_candidate'][:3])
    def fake_catalogue(self,folder):
        rows=[];cache=Path(folder)/'cache';cache.mkdir()
        for i in range(157):
            unique=min(i,153)
            source=Path(folder)/f'dummy{unique}.bin'
            if not source.exists():source.write_bytes(f'fake data {unique}'.encode())
            ident=f'V{i+1:03d}'
            rows.append({'id':ident,'path':str(source),
               'sha256':hashlib.sha256(source.read_bytes()).hexdigest(),
               'group':'synthetic','private_training_consent':True,'publication':False})
            if i<=153:
                for moment in (0,1):(cache/f'{ident}_{moment:02d}.npz').touch()
        manifest=Path(folder)/'consent.json';manifest.write_text(json.dumps(rows))
        return manifest,cache
    def test_synthetic_157_and_154(self):
        with tempfile.TemporaryDirectory() as d:
            m,c=self.fake_catalogue(d)
            self.assertEqual(len(validate_private_manifest(m,c)),154)
    def test_reject_missing_consent(self):
        with tempfile.TemporaryDirectory() as d:
            m,c=self.fake_catalogue(d);r=json.loads(m.read_text())
            r[0]['private_training_consent']=False;m.write_text(json.dumps(r))
            with self.assertRaises(PermissionError):validate_private_manifest(m,c)
    def test_reject_publication(self):
        with tempfile.TemporaryDirectory() as d:
            m,c=self.fake_catalogue(d);r=json.loads(m.read_text())
            r[0]['publication']=True;m.write_text(json.dumps(r))
            with self.assertRaises(PermissionError):validate_private_manifest(m,c)
    def test_reject_bad_sha(self):
        with tempfile.TemporaryDirectory() as d:
            m,c=self.fake_catalogue(d);r=json.loads(m.read_text())
            r[0]['sha256']='0'*64;m.write_text(json.dumps(r))
            with self.assertRaises(ValueError):validate_private_manifest(m,c)
    def test_reject_absent_cache(self):
        with tempfile.TemporaryDirectory() as d:
            m,c=self.fake_catalogue(d)
            (c/'V001_01.npz').unlink()
            with self.assertRaises(ValueError):validate_private_manifest(m,c)

if __name__=='__main__':unittest.main()
