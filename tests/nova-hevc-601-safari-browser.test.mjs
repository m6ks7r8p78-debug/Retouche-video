/* Autotest interface Safari couleur : aucun fichier personnel, aucun POST,
 * refus propre si Chromium CI ne dispose pas d'un décodeur HEVC matériel.
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
test("NOVA Safari HEVC 1/1/6 : clic volontaire, huit patches et diagnostic privé",async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),"nova-hevc601-browser-"));
 let server,browser;
 try{
  await run(process.execPath,[path.join(root,"outils/build-nova-iphone-preview.mjs"),dir],
   {timeout:90000});
  const manifest=JSON.parse(await fs.readFile(path.join(dir,"asset-manifest.json"),"utf8"));
  assert.equal(manifest.publication,"none");
  assert.equal(manifest.privateMediaIncluded,false);
  const patch=manifest.files.find(x=>x.path==="experiences/nova-test-601-patches.mov");
  assert.equal(patch.origin,"ffmpeg-synthetic-only");
  const headers=await fs.readFile(path.join(dir,"_headers"),"utf8");
  const csp=headers.match(/^  Content-Security-Policy: (.+)$/m)?.[1];
  assert.ok(csp);
  server=http.createServer(async(req,res)=>{
   const pathname=new URL(req.url,"http://localhost").pathname;
   const filepath=path.resolve(dir,"."+pathname);
   if(!filepath.startsWith(dir+path.sep)){res.writeHead(403).end();return}
   try{
    const b=await fs.readFile(filepath);
    res.setHeader("Content-Security-Policy",csp);
    res.setHeader("Cache-Control","no-store");
    res.setHeader("Content-Type",filepath.endsWith(".js")?"text/javascript":
     filepath.endsWith(".json")?"application/json":
     filepath.endsWith(".html")?"text/html":"application/octet-stream");
    res.end(b);
   }catch{res.writeHead(404).end("not found")}
  });
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  const origin="http://127.0.0.1:"+server.address().port;
  browser=await chromium.launch({headless:true,...(process.env.CHROME?
   {executablePath:process.env.CHROME}:{})});
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const failures=[],uploads=[],external=[],requests=[];
  page.on("pageerror",e=>failures.push(e.message));
  page.on("request",r=>{
   requests.push(r.url());
   if(!r.url().startsWith(origin+"/")&&!r.url().startsWith("blob:")&&
     !r.url().startsWith("data:"))external.push(r.url());
   if(!["GET","HEAD"].includes(r.method()))uploads.push(r.url());
  });
  await page.goto(origin+"/experiences/nova.html#nova601ColorPanel");
  assert.equal(await page.locator("#nova601ColorPanel").getAttribute("open"),"");
  assert.equal(await page.locator("#nova601Json").getAttribute("href"),null);
  assert.equal(requests.some(v=>v.includes("nova-test-601-patches.mov")),false,
   "synthetic fixture must not be downloaded without a user click");
  await page.locator("#nova601Run").click();
  await page.waitForFunction(()=>!!document.querySelector("#nova601Json")?.getAttribute("href"),
   null,{timeout:90000});
  const report=await page.evaluate(async()=>{
   const url=document.querySelector("#nova601Json").href;
   return JSON.parse(await (await fetch(url)).text());
  });
  console.log("NOVA_HEVC_601_TEST_STATUS "+JSON.stringify({status:report.status,mean:report.meanAbsRgb255??null}));
  assert.equal(report.schema,"retoucheproai.nova.safari-hevc-601-patches.v1");
  assert.equal(report.origin,"ffmpeg-synthetic-only");
  assert.equal(report.privacy.personalMediaIncluded,false);
  assert.equal(report.privacy.rawFrameIncluded,false);
  assert.equal(report.privacy.networkUpload,false);
  assert.equal(report.privacy.deviceIdentifiersIncluded,false);
  const serialized=JSON.stringify(report);
  for(const disallowed of ["fileName","userAgent","gps","location","PRIVATE"])
   assert.ok(!serialized.includes(disallowed),disallowed);
  if(report.status==="measured-not-source-certified"){
   assert.deepEqual([report.source.primaries,report.source.transfer,
    report.source.matrix],[1,1,6]);
   assert.equal(report.patches.length,8);
   assert.ok(report.patches.every(x=>x.delta.length===3&&x.reference.length===3));
   assert.ok(report.meanAbsRgb255>=0&&report.meanAbsRgb255<256);
   assert.ok(report.maxAbsRgb255>=report.meanAbsRgb255);
  }else{
   // Chromium runner may lack HEVC. This must be honestly reported,
   // NOT a synthetic success and NOT an invented quality score.
   assert.equal(report.status,"unavailable");
   assert.ok(["webcodecs-hevc-unavailable","hevc-decoder-failed"].includes(report.errorCode),
    "Unexpected synthetic failure: "+report.errorCode);
   assert.equal(report.patches,undefined);
  }
  assert.equal(requests.some(v=>v.includes("nova-test-601-patches.mov")),true);
  assert.deepEqual(failures,[]);
  assert.deepEqual(uploads,[]);
  assert.deepEqual(external,[]);
 }finally{
  await browser?.close();
  if(server?.listening)await new Promise(ok=>server.close(ok));
  await fs.rm(dir,{recursive:true,force:true});
 }
});
