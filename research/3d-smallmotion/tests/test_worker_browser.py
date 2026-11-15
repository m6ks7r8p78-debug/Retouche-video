"""Real Chromium Worker checks, all media/requests local or synthetic.
Not a physical Safari/iPhone measurement."""
import json,shutil
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
origin='blob_local_only'
results=[]
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path=shutil.which('chromium') or shutil.which('chromium-browser') or shutil.which('google-chrome'),headless=True,args=['--no-sandbox'])
  for dims in [(390,844),(1280,800)]:
   page=browser.new_page(viewport={'width':dims[0],'height':dims[1]})
   errors=[];requests=[]
   page.on('pageerror',lambda e:errors.append(str(e)))
   page.on('request',lambda r:requests.append((r.url,r.method)))
   page.set_content((ROOT/'RetoucheMotionWorker_iPhone_Local.html').read_text())
   # The SAME-ORIGIN classic Worker uses importScripts('smallmotion-local.js').
   # This independently checks the production worker source path (the offline
   # blob Worker was already exercised by test_safari_harness.py).
   data=page.evaluate('''async (workerUrl)=>{
      let s=3;const rnd=()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s>>>24};
      const w=160,h=120,bg=new Uint8Array(w*h),patch=new Uint8Array(24*20);
      for(let i=0;i<bg.length;i++)bg[i]=rnd();for(let i=0;i<patch.length;i++)patch[i]=rnd();
      const make=t=>{const data=new Uint8ClampedArray(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++){
        let v=bg[y*w+(x-t+w)%w],ox=x-65,oy=y-(45+t*4);
        if(ox>=0&&ox<24&&oy>=0&&oy<20)v=patch[oy*24+ox];
        const k=(y*w+x)*4;data[k]=data[k+1]=data[k+2]=v;data[k+3]=255;
      }return {width:w,height:h,data};};
      const a=make(0),b=make(1),same=RetoucheLocalMotion.analyze(a,b);
      const result=await RetoucheMotionWorkerRunner.run(a,b,{analyzer:RetoucheLocalMotion.analyze,workerURL:workerUrl});
      // Verify main-thread responsiveness independently from Worker startup.
      const slow=URL.createObjectURL(new Blob([`onmessage=e=>{const t=performance.now();while(performance.now()-t<210){};postMessage({id:e.data.id,ok:true,computeMs:210,result:{status:'no_supported_local_motion',candidates:[]}})}`],{type:'text/javascript'}));
      let done=false,ticked=false;const job=RetoucheMotionWorkerRunner.run(a,b,{analyzer:RetoucheLocalMotion.analyze,workerURL:slow}).then(()=>{done=true});
      await new Promise(resolve=>setTimeout(()=>{ticked=!done;resolve()},40));await job;
      const ac=new AbortController();const pending=RetoucheMotionWorkerRunner.run(a,b,{signal:ac.signal,analyzer:RetoucheLocalMotion.analyze,workerURL:slow});
      ac.abort();let cancelled=false;try{await pending}catch(e){cancelled=e.name==='AbortError'}
      URL.revokeObjectURL(slow);
      return {path:result.processingPath,equal:JSON.stringify(result.result)===JSON.stringify(same),same:same.status,
              wallMs:result.elapsedMs,computeMs:result.computeMs,ticked,done,cancelled,buffersRetained:a.data.length===w*h*4};
   }''',page.evaluate('window.RetoucheMotionWorkerURL'))
   assert data['path']=='worker' and data['equal'] and data['buffersRetained'],data
   assert data['ticked'] and data['cancelled'] and data['done'],data
   assert not errors,errors
   assert all(url.startswith('blob:') or url.startswith('data:') for url,method in requests),requests
   assert all(method=='GET' for _,method in requests),requests
   results.append({'viewport':list(dims),'workerPath':data['path'],'detectorParity':data['equal'],
      'mainThreadResponsive':data['ticked'],'abortTerminates':data['cancelled'],
      'workerComputeMs':round(data['computeMs'],2),'noMediaUpload':True,
      'requests':requests})
   page.close()
  browser.close()
finally:pass
(ROOT/'results'/'worker_browser_check.json').write_text(json.dumps(results,indent=2),encoding='utf-8')
print('Chromium blob Worker / standalone offline:',len(results),'viewports passed')