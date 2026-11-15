/* NOVA HD : H.264 avec B-frames réelles (ordre DTS différent de PTS).
 * Test navigateur Chromium sur MP4 entièrement synthétique et AAC.
 * Ne certifie ni Safari physique ni HEVC iPhone.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {fileURLToPath} from "node:url";
import {chromium} from "playwright";
const run=promisify(execFile);
const root=path.resolve(fileURLToPath(new URL("../",import.meta.url)));

test("NOVA HD : 30 B/P/I images H264 réordonnées décodées et exportées avec AAC",async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),"nova-bframes-"));
 const sample=path.join(dir,"bframes-aac.mp4");
 let server,browser;
 try{
  await run(process.execPath,[path.join(root,"outils/build-nova-iphone-preview.mjs"),dir],{timeout:90000});
  await run("ffmpeg",[
   "-hide_banner","-loglevel","error","-nostdin",
   "-f","lavfi","-i","testsrc2=size=160x120:rate=15:duration=2",
   "-f","lavfi","-i","sine=frequency=440:sample_rate=48000:duration=2",
   "-map","0:v:0","-map","1:a:0",
   // testsrc2 n'annonce pas toujours primaires et transfert BT.709.
   // setparams fixe les métadonnées de trame AVANT le muxage colr/nclx.
   "-vf","setparams=range=tv:color_primaries=bt709:color_trc=bt709:colorspace=bt709",
   "-c:v","libx264","-pix_fmt","yuv420p","-bf","2","-g","15",
   "-x264-params","b-adapt=0:open-gop=0","-preset","medium","-threads","1",
   "-color_primaries","bt709","-color_trc","bt709","-colorspace","bt709",
   "-movflags","+faststart+write_colr","-c:a","aac","-b:a","64k",
   "-y",sample
  ],{timeout:45000});
  const frames=(await run("ffprobe",[
   "-v","error","-select_streams","v:0","-show_entries","frame=pict_type",
   "-of","csv=p=0",sample
  ])).stdout;
  assert.match(frames,/B/,"must use actual B frames, not a renamed no-reorder file");
  const csp=(await fs.readFile(path.join(dir,"_headers"),"utf8"))
   .match(/^  Content-Security-Policy: (.+)$/m)?.[1];
  assert.ok(csp);
  server=http.createServer(async(req,res)=>{
   const pathname=new URL(req.url,"http://localhost").pathname;
   const dest=path.resolve(dir,"."+pathname);
   if(!dest.startsWith(dir+path.sep)){res.writeHead(403).end();return}
   try{
    const bytes=await fs.readFile(dest);
    res.setHeader("Content-Security-Policy",csp);
    res.setHeader("Cache-Control","no-store");
    res.setHeader("Content-Type",dest.endsWith(".js")?"text/javascript":
     dest.endsWith(".html")?"text/html":dest.endsWith(".wasm")?
     "application/wasm":"application/octet-stream");
    res.end(bytes);
   }catch{res.writeHead(404).end("missing")}
  });
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  const base="http://127.0.0.1:"+server.address().port;
  browser=await chromium.launch({headless:true,...(process.env.CHROME?
   {executablePath:process.env.CHROME}:{})});
  const page=await browser.newPage({viewport:{width:390,height:844},acceptDownloads:true});
  const failures=[],uploads=[],external=[];
  page.on("pageerror",e=>failures.push(e.message));
  page.on("request",r=>{
   if(!r.url().startsWith(base+"/")&&!r.url().startsWith("blob:")&&!r.url().startsWith("data:"))
    external.push(r.url());
   if(!["GET","HEAD"].includes(r.method()))uploads.push(r.url());
  });
  await page.goto(base+"/experiences/nova.html");
  await page.locator("#novaHdPanel summary").click();
  await page.locator("#file").setInputFiles(sample);
  const timing=await page.evaluate(async()=>{
   const info=await NOVA_DEMUX.analyser(document.querySelector("#file").files[0]);
   return {samples:info?.ns,
    firstKey:info?.key?.[0],
    dtsPtsReordered:info?.ptsUs?.some((v,i,a)=>i>0&&v<a[i-1]),
    firstPresentationUs:Math.min(...info.ptsUs),
    color:info?.color,durationUs:info?.durationUs};
  });
  assert.equal(timing.samples,30);
  assert.equal(timing.firstKey,true);
  assert.equal(timing.dtsPtsReordered,true,"fixture must expose PTS reordering");
  assert.equal(timing.firstPresentationUs,0,"B-frame elst must preserve start");
  assert.equal(timing.color?.kind,"nclx");
  assert.equal(timing.color?.primaries,1,"fixture must signal BT.709 primaries in MP4");
  assert.equal(timing.color?.transfer,1,"fixture must signal BT.709 transfer in MP4");
  assert.equal(timing.color?.matrix,1,"fixture must signal BT.709 matrix in MP4");
  assert.equal(timing.color?.fullRange,false);
  // Observer les événements du vrai pipeline H264/AAC, pas ceux d'un mock.
  await page.evaluate(()=>{
   window.__novaNativeStages=[];
   const native=window.NOVA_NATIVE_HD;
   window.NOVA_NATIVE_HD={...native,exporter:opts=>native.exporter({
    ...opts,onProgress:step=>{
     window.__novaNativeStages.push(step.stage);
     opts.onProgress?.(step);
    }
   })};
  });
  await page.locator("#novaHdRun").click();
  await page.waitForFunction(()=>{
   const status=document.querySelector("#novaHdStatus")?.textContent||"";
   return !!document.querySelector("#novaHdSave")?.getAttribute("href")||
    /Essai HD non abouti/.test(status);
  },null,{timeout:110000});
  const status=await page.locator("#novaHdStatus").textContent();
  assert.match(status,/MP4 HD exporté/,status);
  const nativeStages=await page.evaluate(()=>window.__novaNativeStages);
  const expected=["native-source","native-decoder-config","native-encoder-config",
   "native-aac-check","native-muxer","native-codec-start","native-video-feed",
   "native-image-process","native-image-encode","native-encoder-flush",
   "native-aac-copy","native-aac-audit","native-mux-finalize",
   "native-output-index","native-output-color","complete"];
  let previous=-1;
  for(const label of expected){
   const pos=nativeStages.indexOf(label);
   assert.ok(pos>previous,label+" must be observed in real pipeline after preceding stages");
   previous=pos;
  }
  const dl=page.waitForEvent("download");
  await page.locator("#novaHdSave").click();
  const output=await (await dl).path();
  const ffprobe=JSON.parse((await run("ffprobe",[
   "-v","error","-show_streams","-show_format","-of","json",output
  ],{timeout:10000})).stdout);
  const v=ffprobe.streams.find(x=>x.codec_type==="video");
  const a=ffprobe.streams.find(x=>x.codec_type==="audio");
  assert.equal(v?.codec_name,"h264");
  assert.equal(Number(v?.nb_frames),30,"must keep every source frame");
  assert.equal(v?.width,160);assert.equal(v?.height,120);
  assert.equal(a?.codec_name,"aac");
  assert.ok(Math.abs(Number(ffprobe.format.duration)-2)<.2);
  assert.deepEqual(failures,[]);
  assert.deepEqual(uploads,[]);
  assert.deepEqual(external,[]);
 }finally{
  await browser?.close();
  if(server?.listening)await new Promise(done=>server.close(done));
  await fs.rm(dir,{recursive:true,force:true});
 }
});
