"""Verify the *actual* RetoucheProAI MP4 demuxers + bundled Mp4Muxer preserve AAC.

The fixture is a generated 1.8 s H264+AAC MP4. Chromium need NOT be able to
play/encode H264 or encode AAC: the original compressed samples are copied by
RetoucheProAI's own demuxAudio/demuxVideo and mp4-muxer.js.

This is a mux/roundtrip validation, NOT a test of image restoration or Safari.
No personal media. No remote services. The output is FFprobed independently.
"""
import base64
import hashlib
import json
import shutil
import subprocess
import tempfile
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[3]
RESULTS=ROOT/'research'/'preprod'/'results'
RESULTS.mkdir(parents=True,exist_ok=True)

class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*args):pass

def run_cmd(*args, timeout=40):
    return subprocess.run(args,check=True,capture_output=True,text=True,timeout=timeout).stdout

def generate(tmp):
    f=tmp/'aac_synthetic_reference.mp4'
    run_cmd('ffmpeg','-nostdin','-hide_banner','-loglevel','error','-y',
        '-f','lavfi','-i','testsrc2=size=256x144:rate=15',
        '-f','lavfi','-i','sine=frequency=670:sample_rate=48000',
        '-t','1.8','-c:v','libx264','-preset','ultrafast','-crf','28','-bf','0',
        '-g','15','-pix_fmt','yuv420p','-c:a','aac','-b:a','112k','-ac','1',
        '-movflags','+faststart','-shortest',str(f))
    assert f.stat().st_size>13000
    return f

def probe(path):
    return json.loads(run_cmd('ffprobe','-v','error','-show_entries',
      'format=duration,size:stream=codec_name,codec_type,sample_rate,channels,width,height,duration',
      '-of','json',str(path)))

def streams(info):
    return {s['codec_type']:s for s in info['streams'] if s['codec_type'] in ('video','audio')}

def main():
  with tempfile.TemporaryDirectory(prefix='retouche_aac_synthetic_') as td:
    tmp=Path(td)
    original=generate(tmp)
    before=probe(original)
    si=streams(before)
    assert si['video']['codec_name']=='h264' and si['audio']['codec_name']=='aac'
    assert si['audio']['sample_rate']=='48000' and si['audio']['channels']==1

    server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT)))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    base=f'http://127.0.0.1:{server.server_port}/'
    errors=[];external=[]
    try:
      with sync_playwright() as p:
        options={'headless':True,'args':['--no-sandbox','--enable-webgl','--use-gl=angle',
                '--use-angle=swiftshader','--enable-unsafe-swiftshader']}
        exe=next((shutil.which(x) for x in ('chromium','google-chrome','chromium-browser') if shutil.which(x)),None)
        if exe:options['executable_path']=exe
        browser=p.chromium.launch(**options)
        page=browser.new_page(viewport={'width':390,'height':844})
        page.on('pageerror',lambda e:errors.append(str(e)))
        def route(req):
          u=urlsplit(req.request.url)
          if u.scheme in ('http','https') and u.netloc!=f'127.0.0.1:{server.server_port}':
            external.append({'host':u.hostname,'method':req.request.method})
            req.abort()
          else:req.continue_()
        page.route('**/*',route)
        page.goto(base,wait_until='domcontentloaded',timeout=30000)
        page.wait_for_selector('#smallmotion-app-panel',state='attached',timeout=20000)
        payload=base64.b64encode(original.read_bytes()).decode('ascii')
        data=page.evaluate('''async b64=>{
          if(!window.Mp4Muxer||typeof demuxAudio!=='function'||typeof demuxVideo!=='function')
            throw Error('Real application demux/mux unavailable');
          const raw=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));
          const file=new File([raw],'synthetic-aac.mp4',{type:'video/mp4'});
          const audio=await demuxAudio(file),video=await demuxVideo(file);
          if(!audio||!audio.samples?.length)throw Error('App failed to demux AAC audio');
          if(!video||video.ns<10)throw Error('App failed to demux H264 video');
          if(!video.codec.startsWith('avc1.'))throw Error('not AVC: '+video.codec);
          const target=new Mp4Muxer.ArrayBufferTarget();
          const muxer=new Mp4Muxer.Muxer({target,fastStart:false,
            video:{codec:'avc',width:video.W,height:video.H},
            audio:{codec:'aac',numberOfChannels:audio.ch,sampleRate:audio.sr}});
          for(let i=0;i<video.ns;i++){
            const off=video.so[i],len=video.sz[i],data=raw.slice(off,off+len);
            const dts=Math.round(video.dts[i]*1e6/video.ts);
            const dur=Math.max(1,Math.round(((video.dts[i+1]??(video.dts[i]+(video.dts[i]-video.dts[i-1]||video.ts/15)))-video.dts[i])*1e6/video.ts));
            const compositionOffset=Math.round((video.cts[i]-video.dts[i])*1e6/video.ts);
            muxer.addVideoChunkRaw(data,video.key[i]?'key':'delta',dts,dur,
              i===0?{decoderConfig:{codec:video.codec,description:video.desc,codedWidth:video.W,codedHeight:video.H}}:undefined,
              compositionOffset);
          }
          for(const [i,sample] of audio.samples.entries()){
            muxer.addAudioChunkRaw(sample.data,'key',sample.ts,sample.dur,
              i===0?{decoderConfig:{codec:'mp4a.40.2',numberOfChannels:audio.ch,sampleRate:audio.sr,description:audio.asc}}:undefined);
          }
          muxer.finalize();
          const result=new Uint8Array(target.buffer);
          // Base64 return is safe: only generated test media; never upload private bytes.
          let text='';const step=32768;
          for(let i=0;i<result.length;i+=step)text+=String.fromCharCode(...result.subarray(i,i+step));
          const aacSupported=typeof AudioEncoder==='function'?
            await AudioEncoder.isConfigSupported({codec:'mp4a.40.2',sampleRate:audio.sr,
              numberOfChannels:audio.ch,bitrate:112000}).then(r=>r.supported).catch(()=>false):false;
          const h264Supported=typeof VideoEncoder==='function'?
            await VideoEncoder.isConfigSupported({codec:'avc1.42001f',width:video.W,
              height:video.H,bitrate:400000,framerate:15}).then(r=>r.supported).catch(()=>false):false;
          return {output: btoa(text),audioSamples:audio.samples.length,videoSamples:video.ns,
            audioRate:audio.sr,audioChannels:audio.ch,videoCodec:video.codec,
            browserCanEncodeAAC:aacSupported,browserCanEncodeH264:h264Supported,
            originalAudioMetadata:!!audio.asc};
        }''',payload)
        page.close();browser.close()
      assert not errors,errors
      assert not any(q['method'] not in ('GET','HEAD') for q in external),external
      repacked=tmp/'repacked_using_actual_app_demuxer_and_muxer.mp4'
      repacked.write_bytes(base64.b64decode(data.pop('output')))
      assert repacked.stat().st_size>13000
      after=probe(repacked)
      so=streams(after)
      assert so['video']['codec_name']=='h264',after
      assert so['audio']['codec_name']=='aac',after
      assert so['audio']['sample_rate']==si['audio']['sample_rate']
      assert so['audio']['channels']==si['audio']['channels']
      od=float(before['format']['duration']);nd=float(after['format']['duration'])
      assert abs(od-nd)<0.2,(od,nd)
      # Read and decode BOTH media tracks without relying on browser codec support.
      run_cmd('ffmpeg','-v','error','-i',str(repacked),'-map','0:v:0','-f','null','-')
      run_cmd('ffmpeg','-v','error','-i',str(repacked),'-map','0:a:0','-f','null','-')
      report={
        'method':'real_RetoucheProAI_demuxAudio_demuxVideo_and_bundled_Mp4Muxer',
        'media':'generated_H264_AAC_1p8s_only',
        'result':'pass',
        'inputStreams':{k:v.get('codec_name') for k,v in si.items()},
        'outputStreams':{k:v.get('codec_name') for k,v in so.items()},
        'durationSeconds':{'original':od,'remuxed':nd},
        'aacMetadataRetained':data['originalAudioMetadata'],
        'audioSamples':data['audioSamples'],
        'videoSamples':data['videoSamples'],
        'ffmpegVideoDecode':'pass',
        'ffmpegAudioDecode':'pass',
        'browserEncoders':{'AAC':data['browserCanEncodeAAC'],'H264':data['browserCanEncodeH264']},
        'externalRequestsBlocked':len(external),
        'jsErrors':errors,
        'limitations':'Validates original compressed H264/AAC packet passthrough and muxer; NOT full restored video export, not iPhone.'
      }
      (RESULTS/'aac_passthrough.json').write_text(json.dumps(report,indent=2,ensure_ascii=False),encoding='utf-8')
      print(json.dumps(report,indent=2,ensure_ascii=False))
    finally:
      server.shutdown();server.server_close()

if __name__=='__main__':main()