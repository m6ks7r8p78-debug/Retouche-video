"""Chromium regression smoke test for AURA faithful reference.
Install Playwright and Pillow; run python check_chromium.py in this directory.
The test injects the actual standalone HTML, without any network.
"""
from pathlib import Path
from tempfile import TemporaryDirectory
from PIL import Image
from playwright.sync_api import sync_playwright
import shutil, subprocess

ROOT=Path(__file__).resolve().parent
HTML=(ROOT/'index.html').read_text(encoding='utf-8')
SIZES=[(320,700),(375,812),(390,844),(430,932),(768,1024),(1024,768)]
with sync_playwright() as p:
    b=p.chromium.launch(headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    try:
        with TemporaryDirectory() as td:
            source=Path(td)/'test.png'
            Image.new('RGB',(300,180),(90,110,145)).save(source)
            for width,height in SIZES:
                page=b.new_page(viewport={'width':width,'height':height},accept_downloads=True)
                errors=[]
                page.on('pageerror',lambda err:errors.append(str(err)))
                page.set_content(HTML,wait_until='load')
                page.wait_for_function("document.getElementById('beforePhoto').naturalWidth>0")
                assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
                page.locator('#compare').focus()
                page.keyboard.press('ArrowRight')
                assert page.locator('#compare').get_attribute('aria-valuenow')=='55'
                page.locator('#file').set_input_files(str(source))
                page.wait_for_function("window.__AURA_CHECK__().kind==='image'")
                page.locator('#advancedBtn').click()
                page.locator('#precisionDial').focus()
                page.keyboard.press('ArrowUp')
                assert page.evaluate('window.__AURA_CHECK__().settings.light')==1
                page.locator('#toolValue').fill('19')
                assert page.evaluate('window.__AURA_CHECK__().settings.light')==19
                page.locator('#closeAdvanced').click()
                page.locator('[data-format="max"]').click()
                with page.expect_download() as d:page.locator('#save').click()
                export=Path(td)/f'{width}.png'
                d.value.save_as(str(export))
                image=Image.open(export)
                assert image.size==(300,180) and image.getpixel((100,100))!=(90,110,145)
                page.locator('[data-format="x"]').click()
                with page.expect_download() as d:page.locator('#save').click()
                assert d.value.suggested_filename.endswith('.jpg')
                assert not errors,errors
                print('PASS photo',width,height)
                page.close()
            if shutil.which('ffmpeg'):
                video=Path(td)/'test.mp4'
                subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-f','lavfi','-i','testsrc=size=320x180:rate=15','-t','2','-c:v','libx264','-pix_fmt','yuv420p',str(video)],check=True)
                page=b.new_page(viewport={'width':390,'height':844})
                page.set_content(HTML,wait_until='load')
                page.locator('#file').set_input_files(str(video))
                page.wait_for_function("document.getElementById('beforeVideo').readyState>=1")
                page.locator('#advancedBtn').click()
                page.locator('#toolValue').fill('0.5')
                assert page.locator('#beforeVideo').evaluate('(v)=>v.playbackRate')==0.5
                assert page.locator('#save').is_disabled()
                print('PASS synthetic video preview-only and 0.5x speed')
                page.close()
            else: print('SKIP video: ffmpeg unavailable')
    finally:b.close()
