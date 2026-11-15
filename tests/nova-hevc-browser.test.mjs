/* NOVA 0.14 : source HEVC/H.265 réelle + rotation MP4 90°.
 * Le décodeur WebCodecs doit être réellement disponible, sinon refus explicite.
 * Aucune vidéo privée ni service externe.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import {promisify} from "node:util";
import {execFile} from "node:child_process";
import {fileURLToPath} from "node:url";
import {chromium} from "playwright";
import DEMUX from "../experiences/nova-demux.js";
const run=promisify(execFile),root=path.resolve(fileURLToPath(new URL("../",import.meta.url)));
function server(){
 return http.createServer(async(req,res)=>{
  const p=path.resolve(root,"."+new URL(req.url,"http://localhost").pathname);
  if(!p.startsWith(root+path.sep)){res.writeHead(403).end();return}
  try{
   const bytes=await fs.readFile(p);
   res.setHeader("Content-Type",p.endsWith(".html")?"text/html;charset=utf-8":
    p.endsWith(".js")?"text/javascript;charset=utf-8":"application/octet-stream");
   res.end(bytes);
  }catch{res.writeHead(404).end("not found")}
 });
}
function pivoterSource90(raw){
 const b=Buffer.from(raw),type=o=>b.toString("ascii",o+4,o+8);
 function boxes(start,end){
  const result=[];
  for(let o=start;o<end;){
   if(o+8>end)throw Error("boîte MP4 tronquée");
   const n=b.readUInt32BE(o);
   if(n<8||o+n>end)throw Error("taille boîte MP4 invalide");
   result.push({start:o,end:o+n,type:type(o)});o+=n;
  }
  return result;
 }
 const moov=boxes(0,b.length).find(x=>x.type==="moov");
 assert.ok(moov,"boîte moov source HEVC");
 const trak=boxes(moov.start+8,moov.end).find(x=>{
  if(x.type!=="trak")return false;
  const mdia=boxes(x.start+8,x.end).find(y=>y.type==="mdia");
  const hdlr=mdia&&boxes(mdia.start+8,mdia.end).find(y=>y.type==="hdlr");
  return hdlr&&b.toString("ascii",hdlr.start+16,hdlr.start+20)==="vide";
 });
 assert.ok(trak,"piste HEVC");
 const tkhd=boxes(trak.start+8,trak.end).find(x=>x.type==="tkhd");
 assert.ok(tkhd,"tkhd source");
 const ver=b[tkhd.start+8],at=tkhd.start+8+(ver===1?52:40);
 assert.ok(at+36<=tkhd.end,"matrice MP4 complète");
 const matrix=[0,65536,0,-65536,0,0,90*65536,0,1073741824];
 matrix.forEach((x,i)=>b.writeInt32BE(x,at+4*i));
 return b;
}
async function audioHashes(file){
 const {stdout}=await run("ffprobe",["-v","error","-select_streams","a:0",
  "-show_packets","-show_entries","packet=data_hash","-show_data_hash","sha256",
  "-of","json",file],{maxBuffer:4*1024*1024});
 return (JSON.parse(stdout).packets||[]).map(x=>x.data_hash);
}
test("NOVA 0.14 : HEVC iPhone portrait 90° — décoder ou refuser fidèlement",async(t)=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),"nova-hevc-"));
 const base=path.join(dir,"landscape.mp4"),rotated=path.join(dir,"portrait.mp4"),app=server();
 try{
  await run("ffmpeg",["-hide_banner","-loglevel","error",
   "-f","lavfi","-i","testsrc2=size=160x90:rate=15:duration=1.2",
   "-f","lavfi","-i","sine=frequency=650:duration=1.2",
   "-map","0:v:0","-map","1:a:0",
   "-c:v","libx265","-preset","ultrafast","-threads","1",
   "-x265-params","pools=none:frame-threads=1:log-level=error",
   "-pix_fmt","yuv420p","-c:a","aac","-b:a","128k",
   "-movflags","+faststart","-shortest","-y",base],{timeout:60000});
  await fs.writeFile(rotated,pivoterSource90(await fs.readFile(base)));
  const f=new Blob([await fs.readFile(rotated)]);
  const d=await DEMUX.analyser(f);
  assert.ok(d,"NOVA doit analyser les tables HEVC MP4");
  assert.match(d.codec,/^hvc1\.|^hev1\./);
  assert.deepEqual([d.W,d.H,d.dw,d.dh],[160,90,90,160]);
  assert.deepEqual(d.mat,[0,1,-1,0,90,0]);
  assert.equal(d.mirrored,false);
  await new Promise(ok=>app.listen(0,"127.0.0.1",ok));
  const browser=await chromium.launch({headless:true,
   ...(process.env.CHROME?{executablePath:process.env.CHROME}:{})});
  try{
   const page=await browser.newPage({viewport:{width:390,height:844},acceptDownloads:true});
   const errors=[],externals=[];
   page.on("pageerror",e=>errors.push(e.message));
   page.on("request",r=>{
    if(!r.url().startsWith("http://127.0.0.1:")&&
       !r.url().startsWith("blob:")&&!r.url().startsWith("data:"))externals.push(r.url());
   });
   await page.goto("http://127.0.0.1:"+app.address().port+"/experiences/nova.html");
   await page.locator("#file").setInputFiles(rotated);
   const capabilities=await page.evaluate(async()=>{
    const f=document.querySelector("#file").files[0],info=await NOVA_DEMUX.analyser(f);
    const audio=await NOVA_AAC_COPY.planifier(f,{durationSeconds:1.2});
    const decoder=typeof VideoDecoder==="function"&&
     (await VideoDecoder.isConfigSupported({
      codec:info.codec,description:info.desc,codedWidth:info.W,codedHeight:info.H
     })).supported;
    const encoder=typeof VideoEncoder==="function"&&
     (await VideoEncoder.isConfigSupported({codec:"avc1.42E01F",width:90,height:160,
      framerate:15,bitrate:550000,avc:{format:"avc"},latencyMode:"quality"})).supported;
    const native=document.querySelector("#video");
    return {decoder,encoder,codec:info.codec,mat:info.mat,
      width:info.dw,height:info.dh,aacPackets:audio.packets.length,
      nativeWidth:native.videoWidth,nativeHeight:native.videoHeight};
   });
   assert.deepEqual([capabilities.width,capabilities.height],[90,160]);
   assert.ok(capabilities.aacPackets>=45);
   if(capabilities.decoder&&capabilities.encoder&&
      capabilities.nativeWidth===90&&capabilities.nativeHeight===160){
     await page.waitForFunction(()=>!document.querySelector("#exportVideo").disabled);
     await page.locator("#exportVideo").click();
     await page.waitForFunction(()=>!!document.querySelector("#downloadVideo")?.getAttribute("href")||
      document.querySelector("#exportStatus").textContent.startsWith("Export refusé"),
      null,{timeout:90000});
     const status=await page.locator("#exportStatus").innerText();
     assert.match(await page.locator("#downloadVideo").getAttribute("href")||"",/^blob:/,status);
     const pending=page.waitForEvent("download");
     await page.locator("#downloadVideo").click();
     const download=await pending,output=await download.path();
     const {stdout}=await run("ffprobe",["-v","error","-select_streams","v:0",
      "-show_entries","stream=width,height","-of","json",output]);
     const video=JSON.parse(stdout).streams[0];
     assert.deepEqual([video.width,video.height],[90,160]);
     const sourceHashes=await audioHashes(rotated),resultHashes=await audioHashes(output);
     assert.ok(resultHashes.length>=45);
     assert.deepEqual(resultHashes,sourceHashes.slice(0,resultHashes.length));
     t.diagnostic("HEVC portrait décodé et exporté sans perte AAC : "+
      JSON.stringify({codec:capabilities.codec,dimensions:[90,160],
       packets:resultHashes.length}));
   }else{
     // Aucune promesse HEVC sur une plateforme dont WebCodecs ou le
     // lecteur natif n'est pas compatible. La source doit être refusée.
     await page.waitForFunction(()=>!document.querySelector("#exportVideo").disabled);
     await page.locator("#exportVideo").click();
     await page.waitForFunction(()=>document.querySelector("#exportStatus").textContent.startsWith("Export refusé"),
       null,{timeout:90000});
     assert.equal(await page.locator("#downloadVideo").getAttribute("href"),null);
     t.diagnostic("HEVC portrait source vérifiée mais refusée sans décodeur/rotation compatibles : "+
       JSON.stringify(capabilities));
   }
   assert.deepEqual(errors,[]);
   assert.deepEqual(externals,[]);
  }finally{await browser.close()}
 }finally{
  if(app.listening)await new Promise(ok=>app.close(ok));
  await fs.rm(dir,{recursive:true,force:true});
 }
});
