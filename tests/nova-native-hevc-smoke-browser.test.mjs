/* Banc navigateur : bouton HEVC NATIF distinct du moteur HEVC WebAssembly.
 * Chromium peut légitimement ne pas offrir HEVC; l'échec doit être explicite,
 * privé et sans MP4 présenté comme réussi. Aucune preuve Safari physique.
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
const expectedStages=["fixture","source-contract","native-decoder","native-encoder",
 "source-aac","native-export","output-aac"];
test("NOVA HEVC natif : test opt-in via mire synthétique, rapport sans média privé sous CSP",async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),"nova-native-hevc-smoke-"));
 let browser,server;
 try{
  await run(process.execPath,[path.join(root,"outils/build-nova-iphone-preview.mjs"),dir],{
   timeout:90000
  });
  const headers=await fs.readFile(path.join(dir,"_headers"),"utf8");
  const csp=headers.match(/^  Content-Security-Policy: (.+)$/m)?.[1];
  assert.ok(csp);
  assert.ok((await fs.readFile(path.join(dir,"experiences/nova.html"),"utf8"))
   .includes('src="nova-native-hd-smoke-ui.js"'));
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
     "application/wasm":dest.endsWith(".mov")?"video/quicktime":"application/octet-stream");
    res.end(bytes);
   }catch{res.writeHead(404).end("missing")}
  });
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  const base="http://127.0.0.1:"+server.address().port;
  browser=await chromium.launch({headless:true,...(process.env.CHROME?
   {executablePath:process.env.CHROME}:{})});
  const page=await browser.newPage({viewport:{width:390,height:844},acceptDownloads:true});
  const errors=[],uploads=[],external=[],fixtureFetch=[];
  page.on("pageerror",e=>errors.push(e.message));
  page.on("request",r=>{
   if(!r.url().startsWith(base+"/")&&!r.url().startsWith("blob:")&&
      !r.url().startsWith("data:"))external.push(r.url());
   if(!["GET","HEAD"].includes(r.method()))uploads.push(r.url());
   if(r.url().endsWith("/experiences/nova-test-synthetic.mov"))fixtureFetch.push(r.url());
  });
  await page.goto(base+"/experiences/nova.html");
  await page.locator("#novaHdPanel summary").click();
  assert.equal(await page.locator("#file").inputValue(),"");
  assert.equal(await page.locator("#novaHdSyntheticJson").getAttribute("href"),null);
  assert.equal(await page.locator("#novaHdSyntheticMp4").getAttribute("href"),null);
  assert.equal(fixtureFetch.length,0,"no synthetic request before voluntary click");
  await page.locator("#novaHdSyntheticRun").click();
  await page.waitForFunction(()=>{
   const a=document.querySelector("#novaHdSyntheticJson");
   const s=document.querySelector("#novaHdSyntheticStatus")?.textContent||"";
   return !!a?.getAttribute("href")||/Test annulé/.test(s);
  },null,{timeout:110000});
  assert.equal(fixtureFetch.length,1,"fetch exact same-origin synthetic source");
  const raw=await page.evaluate(async()=>{
   const link=document.getElementById("novaHdSyntheticJson");
   const response=await fetch(link.href);
   return await response.json();
  });
  assert.equal(raw.schema,"retoucheproai.nova.native-hevc-smoke.v1");
  assert.equal(raw.sourceKind,"bundled-ffmpeg-synthetic-hevc-aac");
  assert.equal(raw.privacy.userMediaRead,false);
  assert.equal(raw.privacy.externalUpload,false);
  assert.equal(raw.privacy.filenameInReport,false);
  assert.equal(raw.proof.physicalIphoneCertified,false);
  assert.equal(raw.proof.perceptualQualityCertified,false);
  assert.equal(raw.proof.browserExecution,true);
  assert.equal(await page.locator("#file").inputValue(),"");
  assert.ok(["failed","success"].includes(raw.result),JSON.stringify(raw));
  if(raw.result==="failed"){
   assert.ok(expectedStages.includes(raw.failedAt),JSON.stringify(raw));
   assert.equal(raw.errorCode,raw.failedAt+"-failed");
   assert.equal(raw.decodedByNative,false);
   assert.equal(await page.locator("#novaHdSyntheticMp4").getAttribute("href"),null,
    "no MP4 download if native HEVC path is not verified");
  }else{
   assert.equal(raw.decodedByNative,true);
   assert.equal(raw.encodedByNative,true);
   assert.equal(raw.preservedAac,true);
   assert.equal(raw.output?.codec,"h264");
   assert.equal(raw.output?.audio,"aac-copy");
   assert.match(await page.locator("#novaHdSyntheticMp4").getAttribute("href")||"",/^blob:/);
  }
  const report=JSON.stringify(raw);
  for(const forbidden of ["PRIVATE_FACE","userAgent","gps","SECRET","PRIVATE_FILE"])
   assert.ok(!report.includes(forbidden));
  assert.deepEqual(errors,[]);
  assert.deepEqual(uploads,[]);
  assert.deepEqual(external,[]);
 }finally{
  await browser?.close();
  if(server?.listening)await new Promise(ok=>server.close(ok));
  await fs.rm(dir,{recursive:true,force:true});
 }
});
