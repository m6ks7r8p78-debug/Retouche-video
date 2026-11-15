"""AURA manual integration smoke test. pip install playwright pillow; python -m playwright install chromium
Run: python prototypes/aura-reference-fidele/check_manual_integration.py
Uses the actual HTML without network. The full native studio iframe is NOT validated here.
"""
from pathlib import Path
from tempfile import TemporaryDirectory
from PIL import Image
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parent
html=(root/"index.html").read_text(encoding="utf8")
with TemporaryDirectory() as td:
    sample=Path(td)/"source.png"
    Image.new("RGB",(400,300),(80,110,145)).save(sample)
    with sync_playwright() as p:
        b=p.chromium.launch(headless=True,args=["--no-sandbox","--disable-dev-shm-usage"])
        try:
            for width,height in [(320,700),(375,812),(390,844),(430,932),(768,1024),(1024,768)]:
                pg=b.new_page(viewport={"width":width,"height":height},accept_downloads=True)
                errors=[]
                pg.on("pageerror",lambda e:errors.append(str(e)))
                pg.set_content(html,wait_until="load")
                assert pg.evaluate("document.documentElement.scrollWidth<=innerWidth")
                pg.locator("#file").set_input_files(str(sample))
                pg.wait_for_function("window.__AURA_CHECK__().kind==='image'")
                pg.locator("#advancedBtn").click()
                pg.locator("#toolGroups button",has_text="Détails").click()
                pg.locator("#toolTabs button",has_text="Netteté").click()
                pg.locator("#toolValue").fill("40")
                assert pg.evaluate("window.__AURA_CHECK__().settings.sharp")==40
                pg.locator("#toolGroups button",has_text="Nuit").click()
                pg.locator("#toolValue").fill("40")
                assert pg.evaluate("window.__AURA_CHECK__().settings.night")==40
                pg.locator("#undoEdit").click()
                assert pg.evaluate("window.__AURA_CHECK__().settings.night")==0
                pg.locator("#toolGroups button",has_text="Sortie").click()
                pg.locator(".toolkit-choices button",has_text="Full HD").click()
                pg.locator("#closeAdvanced").click()
                pg.locator('[data-format="max"]').click()
                with pg.expect_download() as d:pg.locator("#save").click()
                out=Path(td)/f"out-{width}.png";d.value.save_as(str(out))
                im=Image.open(out)
                assert im.size==(1440,1080),(width,im.size)
                assert im.getpixel((15,15))!=(80,110,145)
                assert not errors,(width,errors)
                print("PASS",width,height)
                pg.close()
        finally:b.close()
