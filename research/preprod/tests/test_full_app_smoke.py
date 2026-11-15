"""Real RetoucheProAI full index/app integration test (synthetic data ONLY).

Starts unmodified root index.html + app.js on a local HTTP origin. Native
Chromium decodes a generated video; the existing file input is used, and
SmallMotion's advisory Worker executes without sending the media anywhere.
Does not assert Safari compatibility or successful GPU video export.
"""
import json
import os
import shutil
import subprocess
import tempfile
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

REPO = Path(__file__).resolve().parents[3]
OUT = REPO/'research'/'preprod'/'results'
OUT.mkdir(parents=True,exist_ok=True)

class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def encode_fixture(directory):
    src=Path(directory)
    choices={}
    for fmt,codec,ext in [('h264','libx264','mp4'),('vp8','libvpx','webm')]:
        target=src/f'preprod_synthetic.{ext}'
        cmd=['ffmpeg','-hide_banner','-loglevel','error','-nostdin','-y',
             '-f','lavfi','-i','testsrc2=size=320x240:rate=15',
             '-t','1.35','-an','-c:v',codec]
        if codec=='libx264':cmd+=['-pix_fmt','yuv420p','-movflags','+faststart']
        else:cmd+=['-b:v','350k']
        subprocess.run(cmd+[str(target)],check=True,timeout=35)
        assert target.stat().st_size>4000,(fmt,target.stat().st_size)
        choices[fmt]=target
    return choices


def browser_executable():
    return next((shutil.which(n) for n in ('chromium','google-chrome','chromium-browser') if shutil.which(n)),None)


def run():
    with tempfile.TemporaryDirectory(prefix='retouche-fullapp-') as tmp:
        media=encode_fixture(tmp)
        handler=partial(QuietHandler,directory=str(REPO))
        server=ThreadingHTTPServer(('127.0.0.1',0),handler)
        server.daemon_threads=True
        thread=threading.Thread(target=server.serve_forever,daemon=True)
        thread.start()
        base=f'http://127.0.0.1:{server.server_port}/'
        results=[]
        try:
            with sync_playwright() as p:
                kw={'headless':True,'args':['--no-sandbox','--autoplay-policy=no-user-gesture-required','--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']}
                system=browser_executable()
                if system:kw['executable_path']=system
                browser=p.chromium.launch(**kw)
                for width,height in ((390,844),(1280,800)):
                    context=browser.new_context(viewport={'width':width,'height':height},accept_downloads=True)
                    page=context.new_page()
                    errors=[];external=[];requests=[]
                    page.on('pageerror',lambda e:errors.append(str(e)))
                    def route_request(route):
                        rq=route.request
                        uri=urlsplit(rq.url)
                        if uri.scheme in ('http','https') and uri.netloc != f'127.0.0.1:{server.server_port}':
                            external.append({'url':uri.scheme+'://'+uri.netloc+uri.path,'method':rq.method})
                            route.abort()
                        else:
                            requests.append({'url':uri.path,'method':rq.method})
                            route.continue_()
                    page.route('**/*',route_request)
                    page.goto(base,wait_until='domcontentloaded',timeout=30000)
                    page.wait_for_selector('#smallmotion-app-panel',state='attached',timeout=22000)
                    init=page.evaluate('''()=>({ver:document.getElementById('ver')?.textContent,
                      appLoaded:typeof loadFile==='function',
                      panel:!!document.getElementById('smallmotion-app-panel'),
                      worker:!!window.RetoucheMotionWorkerRunner,
                      director:!!window.RetoucheMotionDirectorLocal,
                      exportButton:!!document.getElementById('ex'),
                      canMP4:document.createElement('video').canPlayType('video/mp4; codecs="avc1.42E01E"'),
                      canVP8:document.createElement('video').canPlayType('video/webm; codecs="vp8"')})''')
                    assert init['appLoaded'] and init['panel'] and init['director'] and init['worker'] and init['exportButton'],init
                    codec='h264' if init['canMP4'] else 'vp8'
                    assert init['canMP4'] or init['canVP8'],init
                    path=media[codec]
                    page.locator('#f').set_input_files({'name':path.name,'mimeType':'video/mp4' if codec=='h264' else 'video/webm','buffer':path.read_bytes()})
                    page.wait_for_function('''()=>document.querySelector('#app')?.hidden===false''',timeout=20000)
                    page.wait_for_function('''()=>document.querySelector('#smallmotion-app-panel')?.hidden===false''',timeout=10000)
                    before=page.evaluate('''()=>{const g=id=>{
                          const r=document.getElementById(id)?.getBoundingClientRect();
                          return r?{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}:null;
                        };return {hasSelected:document.querySelector('#f').files.length,
                          originalExportReady:typeof document.querySelector('#ex').onclick==='function',
                          panelButton:document.querySelector('#smallmotion-app-panel button')?.textContent,
                          firstFile:document.querySelector('#f').files[0].name,
                          videoMode:typeof mode==='undefined'?'missing':mode,
                          importBounds:g('pick'),photoBounds:g('pickp'),dropBounds:g('drop'),panelBounds:g('smallmotion-app-panel'),
                          panelParent:document.getElementById('smallmotion-app-panel')?.parentElement?.id
                        }}''')
                    # Real iPhone screenshot regression: SmallMotion wasn't named and the
                    # dark action label was unreadable on a charcoal button.
                    ui=page.evaluate('''()=>{
                      const p=document.getElementById('smallmotion-app-panel'),
                            btn=p.querySelector('button'),css=getComputedStyle(btn);
                      const luminance=col=>{
                        const v=(col.match(/[\\d.]+/g)||[]).slice(0,3).map(Number);
                        if(v.length!==3)return 0;
                        const a=v.map(x=>{x/=255;return x<=.04045?x/12.92:Math.pow((x+.055)/1.055,2.4)});
                        return .2126*a[0]+.7152*a[1]+.0722*a[2];
                      };
                      const a=luminance(css.color),b=luminance(css.backgroundColor);
                      return {name:p.querySelector('strong')?.textContent,
                        buttonLabel:btn.textContent,buttonContrast:(Math.max(a,b)+.05)/(Math.min(a,b)+.05),
                        buttonWidth:btn.getBoundingClientRect().width,
                        panelBg:getComputedStyle(p).backgroundColor};
                    }''')
                    assert ui['name'] and 'SmallMotion' in ui['name'],('Brand not visible',ui)
                    assert ui['buttonLabel']=='Analyser localement',ui
                    assert ui['buttonContrast']>=4.5,('Unreadable action button',ui)
                    assert ui['buttonWidth']>=150,('SmallMotion action squeezed',ui)
                    assert before['hasSelected']==1 and before['originalExportReady'] and before['videoMode']=='video',before
                    # Avoid the actual v1 mobile UI regression: inserting the advisory
                    # panel as a third child of .drop-acts compressed both import buttons.
                    assert before['panelParent']=='ws',('SmallMotion must be outside import button group',before)
                    assert before['panelBounds']['top']>=before['dropBounds']['bottom']-1,('Panel overlaps original importer',before)
                    assert before['panelBounds']['width']>=min(300,0.75*before['dropBounds']['width']),('Panel is squeezed on mobile',before)
                    assert before['importBounds']['width']>=90,('Original import button squeezed',before)
                    page.locator('#smallmotion-app-panel button').first.click()
                    try:
                        page.wait_for_function('''()=>window.RetoucheMotionLabUI?.observe()!=null''',timeout=17000)
                        evidence=page.evaluate('''()=>window.RetoucheMotionLabUI.observe()''')
                        status=page.locator('#smallmotion-app-panel [role="status"]').inner_text()
                        assert evidence.get('action')=='no_automatic_change',evidence
                        assert evidence.get('processingPath')=='worker',evidence
                        assert evidence.get('status') in ('local_motion_candidate','no_supported_local_motion','abstain_cut_or_flash','abstain_texture','abstain_matches','abstain_resource_budget'),evidence
                        assert evidence.get('provenance')=='smallmotion_local_2frame_v1',evidence
                        assert 'name' not in json.dumps(evidence).lower() and path.name not in json.dumps(evidence),evidence
                        assert evidence.get('frames')==2 or evidence.get('status','').startswith('abstain'),evidence
                        assert not page.locator('#out').is_visible(),'Analysis changed export output'
                        page.locator('#f').set_input_files({'name':path.name,'mimeType':'video/mp4' if codec=='h264' else 'video/webm','buffer':path.read_bytes()})
                        page.wait_for_function('''()=>window.RetoucheMotionLabUI?.observe()===null''',timeout=9000)
                        reset=True
                    except Exception as exc:
                        status=page.locator('#smallmotion-app-panel [role="status"]').inner_text()
                        raise AssertionError(f'full app analysis failed: {str(exc)}; init={init}; status={status}; errors={errors[-8:]}') from exc
                    assert not any(item['method'] not in ('GET','HEAD') for item in external),external
                    # Requests originating from a decoded blob: URL are local, not an upload.
                    result={'viewport':[width,height],'codec':codec,'appVersion':init['ver'],
                            'fullIndexExecuted':True,'originalVideoImported':True,
                            'workerPath':evidence.get('processingPath'),'advisoryStatus':evidence.get('status'),
                            'originalExportIntact':before['originalExportReady'],
                            'clearsOnReimport':reset,
                            'mediaUpload':False,
                            'externalAttemptsBlocked':len(external),
                            'pageErrors':errors[:8],
                            'statusText':status[:240]}
                    results.append(result)
                    page.screenshot(path=str(OUT/f'preprod_full_app_{width}.png'),full_page=False)
                    context.close()
                browser.close()
        finally:
            server.shutdown();server.server_close()
        (OUT/'full_app_smoke.json').write_text(json.dumps(results,indent=2,ensure_ascii=False),encoding='utf8')
        print(json.dumps(results,indent=2,ensure_ascii=False))

if __name__=='__main__':run()