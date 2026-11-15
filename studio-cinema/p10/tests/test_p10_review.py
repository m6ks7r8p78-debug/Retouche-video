import sys,copy,unittest
from pathlib import Path
root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root / 'public' if (root / 'public' / 'p10_review.py').exists() else root))
from p10_review import validate,match_annotations,AnnotationError
A={'schema':'retouche-cinema-p9-private-human-annotations-v1','source':{'local_filename':'fiction.mp4','video_id':'FICTION','duration_s':8},'annotations':[{'channel':'levres','phase':'contact','visibility':'observe','start_s':2.,'end_s':3.,'point':[.5,.5], 'smoke_origin':'unknown'}, {'channel':'fumee','phase':'expiration','visibility':'observe','start_s':4.,'end_s':5.,'point':[.52,.56], 'smoke_origin':'mouth'}]}
def cp():return copy.deepcopy(A)
class T(unittest.TestCase):
 def test_identical(self):
  r=match_annotations(cp(),cp());self.assertEqual(r['annotation_counts']['matched'],2);self.assertEqual(len(r['disagreements']),0);self.assertEqual(r['matching_event_f1'],1);self.assertFalse(r['ready_for_training'])
 def test_time_shift(self):
  b=cp();b['annotations'][0]['start_s']=2.3;self.assertIn('timing_conflict',match_annotations(cp(),b)['disagreements'][0]['issues'])
 def test_spatial_drift(self):
  b=cp();b['annotations'][0]['point']=[.9,.9];self.assertIn('spatial_point_conflict',match_annotations(cp(),b)['disagreements'][0]['issues'])
 def test_visibility(self):
  b=cp();b['annotations'][1]['visibility']='incertain';self.assertTrue(any('visibility_conflict' in x['issues'] for x in match_annotations(cp(),b)['disagreements']))
 def test_missing(self):
  b=cp();b['annotations'].pop();r=match_annotations(cp(),b);self.assertEqual(r['annotation_counts']['unmatched_a'],1)
 def test_mismatched_source_id(self):
  b=cp();b['source']['video_id']='OTHER';self.assertRaises(AnnotationError,match_annotations,cp(),b)
 def test_mismatched_filename(self):
  b=cp();b['source']['local_filename']='some.mp4';self.assertRaises(AnnotationError,match_annotations,cp(),b)
 def test_bad_label(self):
  b=cp();b['annotations'][0]['channel']='nonsense';self.assertRaises(AnnotationError,validate,b)
 def test_bad_point(self):
  b=cp();b['annotations'][0]['point']=[float('nan'),0];self.assertRaises(AnnotationError,validate,b)
 def test_duplicate_prevented(self):
  b=cp();b['annotations'].append(copy.deepcopy(b['annotations'][0]));self.assertEqual(match_annotations(cp(),b)['annotation_counts']['unmatched_b'],1)
 def test_smoke_origin(self):
  b=cp();b['annotations'][1]['smoke_origin']='tip';self.assertTrue(any('smoke_origin_conflict' in x['issues'] for x in match_annotations(cp(),b)['disagreements']))
 def test_interval_rejected(self):
  b=cp();b['annotations'][0]['end_s']=9.;self.assertRaises(AnnotationError,validate,b)
 def test_annotation_not_proof(self):
  r=match_annotations(cp(),cp());self.assertEqual(r['independent_human_adjudication'],'REQUIRED');self.assertFalse(r['consensus_proves_realism'])
if __name__=='__main__':unittest.main()

