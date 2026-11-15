"""Validate opt-in local audit only touches experimental frontend assets."""
from pathlib import Path
root=Path(__file__).resolve().parents[3]
html=(root/'index.html').read_text(encoding='utf8')
assets=[
 'research/preprod/av-fidelity-local.js',
 'research/preprod/av-fidelity-app.js'
]
for name in assets:
 tag=f'<script defer src="{name}"></script>'
 assert html.count(tag)==1,(name,html.count(tag))
 assert (root/name).is_file(),name
assert html.index('<script defer src="research/3d-smallmotion/smallmotion-app-bootstrap.js"></script>') < html.index(f'<script defer src="{assets[0]}"></script>') < html.index(f'<script defer src="{assets[1]}"></script>')
assert html.count('id="retouche-av-audit-panel"')==1, 'Visible audit panel must exist without JavaScript'
assert html.index('id="drop"') < html.index('id="retouche-av-audit-panel"') < html.index('id="f"'), 'Card must follow drop and SmallMotion mount position'
assert 'data-audit-version="v2"' in html, 'Explicit visible version marker'
assert 'id="retouche-av-audit-pick" disabled' in html, 'Fail closed if JS unavailable'
ui=(root/assets[1]).read_text(encoding='utf8')
assert "existing=d.getElementById('smallmotion-app-panel')" not in ui, 'Mount must not depend on SmallMotion race'
assert "panel.dataset.auditReady='true'" in ui, 'The card must advertise readiness'
sw=(root/'sw.js').read_text(encoding='utf8')
for name in assets: assert name in sw,name
app=(root/'app.js').read_text(encoding='utf8')
assert 'async function demuxAudio' in app and 'async function demuxVideo' in app
for name in assets:
 code=(root/name).read_text(encoding='utf8')
 assert not any(w in code for w in ['fetch(','XMLHttpRequest','localStorage','navigator.sendBeacon','DIAG.send','indexedDB'])
 assert 'no_automatic_change' in (root/assets[0]).read_text(encoding='utf8')
print('Local A/V audit mounted after SmallMotion, cached, non-persistent, no network')