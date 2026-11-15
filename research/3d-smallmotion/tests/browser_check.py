"""Chromium synthetic test. No real video, no website and no Safari assertion."""
from pathlib import Path
import tempfile, time, json, hashlib, subprocess, shutil
import numpy as np
import cv2
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
video_file=ROOT/'synthetic_smallmotion_160x120.mp4'
webm_file=ROOT/'synthetic_smallmotion_160x120.webm'
temp_file=ROOT/'synthetic_smallmotion_raw.avi'
w,h=160,120
rng=np.random.default_rng(103)
background=rng.integers(25,220,(h,w),dtype=np.uint8)
patch=rng.integers(25,220,(18,24),dtype=np.uint8)
writer=cv2.VideoWriter(str(temp_file),cv2.VideoWriter_fourcc(*'MJPG'),30,(w,h))
assert writer.isOpened()
for i in range(45):
    g=background.copy()
    x=54+i//2; y=44+i//3
    g[y:y+18,x:x+24]=patch
    writer.write(cv2.cvtColor(g,cv2.COLOR_GRAY2BGR))
writer.release()
subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(temp_file),'-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart',str(video_file)],check=True)
subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(temp_file),'-c:v','libvpx','-b:v','300k',str(webm_file)],check=True)
temp_file.unlink()
assert video_file.stat().st_size>5000 and webm_file.stat().st_size>5000
results=[]
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=shutil.which('chromium') or shutil.which('google-chrome') or shutil.which('chromium-browser'),headless=True,args=['--no-sandbox','--autoplay-policy=no-user-gesture-required'])
    for width,height in [(390,844),(1280,800)]:
        page=browser.new_page(viewport={'width':width,'height':height})
        requests=[];errors=[]
        page.on('request',lambda r:requests.append(r.url))
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.set_content('<!doctype html><html lang="fr"><body><button id="pick">Importer une vidéo</button><input id="f" type="file" accept="video/*"/><p id="other-ui">App existante non modifiée</p></body></html>')
        page.add_script_tag(path=str(ROOT/'smallmotion-local.js'))
        page.add_script_tag(path=str(ROOT/'smallmotion-resource-guard.js'))
        page.add_script_tag(path=str(ROOT/'smallmotion-worker-runner.js'))
        page.evaluate("source => {window.RetoucheMotionWorkerURL=URL.createObjectURL(new Blob([source],{type:'text/javascript'}))}",(ROOT/'smallmotion-local.js').read_text()+'\n'+(ROOT/'smallmotion-worker.js').read_text())
        page.add_script_tag(path=str(ROOT/'smallmotion-director-local.js'))
        page.add_script_tag(path=str(ROOT/'smallmotion-app-bootstrap.js'))
        page.wait_for_selector('#smallmotion-app-panel', state='attached')
        # input import performed locally by Chromium from synthetic source
        codec=page.evaluate("() => document.createElement('video').canPlayType('video/mp4; codecs=\"avc1.42E01E\"')")
        actual_file=video_file if codec else webm_file
        page.locator('#f').set_input_files(str(actual_file))
        assert page.locator('#smallmotion-app-panel').is_visible()
        page.get_by_role('button',name='Analyser localement').click()
        page.wait_for_function("document.querySelector('#smallmotion-app-panel button').disabled === false",timeout=12000)
        status=page.locator('#smallmotion-app-panel [role=status]').inner_text()
        evidence=page.evaluate("() => window.RetoucheMotionLabUI.observe()")
        print(width,status,evidence and evidence.get('status'))
        assert evidence and evidence['provenance']=='smallmotion_local_2frame_v1',status
        assert evidence['action']=='no_automatic_change'
        assert evidence['processingPath']=='worker',evidence
        assert evidence['transferredBytes']==160*120*8
        assert evidence['workerComputeMs'] is not None
        assert evidence['processingWallMs']>=evidence['workerComputeMs']
        assert evidence['resourceEvaluation'] is not None,evidence
        assert evidence['resourceEvaluation']['nativeVideoDecoderBytes'] is None
        assert evidence['resourceEvaluation']['deviceTemperatureC'] is None
        assert evidence['resourceEvaluation']['estimatedCpuOwnedBytes']==160*120*22
        assert evidence['frameTimesSeconds'][1]-evidence['frameTimesSeconds'][0]>=.10
        assert evidence['analysisDimensions']==[160,120]
        assert not errors,errors
        assert not [u for u in requests if u.startswith('http')],requests
        assert page.locator('#other-ui').inner_text()=='App existante non modifiée'
        # Deterministically inject a slow-device *policy* (not a fake timing)
        # to check next-run downshift without needing to overheat hardware.
        page.evaluate('''() => {
          const original=window.RetoucheMotionResourceGuard.assess;
          window.RetoucheMotionResourceGuard={assess(args){
            const x=original(args);return {...x,state:'slow',reason:'synthetic_slow_policy',nextProfile:'reduced'};
          }};
        }''')
        page.get_by_role('button',name='Analyser localement').click()
        page.wait_for_function("document.querySelector('#smallmotion-app-panel button').disabled === false",timeout=12000)
        first=page.evaluate("() => window.RetoucheMotionLabUI.observe()")
        assert first['resourceEvaluation']['state']=='slow',first
        page.get_by_role('button',name='Analyser localement').click()
        page.wait_for_function("document.querySelector('#smallmotion-app-panel button').disabled === false",timeout=12000)
        reduced=page.evaluate("() => window.RetoucheMotionLabUI.observe()")
        assert reduced['analysisDimensions']==[128,96],reduced
        assert reduced['action']=='no_automatic_change'
        # Restore normal resource policy and prove that over-budget evidence
        # loses ALL candidates; this does not claim a real CPU overload.
        page.evaluate('''() => {
          window.RetoucheMotionResourceGuard={assess(args){return {
            state:'abstain',reason:'synthetic_overload',nextProfile:'reduced',
            processorMs:999, captureMs:999, estimatedCpuOwnedBytes:268800,
            nativeVideoDecoderBytes:null,deviceTemperatureC:null,batteryConsumption:null
          }}};
        }''')
        page.get_by_role('button',name='Analyser localement').click()
        page.wait_for_function("document.querySelector('#smallmotion-app-panel button').disabled === false",timeout=12000)
        denied=page.evaluate("() => window.RetoucheMotionLabUI.observe()")
        assert denied['status']=='abstain_resource_budget' and denied['candidates']==[],denied

        results.append({'width':width,'height':height,'state':evidence['status'],'candidates':len(evidence['candidates']),'ms':evidence['processorMs'],'workerComputeMs':evidence['workerComputeMs'],'processingPath':evidence['processingPath'],'no_http':True,'no_js_errors':True,'codec_tested':'h264' if codec else 'vp8_webm','times':evidence['frameTimesSeconds'],'resources':evidence['resourceEvaluation'],'adaptive_test':{'slower_profile_dimensions':[128,96],'over_budget_status':'abstain_resource_budget'}})
        # Feature fallback when Worker construction is unavailable. The next
        # frame analysis remains local and returns no external request.
        page.evaluate('window.Worker = undefined')
        page.get_by_role('button',name='Analyser localement').click()
        page.wait_for_function("document.querySelector('#smallmotion-app-panel button').disabled === false",timeout=12000)
        fallback=page.evaluate("window.RetoucheMotionLabUI.observe()")
        assert fallback['processingPath']=='main_thread_fallback' and fallback['fallbackReason']=='worker_unavailable',fallback
        # replacing with empty input immediately discards earlier evidence
        page.locator('#f').set_input_files([])
        assert page.evaluate('window.RetoucheMotionLabUI.observe()') is None
        page.close()
    browser.close()
(ROOT/'results'/'browser_check.json').write_text(json.dumps({'results':results,'syntheticH264SHA256':hashlib.sha256(video_file.read_bytes()).hexdigest(),'syntheticWebmSHA256':hashlib.sha256(webm_file.read_bytes()).hexdigest()},indent=2))
print('browser checks passed')