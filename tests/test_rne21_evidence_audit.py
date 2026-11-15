"""Synthetic-only tests of RNE21 non-promotion / cross-frame evidence checks."""
import unittest
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'outils'/'rne'/'rne21') if 'tests' in Path(__file__).parts else Path(__file__).parent)
import numpy as np
from anchorage import render_fiducials
from evidence_audit import audit_evidence,anonymous_summary


def s(yaw_span=.8,drop_wrist=False,errors=False):
    seq=[]
    for i in range(5):
        yaw=-yaw_span/2+yaw_span*i/4
        missing=('right_wrist',) if drop_wrist and i<4 else ()
        corrupt=(('right_elbow',(9,-8)),) if errors and i==3 else ()
        im,_=render_fiducials(upper=.82,forearm=.77,
            phase=.55+i*.24,yaw=yaw,scale=49+i,
            drop=missing,corrupt=corrupt)
        seq.append(im)
    return seq

class EvidenceTests(unittest.TestCase):
    def test_requires_optin(self):
        with self.assertRaises(PermissionError):audit_evidence(s())
    def test_nonboolean(self):
        with self.assertRaises(PermissionError):audit_evidence(s(),manual_research_opt_in=1)
    def test_diverse_accepted(self):
        r=audit_evidence(s(yaw_span=1.1),manual_research_opt_in=True)
        self.assertEqual(r.verdict,'provisional_agreement')
    def test_repeated_view_abstain(self):
        image=s()[0]
        r=audit_evidence([image.copy() for _ in range(5)],manual_research_opt_in=True)
        self.assertEqual(r.verdict,'abstain')
        self.assertEqual(r.reason,'no_diverse_camera_evidence')
    def test_missing_wrist_abstain(self):
        r=audit_evidence(s(drop_wrist=True),manual_research_opt_in=True)
        self.assertEqual(r.verdict,'abstain')
    def test_outlier_diagnostic(self):
        r=audit_evidence(s(errors=True),manual_research_opt_in=True)
        self.assertEqual(r.images,5)
        self.assertTrue(r.shared_vs_independent_distance is None or r.shared_vs_independent_distance>=0)
    def test_no_real_validation(self):
        self.assertFalse(audit_evidence(s(),manual_research_opt_in=True).calibrated_for_real_people)
    def test_no_absolute_metres(self):
        self.assertFalse(audit_evidence(s(),manual_research_opt_in=True).metric_size_supported)
    def test_no_identity_proof(self):
        self.assertFalse(audit_evidence(s(),manual_research_opt_in=True).identity_proven)
    def test_no_contact_proof(self):
        self.assertFalse(audit_evidence(s(),manual_research_opt_in=True).contact_proven)
    def test_no_deployment(self):
        self.assertFalse(audit_evidence(s(),manual_research_opt_in=True).automatic_deployment)
    def test_anonymous_summary(self):
        d=anonymous_summary(audit_evidence(s(),manual_research_opt_in=True))
        self.assertNotIn('filename',d)
    def test_bad_summary(self):
        with self.assertRaises(TypeError):anonymous_summary({})

if __name__=='__main__':unittest.main()

