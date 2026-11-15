"""Minimal invariants for the complete experimental RetoucheProAI app.
No fake DOM, no synthetic swap of app.js and no user media.
"""
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
page=(ROOT/'index.html').read_text(encoding='utf8')
paths=['app.js','research/3d-smallmotion/smallmotion-local.js',
       'research/3d-smallmotion/smallmotion-resource-guard.js',
       'research/3d-smallmotion/smallmotion-worker-runner.js',
       'research/3d-smallmotion/smallmotion-director-local.js',
       'research/3d-smallmotion/smallmotion-app-bootstrap.js']
positions=[]
for path in paths:
    assert (ROOT/path).is_file(),path
    tag=f'<script defer src="{path}"></script>'
    assert page.count(tag)==1,tag
    positions.append(page.index(tag))
assert positions==sorted(positions),positions
assert 'id="f"' in page and 'id="pick"' in page and 'id="ex"' in page
assert 'id="app"' in page and 'id="out"' in page
worker=(ROOT/'research/3d-smallmotion/smallmotion-worker.js').read_text()
assert "importScripts('smallmotion-local.js')" in worker
sw=(ROOT/'sw.js').read_text()
assert 'retouche-v86' in sw
assert 'self.skipWaiting()' not in sw.split('self.addEventListener("install"')[1].split('self.addEventListener("activate"')[0]
assert all(p in sw for p in paths[1:]),'Missing offline pre-cache scripts'
assert 'research/3d-smallmotion/smallmotion-worker.js' in sw
bridge=(ROOT/paths[-2]).read_text()
assert "action:'no_automatic_change'" in bridge
assert 'fetch(' not in bridge and 'DIAG.send' not in bridge
assert 'requestVideoFrameCallback' in bridge
print('Full preprod index/app.js integration and offline bundle invariants: PASS')