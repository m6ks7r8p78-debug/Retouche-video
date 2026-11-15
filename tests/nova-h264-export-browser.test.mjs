/* NOVA H264/AAC : vrai parcours navigateur sur fichier synthétique.
 * L'import et le précontrôle sont locaux. L'export MP4 est volontaire.
 * Chromium ≠ Safari physique ; pas de média personnel.
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
const exec=promisify(execFile);
const root=path.resolve(fileURLToPath(new URL("../",import.meta.url)));
test("H264/AAC synthétique : précontrôle et vrai MP4 natif après clic explicite",async(t)=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),"nova-h264-av-"));
 let server=null,browser=null;
 try{
  await exec(process.execPath,[path.join(root,"outils/build-nova-iphone-preview.mjs"),dir],
   {timeout:90000});
  const headers=await fs.readFile(path.join(dir,"_headers"),"utf8");
  const csp=headers.match(/^  Content-Security-Policy: (.+)$/m)?.[1];
  assert.ok(csp);
  server=http.createServer(async(req,res)=>{
   const pathname=new URL(req.url,"http://localhost").pathname;
   const file=path.resolve(dir,"."+pathname);
   if(!file.startsWith(dir+path.sep)){res.writeHead(403).end();return}
   try{
    const b=await fs.readFile(file);
    res.setHeader("Content-Security-Policy",csp);
    res.setHeader("Cache-Control","no-store");
    res.setHeader("Content-Type",file.endsWith(".html")?"text/html":
     file.endsWith(".js")?"text/javascript":file.endsWith(".mp4")?"video/mp4":
     file.endsWith(".wasm")?"application/wasm":"application/octet-stream");
    res.end(b);
   }catch{res.writeHead(404).end("missing")}
  });
  await new Promise(ok=>server.listen(0,"127.0.0.1",ok));
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
  assert.equal(await page.locator("#exportVideo").isEnabled(),false);
  const input=path.join(dir,"experiences/nova-h264-aac-synthetic.mp4");
  await page.locator("#file").setInputFiles(input);
  await page.waitForFunction(()=>!document.querySelector("#novaRealPreflightRun").disabled);
  assert.equal(await page.locator("#downloadVideo").getAttribute("href"),null);
  await page.locator("#novaRealPreflightPanel summary").click();
  await page.locator("#novaRealPreflightRun").click();
  await page.waitForFunction(()=>!!document.querySelector("#novaRealPreflightJson").getAttribute("href"),
    null,{timeout:30000});
  const pending=page.waitForEvent("download");
  await page.locator("#novaRealPreflightJson").click();
  const file=await pending,report=JSON.parse(await fs.readFile(await file.path(),"utf8"));
  t.diagnostic("H264 preflight: "+JSON.stringify({
   status:report.status,engine:report.sourceEngine,audio:report.audio,
   estimatedMiB:report.estimatedMiB}));
  assert.equal(report.source.codec,"h264");
  assert.equal(report.sourceEngine,"webcodecs-h264-native-pts");
  assert.equal(report.status,"ready-for-export-attempt");
  assert.equal(report.readyForExportAttempt,true);
  assert.equal(report.audio,"aac-copy-verified");
  assert.equal(report.privacy.mediaUploaded,false);
  assert.equal(report.privacy.mediaModified,false);
  assert.equal(report.exportProposal.fps,15);
  assert.equal(report.exportProposal.width,160);
  assert.equal(report.exportProposal.height,90);
  assert.ok(!JSON.stringify(report).includes("nova-h264-aac-synthetic.mp4"));
  assert.equal(await page.locator("#downloadVideo").getAttribute("href"),null,
   "Aucun export ne démarre avant le clic utilisateur");
  await page.locator("#exportVideo").click();
  await page.waitForFunction(()=>
   !!document.querySelector("#downloadVideo").getAttribute("href")||
   document.querySelector("#exportStatus").textContent.startsWith("Export refusé"),
   null,{timeout:90000});
  const status=await page.locator("#exportStatus").innerText();
  assert.match(await page.locator("#downloadVideo").getAttribute("href")||"",/^blob:/,status);
  assert.match(status,/audio AAC original copié/,status);
  assert.match(status,/PTS natifs/,status);
  const dlPending=page.waitForEvent("download");
  await page.locator("#downloadVideo").click();
  const downloaded=await dlPending;
  const output=await downloaded.path();
  const {stdout}=await exec("ffprobe",["-v","error",
   "-show_entries","stream=codec_name,codec_type,width,height,avg_frame_rate",
   "-of","json",output],{timeout:20000});
  const streams=JSON.parse(stdout).streams;
  assert.ok(streams.some(x=>x.codec_type==="video"&&x.codec_name==="h264"&&
   x.width===160&&x.height===90&&x.avg_frame_rate==="15/1"));
  assert.ok(streams.some(x=>x.codec_type==="audio"&&x.codec_name==="aac"));
  const hash=async p=>{
   const {stdout}=await exec("ffprobe",["-v","error","-select_streams","a:0",
    "-show_packets","-show_entries","packet=data_hash",
    "-show_data_hash","sha256","-of","json",p],{timeout:20000});
   return JSON.parse(stdout).packets.map(x=>x.data_hash);
  };
  const [originalAudio,outputAudio]=await Promise.all([hash(input),hash(output)]);
  assert.ok(outputAudio.length>0);
  assert.deepEqual(outputAudio,originalAudio.slice(0,outputAudio.length),
   "Paquets AAC source conservés sans réencodage");
  assert.deepEqual(errors,[]);
  assert.deepEqual(external,[]);
  assert.deepEqual(uploads,[]);
  t.diagnostic("H264/AAC export: "+JSON.stringify({
    width:160,height:90,fps:15,copiedAACPackets:outputAudio.length,
    localOnly:true,iphonePhysical:false}));
 }finally{
  await browser?.close();
  if(server?.listening)await new Promise(ok=>server.close(ok));
  await fs.rm(dir,{recursive:true,force:true});
 }
});
