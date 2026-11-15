"""Reproduce a full-precache PWA update with *two live clients* and no network.

Needs complete GitHub checkout. Uses exact sw.js install/activate/fetch handlers,
all actual precached files F (symlinked to checkout for speed), and a lightweight
synthetic index.html so unrelated app APIs do not obscure the update lifecycle.
The deferred large model files are intentionally disabled in this harness.

No private media, models downloaded or external requests.
"""
from __future__ import annotations
import json
import os
import re
import shutil
import tempfile
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright

REPO=Path(__file__).resolve().parents[3]
SW=(REPO/'sw.js').read_text(encoding='utf-8')
assert 'const C="retouche-v86"' in SW
assert 'self.skipWaiting(' not in SW, 'Forced SW activation can mix two generations'
F=json.loads(re.search(r'\bF=(\[[^\]]+\])',SW).group(1))
REQUIRED=['research/3d-smallmotion/smallmotion-local.js',
          'research/3d-smallmotion/smallmotion-worker-runner.js',
          'research/3d-smallmotion/smallmotion-worker.js']
assert all(f in F for f in REQUIRED)
assert all((REPO/f).is_file() for f in F if f!='./'), 'Full manifest must be readable on runner'
STAGE=Path(tempfile.mkdtemp(prefix='retouche_full_pwa_update_'))
for f in F:
 if f in ['./','index.html'] or f in REQUIRED:continue
 dest=STAGE/f;dest.parent.mkdir(parents=True,exist_ok=True)
 dest.symlink_to(REPO/f)
for f in REQUIRED:
 dest=STAGE/f;dest.parent.mkdir(parents=True,exist_ok=True)
 shutil.copy2(REPO/f,dest)

# Reuse entire real F manifest. Disable only deferred, unrelated heavy weights.
BASE_SW=re.sub(r'const LOURDS=\[[^\]]*\]', 'const LOURDS=[]',SW,count=1)
assert BASE_SW != SW

def write_atomic(path:Path,data:str):
 tmp=path.with_name(path.name+'.swap')
 tmp.write_text(data,encoding='utf-8')
 os.replace(tmp,path)

def install_release(name:str):
 """Mimic server deploying a second coherent generation, byte by byte."""
 if name == 'v86':
  sw=BASE_SW
  html_version='86'
 else:
  assert name == 'v87'
  sw=BASE_SW.replace('const C="retouche-v86"','const C="retouche-v87"').replace(
      'const H="9b3586a6271e8c09"','const H="1234567890abcdef"')
  html_version='87'
  for f in REQUIRED:
   path=STAGE/f
   old=path.read_text('utf-8')
   assert 'smallmotion-pwa-bundle-v1' in old,f
   write_atomic(path,old.replace('smallmotion-pwa-bundle-v1','smallmotion-pwa-bundle-v2'))
 write_atomic(STAGE/'sw.js',sw)
 write_atomic(STAGE/'index.html',f'''<!doctype html><html lang="fr" data-release="{html_version}">
 <head><meta charset="utf-8"><title>Retouche local simulated PWA update</title></head>
 <body><main id="page">PWA generation {html_version}</main>
 <script src="research/3d-smallmotion/smallmotion-local.js"></script>
 <script src="research/3d-smallmotion/smallmotion-worker-runner.js"></script>
 </body></html>''')

install_release('v86')

class Quiet(SimpleHTTPRequestHandler):
 def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(STAGE),**kwargs)
 def log_message(self,*args):pass
 def end_headers(self):
  self.send_header('Cache-Control','no-store')
  super().end_headers()

http=ThreadingHTTPServer(('127.0.0.1',0),Quiet)
threading.Thread(target=http.serve_forever,daemon=True).start()
SITE=f'http://127.0.0.1:{http.server_port}/'

EVIDENCE=r'''async()=>{
 let s=45;const rnd=()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s>>>24};
 const w=160,h=120,pixels=new Uint8ClampedArray(w*h*4);
 for(let i=0;i<pixels.length;i+=4){const k=rnd();pixels[i]=pixels[i+1]=pixels[i+2]=k;pixels[i+3]=255}
 const a={width:w,height:h,data:pixels},b={width:w,height:h,data:new Uint8ClampedArray(pixels)};
 const expected=RetoucheLocalMotion.analyze(a,b);
 const outcome=await RetoucheMotionWorkerRunner.run(a,b,{analyzer:RetoucheLocalMotion.analyze,timeoutMs:2800});
 return {local:RetoucheLocalMotion.build, runner:RetoucheMotionWorkerRunner.BUILD,
   path:outcome.processingPath,parity:JSON.stringify(expected)===JSON.stringify(outcome.result),
   status:outcome.result.status,release:document.documentElement.dataset.release}
}'''

def check(page,version):
 outcome=page.evaluate(EVIDENCE)
 assert outcome['path']=='worker' and outcome['parity'],outcome
 assert outcome['runner']==outcome['local'],outcome
 assert outcome['local'].endswith('v'+str(version-85)),outcome
 assert outcome['release']==str(version),outcome
 return outcome

rows=[]
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path=shutil.which('chromium') or shutil.which('google-chrome') or shutil.which('chromium-browser'),headless=True,args=['--no-sandbox'])
  ctx=browser.new_context(viewport={'width':390,'height':844},service_workers='allow')
  errors=[];foreign=[]
  ctx.on('page',lambda page:page.on('pageerror',lambda exc:errors.append(str(exc))))
  ctx.on('request',lambda req:foreign.append(req.url) if not (req.url.startswith(SITE) or req.url.startswith('blob:')) else None)
  a=ctx.new_page();a.goto(SITE,wait_until='load')
  a.evaluate('async()=>{await navigator.serviceWorker.register("/sw.js",{updateViaCache:"none"});await navigator.serviceWorker.ready}')
  a.reload(wait_until='load');a.wait_for_function('!!navigator.serviceWorker.controller')
  b=ctx.new_page();b.goto(SITE,wait_until='load');b.wait_for_function('!!navigator.serviceWorker.controller')
  for page in [a,b]:
   page.evaluate('window.__unsavedEditorState={openVideo:true,unexportedEdits:7}')
   check(page,86)
  assert a.evaluate('async()=> (await caches.keys()).includes("retouche-v86")')
  # Publishing release two while two active pages are still controlled by v86.
  install_release('v87')
  a.evaluate('async()=>{const reg=await navigator.serviceWorker.getRegistration();await reg.update()}')
  # Chromium can schedule a second installing worker while replacing a waiting
  # worker during update(). Observe a stable installed/waiting state, not a
  # single transition snapshot. Old cache must remain intact throughout.
  state_js='''async()=>{const reg=await navigator.serviceWorker.getRegistration();
    return {active:reg.active?.state||null,waiting:reg.waiting?.state||null,
            installing:reg.installing?.state||null,
            controller:navigator.serviceWorker.controller?.state||null,
            caches:await caches.keys(),release:document.documentElement.dataset.release}}'''
  stable=0;state=None
  for attempt in range(90):
   state=a.evaluate(state_js)
   assert 'retouche-v86' in state['caches'],state
   assert state['controller']=='activated' and state['release']=='86',state
   stable=stable+1 if state['waiting']=='installed' and not state['installing'] else 0
   if stable>=3:break
   time.sleep(0.25)
  assert stable>=3,('new release never reached stable waiting state',state)
  bstate=b.evaluate(state_js)
  assert bstate['release']=='86' and bstate['controller']=='activated',bstate
  assert bstate['waiting']=='installed' and not bstate['installing'],bstate
  assert 'retouche-v86' in bstate['caches'] and 'retouche-v87' in bstate['caches'],bstate
  assert a.evaluate('async()=>!!(await navigator.serviceWorker.getRegistration()).waiting')
  for page in [a,b]:
   assert page.evaluate('window.__unsavedEditorState?.unexportedEdits')==7
   check(page,86) # Crucial: new files are online, but old clients use old cache.
  rows.append({'phase':'waiting_two_clients','oldCacheRetained':True,'newCachePrepared':True,
               'unsavedEditorStatePreserved':True,'oldWorkerCoherent':True})
  ctx.set_offline(True)
  a.close()
  # Tab B remains open with unexported edits and still uses old SW OFFLINE.
  assert b.evaluate('window.__unsavedEditorState?.openVideo') is True
  assert b.evaluate('async()=>!!(await navigator.serviceWorker.getRegistration()).waiting')
  assert b.evaluate('async()=>(await caches.keys()).includes("retouche-v86")')
  check(b,86)
  rows.append({'phase':'waiting_one_client_offline','oldCacheRetained':True,'oldWorkerCoherent':True})
  b.close() # Last old client closes -> new SW may safely activate.
  # A new client can race activation. If it does, close and retry rather than
  # keeping that old client alive and preventing the pending release.
  migrated=None
  for attempt in range(8):
   time.sleep(0.5)
   fresh=ctx.new_page()
   try:
    fresh.goto(SITE,wait_until='load',timeout=10000)
    if fresh.evaluate('document.documentElement.dataset.release')=='87':
     migrated=fresh;break
   except Exception:
    pass
   fresh.close()
  assert migrated,'After all old tabs closed, new SW must own offline clients'
  migrated.wait_for_function('!!navigator.serviceWorker.controller')
  evidence=check(migrated,87)
  keys=migrated.evaluate('async()=>await caches.keys()')
  assert 'retouche-v87' in keys and 'retouche-v86' not in keys,keys
  assert not foreign,foreign
  assert not errors,errors
  rows.append({'phase':'new_client_offline','newBundle':'smallmotion-pwa-bundle-v2',
               'newWorkerCoherent':True,'oldCacheRemovedAfterLastTab':True,
               'networkOffline':True,'externalRequests':len(foreign),'lastStatus':evidence['status'],
               'fullPrecacheCount':len(F)})
  migrated.close();ctx.close();browser.close()
  output=REPO/'research/3d-smallmotion/results/pwa_update_two_clients.json'
  output.parent.mkdir(parents=True,exist_ok=True)
  output.write_text(json.dumps(rows,indent=2),encoding='utf-8')
  print('Two-client PWA update without skipWaiting, full F, offline restart: PASSED')
finally:
 http.shutdown();http.server_close();shutil.rmtree(STAGE,ignore_errors=True)