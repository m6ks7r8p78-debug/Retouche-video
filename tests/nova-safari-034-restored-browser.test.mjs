/* NOVA HD : exercice A/V H264 synthétique sous CSP.
 * Vraie vidéo courte créée par FFmpeg, aucune vidéo utilisateur.
 * Le vrai chemin HEVC natif iPhone restera à essayer physiquement.
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
const run=promisify(execFile),root=path.resolve(fileURLToPath(new URL("../",import.meta.url)));
test("NOVA 0.36 : vrai H264/AAC SMPTE170M/BT601 + fallback Safari 0.34, 15 images intactes",async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),"nova-hd-browse-"));
 const sample=path.join(dir,"video-dummy-with-audio.mp4");
 let server,browser;
 try{
  await run(process.execPath,[path.join(root,"outils/build-nova-iphone-preview.mjs"),dir],
   {timeout:90000});
  await run("ffmpeg",["-hide_banner","-loglevel","error","-nostdin",
   "-f","lavfi","-i","testsrc2=size=160x120:rate=15:duration=1",
   "-f","lavfi","-i","sine=frequency=660:sample_rate=48000:duration=1",
   "-map","0:v:0","-map","1:a:0","-c:v","libx264",
   "-pix_fmt","yuv420p","-bf","0","-preset","ultrafast","-threads","1",
   "-color_primaries","bt709","-color_trc","bt709","-colorspace","bt709",
   "-movflags","+faststart+write_colr","-c:a","aac","-b:a","64k","-y",sample],{timeout:45000});
  const csp=(await fs.readFile(path.join(dir,"_headers"),"utf8"))
   .match(/^  Content-Security-Policy: (.+)$/m)?.[1];
  assert.ok(csp);
  server=http.createServer(async(req,res)=>{
   const pathname=new URL(req.url,"http://localhost").pathname;
   const dest=path.resolve(dir,"."+pathname);
   if(!dest.startsWith(dir+path.sep)){res.writeHead(403).end();return}
   try{
    const b=await fs.readFile(dest);
    res.setHeader("Content-Security-Policy",csp);
    res.setHeader("Cache-Control","no-store");
    res.setHeader("Content-Type",dest.endsWith(".js")?"text/javascript":
     dest.endsWith(".html")?"text/html":dest.endsWith(".wasm")?
     "application/wasm":"application/octet-stream");
    res.end(b);
   }catch{res.writeHead(404).end("missing")}
  });
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  const base="http://127.0.0.1:"+server.address().port;
  browser=await chromium.launch({headless:true,...(process.env.CHROME?
   {executablePath:process.env.CHROME}:{})});
  const page=await browser.newPage({viewport:{width:390,height:844},acceptDownloads:true});
  const failures=[],upload=[],external=[];
  page.on("pageerror",e=>failures.push(e.message));
  page.on("request",r=>{
   if(!r.url().startsWith(base+"/")&&!r.url().startsWith("blob:")&&!r.url().startsWith("data:"))
    external.push(r.url());
   if(!["GET","HEAD"].includes(r.method()))upload.push(r.url());
  });
  await page.goto(base+"/experiences/nova.html");
  assert.match(await page.locator("#novaHdFrameAuditBuild").textContent(),/NOVA HD 0\.37/);
  assert.equal(await page.locator("#pilotVideo").isVisible(),false,
   "export control intentionally appears only after video import");

  const webkitFixed=await page.evaluate(()=>{
   const faulty=new Uint8Array([3,128,128,128,34,0,0,0,4,
    128,128,128,20,64,20,0,24,0,0,0,0,0,0,0,0,0,
    5,128,128,128,2,17,136,6,128,128,128,1,2]);
   return Array.from(NOVA_AAC_NATIVE.normalizeDescription(faulty,48000,1));
  });
  assert.deepEqual(webkitFixed,[17,136],
   "Full Safari esds descriptor must normalize to ASC under production CSP");

  await page.locator("#novaHdPanel summary").click();
  assert.equal(await page.locator("#novaHdRun").isEnabled(),false);
  await page.locator("#file").setInputFiles(sample);
  await page.waitForFunction(()=>!document.querySelector("#novaHdRun").disabled);
  // La description erronée publiée par WebKit doit produire une piste AAC
  // réellement lisible, pas seulement une configuration JSON plausible.
  // Les paquets AAC sont ceux du fichier audio synthétique FFmpeg local.
  const probe=await page.evaluate(async()=>{
   const file=document.querySelector("#file").files[0];
   const plan=await NOVA_AAC_COPY.planifier(file,{durationSeconds:1});
   if(plan.sampleRate!==48000||plan.channels!==1)
    throw Error("Unexpected synthetic mono AAC profile");
   const broken=new Uint8Array([3,128,128,128,34,0,0,0,4,
    128,128,128,20,64,20,0,24,0,0,0,0,0,0,0,0,0,
    5,128,128,128,2,17,136,6,128,128,128,1,2]);
   const normalized=NOVA_AAC_NATIVE.normalizeDescription(broken,48000,1);
   const target=new Mp4Muxer.ArrayBufferTarget();
   const muxer=new Mp4Muxer.Muxer({target,fastStart:"in-memory",
    audio:{codec:"aac",sampleRate:plan.sampleRate,numberOfChannels:plan.channels}});
   await NOVA_AAC_COPY.copier(file,plan,{
    addAudioChunkRaw(data,type,timestamp,duration,meta){
     muxer.addAudioChunkRaw(data,type,timestamp,duration,
      meta?{decoderConfig:{...meta.decoderConfig,description:normalized}}:undefined);
    }
   });
   muxer.finalize();
   const a=document.createElement("a");
   a.id="webkitAacProof";
   a.href=URL.createObjectURL(new Blob([target.buffer],{type:"audio/mp4"}));
   a.download="synthetic-apple-aac-proof.m4a";document.body.append(a);
   return {packets:plan.packets.length,asc:Array.from(normalized)};
  });
  assert.ok(probe.packets>=40);
  assert.deepEqual(probe.asc,[17,136]);
  const aacBytes=await page.evaluate(async()=>{
   const href=document.querySelector("#webkitAacProof").href;
   const data=await (await fetch(href)).arrayBuffer();
   return Array.from(new Uint8Array(data));
  });
  assert.ok(aacBytes.length>300,"synthetic AAC output too small");
  const aacPath=path.join(dir,"synthetic-webkit-aac-proof.m4a");
  await fs.writeFile(aacPath,Buffer.from(aacBytes));
  const aacCheck=JSON.parse((await run("ffprobe",["-v","error","-show_streams",
   "-of","json",aacPath],{timeout:10000})).stdout);
  const aacStream=aacCheck.streams.find(x=>x.codec_type==="audio");
  assert.equal(aacStream.codec_name,"aac");
  assert.equal(aacStream.sample_rate,"48000");
  assert.equal(aacStream.channels,1);

  assert.match(await page.locator("#novaHdOriginal").getAttribute("href")||"",/^blob:/);
  assert.equal(await page.locator("#novaHdSave").getAttribute("href"),null,
   "no processing starts automatically");
  const old=page.waitForEvent("download");
  await page.locator("#novaHdOriginal").click();
  assert.deepEqual(await fs.readFile(await (await old).path()),await fs.readFile(sample),
   "original downloadable byte-for-byte unchanged");
  await page.locator("#novaHdRun").click();
  await page.waitForFunction(()=>{
   const s=document.querySelector("#novaHdStatus")?.textContent||"";
   return !!document.querySelector("#novaHdSave")?.getAttribute("href")||
    /Essai HD non abouti/.test(s);
  },null,{timeout:100000});
  const s=await page.locator("#novaHdStatus").textContent();
  assert.match(s,/MP4 HD exporté/,s);
  const dl=page.waitForEvent("download");
  await page.locator("#novaHdSave").click();
  const fname=await (await dl).path();
  const check=JSON.parse((await run("ffprobe",["-v","error","-show_streams",
   "-show_format","-of","json",fname],{timeout:10000})).stdout);
  const v=check.streams.find(x=>x.codec_type==="video");
  const a=check.streams.find(x=>x.codec_type==="audio");
  assert.equal(v.codec_name,"h264");
  assert.equal(v.width,160);assert.equal(v.height,120);
  assert.equal(Number(v.nb_frames),15);
  assert.equal(a.codec_name,"aac");
  assert.ok(Math.abs(Number(check.format.duration)-1)<0.2);
  // Test de conversion couleur SDR réel, pas simple injection de JSON.
  // ffmpeg produit H.264/AAC explicitement tagué matrice BT.601 SMPTE170M,
  // primaires BT709; le navigateur décode puis convertit en Canvas sRGB et
  // le MP4 final doit être marqué BT709 avec AAC et images complètes.
  const matrix601=path.join(dir,"video-matrice-601.mp4");
  await run("ffmpeg",["-hide_banner","-loglevel","error","-nostdin",
   "-f","lavfi","-i","testsrc2=size=160x120:rate=15:duration=1",
   "-f","lavfi","-i","sine=frequency=440:sample_rate=48000:duration=1",
   "-map","0:v:0","-map","1:a:0","-c:v","libx264","-pix_fmt","yuv420p",
   "-bf","0","-preset","ultrafast","-threads","1",
   "-color_primaries","bt709","-color_trc","smpte170m",
   "-colorspace","smpte170m","-movflags","+faststart+write_colr",
   "-c:a","aac","-b:a","64k","-y",matrix601],{timeout:45000});
  const inputColor=JSON.parse((await run("ffprobe",["-v","error","-select_streams","v:0",
    "-show_streams","-of","json",matrix601])).stdout).streams[0];
  assert.equal(inputColor.color_space,"smpte170m");
  await page.reload();
  await page.locator("#novaHdPanel summary").click();
  await page.locator("#file").setInputFiles(matrix601);
  await page.waitForFunction(()=>!document.querySelector("#novaHdRun").disabled);
  await page.locator("#novaHdRun").click();
  await page.waitForFunction(()=>{
   const t=document.querySelector("#novaHdStatus")?.textContent||"";
   return !!document.querySelector("#novaHdSave")?.getAttribute("href")||
    /Essai HD non abouti/.test(t);
  },null,{timeout:100000});
  const matrixStatus=await page.locator("#novaHdStatus").textContent();
  assert.match(matrixStatus,/MP4 HD exporté/,
    "La vraie matrice 601 ne doit pas provoquer de refus arbitraire : "+matrixStatus);
  const matrixDownload=page.waitForEvent("download");
  await page.locator("#novaHdSave").click();
  const matrixOutput=await (await matrixDownload).path();
  const matrixCheck=JSON.parse((await run("ffprobe",["-v","error","-show_streams",
    "-of","json",matrixOutput])).stdout);
  const converted=matrixCheck.streams.find(x=>x.codec_type==="video");
  assert.equal(converted.width,160);
  assert.equal(converted.height,120);
  assert.equal(Number(converted.nb_frames),15);
  assert.equal(converted.color_space,"bt709");
  assert.equal(matrixCheck.streams.find(x=>x.codec_type==="audio")?.codec_name,"aac");
  // Contrôle perceptuel minimum : convertir source BT.601 et sortie BT.709
  // en RGB par FFmpeg, comparer les images après transcodage classique NOVA.
  // Le score ne constitue PAS une certification de fidélité iPhone.
  const comparison=await run("ffmpeg",["-hide_banner","-nostdin","-v","info",
   "-i",matrix601,"-i",matrixOutput,
   "-filter_complex","[0:v:0]format=rgb24[reference];[1:v:0]format=rgb24[converted];[reference][converted]psnr",
   "-an","-f","null","-"],{timeout:30000});
  const matches=[...comparison.stderr.matchAll(/PSNR [^\n]*average:([0-9.]+)/g)];
  assert.ok(matches.length>0,"PSNR RGB absent : "+comparison.stderr.slice(-600));
  const psnr=Number(matches.at(-1)[1]);
  assert.ok(psnr>25,"Conversion BT.601->BT.709 trop différente : PSNR "+psnr);

  // Simuler la particularité Safari : trame opaque HEVC sans accès YUV.
  // Le décodeur matériel déclare BT.709, malgré la matrice source BT.601.
  // Le rendu natif doit pouvoir exporter sans prétendre que la couleur
  // de l'original est prouvée. Aucune source personnelle impliquée.
  await page.reload();
  await page.locator("#novaHdPanel summary").click();
  await page.evaluate(()=>{
   const original=NOVA_HD_COLOR.imagePourRendu;
   window.NOVA_HD_COLOR={...NOVA_HD_COLOR,imagePourRendu:async(frame,evidence)=>{
    const cs=frame.colorSpace;
    const opaque={
     format:null,
     colorSpace:{primaries:cs.primaries,transfer:cs.transfer,matrix:"bt709",
      fullRange:cs.fullRange}
    };
    let checked;
    try{checked=await original(opaque,evidence)}
    catch(error){
     throw Error("Synthetic opaque-frame mismatch "+JSON.stringify({
      sourceMatrix:evidence.sourceMatrix,sourcePrimaries:evidence.sourcePrimaries,
      expectedMatrix:evidence.expectedMatrix,expectedPrimaries:evidence.expectedPrimaries,
      confirmed:evidence.confirmed,range:evidence.sourceFullRange,
      reported:opaque.colorSpace,originalError:error.message}));
    }
    if(checked.proof.method!=="native-safari-sdr-bt709-display")
     throw Error("Opaque Safari fallback not selected");
    // Garder la vraie VideoFrame native pour que Canvas la dessine.
    return {frame,owned:false,proof:checked.proof};
   }};
  });
  await page.locator("#file").setInputFiles(matrix601);
  await page.waitForFunction(()=>!document.querySelector("#novaHdRun").disabled);
  await page.locator("#novaHdRun").click();
  await page.waitForFunction(()=>{
   const t=document.querySelector("#novaHdStatus")?.textContent||"";
   return !!document.querySelector("#novaHdSave")?.getAttribute("href")||
    /Essai HD non abouti/.test(t);
  },null,{timeout:100000});
  const opaqueStatus=await page.locator("#novaHdStatus").textContent();
  assert.match(opaqueStatus,/MP4 HD exporté/,opaqueStatus);
  assert.match(opaqueStatus,/ATTENTION COULEURS.*BT.709.*BT.601/,
   "Native Safari color mismatch must remain visible");
  const opaqueDL=page.waitForEvent("download");
  await page.locator("#novaHdSave").click();
  const opaquePath=await (await opaqueDL).path();
  const opaqueCheck=JSON.parse((await run("ffprobe",["-v","error",
   "-show_streams","-of","json",opaquePath],{timeout:10000})).stdout);
  const opaqueV=opaqueCheck.streams.find(x=>x.codec_type==="video");
  const opaqueA=opaqueCheck.streams.find(x=>x.codec_type==="audio");
  assert.equal(opaqueV.width,160);assert.equal(opaqueV.height,120);
  assert.equal(Number(opaqueV.nb_frames),15);
  assert.equal(opaqueA.codec_name,"aac");
  assert.equal(opaqueV.color_space,"bt709");

  // Le pipeline a exporté la source 1/1/6 en 15/15 images avec AAC.
  // Aucun média privé ni appel réseau pendant le test.
  assert.deepEqual(failures,[]);
  assert.deepEqual(external,[]);
  assert.deepEqual(upload,[]);
 }finally{
  await browser?.close();
  if(server?.listening)await new Promise(ok=>server.close(ok));
  await fs.rm(dir,{recursive:true,force:true});
 }
});
