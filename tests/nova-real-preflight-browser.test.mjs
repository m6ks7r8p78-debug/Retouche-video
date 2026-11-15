/* NOVA 0.25 : parcours de précontrôle de vidéos sélectionnées, sous vraie CSP.
 * Exercice sur deux fixtures FFmpeg exclusivement synthétiques, sans export.
 * Chromium n'est pas Safari iOS : test de non-régression, pas certification.
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
test("NOVA 0.25: vidéo HEVC/AAC admissible puis H264 refusé sans exporter ni réseau externe",async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),"nova-preflight-http-"));
 let server,browser;
 try{
  await exec(process.execPath,[path.join(root,"outils/build-nova-iphone-preview.mjs"),dir],{timeout:90000});
  const headers=await fs.readFile(path.join(dir,"_headers"),"utf8");
  const csp=headers.match(/^  Content-Security-Policy: (.+)$/m)?.[1];
  assert.ok(csp,"CSP absente");
  server=http.createServer(async(req,res)=>{
   const pathname=new URL(req.url,"http://localhost").pathname;
   const dest=path.resolve(dir,"."+pathname);
   if(!dest.startsWith(dir+path.sep)){res.writeHead(403).end();return}
   try{
    const buf=await fs.readFile(dest);
    res.setHeader("Content-Security-Policy",csp);
    res.setHeader("Cache-Control","no-store");
    res.setHeader("Content-Type",dest.endsWith(".html")?"text/html":
     dest.endsWith(".js")?"text/javascript":dest.endsWith(".mp4")?"video/mp4":
     dest.endsWith(".mov")?"video/quicktime":dest.endsWith(".wasm")?"application/wasm":
     "application/octet-stream");
    res.end(buf);
   }catch{res.writeHead(404).end("missing")}
  });
  await new Promise(ok=>server.listen(0,"127.0.0.1",ok));
  const base="http://127.0.0.1:"+server.address().port;
  browser=await chromium.launch({headless:true,...(process.env.CHROME?
   {executablePath:process.env.CHROME}:{})});
  const page=await browser.newPage({viewport:{width:390,height:844},acceptDownloads:true});
  const errors=[],external=[],uploads=[];
  page.on("pageerror",e=>errors.push(e.message));
  page.on("request",r=>{
   if(!r.url().startsWith(base+"/")&&!r.url().startsWith("blob:")&&!r.url().startsWith("data:"))
    external.push(r.url());
   if(!["GET","HEAD"].includes(r.method()))uploads.push(r.url());
  });
  await page.goto(base+"/experiences/nova.html");
  const panel=page.locator("#novaRealPreflightPanel");
  assert.equal(await page.locator("#novaRealPreflightRun").isEnabled(),false);
  assert.equal(await page.locator("#novaRealPreflightJson").getAttribute("href"),null);
  await panel.locator("summary").click();
  const source=path.join(dir,"experiences/nova-test-synthetic.mov");
  await page.locator("#file").setInputFiles(source);
  await page.waitForFunction(()=>!document.querySelector("#novaRealPreflightRun").disabled);
  assert.equal(await page.locator("#novaRealPreflightJson").getAttribute("href"),null,
   "l'import n'entraîne pas d'analyse");
  assert.equal(await page.locator("#iphoneBenchMp4").getAttribute("href"),null,
   "l'import n'entraîne pas d'export");
  await page.locator("#novaRealPreflightRun").click();
  await page.waitForFunction(()=>!!document.querySelector("#novaRealPreflightJson").getAttribute("href"),
   null,{timeout:30000});
  const a=page.waitForEvent("download");
  await page.locator("#novaRealPreflightJson").click();
  const downloaded=await a;
  const report=JSON.parse(await fs.readFile(await downloaded.path(),"utf8"));
  assert.equal(report.schema,"retoucheproai.nova.real-preflight.v1");
  assert.equal(report.status,"ready-for-export-attempt");
  assert.equal(report.audio,"aac-copy-verified");
  assert.equal(report.source.codec,"hevc");
  assert.equal(report.readyForExportAttempt,true);
  assert.equal(report.privacy.mediaUploaded,false);
  assert.equal(report.privacy.mediaModified,false);
  assert.equal(report.exportProposal.fps,15);
  assert.equal(await page.locator("#iphoneBenchMp4").getAttribute("href"),null);
  assert.equal(await page.locator("#downloadVideo").getAttribute("href"),null);
  const h264=path.join(dir,"experiences/nova-smallmotion-synthetic.mp4");
  await page.locator("#file").setInputFiles(h264);
  assert.equal(await page.locator("#novaRealPreflightJson").getAttribute("href"),null,
   "nouvelle source révoque le rapport précédent");
  await page.locator("#novaRealPreflightRun").click();
  await page.waitForFunction(()=>!!document.querySelector("#novaRealPreflightJson").getAttribute("href"),
   null,{timeout:30000});
  const b=page.waitForEvent("download");
  await page.locator("#novaRealPreflightJson").click();
  const second=JSON.parse(await fs.readFile(await (await b).path(),"utf8"));
  assert.equal(second.status,"unsupported-video-codec");
  assert.equal(second.source.codec,"h264");
  assert.equal(second.readyForExportAttempt,false);
  assert.equal(second.exportProposal,null);
  assert.ok(!JSON.stringify(second).includes("nova-smallmotion-synthetic.mp4"));
  // Simulation UI uniquement : données entièrement synthétiques, aucune
  // vidéo privée ni analyse haute résolution réelle dans ce test Chromium.
  await page.evaluate(()=>{
   const base=window.NOVA_REAL_PREFLIGHT;
   window.NOVA_REAL_PREFLIGHT={...base,inspect:async()=>({
    schema:"retoucheproai.nova.real-preflight.v1",version:1,
    status:"hevc-profile-or-timeline-incompatible",readyForExportAttempt:false,
    source:{bytes:2400000,videoCategory:"local-video",codec:"hevc",
     width:1080,height:1920,durationMs:6000,frames:180,estimatedSourceFps:30},
    audio:"not-tested",estimatedMiB:null,exportProposal:null,
    blockers:["coded-pixels-over-limit","source-frames-over-limit"],
    advisories:["source-rate-above-output-rate"],
    pilotLimits:{codedPixelAreaMax:230400,sourceFramesMax:90,maxDurationMs:12000,outputFpsMax:15}
   })};
  });
  await page.locator("#file").setInputFiles({
   name:"SYNTHETIC_UI_ONLY.mov",mimeType:"video/quicktime",
   buffer:Buffer.alloc(2000)
  });
  await page.locator("#novaRealPreflightRun").click();
  await page.waitForFunction(()=>!!document.querySelector("#novaRealPreflightJson").getAttribute("href"),
   null,{timeout:30000});
  const message=await page.locator("#novaRealPreflightStatus").textContent();
  assert.match(message,/Résolution trop élevée/);
  assert.match(message,/1080 × 1920/);
  assert.match(message,/180/);
  assert.match(message,/30 images\/s/);
  assert.match(message,/15 images\/s/);
  assert.match(message,/audio/);
  assert.equal(await page.locator("#iphoneBenchMp4").getAttribute("href"),null,
   "même un résultat haute résolution ne doit pas exporter automatiquement");
  assert.deepEqual(errors,[],"aucune erreur JS");
  assert.deepEqual(external,[],"aucune requête externe");
  assert.deepEqual(uploads,[],"aucun upload");
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)<=3);
 }finally{
  await browser?.close();
  if(server?.listening)await new Promise(ok=>server.close(ok));
  await fs.rm(dir,{recursive:true,force:true});
 }
});
