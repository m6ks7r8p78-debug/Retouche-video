"""AURA UX smoke tests. Requires: playwright, Pillow, Chromium; optional FFmpeg.
Run: python prototypes/aura-reference-fidele/check_ux.py
"""
from pathlib import Path
from tempfile import TemporaryDirectory
from PIL import Image
from playwright.sync_api import sync_playwright
import os, shutil, subprocess

root=Path(__file__).resolve().parent
html=(root/"index.html").read_text(encoding="utf-8")
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path=os.getenv("CHROMIUM","/usr/bin/chromium"),args=["--no-sandbox","--disable-dev-shm-usage"])
    try:
        with TemporaryDirectory() as tmp:
            source=Path(tmp)/"source.png"
            other=Path(tmp)/"other.png"
            Image.new("RGB",(301,191),(90,110,145)).save(source)
            Image.new("RGB",(312,211),(50,90,120)).save(other)
            for w,h in [(320,700),(375,812),(390,844),(430,932),(768,1024),(1024,768)]:
                page=browser.new_page(viewport={"width":w,"height":h},accept_downloads=True)
                errors=[]
                page.on("pageerror",lambda err:errors.append(str(err)))
                page.set_content(html,wait_until="load")
                page.wait_for_function("document.getElementById('beforePhoto').naturalWidth>0")
                assert page.evaluate("document.documentElement.scrollWidth<=innerWidth"),"horizontal overflow"
                page.locator("#file").set_input_files(str(source))
                page.wait_for_function("window.__AURA_CHECK__().kind==='image'")
                assert "Original intact" in page.locator("#subtitle").inner_text()
                assert page.locator("#afterPhoto").evaluate("(e)=>getComputedStyle(e).filter")=="brightness(1) contrast(1) saturate(1)"
                page.locator("#compare").focus()
                page.keyboard.press("ArrowRight")
                assert page.locator("#compare").get_attribute("aria-valuenow")=="55"
                page.locator("#advancedBtn").click()
                page.locator("#precisionDial").focus()
                page.keyboard.press("ArrowUp")
                assert page.evaluate("window.__AURA_CHECK__().settings.light")==1
                page.locator("#toolValue").fill("25")
                page.locator("#resetCorrection").click()
                assert page.evaluate("window.__AURA_CHECK__().settings.light")==0
                page.locator("#toolValue").fill("14")
                page.locator("#closeAdvanced").click()
                page.locator('[data-format="max"]').click()
                with page.expect_download() as download:
                    page.locator("#save").click()
                out=Path(tmp)/f"{w}.png"
                download.value.save_as(str(out))
                img=Image.open(out)
                assert img.size==(301,191)
                assert img.getpixel((100,100))!=(90,110,145)
                page.locator("#file").set_input_files(str(other))
                page.wait_for_function("window.__AURA_CHECK__().activeName==='other.png'")
                page.locator("#navProjects").click()
                assert page.locator(".project-entry").count()==2
                page.locator(".project-entry",has_text="source.png").click()
                page.wait_for_function("window.__AURA_CHECK__().activeName==='source.png'")
                assert page.evaluate("window.__AURA_CHECK__().settings.light")==14
                assert page.locator("#navHome").get_attribute("aria-current")=="page"
                assert page.locator("#navProjects").get_attribute("aria-current") is None
                assert not errors,errors
                print("PASS",w,h,"import/export/compare/reset/session")
                page.close()
            if shutil.which("ffmpeg"):
                video=Path(tmp)/"clip.mp4"
                subprocess.run(["ffmpeg","-hide_banner","-loglevel","error","-y","-f","lavfi","-i","testsrc=size=320x180:rate=24","-t","2","-c:v","libx264","-pix_fmt","yuv420p",str(video)],check=True)
                page=browser.new_page(viewport={"width":390,"height":844})
                page.set_content(html,wait_until="load")
                page.locator("#file").set_input_files(str(video))
                page.wait_for_function("document.getElementById('beforeVideo').readyState>=1")
                assert page.locator("#save").is_disabled()
                assert page.locator("#afterVideo").evaluate("(v)=>getComputedStyle(v).filter")=="none"
                page.locator("#advancedBtn").click()
                page.locator("#toolValue").fill("0.5")
                assert page.locator("#beforeVideo").evaluate("(v)=>v.playbackRate")==0.5
                page.locator("#resetCorrection").click()
                assert page.locator("#beforeVideo").evaluate("(v)=>v.playbackRate")==1
                print("PASS video H264 playback-speed-only")
                page.close()
            else:
                print("SKIP synthetic H264 check: FFmpeg unavailable")
    finally:
        browser.close()
