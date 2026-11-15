"""Check experimental page ordering and advisory-only design."""
from pathlib import Path
repo=Path(__file__).resolve().parents[3]
index=(repo/'index.html').read_text(encoding='utf-8')
order=['app.js','research/3d-smallmotion/smallmotion-local.js','research/3d-smallmotion/smallmotion-resource-guard.js','research/3d-smallmotion/smallmotion-director-local.js','research/3d-smallmotion/smallmotion-app-bootstrap.js']
positions=[]
for path in order:
    tag=f'<script defer src="{path}"></script>'
    assert index.count(tag)==1,(path,index.count(tag))
    positions.append(index.index(tag))
assert positions==sorted(positions)
assert 'id="f"' in index and 'id="pick"' in index
for path in order[1:]: assert (repo/path).exists(),path
bridge=(repo/order[3]).read_text()
assert "action:'no_automatic_change'" in bridge
assert 'DIAG.send' not in bridge and 'fetch(' not in bridge
assert "'abstain_resource_budget'" in bridge
print('DeviceBudget isolated script order and no-auto-change guards verified')
