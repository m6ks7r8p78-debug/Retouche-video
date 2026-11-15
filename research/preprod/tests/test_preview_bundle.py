"""QA static preview from the *complete* real application's pre-cached assets.

No deployment. localhost Chromium test with external hosts blocked; first
online SW installation then offline reload and same-origin Worker inference.
"""
import json
import re
import hashlib
import shutil
import sys
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright

HERE=Path(__file__).resolve().parents[1]
ROOT=HERE.parents[1]
sys.path.insert(0,str(HERE))
from build_preview import build

class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*a):pass

def main():
    dist=build()
    expected={"index.html","sw.js","app.js","demarrage.js","mp4-muxer.js",
      "research/3d-smallmotion/smallmotion-local.js",
      "research/3d-smallmotion/smallmotion-worker.js",
      "research/3d-smallmotion/smallmotion-worker-runner.js"}
    assert all((dist/p).is_file() for p in expected)
    assert (dist/'CNAME').exists() is False
    assert 'Disallow: /' in (dist/'robots.txt').read_text()
    assert 'connect-src \'self\' blob: data:' in (dist/'index.html').read_text()
    assert 'RETOUCHE_PREPROD_ONLY' not in (ROOT/'index.html').read_text(), 'Never modify source production UI'
    # Preview SW does not cache large ML models, so its LOURDS list is empty.
    # The production test assumes a nonempty list; verify staging independently
    # while applying the *same* ordered SHA-256 content algorithm.
    sw=(dist/'sw.js').read_text('utf8')
    assert 'const LOURDS=[]' in sw and 'retouche-v854' in sw
    assets=json.loads(re.search(r'\bF=(\[[^\]]+\])',sw).group(1))
    h=hashlib.sha256()
    for name in assets:
        if name=='./':continue
        h.update(name.encode());h.update((dist/name).read_bytes())
    assert f'const H="{h.hexdigest()[:16]}"' in sw,'Preview integrity mismatch'

    server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(dist)))
    server.daemon_threads=True
    threading.Thread(target=server.serve_forever,daemon=True).start()
    base=f'http://127.0.0.1:{server.server_port}/'
    out=[]
    try:
      with sync_playwright() as p:
        args={'headless':True,'args':['--no-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']}
        x=next((shutil.which(k) for k in ('chromium','google-chrome','chromium-browser') if shutil.which(k)),None)
        if x:args['executable_path']=x
        browser=p.chromium.launch(**args)
        for width,height in ((390,844),(1280,800)):
          context=browser.new_context(viewport={'width':width,'height':height},service_workers='allow')
          page=context.new_page();errors=[];external=[]
          page.on('pageerror',lambda e:errors.append(str(e)))
          def route(r):
            uri=urlsplit(r.request.url)
            if uri.scheme in ('http','https') and uri.netloc!=f'127.0.0.1:{server.server_port}':
              external.append(uri.scheme+'://'+uri.netloc+uri.path);r.abort()
            else:r.continue_()
          page.route('**/*',route)
          page.goto(base,wait_until='domcontentloaded',timeout=30000)
          page.wait_for_selector('#smallmotion-app-panel',state='attached',timeout=24000)
          assert page.evaluate('window.RETOUCHE_PREPROD_ONLY') is True
          # A real browser loads the exact original SmallMotion Worker on this origin.
          test_js='''async()=>{
            const w=160,h=120,a=new Uint8ClampedArray(w*h*4),b=new Uint8ClampedArray(w*h*4);
            let seed=51;const rnd=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)>>>24);
            for(let i=0;i<a.length;i+=4){const v=rnd();a[i]=a[i+1]=a[i+2]=v;a[i+3]=255;b[i]=b[i+1]=b[i+2]=v;b[i+3]=255}
            const A={width:w,height:h,data:a},B={width:w,height:h,data:b};
            const base=RetoucheLocalMotion.analyze(A,B);
            const done=await RetoucheMotionWorkerRunner.run(A,B,{analyzer:RetoucheLocalMotion.analyze});
            return {mode:done.processingPath,parity:JSON.stringify(base)===JSON.stringify(done.result),status:done.result.status};
          }'''
          online=page.evaluate(test_js)
          assert online['mode']=='worker' and online['parity'],online
          page.evaluate('''async()=>{
            const reg=await navigator.serviceWorker.register('sw.js',{updateViaCache:'none'});
            await navigator.serviceWorker.ready;
            return reg.scope;
          }''')
          page.reload(wait_until='domcontentloaded');page.wait_for_function('!!navigator.serviceWorker.controller',timeout=20000)
          # Wait for all assets before simulating an iPhone offline restart.
          page.evaluate('''async()=>{
            const c=await caches.open('retouche-v854');
            const urls=['index.html','app.js','research/3d-smallmotion/smallmotion-local.js',
              'research/3d-smallmotion/smallmotion-worker.js',
              'research/3d-smallmotion/smallmotion-worker-runner.js'];
            for (const p of urls)if(!(await c.match(p)))throw Error('not cached: '+p);
          }''')
          context.set_offline(True)
          page.goto(base,wait_until='domcontentloaded',timeout=30000)
          page.wait_for_selector('#smallmotion-app-panel',state='attached',timeout=20000)
          offline=page.evaluate(test_js)
          assert offline['mode']=='worker' and offline['parity'],offline
          assert not errors,errors
          assert not external,external
          out.append({'viewport':[width,height],'preprodTag':True,'onlinePath':online['mode'],
            'offlinePath':offline['mode'],'parity':offline['parity'],
            'externalRequests':len(external),'javascriptErrors':len(errors),
            'cache':'retouche-v854','previewDeployed':False})
          context.close()
        browser.close()
    finally:
      server.shutdown();server.server_close()
    results=ROOT/'research'/'preprod'/'results'
    results.mkdir(parents=True,exist_ok=True)
    (results/'preview_offline_smoke.json').write_text(json.dumps(out,indent=2),encoding='utf8')
    print(json.dumps(out,indent=2))

if __name__=='__main__':main()