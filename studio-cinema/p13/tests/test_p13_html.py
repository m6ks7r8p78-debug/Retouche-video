from pathlib import Path
from subprocess import run
from html.parser import HTMLParser
ROOT=Path(__file__).resolve().parents[1]
HTML=ROOT/'RetoucheCinema_P13_Atelier_iPhone.html'
class IdParser(HTMLParser):
 def __init__(self):super().__init__();self.ids=[]
 def handle_starttag(self,tag,attrs):
  for k,v in attrs:
   if k=='id':self.ids.append(v)

def test_no_external_assets():
 s=HTML.read_text()
 assert "connect-src 'none'" in s
 assert 'src="http' not in s and 'href="http' not in s
 assert 'fetch(' not in s and 'XMLHttpRequest' not in s

def test_unique_ids():
 p=IdParser();p.feed(HTML.read_text());assert len(p.ids)==len(set(p.ids))

def test_node_js_syntax():
 s=HTML.read_text();js=s.split('<script>')[1].split('</script>')[0]
 r=run(['node','--check'],input=js,text=True,capture_output=True)
 assert r.returncode==0,r.stderr

def test_private_media_identity_guard():
 s=HTML.read_text();assert 'f.name!==row.private_filename' in s
 assert 'URL.createObjectURL' in s and 'URL.revokeObjectURL' in s

