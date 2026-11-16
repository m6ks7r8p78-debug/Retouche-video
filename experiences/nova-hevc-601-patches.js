/* NOVA Safari HEVC 1/1/6 : diagnostic visuel sur une mire FIXE purement
 * synthétique. Ne sélectionne jamais un fichier de l'utilisateur.
 * Pas de transmission, pas de génération d'une copie vidéo, rapport JSON
 * sauvegardé seulement après un clic explicite dans l'interface.
 */
var NOVA_HEVC_601=(()=>{
"use strict";
const SCHEMA="retoucheproai.nova.safari-hevc-601-patches.v1";
const REF_SCHEMA="retoucheproai.nova.synthetic-hevc-601-patches.v1";
const IDS=["black","shadow","light-skin","white","blue-shadow",
 "skin-shadow","red","highlight"];
const okNumber=v=>typeof v==="number"&&Number.isFinite(v)&&v>=0&&v<=255;
const int=n=>Number.isSafeInteger(n);
const round=v=>Math.round(v*1000)/1000;
function validerReference(r){
 if(!r||r.schema!==REF_SCHEMA||r.origin!=="ffmpeg-synthetic-only"||
  r.primaries!==1||r.transfer!==1||r.matrix!==6||
  r.width!==384||r.height!==216||r.frames!==15||
  !Array.isArray(r.patches)||r.patches.length!==IDS.length)
  throw new Error("Référence synthétique 1/1/6 non vérifiée");
 r.patches.forEach((p,i)=>{
  if(p?.id!==IDS[i]||!Array.isArray(p.rgb)||p.rgb.length!==3||
     !p.rgb.every(okNumber))
    throw new Error("Valeurs RGB de référence synthétique invalides");
 });
 return r;
}
function safeFrame(frame){
 const cs=frame?.colorSpace||{};
 const whitelist=(v,allowed)=>allowed.includes(v)?v:"unspecified";
 return Object.freeze({
  format:whitelist(frame?.format,["I420","NV12","RGBX","RGBA","BGRA",
   "BGRX","I422","I444","I420P10","I420P12","P010"]),
  primaries:whitelist(cs.primaries,["bt709","bt470bg","smpte170m",
   "bt2020","smpte432","iec61966-2-1"]),
  transfer:whitelist(cs.transfer,["bt709","smpte170m",
   "iec61966-2-1","pq","hlg"]),
  matrix:whitelist(cs.matrix,["bt709","smpte170m",
   "bt470bg","bt2020-ncl","rgb"]),
  range:cs.fullRange===true?"full":
   cs.fullRange===false?"limited":"unspecified"
 });
}
function moyens(image,width,height){
 if(!int(width)||!int(height)||width!==384||height!==216||
  !image||image.length!==width*height*4)
  throw new Error("Mire Canvas RGBA incohérente");
 return IDS.map((id,i)=>{
  const x=Math.floor(((i%4)+.5)*width/4),
   y=Math.floor((Math.floor(i/4)+.5)*height/2);
  const c=[0,0,0];let n=0;
  for(let yy=y-7;yy<=y+7;yy++)for(let xx=x-7;xx<=x+7;xx++){
   const k=(yy*width+xx)*4;
   for(let z=0;z<3;z++)c[z]+=image[k+z];
   n++;
  }
  return {id,rgb:c.map(v=>round(v/n))};
 });
}
function synthese(reference,observed,frame){
 const ref=validerReference(reference);
 if(!Array.isArray(observed)||observed.length!==IDS.length)
  throw new Error("Mesures Canvas synthétiques incohérentes");
 let total=0,max=0;
 const patches=IDS.map((id,i)=>{
  const p=observed[i],target=ref.patches[i];
  if(p?.id!==id||!Array.isArray(p.rgb)||p.rgb.length!==3||
    !p.rgb.every(okNumber))
    throw new Error("Mesures de la mire non finies ou hors plage");
  const d=p.rgb.map((v,k)=>round(v-target.rgb[k]));
  for(const x of d){total+=Math.abs(x);max=Math.max(max,Math.abs(x))}
  return {id,reference:target.rgb.map(round),
    safari:p.rgb.map(round),delta:d};
 });
 const mean=round(total/(IDS.length*3));
 return Object.freeze({
  schema:SCHEMA,origin:"ffmpeg-synthetic-only",
  status:"measured-not-source-certified",
  source:{codec:"hevc-hvc1",primaries:1,transfer:1,matrix:6,
   width:384,height:216},
  decoded:safeFrame(frame),
  meanAbsRgb255:mean,maxAbsRgb255:round(max),
  direction:mean<=4?"near-synthetic-reference":
   mean<=12?"noticeable-variation":"large-variation",
  patches,privacy:{personalMediaIncluded:false,
   rawMediaIncluded:false,rawFrameIncluded:false,
   deviceIdentifiersIncluded:false,networkUpload:false},
  limitation:"Mire HEVC 1/1/6 générée par FFmpeg ; ceci mesure le rendu "+
   "Canvas du décodeur de ce navigateur, pas la fidélité de vos vidéos "+
   "personnelles ni une restauration IA."
 });
}
async function runSynthetic({signal}={}){
 if(signal?.aborted)throw new Error("cancelled");
 const fetchLocal=async(name,max)=>{
  const response=await fetch("./"+name,{cache:"no-store",signal});
  if(!response.ok)throw new Error("synthetic-fetch-failed");
  const data=await response.arrayBuffer();
  if(!data.byteLength||data.byteLength>max)
   throw new Error("synthetic-size-invalid");
  return data;
 };
 const reference=validerReference(JSON.parse(new TextDecoder().decode(
  await fetchLocal("nova-test-601-reference.json",10000))));
 const video=await fetchLocal("nova-test-601-patches.mov",250000);
 const file=new Blob([video],{type:"video/quicktime"});
 if(!globalThis.NOVA_DEMUX?.analyser)
  throw new Error("demux-unavailable");
 const info=await NOVA_DEMUX.analyser(file);
 if(!info||!/^(?:hvc1|hev1)\./.test(info.codec||"")||
  info.W!==reference.width||info.H!==reference.height||
  info.ns!==reference.frames||info.key?.[0]!==true||
  info.color?.primaries!==1||info.color?.transfer!==1||
  info.color?.matrix!==6)
  throw new Error("synthetic-source-not-116");
 if(!globalThis.VideoDecoder?.isConfigSupported||
  typeof globalThis.EncodedVideoChunk!=="function")
  throw new Error("webcodecs-hevc-unavailable");
 const common={codec:info.codec,codedWidth:info.W,codedHeight:info.H,
  optimizeForLatency:false,description:info.desc};
 let config=null;
 for(const acceleration of ["prefer-hardware","no-preference"]){
  try{
   const c={...common,hardwareAcceleration:acceleration};
   if((await VideoDecoder.isConfigSupported(c)).supported){config=c;break}
  }catch{}
 }
 if(!config)throw new Error("webcodecs-hevc-unavailable");
 let first=null,decoderError=null,decoder=null,frames=0;
 try{
  decoder=new VideoDecoder({
   output:frame=>{
    frames++;
    if(!first&&frame.timestamp===info.ptsUs[0])first=frame;
    else frame.close();
   },
   error:()=>{decoderError=true}
  });
  decoder.configure(config);
  for(let i=0;i<reference.frames;i++){
   if(signal?.aborted)throw new Error("cancelled");
   const start=info.so[i],size=info.sz[i];
   if(!int(start)||!int(size)||size<1||start+size>file.size||
     size>1024*1024)
    throw new Error("synthetic-sample-invalid");
   const payload=new Uint8Array(await file.slice(start,start+size).arrayBuffer());
   decoder.decode(new EncodedVideoChunk({
    type:info.key[i]?"key":"delta",timestamp:info.ptsUs[i],data:payload
   }));
  }
  await decoder.flush();
  if(decoderError||!first||frames!==reference.frames)
   throw new Error("hevc-decoder-failed");
  if(signal?.aborted)throw new Error("cancelled");
  const canvas=document.createElement("canvas");
  canvas.width=reference.width;canvas.height=reference.height;
  const ctx=canvas.getContext("2d",{willReadFrequently:true,colorSpace:"srgb"});
  if(!ctx)throw new Error("canvas-unavailable");
  try{ctx.drawImage(first,0,0,canvas.width,canvas.height)}
  catch{throw new Error("canvas-unavailable")}
  const rgba=ctx.getImageData(0,0,canvas.width,canvas.height).data;
  const data=synthese(reference,moyens(rgba,canvas.width,canvas.height),first);
  canvas.width=0;canvas.height=0;
  return data;
 }finally{
  try{first?.close()}catch{}
  try{if(decoder?.state!=="closed")decoder?.close()}catch{}
 }
}
return Object.freeze({validerReference,safeFrame,moyens,synthese,runSynthetic});
})();
if(typeof module!=="undefined"&&module.exports)module.exports=NOVA_HEVC_601;
