/* NOVA : 20 et 24 s H.264/AAC dans UN SEUL MP4 via fenêtres de 6 s.
 * Banc réel Chromium sous CSP, source 100% FFmpeg synthétique.
 * La même piste AAC est copiée une seule fois avec horodatages continus.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import {fileURLToPath} from "node:url";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {chromium} from "playwright";
const run=promisify(execFile);
const root=path.resolve(fileURLToPath(new URL("../",import.meta.url)));
async function ffprobe(file,args=[]){
 const {stdout}=await run("ffprobe",["-v","error",...args,"-of","json",file],
  {timeout:30000,maxBuffer:8*1024*1024});
 return JSON.parse(stdout);
}
for(const seconds of [20,24])test("NOVA "+seconds+"s H264/AAC : 4 fenêtres, 1 MP4, cadence continue et AAC intégral",async(t)=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),"nova-"+seconds+"s-windowed-"));
 let server=null,browser=null;
 try{
  const input=path.join(dir,"source-longue-synthetique.mp4");
  await run("ffmpeg",[
   "-hide_banner","-loglevel","error","-nostdin",
   "-f","lavfi","-i","testsrc2=size=320x180:rate=15:duration="+seconds,
   "-f","lavfi","-i","sine=frequency=660:sample_rate=48000:duration="+seconds,
   "-map","0:v:0","-map","1:a:0",
   "-c:v","libx264","-preset","ultrafast","-threads","2",
   "-bf","0",
   "-x264-params","colorprim=bt709:transfer=bt709:colormatrix=bt709:range=limited",
   "-pix_fmt","yuv420p","-color_primaries","bt709",
   "-color_trc","bt709","-colorspace","bt709",
   "-c:a","aac","-b:a","64k","-ac","1",
   "-movflags","+faststart+write_colr","-f","mp4","-y",input
  ],{timeout:120000});
  const original=await ffprobe(input,["-show_streams"]);
  assert.equal(original.streams.find(x=>x.codec_type==="video").codec_name,"h264");
  assert.equal(original.streams.find(x=>x.codec_type==="audio").codec_name,"aac");
  const app=path.join(dir,"site");
  await run(process.execPath,[path.join(root,"outils/build-nova-iphone-preview.mjs"),app],
   {timeout:90000});
  const headers=await fs.readFile(path.join(app,"_headers"),"utf8");
  const csp=headers.match(/^  Content-Security-Policy: (.+)$/m)?.[1];
  assert.ok(csp,"Pas de test sans CSP");
  server=http.createServer(async(req,res)=>{
   const p=path.resolve(app,"."+new URL(req.url,"http://localhost").pathname);
   if(!p.startsWith(app+path.sep)){res.writeHead(403).end();return}
   try{
    const bytes=await fs.readFile(p);
    res.setHeader("Content-Security-Policy",csp);
    res.setHeader("Cache-Control","no-store");
    res.setHeader("Content-Type",p.endsWith(".html")?"text/html":
     p.endsWith(".js")?"text/javascript":p.endsWith(".wasm")?"application/wasm":
     p.endsWith(".mp4")?"video/mp4":"application/octet-stream");
    res.end(bytes);
   }catch{res.writeHead(404).end("missing")}
  });
  await new Promise(ok=>server.listen(0,"127.0.0.1",ok));
  const base="http://127.0.0.1:"+server.address().port;
  browser=await chromium.launch({headless:true,...(process.env.CHROME?
   {executablePath:process.env.CHROME}:{})});
  const page=await browser.newPage({viewport:{width:390,height:844},acceptDownloads:true});
  page.setDefaultTimeout(60000);
  const requests=[],errors=[];
  page.on("request",req=>{
   if((!req.url().startsWith(base+"/")&&!req.url().startsWith("blob:")&&
       !req.url().startsWith("data:"))||
      !["GET","HEAD"].includes(req.method()))requests.push(req.url());
  });
  page.on("pageerror",err=>errors.push(err.message));
  await page.goto(base+"/experiences/nova.html");
  await page.locator("#file").setInputFiles(input);
  await page.waitForFunction(()=>!document.querySelector("#novaRealPreflightRun").disabled);
  assert.equal(await page.locator("#downloadVideo").getAttribute("href"),null);
  await page.locator("#novaRealPreflightPanel summary").click();
  await page.locator("#novaRealPreflightRun").click();
  await page.waitForFunction(()=>
   !!document.querySelector("#novaRealPreflightJson").getAttribute("href"),
   null,{timeout:60000});
  const preDownload=page.waitForEvent("download");
  await page.locator("#novaRealPreflightJson").click();
  const before=JSON.parse(await fs.readFile(await (await preDownload).path(),"utf8"));
  assert.equal(before.status,"ready-for-export-attempt");
  assert.equal(before.source.codec,"h264");
  assert.equal(before.source.durationMs,seconds*1000);
  assert.deepEqual(before.exportProposal,{width:320,height:180,fps:15,frames:seconds*15});
  assert.equal(before.pilotLimits.maxDurationMs,24000);
  assert.equal(before.audio,"aac-copy-verified");
  assert.equal(before.privacy.mediaUploaded,false);
  assert.equal(await page.locator("#downloadVideo").getAttribute("href"),null,
   "Un précontrôle ne lance pas l'export automatiquement");
  // Écoute uniquement les index et bornes temporelles transmis à l'UI :
  // l'API exporter est gelée et ne doit pas être modifiée par le test.
  await page.evaluate(()=>{
   window.__nova_test_progress=[];
   document.addEventListener("nova:window-progress",e=>{
    window.__nova_test_progress.push({...e.detail});
   });
  });
  await page.locator("#exportVideo").click();
  await page.waitForFunction(()=>
   !!document.querySelector("#downloadVideo").getAttribute("href")||
   document.querySelector("#exportStatus").textContent.startsWith("Export refusé"),
   null,{timeout:180000});
  const status=await page.locator("#exportStatus").innerText();
  assert.match(await page.locator("#downloadVideo").getAttribute("href")||"",/^blob:/,status);
  assert.match(status,/4 fenêtres vidéo, une piste AAC continue/);
  assert.match(status,/AAC original copié/);
  const windows=await page.evaluate(()=>window.__nova_test_progress);
  assert.deepEqual(windows.map(w=>[w.index,w.startMs,w.endMs]),[
   [1,0,6000],[2,6000,12000],[3,12000,18000],[4,18000,seconds*1000]
  ]);
  const pending=page.waitForEvent("download");
  await page.locator("#downloadVideo").click();
  const output=await (await pending).path();
  const data=await ffprobe(output,["-show_streams"]);
  const video=data.streams.filter(x=>x.codec_type==="video");
  const audio=data.streams.filter(x=>x.codec_type==="audio");
  assert.equal(video.length,1);
  assert.equal(audio.length,1);
  assert.equal(video[0].codec_name,"h264");
  assert.equal(audio[0].codec_name,"aac");
  assert.deepEqual([video[0].width,video[0].height,video[0].avg_frame_rate],
   [320,180,"15/1"]);
  assert.ok(Math.abs(Number(video[0].duration)-seconds)<=.08);
  assert.deepEqual([video[0].color_range,video[0].color_primaries,
   video[0].color_transfer,video[0].color_space],[
   "tv","bt709","bt709","bt709"
  ]);
  const frameInfo=await ffprobe(output,["-select_streams","v:0",
   "-show_frames","-show_entries",
   "frame=best_effort_timestamp_time,key_frame"]);
  const pts=frameInfo.frames.map(x=>Number(x.best_effort_timestamp_time));
  assert.equal(pts.length,seconds*15);
  assert.ok(pts.every(Number.isFinite));
  for(let i=1;i<pts.length;i++){
   const gap=pts[i]-pts[i-1];
   assert.ok(gap>.065&&gap<.069,
    "Aucune rupture/doublon temporel au rang "+i+" : "+gap);
  }
  assert.equal(pts[0],0);
  assert.ok(Math.abs(pts.at(-1)-(seconds-1/15))<=.002);
  const keyframes=frameInfo.frames.map((x,i)=>x.key_frame===1?i:null)
   .filter(x=>x!==null);
  for(const boundary of [0,90,180,270])
   assert.ok(keyframes.includes(boundary),
    "La fenêtre doit démarrer sur une image clé "+boundary);
  const sha=async p=>{
   const data=await ffprobe(p,["-select_streams","a:0","-show_packets",
    "-show_entries","packet=data_hash",
    "-show_data_hash","sha256"]);
   return data.packets.map(x=>x.data_hash);
  };
  const [sourceHashes,targetHashes]=await Promise.all([sha(input),sha(output)]);
  assert.ok(targetHashes.length>400);
  assert.deepEqual(targetHashes,sourceHashes.slice(0,targetHashes.length),
   "Copie AAC continue et intégrale, sans recodage aux frontières");
  const audioDuration=Number(audio[0].duration);
  assert.ok(Number.isFinite(audioDuration)&&Math.abs(audioDuration-seconds)<.1);
  assert.deepEqual(requests,[],"Aucun média envoyé à l'extérieur");
  assert.deepEqual(errors,[],"Aucune erreur JavaScript non gérée");
  t.diagnostic("NOVA long "+seconds+"s : "+JSON.stringify({
   windows:windows.length,videoFrames:pts.length,keyframes,
   copiedAACPackets:targetHashes.length,
   audioDuration,videoDuration:Number(video[0].duration),
   streamCount:data.streams.length,privateMedia:false,physicalSafari:false
  }));
 }finally{
  await browser?.close();
  if(server?.listening)await new Promise(done=>server.close(done));
  await fs.rm(dir,{recursive:true,force:true});
 }
});
