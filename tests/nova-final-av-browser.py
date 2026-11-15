"""NOVA final AV lab: real local synthetic MP4 H264/AAC export & user-gated save.

Chromium Linux only; no real user files, no HEVC iPhone Safari validation.
Real NOVA_NATIVE_HD.exporter produces output, FFprobe inspects streams, FFmpeg
decodes PCM and checks non-silence; no playback or human lip-sync certification.
"""
from __future__ import annotations
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
import hashlib
import json
import math
import os
import statistics
import subprocess
import tempfile
import threading

class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*args):pass

def run_cmd(args):
    return subprocess.run(args,check=True,stdout=subprocess.PIPE,
      stderr=subprocess.PIPE,timeout=60)

def synthetic_mp4(filepath):
    run_cmd(["ffmpeg","-hide_banner","-loglevel","error","-nostdin","-y",
     "-f","lavfi","-i","testsrc2=size=160x120:rate=15:duration=1",
     "-f","lavfi","-i","sine=frequency=660:sample_rate=48000:duration=1",
     "-map","0:v:0","-map","1:a:0",
     "-c:v","libx264","-bf","0","-pix_fmt","yuv420p",
     "-threads","1","-preset","ultrafast",
     "-color_primaries","bt709","-color_trc","bt709","-colorspace","bt709",
     "-movflags","+faststart+write_colr","-c:a","aac","-b:a","64k",
     "-ac","1",str(filepath)])
    assert filepath.stat().st_size>8000

def ffprobe_mp4(file):
    raw=run_cmd(["ffprobe","-v","error","-show_streams","-show_format",
       "-of","json",str(file)]).stdout
    data=json.loads(raw)
    a=next((x for x in data["streams"] if x["codec_type"]=="audio"),None)
    v=next((x for x in data["streams"] if x["codec_type"]=="video"),None)
    assert v and v["codec_name"]=="h264",data
    assert a and a["codec_name"]=="aac",data
    assert int(v["width"])==160 and int(v["height"])==120
    assert int(v.get("nb_frames",0))==15
    assert int(a["channels"])==1
    assert abs(float(data["format"]["duration"])-1)<0.2
    # Independently decode the actual AAC track to signed 16-bit PCM, and
    # verify that output is not silent. No speaker/listening test.
    pcm=run_cmd(["ffmpeg","-v","error","-nostdin","-i",str(file),
       "-map","0:a:0","-f","s16le","-ar","48000","-ac","1","-"]).stdout
    assert len(pcm)>48000, "AAC decoded PCM too short"
    import array
    samples=array.array("h");samples.frombytes(pcm)
    peak=max(abs(x) for x in samples)
    rms=math.sqrt(sum(x*x for x in samples)/len(samples))
    assert peak>300 and rms>80, "AAC decoded but silence or near-silence"
    return {"video_codec":v["codec_name"],"video_dimensions":"160x120",
      "frames":int(v["nb_frames"]),"audio_codec":a["codec_name"],
      "audio_channels":int(a["channels"]),
      "audio_decoded_pcm_samples":len(samples),
      "non_silent_pcm_test":True,"audio_peak_above_300":True,
      "audio_rms_above_80":True,"sync_perceptually_verified":False}

def run_one(browser,base,source,viewport,out):
    width,height=viewport
    ctx=browser.new_context(viewport={"width":width,"height":height},
        is_mobile=True,has_touch=True,accept_downloads=True)
    page=ctx.new_page()
    errors=[];external=[];uploads=[]
    page.on("pageerror",lambda e:errors.append(str(e)))
    page.on("request",lambda r:(
      external.append(r.url) if r.url.startswith(("http://","https://")) and
         not r.url.startswith(base) else None,
      uploads.append(r.url) if r.method!="GET" else None))
    try:
        response=page.goto(base+"/experiences/nova-final-av-lab/index.html",
             wait_until="load",timeout=30000)
        assert response is not None and response.status==200
        assert page.locator("#start").is_disabled()
        assert not page.locator("#playback-panel").is_visible()
        assert not page.locator("#save").is_visible()
        assert not page.locator("#report-panel").is_visible()
        page.locator("#local-video").set_input_files(str(source))
        assert page.locator("#start").is_enabled()
        assert not page.locator("#save").is_visible()
        page.locator("#start").click()
        page.wait_for_function("""() => {
          let s=document.querySelector("#status")?.textContent||"";
          return !document.querySelector("#playback-panel").hidden ||
             /pas passé|a échoué|indisponible|non vérifiable|n'a pas|refuse|annulé|hors/.test(s);
        }""",timeout=120000)
        text=page.locator("#status").inner_text()
        assert page.locator("#playback-panel").is_visible(), "Actual native A/V export failed: "+text
        assert page.locator("#output-preview").is_visible()
        assert not page.locator("#save").is_visible(), "Download shown before manual verification"
        rpt=json.loads(page.locator("#report-json").input_value())
        assert rpt["status"]=="mp4_audio_video_structure_checked_manual_review_pending"
        assert rpt["output_mp4_structure_checked_by_existing_nova_engine"]
        assert rpt["output_video_frames"]==15 and rpt["source_video_frames"]==15
        assert rpt["audio_mode"] in ("aac-copy","aac-native-encode")
        assert not rpt["user_reported_image_visible"] and not rpt["user_reported_audio_audible"]
        assert rpt["physical_iphone_independently_certified"] is False
        assert rpt["independent_audio_video_sync_verified"] is False
        assert rpt["local_file_uploaded"] is False
        # The preview video can decode frames; this is not an audio listening
        # check (the AAC PCM is checked independently via FFmpeg below).
        state=page.locator("#output-preview").evaluate("(v)=>({w:v.videoWidth,h:v.videoHeight,ready:v.readyState,duration:v.duration,muted:v.muted})")
        assert state["w"]==160 and state["h"]==120 and state["duration"]>0
        assert state["muted"] is False
        page.locator("#video-visible").check()
        assert not page.locator("#save").is_visible(), "Saving with no sound confirmation"
        page.locator("#audio-audible").check()
        assert page.locator("#save").is_visible()
        final=json.loads(page.locator("#report-json").input_value())
        assert final["status"]=="user_reviewed_audio_and_video"
        assert final["user_reported_image_visible"] and final["user_reported_audio_audible"]
        assert final["user_reported_sync_plausible"] is False
        assert final["independent_audio_video_sync_verified"] is False
        assert source.name not in json.dumps(final)
        assert page.evaluate("document.documentElement.scrollWidth<=window.innerWidth+1"),"horizontal overflow"
        with page.expect_download(timeout=15000) as info:
            page.locator("#save").click()
        downloaded=info.value
        assert downloaded.suggested_filename=="NOVA_HD_test_image_son.mp4"
        extracted=out/("nova-av-output-"+str(width)+"x"+str(height)+".mp4")
        downloaded.save_as(str(extracted))
        validated=ffprobe_mp4(extracted)
        page.screenshot(path=str(out/("nova-av-"+str(width)+"x"+str(height)+".png")),
             full_page=True)
        assert not errors,errors
        assert not external,external
        assert not uploads,uploads
        # Do not upload generated A/V media as artifact: proof JSON & screenshots
        # only. Downloaded synthetic MP4 in runner ephemeral workspace removed.
        extracted.unlink()
        return {"viewport":str(width)+"x"+str(height),
           "native_nova_hd_real_browser_export":True,
           "user_gated_download":True,"no_network_upload":True,
           "manual_sync_not_certified":True,
           "ffmpeg":validated}
    finally:ctx.close()

def negative(browser,base,source):
    ctx=browser.new_context(viewport={"width":390,"height":844},is_mobile=True,has_touch=True)
    page=ctx.new_page()
    # The native module is intentionally frozen. Mock the script response
    # before navigation, instead of silently failing to overwrite its method.
    page.route("**/experiences/nova-native-hd.js",lambda route:route.fulfill(
      status=200,content_type="application/javascript",
      body='var NOVA_NATIVE_HD={exporter:async()=>{throw Error("Audio natif NOVA : AAC PRIVATE_PERSON_FILENAME.mov invalid")}};'))
    page.goto(base+"/experiences/nova-final-av-lab/index.html",wait_until="load")
    page.locator("#local-video").set_input_files(str(source))
    page.locator("#start").click()
    page.locator("#report-panel").wait_for(state="visible",timeout=10000)
    report=json.loads(page.locator("#report-json").input_value())
    assert report["status"]=="local_av_export_failed"
    assert report["error_code"]=="aac_track_not_verified"
    assert "PRIVATE_PERSON" not in json.dumps(report)
    assert not page.locator("#playback-panel").is_visible()
    assert not page.locator("#save").is_visible()
    ctx.close()
    return {"error_injected":"synthetic_AAC_failure","report_privacy":True,
      "download_refused":True}

def main(out):
    from playwright.sync_api import sync_playwright
    root=Path(__file__).resolve().parents[1]
    out=Path(out);out.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="nova-final-av-") as tmp:
        media=Path(tmp)/"PRIVATE_SOURCE_SYNTHETIC.mp4"
        synthetic_mp4(media)
        before=hashlib.sha256(media.read_bytes()).hexdigest()
        server=ThreadingHTTPServer(("127.0.0.1",0),partial(Quiet,directory=str(root)))
        t=threading.Thread(target=server.serve_forever,daemon=True);t.start()
        base="http://127.0.0.1:"+str(server.server_address[1])
        try:
            with sync_playwright() as play:
                browser=play.chromium.launch(headless=True)
                try:
                    valid=[run_one(browser,base,media,v,out) for v in [(390,844),(320,700)]]
                    rejected=negative(browser,base,media)
                finally:browser.close()
        finally:server.shutdown();server.server_close();t.join(timeout=5)
        after=hashlib.sha256(media.read_bytes()).hexdigest()
        assert before==after,"source was modified"
    proof={
      "schema":"retoucheproai.nova.final-av-linux-browser-evidence.v1",
      "status":"real_synthetic_mp4_h264_aac_muxed_and_pcm_decoded_on_linux",
      "tests":valid,"negative_test":rejected,
      "media_input":"procedural_ffmpeg_only",
      "original_unchanged":True,
      "no_user_media_in_repo_or_artifact":True,
      "actual_physical_safari_iphone_tested":False,
      "hevc_hdr_export_tested":False,
      "independent_human_listening_or_lip_sync_tested":False,
    }
    (out/"nova-final-av-linux-report.json").write_text(
      json.dumps(proof,ensure_ascii=False,indent=2),encoding="utf-8")
    print(json.dumps(proof,indent=2))
if __name__=="__main__":
    p=argparse.ArgumentParser();p.add_argument("--out",required=True,type=Path)
    main(p.parse_args().out)
