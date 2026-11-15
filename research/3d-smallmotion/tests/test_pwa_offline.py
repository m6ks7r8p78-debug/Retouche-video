"""Real Chromium localhost Service Worker lifecycle with exact handlers.

The test reduces the precache F to the SmallMotion subset because the full
app requires dozens of unrelated assets. The full manifest + SHA are checked
separately on the GitHub checkout. Never claims Safari hardware validation.
"""
from __future__ import annotations
import contextlib
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import json
from pathlib import Path
import re
import shutil
import tempfile
import threading
from playwright.sync_api import sync_playwright

MODULE = Path(__file__).resolve().parents[1]
ROOT = MODULE.parent.parent if (MODULE.parent.parent/'sw.js').exists() else MODULE
SW_SRC=(ROOT/'sw.js').read_text(encoding='utf8')
REQUIRED=['smallmotion-local.js','smallmotion-resource-guard.js','smallmotion-worker-runner.js',
          'smallmotion-director-local.js','smallmotion-app-bootstrap.js','smallmotion-worker.js']
SOURCE_FILES=[MODULE/x for x in REQUIRED]
assert all(x.is_file() for x in SOURCE_FILES)
assert 'F=[' in SW_SRC and 'LOURDS=[' in SW_SRC
STAGING=Path(tempfile.mkdtemp(prefix='retouche_pwa_offline_'))
jsroot=STAGING/'research'/'3d-smallmotion';jsroot.mkdir(parents=True)
for file in SOURCE_FILES:shutil.copy2(file,jsroot/file.name)
# Use real install/activate/fetch functions of sw.js; only mock the large
# unrelated application manifest, which is independently checked by CI.
sw=re.sub(r'F=\[[^\]]*\]', 'F='+json.dumps(['./','index.html']+['research/3d-smallmotion/'+p for p in REQUIRED]),SW_SRC,count=1)
sw=re.sub(r'const LOURDS=\[[^\]]*\]', 'const LOURDS=[]',sw,count=1)
sw=sw.replace('retouche-v83','retouche-v8301')
(STAGING/'sw.js').write_text(sw,encoding='utf8')
(STAGING/'index.html').write_text('''<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>SmallMotion offline lifecycle harness</title></head><body>
<div id="state">Local only</div>
<script src="research/3d-smallmotion/smallmotion-local.js"></script>
<script src="research/3d-smallmotion/smallmotion-worker-runner.js"></script>
</body></html>''',encoding='utf8')
class Quiet(SimpleHTTPRequestHandler):
 def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(STAGING),**kwargs)
 def log_message(self,*args):pass
 def end_headers(self):
  self.send_header('Cache-Control','no-store')
  super().end_headers()
server=ThreadingHTTPServer(('127.0.0.1',0),Quiet)
thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
URL=f'http://127.0.0.1:{server.server_port}/'

EVALUATE=r'''async()=>{
let st=37;const rnd=()=>{st=(Math.imul(st,1664525)+1013904223)>>>0;return st>>>24};
const w=160,h=120,base=new Uint8Array(w*h),obj=new Uint8Array(24*20);
for(let i=0;i<base.length;i++)base[i]=rnd();for(let i=0;i<obj.length;i++)obj[i]=rnd();
const make=(t)=>{const data=new Uint8ClampedArray(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
 let v=base[y*w+((x-t+w)%w)];const xx=x-66,yy=y-(44+t*4);
 if(xx>=0&&xx<24&&yy>=0&&yy<20)v=obj[yy*24+xx];
 const p=4*(y*w+x);data[p]=data[p+1]=data[p+2]=v;data[p+3]=255;
 }return {width:w,height:h,data};};
const a=make(0),b=make(1);
const expected=RetoucheLocalMotion.analyze(a,b);
const actual=await RetoucheMotionWorkerRunner.run(a,b,{analyzer:RetoucheLocalMotion.analyze,timeoutMs:1800});
return {path:actual.processingPath,status:actual.result.status,candidates:actual.result.candidates.length,
 equal:JSON.stringify(expected)===JSON.stringify(actual.result), transferredBytes:actual.transferredBytes,
 build:RetoucheMotionWorkerRunner.BUILD, sameBuild:RetoucheLocalMotion.build===RetoucheMotionWorkerRunner.BUILD};
}'''
try:
 with sync_playwright() as p:
  binary=shutil.which('chromium') or shutil.which('google-chrome') or shutil.which('chromium-browser')
  browser=p.chromium.launch(headless=True,executable_path=binary,args=['--no-sandbox']) if binary else p.chromium.launch(headless=True)
  results=[]
  for dims in [(390,844),(1280,800)]:
   ctx=browser.new_context(viewport={'width':dims[0],'height':dims[1]},service_workers='allow')
   page=ctx.new_page();errors=[];remote=[]
   page.on('pageerror',lambda exc:errors.append(str(exc)))
   page.on('request',lambda req:remote.append(req.url) if not (req.url.startswith(URL) or req.url.startswith('blob:')) else None)
   page.goto(URL,wait_until='load')
   reg=page.evaluate('async()=>{const r=await navigator.serviceWorker.register("/sw.js",{updateViaCache:"none"});await navigator.serviceWorker.ready;return r.scope}')
   page.reload(wait_until='load')
   page.wait_for_function('!!navigator.serviceWorker.controller',timeout=12000)
   cacheinfo=page.evaluate('''async()=>{
    const keys=await caches.keys();const target=keys.filter(k=>k.startsWith('retouche-v8301'))[0];
    const cached=await caches.open(target); const must=['index.html','research/3d-smallmotion/smallmotion-worker.js','research/3d-smallmotion/smallmotion-local.js','research/3d-smallmotion/smallmotion-worker-runner.js'];
    const present=[];for(let p of must)present.push(!!await cached.match(p));return {target,present};
   }''')
   assert all(cacheinfo['present']),cacheinfo
   online=page.evaluate(EVALUATE)
   assert online['path']=='worker' and online['equal'] and online['sameBuild'],online
   ctx.set_offline(True)
   page.reload(wait_until='load',timeout=16000)
   assert page.evaluate('navigator.serviceWorker.controller!==null')
   offline=page.evaluate(EVALUATE)
   assert offline['path']=='worker' and offline['equal'] and offline['sameBuild'],offline
   # Cache a deliberately stale Worker under a unique URL. It returns a
   # plausible candidate but omits the build marker. Client must reject.
   stale=page.evaluate('''async()=>{
      const c=await caches.open((await caches.keys()).find(k=>k.startsWith('retouche-v8301')));
      const path='research/3d-smallmotion/smallmotion-worker.js?incompatible=1';
      await c.put(path,new Response(`onmessage=e=>postMessage({id:e.data.id,ok:true,result:{status:'local_motion_candidate',candidates:[{box:[1,1,10,10]}]}})`,{status:200,headers:{'Content-Type':'text/javascript'}}));
      const prev=RetoucheMotionWorkerRunner.DEFAULT_WORKER;
      // synthesize same sized valid ImageData
      let data=new Uint8ClampedArray(160*120*4);for(let i=0;i<data.length;i+=4){data[i]=data[i+1]=data[i+2]=(i/4)%255;data[i+3]=255;}
      const a={width:160,height:120,data},b={width:160,height:120,data:new Uint8ClampedArray(data)};
      const r=await RetoucheMotionWorkerRunner.run(a,b,{analyzer:RetoucheLocalMotion.analyze,workerURL:path,timeoutMs:1200});
      return {status:r.result.status,path:r.processingPath,candidates:r.result.candidates.length};
   }''')
   assert stale=={'status':'abstain_worker_version_mismatch','path':'worker_version_mismatch','candidates':0},stale
   assert not errors,errors
   assert not remote,remote
   results.append({'viewport':list(dims),'offline':True,'workerPath':offline['path'],
     'detectorParity':offline['equal'],'versionMatched':offline['sameBuild'],
     'allResourcesPrecached':True,'staleWorkerRejected':True,'externalRequests':0,
     'cacheName':cacheinfo['target']})
   ctx.close()
  browser.close()
 out=MODULE/'results'/'pwa_offline_chromium.json'
 out.parent.mkdir(exist_ok=True)
 out.write_text(json.dumps(results,indent=2),encoding='utf8')
 print('Chromium true Service Worker offline restart + stale-code abstention:',len(results),'viewports passed')
finally:
 server.shutdown();server.server_close();shutil.rmtree(STAGING,ignore_errors=True)