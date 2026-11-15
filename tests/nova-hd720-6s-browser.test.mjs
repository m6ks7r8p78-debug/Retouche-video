/* NOVA sortie HD réelle — source H.264/AAC 1280×720 à 30fps
 * MP4 1280×720 à 15 fps avec contrôle BT.709, OPFS et AAC.
 * Fixtures 100 % synthétiques et locales. Ce banc NE valide pas l'iPhone.
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
import PATH from "../experiences/nova-h264-path.js";
const run=promisify(execFile);
const root=path.resolve(fileURLToPath(new URL("../",import.meta.url)));
const parse=async(file,opts=["-show_streams"])=>{
 const {stdout}=await run("ffprobe",["-v","error",...opts,"-of","json",file],{timeout:30000});
 return JSON.parse(stdout);
};
test("NOVA HD720 6 secondes : vrai MP4 1280x720/15fps OPFS avec PTS/AAC continus",async(t)=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),"nova-720p-fidelity-"));
 let server=null,browser=null;
 try{
  const input=path.join(dir,"hd-input.mp4");
  await run("ffmpeg",[
   "-hide_banner","-loglevel","error","-nostdin",
   "-f","lavfi","-i","testsrc2=size=1280x720:rate=30:duration=6",
   "-f","lavfi","-i","sine=frequency=900:sample_rate=48000:duration=6",
   "-map","0:v:0","-map","1:a:0",
   "-c:v","libx264","-preset","ultrafast","-threads","2","-bf","0",
   "-x264-params","colorprim=bt709:transfer=bt709:colormatrix=bt709:range=limited",
   "-pix_fmt","yuv420p","-color_primaries","bt709",
   "-color_trc","bt709","-colorspace","bt709",
   "-c:a","aac","-ac","1","-b:a","64k",
   "-movflags","+faststart+write_colr","-f","mp4","-y",input
  ],{timeout:90000});
  const original=await parse(input);
  const video0=original.streams.find(x=>x.codec_type==="video");
  const audio0=original.streams.find(x=>x.codec_type==="audio");
  assert.deepEqual([video0.codec_name,video0.width,video0.height],["h264",1280,720]);
  assert.equal(audio0.codec_name,"aac");
  assert.equal(video0.avg_frame_rate,"30/1");
  const app=path.join(dir,"site");
  await run(process.execPath,[path.join(root,"outils/build-nova-iphone-preview.mjs"),app],
   {timeout:90000});
  const headers=await fs.readFile(path.join(app,"_headers"),"utf8");
  const csp=headers.match(/^  Content-Security-Policy: (.+)$/m)?.[1];
  assert.ok(csp,"CSP required");
  server=http.createServer(async(req,res)=>{
   const p=path.resolve(app,"."+new URL(req.url,"http://localhost").pathname);
   if(!p.startsWith(app+path.sep)){res.writeHead(403).end();return}
   try{
    const b=await fs.readFile(p);
    res.setHeader("Content-Security-Policy",csp);
    res.setHeader("Cache-Control","no-store");
    res.setHeader("Content-Type",p.endsWith(".html")?"text/html":
     p.endsWith(".js")?"text/javascript":p.endsWith(".wasm")?"application/wasm":
     p.endsWith(".mp4")?"video/mp4":"application/octet-stream");
    res.end(b);
   }catch{res.writeHead(404).end("not-found")}
  });
  await new Promise(done=>server.listen(0,"127.0.0.1",done));
  const base="http://127.0.0.1:"+server.address().port;
  browser=await chromium.launch({headless:true,...(process.env.CHROME?
   {executablePath:process.env.CHROME}:{})});
  const page=await browser.newPage({viewport:{width:390,height:844},acceptDownloads:true});
  const external=[],uploads=[],errors=[];
  page.on("request",r=>{
   if(!r.url().startsWith(base+"/")&&!r.url().startsWith("blob:")&&
      !r.url().startsWith("data:"))external.push(r.url());
   if(!["GET","HEAD"].includes(r.method()))uploads.push(r.url());
  });
  page.on("pageerror",e=>errors.push(e.message));
  await page.goto(base+"/experiences/nova.html");
  await page.locator("#file").setInputFiles(input);
  await page.waitForFunction(()=>!document.querySelector("#novaRealPreflightRun").disabled);
  assert.equal(await page.locator("#downloadVideo").getAttribute("href"),null);
  // HD ne doit jamais être un défaut ni un effet d'une importation.
  assert.equal(await page.locator("#outputHd720").isChecked(),false);
  await page.locator("details:has(#writeOpfs) summary").click();
  await page.locator("#writeOpfs").check();
  await page.locator("#outputHd720").check();
  await page.locator("#novaRealPreflightPanel summary").click();
  await page.locator("#novaRealPreflightRun").click();
  await page.waitForFunction(()=>!!document.querySelector("#novaRealPreflightJson").getAttribute("href"),
   null,{timeout:60000});
  const pending=page.waitForEvent("download");
  await page.locator("#novaRealPreflightJson").click();
  const pre=JSON.parse(await fs.readFile(await (await pending).path(),"utf8"));
  t.diagnostic("HD preflight "+JSON.stringify({
   status:pre.status,codec:pre.source.codec,dimensions:[pre.source.width,pre.source.height],
   proposed:pre.exportProposal,audio:pre.audio,estimatedMiB:pre.estimatedMiB}));
  assert.equal(pre.status,"ready-for-export-attempt");
  assert.equal(pre.source.codec,"h264");
  assert.deepEqual([pre.source.width,pre.source.height],[1280,720]);
  assert.equal(pre.readyForExportAttempt,true);
  assert.equal(pre.audio,"aac-copy-verified");
  assert.deepEqual([pre.exportProposal.width,pre.exportProposal.height,
   pre.exportProposal.fps,pre.exportProposal.frames],[1280,720,15,90]);
  assert.equal(pre.pilotLimits.maxDurationMs,6000);
  assert.equal(pre.outputProfile,"h264-hd720-opfs-6s");
  assert.equal(pre.pilotLimits.outputSideMax,1280);
  assert.equal(pre.privacy.mediaUploaded,false);
  assert.equal(await page.locator("#downloadVideo").getAttribute("href"),null);
  await page.evaluate(()=>{
   const original=globalThis.Mp4Muxer;
   globalThis.Mp4Muxer={...original,ArrayBufferTarget:class{
    constructor(){throw Error("UNEXPECTED_HD_IN_MEMORY_MUXER")}
   }};
  });
  await page.locator("#exportVideo").click();
  await page.waitForFunction(()=>
   !!document.querySelector("#downloadVideo").getAttribute("href")||
    document.querySelector("#exportStatus").textContent.startsWith("Export refusé"),
   null,{timeout:180000});
  const status=await page.locator("#exportStatus").innerText();
  assert.match(await page.locator("#downloadVideo").getAttribute("href")||"",/^blob:/,status);
  assert.match(status,/audio AAC original copié/);
  assert.match(status,/PTS natifs/);
  assert.match(status,/1280 × 720/);
  assert.match(status,/écrit progressivement en stockage privé local/);
  const outPending=page.waitForEvent("download");
  await page.locator("#downloadVideo").click();
  const outPath=await (await outPending).path();
  const final=await parse(outPath);
  const video1=final.streams.find(x=>x.codec_type==="video");
  const audio1=final.streams.find(x=>x.codec_type==="audio");
  assert.deepEqual([video1.codec_name,video1.width,video1.height,
   video1.avg_frame_rate],["h264",1280,720,"15/1"]);
  assert.equal(audio1.codec_name,"aac");
  assert.deepEqual([video1.color_range,video1.color_primaries,
   video1.color_transfer,video1.color_space],["tv","bt709","bt709","bt709"],
   "La sortie SDR H264 doit porter une couleur explicite, pas un colr inventé");
  const duration0=Number(video0.duration),duration1=Number(video1.duration);
  assert.ok(Number.isFinite(duration0)&&Number.isFinite(duration1));
  assert.ok(Math.abs(duration0-6)<0.15);
  assert.ok(Math.abs(duration1-6)<0.15);
  assert.ok(Math.abs(Number(audio1.duration)-6)<0.15);
  const frames=await parse(outPath,["-count_frames","-select_streams","v:0",
   "-show_entries","stream=nb_read_frames"]);
  assert.equal(Number(frames.streams[0].nb_read_frames),90,"90 trames HD réellement décodées");
  const hashes=async file=>{
   const packet=await parse(file,["-select_streams","a:0","-show_packets",
    "-show_entries","packet=data_hash","-show_data_hash","sha256"]);
   return packet.packets.map(x=>x.data_hash);
  };
  const [a,b]=await Promise.all([hashes(input),hashes(outPath)]);
  assert.ok(b.length>250,"La piste AAC de 6 s ne doit pas être tronquée à 2–3 s");
  assert.equal(b.length,a.length,"Tous les paquets AAC source doivent être présents");
  assert.deepEqual(b,a,"AAC bitstream intégral conservé à l'identique");
  const {stdout:md5}=await run("ffmpeg",["-v","error","-i",outPath,
   "-map","0:v:0","-f","framemd5","-"],{timeout:30000,maxBuffer:4*1048576});
  const checksum=md5.split("\n").filter(x=>x.trim()&&!x.startsWith("#")&&x.includes(","))
   .map(x=>x.split(",").at(-1).trim());
  assert.equal(checksum.length,90,"90 trames 720p décodées sans tronquage");
  assert.ok(new Set(checksum).size>=80,"vidéo dynamique avec images distinctes");
  const videoPackets=await parse(outPath,["-select_streams","v:0","-show_packets",
   "-show_entries","packet=pts_time,duration_time,flags"]);
  assert.equal(videoPackets.packets.length,90);
  const pts=videoPackets.packets.map(p=>Number(p.pts_time));
  assert.ok(Math.abs(pts[0])<0.003,"PTS initial 0");
  for(let i=1;i<pts.length;i++){
   const gap=pts[i]-pts[i-1];
   assert.ok(gap>0.066&&gap<0.0675,
    "Aucune rupture, répétition ou lacune PTS à "+i);
  }
  // Le rapport privé est téléchargeable indépendamment de la vidéo.
  await page.locator("#novaLocalExportReportPanel summary").click();
  const reportPending=page.waitForEvent("download");
  await page.locator("#novaLocalExportReportJson").click();
  const metrics=JSON.parse(await fs.readFile(await (await reportPending).path(),"utf8"));
  assert.equal(metrics.status,"local-mp4-created");
  assert.deepEqual([metrics.output.width,metrics.output.height,
   metrics.output.fps,metrics.output.frames],[1280,720,15,90]);
  assert.equal(metrics.opfs.streamUsed,true);
  assert.ok(metrics.opfs.peakPendingBytes<=2*1048576);
  assert.equal(metrics.totalDeviceMemoryMeasured,false);
  assert.equal(metrics.physicalIphoneVerified,false);
  assert.ok(!JSON.stringify(metrics).includes("hd-input"));
  assert.deepEqual(errors,[],"aucune erreur de script navigateur");
  assert.deepEqual(external,[],"aucun appel réseau externe");
  assert.deepEqual(uploads,[],"aucun upload");
  t.diagnostic("HD export "+JSON.stringify({
    input:"1280x720@30",output:"1280x720@15",frames:checksum.length,
    differentFrames:new Set(checksum).size,identicalAACPackets:b.length,
    ptsContinuous:true,opfsPeakBytes:metrics.opfs.peakPendingBytes,
    colr:"bt709-limited",webkitPhysical:false}));
 }finally{
  await browser?.close();
  if(server?.listening)await new Promise(done=>server.close(done));
  await fs.rm(dir,{recursive:true,force:true});
 }
});
