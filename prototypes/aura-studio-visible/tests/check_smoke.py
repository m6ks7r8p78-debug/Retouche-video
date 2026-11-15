"""Chromium smoke test for the autonomous AURA Studio prototype.
Requires: playwright, Pillow, Chromium; ffmpeg/libx264 for the video scenario.
Run: python tests/check_smoke.py
"""
from pathlib import Path
from tempfile import TemporaryDirectory
import os, shutil, subprocess
from PIL import Image
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
HTML=(ROOT/"index.html").read_text(encoding="utf-8")
SIZES=[(320,700),(375,812),(390,844),(430,932),(768,1024),(1024,768)]
with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,executable_path=os.getenv("CHROMIUM","/usr/bin/chromium"),args=["--no-sandbox","--disable-dev-shm-usage"])
  try:
    with TemporaryDirectory() as td:
      test_image=Path(td)/"test_photo.png"
      Image.new("RGB",(300,170),(70,100,170)).save(test_image)
      for width,height in SIZES:
        page=browser.new_page(viewport={"width":width,"height":height},accept_downloads=True)
        errors=[]
        page.on("pageerror",lambda e:errors.append(str(e)))
        page.set_content(HTML,wait_until="load")
        assert page.locator("#mediaStage").is_visible()
        assert page.evaluate("document.documentElement.scrollWidth<=innerWidth"),width
        page.locator("#fileInput").set_input_files(str(test_image))
        page.wait_for_function("window.__AURA_DIAGNOSTIC__().media==='image' && window.__AURA_DIAGNOSTIC__().processed")
        page.locator("#compareView").focus()
        page.keyboard.press("ArrowRight")
        assert page.locator("#compareView").get_attribute("aria-valuenow")=="55"
        page.locator("#advancedKey").click()
        assert page.locator("#advancedPanel").is_visible()
        page.locator('[data-tool="brightness"]').click()
        page.locator("#toolSlider").fill("130")
        page.locator("#advancedClose").click()
        page.locator('[data-format="max"]').click()
        with page.expect_download() as dl:
          page.locator("#saveAction").click()
        dest=Path(td)/f"{width}.png"
        dl.value.save_as(str(dest))
        result=Image.open(dest)
        assert result.size==(300,170)
        assert result.getpixel((20,20))!=(70,100,170)
        page.locator('[data-format="x"]').click()
        with page.expect_download() as dl:
          page.locator("#saveAction").click()
        assert dl.value.suggested_filename.endswith(".jpg")
        page.locator("#settingsOpen").click()
        page.locator("#prefMotion").check()
        assert page.evaluate("document.body.classList.contains('motion-off')")
        page.locator("#settingsClose").click()
        assert not errors,errors
        print("PASS",width,height)
        page.close()
      if shutil.which("ffmpeg"):
        synthetic=Path(td)/"synthetic.mp4"
        subprocess.run(["ffmpeg","-hide_banner","-loglevel","error","-y","-f","lavfi","-i","testsrc=size=320x180:rate=30","-t","2","-c:v","libx264","-pix_fmt","yuv420p",str(synthetic)],check=True)
        page=browser.new_page(viewport={"width":390,"height":844})
        page.set_content(HTML,wait_until="load")
        page.locator("#fileInput").set_input_files(str(synthetic))
        page.wait_for_function("document.getElementById('beforeVideo').readyState>=1")
        assert page.locator("#saveAction").is_disabled()
        page.locator("#advancedKey").click()
        page.locator("#toolSlider").fill("0.5")
        assert page.locator("#beforeVideo").evaluate("(v)=>v.playbackRate")==0.5
        page.locator("#playButton").click()
        print("PASS video H.264 et ralenti sans export")
        page.close()
      else:print("SKIP video: FFmpeg absent")
  finally:browser.close()
