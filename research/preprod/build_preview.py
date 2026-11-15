"""Package a GitHub-Pages/Cloudflare-Pages compatible RETOUCHE PREPRODUCTION.

Copies only root Service Worker F-listed *public* static assets, no user media,
model downloads or site/domain deployment. Creates independent cache fingerprint.
No Pages deployment is attempted on the production repository.
"""
import hashlib
import json
import re
import shutil
from pathlib import Path

REPO=Path(__file__).resolve().parents[2]
OUT=REPO/'research'/'preprod'/'preview-dist'
RESULTS=REPO/'research'/'preprod'/'results'

def build():
    src=(REPO/'sw.js').read_text(encoding='utf8')
    names=json.loads(re.search(r'\bF=(\[[^\]]+\])',src).group(1))
    assert 60<=len(names)<=100,len(names)
    assert len(names)==len(set(names)), 'Duplicate SW paths'
    assert 'index.html' in names and 'app.js' in names
    assert 'research/3d-smallmotion/smallmotion-worker.js' in names
    if OUT.exists():shutil.rmtree(OUT)
    OUT.mkdir(parents=True)
    copied=[];digests={}
    for name in names:
        if name=='./':continue
        source=(REPO/name).resolve()
        assert source.is_relative_to(REPO.resolve()) and source.is_file(),name
        assert not name.startswith(('.', '/')) and '..' not in Path(name).parts,name
        target=OUT/name
        target.parent.mkdir(parents=True,exist_ok=True)
        shutil.copy2(source,target)
        copied.append(name)
    assert not (OUT/'CNAME').exists(), 'Production domain must NEVER ship'
    index=(OUT/'index.html').read_text('utf8')
    assert index.count('</head>')==1
    # Preview-only privacy policy and isolation; DO NOT modify source index.html.
    extra='''<!-- PREPRODUCTION : non indexé, aucune diffusion de média personnel -->
<meta name="robots" content="noindex,nofollow,noarchive">
<meta name="referrer" content="no-referrer">
<meta http-equiv="Content-Security-Policy" content="default-src 'self' blob: data:; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob:; connect-src 'self' blob: data:; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; media-src 'self' blob: data:; worker-src 'self' blob:; font-src 'self' data:; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'">
<script>window.RETOUCHE_PREPROD_ONLY=true;document.title='PRÉPRODUCTION · RetoucheProAI'</script>
'''
    index=index.replace('</head>',extra+'</head>')
    (OUT/'index.html').write_text(index,encoding='utf8')
    # Preview-only: allow isolated HTTPS preview domain and QA without premium
    # policy: *never* change the existing site or subscription in the repo.
    start=(OUT/'demarrage.js').read_text('utf8')
    old='&&/(github\\.io|retoucheproai\\.com)$/.test(location.hostname)'
    replacement='&&(window.RETOUCHE_PREPROD_ONLY||/(github\\.io|retoucheproai\\.com)$/.test(location.hostname))'
    assert old in start
    start=start.replace(old,replacement)
    old='if(window.ABO&&ABO.actif()&&!ABO.premium())'
    replacement='if(!window.RETOUCHE_PREPROD_ONLY&&window.ABO&&ABO.actif()&&!ABO.premium())'
    assert old in start
    start=start.replace(old,replacement)
    (OUT/'demarrage.js').write_text(start,encoding='utf8')
    (OUT/'robots.txt').write_text('User-agent: *\nDisallow: /\n',encoding='utf8')
    (OUT/'.nojekyll').write_text('',encoding='utf8')
    # Heavy ML models are intentionally NOT cached by the preview. They are not
    # needed for basic import and local SmallMotion; the full application remains
    # unmodified and advanced models need separate validation.
    staged_sw=src.replace('const LOURDS=["sr.bin","rnnoise.mjs","modeles/edgetam_encodeur.onnx","modeles/edgetam_decodeur.onnx"]','const LOURDS=[]')
    assert staged_sw!=src, 'Optional model list changed in repo'
    # Isolate preview cache from production and prior installations.
    staged_sw=staged_sw.replace('const C="retouche-v87"','const C="retouche-v853"')
    assert 'retouche-v853' in staged_sw
    h=hashlib.sha256()
    for name in names:
        if name=='./':continue
        h.update(name.encode())
        data=(OUT/name).read_bytes()
        h.update(data)
        digests[name]=hashlib.sha256(data).hexdigest()
    fingerprint=h.hexdigest()[:16]
    staged_sw=re.sub(r'const H="[^"]*"',f'const H="{fingerprint}"',staged_sw,count=1)
    (OUT/'sw.js').write_text(staged_sw,encoding='utf8')
    (OUT/'README_PREVIEW.txt').write_text('''RetoucheProAI — STAGING PREVIEW ONLY

This is a static preview of the experimental integrated application. Do NOT
publish in the existing production GitHub Pages repository or retoucheproai.com.
Upload this dist/ folder to a SEPARATE HTTPS hosting project (Cloudflare Pages
or another disposable GitHub Pages repository) after connection/approval.
No personal user videos, models, secrets or accounts were bundled.
This variant blocks non-same-origin network requests via CSP. Advanced external
models or cloud features therefore are NOT supported. Basic input + SmallMotion
Worker advisory are intended to work on the device. The app's export still
requires available platform encoders and must be tested on physical iPhone.
The initial connection is required to seed the service worker cache.
Do NOT use as production or attach production custom domain.
''',encoding='utf8')
    report={'type':'static-preview-same-app','assetCount':len(copied),
      'assetsBytes':sum((OUT/f).stat().st_size for f in copied),
      'cache':'retouche-v853','fingerprint':fingerprint,
      'noindex':True,'noProductionCNAME':True,'separateHostingRequired':True,
      'noModelWeights':True,'noPrivateVideos':True,'urlPublished':False,
      'assetDigestsSHA256':digests}
    RESULTS.mkdir(parents=True,exist_ok=True)
    (RESULTS/'preview_build.json').write_text(json.dumps(report,indent=2),encoding='utf8')
    print(json.dumps({k:v for k,v in report.items() if k!='assetDigestsSHA256'},indent=2))
    return OUT

if __name__=='__main__':build()