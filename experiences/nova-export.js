/* RetoucheProAI NOVA v0.3 — export MP4 court, experimental, sans upload.
 * Decode et seek vidéo sur HTMLVideoElement; traitement NOVA_MOSAIQUE; re-encodage
 * H.264 et AAC lorsque disponible. Refuse la perte du son sauf choix explicite.
 * Aucun accès aux poids IA; ce n'est PAS un export pleine cadence/fidélité certifiée.
 */
var NOVA_EXPORT=(()=>{
"use strict";
const MAX_SECONDS=12,MAX_BYTES=60*1024*1024,MAX_SIDE=640,FPS=15;
const finite=x=>typeof x==="number"&&Number.isFinite(x);
function plan({duration,width,height,bytes,fps=FPS,maxSide=MAX_SIDE}={}){
 if(!finite(duration)||duration<=0||duration>MAX_SECONDS)throw new RangeError("NOVA : durée limitée à 12 secondes");
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<2||height<2)throw new RangeError("Dimensions source invalides");
 if(!finite(bytes)||bytes<1||bytes>MAX_BYTES)throw new RangeError("Fichier limité à 60 Mo pour ce pilote");
 if(!finite(fps)||fps<5||fps>FPS)throw new RangeError("Cadence pilote limitée à 15 images/s");
 if(!finite(maxSide)||maxSide<96||maxSide>MAX_SIDE)throw new RangeError("Sortie pilote limitée à 640 px");
 const factor=Math.min(1,maxSide/Math.max(width,height));
 const outW=Math.max(2,Math.round(width*factor/2)*2);
 const outH=Math.max(2,Math.round(height*factor/2)*2);
 return {width:outW,height:outH,fps,frames:Math.max(1,Math.floor(duration*fps)),
   duration, maxSeconds:MAX_SECONDS, audio:"conserver ou refuser",pilot:true};
}
function disposer(media){
 if(!media)return;
 try{media.pause();media.removeAttribute("src");media.load();media.remove()}catch(_){}
}
function pret(media){
 return new Promise((resolve,reject)=>{
  let timer;
  function cleanup(){clearTimeout(timer);media.removeEventListener("loadedmetadata",ok);media.removeEventListener("error",bad)}
  function ok(){cleanup();resolve()}
  function bad(){cleanup();reject(new Error("La vidéo ne peut pas être décodée ici"))}
  media.addEventListener("loadedmetadata",ok,{once:true});
  media.addEventListener("error",bad,{once:true});
  timer=setTimeout(()=>{cleanup();reject(new Error("Métadonnées vidéo indisponibles"))},10000);
  media.load();
 });
}
function seek(media,t,signal){
 return new Promise((resolve,reject)=>{
  if(signal?.aborted){reject(new Error("Export annulé"));return}
  if(Math.abs(media.currentTime-t)<.012&&media.readyState>=2){resolve();return}
  let timer;
  function cleanup(){clearTimeout(timer);media.removeEventListener("seeked",ok);media.removeEventListener("error",bad);signal?.removeEventListener("abort",abort)}
  function ok(){cleanup();resolve()}
  function bad(){cleanup();reject(new Error("Décodage impossible à cette position"))}
  function abort(){cleanup();reject(new Error("Export annulé"))}
  media.addEventListener("seeked",ok,{once:true});media.addEventListener("error",bad,{once:true});signal?.addEventListener("abort",abort,{once:true});
  timer=setTimeout(()=>{cleanup();reject(new Error("Position vidéo inaccessible"))},9000);
  try{media.currentTime=t}catch(e){cleanup();reject(e)}
 });
}
async function audioDuFichier(file,allowSilent,AudioContextType){
 if(allowSilent)return null;
 if(!AudioContextType||typeof AudioEncoder==="undefined")throw new Error("Conservation audio non prise en charge ici. Aucun export sans son automatique.");
 let ctx;try{
  ctx=new AudioContextType();
  const data=await file.arrayBuffer(),buffer=await ctx.decodeAudioData(data);
  if(!buffer||!buffer.length||!buffer.numberOfChannels||buffer.numberOfChannels>2)
   throw new Error("Piste audio non reconnue");
  if(buffer.duration>MAX_SECONDS+.5)throw new Error("Audio plus long que la durée pilote");
  const cfg={codec:"mp4a.40.2",sampleRate:buffer.sampleRate,numberOfChannels:buffer.numberOfChannels,bitrate:128000};
  if(!(await AudioEncoder.isConfigSupported(cfg)).supported)throw new Error("Encodeur AAC indisponible");
  return {buffer,cfg};
 }catch(e){throw new Error("Son non préservable sur cet appareil : "+(e.message||"échec de décodage")+". Export interrompu.")}
 finally{try{await ctx?.close()}catch(_){}}
}
function transformateur(moteur,arbitre){
 let worker=null,next=0,closed=false;
 if(typeof Worker!=="undefined")try{worker=new Worker("nova-worker.js")}catch(_){worker=null}
 function traiter(image){
  if(closed)return Promise.reject(new Error("Traitement arrêté"));
  if(!worker)return Promise.resolve(moteur.restituer(image,{size:64,arbitre}));
  return new Promise((resolve,reject)=>{
   const id=++next;
   const timeout=setTimeout(()=>{fermer();reject(new Error("Traitement image trop long"))},12000);
   worker.onmessage=e=>{
    if(e.data?.id!==id)return;
    clearTimeout(timeout);e.data?.ok?resolve(e.data):reject(new Error(e.data?.erreur||"Traitement refusé"));
   };
   worker.onerror=e=>{clearTimeout(timeout);fermer();reject(new Error(e.message||"Erreur Worker"))};
   try{worker.postMessage({id,image:{width:image.width,height:image.height,data:image.data},size:64},[image.data.buffer])}
   catch(e){clearTimeout(timeout);fermer();reject(e)}
  });
 }
 function fermer(){closed=true;if(worker){worker.terminate();worker=null}}
 return {traiter,fermer};
}
async function exporter({file,moteur,arbitre,allowSilent=false,onProgress=()=>{},signal}={}){
 if(!file||typeof file.arrayBuffer!=="function"||!moteur?.restituer||!arbitre?.arbitrer)throw new TypeError("Fichier et moteurs NOVA requis");
 if(typeof VideoEncoder==="undefined"||typeof VideoFrame==="undefined"||typeof Mp4Muxer==="undefined")
   throw new Error("WebCodecs ou muxer MP4 indisponible sur cet appareil");
 if(signal?.aborted)throw new Error("Export annulé");
 const media=document.createElement("video");
 media.muted=true;media.playsInline=true;media.preload="auto";
 media.style.cssText="position:fixed;left:-20px;top:0;width:2px;height:2px;opacity:0;pointer-events:none";
 document.body.append(media);
 const url=URL.createObjectURL(file),canvas=document.createElement("canvas"),ctx=canvas.getContext("2d",{willReadFrequently:true});
 let videoEnc=null,audioEnc=null,trans=null,error=null;
 try{
  media.src=url;await pret(media);
  const settings=plan({duration:media.duration,width:media.videoWidth,height:media.videoHeight,bytes:file.size});
  const config={codec:"avc1.42E01F",width:settings.width,height:settings.height,
    framerate:settings.fps,bitrate:Math.min(2_500_000,Math.max(550_000,settings.width*settings.height*settings.fps*.28)),
    avc:{format:"avc"},latencyMode:"quality"};
  if(!(await VideoEncoder.isConfigSupported(config)).supported)throw new Error("H.264 non disponible pour ce pilote");
  onProgress({stage:"audio",progress:0});
  const audio=await audioDuFichier(file,allowSilent,globalThis.AudioContext||globalThis.webkitAudioContext);
  if(signal?.aborted)throw new Error("Export annulé");
  const target=new Mp4Muxer.ArrayBufferTarget();
  const muxer=new Mp4Muxer.Muxer({target,fastStart:"in-memory",video:{codec:"avc",width:settings.width,height:settings.height},
    ...(audio?{audio:{codec:"aac",sampleRate:audio.cfg.sampleRate,numberOfChannels:audio.cfg.numberOfChannels}}:{})});
  videoEnc=new VideoEncoder({output:(chunk,meta)=>{try{muxer.addVideoChunk(chunk,meta)}catch(e){error=e}},error:e=>{error=e}});
  videoEnc.configure(config);
  if(audio){
   audioEnc=new AudioEncoder({output:(chunk,meta)=>{try{muxer.addAudioChunk(chunk,meta)}catch(e){error=e}},error:e=>{error=e}});
   audioEnc.configure(audio.cfg);
  }
  canvas.width=settings.width;canvas.height=settings.height;
  trans=transformateur(moteur,arbitre);
  for(let i=0;i<settings.frames;i++){
   if(signal?.aborted)throw new Error("Export annulé");
   if(error)throw error;
   const t=Math.min(media.duration-.001,i/settings.fps);
   await seek(media,t,signal);
   ctx.drawImage(media,0,0,canvas.width,canvas.height);
   const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);
   const processed=await trans.traiter(pixels);
   ctx.putImageData(new ImageData(processed.data,processed.width,processed.height),0,0);
   const frame=new VideoFrame(canvas,{timestamp:Math.round(i*1e6/settings.fps),duration:Math.round(1e6/settings.fps)});
   try{videoEnc.encode(frame,{keyFrame:i===0||i%(settings.fps*2)===0})}finally{frame.close()}
   if(videoEnc.encodeQueueSize>5)await videoEnc.flush();
   if(error)throw error;
   onProgress({stage:"video",progress:(i+1)/settings.frames,frame:i+1,total:settings.frames});
  }
  await videoEnc.flush();
  if(error)throw error;
  if(audio){
   const ab=audio.buffer,channels=ab.numberOfChannels,B=4096,src=Array.from({length:channels},(_,ch)=>ab.getChannelData(ch));
   // Durée audio limitée à la durée vidéo encodée : pas de longue queue silencieuse.
   const maxFrames=Math.min(ab.length,Math.ceil(settings.frames/settings.fps*ab.sampleRate));
   for(let offset=0;offset<maxFrames;offset+=B){
    if(signal?.aborted)throw new Error("Export annulé");
    const n=Math.min(B,maxFrames-offset),pcm=new Float32Array(n*channels);
    for(let ch=0;ch<channels;ch++)pcm.set(src[ch].subarray(offset,offset+n),ch*n);
    const sample=new AudioData({format:"f32-planar",sampleRate:ab.sampleRate,
      numberOfFrames:n,numberOfChannels:channels,timestamp:Math.round(offset*1e6/ab.sampleRate),data:pcm});
    try{audioEnc.encode(sample)}finally{sample.close()}
    if(audioEnc.encodeQueueSize>15)await audioEnc.flush();
    if(error)throw error;
   }
   await audioEnc.flush();if(error)throw error;
  }
  muxer.finalize();
  const blob=new Blob([target.buffer],{type:"video/mp4"});
  if(blob.size<1024)throw new Error("Fichier de sortie incomplet");
  onProgress({stage:"fini",progress:1});
  return {blob,plan:settings,hasAudio:!!audio,report:"Export limité, images cherchées par temps : cadence et fidélité aux trames à vérifier"};
 }finally{
  try{trans?.fermer()}catch(_){}
  try{if(videoEnc&&videoEnc.state!=="closed")videoEnc.close()}catch(_){}
  try{if(audioEnc&&audioEnc.state!=="closed")audioEnc.close()}catch(_){}
  disposer(media);URL.revokeObjectURL(url);
 }
}
return Object.freeze({plan,exporter});
})();
if(typeof module!=="undefined"&&module.exports)module.exports=NOVA_EXPORT;
