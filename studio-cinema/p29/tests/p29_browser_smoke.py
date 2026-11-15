"""P29 offline Chromium/WebKit Linux interactive UX smoke on exclusively synthetic data.

No personal media, no external web requests, no app state or production hosting.
The browsers are desktop Linux engines, not physical iPhone Safari.
"""
from __future__ import annotations
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import shutil
import tempfile
import threading


class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass


def test_engine(kind, origin, directory):
    name=kind.name
    browser=None
    errors=[]
    external=[]
    cases=[]
    try:
        browser=kind.launch(headless=True)
        for width,height in [(390,844),(320,700)]:
            ctx=browser.new_context(viewport={"width":width,"height":height},
              is_mobile=True,has_touch=True)
            page=ctx.new_page()
            page.on("pageerror",lambda error:errors.append(str(error)))
            page.on("request",lambda req:external.append(req.url) if
              req.url.startswith(("https://","http://")) and not
              req.url.startswith(origin) else None)
            resp=page.goto(origin+"/valid/index.html",wait_until="load",timeout=20000)
            if not resp or resp.status!=200:
                raise AssertionError("Local synthetic preview failed to load")
            s=page.locator("#status").inner_text()
            if "Mesures de laboratoire vérifiées" not in s:
                raise AssertionError("Verified synthetic proof not visible")
            if not page.locator("#report").is_visible():
                raise AssertionError("No generated synthetic report shown")
            if page.locator("#color-count").inner_text()!="9 / 9" or \
               page.locator("#size-count").inner_text()!="3 / 9":
                raise AssertionError("Actual P26 facts not shown")
            if not page.get_by_text("Aucune de vos vidéos n'a été analysée.",exact=False).count():
                raise AssertionError("Personal video caveat missing")
            if page.locator("input,form,video,a[download]").count():
                raise AssertionError("Unsafe media or export interface introduced")
            button=page.locator("#details-button")
            if not button.is_visible() or button.is_disabled():
                raise AssertionError("Accessible details button unavailable")
            if button.get_attribute("aria-expanded")!="false":
                raise AssertionError("Details initially expanded without consent")
            if page.locator("#details").is_visible():
                raise AssertionError("Advanced details should be hidden by default")
            button.click()
            if button.get_attribute("aria-expanded")!="true" or not page.locator("#details").is_visible():
                raise AssertionError("Disclosure did not open with click")
            button.click()
            if button.get_attribute("aria-expanded")!="false" or page.locator("#details").is_visible():
                raise AssertionError("Disclosure did not close")
            overflow=page.evaluate("document.documentElement.scrollWidth > window.innerWidth + 1")
            if overflow:
                raise AssertionError("Content overflow at mobile viewport "+str(width))
            page.screenshot(path=str(Path(directory)/(name+f"_{width}x{height}_synthetic.png")),
                            full_page=True)
            cases.append({"viewport":f"{width}x{height}",
               "synthetic_counts_visible":True,"explicit_disclosure_works":True,
               "horizontal_overflow":False,"no_video_import_or_export_controls":True})
            ctx.close()
        context=browser.new_context(viewport={"width":390,"height":844},
                                     is_mobile=True,has_touch=True)
        page=context.new_page()
        page.on("pageerror",lambda error:errors.append(str(error)))
        page.on("request",lambda req:external.append(req.url) if
          req.url.startswith(("https://","http://")) and not req.url.startswith(origin) else None)
        page.goto(origin+"/corrupted/index.html",wait_until="load",timeout=20000)
        if "Diagnostic indisponible" not in page.locator("#status").inner_text():
            raise AssertionError("Corrupted evidence not rejected")
        if page.locator("#report").is_visible() or not page.locator("#details-button").is_disabled():
            raise AssertionError("Rejected proof did not fail closed")
        context.close()
        if errors or external:
            raise AssertionError("Browser error or external request: "+repr(errors+external))
        return {"engine":name,"result":"synthetic_mobile_interaction_pass",
           "viewports":cases,"corrupt_evidence_refused":True,
           "javascript_error_count":0,"external_request_count":0,
           "physical_safari_iphone_tested":False}
    finally:
        if browser is not None:browser.close()


def run(generated,out):
    generated=Path(generated)
    for file in ("index.html","preview.css","preview.js","preview-data.js"):
        if not (generated/file).is_file():
            raise FileNotFoundError("Missing generated P29 preview "+file)
    out=Path(out)
    out.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="p29-browser-local-") as tmp:
        root=Path(tmp)
        for kind in ("valid","corrupted"):
            target=root/kind
            target.mkdir()
            for name in ("index.html","preview.css","preview.js","preview-data.js"):
                shutil.copy2(generated/name,target/name)
        # Inject invalid data in browser-only *test* copy. Not a production feature.
        (root/"corrupted"/"preview-data.js").write_text(
         '"use strict";window.CINEMA_P29_SYNTHETIC={schema:"forged"};\n',
         encoding="utf-8")
        handler=partial(Quiet,directory=str(root))
        server=ThreadingHTTPServer(("127.0.0.1",0),handler)
        thread=threading.Thread(target=server.serve_forever,daemon=True)
        thread.start()
        origin="http://127.0.0.1:"+str(server.server_address[1])
        try:
            from playwright.sync_api import sync_playwright
            with sync_playwright() as playwright:
                results=[test_engine(engine,origin,out)
                    for engine in (playwright.chromium,playwright.webkit)]
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=5)
    report={
      "schema":"retouche-cinema-p29-linux-mobile-ux-test-v1",
      "status":"synthetic_browser_layout_and_interaction_measured",
      "results":results,
      "tests_exercised":2*3,
      "no_user_media":True,"no_external_requests":True,
      "no_actual_iphone_safari_test":True,
      "no_production_deployment":True,
    }
    (out/"p29_browser_report.json").write_text(json.dumps(report,indent=2),
                                                  encoding="utf-8")
    return report


def main():
    p=argparse.ArgumentParser()
    p.add_argument("--preview",required=True,type=Path)
    p.add_argument("--out",required=True,type=Path)
    args=p.parse_args()
    report=run(args.preview,args.out)
    print(json.dumps(report,indent=2))


if __name__=="__main__":
    main()
