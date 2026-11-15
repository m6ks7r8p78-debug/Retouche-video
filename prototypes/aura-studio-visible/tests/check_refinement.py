"""Responsive and functional smoke checks for the AURA fine-control study.
Run: python tests/check_refinement.py (requires Playwright, Chromium, Pillow).
Tests the real, standalone HTML without network calls.
"""
from pathlib import Path
from tempfile import TemporaryDirectory
from PIL import Image
from playwright.sync_api import sync_playwright

root=Path(__file__).resolve().parents[1]
html=(root/'index.html').read_text(encoding='utf8')
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
    try:
        with TemporaryDirectory() as td:
            source=Path(td)/'synthetic.png'
            Image.new('RGB',(300,170),(70,100,170)).save(source)
            for w,h in [(320,700),(375,812),(390,844),(430,932),(768,1024),(1024,768)]:
                page=browser.new_page(viewport={'width':w,'height':h},accept_downloads=True)
                errors=[]
                page.on('pageerror',lambda e:errors.append(str(e)))
                page.set_content(html,wait_until='load')
                assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
                assert page.locator('#compareView').is_visible()
                page.locator('#compareView').focus()
                page.keyboard.press('ArrowRight')
                assert page.locator('#compareView').get_attribute('aria-valuenow')=='55'
                assert page.locator('.instrument-bay').bounding_box()['height']<=220
                page.locator('#fileInput').set_input_files(str(source))
                page.wait_for_function("window.__AURA_DIAGNOSTIC__().media==='image'")
                page.locator('#advancedKey').click()
                page.locator('[data-tool="brightness"]').click()
                dial=page.locator('#precisionDial')
                dial.focus()
                initial=float(dial.get_attribute('aria-valuenow'))
                page.keyboard.press('ArrowUp')
                assert float(dial.get_attribute('aria-valuenow'))==initial+1
                rect=dial.bounding_box()
                x=rect['x']+rect['width']/2;y=rect['y']+rect['height']/2
                page.mouse.move(x,y);page.mouse.down();page.mouse.move(x,y-15,steps=4);page.mouse.up()
                assert float(dial.get_attribute('aria-valuenow'))>=initial+1
                assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
                page.locator('#advancedClose').click()
                page.locator('[data-format="max"]').click()
                with page.expect_download() as download:
                    page.locator('#saveAction').click()
                out=Path(td)/f'{w}.png'
                download.value.save_as(str(out))
                img=Image.open(out)
                assert img.size==(300,170) and img.getpixel((100,100))!=(70,100,170)
                assert not errors,(w,errors)
                print('PASS',w,h)
                page.close()
            movie=root/'tests'/'synthetic-h264.mp4'
            if movie.exists():
                page=browser.new_page(viewport={'width':390,'height':844})
                page.set_content(html,wait_until='load')
                page.locator('#fileInput').set_input_files(str(movie))
                page.wait_for_function("window.__AURA_DIAGNOSTIC__().media==='video'")
                page.locator('#advancedKey').click()
                page.locator('#precisionDial').focus()
                page.keyboard.press('ArrowDown')
                assert page.locator('#beforeVideo').evaluate('(v)=>v.playbackRate')==.75
                assert page.locator('#saveAction').is_disabled()
                page.close()
                print('PASS synthetic MP4 preview-only')
    finally:browser.close()
