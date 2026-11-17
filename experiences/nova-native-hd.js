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
// Safari peut délivrer des VideoFrame réordonnées avant PTS=0 : ne pas
// bloquer dès 5 images. Fenêtre bornée en fonction des pixels d\'origine.
const FIRST_FRAME_LOOKAHEAD=16, DECODE_BUFFER_BYTES=96*MiB;
function bufferLimit(plan){
 return Math.max(8,Math.min(24,Math.floor(DECODE_BUFFER_BYTES/(plan.width*plan.height*4))));
}
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
 const colorModule=globalThis.NOVA_HD_COLOR;
 if(!colorModule?.metadata||!colorModule?.verifyFrame)
  fail("analyseur de couleur HEVC et VideoFrame indisponible");
 // Le conteneur colr peut omettre des champs. L'audit lit aussi le SPS/VUI;
 // si les deux sont muets, la première image native doit apporter la preuve.
 // Toute annonce explicite HDR/P3 contradictoire bloque le chemin SDR.
 const colorEvidence=colorModule.metadata(info);
 // Exécuter une restauration classique uniquement sur les images réellement
 // décodées. Ne pas effacer des filtres AR ou reconstruire des détails inventés.
 return Object.freeze({codec:info.codec,width:info.dw,height:info.dh,
  encodedWidth:info.W,encodedHeight:info.H,
  sourceFrames:info.ns,sourceFps:Math.round(fps*10)/10,
  durationSeconds:info.durationUs/1e6,ptsUs:sorted,
  colorEvidence,
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
function plannedMemory(plan,size,detailEnabled=false){
 // Estimation du tampon borné et de trois surfaces de travail,
 // différente des allocations réelles du décodeur matériel.
 const rgba=plan.width*plan.height*4;
 const mb=(size*2+rgba*(bufferLimit(plan)+3)+(detailEnabled?plan.width*plan.height*8:0)+32*MiB)/MiB;
 if(mb>170)fail("budget mémoire de protection iPhone dépassé");
 return Math.round(mb*10)/10;
}
function rgba709(data,w,h,timestamp,duration){
 if(!globalThis.NOVA_COLOR709?.videoFrame)fail("module colorimétrique absent");
 // Les trames décodées BT.709 produisent déjà des valeurs RGB de code
 // dans Canvas. L'aller-retour sRGB EOTF -> BT.709 OETF appliqué ici
 // écrasait les ombres sur une mire BT.709 pourtant non retouchée :
 // jusqu'à 15/255 de dérive sur Chrome dans le test H264/AAC.
 // En voie HD, préserver ces codes avant la matrice YCbCr. Le repli
 // historique <=640x360 demeure inchangé. La fidélité sur Safari avec
 // source BT.601 reste expressément non certifiée tant que non testée.
 if(data.length!==w*h*4||w%2||h%2||w*h>MAX_PIXELS)fail("pixels RGBA invalides");
 const t=Array.from({length:256},(_,i)=>i/255);
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
async function frameToOutput(frame,info,canvas,moteur,arbitre,duration,evidence,detailEnabled){
 const prepared=await globalThis.NOVA_HD_COLOR.imagePourRendu(frame,evidence);
 try{
  const colorProof=prepared.proof;
  const w=canvas.width,h=canvas.height;
  const ctx=canvas.getContext("2d",{willReadFrequently:true});
  if(!ctx)fail("canvas 2D indisponible");
  ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,w,h);
  const m=info.mat;
  ctx.setTransform(m[0]*w/info.dw,m[1]*h/info.dh,
   m[2]*w/info.dw,m[3]*h/info.dh,m[4]*w/info.dw,m[5]*h/info.dh);
  ctx.drawImage(prepared.frame,0,0,info.W,info.H);
  ctx.setTransform(1,0,0,1,0,0);
  const img=ctx.getImageData(0,0,w,h);
  // Deux petits relevés échantillonnés sur UNE trame, pas de copie des
  // pixels dans le bilan JSON. Ne modifie pas le traitement qui fonctionne.
  const lightBefore=globalThis.NOVA_HD_QA.avant(img.data);
  const restored=moteur.restituer(img,{size:256,arbitre});
  if(!restored?.data||restored.data.length!==img.data.length||
     !restored?.bilan)fail("restauration classique invalide");
  const detail=detailEnabled?globalThis.NOVA_DETAIL.appliquer({data:restored.data,width:w,height:h},{enabled:true}):
   {data:restored.data,report:{changedPixels:0,maxChannelDelta:0}};
  const luminosity=globalThis.NOVA_HD_QA.apres(detail.data,lightBefore);
  return {out:rgba709(detail.data,w,h,frame.timestamp,duration),
   modified:!!restored.bilan.intervention||detail.report.changedPixels>0,colorProof,luminosity,detail:detail.report};
 }finally{if(prepared.owned)prepared.frame.close()}
}
async function exporter({file,moteur,arbitre,signal,onProgress=()=>{},
 detailEnabled=false,probe,demux,checkAudio,clock=()=>performance.now()}={}){
 if(!file||typeof file.slice!=="function"||!safe(file.size))fail("fichier vidéo local requis");
 if(!moteur?.restituer||!arbitre?.arbitrer)fail("moteur de restauration classique indisponible");
 if(signal?.aborted)fail("annulé");
 const dmx=probe||globalThis.NOVA_DEMUX?.analyser;
 if(typeof dmx!=="function")fail("analyseur MOV/MP4 absent");
 const info=await dmx(file);
 if(!info)fail("métadonnées vidéo illisibles");
 const p=analyse(info,file.size);
 if(signal?.aborted)fail("annulé");
 if(detailEnabled&&!globalThis.NOVA_DETAIL?.appliquer)fail("module netteté absent");
 const est=plannedMemory(p,file.size,detailEnabled);
 onProgress({stage:"source",width:p.width,height:p.height,frames:p.sourceFrames,
   fps:p.sourceFps,estimatedMiB:est});
 const Decoder=globalThis.VideoDecoder,Encoder=globalThis.VideoEncoder,
  Chunk=globalThis.EncodedVideoChunk;
 if(typeof Chunk!=="function")fail("EncodedVideoChunk absent");
 const decCfg=await configDecoder(info,Decoder);
 const encCfg=await configEncoder(p,Encoder);
 const audioPlan=checkAudio||globalThis.NOVA_AAC_COPY?.planifier;
 if(typeof audioPlan!=="function")fail("analyseur AAC manquant");
 // Conserver l'AAC sans réencodage lorsque l'ASC + la chronologie
 // le permettent. Si non, essayer le codec AAC-LC NATIF avec approbation
 // isConfigSupported; jamais créer une exportation muette.
 let audio=null,copyError=null;
 try{audio=await audioPlan(file,{durationSeconds:p.durationSeconds,signal})}
 catch(e){copyError=e}
 if(signal?.aborted)fail("annulé");
 if(audio?.mode!=="aac-copy"||!audio.packets?.length){
  const native=globalThis.NOVA_AAC_NATIVE;
  if(!native?.planifier)
   fail("copie AAC non validée ; recours AAC natif absent");
  try{
   onProgress({stage:"audio",message:"Copie AAC indisponible ; réencodage AAC-LC natif local…"});
   audio=await native.planifier(file,{durationSeconds:p.durationSeconds,signal});
  }catch(e){
   if(signal?.aborted)fail("annulé");
   // Ce message ne contient ni nom de fichier, ni octet ni donnée personnelle.
   fail("copie AAC non validée ("+
     (copyError?.message?.startsWith("Copie AAC prudente :")?
      copyError.message.slice(21):"profil ou chronologie")+
     ") ; "+(e?.message?.startsWith("Audio natif NOVA :")?
      e.message:"AAC natif non disponible"));
  }
 }
 if(!["aac-copy","aac-native-encode"].includes(audio?.mode)||
    !audio?.packets?.length)
  fail("aucune piste AAC conservable ou réencodable : export refusé");
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
 const decoded=new Map(),bufferMax=bufferLimit(p);
 const feedThreshold=Math.max(6,bufferMax-2);
 let encoder,decoder,failed=null,sent=0,encoded=0,encodedBytes=0,modified=0,closed=false;
 let confirmedColor=null,colorsNotSourceVerified=0;
 const colorMethods=Object.create(null);
 const detailAudit={enabled:!!detailEnabled,method:"bounded-luma-unsharp-v1",frames:0,
  changedPixels:0,maxChannelDelta:0,resolutionIncreased:false,reconstructedDetails:false,
  perceptualGainCertified:false,temporalConsistencyCertified:false};
 const lightAudit={frames:0,samples:0,totalAbsDelta:0,
  totalSignedDelta:0,strongFrames:0};
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
   if(decoded.size>=bufferMax){fr.close();failed=new Error("tampon décodeur HD saturé");return}
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
   const lookahead=next===0?Math.min(p.sourceFrames,FIRST_FRAME_LOOKAHEAD):8;
   while(fed<p.sourceFrames&&decoded.size<feedThreshold&&decoder.decodeQueueSize<4&&fed<next+lookahead){
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
     const result=await frameToOutput(frame,info,canvas,moteur,arbitre,durations[next],p.colorEvidence,detailEnabled);
     confirmedColor=result.colorProof.method;
     if(detailEnabled){detailAudit.frames++;detailAudit.changedPixels+=result.detail.changedPixels;
      detailAudit.maxChannelDelta=Math.max(detailAudit.maxChannelDelta,result.detail.maxChannelDelta);}
     colorMethods[confirmedColor]=(colorMethods[confirmedColor]||0)+1;
     if(result.colorProof.sourceMismatch)colorsNotSourceVerified++;
     modified+=Number(result.modified);
     lightAudit.frames++;
     lightAudit.samples+=result.luminosity.samples;
     lightAudit.totalAbsDelta+=result.luminosity.meanAbsDelta;
     lightAudit.totalSignedDelta+=result.luminosity.meanSignedDelta;
     lightAudit.strongFrames+=Number(result.luminosity.meanAbsDelta>.08);
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
  const copyAudio=audio.mode==="aac-copy"?
    globalThis.NOVA_AAC_COPY:globalThis.NOVA_AAC_NATIVE;
  if(!copyAudio?.copier)fail("écriture AAC indisponible");
  await copyAudio.copier(file,audio,muxer,{signal,
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
  // Le fait d'avoir reçu des chunks AAC ne prouve pas que le MP4 final
  // comporte une piste audio correctement indexée. Relire le MP4 généré
  // avec notre parseur indépendant et refuser un fichier sans audio.
  let outputAudio;
  try{outputAudio=await globalThis.NOVA_AAC_COPY.planifier(blob,{
   durationSeconds:p.durationSeconds,signal})}
  catch{fail("piste audio AAC du MP4 final non vérifiable")}
  if(!outputAudio?.packets?.length)
   fail("piste audio AAC absente du MP4 final");
  // Bilan sur les VRAIES métadonnées du MP4 relu et les paquets AAC
  // effectivement remuxés. Aucun média ni nom de fichier dans l'objet.
  if(!globalThis.NOVA_HD_QA?.bilan)fail("analyseur QA local absent");
  const qualityReport=await globalThis.NOVA_HD_QA.lier(globalThis.NOVA_HD_QA.bilan({
   source:info,output:checkOut,outputAudio,sourceFps:p.sourceFps,
   modifiedFrames:modified,colorMismatchFrames:colorsNotSourceVerified,
   luminosity:lightAudit,detailProcessing:detailAudit,
   audioProcessing:{mode:audio.mode,sampleRate:audio.sampleRate,channels:audio.channels,
    containerChannels:audio.containerChannels??null,
    legacyStereoEntryForMono:audio.legacyStereoEntryForMono??false,
    editMediaTime:audio.editMediaTime??null,rollDistance:audio.rollDistance??null,
    synchronizationPerceptuallyCertified:false},
   colorPipeline:{sourceMatrix:p.colorEvidence.sourceMatrix,
    sourcePrimaries:p.colorEvidence.sourcePrimaries,
    sourceTransferCode:p.colorEvidence.sourceTransferCode,
    sourceFullRange:p.colorEvidence.sourceFullRange,
    renderMethods:{...colorMethods},
    outputConversion:"Canvas-RGB-codes-to-I420-BT709-limited",
    finalDecodedPixelsCompared:false}
  }),file,blob);
  check();
  if(!qualityReport.video.dimensionsPreserved||
     !qualityReport.video.frameCountPreserved)
   fail("bilan QA : dimensions ou nombre d'images altérés");
  onProgress({stage:"complete",progress:1});
  return Object.freeze({blob,mode:"native-hd-classical",
   originalWidth:p.width,originalHeight:p.height,
   sourceFrames:p.sourceFrames,outputFrames:checkOut.ns,
   durationSeconds:p.durationSeconds,sourceFps:p.sourceFps,
   modifiedFrames:modified,qualityReport,audioMode:audio.mode,
   audioQualification:audio.qualification,outputBytes:blob.size,
   sourceColorEvidence:p.colorEvidence.kind,decodedColorEvidence:confirmedColor,
   colorFidelity:colorsNotSourceVerified?
    "native-display-only-not-source-certified":"source-matrix-audited",
   colorMismatchFrames:colorsNotSourceVerified,
   colorWarning:colorsNotSourceVerified?
    "Safari annonce BT.709 pour des trames dont la source dit BT.601. "+
    "Le MP4 reproduit le rendu natif décodé sans certifier l'identité "+
    "colorimétrique de la source : comparer l'export à l'original.":null,
   elapsedMs:Math.round(clock()-started),
   disclaimer:"Traitement classique doux : profil de sortie BT.709 audité mais fidélité à l'original non certifiée ; image et synchronisation à comparer."});
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
