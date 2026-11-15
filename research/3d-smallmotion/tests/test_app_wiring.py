"""Static non-regression of the experimental in-app installation."""
from pathlib import Path
repo=Path(__file__).resolve().parents[3]
index=(repo/'index.html').read_text(encoding='utf-8')
paths=[
 'app.js',
 'research/3d-smallmotion/smallmotion-local.js',
 'research/3d-smallmotion/smallmotion-director-local.js',
 'research/3d-smallmotion/smallmotion-app-bootstrap.js'
]
for path in paths:
    tag=f'<script defer src="{path}"></script>'
    assert index.count(tag)==1,(path,index.count(tag))
assert index.index('src="app.js"')<index.index('src="research/3d-smallmotion/smallmotion-local.js"')
assert index.index('src="research/3d-smallmotion/smallmotion-local.js"')<index.index('src="research/3d-smallmotion/smallmotion-director-local.js"')
assert index.index('src="research/3d-smallmotion/smallmotion-director-local.js"')<index.index('src="research/3d-smallmotion/smallmotion-app-bootstrap.js"')
assert 'id="f"' in index and 'id="pick"' in index
for path in paths[1:]: assert (repo/path).exists(), path
print('App import and defer ordering verified')