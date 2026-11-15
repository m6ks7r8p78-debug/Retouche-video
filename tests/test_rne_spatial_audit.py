"""RNE spatial audit protocol tests, entirely synthetic."""
from pathlib import Path
import hashlib
import json
import sys
import tempfile
import unittest

import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'outils'/'rne'))
from audit_spatial_fidelity import aggregate,metrics,source_masks,verify_and_select,degradation

class SpatialAuditTests(unittest.TestCase):
    def setUp(self):
        self.x=np.random.default_rng(19).integers(0,255,(64,80,3),dtype=np.uint8)
    def test_valid_region_masks(self):
        edge,texture,faces=source_masks(self.x)
        self.assertEqual(edge.shape,(64,80));self.assertEqual(texture.shape,(64,80))
        self.assertEqual(faces.dtype,np.uint8)
    def test_mse_zero_has_finite_psnr(self):
        e=np.ones((64,80),bool);f=np.zeros((64,80),np.uint8)
        v=metrics(self.x,self.x,e,e,f)
        self.assertGreater(v['psnr_db'],90.);self.assertIsNone(v['face_proposal_mae_255'])
    def test_masked_mae_region(self):
        e=np.zeros((64,80),bool);e[5:10,5:10]=True
        bad=self.x.copy();bad[e]=255
        m=metrics(self.x,bad,e,e,np.zeros((64,80),np.uint8))
        self.assertGreaterEqual(m['edge_mae_255'],m['mae_255'])
    def test_jpeg_degradation_keeps_shape(self):
        result=degradation([self.x]*3,jpeg_quality=60)
        self.assertEqual(len(result),3);self.assertEqual(result[0].shape,(32,40,3))
    def test_aggregate_counts(self):
        m={'psnr_db':35.,'mae_255':3.,'edge_mae_255':4.,'texture_mae_255':5.,'face_proposal_mae_255':None}
        row={k:dict(m) for k in ('bicubic','rne04_control','rne04_temporal','rne04_guarded')}
        result=aggregate([row])
        self.assertEqual(result['comparisons']['samples'],1)
        self.assertEqual(result['bicubic']['face_proposal_mae_255_n'],0)
    def _write_corpus(self,folder,groups=('a','b','c'),pub=False,authorized=True):
        rows=[]
        for i,g in enumerate(groups):
            p=Path(folder)/f'f{i}.mp4';p.write_bytes(str(i).encode())
            rows.append({'id':f'V{i:03d}','path':str(p),'sha256':hashlib.sha256(str(i).encode()).hexdigest(),
                         'group':g,'private_evaluation_consent':authorized,'publication':pub})
        m=Path(folder)/'manifest.json';m.write_text(json.dumps(rows));return m
    def test_corpus_validates_distinct_groups(self):
        with tempfile.TemporaryDirectory() as d:
            self.assertEqual(len(verify_and_select(self._write_corpus(d),expected=3,unique=3,groups=3)),3)
    def test_corpus_missing_consent_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            m=self._write_corpus(d,authorized=False)
            with self.assertRaises(PermissionError):verify_and_select(m,expected=3,unique=3,groups=3)
    def test_corpus_no_publication(self):
        with tempfile.TemporaryDirectory() as d:
            m=self._write_corpus(d,pub=True)
            with self.assertRaises(PermissionError):verify_and_select(m,expected=3,unique=3,groups=3)
    def test_corpus_modified_file_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            m=self._write_corpus(d);(Path(d)/'f0.mp4').write_bytes(b'altered')
            with self.assertRaises(ValueError):verify_and_select(m,expected=3,unique=3,groups=3)
    def test_duplicate_group_count_fails(self):
        with tempfile.TemporaryDirectory() as d:
            m=self._write_corpus(d,groups=('a','a','b'))
            with self.assertRaises(ValueError):verify_and_select(m,expected=3,unique=3,groups=3)
    def test_duplicate_identifier_fails(self):
        with tempfile.TemporaryDirectory() as d:
            m=self._write_corpus(d);a=json.loads(m.read_text());a[1]['id']=a[0]['id'];m.write_text(json.dumps(a))
            with self.assertRaises(ValueError):verify_and_select(m,expected=3,unique=3,groups=3)
    def test_duplicate_source_hash_collapses(self):
        with tempfile.TemporaryDirectory() as d:
            m=self._write_corpus(d);a=json.loads(m.read_text())
            a[2]['sha256']=a[1]['sha256'];a[2]['path']=a[1]['path'];m.write_text(json.dumps(a))
            self.assertEqual(len(verify_and_select(m,expected=3,unique=2,groups=2)),2)
if __name__=='__main__':unittest.main()
