/* NOVA HD : exercice A/V H264 synthétique sous CSP.
 * Vraie vidéo courte créée par FFmpeg, aucune vidéo utilisateur.
 * Le vrai chemin HEVC natif iPhone restera à essayer physiquement.
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
const run=promisify(execFile),root=path.resolve(fileURLToPath(new URL("../",import.meta.url)));
test("NOVA HD : PNG source original conservé, H264+AAC synthétique exporté 1:1 sous CSP",async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),"nova-hd-browse-"));
 const sample=path.join(dir,"video-dummy-with-audio.mp4");
 let server,browser;
 try{
  await run(process.execPath,[path.join(root,"outils/build-nova-iphone-preview.mjs"),dir],
   {timeout:90000});
  await run("ffmpeg",["-hide_banner","-loglevel","error","-nostdin",
   "-f","lavfi","-i","testsrc2=size=160x120:rate=15:duration=1",
   "-f","lavfi","-i","sine=frequency=660:sample_rate=48000:duration=1",
   "-map","0:v:0","-map","1:a:0","-c:v","libx264",
   "-pix_fmt","yuv420p","-bf","0","-preset","ultrafast","-threads","1",
   "-color_primaries","bt709","-color_trc","bt709","-colorspace","bt709",
   "-movflags","+faststart+write_colr","-c:a","aac","-b:a","64k","-y",sample],{timeout:45000});
  const csp=(await fs.readFile(path.join(dir,"_headers"),"utf8"))
   .match(/^  Content-Security-Policy: (.+)$/m)?.[1];
  assert.ok(csp);
  server=http.createServer(async(req,res)=>{
   const pathname=new URL(req.url,"http://localhost").pathname;
   const dest=path.resolve(dir,"."+pathname);
   if(!dest.startsWith(dir+path.sep)){res.writeHead(403).end();return}
   try{
    const b=await fs.readFile(dest);
    res.setHeader("Content-Security-Policy",csp);
    res.setHeader("Cache-Control","no-store");
    res.setHeader("Content-Type",dest.endsWith(".js")?"text/javascript":
     dest.endsWith(".html")?"text/html":dest.endsWith(".wasm")?
     "application/wasm":"application/octet-stream");
    res.end(b);
   }catch{res.writeHead(404).end("missing")}
  });
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  const base="http://127.0.0.1:"+server.address().port;
  browser=await chromium.launch({headless:true,...(process.env.CHROME?
   {executablePath:process.env.CHROME}:{})});
  const page=await browser.newPage({viewport:{width:390,height:844},acceptDownloads:true});
  const failures=[],upload=[],external=[];
  page.on("pageerror",e=>failures.push(e.message));
  page.on("request",r=>{
   if(!r.url().startsWith(base+"/")&&!r.url().startsWith("blob:")&&!r.url().startsWith("data:"))
    external.push(r.url());
   if(!["GET","HEAD"].includes(r.method()))upload.push(r.url());
  });
  await page.goto(base+"/experiences/nova.html");
  await page.locator("#novaHdPanel summary").click();
  assert.equal(await page.locator("#novaHdRun").isEnabled(),false);
  await page.locator("#file").setInputFiles(sample);
  await page.waitForFunction(()=>!document.querySelector("#novaHdRun").disabled);
  assert.match(await page.locator("#novaHdOriginal").getAttribute("href")||"",/^blob:/);
  assert.equal(await page.locator("#novaHdSave").getAttribute("href"),null,
   "no processing starts automatically");
  const old=page.waitForEvent("download");
  await page.locator("#novaHdOriginal").click();
  assert.deepEqual(await fs.readFile(await (await old).path()),await fs.readFile(sample),
   "original downloadable byte-for-byte unchanged");
  await page.locator("#novaHdRun").click();
  await page.waitForFunction(()=>{
   const s=document.querySelector("#novaHdStatus")?.textContent||"";
   return !!document.querySelector("#novaHdSave")?.getAttribute("href")||
    /Essai HD non abouti/.test(s);
  },null,{timeout:100000});
  const s=await page.locator("#novaHdStatus").textContent();
  assert.match(s,/MP4 HD exporté/,s);
  const dl=page.waitForEvent("download");
  await page.locator("#novaHdSave").click();
  const fname=await (await dl).path();
  const check=JSON.parse((await run("ffprobe",["-v","error","-show_streams",
   "-show_format","-of","json",fname],{timeout:10000})).stdout);
  const v=check.streams.find(x=>x.codec_type==="video");
  const a=check.streams.find(x=>x.codec_type==="audio");
  assert.equal(v.codec_name,"h264");
  assert.equal(v.width,160);assert.equal(v.height,120);
  assert.equal(Number(v.nb_frames),15);
  assert.equal(a.codec_name,"aac");
  assert.ok(Math.abs(Number(check.format.duration)-1)<0.2);
  // Simulation d'une vraie ambiguïté colr : les pixels H.264 sont
  // réellement décodés, mais le conteneur source ne donne plus de colr.
  // Le moteur doit utiliser VideoFrame.colorSpace plutôt que déclarer HDR.
  await page.evaluate(()=>{
   const analyse=window.NOVA_DEMUX.analyser;
   window.NOVA_DEMUX.analyser=async f=>{
    const v=await analyse(f);
    return f instanceof File&&v?{...v,color:null}:v;
   };
  });
  await page.locator("#novaHdRun").click();
  await page.waitForFunction(()=>{
   const msg=document.querySelector("#novaHdStatus")?.textContent||"";
   return !!document.querySelector("#novaHdSave")?.getAttribute("href")||
    /Essai HD non abouti/.test(msg);
  },null,{timeout:100000});
  const unknownColorStatus=await page.locator("#novaHdStatus").textContent();
  assert.match(unknownColorStatus,/MP4 HD exporté/,
   "VideoFrame SDR color must resolve absent source colr: "+unknownColorStatus);
  const secondDL=page.waitForEvent("download");
  await page.locator("#novaHdSave").click();
  const secondFile=await (await secondDL).path();
  const checkSecond=JSON.parse((await run("ffprobe",["-v","error","-show_streams",
   "-of","json",secondFile],{timeout:10000})).stdout);
  assert.equal(checkSecond.streams.find(x=>x.codec_type==="video")?.width,160);
  assert.equal(checkSecond.streams.find(x=>x.codec_type==="video")?.height,120);
  assert.equal(checkSecond.streams.find(x=>x.codec_type==="audio")?.codec_name,"aac");
  assert.deepEqual(failures,[]);
  assert.deepEqual(external,[]);
  assert.deepEqual(upload,[]);
 }finally{
  await browser?.close();
  if(server?.listening)await new Promise(ok=>server.close(ok));
  await fs.rm(dir,{recursive:true,force:true});
 }
});
