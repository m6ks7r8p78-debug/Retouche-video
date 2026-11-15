"""Actual index.html + app.js local MP4 metadata audit, synthetic media only.
Run on GitHub Actions with the full repository checkout and local FFmpeg/Chromium.
Do not upload the synthetic MP4 or user media as CI artifacts.
"""
import json, shutil, subprocess, tempfile, threading
from pathlib import Path
from urllib.parse import urlsplit
from functools import partial
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[3]
RESULTS=ROOT/'research'/'preprod'/'results'
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*args):pass

def ff(*args):subprocess.run(['ffmpeg','-nostdin','-hide_banner','-loglevel','error','-y',*map(str,args)],check=True,capture_output=True,timeout=35)

def test():
  with tempfile.TemporaryDirectory(prefix='retouche_av_audit_synthetic_') as temp:
    folder=Path(temp);a=folder/'original.mp4';b=folder/'remux.mp4';c=folder/'short.mp4'
    ff('-f','lavfi','-i','testsrc2=size=160x120:rate=30','-f','lavfi','-i','sine=frequency=770:sample_rate=44100','-t','2.2','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-c:a','aac','-b:a','64k','-shortest',a)
    ff('-i',a,'-map','0','-c','copy','-movflags','+faststart',b)
    ff('-t','1.8','-i',a,'-map','0','-c','copy',c)
    server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT)))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    base=f'http://127.0.0.1:{server.server_port}/'
    out=[]
    try:
      with sync_playwright() as p:
        args={'headless':True,'args':['--no-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']}
        binary=next((shutil.which(x) for x in ('chromium','google-chrome','chromium-browser') if shutil.which(x)),None)
        if binary:args['executable_path']=binary
        browser=p.chromium.launch(**args)
        for width,height in ((390,844),(1280,800)):
          context=browser.new_context(viewport={'width':width,'height':height})
          page=context.new_page();errors=[];external=[]
          page.on('pageerror',lambda e:errors.append(str(e)))
          def route(r):
            uri=urlsplit(r.request.url)
            if uri.scheme in ('http','https') and uri.netloc!=f'127.0.0.1:{server.server_port}':
              external.append({'host':uri.hostname,'method':r.request.method});r.abort()
            else:r.continue_()
          page.route('**/*',route)
          page.goto(base,wait_until='domcontentloaded',timeout=30000)
          page.wait_for_selector('#retouche-av-audit-panel',state='attached',timeout=24000)
          assert page.locator('#retouche-av-audit-panel').get_attribute('data-audit-version')=='v2'
          assert page.evaluate("document.querySelector('#retouche-av-audit-panel').parentElement.id")=='ws'
          page.wait_for_function("()=>document.querySelector('#retouche-av-audit-panel')?.dataset.auditReady==='true'",timeout=8000)
          assert page.locator('#retouche-av-audit-panel').is_visible()
          assert page.evaluate('typeof window.RetoucheLocalExportAudit')=='object'
          page.locator('#f').set_input_files({'name':'fixture-original.mp4','mimeType':'video/mp4','buffer':a.read_bytes()})
          page.wait_for_function('''()=>document.querySelector('#smallmotion-app-panel')?.hidden===false''',timeout=12000)
          pick=page.locator('#retouche-av-audit-panel button')
          assert pick.inner_text()=='Comparer mon MP4 exporté'
          box=pick.bounding_box();assert box and box['width']>=170 and box['height']>=40
          source_status=page.locator('#retouche-av-audit-panel [role="status"]').inner_text()
          assert 'Original sélectionné' in source_status
          exported=page.locator('#retouche-av-audit-panel input[type=file]')
          exported.set_input_files({'name':'fixture-output.mp4','mimeType':'video/mp4','buffer':c.read_bytes()})
          page.wait_for_function('''()=>window.RetoucheLocalExportAuditUI?.observe()?.status==='needs_review' ''',timeout=15000)
          result=page.evaluate('window.RetoucheLocalExportAuditUI.observe()')
          assert result['action']=='no_automatic_change'
          assert result['metrics']['videoSamplesDelta']<0
          assert any(w['code']=='video_sample_count_reduced' for w in result['warnings'])
          assert 'fixture' not in json.dumps(result),result
          exported.set_input_files({'name':'fixture-remux.mp4','mimeType':'video/mp4','buffer':b.read_bytes()})
          page.wait_for_function('''()=>window.RetoucheLocalExportAuditUI?.observe()?.status==='metadata_consistent' ''',timeout=15000)
          same=page.evaluate('window.RetoucheLocalExportAuditUI.observe()')
          assert same['confidence']=='metadata_only'
          assert 'PAS' in same['limitations']
          # A new source import must invalidate the previous result (no stale QA).
          page.locator('#f').set_input_files({'name':'new-source.mp4','mimeType':'video/mp4','buffer':a.read_bytes()})
          page.wait_for_function('''()=>window.RetoucheLocalExportAuditUI?.observe()===null''',timeout=10000)
          # A broken/missing A/V UI script must NEVER make the entire card invisible.
          broken=context.new_page()
          broken.route('**/research/preprod/av-fidelity-app.js',lambda route: route.abort())
          broken.goto(base,wait_until='domcontentloaded',timeout=30000)
          broken.wait_for_selector('#retouche-av-audit-panel',state='visible',timeout=10000)
          assert broken.locator('#retouche-av-audit-pick').is_disabled()
          assert 'module n’est pas disponible' in broken.locator('#retouche-av-audit-status').inner_text()
          broken.close()
          # If only the parser fails, the UI must explain that its engine is missing.
          missing=context.new_page()
          missing.route('**/research/preprod/av-fidelity-local.js',lambda route: route.abort())
          missing.goto(base,wait_until='domcontentloaded',timeout=30000)
          missing.wait_for_selector('#retouche-av-audit-panel',state='visible',timeout=10000)
          missing.wait_for_function("()=>document.querySelector('#retouche-av-audit-panel')?.dataset.auditReady==='false'",timeout=10000)
          assert missing.locator('#retouche-av-audit-pick').is_disabled()
          missing.close()
          assert not errors,errors
          assert not external,external
          out.append({'viewport':[width,height],'appAuditMounted':True,'detectedMissingFrames':True,
            'sameHeadersConsistent':True,'javascriptErrors':0,'externalRequests':0,
            'sourceMediaSynthetic':True})
          context.close()
        browser.close()
    finally:server.shutdown();server.server_close()
    RESULTS.mkdir(parents=True,exist_ok=True)
    (RESULTS/'av_audit_browser.json').write_text(json.dumps(out,indent=2),encoding='utf8')
    print(json.dumps({'result':'pass','browserCases':out}))

if __name__=='__main__':test()