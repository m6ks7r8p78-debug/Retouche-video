import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {fileURLToPath} from "node:url";
import {chromium} from "playwright";
import {impulsionsPCM,impulsionsVideo,comparerImpulsions} from "./nova-av-pulses.mjs";

const root=path.resolve(fileURLToPath(new URL("../",import.meta.url)));
function server(){
 return http.createServer(async(req,res)=>{
   const u=new URL(req.url,"http://localhost");const p=path.resolve(root,"."+u.pathname);
   if(!p.startsWith(root+path.sep)){res.writeHead(403).end();return}
   try{
     const b=await fs.readFile(p);
     res.setHeader("Content-Type",p.endsWith(".html")?"text/html;charset=utf-8":p.endsWith(".js")?"text/javascript;charset=utf-8":"application/octet-stream");
     res.end(b);
   }catch{res.writeHead(404).end("Not found")}
 });
}
for(const width of [390,1350]){
 test("NOVA : parcours photo local, mobile "+width,async()=>{
   const app=server();await new Promise(r=>app.listen(0,"127.0.0.1",r));
   const browser=await chromium.launch({headless:true,...(process.env.CHROME?{executablePath:process.env.CHROME}:{})});
   try{
     const page=await browser.newPage({viewport:{width,height:850},acceptDownloads:true});
     const errors=[],externals=[];
     page.on("pageerror",e=>errors.push(e.message));
     page.on("request",r=>{if(!r.url().startsWith("http://127.0.0.1:")&&!r.url().startsWith("blob:")&&!r.url().startsWith("data:"))externals.push(r.url())});
     await page.goto("http://127.0.0.1:"+app.address().port+"/experiences/nova.html");
     assert.match(await page.title(),/NOVA/);
     const sample=await page.evaluate(()=>{
       const c=document.createElement("canvas");c.width=96;c.height=64;
       const x=c.getContext("2d");x.fillStyle="#232d2a";x.fillRect(0,0,96,64);
       x.fillStyle="#7d8a76";x.fillRect(26,12,40,36);
       return c.toDataURL("image/png").split(",")[1];
     });
     await page.locator("#file").setInputFiles({name:"source.png",mimeType:"image/png",buffer:Buffer.from(sample,"base64")});
     await page.waitForFunction(()=>!document.querySelector("#run").disabled);
     await page.locator("#run").click();
     await page.waitForFunction(()=>!document.querySelector("#save").disabled);
     assert.equal(await page.locator("#before").isVisible(),true);
     assert.equal(await page.locator("#after").isVisible(),true);
     assert.match(await page.locator("#metrics").innerText(),/Régions inspectées/);
     assert.match(await page.locator("#zoneInfo").innerText(),/régions adaptées/);
     const zonesButton=page.locator("#showZones");
     if(await zonesButton.isVisible()){
       await zonesButton.click();
       assert.equal(await zonesButton.getAttribute("aria-pressed"),"true");
       assert.equal(await page.locator("#zonesOverlay").isVisible(),true);
       await zonesButton.click();
       assert.equal(await page.locator("#zonesOverlay").isVisible(),false);
     }
     await page.locator("#compare").evaluate(el=>{el.value="70";el.dispatchEvent(new Event("input",{bubbles:true}))});
     assert.match(await page.locator("#after").evaluate(el=>el.style.clipPath),/30%/);
     const download=page.waitForEvent("download");
     await page.locator("#save").click();
     const file=await download;
     assert.match(file.suggestedFilename(),/nova_apercu\.png$/);
     assert.deepEqual(errors,[]);
     assert.deepEqual(externals,[]);
     if(width===390){
       const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
       assert.ok(overflow<4,"Horizontal overflow: "+overflow);
     }
     await page.close();
   }finally{await browser.close();await new Promise(r=>app.close(r))}
 });
}

const runBinary=promisify(execFile);
test("NOVA : prévisualisation vidéo réelle à partir d'un MP4 synthétique",async()=>{
 const tmp=await fs.mkdtemp(path.join(os.tmpdir(),"nova-test-"));
 const sample=path.join(tmp,"reference.mp4"),app=server();
 try{
  await runBinary("ffmpeg",["-hide_banner","-loglevel","error","-f","lavfi","-i","testsrc2=size=320x180:rate=15:duration=2.4",
    "-f","lavfi","-i","sine=frequency=440:duration=2.4","-c:v","libx264","-pix_fmt","yuv420p","-c:a","aac",
    "-movflags","+faststart","-shortest","-y",sample]);
  await new Promise(r=>app.listen(0,"127.0.0.1",r));
  const browser=await chromium.launch({headless:true,...(process.env.CHROME?{executablePath:process.env.CHROME}:{})});
  try{
   const page=await browser.newPage({viewport:{width:390,height:844}});
   const errors=[];page.on("pageerror",e=>errors.push(e.message));
   await page.goto("http://127.0.0.1:"+app.address().port+"/experiences/nova.html");
   await page.locator("#file").setInputFiles(sample);
   await page.waitForFunction(()=>document.querySelector("#run")&&!document.querySelector("#run").disabled);
   await page.locator("#run").click();
   await page.waitForFunction(()=>{
     const el=document.querySelector("#videoAfter");
     return !!el&&!el.hidden&&el.width>0&&el.height>0
   },null,{timeout:30000});
   const info=await page.locator("#modeReport").innerText();
   assert.match(info,/Prévisualisation vidéo/);
   assert.equal(await page.locator("#compare").isEnabled(),true);
   await page.locator("#compare").evaluate(el=>{el.value="65";el.dispatchEvent(new Event("input",{bubbles:true}))});
   assert.match(await page.locator("#videoAfter").evaluate(el=>el.style.clipPath),/35%/);
   await page.locator("#video").evaluate(async el=>{el.muted=true;await el.play()});
   await page.waitForTimeout(700);
   await page.locator("#video").evaluate(el=>el.pause());
   assert.equal(await page.locator("#save").isEnabled(),false,"pas d'export vidéo trompeur");
   assert.deepEqual(errors,[]);
   await page.close();
  }finally{await browser.close()}
 }finally{
  if(app.listening)await new Promise(r=>app.close(r));
  await fs.rm(tmp,{recursive:true,force:true});
 }
});


test("NOVA : MP4 court exporté avec son préservé ou refus, puis MP4 sans son explicite",async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),"nova-mp4-")),src=path.join(dir,"source.mp4"),app=server();
 try{
  await runBinary("ffmpeg",["-hide_banner","-loglevel","error","-f","lavfi","-i",
  "testsrc2=size=160x90:rate=15:duration=1.2","-f","lavfi","-i","sine=frequency=440:duration=1.2",
  "-c:v","libx264","-pix_fmt","yuv420p","-c:a","aac","-shortest","-y",src]);
  await new Promise(ok=>app.listen(0,"127.0.0.1",ok));
  const browser=await chromium.launch({headless:true,...(process.env.CHROME?{executablePath:process.env.CHROME}:{})});
  try{
   const page=await browser.newPage({viewport:{width:390,height:844},acceptDownloads:true});
   const errors=[];page.on("pageerror",e=>errors.push(e.message));
   await page.goto("http://127.0.0.1:"+app.address().port+"/experiences/nova.html");
   await page.locator("#file").setInputFiles(src);
   const sourceAudit=await page.evaluate(async()=>{
     const mp4=await NOVA_DEMUX.analyser(document.querySelector("#file").files[0]);
     if(!mp4)return null;
     const presentation=NOVA_PTS.planifier(mp4);
     return {samples:mp4.ns,edits:mp4.editMediaTime,
       reordered:presentation.sorted.some((item,idx)=>item.index!==idx),
       firstPTS:presentation.premierPTS,lastPTS:presentation.dernierPTS,
       codec:mp4.codec,source:mp4.source};
   });
   assert.ok(sourceAudit,"le parser doit reconnaître la source MP4 synthétique");
   assert.ok(sourceAudit.samples>=16,"les trames MP4 doivent être disponibles");
   assert.equal(sourceAudit.reordered,true,"le test H.264 doit vraiment contenir des B-frames réordonnées");
   assert.equal(sourceAudit.firstPTS,0,"la liste de montage corrige le début du film");
   assert.match(sourceAudit.codec,/^avc1/);
   await page.waitForFunction(()=>!document.querySelector("#exportVideo").disabled);
   for(const silent of [false,true]){
    if(silent)await page.locator("#allowSilent").check();
    await page.locator("#exportVideo").click();
    await page.waitForFunction(()=>{
     const d=document.querySelector("#downloadVideo");
     return !d.hidden||document.querySelector("#exportStatus").textContent.startsWith("Export refusé");
    },null,{timeout:90000});
    if(await page.locator("#downloadVideo").getAttribute("href")===null){
     if(silent)throw new Error(await page.locator("#exportStatus").innerText());
     assert.match(await page.locator("#exportStatus").innerText(),/Export refusé/);
     continue;
    }
    const href=await page.locator("#downloadVideo").getAttribute("href");
    assert.match(href||"",/^blob:/,"ne télécharger que le vrai MP4");
    const pending=page.waitForEvent("download",{timeout:12000});
    await page.locator("#downloadVideo").click();
    const result=await pending;
    const {stdout}=await runBinary("ffprobe",["-v","error","-show_entries",
     "stream=codec_type,codec_name,duration,nb_frames,width,height,start_time",
     "-of","json",await result.path()]);
    const streams=JSON.parse(stdout).streams||[];
    const v=streams.find(s=>s.codec_type==="video"),a=streams.find(s=>s.codec_type==="audio");
    assert.ok(v,"flux vidéo MP4 attendu");
    assert.equal(v.codec_name,"h264");
    assert.equal(!!a,!silent,"la piste sonore respecte la décision utilisateur");
    assert.match(await page.locator("#exportStatus").innerText(),/Métadonnées contrôlées/);
    assert.match(await page.locator("#exportStatus").innerText(),/PTS natifs/);
    assert.ok(v.width<=640&&v.height<=640,"limite pilote respectée");
    assert.ok(+v.duration>1&&+v.duration<1.5,"durée vidéo plausible");
    assert.ok(+v.nb_frames>=16&&+v.nb_frames<=20,"quantité de trames attendue");
    const md5=await runBinary("ffmpeg",["-hide_banner","-loglevel","error","-i",
      await result.path(),"-an","-f","framemd5","-"]);
    const hashes=md5.stdout.split("\n").filter(s=>/^\d+,/.test(s.trim())).map(s=>s.split(",").at(-1).trim());
    assert.ok(hashes.length>=16,"le fichier comporte de vraies images décodables");
    assert.ok(new Set(hashes).size>=8,"le film exporté n'est pas une image figée");
    if(a){
      assert.equal(a.codec_name,"aac");
      assert.ok(Math.abs(+v.duration-(+a.duration))<.25,"écart audio/vidéo trop élevé");
    }
   }
   assert.deepEqual(errors,[]);
   await page.close();
  }finally{await browser.close()}
 }finally{
  if(app.listening)await new Promise(ok=>app.close(ok));
  await fs.rm(dir,{recursive:true,force:true});
 }
});


test("NOVA : décodage MP4 à fréquence variable et audit des images",async()=>{
 const tmp=await fs.mkdtemp(path.join(os.tmpdir(),"nova-vfr-"));
 const src=path.join(tmp,"variable.mp4"),app=server();
 try{
  await runBinary("ffmpeg",["-hide_banner","-loglevel","error",
    "-f","lavfi","-i","testsrc2=size=160x90:rate=30:duration=1.6",
    "-vf","select='not(mod(n,2))+not(mod(n,5))'","-fps_mode","vfr",
    "-c:v","libx264","-pix_fmt","yuv420p","-movflags","+faststart","-y",src]);
  await new Promise(r=>app.listen(0,"127.0.0.1",r));
  const browser=await chromium.launch({headless:true,...(process.env.CHROME?{executablePath:process.env.CHROME}:{})});
  try{
   const page=await browser.newPage({viewport:{width:390,height:844},acceptDownloads:true});
   const errors=[];page.on("pageerror",e=>errors.push(e.message));
   await page.goto("http://127.0.0.1:"+app.address().port+"/experiences/nova.html");
   await page.locator("#file").setInputFiles(src);
   const track=await page.evaluate(async()=>{
    const info=await NOVA_DEMUX.analyser(document.querySelector("#file").files[0]);
    if(!info)return null;
    const pts=NOVA_PTS.planifier(info).nonnegative.map(x=>x.ptsUs);
    const deltas=pts.slice(1).map((x,i)=>x-pts[i]);
    return {count:pts.length,deltaKinds:new Set(deltas).size};
   });
   assert.ok(track?.count>=20,"samples VFR reconnus");
   assert.ok(track.deltaKinds>1,"source réellement à cadence variable");
   await page.locator("#allowSilent").check();
   await page.locator("#exportVideo").click();
   await page.waitForFunction(()=>{
    const el=document.querySelector("#downloadVideo");
    return !!el?.getAttribute("href")||document.querySelector("#exportStatus").textContent.startsWith("Export refusé");
   },null,{timeout:90000});
   const href=await page.locator("#downloadVideo").getAttribute("href");
   assert.match(href||"",/^blob:/,await page.locator("#exportStatus").innerText());
   assert.match(await page.locator("#exportStatus").innerText(),/PTS natifs/);
   assert.match(await page.locator("#exportStatus").innerText(),/Cadence :/);
   const req=page.waitForEvent("download");await page.locator("#downloadVideo").click();
   const file=await req;
   const {stdout}=await runBinary("ffprobe",["-v","error","-select_streams","v:0",
     "-show_entries","stream=codec_name,duration,nb_frames,width,height","-of","json",await file.path()]);
   const stream=JSON.parse(stdout).streams[0];
   assert.equal(stream.codec_name,"h264");
   assert.ok(+stream.nb_frames>=20&&+stream.nb_frames<=25);
   assert.ok(+stream.duration>1.2&&+stream.duration<1.8);
   assert.deepEqual(errors,[]);
   await page.close();
  }finally{await browser.close()}
 }finally{
  if(app.listening)await new Promise(r=>app.close(r));
  await fs.rm(tmp,{recursive:true,force:true});
 }
});


test("NOVA 0.6 : source portrait 29,97 i/s, durée et trames conservées en sortie CFR",async()=>{
 const tmp=await fs.mkdtemp(path.join(os.tmpdir(),"nova-portrait-"));
 const src=path.join(tmp,"portrait2997.mp4"),app=server();
 try{
  await runBinary("ffmpeg",["-hide_banner","-loglevel","error","-f","lavfi","-i",
    "testsrc2=size=144x256:rate=30000/1001:duration=1.6",
    "-c:v","libx264","-pix_fmt","yuv420p","-movflags","+faststart","-y",src]);
  await new Promise(r=>app.listen(0,"127.0.0.1",r));
  const browser=await chromium.launch({headless:true,
    ...(process.env.CHROME?{executablePath:process.env.CHROME}:{})});
  try{
   const page=await browser.newPage({viewport:{width:390,height:844},acceptDownloads:true});
   const errors=[];page.on("pageerror",e=>errors.push(e.message));
   await page.goto("http://127.0.0.1:"+app.address().port+"/experiences/nova.html");
   await page.locator("#file").setInputFiles(src);
   const source=await page.evaluate(async()=>{
    const info=await NOVA_DEMUX.analyser(document.querySelector("#file").files[0]);
    if(!info)return null;
    const rank=NOVA_PTS.planifier(info);
    return {width:info.dw,height:info.dh,frames:info.ns,
      gap:rank.nonnegative[1].ptsUs-rank.nonnegative[0].ptsUs};
   });
   assert.ok(source&&source.frames>=40,"source 29,97 i/s réellement créée");
   assert.equal(source.width,144);assert.equal(source.height,256);
   assert.ok(source.gap>33000&&source.gap<35000,"PTS originaux proches de 29,97 i/s");
   await page.locator("#allowSilent").check();
   await page.locator("#exportVideo").click();
   await page.waitForFunction(()=>!!document.querySelector("#downloadVideo")?.getAttribute("href")||
     document.querySelector("#exportStatus").textContent.startsWith("Export refusé"),
     null,{timeout:90000});
   const href=await page.locator("#downloadVideo").getAttribute("href");
   assert.match(href||"",/^blob:/,await page.locator("#exportStatus").innerText());
   const requested=page.waitForEvent("download");
   await page.locator("#downloadVideo").click();
   const downloaded=await requested;
   const {stdout}=await runBinary("ffprobe",["-v","error","-select_streams","v:0",
     "-show_entries","stream=codec_name,duration,nb_frames,width,height,avg_frame_rate",
     "-of","json",await downloaded.path()]);
   const out=JSON.parse(stdout).streams[0];
   assert.equal(out.codec_name,"h264");
   assert.equal(out.width,144);assert.equal(out.height,256);
   assert.equal(out.avg_frame_rate,"15/1");
   assert.ok(+out.nb_frames>=22&&+out.nb_frames<=26,"24 images de sortie environ");
   const md5=await runBinary("ffmpeg",["-hide_banner","-loglevel","error",
      "-i",await downloaded.path(),"-an","-f","framemd5","-"]);
   const hashes=md5.stdout.split("\n").filter(v=>/^\d+,/.test(v.trim())).map(v=>v.split(",").at(-1).trim());
   assert.ok(new Set(hashes).size>=8,"le portrait ne doit pas être figé");
   assert.deepEqual(errors,[]);
  }finally{await browser.close()}
 }finally{
  if(app.listening)await new Promise(r=>app.close(r));
  await fs.rm(tmp,{recursive:true,force:true});
 }
});


test("NOVA 0.7 : MP4 AAC décalé physiquement et refus explicite de la désynchronisation",async()=>{
 const tmp=await fs.mkdtemp(path.join(os.tmpdir(),"nova-av-delay-")),src=path.join(tmp,"delayed.mp4"),app=server();
 try{
  await runBinary("ffmpeg",["-hide_banner","-loglevel","error",
    "-f","lavfi","-i","testsrc2=size=160x90:rate=15:duration=1.4",
    "-itsoffset","0.35","-f","lavfi","-i","sine=frequency=440:duration=1.0",
    "-map","0:v","-map","1:a","-c:v","libx264","-pix_fmt","yuv420p",
    "-c:a","aac","-movflags","+faststart","-y",src]);
  await new Promise(r=>app.listen(0,"127.0.0.1",r));
  const browser=await chromium.launch({headless:true,
    ...(process.env.CHROME?{executablePath:process.env.CHROME}:{})});
  try{
   const page=await browser.newPage({viewport:{width:390,height:844}});
   await page.goto("http://127.0.0.1:"+app.address().port+"/experiences/nova.html");
   await page.locator("#file").setInputFiles(src);
   const audit=await page.evaluate(async()=>{
    const file=document.querySelector("#file").files[0];
    const track=await NOVA_AVSYNC.analyser(file);
    let rejected=false;
    try{NOVA_AVSYNC.verifier(track,{durationSeconds:1.4})}catch(e){rejected=/départ audio décalé/.test(e.message)}
    return {delayUs:track?.delayUs,rejected,edits:track?.edits};
   });
   assert.ok(audit.delayUs>=280000&&audit.delayUs<=450000,
      "l'audio synthétique doit avoir un vrai offset de montage : "+JSON.stringify(audit));
   assert.equal(audit.rejected,true);
   await page.locator("#exportVideo").click();
   await page.waitForFunction(()=>document.querySelector("#exportStatus").textContent.startsWith("Export refusé"),
     null,{timeout:90000});
   assert.match(await page.locator("#exportStatus").innerText(),/audio décalé|départ audio décalé/);
   assert.equal(await page.locator("#downloadVideo").getAttribute("href"),null);
  }finally{await browser.close()}
 }finally{
  if(app.listening)await new Promise(r=>app.close(r));
  await fs.rm(tmp,{recursive:true,force:true});
 }
});


test("NOVA 0.8 : vrai test de synchronisation AV par flash et impulsion audio",async(t)=>{
 const tmp=await fs.mkdtemp(path.join(os.tmpdir(),"nova-av-pulse-"));
 const src=path.join(tmp,"source_sync.mp4"),app=server();
 try{
  // Deux flashs d'une image, deux impulsions de 60 ms : 0,4 s et 1,2 s.
  // La phase audio commence 10 ms avant l'image ; cet offset doit rester stable.
  await runBinary("ffmpeg",["-hide_banner","-loglevel","error",
   "-f","lavfi","-i",
   "color=c=black:s=160x90:r=15:d=2,drawbox=x=0:y=0:w=iw:h=ih:color=white:t=fill:enable='between(t,0.395,0.465)+between(t,1.195,1.265)'",
   "-f","lavfi","-i",
   "aevalsrc=if(lt(abs(t-0.42)\\,0.03)\\,0.7*sin(2*PI*1000*t)\\,0)+if(lt(abs(t-1.22)\\,0.03)\\,0.7*sin(2*PI*1400*t)\\,0):s=48000:d=2",
   "-c:v","libx264","-bf","0","-pix_fmt","yuv420p","-c:a","aac","-b:a","128k",
   "-movflags","+faststart","-use_editlist","0","-y",src]);

  const [sourceAudio,sourceVideo]=await Promise.all([
   decodeAudioEvents(src),decodeVideoEvents(src)
  ]);
  assert.equal(sourceAudio.length,2,"la source contient deux impulsions audio");
  assert.equal(sourceVideo.length,2,"la source contient deux flashs vidéo");

  await new Promise(r=>app.listen(0,"127.0.0.1",r));
  const browser=await chromium.launch({headless:true,
   ...(process.env.CHROME?{executablePath:process.env.CHROME}:{})});
  try{
   const page=await browser.newPage({viewport:{width:390,height:844},acceptDownloads:true});
   const errors=[];page.on("pageerror",e=>errors.push(e.message));
   await page.goto("http://127.0.0.1:"+app.address().port+"/experiences/nova.html");

   await page.locator("#file").setInputFiles(src);
   const chronology=await page.evaluate(async()=>{
     const file=document.querySelector("#file").files[0];
     const info=await NOVA_DEMUX.analyser(file);
     const presentation=NOVA_PTS.planifier(info);
     return {pts:info.ptsUs.slice(4,9),
       chosen06:NOVA_PTS.choisir(presentation.nonnegative,6/15),
       chosen18:NOVA_PTS.choisir(presentation.nonnegative,18/15),
       entries:NOVA_TIMELINE.calculer(2,15).entries.slice(5,8)};
   });
   t.diagnostic("Diagnostic PTS sources et indices d'export : "+JSON.stringify(chronology));
   await page.waitForFunction(()=>!document.querySelector("#exportVideo").disabled);
   await page.locator("#exportVideo").click();
   await page.waitForFunction(()=>!!document.querySelector("#downloadVideo")?.getAttribute("href")||
     document.querySelector("#exportStatus").textContent.startsWith("Export refusé"),
     null,{timeout:90000});
   const href=await page.locator("#downloadVideo").getAttribute("href");
   const message=await page.locator("#exportStatus").innerText();

   assert.match(href||"",/^blob:/,"copie AAC sans AudioEncoder attendue : "+message);
   assert.match(message,/audio AAC original copié/);
   const pending=page.waitForEvent("download");
   await page.locator("#downloadVideo").click();
   const saved=await pending;
   const [sourceHashes,outputHashes]=await Promise.all([
     audioPacketHashes(src),audioPacketHashes(await saved.path())
   ]);
   assert.ok(outputHashes.length>=10,"les unités AAC copiées doivent être nombreuses");
   assert.deepEqual(outputHashes,sourceHashes.slice(0,outputHashes.length),
      "les échantillons AAC doivent être bit à bit identiques à ceux du fichier source");
   const [outputAudio,outputVideo]=await Promise.all([
    decodeAudioEvents(await saved.path()),decodeVideoEvents(await saved.path())
   ]);
   const audit=comparerImpulsions({sourceAudio,sourceVideo,outputAudio,outputVideo,
     toleranceMs:90});
   assert.ok(audit.offsetMs<=34,
     "décalage ajouté doit rester inférieur à une demi-image CFR : "+audit.offsetMs.toFixed(1)+" ms");
   assert.ok(audit.driftMs<=90);
   t.diagnostic("Horloges source audio/vidéo : "+JSON.stringify({sourceAudio,sourceVideo})+
     " ; sortie : "+JSON.stringify({outputAudio,outputVideo}));
   t.diagnostic("Paquets AAC identiques bit à bit : "+outputHashes.length);
   t.diagnostic("Contrôle AV : offset ajouté "+audit.offsetMs.toFixed(1)+
     " ms, dérive "+audit.driftMs.toFixed(1)+" ms ; événements="+sourceAudio.length);
   assert.deepEqual(errors,[]);
  }finally{await browser.close()}
 }finally{
  if(app.listening)await new Promise(r=>app.close(r));
  await fs.rm(tmp,{recursive:true,force:true});
 }
});

async function audioPacketHashes(filename){
 const {stdout}=await runBinary("ffprobe",["-v","error","-select_streams","a:0",
   "-show_packets","-show_entries","packet=data_hash","-show_data_hash","sha256",
   "-of","json",filename],{maxBuffer:4*1024*1024});
 return (JSON.parse(stdout).packets||[]).map(x=>x.data_hash);
}
async function decodeAudioEvents(filename){
 const {stdout}=await runBinary("ffmpeg",["-hide_banner","-loglevel","error",
   "-i",filename,"-map","0:a:0","-ac","1","-ar","48000","-f","f32le","-"],
   {encoding:null,maxBuffer:8*1024*1024});
 return impulsionsPCM(stdout,{sampleRate:48000});
}
async function decodeVideoEvents(filename){
 const {stdout}=await runBinary("ffmpeg",["-hide_banner","-loglevel","error",
   "-i",filename,"-map","0:v:0","-vf","scale=8:8,format=gray",
   "-f","rawvideo","-"],{encoding:null,maxBuffer:8*1024*1024});
 const events=impulsionsVideo(stdout,{width:8,height:8,fps:15});
 const probed=await runBinary("ffprobe",["-v","error","-select_streams","v:0",
   "-show_entries","frame=best_effort_timestamp_time","-of","json",filename]);
 const pts=(JSON.parse(probed.stdout).frames||[]).map(x=>Number(x.best_effort_timestamp_time));
 return events.map(t=>{
   const index=Math.round(t*15);
   if(!Number.isFinite(pts[index]))throw new Error("PTS vidéo FFprobe non disponible pour l'événement "+index);
   return pts[index];
 });
}


test("NOVA 0.8 : le banc FFmpeg valide AAC préservé et détecte +250 ms audio réel",async(t)=>{
 const tmp=await fs.mkdtemp(path.join(os.tmpdir(),"nova-av-reference-"));
 const src=path.join(tmp,"source.mp4"),good=path.join(tmp,"reference.mp4"),
   shifted=path.join(tmp,"desynchronise.mp4");
 try{
  await runBinary("ffmpeg",["-hide_banner","-loglevel","error","-f","lavfi","-i",
   "color=c=black:s=160x90:r=15:d=2,drawbox=x=0:y=0:w=iw:h=ih:color=white:t=fill:enable='between(t,0.395,0.465)+between(t,1.195,1.265)'",
   "-f","lavfi","-i",
   "aevalsrc=if(lt(abs(t-0.42)\\,0.03)\\,0.7*sin(2*PI*1000*t)\\,0)+if(lt(abs(t-1.22)\\,0.03)\\,0.7*sin(2*PI*1400*t)\\,0):s=48000:d=2",
   "-c:v","libx264","-pix_fmt","yuv420p","-c:a","aac","-b:a","128k","-y",src]);
  await runBinary("ffmpeg",["-hide_banner","-loglevel","error","-i",src,
   "-map","0:v:0","-map","0:a:0","-c:v","copy","-c:a","aac","-b:a","128k","-y",good]);
  await runBinary("ffmpeg",["-hide_banner","-loglevel","error","-i",src,
   "-map","0:v:0","-map","0:a:0","-c:v","copy","-af","adelay=250:all=1",
   "-c:a","aac","-b:a","128k","-t","2","-y",shifted]);
  const [sourceAudio,sourceVideo,outputAudio,outputVideo,badAudio,badVideo]=await Promise.all([
   decodeAudioEvents(src),decodeVideoEvents(src),decodeAudioEvents(good),decodeVideoEvents(good),
   decodeAudioEvents(shifted),decodeVideoEvents(shifted)
  ]);
  const goodAudit=comparerImpulsions({sourceAudio,sourceVideo,outputAudio,outputVideo,toleranceMs:90});
  assert.ok(goodAudit.offsetMs<90,"le réencodage de référence ne doit pas décaler le son");
  assert.equal(badAudio.length,2,"les impulsions restent présentes malgré le retard");
  assert.throws(()=>comparerImpulsions({
    sourceAudio,sourceVideo,outputAudio:badAudio,outputVideo:badVideo,toleranceMs:90
   }),/Décalage audio\/vidéo ajouté/);
  const shiftMs=(badAudio[0]-sourceAudio[0])*1000;
  assert.ok(shiftMs>210&&shiftMs<290,"le banc doit mesurer ~250 ms, obtenu "+shiftMs);
  t.diagnostic("FFmpeg témoin sain : "+goodAudit.offsetMs.toFixed(1)+
   " ms ; témoin corrompu : "+shiftMs.toFixed(1)+" ms mesurés");
 }finally{
  await fs.rm(tmp,{recursive:true,force:true});
 }
});
