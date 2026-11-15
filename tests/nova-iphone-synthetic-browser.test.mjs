/* NOVA 0.24 — essai de bout en bout avec un HEVC/AAC entièrement synthétique.
 * Ce test ne prouve jamais une exécution sur iPhone physique.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {fileURLToPath} from "node:url";
import {chromium} from "playwright";
const root=path.resolve(fileURLToPath(new URL("../",import.meta.url)));
const preview=path.join(root,"dist","nova-iphone-preview");
const run=promisify(execFile);
function server(){
 return http.createServer(async(req,res)=>{
  const p=path.resolve(preview,"."+new URL(req.url,"http://localhost").pathname);
  if(!p.startsWith(preview+path.sep)){res.writeHead(403).end();return}
  try{
   const data=await fs.readFile(p);
   res.setHeader("Content-Type",p.endsWith(".js")?"text/javascript;charset=utf-8":
    p.endsWith(".html")?"text/html;charset=utf-8":
    p.endsWith(".wasm")?"application/wasm":
    p.endsWith(".mov")?"video/quicktime":"application/octet-stream");
   res.end(data);
  }catch{res.writeHead(404).end("Not found")}
 });
}
test("NOVA 0.24 : un clic charge le clip HEVC/AAC synthétique sans upload ni vidéo privée",async t=>{
 const manifest=JSON.parse(await fs.readFile(path.join(preview,"asset-manifest.json"),"utf8"));
 assert.equal(manifest.publication,"none");
 assert.equal(manifest.version,"0.24");
 assert.ok(manifest.files.some(x=>x.path==="experiences/nova-test-synthetic.mov"));
 const app=server();let browser;
 try{
  await new Promise(ok=>app.listen(0,"127.0.0.1",ok));
  browser=await chromium.launch({headless:true,...(process.env.CHROME?{executablePath:process.env.CHROME}:{})});
  const page=await browser.newPage({viewport:{width:390,height:844},acceptDownloads:true});
  const errors=[],external=[],uploads=[];
  page.on("pageerror",err=>errors.push(err.message));
  page.on("request",req=>{
   if(!req.url().startsWith("http://127.0.0.1:")&&
      !req.url().startsWith("blob:")&&!req.url().startsWith("data:"))
    external.push(req.url());
   if(req.method()!=="GET"&&req.method()!=="HEAD")uploads.push(req.url());
  });
  await page.goto("http://127.0.0.1:"+app.address().port+"/experiences/nova.html");
  assert.equal(await page.locator("#iphoneBenchRun").isEnabled(),false);
  await page.locator("#iphoneBenchPanel summary").click();
  await page.locator("#iphoneBenchSynthetic").click();
  await page.waitForFunction(()=>!!document.querySelector("#iphoneBenchJson")?.getAttribute("href")||
   document.querySelector("#iphoneBenchStatus")?.textContent.includes("Impossible de terminer"),
   null,{timeout:90000});
  const jsonLink=await page.locator("#iphoneBenchJson").getAttribute("href");
  assert.match(jsonLink||"",/^blob:/,"le rapport de test est toujours local");
  const pending=page.waitForEvent("download");
  await page.locator("#iphoneBenchJson").click();
  const downloaded=await pending;
  const report=JSON.parse(await fs.readFile(await downloaded.path(),"utf8"));
  assert.equal(report.schema,"retoucheproai.nova.iphone-lab.v1");
  assert.equal(report.sourceKind,"synthetic-generated");
  assert.equal(report.source.containerVideo,"hevc");
  assert.equal(report.source.width,160);
  assert.equal(report.source.height,90);
  assert.ok(report.source.inputBytes>1000&&report.source.inputBytes<100000);
  assert.equal(report.privacy.automaticSharing,false);
  assert.equal(report.privacy.includesFileName,false);
  const mp4Link=await page.locator("#iphoneBenchMp4").getAttribute("href");
  if(report.result==="success"){
   assert.match(mp4Link||"",/^blob:/);
   const pendingVideo=page.waitForEvent("download");
   await page.locator("#iphoneBenchMp4").click();
   const output=await pendingVideo;
   const {stdout}=await run("ffprobe",["-v","error",
    "-show_entries","stream=codec_name,codec_type",
    "-of","json",await output.path()],{timeout:10000});
   const streams=JSON.parse(stdout).streams||[];
   assert.ok(streams.some(s=>s.codec_name==="h264"&&s.codec_type==="video"));
   assert.ok(streams.some(s=>s.codec_name==="aac"&&s.codec_type==="audio"));
  }else{
   assert.equal(report.result,"refused");
   assert.equal(mp4Link,null,"aucun MP4 si l'environnement refuse le pilote");
   assert.equal(typeof report.errorCode,"string");
  }
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
  assert.ok(overflow<4,"interface utilisable sur largeur iPhone");
  assert.deepEqual(errors,[]);
  assert.deepEqual(external,[]);
  assert.deepEqual(uploads,[]);
  t.diagnostic("Diagnostic synthétique (Chromium, pas Safari physique) : "+
   JSON.stringify({result:report.result,errorCode:report.errorCode,
    outputBytes:report.output?.outputBytes||null}));
 }finally{
  try{await browser?.close()}finally{
   if(app.listening)await new Promise(ok=>app.close(ok));
  }
 }
});
