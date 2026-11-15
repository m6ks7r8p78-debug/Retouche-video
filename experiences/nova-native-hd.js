/* NOVA 0.27 — moteur HD iPhone expérimental, sans serveur.
 * Décodage WebCodecs natif HEVC/H264 -> restauration classique prudente
 * par NOVA_ZONES -> encodage H264 avec tous les PTS source -> copie AAC.
 * Pas de baisse silencieuse de résolution/cadence, pas d'IA générative.
 * Les médias ne quittent jamais le navigateur. Plan HD borné à 2,2 Mpix/360 trames.
 */
var NOVA_NATIVE_HD=(()=>{
"use strict";
const MiB=1048576, MAX_PIXELS=2200000, MAX_FRAMES=360, MAX_BYTES=60*MiB;
const MAX_US=12000000, MAX_ENCODED=32*MiB;
const fail=s=>{throw new Error("NOVA HD : "+s)};
const safe=n=>Number.isSafeInteger(n);
const codes=["avc1.640028","avc1.4d4028","avc1.42e028","avc1.42e01f"];
function analyse(info,size,{testCodec=false}={}){
 if(!info||!safe(size)||size<1||size>MAX_BYTES)fail("source ou taille invalide");
 if(!/^(hvc1|hev1|avc1|avc3)\./.test(info.codec||""))fail("codec vidéo non pris en charge");
 if(![info.W,info.H,info.dw,info.dh,info.ns,info.durationUs].every(safe)||
    info.W<2||info.H<2||info.dw<2||info.dh<2||info.ns<1||
    info.durationUs<1||info.durationUs>MAX_US)fail("métadonnées vidéo ou durée invalides");
 if(info.W%2||info.H%2||info.dw%2||info.dh%2||
    info.W*info.H>MAX_PIXELS||info.dw*info.dh>MAX_PIXELS||
    info.ns>MAX_FRAMES)fail("limite de l'essai HD expérimental atteinte");
 if(!Array.isArray(info.ptsUs)||info.ptsUs.length!==info.ns||
    !Array.isArray(info.sz)||info.sz.length!==info.ns||
    !Array.isArray(info.so)||info.so.length!==info.ns||
    !Array.isArray(info.key)||info.key.length!==info.ns||
    !info.key[0])fail("PTS, index ou image clé source invalides");
 const sorted=info.ptsUs.slice().sort((a,b)=>a-b);
 if(sorted.some((p,i)=>!safe(p)||p<0||p>=info.durationUs||
    i>0&&p<=sorted[i-1]))fail("PTS source ambigus ou hors durée");
 if(sorted[0]!==0)fail("début PTS source non nul ; création de pixels interdite");
 const gaps=sorted.slice(1).map((p,i)=>p-sorted[i]);
 const typical=gaps.length?gaps.slice().sort((a,b)=>a-b)[Math.floor(gaps.length/2)]:
    info.durationUs;
 if(!safe(typical)||typical<10000||typical>200000||
    gaps.some(g=>g>Math.max(250000,typical*2.5))||
    info.durationUs-sorted.at(-1)>Math.max(250000,typical*2.5))
   fail("cadence source irrégulière hors contrat HD");
 const fps=info.ns*1000000/info.durationUs;
 if(fps<5||fps>60.5)fail("cadence source hors 5 à 60 images/s");
 if(!Array.isArray(info.mat)||info.mat.length!==6)fail("rotation source non auditée");
 // La matrice de presentation orthogonale est déjà contrôlée par NOVA_DEMUX.
 const color=info.color;
 if(!color||!["nclc","nclx"].includes(color.kind)||color.primaries!==1||
    color.transfer!==1||color.matrix!==1||color.fullRange===true)
  fail("BT.709 SDR 8 bits limité non confirmé");
 if(!testCodec){
  if(!globalThis.NOVA_DEMUX?.exigerPresentationFidele)fail("contrôle géométrie absent");
  NOVA_DEMUX.exigerPresentationFidele(info);
  if(/^(hvc1|hev1)\./.test(info.codec)){
   if(!globalThis.NOVA_HEVC_VUI?.analyser)fail("audit SPS/VUI absent");
   NOVA_HEVC_VUI.analyser(info);
  }
 }
 // Exécuter une restauration classique uniquement sur les images réellement
 // décodées. Ne pas effacer des filtres AR ou reconstruire des détails inventés.
 return Object.freeze({codec:info.codec,width:info.dw,height:info.dh,
  encodedWidth:info.W,encodedHeight:info.H,
  sourceFrames:info.ns,sourceFps:Math.round(fps*10)/10,
  durationSeconds:info.durationUs/1e6,ptsUs:sorted,
  rotated:info.mat[0]!==1||info.mat[1]!==0||info.mat[2]!==0||info.mat[3]!==1});
}
async function configEncoder(plan,VideoEncoderClass=globalThis.VideoEncoder){
 if(!VideoEncoderClass?.isConfigSupported)fail("encodeur H.264 WebCodecs absent");
 const mbps=plan.width*plan.height*plan.sourceFps*.21;
 for(const codec of codes){
  const config={codec,width:plan.width,height:plan.height,
   framerate:Math.max(5,Math.min(60,plan.sourceFps)),
   bitrate:Math.min(20000000,Math.max(8000000,Math.round(mbps))),
   latencyMode:"quality",avc:{format:"avc"}};
  try{if((await VideoEncoderClass.isConfigSupported(config)).supported)return config}
  catch{}
 }
 fail("encodage H.264 HD indisponible sur cet appareil");
}
async function configDecoder(info,VideoDecoderClass=globalThis.VideoDecoder){
 if(!VideoDecoderClass?.isConfigSupported)fail("décodeur natif WebCodecs indisponible");
 const common={codec:info.codec,codedWidth:info.W,codedHeight:info.H,
  optimizeForLatency:false,...(info.desc?{description:info.desc}:{})};
 for(const hardwareAcceleration of ["prefer-hardware","no-preference"]){
  const cfg={...common,hardwareAcceleration};
  try{if((await VideoDecoderClass.isConfigSupported(cfg)).supported)return cfg}
  catch{}
 }
 fail("décodage natif HEVC/H264 non disponible pour ce fichier");
}
function plannedMemory(plan,size){
 // Estimation prudente du chemin streaming à six surfaces au plus,
 // différente des allocations réelles du décodeur matériel.
 const rgba=plan.width*plan.height*4;
 const mb=(size*2+rgba*6+32*MiB)/MiB;
 if(mb>170)fail("budget mémoire de protection iPhone dépassé");
 return Math.round(mb*10)/10;
}
function rgba709(data,w,h,timestamp,duration){
 if(!globalThis.NOVA_COLOR709?.videoFrame)fail("module colorimétrique absent");
 // Cette API est strictement limitée à 640x360 ; ici l'extension locale
 // utilise la même conversion sRGB->BT709 avec un plafond HD contrôlé.
 if(data.length!==w*h*4||w%2||h%2||w*h>MAX_PIXELS)fail("pixels RGBA invalides");
 const t=Array.from({length:256},(_,i)=>{
  const c=i/255,linear=c<=.04045?c/12.92:((c+.055)/1.055)**2.4;
  return linear<.018?4.5*linear:1.099*linear**.45-.099;
 });
 const y=new Uint8Array(w*h*3/2),n=w*h,clip=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
 let cbAt=n,crAt=n+n/4;
 for(let row=0;row<h;row+=2)for(let col=0;col<w;col+=2){
  let cb=0,cr=0;
  for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++){
   const idx=(row+dy)*w+col+dx,k=idx*4;
   if(data[k+3]!==255)fail("alpha non opaque");
   const R=t[data[k]],G=t[data[k+1]],B=t[data[k+2]];
   const Y=.2126*R+.7152*G+.0722*B;
   y[idx]=clip(Math.round(16+219*Y),16,235);
   cb+=(B-Y)/1.8556;cr+=(R-Y)/1.5748;
  }
  y[cbAt++]=clip(Math.round(128+224*cb/4),16,240);
  y[crAt++]=clip(Math.round(128+224*cr/4),16,240);
 }
 return new VideoFrame(y,{format:"I420",codedWidth:w,codedHeight:h,
  timestamp,duration,colorSpace:{primaries:"bt709",transfer:"bt709",
   matrix:"bt709",fullRange:false}});
}
function frameToOutput(frame,info,canvas,moteur,arbitre,duration){
 const w=canvas.width,h=canvas.height;
 const ctx=canvas.getContext("2d",{willReadFrequently:true});
 if(!ctx)fail("canvas 2D indisponible");
 ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,w,h);
 const m=info.mat;
 ctx.setTransform(m[0]*w/info.dw,m[1]*h/info.dh,
  m[2]*w/info.dw,m[3]*h/info.dh,m[4]*w/info.dw,m[5]*h/info.dh);
 ctx.drawImage(frame,0,0,info.W,info.H);
 ctx.setTransform(1,0,0,1,0,0);
 const img=ctx.getImageData(0,0,w,h);
 // Le rapport force-par-pixel n'est pas utilisé par l'export MP4 ;
 // on économise 4 octets/pixel/image pour éviter la pression mémoire iOS.
 const restored=moteur.restituer(img,{size:256,arbitre,includeForces:false});
 if(!restored?.data||restored.data.length!==img.data.length||
    !restored?.bilan)fail("restauration classique invalide");
 return {out:rgba709(restored.data,w,h,frame.timestamp,duration),
  modified:!!restored.bilan.intervention};
}
async function exporter({file,moteur,arbitre,signal,onProgress=()=>{},
 probe,demux,checkAudio,clock=()=>performance.now()}={}){
 if(!file||typeof file.slice!=="function"||!safe(file.size))fail("fichier vidéo local requis");
 if(!moteur?.restituer||!arbitre?.arbitrer)fail("moteur de restauration classique indisponible");
 if(signal?.aborted)fail("annulé");
 const dmx=probe||globalThis.NOVA_DEMUX?.analyser;
 if(typeof dmx!=="function")fail("analyseur MOV/MP4 absent");
 const info=await dmx(file);
 if(!info)fail("métadonnées vidéo illisibles");
 const p=analyse(info,file.size);
 if(signal?.aborted)fail("annulé");
 const est=plannedMemory(p,file.size);
 onProgress({stage:"source",width:p.width,height:p.height,frames:p.sourceFrames,
   fps:p.sourceFps,estimatedMiB:est});
 const Decoder=globalThis.VideoDecoder,Encoder=globalThis.VideoEncoder,
  Chunk=globalThis.EncodedVideoChunk;
 if(typeof Chunk!=="function")fail("EncodedVideoChunk absent");
 const decCfg=await configDecoder(info,Decoder);
 const encCfg=await configEncoder(p,Encoder);
 const audioPlan=checkAudio||globalThis.NOVA_AAC_COPY?.planifier;
 if(typeof audioPlan!=="function")fail("analyseur AAC manquant");
 // Politique obligatoire : conserver le son, sinon ne pas exporter.
 const audio=await audioPlan(file,{durationSeconds:p.durationSeconds,signal});
 if(!audio||audio.mode!=="aac-copy"||!audio.packets?.length)
  fail("AAC original non conservable, export HD refusé");
 if(signal?.aborted)fail("annulé");
 const Muxer=globalThis.Mp4Muxer;
 if(!Muxer?.Muxer||!Muxer?.ArrayBufferTarget)fail("muxeur MP4 local indisponible");
 const target=new Muxer.ArrayBufferTarget();
 const muxer=new Muxer.Muxer({target,fastStart:"in-memory",
  video:{codec:"avc",width:p.width,height:p.height,colorMetadata:"bt709-limited"},
  audio:{codec:"aac",sampleRate:audio.sampleRate,
   numberOfChannels:audio.channels,
   ...(audio.rollDistance!=null?{rollDistance:audio.rollDistance}:{}),
   ...(audio.editDurationSeconds!=null?{
    editMediaTime:audio.editMediaTime,editDurationSeconds:audio.outputEditSeconds,
    editGapSeconds:audio.outputEditGapSeconds,editListVersion:audio.editListVersion
   }:{})}});
 const canvas=document.createElement("canvas");canvas.width=p.width;canvas.height=p.height;
 const ranks=new Map(p.ptsUs.map((time,i)=>[time,i]));
 const decoded=new Map();
 let encoder,decoder,failed=null,sent=0,encoded=0,encodedBytes=0,modified=0,closed=false;
 const started=clock();
 const check=()=>{if(signal?.aborted)fail("annulé");if(failed)throw failed};
 try{
  encoder=new Encoder({output:(chunk,meta)=>{
   try{
    encodedBytes+=chunk.byteLength;
    if(encodedBytes>MAX_ENCODED)fail("budget MP4 HD dépassé");
    muxer.addVideoChunk(chunk,meta);encoded++;
   }catch(e){failed=e}
  },error:e=>{failed=e}});
  encoder.configure(encCfg);
  decoder=new Decoder({output:fr=>{
   if(closed){fr.close();return}
   const rank=ranks.get(fr.timestamp);
   if(rank===undefined||decoded.has(rank)){
    fr.close();failed=new Error("PTS décodé absent ou en double");return;
   }
   if(decoded.size>=7){fr.close();failed=new Error("tampon décodeur HD saturé");return}
   decoded.set(rank,fr);
  },error:e=>{failed=e}});
  decoder.configure(decCfg);
  const frames=p.ptsUs;
  const durations=frames.map((x,i)=>i+1<frames.length?frames[i+1]-x:
   info.durationUs-x);
  if(durations.some(x=>!safe(x)||x<1))fail("durées images invalides");
  // Lire les échantillons dans l'ordre de décodage, strictement à partir du
  // fichier local (DTS), sans transfert vers un serveur ou relecture complète.
  let fed=0,next=0,stalled=clock();
  while(next<p.sourceFrames){
   check();
   while(fed<p.sourceFrames&&decoded.size<5&&decoder.decodeQueueSize<4&&fed<next+8){
    const offset=info.so[fed],len=info.sz[fed];
    if(!safe(offset)||!safe(len)||len<1||offset+len>file.size)
     fail("échantillon source tronqué");
    const data=new Uint8Array(await file.slice(offset,offset+len).arrayBuffer());
    decoder.decode(new Chunk({type:info.key[fed]?"key":"delta",
     timestamp:info.ptsUs[fed],data}));
    fed++;
   }
   check();
   const frame=decoded.get(next);
   if(frame){
    decoded.delete(next);
    try{
     const result=frameToOutput(frame,info,canvas,moteur,arbitre,durations[next]);
     modified+=Number(result.modified);
     try{encoder.encode(result.out,{keyFrame:next===0||next%90===0})}
     finally{result.out.close()}
     next++;sent++;
     onProgress({stage:"video",progress:sent/p.sourceFrames,
      frame:sent,total:p.sourceFrames});
     stalled=clock();
    }finally{frame.close()}
    // Laisser travailler l'encodeur matériel avec pression bornée.
    if(encoder.encodeQueueSize>4)
     await globalThis.NOVA_GUARD.attendreEncodeur(encoder,{
      maxQueue:2,signal,timeoutMs:20000});
   }else{
    if(fed===p.sourceFrames&&decoder.decodeQueueSize===0){
     await decoder.flush();
     check();
     if(!decoded.has(next))fail("image décodée manquante");
    }
    if(clock()-stalled>30000)fail("délai décodeur HD dépassé");
    await new Promise(resolve=>setTimeout(resolve,20));
   }
  }
  await encoder.flush();check();
  if(encoded!==p.sourceFrames)fail("nombre d'images H.264 différent de la source");
  const packets=[];
  await globalThis.NOVA_AAC_COPY.copier(file,audio,muxer,{signal,
   onPacket:v=>packets.push(v)});
  globalThis.NOVA_GUARD.auditerPaquetsAAC(packets,{
   durationSeconds:p.durationSeconds,leadingGapSeconds:audio.outputEditGapSeconds??0});
  muxer.finalize();
  const blob=new Blob([target.buffer],{type:"video/mp4"});
  if(blob.size<1024||blob.size>MAX_ENCODED)fail("MP4 final incohérent");
  const checkOut=await globalThis.NOVA_DEMUX.analyser(blob);
  if(!checkOut||checkOut.dw!==p.width||checkOut.dh!==p.height||
    checkOut.ns!==p.sourceFrames||
    Math.abs(checkOut.durationUs-info.durationUs)>150000)
   fail("dimensions, cadence source ou durée non préservées");
  const c=checkOut.color;
  if(!c||c.kind!=="nclx"||c.primaries!==1||c.transfer!==1||
    c.matrix!==1||c.fullRange!==false)
   fail("MP4 final : colorimétrie BT.709 non confirmée");
  onProgress({stage:"complete",progress:1});
  return Object.freeze({blob,mode:"native-hd-classical",
   originalWidth:p.width,originalHeight:p.height,
   sourceFrames:p.sourceFrames,outputFrames:checkOut.ns,
   durationSeconds:p.durationSeconds,sourceFps:p.sourceFps,
   modifiedFrames:modified,audioMode:"aac-copy",outputBytes:blob.size,
   elapsedMs:Math.round(clock()-started),
   disclaimer:"Traitement classique doux, pas de reconstruction neuronale, visuel et audio à vérifier sur iPhone"});
 }finally{
  closed=true;for(const frame of decoded.values())try{frame.close()}catch{}
  decoded.clear();
  try{if(decoder?.state!=="closed")decoder.close()}catch{}
  try{if(encoder?.state!=="closed")encoder.close()}catch{}
  canvas.width=0;canvas.height=0;
 }
}
return Object.freeze({analyse,configDecoder,configEncoder,plannedMemory,exporter});
})();
if(typeof module!=="undefined"&&module.exports)module.exports=NOVA_NATIVE_HD;
