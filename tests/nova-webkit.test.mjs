/* NOVA 0.14 — test WebKit Linux indépendant de Chromium.
 * Ne remplace PAS Safari sur iPhone : codecs par OS variables.
 * Aucun test de lecture HEVC/AAC n'est marqué réussi si absent.
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
import {webkit} from "playwright";

const root=path.resolve(fileURLToPath(new URL("../",import.meta.url)));
const run=promisify(execFile);
function server(){
 return http.createServer(async(req,res)=>{
  const p=path.resolve(root,"."+new URL(req.url,"http://localhost").pathname);
  if(!p.startsWith(root+path.sep)){res.writeHead(403).end();return}
  try{
   const b=await fs.readFile(p);
   res.setHeader("Content-Type",p.endsWith(".html")?"text/html;charset=utf-8":
    p.endsWith(".js")?"text/javascript;charset=utf-8":"application/octet-stream");
   res.end(b);
  }catch{res.writeHead(404).end("Not found")}
 });
}
async function session(callback,{viewport={width:390,height:844}}={}){
 const app=server();await new Promise(resolve=>app.listen(0,"127.0.0.1",resolve));
 let browser;
 try{
  browser=await webkit.launch({headless:true});
  const page=await browser.newPage({viewport,acceptDownloads:true});
  const errors=[],external=[];
  page.on("pageerror",e=>errors.push(e.message));
  page.on("request",r=>{
   if(!r.url().startsWith("http://127.0.0.1:")&&
      !r.url().startsWith("blob:")&&!r.url().startsWith("data:"))
    external.push(r.url());
  });
  await page.goto("http://127.0.0.1:"+app.address().port+"/experiences/nova.html");
  await callback({page,errors,external});
 }finally{
  try{await browser?.close()}finally{
   if(app.listening)await new Promise(resolve=>app.close(resolve));
  }
 }
}
test("NOVA WebKit : photo locale, rendu, export PNG et aucun transfert externe",async()=>{
 await session(async({page,errors,external})=>{
  assert.match(await page.title(),/NOVA/);
  const png=await page.evaluate(()=>{
   const c=document.createElement("canvas");c.width=96;c.height=64;
   const x=c.getContext("2d");x.fillStyle="#35453a";x.fillRect(0,0,96,64);
   x.fillStyle="#b7a08a";x.fillRect(22,12,55,36);
   return c.toDataURL("image/png").split(",")[1];
  });
  await page.locator("#file").setInputFiles({name:"webkit-local.png",
   mimeType:"image/png",buffer:Buffer.from(png,"base64")});
  await page.waitForFunction(()=>!document.querySelector("#run").disabled);
  await page.locator("#run").click();
  await page.waitForFunction(()=>!document.querySelector("#save").disabled);
  assert.match(await page.locator("#metrics").innerText(),/Régions inspectées/);
  const dl=page.waitForEvent("download");
  await page.locator("#save").click();
  const file=await dl;
  assert.match(file.suggestedFilename(),/nova_apercu\.png$/);
  const overflow=await page.evaluate(()=>{
    const w=document.documentElement.scrollWidth-innerWidth;
    const offenders=[...document.querySelectorAll("body *")].map(el=>{
      const r=el.getBoundingClientRect();
      return {tag:el.tagName,id:el.id,cls:String(el.className||"").slice(0,55),
        right:Math.round(r.right),left:Math.round(r.left),width:Math.round(r.width),
        scroll:el.scrollWidth,client:el.clientWidth};
    }).filter(x=>x.right>innerWidth+3).sort((a,b)=>b.right-a.right).slice(0,12);
    const scrollSources=[document.documentElement,document.body,
      ...document.querySelectorAll("body *")].map(el=>{
      const r=el.getBoundingClientRect(),style=getComputedStyle(el);
      return {tag:el.tagName,id:el.id,cls:String(el.className||"").slice(0,40),
        left:Math.round(r.left),right:Math.round(r.right),
        sw:el.scrollWidth,cw:el.clientWidth,
        cssOverflow:style.overflowX,cssMinWidth:style.minWidth};
    }).filter(x=>x.sw>x.cw+4).sort((a,b)=>b.sw-b.cw-(a.sw-a.cw)).slice(0,14);
    return {w,viewport:innerWidth,htmlScroll:document.documentElement.scrollWidth,
      bodyScroll:document.body.scrollWidth,offenders,scrollSources};
  });
  assert.ok(overflow.w<4,"débordement horizontal sur viewport iPhone : "+JSON.stringify(overflow));
  assert.deepEqual(errors,[]);
  assert.deepEqual(external,[]);
 });
});
test("NOVA WebKit : son MP4 analysé localement et WebCodecs contrôlé sans repli muet",async(t)=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),"nova-webkit-"));
 const source=path.join(dir,"sample.mp4");
 try{
  await run("ffmpeg",["-hide_banner","-loglevel","error",
   "-f","lavfi","-i","testsrc2=size=160x90:rate=15:duration=1.2",
   "-f","lavfi","-i","sine=frequency=550:duration=1.2",
   "-c:v","libx264","-bf","0","-pix_fmt","yuv420p","-c:a","aac",
   "-movflags","+faststart","-shortest","-y",source]);
  await session(async({page,errors,external})=>{
   await page.locator("#file").setInputFiles(source);
   const check=await page.evaluate(async()=>{
    const f=document.querySelector("#file").files[0];
    const a=await NOVA_AVSYNC.analyser(f);
    const copy=await NOVA_AAC_COPY.planifier(f,{durationSeconds:1.2});
    const d=await NOVA_DEMUX.analyser(f);
    const v=document.createElement("video");
    const cap={videoDecoder:typeof VideoDecoder==="function",
      videoEncoder:typeof VideoEncoder==="function",
      mp4Playback:v.canPlayType('video/mp4; codecs="avc1.42E01E, mp4a.40.2"'),
      hev1Playback:v.canPlayType('video/mp4; codecs="hvc1.1.6.L120.B0"')};
    const fake={restituer(){},arbitrer(){}};
    let reason="";
    if(!cap.videoEncoder||!cap.videoDecoder){
      try{await NOVA_EXPORT.exporter({file:f,moteur:fake,arbitre:fake,allowSilent:false})}
      catch(e){reason=e.message}
    }
    return {a,copy:{mode:copy.mode,packets:copy.packets.length},
      demux:d?{codec:d.codec,frames:d.ns}:null,cap,reason};
   });
   assert.equal(check.copy.mode,"aac-copy");
   assert.ok(check.copy.packets>=40);
   assert.ok(check.a.samples>=40);
   assert.ok(check.demux?.frames>=15);
   if(!check.cap.videoEncoder||!check.cap.videoDecoder){
    assert.match(check.reason,/WebCodecs|muxer MP4 indisponible/,
     "WebKit incomplet doit refuser l'export au lieu d'effacer le son");
   }
   t.diagnostic("WebKit Linux non Safari iPhone — capacités : "+JSON.stringify(check.cap)+
     " ; analyse AAC : "+check.copy.packets+" paquets"+
     (check.reason?" ; refus sûr : "+check.reason:""));
   assert.deepEqual(errors,[]);
   assert.deepEqual(external,[]);
  });
 }finally{await fs.rm(dir,{recursive:true,force:true})}
});


test("NOVA WebKit : vrai export H.264/AAC quand les deux codecs sont opérationnels",async(t)=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),"nova-webkit-export-"));
 const source=path.join(dir,"source.mp4");
 try{
  await run("ffmpeg",["-hide_banner","-loglevel","error",
   "-f","lavfi","-i","testsrc2=size=160x90:rate=15:duration=1.2",
   "-f","lavfi","-i","sine=frequency=640:duration=1.2",
   "-map","0:v:0","-map","1:a:0",
   "-c:v","libx264","-bf","0","-pix_fmt","yuv420p",
   "-c:a","aac","-b:a","128k","-movflags","+faststart",
   "-shortest","-y",source]);
  await session(async({page,errors,external})=>{
   await page.locator("#file").setInputFiles(source);
   const cap=await page.evaluate(async()=>{
    const f=document.querySelector("#file").files[0];
    const info=await NOVA_DEMUX.analyser(f);
    if(!info)throw Error("Démultiplexeur MP4 source indisponible");
    const d=typeof VideoDecoder==="function"&&
     (await VideoDecoder.isConfigSupported({codec:info.codec,
       description:info.desc,codedWidth:info.W,codedHeight:info.H})).supported;
    const e=typeof VideoEncoder==="function"&&
     (await VideoEncoder.isConfigSupported({codec:"avc1.42E01F",
       width:160,height:90,framerate:15,bitrate:550000,
       avc:{format:"avc"},latencyMode:"quality"})).supported;
    const v=document.querySelector("#video");
    return {decoder:d,encoder:e,codec:info.codec,
      nativeWidth:v.videoWidth,nativeHeight:v.videoHeight,
      nativeReadyState:v.readyState};
   });
   // Les versions WebKit/Linux peuvent annoncer canPlayType ("probably")
   // mais ne pas savoir décoder le profil réel. Ne jamais confondre les deux.
   const canAttempt=cap.decoder&&cap.encoder&&
    cap.nativeWidth===160&&cap.nativeHeight===90;
   const ready=await page.locator("#exportVideo").isEnabled();
   if(!ready){
    assert.equal(canAttempt,false,
      "Codec et média utilisables, mais export inexplicablement désactivé");
    t.diagnostic("WebKit MP4 non chargé sur ce Linux ; aucun export présenté : "+JSON.stringify(cap));
   }else{
    await page.locator("#exportVideo").click();
    await page.waitForFunction(()=>!!document.querySelector("#downloadVideo")?.getAttribute("href")||
      document.querySelector("#exportStatus").textContent.startsWith("Export refusé"),
      null,{timeout:90000});
    const status=await page.locator("#exportStatus").innerText();
    const href=await page.locator("#downloadVideo").getAttribute("href");
    if(canAttempt){
     assert.match(href||"",/^blob:/,"WebKit supporte ce H.264, export attendu : "+status);
     assert.match(status,/audio AAC original copié/);
     const pending=page.waitForEvent("download");
     await page.locator("#downloadVideo").click();
     const saved=await pending,out=await saved.path();
     const ff=await run("ffprobe",["-v","error","-show_entries","stream=codec_type,codec_name",
       "-of","json",out]);
     const streams=JSON.parse(ff.stdout).streams||[];
     assert.ok(streams.some(x=>x.codec_type==="video"&&x.codec_name==="h264"));
     assert.ok(streams.some(x=>x.codec_type==="audio"&&x.codec_name==="aac"));
     t.diagnostic("WebKit vrai export audiovisuel MP4 H.264/AAC : "+JSON.stringify(cap));
    }else{
     assert.equal(href,null,
      "WebKit incomplet ne doit pas présenter une vidéo exportée avec du son perdu");
     assert.match(status,/Export refusé/);
     t.diagnostic("WebKit refuse explicitement codecs manquants : "+JSON.stringify(cap)+
       " ; "+status);
    }
   }
   assert.deepEqual(errors,[]);
   assert.deepEqual(external,[]);
  });
 }finally{await fs.rm(dir,{recursive:true,force:true})}
});
