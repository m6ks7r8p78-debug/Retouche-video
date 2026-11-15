"""Chromium smoke/regression checks for La Pièce. Requires playwright and Pillow.
Run: python tests/check.py. No network; direct file navigation may be blocked,
so the REAL index.html bytes are injected with set_content.
"""
from pathlib import Path
from PIL import Image
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[1]
html = (root / "index.html").read_text(encoding="utf-8")
sizes = [(320,700),(375,812),(390,844),(430,932),(768,1024),(1024,768)]
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path="/usr/bin/chromium", args=["--no-sandbox","--disable-dev-shm-usage"])
    try:
        for w,h in sizes:
            page=browser.new_page(viewport={"width":w,"height":h},accept_downloads=True)
            errors=[]
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.set_content(html,wait_until="load")
            assert page.locator("#homeBefore").evaluate("(i)=>i.complete&&i.naturalWidth>0")
            assert page.evaluate("document.documentElement.scrollWidth<=innerWidth"),f"Accueil déborde en {w}"
            frame=page.locator("#homeFrame")
            frame.focus()
            frame.press("ArrowRight")
            assert frame.get_attribute("aria-valuenow")=="56"
            page.locator('[data-go="studio"]').click()
            assert page.locator("#studio").is_visible()
            assert page.evaluate("document.documentElement.scrollWidth<=innerWidth"),f"Atelier déborde en {w}"
            page.locator('[data-mode="light"]').click()
            assert "brightness(1.12)" in page.locator("#studioAfter").evaluate("(e)=>e.style.filter")
            dial=page.locator("#exposureDial")
            dial.focus()
            page.keyboard.press("ArrowUp")
            assert dial.get_attribute("aria-valuenow")=="1"
            page.locator("#fineTune summary").click()
            page.locator("#exposure").fill("15")
            assert page.locator("#exposureOut").text_content()=="+15"
            page.locator("#resetSettings").click()
            assert dial.get_attribute("aria-valuenow")=="0"
            page.locator("#exportOpen").click()
            page.locator("#exportClose").focus()
            page.keyboard.press("Shift+Tab")
            assert page.locator('[data-export="x"]').evaluate("(e)=>document.activeElement===e")
            with page.expect_download() as dl:
                page.locator('[data-export="max"]').click()
            assert dl.value.suggested_filename.endswith(".png")
            page.locator("#settingsOpen").click()
            page.locator("#largeText").click()
            page.locator("#reducedMotion").click()
            assert page.locator("#largeText").get_attribute("aria-checked")=="true"
            assert page.locator("#reducedMotion").get_attribute("aria-checked")=="true"
            assert not errors,(w,errors)
            print("PASS",w,h)
            page.close()
        page=browser.new_page(viewport={"width":390,"height":844},accept_downloads=True)
        page.set_content(html,wait_until="load")
        import tempfile
        with tempfile.TemporaryDirectory() as td:
            sample=Path(td)/"source.jpg"
            Image.new("RGB",(300,170),(120,78,50)).save(sample)
            page.locator("#fileInput").set_input_files(str(sample))
            page.locator("#studio").wait_for(state="visible",timeout=5000)
            assert "300 × 170" in page.locator("#mediaInfo").text_content()
            page.locator('[data-mode="light"]').click()
            page.locator("#exportOpen").click()
            with page.expect_download() as dl:
                page.locator('[data-export="x"]').click()
            target=Path(td)/"x.jpg"
            dl.value.save_as(str(target))
            image=Image.open(target)
            assert image.size==(300,170)
            assert image.getpixel((150,85)) != (120,78,50)
            page.locator('[data-go="projects"]').click()
            assert "source.jpg" in page.locator("#projectTitle").text_content()
        print("PASS import photo, export JPEG Pour X, projets en session")
        page.close()
    finally:
        browser.close()
