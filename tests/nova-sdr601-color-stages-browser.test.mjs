/* Diagnostic reproductible: 1/1/6 source -> WebCodecs -> Canvas ->
 * NOVA_ZONES -> I420 BT709 -> vrai MP4 H264/AAC. Aucun média personnel.
 * Ne certifie pas Safari: ce banc tourne dans Chromium Linux.
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
const exec=promisify(execFile),root=path.resolve(fileURLToPath(new URL("../",import.meta.url)));
const W=384,H=216,FPS=15;
const palette=[
 {name:"noir",rgb:[18,16,20]},
 {name:"ombre",rgb:[49,46,51]},
 {name:"gris",rgb:[103,103,103]},
 {name:"peau-ombre",rgb:[136,94,80]},
 {name:"peau-claire",rgb:[210,166,142]},
 {name:"rouge",rgb:[221,64,45]},
 {name:"reflet",rgb:[242,231,218]},
 {name:"blanc",rgb:[250,250,247]}
];
const mean=(data,index)=>{
 const col=index%4,row=Math.floor(index/4),x=Math.floor((col+.5)*W/4),
  y=Math.floor((row+.5)*H/2),res=[0,0,0];let n=0;
 for(let yy=y-7;yy<=y+7;yy++)for(let xx=x-7;xx<=x+7;xx++){
  const k=(yy*W+xx)*3;
  for(let c=0;c<3;c++)res[c]+=data[k+c];n++;
 }
 return res.map(x=>Number((x/n).toFixed(3)));
};
const snap=buf=>palette.map((p,i)=>({name:p.name,rgb:mean(buf,i)}));
const error=(a,b)=>Number((a.reduce((sum,p,i)=>
 sum+p.rgb.reduce((d,v,ch)=>d+Math.abs(v-b[i].rgb[ch]),0),0)/(a.length*3)).toFixed(4));
async function rgbAt(pathToMp4){
 const r=await exec("ffmpeg",["-hide_banner","-loglevel","error","-nostdin",
  "-i",pathToMp4,"-map","0:v:0","-frames:v","1","-vf","format=rgb24",
  "-f","rawvideo","pipe:1"],{encoding:"buffer",maxBuffer:W*H*3+10000,timeout:30000});
 assert.equal(r.stdout.length,W*H*3);
 return snap(r.stdout);
}
test("NOVA 1/1/6 : tracer chaque étape sur huit tons et couleurs sans images utilisateur",async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),"nova-601-stages-"));
 let server,browser;
 try{
  const raw=path.join(dir,"patches.rgb"),source=path.join(dir,"smpte170m.mp4");
  const pixels=Buffer.alloc(W*H*3*FPS);
  for(let frame=0;frame<FPS;frame++)for(let y=0;y<H;y++)for(let x=0;x<W;x++){
   const p=palette[Math.floor(y/(H/2))*4+Math.floor(x/(W/4))].rgb;
   const k=((frame*H+y)*W+x)*3;
   pixels[k]=p[0];pixels[k+1]=p[1];pixels[k+2]=p[2];
  }
  await fs.writeFile(raw,pixels);
  // Matrice source SMPTE 170M (6), primaires/transfert BT709 (1/1),
  // soit la combinaison EXACTE signalée par l'iPhone de laboratoire.
  await exec("ffmpeg",["-hide_banner","-loglevel","error","-nostdin",
   "-f","rawvideo","-pix_fmt","rgb24","-s",W+"x"+H,"-r",String(FPS),"-i",raw,
   "-f","lavfi","-i","sine=frequency=660:sample_rate=48000:duration=1",
   "-map","0:v:0","-map","1:a:0",
   "-vf","scale=in_range=full:out_range=limited:out_color_matrix=bt601,format=yuv420p",
   "-frames:v",String(FPS),"-c:v","libx264","-crf","12","-preset","fast",
   "-bf","0","-threads","1","-pix_fmt","yuv420p",
   "-color_primaries","bt709","-color_trc","bt709",
   "-colorspace","smpte170m","-movflags","+faststart+write_colr",
   "-c:a","aac","-b:a","64k","-ac","1","-y",source],{timeout:60000});
  const sourceProbe=JSON.parse((await exec("ffprobe",["-v","error",
   "-select_streams","v:0","-show_streams","-of","json",source])).stdout).streams[0];
  assert.equal(sourceProbe.color_primaries,"bt709");
  assert.equal(sourceProbe.color_transfer,"bt709");
  assert.equal(sourceProbe.color_space,"smpte170m");
  assert.equal(Number(sourceProbe.nb_frames),FPS);
  const sourceSamples=await rgbAt(source);
  const site=path.join(dir,"site");
  await exec(process.execPath,[path.join(root,"outils/build-nova-iphone-preview.mjs"),site],
   {timeout:90000});
  const hdr=await fs.readFile(path.join(site,"_headers"),"utf8");
  const csp=hdr.match(/^  Content-Security-Policy: (.+)$/m)?.[1];
  assert.ok(csp);
  server=http.createServer(async(req,res)=>{
   const pathname=new URL(req.url,"http://localhost").pathname;
   const f=path.resolve(site,"."+pathname);
   if(!f.startsWith(site+path.sep)){res.writeHead(403).end();return}
   try{
    const b=await fs.readFile(f);
    res.setHeader("Content-Security-Policy",csp);
    res.setHeader("Cache-Control","no-store");
    res.setHeader("Content-Type",f.endsWith(".js")?"text/javascript":
     f.endsWith(".html")?"text/html":"application/octet-stream");
    res.end(b);
   }catch{res.writeHead(404).end("missing")}
  });
  await new Promise(ok=>server.listen(0,"127.0.0.1",ok));
  const origin="http://127.0.0.1:"+server.address().port;
  browser=await chromium.launch({headless:true,...(process.env.CHROME?
   {executablePath:process.env.CHROME}:{})});
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const pageErrors=[],external=[],uploads=[];
  page.on("pageerror",e=>pageErrors.push(e.message));
  page.on("request",req=>{
   if(!req.url().startsWith(origin+"/")&&!req.url().startsWith("blob:")&&
      !req.url().startsWith("data:"))external.push(req.url());
   if(!["GET","HEAD"].includes(req.method()))uploads.push(req.url());
  });
  await page.goto(origin+"/experiences/nova.html");
  await page.locator("#file").setInputFiles(source);
  const results=await page.evaluate(async({W,H,patches})=>{
   const file=document.querySelector("#file").files[0];
   function sample(bytes){
    return patches.map((p,index)=>{
     const col=index%4,row=Math.floor(index/4);
     const x=Math.floor((col+.5)*W/4),y=Math.floor((row+.5)*H/2);
     const rgb=[0,0,0];let count=0;
     for(let yy=y-7;yy<=y+7;yy++)for(let xx=x-7;xx<=x+7;xx++){
      const k=(yy*W+xx)*4;
      for(let c=0;c<3;c++)rgb[c]+=bytes[k+c];
      count++;
     }
     return {name:p.name,rgb:rgb.map(v=>Math.round(v/count*1000)/1000)};
    });
   }
   const reports=[];
   for(const mode of ["untouched","mosaic"]){
    let first=null;
    const worker={restituer(image,opts){
     const before=sample(image.data);
     const result=mode==="untouched"?
      {data:image.data,bilan:{intervention:false}}:
      NOVA_ZONES.restituer(image,{size:256,arbitre:opts.arbitre});
     if(!first)first={before,after:sample(result.data),
      changed:!!result.bilan.intervention};
     return result;
    }};
    const output=await NOVA_NATIVE_HD.exporter({
     file,moteur:worker,arbitre:NOVA_DECISION
    });
    reports.push({mode,first,meta:{
     width:output.originalWidth,height:output.originalHeight,
     frames:output.outputFrames,audioMode:output.audioMode,
     modifiedFrames:output.modifiedFrames,
     colorFidelity:output.colorFidelity,
     colorMismatchFrames:output.colorMismatchFrames,
     colorWarning:!!output.colorWarning
    },bytes:Array.from(new Uint8Array(await output.blob.arrayBuffer()))});
   }
   return reports;
  },{W,H,patches:palette.map(p=>({name:p.name}))});
  const numbers=[];
  for(const r of results){
   const out=path.join(dir,r.mode+".mp4");
   await fs.writeFile(out,Buffer.from(r.bytes));
   const video=JSON.parse((await exec("ffprobe",["-v","error","-show_streams",
    "-of","json",out])).stdout).streams;
   const v=video.find(x=>x.codec_type==="video"),a=video.find(x=>x.codec_type==="audio");
   assert.equal(v.width,W);assert.equal(v.height,H);
   assert.equal(Number(v.nb_frames),FPS);assert.equal(v.color_space,"bt709");
   assert.equal(a.codec_name,"aac");
   assert.equal(r.meta.frames,FPS);
   const output=await rgbAt(out);
   const values={
    mode:r.mode,
    sourceToCanvas: error(sourceSamples,r.first.before),
    canvasToMosaic:error(r.first.before,r.first.after),
    stageToFinal:error(r.first.after,output),
    sourceToFinal:error(sourceSamples,output),
    byPatch:palette.map((p,i)=>({
     patch:p.name,source:sourceSamples[i].rgb,
     canvas:r.first.before[i].rgb,
     restored:r.first.after[i].rgb,
     final:output[i].rgb
    })),
    meta:r.meta
   };
   numbers.push(values);
   if(r.mode==="untouched"){
    assert.equal(r.meta.modifiedFrames,0);
    assert.equal(values.canvasToMosaic,0);
   }
   assert.ok(["source-matrix-audited","native-display-only-not-source-certified"]
    .includes(r.meta.colorFidelity));
  }
  // Ne pas inventer de seuil de fidélité avec une matrice 601 -> 709 :
  // les valeurs publiées concernent UNIQUEMENT les patchs synthétiques.
  console.log("NOVA_601_STAGE_TRACE "+JSON.stringify(numbers));
  assert.deepEqual(pageErrors,[]);assert.deepEqual(external,[]);
  assert.deepEqual(uploads,[]);
 }finally{
  await browser?.close();
  if(server?.listening)await new Promise(ok=>server.close(ok));
  await fs.rm(dir,{recursive:true,force:true});
 }
});
