"""P24 Chromium/WebKit *Linux desktop engines* playback test, not Safari iPhone.

Serves only a SYNTHETIC P23 MP4 and a standalone, non-production HTML fixture
on localhost. Reads no user videos. Never modifies the PWA or deployed website.
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

MOVIE="P23_temporal_blend_synthetic_60fps.mp4"
HTML=Path(__file__).resolve().parents[1]/"preview"/"index.html"


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass


def metadata(page):
    return page.evaluate("""() => {
        const v=document.querySelector('video');
        return {
          readyState:v.readyState, width:v.videoWidth, height:v.videoHeight,
          duration:Number.isFinite(v.duration)?v.duration:null,
          error:v.error?v.error.code:null,
          currentTime:v.currentTime,
          canPlayType:v.canPlayType('video/mp4; codecs="avc1.42E01E, mp4a.40.2"')
        };
    }""")


def check_browser(browser_type,origin,output_dir):
    name=browser_type.name
    errors=[]
    external=[]
    result={"browser_engine":name,"status":"unverified","playback_confirmed":False,
            "safari_on_physical_iphone":False,"media_type":"fictional_synthetic_only"}
    browser=None
    try:
        browser=browser_type.launch(headless=True)
        context=browser.new_context(viewport={"width":390,"height":844},is_mobile=True,has_touch=True)
        page=context.new_page()
        page.on("pageerror",lambda error:errors.append(str(error)))
        page.on("request",lambda req:external.append(req.url)
                if req.url.startswith(("http://","https://")) and not req.url.startswith(origin)
                else None)
        response=page.goto(origin+"/index.html",wait_until="domcontentloaded",timeout=18000)
        if response is None or response.status!=200:
            raise AssertionError("Synthetic offline player did not load")
        if page.locator("video").count()!=1 or page.locator("button#play").count()!=1:
            raise AssertionError("Accessible playback controls missing")
        if not page.locator("button#play").is_visible():
            raise AssertionError("Video play button not visible on 390px viewport")
        page.wait_for_function("""() => {
          const v=document.querySelector('video');
          return v.readyState>=1 || v.error!==null;
        }""",timeout=12000)
        m=metadata(page)
        if m["error"] is None and m["readyState"]>=1:
            if m["width"]!=720 or m["height"]!=720 or m["duration"] is None or abs(m["duration"]-8)>0.12:
                raise AssertionError("Decoded metadata inconsistent with 720x720/8s source")
            page.locator("button#play").click(timeout=8000)
            try:
                page.wait_for_function("""() => {
                  const v=document.querySelector('video');
                  return v.currentTime > .18 && v.readyState >= 2;
                }""",timeout=12000)
                result["status"]="browser_played_synthetic_video"
                result["playback_confirmed"]=True
            except Exception:
                after=metadata(page)
                if after["error"] is not None or page.locator("#state").inner_text().startswith("Lecture indisponible"):
                    result["status"]="codec_or_playback_safely_refused"
                else:
                    result["status"]="playback_unverified_timed_out"
        else:
            result["status"]="codec_or_playback_safely_refused"
        last=metadata(page)
        result["reported_frame_size"]=[last["width"],last["height"]]
        result["reported_duration_s"]=last["duration"]
        result["can_play_type"]=last["canPlayType"]
        result["video_error_code"]=last["error"]
        page.screenshot(path=str(Path(output_dir)/(name+"_390x844_synthetic.png")),full_page=True)
        context.close()
    except Exception as exc:
        result["status"]="browser_test_failed"
        result["failure_type"]=type(exc).__name__
        result["failure_summary"]=str(exc)[:250]
    finally:
        if browser is not None:
            browser.close()
    result["javascript_error_count"]=len(errors)
    result["external_request_count"]=len(external)
    result["no_external_browser_requests"]=len(external)==0
    if errors or external:
        result["status"]="browser_test_failed"
    return result


def run(movie,out):
    movie=Path(movie)
    if movie.name!=MOVIE or not movie.is_file() or movie.stat().st_size<10000:
        raise ValueError("Only P23 generated synthetic video is allowed for browser test")
    if not HTML.is_file():
        raise FileNotFoundError("Synthetic isolated playback HTML is missing")
    out=Path(out)
    out.mkdir(parents=True,exist_ok=True)
    from playwright.sync_api import sync_playwright
    with tempfile.TemporaryDirectory(prefix="p24-local-browser-") as tmp:
        root=Path(tmp)
        shutil.copy2(HTML,root/"index.html")
        shutil.copy2(movie,root/MOVIE)
        handler=partial(QuietHandler,directory=str(root))
        server=ThreadingHTTPServer(("127.0.0.1",0),handler)
        thread=threading.Thread(target=server.serve_forever,daemon=True)
        thread.start()
        origin="http://127.0.0.1:"+str(server.server_address[1])
        try:
            with sync_playwright() as browser:
                results=[check_browser(t,origin,out) for t in (browser.chromium,browser.webkit)]
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=5)
    report={
        "schema":"retouche-cinema-p24-browser-linux-smoke-v1",
        "mode":"isolated_localhost_no_deployment",
        "results":results,
        "chromium_playback_confirmed":results[0]["playback_confirmed"],
        "webkit_playback_confirmed":results[1]["playback_confirmed"],
        "webkit_codec_refusal_does_not_mean_safari_failure":True,
        "physical_iphone_safari_tested":False,
        "user_media_used":False,
        "remote_requests_count":sum(x["external_request_count"] for x in results),
        "browser_screenshot_not_realism_certification":True}
    (out/"p24_browser_linux_report.json").write_text(json.dumps(report,indent=2),encoding="utf-8")
    return report


def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--movie",required=True,type=Path)
    ap.add_argument("--out",required=True,type=Path)
    a=ap.parse_args()
    report=run(a.movie,a.out)
    print(json.dumps(report,indent=2))
    for v in report["results"]:
        if v["status"] in ("browser_test_failed","playback_unverified_timed_out"):
            raise SystemExit(v["browser_engine"]+" browser smoke failed: "+v["status"])
    if report["remote_requests_count"]:
        raise SystemExit("Unexpected network access")
    if not report["chromium_playback_confirmed"] and not report["webkit_playback_confirmed"]:
        raise SystemExit("No browser engine verified video playback; refuse to certify browser playback")


if __name__=="__main__":
    main()
