"""Synthetic-only privacy and partition tests for RNE 0.3 corpus preparation."""
import copy,hashlib,json,sys,tempfile,unittest
from pathlib import Path
import cv2,numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'outils'/'rne'))
from prepare_triad import verify_manifest,prepare,require_outside_git
class TestCorpusProtocol(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);root=Path(self.tmp.name)
  self.items=[]
  for i,s in enumerate(('train','validation','test')):
   p=root/f'{i}.mp4';vw=cv2.VideoWriter(str(p),cv2.VideoWriter_fourcc(*'mp4v'),10,(128,96));self.assertTrue(vw.isOpened())
   for j in range(9):
    fr=np.full((96,128,3),40+10*i+j,np.uint8)
    fr[30:50,10+j:30+j,:]=90+10*i
    vw.write(fr)
   vw.release();h=hashlib.sha256(p.read_bytes()).hexdigest()
   self.items.append({'id':f'case{i}','path':str(p),'group':f'g{i}','split':s,'sha256':h,
                      'private_training_consent':True,'private_evaluation_consent':True,'publication':False})
 def test_accepted_three_parts(self):
  self.assertEqual(verify_manifest(self.items,expected_count=3),{'train':1,'validation':1,'test':1})
 def test_missing_private_training_consent(self):
  a=copy.deepcopy(self.items);a[0]['private_training_consent']=False
  with self.assertRaises(PermissionError):verify_manifest(a)
 def test_missing_private_evaluation_consent(self):
  a=copy.deepcopy(self.items);a[2]['private_evaluation_consent']=False
  with self.assertRaises(PermissionError):verify_manifest(a)
 def test_forbid_publication(self):
  a=copy.deepcopy(self.items);a[0]['publication']=True
  with self.assertRaises(ValueError):verify_manifest(a)
 def test_group_leak(self):
  a=copy.deepcopy(self.items);a[1]['group']=a[0]['group']
  with self.assertRaises(ValueError):verify_manifest(a)
 def test_sha_leak(self):
  a=copy.deepcopy(self.items);a[1]['sha256']=a[0]['sha256']
  with self.assertRaises(ValueError):verify_manifest(a)
 def test_hash_mismatch(self):
  a=copy.deepcopy(self.items);a[0]['sha256']='0'*64
  with self.assertRaises(ValueError):verify_manifest(a)
 def test_missing_media(self):
  a=copy.deepcopy(self.items);a[0]['path']=str(Path(self.tmp.name)/'missing.mp4')
  with self.assertRaises(ValueError):verify_manifest(a)
 def test_duplicate_id(self):
  a=copy.deepcopy(self.items);a[1]['id']=a[0]['id']
  with self.assertRaises(ValueError):verify_manifest(a)
 def test_git_checkout_rejected(self):
  d=Path(self.tmp.name)/'repository';d.mkdir();(d/'.git').mkdir()
  with self.assertRaises(ValueError):require_outside_git(d/'frames')
 def test_extracts_real_three_frame_sequential_samples(self):
  manifest=Path(self.tmp.name)/'consents.json';manifest.write_text(json.dumps(self.items))
  cache=Path(self.tmp.name)/'private-cache';result=prepare(manifest,cache,expected_count=3)
  self.assertEqual(result['undecodable_media'],0)
  self.assertEqual(result['triples'],{'train':2,'validation':1,'test':1})
  with np.load(cache/'case0_0.npz') as z:
   self.assertEqual(set(z.files),{'prev1','prev2','current'})
   self.assertEqual(z['prev2'].shape,z['prev1'].shape)
   self.assertFalse(np.array_equal(z['prev2'],z['current']))
if __name__=='__main__':unittest.main()