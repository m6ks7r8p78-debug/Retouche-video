/* Browser integration test: video chosen locally, two frames, advisory JSON only.
 * Real browser + purely synthetic H.264 clip. Not a physical iPhone test.
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
test("NOVA × SmallMotion : import H.264 synthétique, bouton opt-in et rapport local sans upload",async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),"nova-motion-browser-"));
 const clip=path.join(dir,"motion-test.mp4");
 const preview=path.join(dir,"preview");
 let browser,server;
 try{
  await run("ffmpeg",["-hide_banner","-loglevel","error","-nostdin",
   "-f","lavfi","-i","testsrc2=size=160x120:rate=15:duration=1.2",
   "-c:v","libx264","-threads","1","-pix_fmt","yuv420p",
   "-movflags","+faststart","-y",clip],{timeout:60000});
  await run(process.execPath,[path.join(root,"outils/build-nova-iphone-preview.mjs"),preview],{timeout:60000});
  const staticHeaders=await fs.readFile(path.join(preview,"_headers"),"utf8");
  const csp=staticHeaders.match(/^  Content-Security-Policy: (.+)$/m)?.[1];
  assert.ok(csp&&csp.includes("wasm-unsafe-eval"),"politique HTTPS non créée");
  server=http.createServer(async(req,res)=>{
   const pathname=new URL(req.url,"http://localhost").pathname;
   const p=path.resolve(preview,"."+pathname);
   if(!p.startsWith(preview+path.sep)){res.writeHead(403).end();return}
   try{
    const b=await fs.readFile(p);
    res.setHeader("Content-Security-Policy",csp);
    res.setHeader("Referrer-Policy","no-referrer");
    res.setHeader("X-Robots-Tag","noindex, nofollow, noarchive");
    res.setHeader("Content-Type",p.endsWith(".html")?"text/html;charset=utf-8":
      p.endsWith(".js")?"text/javascript;charset=utf-8":
      p.endsWith(".wasm")?"application/wasm":
      p.endsWith(".mov")?"video/quicktime":"application/octet-stream");
    res.end(b);
   }catch{res.writeHead(404).end("not found")}
  });
  await new Promise(ok=>server.listen(0,"127.0.0.1",ok));
  browser=await chromium.launch({headless:true,
   ...(process.env.CHROME?{executablePath:process.env.CHROME}:{})});
  const page=await browser.newPage({viewport:{width:390,height:844},acceptDownloads:true});
  const errors=[],external=[],uploads=[];
  page.on("pageerror",e=>errors.push(e.message));
  page.on("request",r=>{
   if(!r.url().startsWith("http://127.0.0.1:")&&
      !r.url().startsWith("blob:")&&!r.url().startsWith("data:"))
    external.push(r.url());
   if(!["GET","HEAD"].includes(r.method()))uploads.push(r.url());
  });
  await page.goto("http://127.0.0.1:"+server.address().port+"/experiences/nova.html");
  assert.equal(await page.locator("#novaMotionRun").isEnabled(),false);
  assert.equal(await page.locator("#novaMotionJson").getAttribute("href"),null);
  await page.locator("#file").setInputFiles(clip);
  await page.waitForFunction(()=>!document.querySelector("#novaMotionRun").disabled);
  assert.equal(await page.locator("#novaMotionJson").getAttribute("href"),null,
   "aucun traitement ou rapport sans consentement de lancement");
  await page.locator("#novaMotionPanel summary").click();
  await page.locator("#novaMotionRun").click();
  await page.waitForFunction(()=>!!document.querySelector("#novaMotionJson").getAttribute("href")||
    document.querySelector("#novaMotionStatus").textContent.includes("Diagnostic impossible"),
   null,{timeout:30000});
  const msg=await page.locator("#novaMotionStatus").innerText();
  assert.match(await page.locator("#novaMotionJson").getAttribute("href")||"",/^blob:/,msg);
  const pending=page.waitForEvent("download");
  await page.locator("#novaMotionJson").click();
  const file=await pending;
  const report=JSON.parse(await fs.readFile(await file.path(),"utf8"));
  assert.equal(report.provenance,"smallmotion_local_2frame_v1");
  assert.equal(report.sourceKind,"local-user-file");
  assert.equal(report.action,"no_automatic_change");
  assert.equal(report.confidence,"not_calibrated");
  assert.deepEqual(report.analysisDimensions,[160,120]);
  assert.equal(report.frames,2);
  assert.equal(report.privacy.rawPixelsInReport,false);
  assert.equal(report.privacy.uploaded,false);
  assert.ok(!JSON.stringify(report).includes("motion-test.mp4"));
  assert.ok(!JSON.stringify(report).includes("base64"));
  // Deuxième parcours : mire H.264 servie par le même paquet, sans aucun média privé.
  await page.locator("#novaMotionSynthetic").click();
  await page.waitForFunction(()=>{
    const url=document.querySelector("#novaMotionJson")?.getAttribute("href");
    const status=document.querySelector("#novaMotionStatus")?.textContent||"";
    return !!url&&status.startsWith("Diagnostic :")||!!url&&status.includes("zone(s)");
  },null,{timeout:30000});
  const syntheticPending=page.waitForEvent("download");
  await page.locator("#novaMotionJson").click();
  const syntheticDownload=await syntheticPending;
  const syntheticReport=JSON.parse(await fs.readFile(await syntheticDownload.path(),"utf8"));
  assert.equal(syntheticReport.sourceKind,"synthetic-generated");
  assert.equal(syntheticReport.action,"no_automatic_change");
  assert.equal(syntheticReport.confidence,"not_calibrated");
  assert.equal(syntheticReport.privacy.uploaded,false);
  assert.deepEqual(syntheticReport.analysisDimensions,[160,120]);
  assert.ok(!JSON.stringify(syntheticReport).includes("motion-test.mp4"));
  assert.ok(!JSON.stringify(syntheticReport).includes("NOVA_mire_synthetique_H264.mp4"));
  assert.deepEqual(errors,[],"aucune erreur CSP ou JS");
  assert.deepEqual(external,[],"aucune requête vers un domaine tiers");
  assert.deepEqual(uploads,[],"aucune requête POST/PUT");
  assert.deepEqual(errors,[]);
  assert.deepEqual(external,[]);
  assert.deepEqual(uploads,[]);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)<4);
 }finally{
  await browser?.close();
  if(server?.listening)await new Promise(resolve=>server.close(resolve));
  await fs.rm(dir,{recursive:true,force:true});
 }
});
