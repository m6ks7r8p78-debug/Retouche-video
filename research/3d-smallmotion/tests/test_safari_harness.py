"""Browser checks for a standalone opt-in local user diagnostic (not Safari)."""
from pathlib import Path
import json, shutil
from playwright.sync_api import sync_playwright, expect
root=Path(__file__).resolve().parents[1]
page_file=root/'RetoucheMotionBudget_iPhone_Local.html'
video_file=root/'synthetic_smallmotion_160x120.mp4'
webm_file=root/'synthetic_smallmotion_160x120.webm'
assert page_file.exists() and video_file.exists() and webm_file.exists()
results=[]
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True, executable_path=shutil.which('chromium'),args=['--no-sandbox','--autoplay-policy=no-user-gesture-required'])
    for dims in [(390,844),(1280,800)]:
        page=browser.new_page(viewport={'width':dims[0],'height':dims[1]},accept_downloads=True)
        errs=[];req=[];page.on('pageerror',lambda x:errs.append(str(x)));page.on('request',lambda x:req.append(x.url))
        page.set_content(page_file.read_text())
        expect(page.locator('#smallmotion-app-panel')).to_be_attached(timeout=3000)
        page.locator('#f').set_input_files(str(video_file if page.evaluate('document.createElement("video").canPlayType(\'video/mp4; codecs="avc1.42E01E"\')') else webm_file))
        page.get_by_role('button',name='Analyser localement').click()
        expect(page.locator('#save')).to_be_enabled(timeout=12000)
        observation=page.evaluate('window.RetoucheMotionLabUI.observe()')
        assert observation['resourceEvaluation']['captureMs']>=0
        assert observation['resourceEvaluation']['processorMs']>=0
        assert observation['resourceEvaluation']['nativeVideoDecoderBytes'] is None
        assert observation['action']=='no_automatic_change'
        assert 'media' not in json.dumps(observation).lower() or 'mediaTime' not in observation
        assert not [u for u in req if u.startswith(("https:","http:"))] and not errs, (req,errs)
        with page.expect_download() as dl:page.locator('#save').click()
        payload=json.loads(Path(dl.value.path()).read_text())
        assert payload['evidence']['status']==observation['status']
        assert 'video' not in json.dumps(payload).lower() or not 'video_bytes' in payload
        results.append({'viewport':list(dims),'status':observation['status'],'processorMs':observation['processorMs'],'captureMs':observation['resourceEvaluation']['captureMs'],'zeroNetwork':True,'zeroJavascriptErrors':True,'exportOnlyMetrics':True})
        page.close()
    browser.close()
(root/'results'/'offline_page_check.json').write_text(json.dumps(results,indent=2))
print('Standalone offline diagnostic:',len(results),'Chromium checks passed')