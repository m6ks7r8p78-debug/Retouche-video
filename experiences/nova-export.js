/* RetoucheProAI NOVA v0.3 — export MP4 court, experimental, sans upload.
 * Decode et seek vidéo sur HTMLVideoElement; traitement NOVA_MOSAIQUE; re-encodage
 * H.264 et AAC lorsque disponible. Refuse la perte du son sauf choix explicite.
 * Aucun accès aux poids IA; ce n'est PAS un export pleine cadence/fidélité certifiée.
 */
var NOVA_EXPORT=(()=>{
"use strict";
const MAX_SECONDS=12,MAX_LONG_SECONDS=24,MAX_OPFS_SECONDS=48,MAX_BYTES=60*1024*1024,MAX_SIDE=640,FPS=15;
const finite=x=>typeof x==="number"&&Number.isFinite(x);
function plan({duration,width,height,bytes,fps=FPS,maxSide=MAX_SIDE,profile}={}){
 const maxSeconds=profile==="h264-opfs-48s"?MAX_OPFS_SECONDS:
  profile==="h264-windowed-24s"?MAX_LONG_SECONDS:MAX_SECONDS;
 if(!finite(duration)||duration<=0||duration>maxSeconds)
  throw new RangeError("NOVA : durée limitée à "+maxSeconds+" secondes");
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<2||height<2)throw new RangeError("Dimensions source invalides");
 if(!finite(bytes)||bytes<1||bytes>MAX_BYTES)throw new RangeError("Fichier limité à 60 Mo pour ce pilote");
 if(!finite(fps)||fps<5||fps>FPS)throw new RangeError("Cadence pilote limitée à 15 images/s");
 if(!finite(maxSide)||maxSide<96||maxSide>MAX_SIDE)throw new RangeError("Sortie pilote limitée à 640 px");
 const factor=Math.min(1,maxSide/Math.max(width,height));
 const outW=Math.max(2,Math.round(width*factor/2)*2);
 const outH=Math.max(2,Math.round(height*factor/2)*2);
 return {width:outW,height:outH,fps,frames:Math.max(1,Math.floor(duration*fps+1e-8)),
   duration, maxSeconds, audio:"conserver ou refuser",pilot:true};
}
function disposer(media){
 if(!media)return;
 try{media.pause();media.removeAttribute("src");media.load();media.remove()}catch(_){}
}
function pret(media){
 return new Promise((resolve,reject)=>{
  let timer;
  function cleanup(){clearTimeout(timer);media.removeEventListener("loadeddata",ok);media.removeEventListener("error",bad)}
  function ok(){cleanup();resolve()}
  function bad(){cleanup();reject(new Error("La vidéo ne peut pas être décodée ici"))}
  media.addEventListener("loadeddata",ok,{once:true});
  media.addEventListener("error",bad,{once:true});
  timer=setTimeout(()=>{cleanup();reject(new Error("Première image vidéo indisponible"))},10000);
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
/* Certains encodeurs AAC iOS renvoient un descripteur esds complet.
 * Le muxer requiert l'AudioSpecificConfig ; reprise du garde-fou de app.js.
 */
function ascOnly(desc){
 const b=desc instanceof ArrayBuffer?new Uint8Array(desc):new Uint8Array(desc.buffer,desc.byteOffset||0,desc.byteLength);
 let p=0;if(b.length>4&&b[0]===0&&b[1]===0&&b[2]===0&&b[3]===0&&b[4]===3)p=4;
 if(b[p]!==3)return b.slice();
 const len=q=>{let l=0,x;do{x=b[q++];l=(l<<7)|(x&127)}while(x&128&&q<b.length);return [l,q]};
 try{
  let l;[l,p]=len(p+1);const fl=b[p+2];p+=3;
  if(fl&128)p+=2;if(fl&64)p+=1+b[p];if(fl&32)p+=2;
  if(b[p]!==4)return b.slice();[l,p]=len(p+1);p+=13;
  if(b[p]!==5)return b.slice();[l,p]=len(p+1);
  return p+l<=b.length&&l>=2?b.slice(p,p+l):b.slice();
 }catch(_){return b.slice()}
}
/* Probe final : un encodeur qui a produit des octets n'a pas prouvé
 * que le MP4 est lisible. Tester les métadonnées depuis un blob local.
 * Ne mesure PAS la qualité d'image ni l'existence effective de l'audio.
 */
async function verifierMp4(blob,settings,signal){
 const v=document.createElement("video"),url=URL.createObjectURL(blob);
 v.muted=true;v.playsInline=true;v.preload="metadata";
 try{
  if(signal?.aborted)throw new Error("Export annulé");
  const meta=await new Promise((resolve,reject)=>{
   let timer;
   const cleanup=()=>{clearTimeout(timer);v.removeEventListener("loadedmetadata",ok);v.removeEventListener("error",bad);signal?.removeEventListener("abort",abort)};
   const ok=()=>{cleanup();resolve({width:v.videoWidth,height:v.videoHeight,duration:v.duration})};
   const bad=()=>{cleanup();reject(new Error("MP4 créé mais non lisible sur cet appareil"))};
   const abort=()=>{cleanup();reject(new Error("Export annulé"))};
   v.addEventListener("loadedmetadata",ok,{once:true});v.addEventListener("error",bad,{once:true});
   signal?.addEventListener("abort",abort,{once:true});
   timer=setTimeout(()=>{cleanup();reject(new Error("Le MP4 ne fournit pas de métadonnées lisibles"))},10000);
   v.src=url;v.load();
  });
  const expected=settings.frames/settings.fps;
  if(meta.width!==settings.width||meta.height!==settings.height)
   throw new Error("Dimensions du fichier MP4 incohérentes");
  if(!finite(meta.duration)||Math.abs(meta.duration-expected)>.3)
   throw new Error("Durée du MP4 incohérente");
  return {...meta,verifie:"métadonnées vidéo locales; pas audit perceptuel/audio"};
 }finally{
  try{v.pause();v.removeAttribute("src");v.load()}catch(_){}
  URL.revokeObjectURL(url);
 }
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
async function exporter({file,moteur,arbitre,allowSilent=false,allowApproximate=false,onProgress=()=>{},signal,
  maxEncodedBytes,storageMode="memory"}={}){
 if(!file||typeof file.arrayBuffer!=="function"||!moteur?.restituer||!arbitre?.arbitrer)throw new TypeError("Fichier et moteurs NOVA requis");
 if(typeof VideoEncoder==="undefined"||typeof VideoFrame==="undefined"||typeof Mp4Muxer==="undefined")
   throw new Error("WebCodecs ou muxer MP4 indisponible sur cet appareil");
 if(signal?.aborted)throw new Error("Export annulé");
 // HEVC local est désormais disponible dans la branche expérimentale,
 // mais UNIQUEMENT pour les sources SDR BT.709 explicitement marquées.
 let probe=null,useHevcWasm=false;
 if(globalThis.NOVA_DEMUX&&typeof NOVA_DEMUX.analyser==="function"){
  probe=await NOVA_DEMUX.analyser(file);
  if(probe)NOVA_DEMUX.exigerPresentationFidele(probe);
  if(probe&&/^(hvc1|hev1)\./.test(probe.codec)){
   // Le moteur natif HEVC n'a pas encore de contrôle SPS/VUI + couleur
   // de sortie équivalent à notre décodeur expérimental. Utiliser le
   // même chemin WASM local sur les navigateurs pris en charge.
   useHevcWasm=true;
   if(!globalThis.NOVA_HEVC_RENDER)
    throw new Error("Décodeur local HEVC WASM absent : export refusé");
   NOVA_HEVC_RENDER.metadata(probe); // PTS/tailles/couleur avant export
  }
 }
 // Réutiliser le convertisseur sRGB -> I420 BT.709 uniquement si le
 // conteneur AVC déclare EXPLICITEMENT la plage limitée SDR BT.709.
 // Un nclc ambigu est accepté UNIQUEMENT si le SPS/VUI H.264 indique
 // explicitement BT.709 limité et ne contredit pas le conteneur.
 // Le mode temporel approximatif ne reçoit jamais ce niveau de preuve.
 let nativeH264Color709=false;
 if(!useHevcWasm&&!allowApproximate&&probe&&/^avc[13]\./.test(probe.codec||"")&&
    typeof globalThis.NOVA_AVC_VUI?.analyser==="function"){
  try{nativeH264Color709=NOVA_AVC_VUI.analyser(probe).verified===true}
  catch{nativeH264Color709=false}
 }
 const verifiedColorPath=useHevcWasm||nativeH264Color709;
 // L'unique chemin de durée étendue requiert AVANT tout décodage le contrôle
 // SPS/VUI H.264, un fichier local et des PTS natifs; HEVC reste à 12 s.
 // Les vidéos >24 s ne deviennent admissibles QUE si l'utilisateur a
 // choisi l'OPFS local; le MP4 en RAM et HEVC gardent leurs anciens plafonds.
 if(!["memory","opfs"].includes(storageMode))throw new Error("Mode de stockage MP4 inconnu");
 const useOpfs=storageMode==="opfs";
 const windowedH264=nativeH264Color709&&
   Number.isSafeInteger(probe?.durationUs)&&probe.durationUs>12000000&&
   probe.durationUs<=(useOpfs?48000000:24000000);
 const extendedOpfs=useOpfs&&windowedH264&&probe.durationUs>24000000;
 if(!useOpfs&&nativeH264Color709&&probe?.durationUs>24000000&&
    probe.durationUs<=48000000)
  throw new RangeError("Au-delà de 24 secondes, activer explicitement l'écriture progressive OPFS");
 if(useOpfs&&(!windowedH264||allowSilent||allowApproximate||
    !globalThis.NOVA_OPFS_STREAM?.supported()))
  throw new Error("Écriture OPFS réservée au H.264 SDR >12–48 s vérifié avec copie AAC");
 if(useOpfs&&!(await NOVA_OPFS_STREAM.probe({signal})))
  throw new Error("Écriture OPFS refusée : accès réel au stockage privé indisponible");
 // Garde-fou optionnel interne : l'interface ne peut pas relever la limite
 // de 24 Mio de payloads + MP4 final in-memory.
 const exportMeter=useHevcWasm||windowedH264?
  NOVA_EXPORT_METER.create({maxEncodedBytes}):null;
 const media=useHevcWasm?null:document.createElement("video");
 if(media){
  media.muted=true;media.playsInline=true;media.preload="auto";
  media.style.cssText="position:fixed;left:-20px;top:0;width:2px;height:2px;opacity:0;pointer-events:none";
  document.body.append(media);
 }
 const url=media?URL.createObjectURL(file):null;
 const canvas=document.createElement("canvas"),ctx=canvas.getContext("2d",{willReadFrequently:true});
 let videoEnc=null,audioEnc=null,trans=null,sourcePTS=null,error=null,sourceMode="pts";
 let opfsSink=null,outputCommitted=false;
 try{
  if(media){media.src=url;await pret(media)}
  const hevcMeta=useHevcWasm?NOVA_HEVC_RENDER.metadata(probe):null;
  const sourceDuration=hevcMeta?.durationSeconds??media.duration;
  const sourceWidth=hevcMeta?.width??media.videoWidth;
  const sourceHeight=hevcMeta?.height??media.videoHeight;
  const settings=plan({duration:sourceDuration,width:sourceWidth,height:sourceHeight,
    bytes:file.size,profile:extendedOpfs?"h264-opfs-48s":
    windowedH264?"h264-windowed-24s":undefined});
  if(!globalThis.NOVA_GUARD)throw new Error("Garde-fous mémoire NOVA indisponibles");
  const budget=NOVA_GUARD.exigerBudget({sourceBytes:file.size,
    sourceWidth,sourceHeight,
    outputWidth:settings.width,outputHeight:settings.height,
    durationSeconds:sourceDuration,withAudio:!allowSilent});
  onProgress({stage:"budget",estimatedMiB:budget.mebibytes,limitMiB:budget.limitMiB});
  if(!globalThis.NOVA_TIMELINE)throw new Error("Horodatage NOVA indisponible");
  const timeline=NOVA_TIMELINE.calculer(sourceDuration,settings.fps,
    extendedOpfs?720:windowedH264?360:200);
  if(timeline.count!==settings.frames)throw new Error("Incohérence du plan temporel");
  if(windowedH264&&!globalThis.NOVA_WINDOWS)
   throw new Error("Planificateur de fenêtres vidéo indisponible");
  const windowPlan=windowedH264?NOVA_WINDOWS.creer(timeline.entries,{
   profile:extendedOpfs?"h264-opfs-48s":"standard"
  }):null;
  exportMeter?.stage("audio");
  let sourceAudit=null;
  if(useHevcWasm){
    sourceMode="hevc-wasm";
    sourcePTS={info:{...hevcMeta,samples:probe.ns},fermer(){}};
    sourceAudit=NOVA_GUARD.exigerDebutFidele(NOVA_GUARD.auditerPTS({
      ptsUs:hevcMeta.ptsUs,durationSeconds:sourceDuration,fps:settings.fps
    }));
    onProgress({stage:"source",mode:"hevc-wasm",codec:probe.codec,frames:probe.ns});
  }else if(!allowApproximate){
    if(!globalThis.NOVA_PTS)throw new Error("Décodeur MP4 PTS indisponible");
    try{
      sourcePTS=await NOVA_PTS.creer(file,{signal});
      if(sourcePTS.info.width!==media.videoWidth||sourcePTS.info.height!==media.videoHeight)
        throw new Error("Orientation source incohérente entre piste MP4 et lecteur natif");
      sourceAudit=NOVA_GUARD.exigerDebutFidele(NOVA_GUARD.auditerPTS({
        ptsUs:sourcePTS.info.ptsUs,durationSeconds:sourceDuration,fps:settings.fps
      }));
      disposer(media);if(url)URL.revokeObjectURL(url);
      onProgress({stage:"source",mode:"pts",codec:sourcePTS.info.codec,frames:sourcePTS.info.samples});
    }catch(e){
      throw new Error("Décodage PTS natifs impossible : "+(e.message||"erreur source")+
        ". Aucun repli silencieux. Le mode compatibilité approximatif peut être sélectionné séparément.");
    }
  }else{
    sourceMode="approximate";
    onProgress({stage:"source",mode:"approximate"});
  }
  const config={codec:"avc1.42E01F",width:settings.width,height:settings.height,
    framerate:settings.fps,bitrate:Math.min(2_500_000,Math.max(550_000,settings.width*settings.height*settings.fps*.28)),
    avc:{format:"avc"},latencyMode:"quality"};
  if(!(await VideoEncoder.isConfigSupported(config)).supported)throw new Error("H.264 non disponible pour ce pilote");
  onProgress({stage:"audio",progress:0});
  // decodeAudioData fournit du PCM mais n'expose pas les edits/offsets
  // des pistes MP4. Auditer ces temps avant le réencodage.
  let audioSourceAudit=null,audioSourceRaw=null;
  if(!allowSilent){
    if(!globalThis.NOVA_AVSYNC)
      throw new Error("Contrôle de synchronisation audio source indisponible");
    audioSourceRaw=await NOVA_AVSYNC.analyser(file);
  }
  if(signal?.aborted)throw new Error("Export annulé");
  // Priorité à la copie exacte de paquets AAC pour les MP4 sans montage
  // audio complexe. Cette solution fonctionne même sur Chromium/Linux sans
  // AudioEncoder, et réduit aussi la pression RAM sur iPhone.
  let audioCopy=null,copyError=null;
  if(!allowSilent&&globalThis.NOVA_AAC_COPY){
    try{audioCopy=await NOVA_AAC_COPY.planifier(file,{
      durationSeconds:timeline.durationSeconds,signal
    })}catch(e){copyError=e.message||String(e)}
  }
  if(!allowSilent){
    audioSourceAudit=NOVA_AVSYNC.verifier(audioSourceRaw,{
      videoStartUs:sourcePTS?.info.firstPTSUs??0,
      durationSeconds:timeline.durationSeconds,
      allowLeadingGap:!!audioCopy
    });
  }
  // Une durée étendue exige le bitstream AAC complet, vérifiable et
  // recopié UNE FOIS. Pas de PCM ou de remplissage inventé aux frontières.
  if(windowedH264&&!allowSilent&&!audioCopy)
   throw new Error("NOVA fenêtres : copie AAC intégrale non démontrée, export refusé");
  let audio=null;
  if(!allowSilent&&!audioCopy){
    try{audio=await audioDuFichier(file,false,globalThis.AudioContext||globalThis.webkitAudioContext)}
    catch(e){throw new Error(e.message+(copyError?" ; alternative copie AAC non applicable : "+copyError:""))}
  }
  const audioMode=audioCopy?"aac-copy":audio?"aac-encode":"silent";
  onProgress({stage:"audioMode",mode:audioMode});
  let audioCheck=null;
  const audioPaquets=[];
  if(audio){
    audioCheck=NOVA_TIMELINE.verifierAudio(audio.buffer.length,audio.buffer.sampleRate,timeline.durationSeconds);
    if(!audioCheck.ok)throw new Error("Piste audio trop courte pour la durée vidéo : export interrompu");
  }
  if(signal?.aborted)throw new Error("Export annulé");
  exportMeter?.stage("video");
  if(useOpfs){
   if(!audioCopy)throw new Error("Écriture OPFS refusée : copie AAC intégrale impossible");
   opfsSink=await NOVA_OPFS_STREAM.create({signal});
   onProgress({stage:"storage",mode:"opfs-local-stream"});
  }
  const target=opfsSink?.target??new Mp4Muxer.ArrayBufferTarget();
  const audioConfig=audioCopy?{sampleRate:audioCopy.sampleRate,numberOfChannels:audioCopy.channels}:audio?.cfg;
  const muxer=new Mp4Muxer.Muxer({target,fastStart:useOpfs?false:"in-memory",
   video:{codec:"avc",width:settings.width,height:settings.height,
    ...(verifiedColorPath?{colorMetadata:"bt709-limited"}:{})},
    ...(audioConfig?{audio:{codec:"aac",sampleRate:audioConfig.sampleRate,numberOfChannels:audioConfig.numberOfChannels,
      // Edit list AAC originale validée; le profil 48 s exige OPFS.
      // Sans edit list, aucune exception au muxer n'est demandée.
      ...(extendedOpfs&&audioCopy?.editDurationSeconds!=null?
        {windowed48Seconds:"opfs"}:
        windowedH264&&audioCopy?.editDurationSeconds!=null?
        {windowed24Seconds:useOpfs?"opfs":true}:{}),
      ...(audioCopy?.rollDistance!=null?{rollDistance:audioCopy.rollDistance}:{}),
      ...(audioCopy?.editDurationSeconds!=null?{
        editMediaTime:audioCopy.editMediaTime,
        editDurationSeconds:audioCopy.outputEditSeconds,
        editGapSeconds:audioCopy.outputEditGapSeconds,
        editListVersion:audioCopy.editListVersion
      }:{})}}:{})});
  videoEnc=new VideoEncoder({output:(chunk,meta)=>{
   try{
    exportMeter?.add("video",chunk.byteLength);
    muxer.addVideoChunk(chunk,meta);
   }catch(e){error=e}
  },error:e=>{error=e}});
  videoEnc.configure(config);
  if(audio){
   audioEnc=new AudioEncoder({output:(chunk,meta)=>{
    try{
     exportMeter?.add("audio",chunk.byteLength);
     audioPaquets.push({timestamp:chunk.timestamp,duration:chunk.duration});
     if(meta?.decoderConfig?.description)
      meta={...meta,decoderConfig:{...meta.decoderConfig,
       description:ascOnly(meta.decoderConfig.description)}};
     muxer.addAudioChunk(chunk,meta);
    }catch(e){error=e}
   },error:e=>{error=e}});
   audioEnc.configure(audio.cfg);
  }
  canvas.width=settings.width;canvas.height=settings.height;
  trans=transformateur(moteur,arbitre);
  const trace={repetitions:0,sautsDeSource:0,premierPTSUs:null,dernierPTSUs:null};
  let hevcDiagnostics=null;
  let lastRank=null;
  function noter(source){
   if(lastRank!==null){
    if(source.rank===lastRank)trace.repetitions++;
    if(source.rank>lastRank+1)trace.sautsDeSource+=source.rank-lastRank-1;
   }
   lastRank=source.rank;
   if(trace.premierPTSUs===null)trace.premierPTSUs=source.selectedPTSUs;
   trace.dernierPTSUs=source.selectedPTSUs;
  }
  async function encoderImage(entry,forceKeyFrame=false){
   if(signal?.aborted)throw new Error("Export annulé");
   if(error)throw error;
   const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);
   const processed=await trans.traiter(pixels);
   ctx.putImageData(new ImageData(processed.data,processed.width,processed.height),0,0);
   // Le Canvas sRGB ne doit pas être déclaré BT.709 par simple boîte colr.
   // Convertir réellement les pixels en YCbCr I420 BT.709 plage limitée.
   const frame=verifiedColorPath?
     NOVA_COLOR709.videoFrame(processed.data,processed.width,processed.height,
      entry.timestamp,entry.duration):
     new VideoFrame(canvas,{timestamp:entry.timestamp,duration:entry.duration});
   try{videoEnc.encode(frame,{keyFrame:entry.keyFrame||forceKeyFrame})}
   finally{frame.close()}
   exportMeter?.frame({queue:videoEnc.encodeQueueSize,
    bufferBytes:processed.data.byteLength+settings.width*settings.height*3/2});
   if(videoEnc.encodeQueueSize>5)await NOVA_GUARD.attendreEncodeur(videoEnc,{maxQueue:3,signal});
   if(error)throw error;
   if(opfsSink&&(entry.index+1)%30===0){
    await videoEnc.flush();
    if(error)throw error;
    await opfsSink.drain();
   }
   onProgress({stage:"video",progress:(entry.index+1)/settings.frames,
     frame:entry.index+1,total:settings.frames});
  }
  if(useHevcWasm){
   const result=await NOVA_HEVC_RENDER.rendre(file,probe,{
    timeline,canvas,signal,onOutput:async(entry,selected)=>{
     noter(selected);await encoderImage(entry);
    }
   });
   if(result.frames!==settings.frames)throw new Error("Sortie HEVC WASM incomplète");
   hevcDiagnostics=Object.freeze({...result.metrics,
    outputFrames:result.frames,
    qualification:"WASM heap capacity, not browser or iPhone total RAM"});
  }else{
   // Fenêtres consécutives, mais UN seul VideoDecoder, encodeur, muxer,
   // horodatage global et piste AAC. Aucune concaténation de fichiers.
   const windows=windowPlan?.windows??[{index:1,startIndex:0,
    endIndex:timeline.entries.length,startUs:0,endUs:timeline.durationUs}];
   for(const window of windows){
    if(windowPlan)onProgress({stage:"window",index:window.index,
     total:windows.length,startMs:Math.round(window.startUs/1000),
     endMs:Math.round(window.endUs/1000)});
    for(let i=window.startIndex;i<window.endIndex;i++){
     const entry=timeline.entries[i];
     if(signal?.aborted)throw new Error("Export annulé");
     if(error)throw error;
     const t=Math.min(sourceDuration-.001,entry.seekSeconds);
     if(sourcePTS){
      noter(await sourcePTS.imageA(t,canvas));
     }else{
      await seek(media,t,signal);
      const position=NOVA_TIMELINE.validerPosition(media.currentTime,t,sourceDuration);
      if(!position.ok)throw new Error("Recherche vidéo imprécise : export refusé ("+
       position.distance.toFixed(3)+" s)");
      ctx.drawImage(media,0,0,canvas.width,canvas.height);
     }
     await encoderImage(entry,!!windowPlan&&i===window.startIndex);
    }
    // Vide la file encodeur entre fenêtres, sans remettre les PTS à zéro.
    if(windowPlan){
     await videoEnc.flush();
     if(error)throw error;
     await opfsSink?.drain();
    }
   }
  }
  exportMeter?.stage("video-flush");
  await videoEnc.flush();
  if(error)throw error;
  await opfsSink?.drain();
  exportMeter?.stage("aac-copy");
  if(audio){
   const ab=audio.buffer,channels=ab.numberOfChannels,B=4096,src=Array.from({length:channels},(_,ch)=>ab.getChannelData(ch));
   // Durée audio limitée à la durée vidéo encodée : pas de longue queue silencieuse.
   const maxFrames=Math.min(ab.length,audioCheck.targetFrames);
   for(let offset=0;offset<maxFrames;offset+=B){
    if(signal?.aborted)throw new Error("Export annulé");
    const n=Math.min(B,maxFrames-offset),pcm=new Float32Array(n*channels);
    for(let ch=0;ch<channels;ch++)pcm.set(src[ch].subarray(offset,offset+n),ch*n);
    const sample=new AudioData({format:"f32-planar",sampleRate:ab.sampleRate,
      numberOfFrames:n,numberOfChannels:channels,timestamp:Math.round(offset*1e6/ab.sampleRate),data:pcm});
    try{audioEnc.encode(sample)}finally{sample.close()}
    if(audioEnc.encodeQueueSize>15)await NOVA_GUARD.attendreEncodeur(audioEnc,{maxQueue:8,signal});
    if(error)throw error;
   }
   await audioEnc.flush();if(error)throw error;
  }
  if(audioCopy){
   let packetCount=0;
   await NOVA_AAC_COPY.copier(file,audioCopy,muxer,{signal,
     beforePacket:packet=>exportMeter?.add("audio",packet.size),
     onPacket:async packet=>{
      audioPaquets.push(packet);
      if(opfsSink&&++packetCount%64===0)await opfsSink.drain();
     }});
  }
  const audioAudit=audioConfig?NOVA_GUARD.auditerPaquetsAAC(audioPaquets,{
    durationSeconds:timeline.durationSeconds,
    leadingGapSeconds:audioCopy?.outputEditGapSeconds??0}):null;
  exportMeter?.stage("mux");
  if(error)throw error;
  muxer.finalize();
  const streamed=opfsSink?await opfsSink.finish():null;
  const blob=streamed?.file??new Blob([target.buffer],{type:"video/mp4"});
  if(blob.size<1024)throw new Error("Fichier de sortie incomplet");
  exportMeter?.finalSize(blob.size);
  exportMeter?.stage("verify");
  onProgress({stage:"verification",progress:1});
  const validation=await verifierMp4(blob,settings,signal);
  // Le MP4 de sortie doit porter réellement la boîte colr nclx
  // BT.709 limité si la source HEVC ou H.264 est suffisamment caractérisée.
  // Aucun succès n'est déclaré si le muxer ne conserve pas le champ nclx.
  // La boîte nclx NE prouve pas à elle seule la fidélité perceptuelle.
  let colorAudit=null;
  if(verifiedColorPath){
    if(signal?.aborted)throw new Error("Export annulé");
    const output=await NOVA_DEMUX.analyser(blob);
    const color=output?.color;
    if(!color||color.kind!=="nclx"||color.primaries!==1||
       color.transfer!==1||color.matrix!==1||color.fullRange!==false)
      throw new Error("MP4 final : colr BT.709 SDR limité non vérifiable");
    colorAudit=Object.freeze({...color,qualification:
      "boîte nclx vérifiée, cohérence du SPS H.264 à contrôler séparément"});
  }
  exportMeter?.stage("complete");
  const pipelineAudit=exportMeter?.snapshot()??null;
  if(hevcDiagnostics)hevcDiagnostics=Object.freeze({...hevcDiagnostics,pipelineAudit});
  onProgress({stage:"fini",progress:1});
  outputCommitted=true;
  return {blob,storageMode:streamed?"opfs-local-stream":"memory",
   storageMetrics:streamed?.metrics??null,release:opfsSink?.release??null,
   plan:settings,windowPlan:windowPlan?{
    mode:windowPlan.mode,count:windowPlan.windows.length,
    windowFrames:windowPlan.windowFrames,frames:windowPlan.frames,
    durationUs:windowPlan.durationUs}:null,
   validation,colorAudit,hevcDiagnostics,pipelineAudit,hasAudio:!!audioConfig,audioMode,sourceMode,sourceInfo:sourcePTS?.info??null,sourceAudit,audioSourceAudit,audioAudit,budget,trace:sourcePTS?trace:null,timeline:{
    frames:timeline.count,durationUs:timeline.durationUs,audioAvailableSeconds:audioCheck?.availableSeconds??null,
    audit:sourceMode==="hevc-wasm"?"HEVC MIT WASM local, PTS MOV et sortie CFR":sourceMode==="pts"?"PTS MP4 et décodage séquentiel VideoDecoder (fichiers compatibles), sortie CFR":"Compatibilité : images HTMLVideoElement cherchées par temps, PTS natifs non disponibles"
  },report:sourceMode==="hevc-wasm"?"HEVC SDR BT.709 traité localement, sortie audiovisuelle à contrôler sur iPhone":sourceMode==="pts"?"Sortie pilote à PTS source natifs, audio et rendu perceptuel à vérifier sur iPhone réel":"Sortie en mode approximatif demandé, risque de trames manquées à vérifier"};
 }finally{
  if(opfsSink&&!outputCommitted)await opfsSink.release();
  try{trans?.fermer()}catch(_){}
  try{sourcePTS?.fermer()}catch(_){}
  try{if(videoEnc&&videoEnc.state!=="closed")videoEnc.close()}catch(_){}
  try{if(audioEnc&&audioEnc.state!=="closed")audioEnc.close()}catch(_){}
  disposer(media);URL.revokeObjectURL(url);
 }
}
return Object.freeze({plan,exporter});
})();
if(typeof module!=="undefined"&&module.exports)module.exports=NOVA_EXPORT;
