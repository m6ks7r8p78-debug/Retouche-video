/* NOVA 0.24 — Teste le BUNDLE autonome, pas le checkout GitHub.
 * L'archive statique est reconstruite dans un dossier temporaire.
 * Le navigateur charge exclusivement ce dossier servi en same-origin.
 * Chromium: MOV HEVC+AAC réel -> rapport JSON + MP4 ;
 * WebKit Linux: interface photo/diagnostic, sans prétendre être Safari iOS.
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
import {chromium,webkit} from "playwright";

const run=promisify(execFile);
const root=path.resolve(fileURLToPath(new URL("../",import.meta.url)));
const browserKind=process.env.NOVA_PREVIEW_BROWSER==="webkit"?"webkit":"chromium";
const engine=browserKind==="webkit"?webkit:chromium;
async function withSite(fn){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),"nova-preview-standalone-"));
 const app=http.createServer(async(req,res)=>{
  const pathname=new URL(req.url,"http://localhost").pathname;
  const p=path.resolve(dir,"."+pathname);
  if(!p.startsWith(dir+path.sep)){res.writeHead(403).end();return}
  try{
   const b=await fs.readFile(p);
   res.setHeader("Cache-Control","no-store");
   res.setHeader("Content-Type",p.endsWith(".html")?"text/html;charset=utf-8":
    p.endsWith(".js")?"text/javascript;charset=utf-8":
    p.endsWith(".wasm")?"application/wasm":
    p.endsWith(".json")?"application/json":"application/octet-stream");
   res.end(b);
  }catch{res.writeHead(404).end("missing")}
 });
 let browser;
 try{
  await run(process.execPath,[path.join(root,"outils/build-nova-iphone-preview.mjs"),dir],{timeout:30000});
  await new Promise(ok=>app.listen(0,"127.0.0.1",ok));
  const base="http://127.0.0.1:"+app.address().port;
  browser=await engine.launch({headless:true,...(
    browserKind==="chromium"&&process.env.CHROME?
    {executablePath:process.env.CHROME}:{})});
  const page=await browser.newPage({viewport:{width:390,height:844},acceptDownloads:true});
  const failures=[],requests=[];
  page.on("pageerror",x=>failures.push(x.message));
  page.on("response",r=>{if(r.status()>=400)failures.push(r.status()+" "+r.url())});
  page.on("request",x=>{
   if(!x.url().startsWith(base+"/")&&
      !x.url().startsWith("blob:")&&
      !x.url().startsWith("data:"))
     requests.push(x.url());
  });
  await page.goto(base+"/index.html");
  await page.getByText("Ouvrir le laboratoire NOVA").click();
  assert.match(page.url(),/\/experiences\/nova\.html$/);
  await fn({page,dir,base,failures,requests});
  assert.deepEqual(requests,[],"aucun appel tiers dans le paquet de staging");
  assert.deepEqual(failures,[],"scripts et assets du bundle local tous chargés");
 }finally{
  try{await browser?.close()}finally{
   if(app.listening)await new Promise(ok=>app.close(ok));
   await fs.rm(dir,{recursive:true,force:true});
  }
 }
}
test("NOVA 0.24 : bundle autonome sert la photo et les scripts, "+browserKind,async()=>{
 await withSite(async({page})=>{
  const png=await page.evaluate(()=>{
   const c=document.createElement("canvas");c.width=96;c.height=64;
   const x=c.getContext("2d");x.fillStyle="#35453a";x.fillRect(0,0,96,64);
   x.fillStyle="#b7a08a";x.fillRect(22,12,55,36);
   return c.toDataURL("image/png").split(",")[1];
  });
  await page.locator("#file").setInputFiles({name:"photo-local-only.png",
   mimeType:"image/png",buffer:Buffer.from(png,"base64")});
  await page.waitForFunction(()=>!document.querySelector("#run").disabled);
  await page.locator("#run").click();
  await page.waitForFunction(()=>!document.querySelector("#save").disabled);
  assert.equal(await page.locator("#before").isVisible(),true);
  assert.equal(await page.locator("#after").isVisible(),true);
  assert.equal(await page.locator("#iphoneBenchRun").isEnabled(),false);
  const w=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
  assert.ok(w<=3,"débordement viewport 390 px : "+w);
 });
});
test("NOVA 0.24 : MOV HEVC+AAC depuis archive autonome vers JSON local, "+browserKind,async(t)=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),"nova-preview-video-"));
 const media=path.join(temp,"private-not-share.mov");
 try{
  await run("ffmpeg",["-hide_banner","-loglevel","error",
   "-f","lavfi","-i","testsrc2=size=160x90:rate=15:duration=1.2",
   "-f","lavfi","-i","sine=frequency=850:duration=1.2",
   "-map","0:v:0","-map","1:a:0",
   "-c:v","libx265","-preset","ultrafast","-threads","1",
   "-x265-params","pools=none:frame-threads=1:log-level=error:bframes=2",
   "-pix_fmt","yuv420p",
   "-color_range","tv","-color_primaries","bt709","-color_trc","bt709",
   "-colorspace","bt709","-movflags","+write_colr+faststart",
   "-c:a","aac","-b:a","128k","-y",media],{timeout:60000});
  await withSite(async({page})=>{
   await page.locator("#file").setInputFiles(media);
   await page.locator("#iphoneBenchPanel summary").click();
   assert.equal(await page.locator("#iphoneBenchRun").isEnabled(),true);
   await page.locator("#iphoneBenchRun").click();
   await page.waitForFunction(()=>!!document.querySelector("#iphoneBenchJson")?.getAttribute("href"),
    null,{timeout:90000});
   const dl=page.waitForEvent("download");
   await page.locator("#iphoneBenchJson").click();
   const data=JSON.parse(await fs.readFile(await (await dl).path(),"utf8"));
   assert.equal(data.schema,"retoucheproai.nova.iphone-lab.v1");
   assert.equal(data.source.containerVideo,"hevc");
   assert.equal(data.privacy.mediaUploaded,false);
   assert.equal(JSON.stringify(data).includes("private-not-share"),false);
   assert.equal(Object.hasOwn(data,"userAgent"),false);
   if(browserKind==="chromium"){
    assert.equal(data.result,"success","standalone HEVC export: "+data.errorCode);
    assert.equal(data.output.audio,"aac-copy");
    assert.equal(data.output.colorVerified,true);
    assert.ok(data.output.mp4SizeBytes>1024);
    assert.ok(data.output.pipelineElapsedMs>0);
    assert.match(await page.locator("#iphoneBenchMp4").getAttribute("href")||"",/^blob:/);
   }else{
    // WebKit/Linux peut ne pas fournir VideoEncoder. Refus = résultat sûr.
    assert.ok(["success","refused"].includes(data.result));
    if(data.result==="refused")
     assert.equal(await page.locator("#iphoneBenchMp4").getAttribute("href"),null);
   }
   t.diagnostic("NOVA preview "+browserKind+" : "+
    JSON.stringify({status:data.result,errorCode:data.errorCode,
     durationMs:data.output?.pipelineElapsedMs||null}));
  });
 }finally{await fs.rm(temp,{recursive:true,force:true})}
});
