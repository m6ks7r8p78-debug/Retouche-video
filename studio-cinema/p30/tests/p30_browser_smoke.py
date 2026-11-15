"""P30 synthetic interactive iPhone-manual test UX in Chromium/WebKit Linux only.

Tests actual local ZIP extraction with a local-only HTTP server (no external
hosting). CSS viewports do NOT constitute an actual physical Safari test.
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
from zipfile import ZipFile


class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,fmt,*args):
        return


VIEWPORTS=((430,932),(390,844),(320,700))


def exercise(browser_type,url,out):
    results=[]
    page_errors=[]
    external=[]
    browser=browser_type.launch(headless=True)
    try:
        for width,height in VIEWPORTS:
            context=browser.new_context(
                viewport={"width":width,"height":height},is_mobile=True,
                has_touch=True,accept_downloads=True)
            page=context.new_page()
            page.on("pageerror",lambda x:page_errors.append(str(x)))
            page.on("request",lambda req:external.append(req.url) if
                req.url.startswith(("https://","http://")) and
                not req.url.startswith(url) else None)
            response=page.goto(url+"/index.html",wait_until="load",timeout=20000)
            if response is None or response.status!=200:
                raise AssertionError("P30 landing failed to load")
            if page.locator("#color-count").inner_text()!="9 / 9" or \
               page.locator("#size-count").inner_text()!="3 / 9":
                raise AssertionError("P30 synthetic fidelity figures missing")
            link=page.get_by_role("link",name="Vérifier sur mon iPhone — test manuel")
            if not link.is_visible():
                raise AssertionError("Manual-check link not accessible")
            page.locator("#details-button").click()
            if not page.locator("#details").is_visible():
                raise AssertionError("Original P29 explanation action broken")
            page.locator("#details-button").click()
            if page.locator("#details").is_visible():
                raise AssertionError("Original P29 explanation did not close")
            link.click()
            page.wait_for_url("**/test-iphone.html",timeout=10000)
            if not page.get_by_text("Aucun rapport créé.").is_visible():
                raise AssertionError("Manual report must not be generated automatically")
            if page.locator("#report-area").is_visible():
                raise AssertionError("Private report appeared without user gesture")
            if page.locator("input[type=file],video,form").count():
                raise AssertionError("P30 requested media input")
            # No claim of independently verified iPhone; test exercises self-report.
            page.locator("#confirm-safari").check()
            page.locator("#confirm-readable").check()
            page.locator("#confirm-disclosure").check()
            page.locator("#run-check").click()
            if not page.locator("#report-area").is_visible():
                raise AssertionError("User-visible JSON report absent")
            doc=json.loads(page.locator("#report-json").input_value())
            if doc["schema"]!="retouche-cinema-p30-manual-iphone-report-v1":
                raise AssertionError("Manual report schema wrong")
            if doc["status"]!="manual_feedback_unverified":
                raise AssertionError("Report incorrectly certified")
            if not doc["voluntary_self_report"]["reported_physical_iphone_safari"]:
                raise AssertionError("Explicit self-report did not persist")
            if doc["conclusions"]["physical_iphone_safari_verified_by_laboratory"]:
                raise AssertionError("Linux test claims independent physical test")
            if doc["conclusions"]["export_video_tested"] or doc["conclusions"]["real_person_media_tested"]:
                raise AssertionError("P30 claims real media processing")
            if doc["local_browser_check"]["layout_overflow_detected"]:
                raise AssertionError("Manual page overflows viewport")
            if doc["local_browser_check"]["viewport_category"] not in ("compact","mobile"):
                raise AssertionError("Wrong category for virtual mobile viewport")
            if doc["privacy"]["report_shared_automatically"] or \
               doc["privacy"]["user_agent_collected"] or \
               doc["privacy"]["media_file_accessed"]:
                raise AssertionError("P30 private media risk")
            if "http://" in json.dumps(doc) or "127.0.0.1" in json.dumps(doc):
                raise AssertionError("Network address leaked into exported report")
            # Local blob download only; never transfer the report to a server.
            with page.expect_download(timeout=10000) as down:
                page.locator("#save-report").click()
            download=down.value
            if download.suggested_filename!="Cinema_P30_rapport_manuel.json":
                raise AssertionError("Unexpected saved filename")
            with tempfile.TemporaryDirectory(prefix="p30-downloaded-report-") as folder:
                file=Path(folder)/download.suggested_filename
                download.save_as(file)
                saved=json.loads(file.read_text(encoding="utf-8"))
                if saved!=doc:
                    raise AssertionError("Saved local report differs from text field")
            page.screenshot(path=str(out/f"{browser_type.name}_{width}x{height}_manual.png"),
                             full_page=True)
            if page.evaluate("document.documentElement.scrollWidth > window.innerWidth + 1"):
                raise AssertionError("P30 full page has horizontal overflow")
            results.append({"viewport":f"{width}x{height}","manual_checklist_tappable":True,
                "report_unverified_level_correct":True,"local_json_download_works":True,
                "no_horizontal_overflow":True,"generated_media_upload":False})
            context.close()
        context=browser.new_context(viewport={"width":390,"height":844},
                                     is_mobile=True,has_touch=True)
        page=context.new_page()
        page.on("pageerror",lambda x:page_errors.append(str(x)))
        page.on("request",lambda req:external.append(req.url) if
            req.url.startswith(("http://","https://")) and not req.url.startswith(url)
            else None)
        page.goto(url+"/corrupted/test-iphone.html",wait_until="load",timeout=20000)
        page.locator("#run-check").click()
        doc=json.loads(page.locator("#report-json").input_value())
        if doc["evidence_loaded"] is not False or \
           doc["conclusions"]["local_layout_check_passed"] is not False:
            raise AssertionError("Corrupted evidence incorrectly accepted")
        if doc["conclusions"]["physical_iphone_safari_verified_by_laboratory"]:
            raise AssertionError("Falsely certified physical Safari on invalid data")
        context.close()
        if page_errors or external:
            raise AssertionError("Browser errors or external requests: "+repr(page_errors+external))
        return {"engine":browser_type.name,"result":"offline_synthetic_manual_ui_pass",
           "viewports":results,"tampered_evidence_refused":True,
           "javascript_error_count":0,"external_request_count":0,
           "actual_iphone_safari_physically_tested":False}
    finally:
        browser.close()


def run(zip_file,out):
    from playwright.sync_api import sync_playwright
    out=Path(out)
    out.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="cinema-p30-browser-") as tmp:
        folder=Path(tmp)
        with ZipFile(zip_file) as archive:
            # ZIP entry validation prevents traversal/extra paths in the test.
            names=archive.namelist()
            if any("/" in name or "\\" in name or ".." in name for name in names):
                raise ValueError("P30 archive contains invalid path")
            if archive.testzip():
                raise ValueError("P30 corrupt ZIP")
            archive.extractall(folder)
        corrupt=folder/"corrupted"
        corrupt.mkdir()
        for name in ("test-iphone.html","iphone-check.css","preview.css","iphone-check.js"):
            shutil.copy2(folder/name,corrupt/name)
        (corrupt/"preview-data.js").write_text(
            '"use strict";window.CINEMA_P29_SYNTHETIC=Object.freeze({schema:"forged"});\n',
            encoding="utf-8")
        server=ThreadingHTTPServer(("127.0.0.1",0),
            partial(Quiet,directory=str(folder)))
        server_thread=threading.Thread(target=server.serve_forever,daemon=True)
        server_thread.start()
        url="http://127.0.0.1:"+str(server.server_address[1])
        try:
            with sync_playwright() as p:
                results=[exercise(kind,url,out) for kind in (p.chromium,p.webkit)]
        finally:
            server.shutdown()
            server.server_close()
            server_thread.join(timeout=5)
    report={
        "schema":"retouche-cinema-p30-browser-smoke-linux-v1",
        "status":"synthetic_manual_export_ux_tested_on_linux_engines",
        "number_of_engines":2,"number_of_valid_viewports":6,
        "tampered_evidence_test_cases":2,"results":results,
        "external_requests_observed":0,
        "actual_iphone_safari_physically_tested":False,
        "no_real_videos_used":True,
        "no_deployment":True,
    }
    (out/"p30_browser_report.json").write_text(json.dumps(report,indent=2),
                                                  encoding="utf-8")
    return report


def main():
    p=argparse.ArgumentParser()
    p.add_argument("--zip",required=True,type=Path)
    p.add_argument("--out",required=True,type=Path)
    a=p.parse_args()
    report=run(a.zip,a.out)
    print(json.dumps(report,indent=2))


if __name__=="__main__":
    main()
