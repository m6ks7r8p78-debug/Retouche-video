"""NOVA AAC standalone privacy UX, Chromium Linux only — not physical iPhone Safari."""
from __future__ import annotations
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import threading

class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *args):pass

MOCK="""
Object.defineProperty(window,"isSecureContext",{value:true,configurable:true});
class SyntheticData{
 constructor(opts){
  if(opts.format!=="f32-planar"||opts.data.length!==opts.numberOfFrames*2)
   throw Error("bad PCM fixture");
  this.timestamp=opts.timestamp;
 }
 close(){}
}
class SyntheticEncoder{
 static async isConfigSupported(config){
  return {supported:config.codec==="mp4a.40.2"&&config.aac.format==="aac"};
 }
 constructor({output,error}){this.output=output;this.error=error}
 configure(c){this.cfg=c}
 encode(data){
  this.output({timestamp:data.timestamp,byteLength:8,
   copyTo:buffer=>buffer.set([3,4,5,6,7,8,9,10])});
 }
 async flush(){}
 close(){}
}
Object.defineProperty(window,"AudioData",{configurable:true,value:SyntheticData});
Object.defineProperty(window,"AudioEncoder",{configurable:true,value:SyntheticEncoder});
Object.defineProperty(window,"VideoDecoder",{configurable:true,value:
 class {static async isConfigSupported(){return {supported:true}}}});
"""
def exercise(browser,base,out):
    result=[]
    errors=[]
    external=[]
    for width,height in [(390,844),(320,700)]:
        ctx=browser.new_context(viewport={"width":width,"height":height},
          is_mobile=True,has_touch=True)
        page=ctx.new_page()
        page.on("pageerror",lambda e:errors.append(str(e)))
        page.on("request",lambda req:external.append(req.url) if
          req.url.startswith(("https://","http://")) and not req.url.startswith(base)
          else None)
        page.add_init_script(MOCK)
        response=page.goto(base+"/experiences/nova-safari-aac-probe/index.html",
          wait_until="load",timeout=20000)
        assert response is not None and response.status==200
        assert page.locator("input[type=file],video,form").count()==0
        assert not page.locator("#result").is_visible()
        page.get_by_role("button",name="Tester le codec AAC").click()
        page.locator("#result").wait_for(state="visible",timeout=15000)
        report=json.loads(page.locator("#json").input_value())
        assert report["schema"]=="retoucheproai.nova.safari-aac-lab.v1"
        assert report["status"]=="native-aac-encoded-synthetic"
        assert report["actual_aac_chunks_produced"]==24
        assert report["hevc_config_probe"]=="reported-supported-config-only"
        assert report["hevc_stream_decode_tested"] is False
        assert report["real_video_imported"] is False
        assert report["report_sent_automatically"] is False
        assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1")
        page.screenshot(path=str(out/f"nova-aac-{width}x{height}-mocked-browser.png"),
          full_page=True)
        result.append({"viewport":f"{width}x{height}",
            "synthetic_encoder_mock_ui":True,"browser_external_requests":0,
            "no_media_input":True,"real_encoder_measured":False})
        ctx.close()
    # Actual Chromium is allowed to say unsupported; no fabricated 'AAC success'.
    ctx=browser.new_context(viewport={"width":390,"height":844},is_mobile=True,has_touch=True)
    page=ctx.new_page()
    page.on("pageerror",lambda e:errors.append(str(e)))
    page.on("request",lambda req:external.append(req.url) if
       req.url.startswith(("https://","http://")) and not req.url.startswith(base) else None)
    page.goto(base+"/experiences/nova-safari-aac-probe/index.html",wait_until="load")
    page.get_by_role("button",name="Tester le codec AAC").click()
    page.locator("#result").wait_for(state="visible",timeout=15000)
    real=json.loads(page.locator("#json").input_value())
    assert real["status"] in ("codec-unsupported","webcodecs-unavailable",
        "codec-supported-but-encode-failed","native-aac-encoded-synthetic")
    assert real["real_video_imported"] is False
    assert real["physical_safari_independently_certified"] is False
    result.append({"viewport":"390x844",
      "actual_chromium_codec_probe_status":real["status"],
      "real_encoder_measured":real["status"]=="native-aac-encoded-synthetic",
      "iphone_physically_tested":False})
    ctx.close()
    assert not errors,errors
    assert not external,external
    return result

def run(out):
    from playwright.sync_api import sync_playwright
    basepath=Path(__file__).resolve().parents[1]
    out=Path(out);out.mkdir(parents=True,exist_ok=True)
    server=ThreadingHTTPServer(("127.0.0.1",0),
       partial(Quiet,directory=str(basepath)))
    th=threading.Thread(target=server.serve_forever,daemon=True);th.start()
    origin="http://127.0.0.1:"+str(server.server_address[1])
    try:
      with sync_playwright() as play:
        browser=play.chromium.launch(headless=True)
        try:r=exercise(browser,origin,out)
        finally:browser.close()
    finally:
      server.shutdown();server.server_close();th.join(timeout=4)
    data={"schema":"retouche-nova-safari-aac-browser-linux-v1",
      "status":"synthetic_ui_mock_and_actual_linux_probe",
      "browser_cases":r,
      "no_personal_media":True,"no_requests_to_external_hosts":True,
      "physical_iphone_safari_tested":False}
    (out/"nova-safari-aac-browser-report.json").write_text(json.dumps(data,indent=2))
    print(json.dumps(data,indent=2))
if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("--out",type=Path,required=True)
    args=parser.parse_args()
    run(args.out)
