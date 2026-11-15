"""Synthetic privacy and protocol tests for post-evaluation RNE all-corpus fine-tuning."""
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'outils' / 'rne'))
from finetune_all_corpus import audit_all_corpus


def sample(count=4):
    return [{
        'id': f'clip_{i}',
        'group': f'group_{i//2}',
        'split': ['train','validation','test','train'][i%4],
        'private_training_consent': True,
        'private_evaluation_consent': True,
        'publication': False
    } for i in range(count)]


class AllCorpusProtocolTests(unittest.TestCase):
    def test_full_set_accepted(self):
        self.assertEqual(audit_all_corpus(sample(), 4), {'videos':4,'groups':2})
    def test_missing_video_rejected(self):
        with self.assertRaises(ValueError):
            audit_all_corpus(sample(3),4)
    def test_duplicate_id_rejected(self):
        entries=sample()
        entries[-1]['id']=entries[0]['id']
        with self.assertRaises(ValueError):
            audit_all_corpus(entries,4)
    def test_old_test_video_needs_new_training_consent(self):
        entries=sample()
        entries[2]['private_training_consent']=False
        with self.assertRaises(PermissionError):
            audit_all_corpus(entries,4)
    def test_evaluation_consent_required(self):
        entries=sample()
        entries[1]['private_evaluation_consent']=False
        with self.assertRaises(PermissionError):
            audit_all_corpus(entries,4)
    def test_publication_refused(self):
        entries=sample()
        entries[0]['publication']=True
        with self.assertRaises(PermissionError):
            audit_all_corpus(entries,4)
    def test_absent_justification_rejected(self):
        with self.assertRaises(ValueError):
            audit_all_corpus([{}, {}, {}, {}], 4)


if __name__ == '__main__':
    unittest.main()
