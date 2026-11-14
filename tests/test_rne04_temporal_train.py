"""Synthetic-only regression tests for RNE 0.4 temporal training; no personal media."""
from __future__ import annotations
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest
import numpy as np
import torch
sys.path.insert(0,str(Path(__file__).resolve().parent))
from triad import RNE03
from train_temporal_residual import ensure_private,verify_corpus,example,scores,train

class RNE04TemporalTrainTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):torch.set_num_threads(1)

    def _fixture(self,root:Path, corrupt=False):
        data=root/'videos';cache=root/'cache';data.mkdir();cache.mkdir()
        manifest=[]
        for n in range(3):
            f=data/f'clip{n}.mp4';f.write_bytes(bytes((n+1,))*75)
            h=hashlib.sha256(f.read_bytes()).hexdigest()
            vid=f'V{n+1:03}'
            rng=np.random.default_rng(n+123)
            base=rng.integers(20,230,(80,80,3),dtype=np.uint8)
            previous=np.roll(base,1,axis=1);older=np.roll(base,2,axis=1)
            np.savez_compressed(cache/f'{vid}_00.npz',current=base,prev1=previous,prev2=older)
            manifest.append({'id':vid,'path':str(f),'sha256':h,'group':f'group{n}',
                'split':'train' if n==0 else 'validation' if n==1 else 'test',
                'private_training_consent':True,'private_evaluation_consent':True,
                'publication':False})
        path=root/'manifest.json';path.write_text(json.dumps(manifest),encoding='utf8')
        weights=root/'initial.pt';torch.save(RNE03().state_dict(),weights)
        return path,cache,weights,manifest

    def test_safe_output_refuses_git(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td);(root/'.git').mkdir()
            with self.assertRaises(ValueError):ensure_private(root/'private')

    def test_private_output_accepted(self):
        with tempfile.TemporaryDirectory() as td:
            self.assertEqual(ensure_private(Path(td)/'ok'),Path(td)/'ok')

    def test_corpus_three_verified(self):
        with tempfile.TemporaryDirectory() as td:
            m,c,_,_=self._fixture(Path(td))
            paths,groups,meta=verify_corpus(m,c,expected=3)
            self.assertEqual(len(paths),3);self.assertEqual(meta['groups'],3)
            self.assertEqual(meta['unique_sha256'],3)

    def test_missing_training_permission_denied(self):
        with tempfile.TemporaryDirectory() as td:
            m,c,_,rows=self._fixture(Path(td));rows[1]['private_training_consent']=False
            m.write_text(json.dumps(rows));
            with self.assertRaises(PermissionError):verify_corpus(m,c,expected=3)

    def test_publication_permission_denied(self):
        with tempfile.TemporaryDirectory() as td:
            m,c,_,rows=self._fixture(Path(td));rows[1]['publication']=True;m.write_text(json.dumps(rows));
            with self.assertRaises(PermissionError):verify_corpus(m,c,expected=3)

    def test_invalid_sha_denied(self):
        with tempfile.TemporaryDirectory() as td:
            m,c,_,rows=self._fixture(Path(td));rows[1]['sha256']='f'*64;m.write_text(json.dumps(rows));
            with self.assertRaises(ValueError):verify_corpus(m,c,expected=3)

    def test_repeated_id_denied(self):
        with tempfile.TemporaryDirectory() as td:
            m,c,_,rows=self._fixture(Path(td));rows[1]['id']=rows[0]['id'];m.write_text(json.dumps(rows));
            with self.assertRaises(ValueError):verify_corpus(m,c,expected=3)

    def test_missing_sequence_denied(self):
        with tempfile.TemporaryDirectory() as td:
            m,c,_,_=self._fixture(Path(td));next(c.glob('V003*')).unlink()
            with self.assertRaises(ValueError):verify_corpus(m,c,expected=3)

    def test_triplet_cropping_and_flow_confidence(self):
        with tempfile.TemporaryDirectory() as td:
            _,c,_,_=self._fixture(Path(td));p=next(c.glob('V001*'))
            r=example(p,1234,RNE03());self.assertEqual(tuple(r['cur'].shape),(3,32,32))
            self.assertEqual(tuple(r['high'].shape),(3,64,64))
            self.assertEqual(tuple(r['prior'].shape),(3,64,64))
            self.assertEqual(tuple(r['trust'].shape),(1,64,64))
            self.assertTrue(torch.isfinite(r['trust']).all())
            self.assertTrue(torch.logical_and(r['trust']>=0,r['trust']<=1).all())

    def test_scores_finite(self):
        with tempfile.TemporaryDirectory() as td:
            _,c,_,_=self._fixture(Path(td));p=next(c.glob('V001*'))
            s=scores(RNE03(),[example(p,1234,RNE03())]);self.assertEqual(s.shape,(1,3))
            self.assertTrue(np.isfinite(s).all())

    def test_paired_train_and_no_deployment(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td);m,c,w,_=self._fixture(root)
            r=train(manifest=m,cache=c,checkpoint=w,output=root/'out',steps=20,batch=2,expected=3)
            self.assertEqual(r['triplets_exposed_to_optimizer'],3)
            self.assertTrue(r['no_unseen_scene_in_corpus'])
            self.assertFalse(r['deployment_authorized'])
            self.assertEqual(r['steps_per_candidate'],20)
            self.assertTrue((root/'out/rne04_temporal_candidate_private.pt').is_file())
            self.assertTrue((root/'out/rne04_supervised_control_private.pt').is_file())

    def test_invalid_lambda_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td)
            with self.assertRaises(ValueError):train(manifest=root/'m',cache=root/'c',checkpoint=root/'x',output=root/'o',lambda_temporal=1.)

if __name__=='__main__':unittest.main()