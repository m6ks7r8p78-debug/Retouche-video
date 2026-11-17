#!/usr/bin/env node
/* NOVA 0.23 — bundle statique pour un futur aperçu HTTPS distinct.
 * Aucun déploiement ni média privé : seulement code, WASM, licence.
 */
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import {fileURLToPath} from "node:url";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
const execFileAsync=promisify(execFile);
const root=path.resolve(fileURLToPath(new URL("../",import.meta.url)));
const out=path.resolve(process.argv[2]||path.join(root,"dist","nova-iphone-preview"));
const experience=path.join(root,"experiences");
const names=(await fs.readdir(experience)).filter(n=>n==="nova.html"||
 n.startsWith("nova-")&&n.endsWith(".js"));
const paths=["mp4-muxer.js",...names.map(n=>"experiences/"+n)];
async function walk(dir){
 for(const e of await fs.readdir(path.join(root,dir),{withFileTypes:true})){
  const rel=path.posix.join(dir,e.name);
  if(e.isDirectory())await walk(rel);
  else if(e.isFile())paths.push(rel);
  else throw Error("lien de fichier externe interdit : "+rel);
 }
}
await walk("experiences/vendor/hevc");
await walk("experiences/vendor/smallmotion");
await fs.rm(out,{recursive:true,force:true});
await fs.mkdir(out,{recursive:true});
const manifest=[];
for(const rel of paths){
 if(!/^(mp4-muxer\.js|experiences\/nova[\w.-]*\.(?:js|html)|experiences\/vendor\/(?:hevc|smallmotion)\/[\w./-]+)$/.test(rel))
  throw Error("fichier non autorisé : "+rel);
 const from=path.join(root,rel),to=path.join(out,rel),bytes=await fs.readFile(from);
 await fs.mkdir(path.dirname(to),{recursive:true});
 await fs.writeFile(to,bytes);
 manifest.push({path:rel,bytes:bytes.length,sha256:crypto.createHash("sha256").update(bytes).digest("hex")});
}
// Média purement synthétique, produit à la construction par FFmpeg local.
 // Aucune vidéo de l'utilisateur, aucun téléchargement ni génération sur serveur.
 // Un gris fixe et un bip AAC permettent de tester HEVC -> H.264 + copie AAC.
const fixture="experiences/nova-test-synthetic.mov";
const target=path.join(out,fixture);
await execFileAsync("ffmpeg",[
 "-hide_banner","-loglevel","error","-nostdin",
 "-f","lavfi","-i","color=c=gray:s=160x90:r=15:d=1",
 "-f","lavfi","-i","sine=frequency=660:sample_rate=48000:duration=1",
 "-map","0:v:0","-map","1:a:0",
 "-c:v","libx265","-preset","ultrafast","-threads","1",
 "-x265-params","pools=none:frame-threads=1:log-level=error:bframes=0:keyint=15:colorprim=bt709:transfer=bt709:colormatrix=bt709:range=limited",
 "-pix_fmt","yuv420p","-color_primaries","bt709",
 "-color_trc","bt709","-colorspace","bt709",
 "-c:a","aac","-b:a","16k","-ac","1",
 "-movflags","+write_colr","-f","mov","-y",target
],{timeout:60000});
const fixtureBytes=await fs.readFile(target);
if(fixtureBytes.length<1000||fixtureBytes.length>100000)
 throw Error("Le média synthétique dépasse les bornes prévues");
manifest.push({path:fixture,bytes:fixtureBytes.length,
 sha256:crypto.createHash("sha256").update(fixtureBytes).digest("hex"),
 origin:"ffmpeg-synthetic-only"});
// Mire H.264 entièrement synthétique pour tester le diagnostic SmallMotion
// sans devoir sélectionner ni transmettre une vidéo personnelle.
const motionFixture="experiences/nova-smallmotion-synthetic.mp4";
const motionTarget=path.join(out,motionFixture);
await execFileAsync("ffmpeg",[
 "-hide_banner","-loglevel","error","-nostdin",
 "-f","lavfi","-i","testsrc2=size=160x120:rate=15:duration=1.2",
 "-c:v","libx264","-preset","veryfast","-threads","1",
 "-pix_fmt","yuv420p","-color_primaries","bt709",
 "-color_trc","bt709","-colorspace","bt709",
 "-movflags","+faststart","-f","mp4","-y",motionTarget
],{timeout:60000});
const motionBytes=await fs.readFile(motionTarget);
if(motionBytes.length<1000||motionBytes.length>250000)
 throw Error("La mire SmallMotion synthétique dépasse les bornes prévues");
manifest.push({path:motionFixture,bytes:motionBytes.length,
 sha256:crypto.createHash("sha256").update(motionBytes).digest("hex"),
 origin:"ffmpeg-synthetic-only"});

// Autotest matériel HEVC 1/1/6 sur Safari : huit aplats complètement
// synthétiques. Les références sont les pixels RGB effectivement décodés
// par FFmpeg, PAS les valeurs théoriques avant compression.
const patchW=384,patchH=216,patchFrames=15,patches=[
 {id:"black",rgb:[18,16,20]},{id:"shadow",rgb:[49,46,51]},
 {id:"light-skin",rgb:[210,166,142]},{id:"white",rgb:[250,250,247]},
 {id:"blue-shadow",rgb:[31,36,48]},{id:"skin-shadow",rgb:[91,67,61]},
 {id:"red",rgb:[221,64,45]},{id:"highlight",rgb:[242,231,218]}
];
const patchRaw=path.join(out,".nova-test-601-patches-rgb.tmp");
const patchVideo="experiences/nova-test-601-patches.mov";
const patchFile=path.join(out,patchVideo);
const rgb=new Uint8Array(patchW*patchH*3*patchFrames);
for(let fr=0;fr<patchFrames;fr++)for(let y=0;y<patchH;y++)for(let x=0;x<patchW;x++){
 const p=patches[Math.floor(y/(patchH/2))*4+Math.floor(x/(patchW/4))].rgb;
 const k=((fr*patchH+y)*patchW+x)*3;
 rgb[k]=p[0];rgb[k+1]=p[1];rgb[k+2]=p[2];
}
await fs.writeFile(patchRaw,rgb);
try{
 await execFileAsync("ffmpeg",[
  "-hide_banner","-loglevel","error","-nostdin",
  "-f","rawvideo","-pix_fmt","rgb24","-s",patchW+"x"+patchH,
  "-r","15","-i",patchRaw,
  "-f","lavfi","-i","sine=frequency=660:sample_rate=48000:duration=1",
  "-map","0:v:0","-map","1:a:0",
  "-vf","scale=in_range=full:out_range=limited:out_color_matrix=bt601,format=yuv420p,setparams=color_primaries=bt709:color_trc=bt709:colorspace=smpte170m",
  "-frames:v",String(patchFrames),"-c:v","libx265","-preset","ultrafast",
  "-threads","1",
  "-x265-params","pools=none:frame-threads=1:log-level=error:bframes=0:keyint=15:colorprim=bt709:transfer=bt709:colormatrix=smpte170m:range=limited",
  "-tag:v","hvc1","-pix_fmt","yuv420p",
  "-color_primaries","bt709","-color_trc","bt709","-colorspace","smpte170m",
  "-c:a","aac","-b:a","16k","-ac","1",
  "-movflags","+write_colr","-f","mov","-y",patchFile
 ],{timeout:60000});
}finally{await fs.rm(patchRaw,{force:true})}
const {stdout:patchProbe}=await execFileAsync("ffprobe",[
 "-v","error","-show_entries","stream=codec_name,codec_tag_string,width,height,color_primaries,color_transfer,color_space,nb_frames",
 "-of","json",patchFile
],{timeout:10000});
const patchStreams=JSON.parse(patchProbe).streams||[];
if(!patchStreams.some(s=>s.codec_name==="hevc"&&s.codec_tag_string==="hvc1"&&
 s.width===patchW&&s.height===patchH&&s.color_primaries==="bt709"&&
 s.color_transfer==="bt709"&&s.color_space==="smpte170m"&&
 Number(s.nb_frames)===patchFrames)||!patchStreams.some(s=>s.codec_name==="aac"))
 throw Error("Mire HEVC synthétique non conforme P/T/M=1/1/6 + AAC");
const patchBytes=await fs.readFile(patchFile);
if(patchBytes.length<1500||patchBytes.length>220000)
 throw Error("Mire HEVC 1/1/6 synthétique hors budget");
const {stdout:patchRgb}=await execFileAsync("ffmpeg",[
 "-hide_banner","-loglevel","error","-nostdin","-i",patchFile,
 "-map","0:v:0","-frames:v","1","-vf","format=rgb24",
 "-f","rawvideo","pipe:1"
],{encoding:"buffer",maxBuffer:patchW*patchH*3+8192,timeout:30000});
if(patchRgb.length!==patchW*patchH*3)
 throw Error("Référence RGB synthétique incomplète");
const patchReference=patches.map((p,i)=>{
 const col=i%4,row=Math.floor(i/4);
 const xx=Math.floor((col+.5)*patchW/4),yy=Math.floor((row+.5)*patchH/2);
 const sums=[0,0,0];let count=0;
 for(let y=yy-7;y<=yy+7;y++)for(let x=xx-7;x<=xx+7;x++){
  const k=(y*patchW+x)*3;for(let c=0;c<3;c++)sums[c]+=patchRgb[k+c];
  count++;
 }
 return {id:p.id,rgb:sums.map(v=>Number((v/count).toFixed(3)))};
});
const patchReferencePath="experiences/nova-test-601-reference.json";
const patchReferenceData=JSON.stringify({
 schema:"retoucheproai.nova.synthetic-hevc-601-patches.v1",
 origin:"ffmpeg-synthetic-only",input:"hevc-hvc1-mov",
 primaries:1,transfer:1,matrix:6,width:patchW,height:patchH,
 frames:patchFrames,patches:patchReference
},null,2)+"\n";
await fs.writeFile(path.join(out,patchReferencePath),patchReferenceData);
for(const [rel,bytes] of [[patchVideo,patchBytes],
 [patchReferencePath,Buffer.from(patchReferenceData)]]){
 manifest.push({path:rel,bytes:bytes.length,
  sha256:crypto.createHash("sha256").update(bytes).digest("hex"),
  origin:"ffmpeg-synthetic-only"});
}

const html=await fs.readFile(path.join(out,"experiences/nova.html"),"utf8");
const scripts=[...html.matchAll(/<script\s+src="([^"]+)"/g)].map(x=>x[1]);
// Politique de sécurité d'un site statique isolé : hachage exact du seul
// script inline du laboratoire. Les fichiers personnels ne sont jamais inclus.
const inlineScripts=[...html.matchAll(/<script(?!\s+src=)[^>]*>([\s\S]*?)<\/script>/g)]
 .map(x=>x[1]);
if(inlineScripts.length!==1)throw Error("Une seule section JS inline attendue");
const scriptHash=crypto.createHash("sha256").update(inlineScripts[0]).digest("base64");
const headers=[
 "/*",
 "  Content-Security-Policy: default-src 'self'; base-uri 'none'; script-src 'self' 'sha256-"+scriptHash+"' 'wasm-unsafe-eval'; worker-src 'self' blob:; connect-src 'self' blob:; img-src 'self' blob: data:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; font-src 'self'; object-src 'none'; form-action 'none'; frame-ancestors 'none'",
 "  X-Content-Type-Options: nosniff",
 "  Referrer-Policy: no-referrer",
 "  X-Robots-Tag: noindex, nofollow, noarchive",
 "  Cache-Control: no-store",
 "  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()",
 ""
].join("\n");
const robots="User-agent: *\nDisallow: /\n";
for(const [p,data] of [["_headers",headers],["robots.txt",robots]]){
 await fs.writeFile(path.join(out,p),data);
 manifest.push({path:p,bytes:Buffer.byteLength(data),
  sha256:crypto.createHash("sha256").update(data).digest("hex"),
  origin:"preview-security-only"});
}
for(const script of scripts){
 if(/^(?:https?:|\/\/|data:)/.test(script))throw Error("script tiers interdit");
 const destination=path.resolve(out,"experiences",script);
 if(!destination.startsWith(out+path.sep))throw Error("chemin de script invalide");
 await fs.access(destination);
}
for(const required of [
 "experiences/nova-worker.js","experiences/nova-iphone-lab-ui.js",
 "experiences/nova-smallmotion-bridge.js","experiences/nova-smallmotion-ui.js",
 "experiences/vendor/smallmotion/smallmotion-local.js",
 "experiences/nova-iphone-report.js","experiences/vendor/hevc/wasm/hevc-decode.wasm",
 "experiences/vendor/hevc/wasm/hevc-decode.js",
 "experiences/vendor/hevc/decoder-entry.js",
 "experiences/vendor/hevc/chunk-M6WO4WIK.js",
 "experiences/vendor/hevc/LICENSE.txt"
])if(!manifest.some(x=>x.path===required))throw Error("dépendance absente : "+required);
const home=[
 '<!doctype html><html lang="fr"><meta charset="utf-8">',
 '<meta name="viewport" content="width=device-width,initial-scale=1">',
 '<title>NOVA — aperçu expérimental isolé</title>',
 '<main style="max-width:38rem;margin:12vh auto;padding:1.5rem;font:16px system-ui">',
 '<h1>NOVA — laboratoire iPhone</h1>',
 '<p>Prévisualisation technique isolée, non destinée à la production.',
 'Les vidéos restent traitées dans le navigateur, sans téléversement.</p>',
 '<p>Le test Safari est volontaire et son rapport JSON n’est jamais envoyé automatiquement.</p>',
 '<p><a href="./experiences/nova.html">Ouvrir le laboratoire NOVA</a></p></main></html>'
].join("\n");
await fs.writeFile(path.join(out,"index.html"),home);
manifest.push({path:"index.html",bytes:Buffer.byteLength(home),
 sha256:crypto.createHash("sha256").update(home).digest("hex")});
const record={kind:"NOVA iPhone HTTPS preview, NOT DEPLOYED",version:"0.41",
 publication:"none",privateMediaIncluded:false,
 deployment:"manual-only-distinct-host",csp:"sha256-inline-allowlist",files:manifest.sort((a,b)=>a.path.localeCompare(b.path))};
await fs.writeFile(path.join(out,"asset-manifest.json"),JSON.stringify(record,null,2)+"\n");
console.log(JSON.stringify({version:record.version,files:manifest.length,
 bytes:manifest.reduce((n,f)=>n+f.bytes,0),out},null,2));
