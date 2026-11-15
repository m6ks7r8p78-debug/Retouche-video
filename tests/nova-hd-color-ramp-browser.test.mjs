/* NOVA regression: color ramp through REAL H.264/AAC decode, Canvas, I420,
 * encode and MP4 mux, with light corrections deliberately OFF.
 * Synthetic FFmpeg media only. No media upload, no browser-network leakage.
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
const W=384,H=216,LEVELS=[16,32,64,128,192,240],FPS=15;
// Construct a correctly tagged BT.709 *source*, not sRGB pixels
// disguised with BT.709 metadata. FFmpeg's matrix conversion does not
// perform sRGB->BT.709 transfer by itself.
function srgbTo709(v){
 const c=v/255,lin=c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4;
 const t=lin<0.018?4.5*lin:1.099*lin**0.45-0.099;
 return Math.max(0,Math.min(255,Math.round(t*255)));
}
async function decodeRgb(mp4){
 const {stdout}=await run("ffmpeg",["-hide_banner","-loglevel","error","-i",mp4,
  "-map","0:v:0","-frames:v","1","-vf","format=rgb24","-f","rawvideo","pipe:1"],
  {encoding:"buffer",maxBuffer:W*H*3+10000,timeout:30000});
 assert.equal(stdout.length,W*H*3,"first frame RGB payload");
 return stdout;
}
function levels(rgb){
 return LEVELS.map((_,i)=>{
  const x=Math.round((i+0.5)*W/LEVELS.length),y=Math.floor(H/2);
  let sum=0,n=0;
  for(let dy=-8;dy<=8;dy++)for(let dx=-8;dx<=8;dx++){
   const p=((y+dy)*W+(x+dx))*3;
   sum+=(rgb[p]+rgb[p+1]+rgb[p+2])/3;n++;
  }
  return Number((sum/n).toFixed(2));
 });
}
test("NOVA no-op native SDR pipeline: RGB bars stay natural, no exaggerated contrast",async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),"nova-ramp-"));
 let server,browser;
 try{
  const raw=path.join(dir,"ramp.rgb"),sample=path.join(dir,"ramp.mp4");
  // Rawvideo does NOT repeat a single frame. Supply all 15 frames
  // explicitly so no missing-frame bug can masquerade as an export defect.
  const pixels=Buffer.alloc(W*H*3*FPS);
  for(let frame=0;frame<FPS;frame++)for(let y=0;y<H;y++)for(let x=0;x<W;x++){
   const g=srgbTo709(
    LEVELS[Math.min(LEVELS.length-1,Math.floor(x/(W/LEVELS.length)))]);
   const k=((frame*H+y)*W+x)*3;
   pixels[k]=pixels[k+1]=pixels[k+2]=g;
  }
  await fs.writeFile(raw,pixels);
  await run("ffmpeg",["-hide_banner","-loglevel","error","-nostdin",
   "-f","rawvideo","-pix_fmt","rgb24","-s",W+"x"+H,"-r",String(FPS),"-i",raw,
   "-f","lavfi","-i","sine=frequency=660:sample_rate=48000:duration=1",
   "-map","0:v:0","-map","1:a:0",
   "-vf","scale=in_range=full:out_range=limited:out_color_matrix=bt709,format=yuv420p",
   "-frames:v",String(FPS),"-c:v","libx264","-crf","12",
   "-preset","medium","-bf","0","-threads","1",
   "-color_primaries","bt709","-color_trc","bt709","-colorspace","bt709",
   "-movflags","+faststart+write_colr","-c:a","aac","-b:a","64k",
   "-y",sample],{timeout:60000});
  const pre=levels(await decodeRgb(sample));
  await run(process.execPath,[path.join(root,"outils/build-nova-iphone-preview.mjs"),
   path.join(dir,"site")],{timeout:90000});
  const site=path.join(dir,"site");
  const headers=await fs.readFile(path.join(site,"_headers"),"utf8");
  const csp=headers.match(/^  Content-Security-Policy: (.+)$/m)?.[1];
  assert.ok(csp);
  server=http.createServer(async(req,res)=>{
   const pathname=new URL(req.url,"http://localhost").pathname;
   const p=path.resolve(site,"."+pathname);
   if(!p.startsWith(site+path.sep)){res.writeHead(403).end();return}
   try{
    const b=await fs.readFile(p);
    res.setHeader("Content-Security-Policy",csp);
    res.setHeader("Cache-Control","no-store");
    res.setHeader("Content-Type",p.endsWith(".js")?"text/javascript":
     p.endsWith(".html")?"text/html":"application/octet-stream");
    res.end(b);
   }catch{res.writeHead(404).end("not found")}
  });
  await new Promise(ok=>server.listen(0,"127.0.0.1",ok));
  const origin="http://127.0.0.1:"+server.address().port;
  browser=await chromium.launch({headless:true,...(process.env.CHROME?
   {executablePath:process.env.CHROME}:{})});
  const page=await browser.newPage({acceptDownloads:true,viewport:{width:390,height:844}});
  const errors=[],outbound=[];
  page.on("pageerror",e=>errors.push(e.message));
  page.on("request",q=>{
   if(!q.url().startsWith(origin+"/")&&!q.url().startsWith("blob:")&&
      !q.url().startsWith("data:"))outbound.push(q.url());
  });
  await page.goto(origin+"/experiences/nova.html");
  await page.locator("#file").setInputFiles(sample);
  const result=await page.evaluate(async()=>{
   const source=document.querySelector("#file").files[0];
   // True no-op correction, pixel content preserved by the mosaic stage.
   const untouched={restituer(img){return {data:img.data,
    bilan:{intervention:false}}}};
   const noOpArbiter={arbitrer(){}};
   const converted=await NOVA_NATIVE_HD.exporter({
    file:source,moteur:untouched,arbitre:noOpArbiter
   });
   const a=document.createElement("a");
   a.id="novaRampResult";a.href=URL.createObjectURL(converted.blob);
   a.download="synthetic-nova-ramp.mp4";document.body.append(a);
   return {width:converted.originalWidth,height:converted.originalHeight,
    frames:converted.outputFrames,modifiedFrames:converted.modifiedFrames,
    audioMode:converted.audioMode,colorFidelity:converted.colorFidelity};
  });
  assert.deepEqual([result.width,result.height,result.frames,result.modifiedFrames],
   [W,H,FPS,0]);
  assert.ok(["aac-copy","aac-native-encode"].includes(result.audioMode));
  // Read the synthetic Blob directly from the same HTTPS-origin context:
  // browser download events differ by provider and aren't the color subject.
  const syntheticBytes=await page.evaluate(async()=>{
   const url=document.querySelector("#novaRampResult").href;
   return Array.from(new Uint8Array(await (await fetch(url)).arrayBuffer()));
  });
  const outfile=path.join(dir,"nova-ramp-noop.mp4");
  await fs.writeFile(outfile,Buffer.from(syntheticBytes));
  const actual=levels(await decodeRgb(outfile));
  const differences=actual.map((v,i)=>Number((v-pre[i]).toFixed(2)));
  const maxDiff=Math.max(...differences.map(Math.abs));
  // Every bar is INSIDE its own region. >14 RGB code values in a no-op
  // pipeline would violate the natural-color promise beyond codec noise.
  assert.ok(maxDiff<=14,
   "BT709-to-Canvas-to-BT709 drift in no-op path: "+JSON.stringify({reference:pre,output:actual,
    diff:differences,maxDiff}));
  const ff=JSON.parse((await run("ffprobe",["-v","error","-show_streams",
   "-of","json",outfile],{timeout:10000})).stdout);
  const vid=ff.streams.find(x=>x.codec_type==="video"),aud=ff.streams.find(x=>x.codec_type==="audio");
  assert.equal(vid.width,W);assert.equal(vid.height,H);
  assert.equal(Number(vid.nb_frames),FPS);assert.equal(aud.codec_name,"aac");
  assert.deepEqual(errors,[]);
  assert.deepEqual(outbound,[]);
 }finally{
  await browser?.close();
  if(server?.listening)await new Promise(ok=>server.close(ok));
  await fs.rm(dir,{recursive:true,force:true});
 }
});
