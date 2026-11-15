"""Static isolation and accessibility checks for the opt-in P24 playback page."""
from html.parser import HTMLParser
import sys
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"src"))
from p24_browser_smoke import MOVIE,HTML


class Nodes(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags=[]
    def handle_starttag(self,tag,attrs):
        self.tags.append((tag,dict(attrs)))


class P24BrowserFixtureTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source=HTML.read_text(encoding="utf-8")
        cls.tree=Nodes()
        cls.tree.feed(cls.source)

    def tags(self,name):
        return [attrs for tag,attrs in self.tree.tags if tag==name]

    def test_video_source_matches_exact_generated_fixture(self):
        self.assertEqual(len(self.tags("video")),1)
        self.assertEqual(len(self.tags("source")),1)
        self.assertEqual(self.tags("source")[0]["src"],"./"+MOVIE)

    def test_playback_requires_explicit_button(self):
        video=self.tags("video")[0]
        self.assertNotIn("autoplay",video)
        self.assertIn("playsinline",video)
        self.assertEqual(len(self.tags("button")),1)
        self.assertEqual(self.tags("button")[0]["id"],"play")

    def test_controls_accessible_without_external_stylesheet(self):
        self.assertTrue(self.tags("video")[0].get("aria-label"))
        self.assertEqual(self.tags("button")[0]["type"],"button")
        self.assertEqual(len(self.tags("style")),1)

    def test_status_is_announced_for_screen_readers(self):
        attrs=[a for a in self.tags("p") if a.get("id")=="state"]
        self.assertEqual(len(attrs),1)
        self.assertEqual(attrs[0]["role"],"status")
        self.assertEqual(attrs[0]["aria-live"],"polite")

    def test_no_remote_scripts_external_tracking_or_pwa(self):
        self.assertNotIn("https://",self.source)
        self.assertNotIn("http://",self.source)
        self.assertNotIn("serviceWorker",self.source)
        self.assertNotIn("localStorage",self.source)
        self.assertNotIn("fetch(",self.source)
        self.assertNotIn("XMLHttpRequest",self.source)

    def test_explicit_synthetic_warning_and_safe_refusal(self):
        self.assertIn("entièrement fictive",self.source)
        self.assertIn("Lecture indisponible ou refusée",self.source)
        self.assertIn("Aucune vidéo personnelle",self.source)


if __name__=="__main__":
    unittest.main(verbosity=2)
