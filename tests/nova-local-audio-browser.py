"""NOVA local real-source AAC diagnostic UX on synthetic MP4, Linux Chromium only.

A generated H264/AAC MP4 is selected using the browser's file picker API.
Mocked native module tests UI wiring; actual module tests honest failure if
Linux lacks AAC WebCodecs. Never equate this with physical Safari on iPhone.
"""
from __future__ import annotations
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
import json
from pathlib import Path
import subprocess
import tempfile
import threading

class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*args):pass

MOCK_NATIVE="""
var NOVA_AAC_NATIVE={
 async planifier(file,{durationSeconds,signal}){
  if(!file||file.size<100||signal?.aborted||
      !(durationSeconds>0&&durationSeconds<=12.2))
   throw Error("Invalid fixture");
  const n=Math.ceil(durationSeconds*48000/1024);
  const packets=Array.from({length:n},(_,i)=>({
    bytes:new Uint8Array([1,2,3,4,5,6,7]),
    timestamp:Math.round(i*1024*1e6/48000),
    duration:Math.round(1024*1e6/48000)
  }));
  return {mode:"aac-native-encode",packets,sampleRate:48000,channels:2};
 }
};
"""
def clip(path):
    subprocess.run([
     "ffmpeg","-hide_banner","-loglevel","error","-y",
     "-f","lavfi","-i","color=c=blue:s=160x120:r=15:d=1.50",
     "-f","lavfi","-i","sine=frequency=440:duration=1.50:sample_rate=48000",
     "-c:v","libx264","-preset","ultrafast","-pix_fmt","yuv420p",
     "-c:a","aac","-b:a","96k","-ac","2","-t","1.50",
     "-movflags","+faststart",str(path)],check=True)
    assert path.stat().st_size>5000
def test_browser(engine,origin,path,out):
    browser=engine.launch(headless=True)
    cases=[]
    errors=[]
    external=[]
    try:
      for width,height in [(390,844),(320,700)]:
        ctx=browser.new_context(viewport={"width":width,"height":height},
          is_mobile=True,has_touch=True)
        page=ctx.new_page()
        page.route("**/experiences/nova-aac-native.js",
          lambda route:route.fulfill(status=200,content_type="application/javascript",
          body=MOCK_NATIVE))
        page.on("pageerror",lambda e:errors.append(str(e)))
        page.on("request",lambda r:external.append(r.url) if
          (r.url.startswith(("http://","https://")) and not r.url.startswith(origin)) else None)
        page.goto(origin+"/experiences/nova-local-audio-check/index.html",
          wait_until="load",timeout=20000)
        assert page.locator("#start").is_disabled()
        assert not page.locator("#result").is_visible()
        page.locator("#local-video").set_input_files(str(path))
        assert page.locator("#start").is_enabled()
        page.locator("#start").click()
        page.locator("#result").wait_for(state="visible",timeout=25000)
        report=json.loads(page.locator("#json").input_value())
        assert report["status"]=="local_source_aac_reencode_chunks_verified",report
        assert report["final_mp4_created"] is False
        assert report["source_media_uploaded"] is False
        assert report["audio_video_sync_verified"] is False
        assert report["aac_lc_reencoded_chunk_count"]>10
        assert path.name not in json.dumps(report)
        assert page.locator("#start").is_disabled()
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth+1")
        page.screenshot(path=str(out/f"nova-local-audio-{engine.name}-{width}x{height}-mock.png"),
           full_page=True)
        cases.append({"viewport":f"{width}x{height}",
          "synthetic_mp4_selected":True,"ui_mocked_audio_path_passed":True,
          "actual_native_aac_verified":False,"zero_external_requests":True,
          "no_horizontal_overflow":True})
        ctx.close()
      # Real Chromium audio fallback path. Its codec status is not a Safari result.
      ctx=browser.new_context(viewport={"width":390,"height":844},is_mobile=True,has_touch=True)
      page=ctx.new_page()
      page.on("pageerror",lambda e:errors.append(str(e)))
      page.on("request",lambda r:external.append(r.url) if
        (r.url.startswith(("http://","https://")) and not r.url.startswith(origin)) else None)
      page.goto(origin+"/experiences/nova-local-audio-check/index.html",
        wait_until="load",timeout=20000)
      page.locator("#local-video").set_input_files(str(path))
      page.locator("#start").click()
      page.locator("#result").wait_for(state="visible",timeout=30000)
      actual=json.loads(page.locator("#json").input_value())
      assert actual["schema"]=="retoucheproai.nova.local-audio-rescue-check.v1"
      assert actual["source_media_uploaded"] is False
      assert actual["final_mp4_created"] is False
      assert actual["status"] in (
       "source_audio_decode_unavailable","audio_video_duration_incompatible",
       "aac_encoder_unavailable","decoded_audio_not_usable",
       "encoded_audio_not_verified","local_audio_validation_failed",
       "local_source_aac_reencode_chunks_verified")
      assert path.name not in json.dumps(actual)
      cases.append({"viewport":"390x844","actual_chromium_result":actual["status"],
        "physical_iphone_safari_tested":False,"mp4_file_generated_synthetically":True})
      ctx.close()
      assert not errors,errors
      assert not external,external
      return cases
    finally:browser.close()
def run(out):
    from playwright.sync_api import sync_playwright
    root=Path(__file__).resolve().parents[1]
    out=Path(out);out.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="nova-local-audio-ci-") as temp:
      fixture=Path(temp)/"CI_SYNTHETIC_15_FRAMES.mp4"
      clip(fixture)
      server=ThreadingHTTPServer(("127.0.0.1",0),partial(Quiet,directory=str(root)))
      t=threading.Thread(target=server.serve_forever,daemon=True);t.start()
      origin="http://127.0.0.1:"+str(server.server_address[1])
      try:
        with sync_playwright() as play:
          tests=test_browser(play.chromium,origin,fixture,out)
      finally:
        server.shutdown();server.server_close();t.join(timeout=4)
    data={
      "schema":"retouche-nova-local-audio-browser-linux-v1",
      "status":"synthetic_mp4_file_selection_ui_verified",
      "cases":tests,"no_real_user_media":True,
      "zero_external_network_requests":True,
      "physical_safari_iphone_tested":False,
      "final_export_mp4_tested":False,
    }
    (out/"nova-local-audio-browser-report.json").write_text(json.dumps(data,indent=2))
    print(json.dumps(data,indent=2))
if __name__=="__main__":
    p=argparse.ArgumentParser();p.add_argument("--out",type=Path,required=True)
    run(p.parse_args().out)
