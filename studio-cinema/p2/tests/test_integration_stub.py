"""Local fake ComfyUI serves a synthetic MP4; tests transport, not neural inference."""
from pathlib import Path
import json
import functools
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread
import importlib.util
import subprocess

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('gateway',ROOT/'gateway'/'retouche_render_gateway.py')
g=importlib.util.module_from_spec(spec);spec.loader.exec_module(g)

def test_operator_execution_real_http_fake_video(tmp_path):
    video=tmp_path/'synthetic_input.mp4'
    subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=blue:s=192x108:d=0.4:r=12','-an','-c:v','libx264','-pix_fmt','yuv420p','-y',str(video)],check=True,timeout=20)
    payload=video.read_bytes();received=[]
    class FakeComfy(BaseHTTPRequestHandler):
        def log_message(self,*args):pass
        def do_POST(self):
            assert self.path=='/prompt'
            size=int(self.headers.get('Content-Length','0'));data=json.loads(self.rfile.read(size))
            received.append(data);result=json.dumps({'prompt_id':'synthetic-12345'}).encode()
            self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(result)));self.end_headers();self.wfile.write(result)
        def do_GET(self):
            if self.path.startswith('/history/'):
                raw=json.dumps({'synthetic-12345':{'outputs':{'9':{'gifs':[{'filename':'render.mp4','type':'output','subfolder':''}]}}}}).encode()
                content_type='application/json'
            elif self.path.startswith('/view?'):
                raw=payload;content_type='video/mp4'
            else:self.send_error(404);return
            self.send_response(200);self.send_header('Content-Type',content_type);self.send_header('Content-Length',str(len(raw)));self.end_headers();self.wfile.write(raw)
    srv=ThreadingHTTPServer(('127.0.0.1',0),FakeComfy);thread=Thread(target=srv.serve_forever,daemon=True);thread.start()
    try:
        manifest=json.loads((ROOT/'sample_manifest_390.json').read_text())
        template={'3':{'class_type':'Sampler','inputs':{'seed':1}},'6':{'class_type':'Text','inputs':{'text':'old'}}}
        workflow=tmp_path/'workflow.json';workflow.write_text(json.dumps(template))
        report=g.execute(manifest,workflow,ROOT/'gateway'/'COMFYUI_MAPPING_EXEMPLE.json',f'http://127.0.0.1:{srv.server_port}',tmp_path/'outputs',limit=1)
        assert report['completed']==1 and report['total']==24 and report['submitted']==1
        assert report['media_sent'] is False
        assert received[0]['prompt']['6']['inputs']['text']==manifest['clips'][0]['prompt']
        outfile=tmp_path/'outputs'/(manifest['clips'][0]['clip_id']+'.mp4')
        assert outfile.read_bytes()==payload
        probe=subprocess.run(['ffprobe','-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1',str(outfile)],capture_output=True,text=True,check=True)
        assert float(probe.stdout.strip().split('=')[-1])>0
        assert (tmp_path/'outputs'/'render_report.json').exists()
    finally:srv.shutdown();srv.server_close()

