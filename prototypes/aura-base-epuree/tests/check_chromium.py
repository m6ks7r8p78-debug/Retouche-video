from pathlib import Path
from playwright.sync_api import sync_playwright

html = (Path(__file__).resolve().parents[1] / "index.html").read_text(encoding="utf-8")
with sync_playwright() as p:
    b = p.chromium.launch(headless=True, executable_path="/usr/bin/chromium", args=["--no-sandbox", "--disable-dev-shm-usage"])
    try:
        for w,h in [(320,700),(375,812),(390,844),(430,932),(768,1024),(1024,768)]:
            page = b.new_page(viewport={"width":w,"height":h}, accept_downloads=True)
            errors=[]
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.set_content(html,wait_until="load")
            page.wait_for_function("document.querySelector('#beforeImage').naturalWidth > 0")
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"),f"overflow home {w}"
            page.locator('[data-go="studio"]').click()
            assert page.locator("#studio").is_visible()
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"),f"overflow studio {w}"
            page.locator("#compare").focus()
            page.keyboard.press("ArrowRight")
            assert page.locator("#compare").get_attribute("aria-valuenow") == "55"
            page.locator("#studioFine").click()
            assert page.locator("#fineOverlay").get_attribute("data-open") == "true"
            page.locator("#intensity").fill("40")
            assert page.locator("#intensityOut").text_content() == "40 %"
            page.locator("#closeFine").click()
            page.locator("#saveStudio").click()
            with page.expect_download() as download: page.locator('[data-export="maximum"]').click()
            assert download.value.suggested_filename.endswith(".png")
            page.locator('[data-go="preferences"]').click()
            page.locator("#largeText").check()
            page.locator("#reduceMotion").check()
            assert page.evaluate("document.body.classList.contains('large-text')")
            assert page.evaluate("document.body.classList.contains('no-motion')")
            assert not errors,(w,errors)
            print("PASS", w,h)
            page.close()
    finally:
        b.close()
