"""Adversarial P30 ZIP builder tests. All files are procedurally synthesized."""
from __future__ import annotations
import copy
import hashlib
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile
import unittest
from zipfile import ZipFile, ZipInfo

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"src"))
from p30_package import (
 SCHEMA,P29_SCHEMA,P29_FILES,P30_FILES,GUIDE,bundle,valid_p29,sha
)

ROOT=Path(__file__).resolve().parents[3]
P29_GENERATED=Path(os.environ.get("P30_P29_SOURCE","studio-cinema/p29/results/preview"))


class TestCinemaP30Zip(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not P29_GENERATED.is_dir():
            raise AssertionError("P29 must be regenerated from actual P28 evidence before P30 tests")
        cls.reference=valid_p29(P29_GENERATED)

    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix="cinema-p30-test-")
        self.root=Path(self.temp.name)
        self.source=self.root/"p29"
        shutil.copytree(P29_GENERATED,self.source)

    def tearDown(self):
        self.temp.cleanup()

    def make(self):
        return bundle(self.source,self.root/"results")

    def test_real_verified_p29_source(self):
        self.assertEqual(valid_p29(self.source),self.reference)
        self.assertEqual(self.reference["benchmark_cases"],9)

    def test_valid_archive_roundtrip(self):
        proof=self.make()
        self.assertEqual(proof["schema"],SCHEMA)
        self.assertEqual(proof["status"],"synthetic_manual_package_built")
        self.assertFalse(proof["physical_iphone_safari_verified"])
        self.assertFalse(proof["user_media_included"])
        z=self.root/"results"/"Cinema_P30_iPhone_demo.zip"
        self.assertGreater(z.stat().st_size,3500)
        with ZipFile(z) as arch:
            self.assertIsNone(arch.testzip())
            self.assertEqual(len(arch.namelist()),10)
            self.assertIn("index.html",arch.namelist())
            self.assertIn("test-iphone.html",arch.namelist())
            self.assertIn("GUIDE_IPHONE.txt",arch.namelist())
            self.assertIn("MANIFEST_SHA256.txt",arch.namelist())
            self.assertFalse(any("/" in name or ".." in name for name in arch.namelist()))

    def test_bundle_reproducible_byte_for_byte(self):
        first=self.make()
        z=(self.root/"results"/"Cinema_P30_iPhone_demo.zip").read_bytes()
        second=bundle(self.source,self.root/"second")
        z2=(self.root/"second"/"Cinema_P30_iPhone_demo.zip").read_bytes()
        self.assertEqual(z,z2)
        self.assertEqual(first["zip_sha256"],second["zip_sha256"])

    def test_sha256_manifest_all_package_assets(self):
        self.make()
        folder=self.root/"results"/"Cinema_P30_iPhone_demo"
        lines=(folder/"MANIFEST_SHA256.txt").read_text().splitlines()[1:]
        self.assertEqual(len(lines),9)
        for line in lines:
            expected,name=line.split("  ",1)
            self.assertEqual(expected,sha((folder/name).read_bytes()),name)

    def test_zip_report_records_exact_digest(self):
        proof=self.make()
        p=self.root/"results"/"p30_package_proof.json"
        self.assertEqual(json.loads(p.read_text())["zip_sha256"],proof["zip_sha256"])
        self.assertEqual(sha((self.root/"results"/"Cinema_P30_iPhone_demo.zip").read_bytes()),proof["zip_sha256"])

    def test_manual_link_only_to_local_page(self):
        self.make()
        root=self.root/"results"/"Cinema_P30_iPhone_demo"
        html=(root/"index.html").read_text()
        self.assertIn('href="./test-iphone.html"',html)
        self.assertIn('href="./iphone-check.css"',html)
        self.assertEqual(html.count('href="./test-iphone.html"'),1)

    def test_package_has_no_media_assets(self):
        self.make()
        root=self.root/"results"/"Cinema_P30_iPhone_demo"
        for path in root.iterdir():
            self.assertIn(path.suffix,(".txt",".js",".html",".css"))
            self.assertLess(path.stat().st_size,100001)
        self.assertFalse((root/"user_video.mp4").exists())

    def test_guide_explicit_manual_https_and_no_auto_share(self):
        self.make()
        guide=(self.root/"results"/"Cinema_P30_iPhone_demo"/"GUIDE_IPHONE.txt").read_text()
        self.assertIn("HTTPS",guide)
        self.assertIn("MANUELLEMENT",guide)
        self.assertIn("Aucun rapport n'est envoyé automatiquement",guide)
        self.assertIn("Safari",guide)

    def test_zip_does_not_contain_identifying_browser_data(self):
        self.make()
        data=(self.root/"results"/"Cinema_P30_iPhone_demo"/"iphone-check.js").read_text()
        self.assertNotIn("navigator.userAgent",data)
        self.assertNotIn("geolocation.getCurrentPosition",data)
        self.assertNotIn("localStorage",data)
        self.assertNotIn("fetch(",data)
        self.assertNotIn("indexedDB",data)

    def test_input_p29_report_does_not_leak_into_zip(self):
        self.make()
        with ZipFile(self.root/"results"/"Cinema_P30_iPhone_demo.zip") as z:
            self.assertNotIn("p29_synthetic_preview_report.json",z.namelist())
            self.assertNotIn("p30_package_proof.json",z.namelist())

    def change_report(self,change):
        p=self.source/"p29_synthetic_preview_report.json"
        original=json.loads(p.read_text())
        change(original)
        p.write_text(json.dumps(original,ensure_ascii=False),encoding="utf-8")
        with self.assertRaises(ValueError):
            valid_p29(self.source)

    def test_reject_real_media_schema(self):
        self.change_report(lambda r:r.update({"schema":"real-media"}))

    def test_reject_unverified_preview(self):
        self.change_report(lambda r:r.update({"preview_only":False}))

    def test_reject_non_synthetic_provenance(self):
        self.change_report(lambda r:r["proof"].update({"source_label":"Private images"}))

    def test_reject_real_video_analysis_claim(self):
        self.change_report(lambda r:r["proof"].update({"user_video_analyzed":True}))

    def test_reject_export_permission_claim(self):
        self.change_report(lambda r:r["proof"].update({"may_modify_or_export_video":True}))

    def test_reject_phone_test_fabrication(self):
        self.change_report(lambda r:r["proof"].update({"physical_iphone_safari_tested":True}))

    def test_reject_broken_recompression_counts(self):
        self.change_report(lambda r:r["proof"].update({"cases_file_larger_no_gain":4}))

    def test_reject_embedded_identifying_property(self):
        self.change_report(lambda r:r["proof"].update({"private_filename":"secret.mov"}))

    def test_reject_unsigned_extra_preview_data(self):
        with (self.source/"preview-data.js").open("a") as f:f.write("\nalert('injected');\n")
        with self.assertRaisesRegex(ValueError,"differs"):
            valid_p29(self.source)

    def test_reject_changed_file_list(self):
        self.change_report(lambda r:r.update({"files":["index.html"]}))

    def test_reject_missing_preview_asset(self):
        (self.source/"preview.js").unlink()
        with self.assertRaisesRegex(ValueError,"Missing"):
            valid_p29(self.source)

    def test_reject_source_replacing_asset_with_symlink(self):
        (self.source/"preview.js").unlink()
        (self.source/"preview.js").symlink_to(Path(__file__))
        with self.assertRaisesRegex(ValueError,"Missing"):
            valid_p29(self.source)

    def test_reject_source_page_without_strict_csp(self):
        file=self.source/"index.html"
        file.write_text(file.read_text().replace("connect-src 'none'","connect-src *"))
        with self.assertRaisesRegex(ValueError,"privacy boundary"):
            valid_p29(self.source)

    def test_reject_source_page_without_user_disclaimer(self):
        file=self.source/"index.html"
        file.write_text(file.read_text().replace(
            "Aucune de vos vidéos n'a été analysée.","Votre vidéo analysée."))
        with self.assertRaisesRegex(ValueError,"privacy boundary"):
            valid_p29(self.source)

    def test_static_iphone_page_no_automatic_network(self):
        file=ROOT/"p30"/"preview"/"test-iphone.html"
        html=file.read_text()
        self.assertIn("connect-src 'none'",html)
        self.assertIn("media-src 'none'",html)
        self.assertNotIn('<input type="file"',html)
        self.assertNotIn("<video",html)
        self.assertIn('id="report-json"',html)
        self.assertIn('id="confirm-safari"',html)

    def test_manual_report_marks_unverified_physical_test(self):
        src=(ROOT/"p30"/"preview"/"iphone-check.js").read_text()
        self.assertIn("physical_iphone_safari_verified_by_laboratory:false",src)
        self.assertIn("report_shared_automatically:false",src)
        self.assertIn("user_agent_collected:false",src)
        self.assertIn("local-file",src)

    def test_manual_report_has_copy_fallback(self):
        src=(ROOT/"p30"/"preview"/"iphone-check.js").read_text()
        self.assertIn("navigator.clipboard.writeText",src)
        self.assertIn("field.select()",src)
        self.assertIn("createObjectURL",src)
        self.assertIn("a.download=",src)


if __name__=="__main__":
    unittest.main(verbosity=2)
