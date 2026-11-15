"""AURA optional undo/redo regression tests (Playwright + Pillow).
Run: python check_history.py. Chromium is used; ffmpeg optional for H264.
"""
from pathlib import Path
from tempfile import TemporaryDirectory
from PIL import Image
from playwright.sync_api import sync_playwright
import os, subprocess, shutil

root=Path(__file__).resolve().parent
html=(root/'index.html').read_text(encoding='utf-8')
sizes=[(320,700),(375,812),(390,844),(430,932),(768,1024),(1024,768)]
with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,executable_path=os.getenv('CHROMIUM','/usr/bin/chromium'),args=['--no-sandbox','--disable-dev-shm-usage'])
  try:
    with TemporaryDirectory() as td:
      a=Path(td)/'a.png'; b=Path(td)/'b.png'
      Image.new('RGB',(301,191),(80,120,160)).save(a)
      Image.new('RGB',(312,211),(120,60,30)).save(b)
      for w,h in sizes:
        page=browser.new_page(viewport={'width':w,'height':h},accept_downloads=True)
        errors=[]
        page.on('pageerror',lambda err:errors.append(str(err)))
        page.set_content(html,wait_until='load')
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        assert page.locator('#undoEdit').is_disabled()
        page.locator('#file').set_input_files(str(a))
        page.wait_for_function("window.__AURA_CHECK__().activeName==='a.png'")
        page.locator('#advancedBtn').click()
        control=page.locator('#toolValue')
        control.fill('17');control.fill('21')
        assert page.evaluate('window.__AURA_CHECK__().undoCount')==2
        page.locator('#undoEdit').click()
        assert page.evaluate('window.__AURA_CHECK__().settings.light')==17
        page.locator('#redoEdit').click()
        assert page.evaluate('window.__AURA_CHECK__().settings.light')==21
        dial=page.locator('#precisionDial');dial.focus();page.keyboard.press('ArrowUp')
        assert page.evaluate('window.__AURA_CHECK__().undoCount')==3
        r=dial.bounding_box();x=r['x']+r['width']/2;y=r['y']+r['height']/2
        page.mouse.move(x,y);page.mouse.down();page.mouse.move(x,y-22,steps=8);page.mouse.up()
        assert page.evaluate('window.__AURA_CHECK__().undoCount')==4
        target=page.evaluate('window.__AURA_CHECK__().settings.light')
        page.locator('#resetCorrection').click()
        assert page.evaluate('window.__AURA_CHECK__().settings.light')==0
        page.locator('#undoEdit').click()
        assert page.evaluate('window.__AURA_CHECK__().settings.light')==target
        page.locator('#closeAdvanced').click()
        page.locator('[data-format="max"]').click()
        with page.expect_download() as download:page.locator('#save').click()
        saved=Path(td)/f'{w}.png';download.value.save_as(str(saved))
        image=Image.open(saved)
        assert image.size==(301,191)
        assert image.getpixel((50,50))!=(80,120,160)
        page.locator('#file').set_input_files(str(b))
        page.wait_for_function("window.__AURA_CHECK__().activeName==='b.png'")
        assert page.evaluate('window.__AURA_CHECK__().undoCount')==0
        page.locator('#advancedBtn').click()
        page.locator('#toolValue').fill('9')
        page.locator('#navProjects').click()
        page.locator('.project-entry',has_text='a.png').click()
        page.wait_for_function("window.__AURA_CHECK__().activeName==='a.png'")
        assert page.evaluate('window.__AURA_CHECK__().undoCount')==4
        page.locator('#advancedBtn').click()
        page.locator('#undoEdit').click()
        assert page.evaluate('window.__AURA_CHECK__().settings.light')==22
        page.keyboard.press('Control+Shift+z')
        assert page.evaluate('window.__AURA_CHECK__().settings.light')==target
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        assert not errors,(w,errors)
        print('PASS',w,h,'photo/history/project/PNG')
        page.close()
      if shutil.which('ffmpeg'):
        video=Path(td)/'clip.mp4'
        subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-f','lavfi','-i','testsrc=size=160x90:rate=15','-t','2','-c:v','libx264','-pix_fmt','yuv420p',str(video)],check=True)
        page=browser.new_page(viewport={'width':390,'height':844})
        page.set_content(html,wait_until='load')
        page.locator('#file').set_input_files(str(video))
        page.wait_for_function("document.getElementById('beforeVideo').readyState>=1")
        page.locator('#advancedBtn').click()
        page.locator('#toolValue').fill('0.5')
        assert page.locator('#beforeVideo').evaluate('(v)=>v.playbackRate')==0.5
        page.locator('#undoEdit').click()
        assert page.locator('#beforeVideo').evaluate('(v)=>v.playbackRate')==1
        page.locator('#redoEdit').click()
        assert page.locator('#beforeVideo').evaluate('(v)=>v.playbackRate')==0.5
        assert page.locator('#save').is_disabled()
        print('PASS video speed-only / no video export')
        page.close()
      else:print('SKIP video: ffmpeg unavailable')
  finally:browser.close()
