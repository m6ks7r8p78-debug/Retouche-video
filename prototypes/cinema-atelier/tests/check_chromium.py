from pathlib import Path
import os, tempfile
from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parents[1]
html = (HERE / "index.html").read_text(encoding="utf-8")
sizes = [(320,700),(375,812),(390,844),(430,932),(768,1024),(1024,768)]
with sync_playwright() as p:
    browser = p.chromium.launch(
        executable_path=os.environ.get("CHROMIUM","/usr/bin/chromium"),
        args=["--no-sandbox","--disable-dev-shm-usage"],
        headless=True)
    try:
        for width,height in sizes:
            page=browser.new_page(viewport={"width":width,"height":height},accept_downloads=True)
            errors=[]
            page.on("pageerror", lambda err: errors.append(str(err)))
            page.set_content(html,wait_until="load")
            assert not page.evaluate("document.documentElement.scrollWidth > innerWidth"), f"overflow {width}"
            cta=page.locator("#importHero").bounding_box()
            nav=page.locator(".nav").bounding_box()
            if width < 600: assert cta["y"]+cta["height"] < nav["y"], f"CTA hidden {width}"
            page.locator('[data-screen="studio"]').last.click()
            assert page.locator("#processed").evaluate("(c)=>c.width>0 && c.height>0")
            page.locator("#compare").focus()
            page.keyboard.press("ArrowLeft")
            assert page.locator("#compare").get_attribute("aria-valuenow") == "45"
            page.locator("#openExport").click()
            with page.expect_download() as dl: page.locator('[data-export="png"]').click()
            assert dl.value.suggested_filename.endswith(".png")
            assert not errors, errors
            print("PASS",width,height)
            page.close()
    finally:
        browser.close()
