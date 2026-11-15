"""Synthetic tests of the expanded RNE sampler: no private video is accessed."""
import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path
import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'outils' / 'rne'))
from expanded_sampler import check_manifest, sample, outside_checkout


class RneExpandedSamplerTests(unittest.TestCase):
    def make_sources(self):
        context=tempfile.TemporaryDirectory()
        directory=Path(context.name)
        videos=[]
        for i in range(2):
            name=directory/f'synthetic_{i}.mp4'
            writer=cv2.VideoWriter(str(name),cv2.VideoWriter_fourcc(*'mp4v'),8,(96,96))
            if not writer.isOpened():
                context.cleanup()
                self.skipTest('OpenCV MP4 writer unavailable')
            for t in range(48):
                frame=np.zeros((96,96,3),dtype=np.uint8)
                cv2.rectangle(frame,(5+t//3,10+i*6),(25+t//3,35+i*6),(100+i*40,180,240),-1)
                cv2.putText(frame,str(t),(40,70),cv2.FONT_HERSHEY_SIMPLEX,.8,(255,80,10),2)
                writer.write(frame)
            writer.release()
            videos.append(name)
        copy=directory/'synthetic_clone.mp4'
        copy.write_bytes(videos[0].read_bytes())
        entries=[]
        for i,path in enumerate([*videos,copy]):
            entries.append({'id':f'V{i+1:03d}', 'path':str(path),
                            'group':'G1' if i!=1 else 'G2',
                            'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),
                            'private_training_consent':True,
                            'private_evaluation_consent':True,'publication':False})
        return context,directory,entries

    def test_exact_copy_deduplication(self):
        context,_,entries=self.make_sources()
        with context:
            unique,groups=check_manifest(entries,3)
            self.assertEqual((len(unique),len(groups)),(2,2))

    def test_sampler_uses_real_synthetic_mp4_and_refuses_repeats(self):
        context,directory,entries=self.make_sources()
        with context:
            res=sample(entries,directory/'private_cache',expected_count=3,count=4)
            self.assertEqual(res['exact_copies_not_oversampled'],1)
            self.assertEqual(res['files_without_triplet'],0)
            self.assertGreater(res['triplets_saved'],0)
            self.assertLessEqual(res['triplets_saved'],8)
            private=json.loads((directory/'private_cache'/'sampling_private.json').read_text())
            self.assertEqual(len(private['samples']),res['triplets_saved'])
            published=(directory/'private_cache'/'sampling_aggregate.json').read_text()
            self.assertNotIn('synthetic_0',published)
            self.assertNotIn('sha256',published)

    def test_missing_training_consent_rejected(self):
        context,_,entries=self.make_sources()
        with context:
            entries[2]['private_training_consent']=False
            with self.assertRaises(PermissionError):check_manifest(entries,3,verify_sha=False)

    def test_cross_group_duplicate_rejected(self):
        context,_,entries=self.make_sources()
        with context:
            entries[2]['group']='G3'
            with self.assertRaises(ValueError):check_manifest(entries,3,verify_sha=False)

    def test_modified_source_fails_sha(self):
        context,_,entries=self.make_sources()
        with context:
            Path(entries[0]['path']).write_bytes(b'changed')
            with self.assertRaises(ValueError):check_manifest(entries,3)

    def test_git_checkout_forbidden_as_cache_destination(self):
        context,directory,_=self.make_sources()
        with context:
            (directory/'.git').mkdir()
            with self.assertRaises(ValueError):outside_checkout(directory/'private_cache')

    def test_invalid_frame_window_count(self):
        context,directory,entries=self.make_sources()
        with context:
            with self.assertRaises(ValueError):sample(entries,directory/'private_cache',count=0,expected_count=3)


if __name__=='__main__':
    unittest.main()
