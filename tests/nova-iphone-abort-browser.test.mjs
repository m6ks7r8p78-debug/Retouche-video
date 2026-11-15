/* NOVA 0.27 — interruption navigateur, reprise visuelle et sécurité des liens.
 * Simulation de pagehide pendant une conversion locale synthétique différée.
 * Ce n'est PAS un véritable test Safari iOS ni de libération de RAM native.
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
import {chromium,webkit} from "playwright";
const repo=path.resolve(fileURLToPath(new URL("../",import.meta.url)));
const exec=promisify(execFile);
const engineName=process.env.NOVA_PREVIEW_BROWSER==="webkit"?"webkit":"chromium";
const engine=engineName==="webkit"?webkit:chromium;
async function preview(fn){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),"nova-abort-"+engineName+"-"));
 let browser=null;
 const site=http.createServer(async(req,res)=>{
  const candidate=path.resolve(dir,"."+new URL(req.url,"http://local").pathname);
  if(!candidate.startsWith(dir+path.sep)){res.writeHead(403).end();return}
  try{
   const b=await fs.readFile(candidate);
   res.setHeader("Content-Type",candidate.endsWith(".js")?"text/javascript;charset=utf-8":
    candidate.endsWith(".html")?"text/html;charset=utf-8":
    candidate.endsWith(".wasm")?"application/wasm":
    candidate.endsWith(".mov")?"video/quicktime":"application/octet-stream");
   res.end(b);
  }catch{res.writeHead(404).end("missing")}
 });
 try{
  await exec(process.execPath,[path.join(repo,"outils/build-nova-iphone-preview.mjs"),dir],{timeout:30000});
  await new Promise(resolve=>site.listen(0,"127.0.0.1",resolve));
  browser=await engine.launch({headless:true,...(engineName==="chromium"&&process.env.CHROME?
   {executablePath:process.env.CHROME}:{})});
  const page=await browser.newPage({viewport:{width:390,height:844},acceptDownloads:true});
  const errors=[],uploads=[],foreign=[];
  const base="http://127.0.0.1:"+site.address().port;
  page.on("pageerror",e=>errors.push(e.message));
  page.on("request",r=>{
   if(r.method()!=="GET"&&r.method()!=="HEAD")uploads.push(r.url());
   if(!r.url().startsWith(base+"/")&&!r.url().startsWith("blob:")&&
      !r.url().startsWith("data:"))foreign.push(r.url());
  });
  await page.goto(base+"/experiences/nova.html");
  await page.locator("#iphoneBenchPanel summary").click();
  await fn(page);
  assert.deepEqual(errors,[],"aucune erreur JS");
  assert.deepEqual(uploads,[],"aucun envoi de média");
  assert.deepEqual(foreign,[],"aucune dépendance externe");
 }finally{
  try{await browser?.close()}finally{
   if(site.listening)await new Promise(resolve=>site.close(resolve));
   await fs.rm(dir,{recursive:true,force:true});
  }
 }
}
test("NOVA 0.27 : pagehide pendant rapport retardé ne crée jamais de MP4/JSON "+engineName,async()=>{
 await preview(async page=>{
  await page.evaluate(()=>{
   const api=window.NOVA_IPHONE_REPORT;
   window.NOVA_IPHONE_REPORT={...api,executer:()=>new Promise(resolve=>{
    window.__finishLater=()=>resolve({
     report:{result:"success",sourceKind:"synthetic-generated"},
     outputBlob:new Blob(["fake-should-never-be-exposed"],{type:"video/mp4"})
    });
   })};
  });
  await page.locator("#iphoneBenchSynthetic").click();
  await page.waitForFunction(()=>typeof window.__finishLater==="function",null,{timeout:15000});
  await page.evaluate(()=>{
   window.dispatchEvent(new Event("pagehide"));
   window.__finishLater();
  });
  await page.waitForFunction(()=>document.querySelector("#iphoneBenchSynthetic")?.textContent===
   "Tester Safari sans vidéo personnelle",null,{timeout:15000});
  assert.equal(await page.locator("#iphoneBenchJson").getAttribute("href"),null);
  assert.equal(await page.locator("#iphoneBenchMp4").getAttribute("href"),null);
  assert.match(await page.locator("#iphoneBenchInterruptionJson").getAttribute("href")||"",/^blob:/);
  const pending=page.waitForEvent("download");
  await page.locator("#iphoneBenchInterruptionJson").click();
  const receipt=JSON.parse(await fs.readFile(await (await pending).path(),"utf8"));
  assert.equal(receipt.trigger,"pagehide");
  assert.equal(receipt.workflow,"single-export");
  assert.equal(receipt.sourceKind,"synthetic-generated");
  assert.equal(receipt.status,"cancelled");
  assert.equal(receipt.mediaIncluded,false);
  assert.equal(receipt.automaticSharing,false);
  assert.equal(receipt.physicalIphoneCertified,false);
  assert.equal(receipt.nativeMemoryReleased,false);
  assert.match(await page.locator("#iphoneBenchStatus").innerText(),/annulé|interrompu/i);
  assert.equal(await page.locator("#iphoneBenchSynthetic").isEnabled(),true);
 });
});
test("NOVA 0.27 : pagehide au troisième succès provisoire refuse le bilan de stabilité "+engineName,async()=>{
 await preview(async page=>{
  await page.evaluate(()=>{
   window.__countSynthetic=0;
   const api=window.NOVA_IPHONE_REPORT;
   window.NOVA_IPHONE_REPORT={...api,executer:async()=>{
    window.__countSynthetic++;
    if(window.__countSynthetic===3)window.dispatchEvent(new Event("pagehide"));
    return {report:{
     schema:"retoucheproai.nova.iphone-lab.v1",
     sourceKind:"synthetic-generated",result:"success",
     output:{outputWidth:160,outputHeight:90,outputFps:15,
      outputFrames:15,audio:"aac-copy",colorVerified:true,mode:"hevc-wasm",
      pipelineElapsedMs:200,wasmHeapCapacityPeakBytes:21037056,mp4SizeBytes:5000}
    },outputBlob:new Blob(["not-published"])};
   }};
  });
  await page.locator("#iphoneBenchStabilityRun").click();
  await page.waitForFunction(()=>window.__countSynthetic===3&&
    document.querySelector("#iphoneBenchStabilityRun")?.textContent===
    "Vérifier la stabilité · 3 essais synthétiques",null,{timeout:15000});
  assert.equal(await page.locator("#iphoneBenchStabilityJson").getAttribute("href"),null);
  assert.equal(await page.locator("#iphoneBenchMp4").getAttribute("href"),null);
  const pending=page.waitForEvent("download");
  await page.locator("#iphoneBenchInterruptionJson").click();
  const receipt=JSON.parse(await fs.readFile(await (await pending).path(),"utf8"));
  assert.equal(receipt.trigger,"pagehide");
  assert.equal(receipt.workflow,"three-synthetic-runs");
  assert.equal(receipt.status,"cancelled");
  assert.equal(receipt.physicalIphoneCertified,false);
  assert.match(await page.locator("#iphoneBenchStabilityStatus").innerText(),/annulée|interrompue/i);
  assert.equal(await page.locator("#iphoneBenchStabilityRun").isEnabled(),true);
 });
});

test("NOVA 0.28 : annulation manuelle laisse seulement un reçu local "+engineName,async()=>{
 await preview(async page=>{
  await page.evaluate(()=>{
   const api=window.NOVA_IPHONE_REPORT;
   window.NOVA_IPHONE_REPORT={...api,executer:()=>new Promise(resolve=>{
    window.__finishAfterCancel=()=>resolve({
     report:{result:"success",sourceKind:"synthetic-generated"},
     outputBlob:new Blob(["fake-output-not-allowed"])
    });
   })};
  });
  await page.locator("#iphoneBenchSynthetic").click();
  await page.waitForFunction(()=>typeof window.__finishAfterCancel==="function",null,{timeout:15000});
  await page.locator("#iphoneBenchSynthetic").click();
  await page.evaluate(()=>window.__finishAfterCancel());
  await page.waitForFunction(()=>document.querySelector("#iphoneBenchSynthetic")?.textContent===
   "Tester Safari sans vidéo personnelle",null,{timeout:15000});
  assert.equal(await page.locator("#iphoneBenchJson").getAttribute("href"),null);
  assert.equal(await page.locator("#iphoneBenchMp4").getAttribute("href"),null);
  assert.match(await page.locator("#iphoneBenchInterruptionJson").getAttribute("href")||"",/^blob:/);
  const pending=page.waitForEvent("download");
  await page.locator("#iphoneBenchInterruptionJson").click();
  const receipt=JSON.parse(await fs.readFile(await (await pending).path(),"utf8"));
  assert.equal(receipt.trigger,"user");
  assert.equal(receipt.workflow,"single-export");
  assert.equal(receipt.status,"cancelled");
  assert.equal(receipt.mediaUploaded,false);
  assert.equal(receipt.nativeMemoryReleased,false);
  assert.equal(receipt.physicalIphoneCertified,false);
  assert.equal(receipt.fileNameIncluded,false);
  assert.equal(await page.locator("#iphoneBenchSynthetic").isEnabled(),true);
 });
});
