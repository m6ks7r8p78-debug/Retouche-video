"""Static tests for the *experimental* production index only.
This is deliberately not a deployment or Safari verification."""
from pathlib import Path
repo=Path(__file__).resolve().parents[3]
index=(repo/'index.html').read_text(encoding='utf8')
sources=['app.js',
 'research/3d-smallmotion/smallmotion-local.js',
 'research/3d-smallmotion/smallmotion-resource-guard.js',
 'research/3d-smallmotion/smallmotion-worker-runner.js',
 'research/3d-smallmotion/smallmotion-director-local.js',
 'research/3d-smallmotion/smallmotion-app-bootstrap.js']
positions=[]
for path in sources:
 tag=f'<script defer src="{path}"></script>'
 assert index.count(tag)==1,(path,index.count(tag))
 positions.append(index.index(tag))
assert positions==sorted(positions),positions
assert 'id="f"' in index and 'id="pick"' in index
for file in sources[1:]:assert (repo/file).exists(),file
worker=repo/'research/3d-smallmotion/smallmotion-worker.js'
assert worker.exists()
assert "importScripts('smallmotion-local.js')" in worker.read_text()
runner=repo/'research/3d-smallmotion/smallmotion-worker-runner.js'
assert 'workerURL=(root.RetoucheMotionWorkerURL||DEFAULT_WORKER)' in runner.read_text()
bridge=(repo/sources[-2]).read_text()
assert 'runner.run(sample.a,sample.b' in bridge
assert "action:'no_automatic_change'" in bridge
assert 'DIAG.send' not in bridge and 'fetch(' not in bridge
assert 'requestVideoFrameCallback' in bridge
print('Experimental in-app Worker wiring: six deferred scripts ordered, original selectors retained')