/* NOVA — admission prudente du chemin H.264 EXISTANT.
 * Inspecte le MP4, la présence des API WebCodecs, les PTS et la copie AAC.
 * Ne décode pas de trames, n'exporte aucun fichier, ne téléverse rien.
 * Un accord ne prouve jamais qu'un export sera lisible ou fidèle.
 */
var NOVA_H264_PATH=(()=>{
"use strict";
const MiB=1048576;
const allowed=new Set([
 "ready-for-export-attempt","h264-unsafe-metadata","h264-pilot-limit",
 "h264-unsafe-color","h264-timeline-incompatible",
 "h264-decoder-unavailable","h264-encoder-unavailable",
 "resource-budget","audio-not-preservable","analysis-unavailable","cancelled"
]);
const result=(status,{proposal=null,estimatedMiB=null,audio="not-tested",sourceFps=null}={})=>
 Object.freeze({
  schema:"retoucheproai.nova.h264-path.v1",
  status:allowed.has(status)?status:"analysis-unavailable",
  readyForExportAttempt:status==="ready-for-export-attempt",
  engine:"webcodecs-h264-native-pts",
  audio:audio==="aac-copy-verified"?"aac-copy-verified":"not-tested",
  proposal:proposal&&["width","height","fps","frames"].every(k=>Number.isSafeInteger(proposal[k]))?
   Object.freeze({width:proposal.width,height:proposal.height,fps:proposal.fps,frames:proposal.frames}):null,
  estimatedMiB:Number.isFinite(estimatedMiB)&&estimatedMiB>=0&&estimatedMiB<=160?
   Math.round(estimatedMiB*10)/10:null,
  sourceFps:Number.isFinite(sourceFps)&&sourceFps>0&&sourceFps<1000?Math.round(sourceFps*10)/10:null,
  mediaUploaded:false,mediaModified:false
 });
const safe=n=>Number.isSafeInteger(n)&&n>0;
function colorSafe(info,checkColor){
 const fn=checkColor||globalThis.NOVA_AVC_VUI?.analyser;
 if(typeof fn!=="function")return false;
 try{return fn(info)?.verified===true}catch{return false}
}
async function inspect({file,info,signal,ptsPlan,plan,guard,audioPlan,
 avsyncAnalyze,avsyncVerify,checkDecoder,checkEncoder,sourceAudit,checkColor}={}){
 const stop=()=>signal?.aborted===true;
 if(stop())return result("cancelled");
 try{
  if(!file||!safe(file.size)||file.size>60*MiB||
     typeof file.slice!=="function"||
     !info||typeof info.codec!=="string"||!/^avc[13]\./.test(info.codec))
    return result("h264-unsafe-metadata");
  const w=info.W,h=info.H,n=info.ns,d=info.durationUs;
  if(!safe(w)||!safe(h)||!safe(n)||!safe(d)||
     !safe(info.dw)||!safe(info.dh))
    return result("h264-unsafe-metadata");
  if(w%2||h%2||w*h>1920*1080||n>5000||d>12000000)
    return result("h264-pilot-limit");
  if(info.pixelAspect?.h!==undefined&&
     (!safe(info.pixelAspect.h)||!safe(info.pixelAspect.v)||
      info.pixelAspect.h!==info.pixelAspect.v))
    return result("h264-unsafe-metadata");
  if(!colorSafe(info,checkColor))return result("h264-unsafe-color");
  const presentation=globalThis.NOVA_DEMUX?.exigerPresentationFidele;
  if(typeof presentation==="function"){
   try{presentation(info)}catch{return result("h264-unsafe-metadata")}
  }
  const timeFn=ptsPlan||globalThis.NOVA_PTS?.planifier;
  const planFn=plan||globalThis.NOVA_EXPORT?.plan;
  const guardFn=guard||globalThis.NOVA_GUARD?.exigerBudget;
  const checkTime=sourceAudit||globalThis.NOVA_GUARD?.auditerPTS;
  const checkStart=globalThis.NOVA_GUARD?.exigerDebutFidele;
  if(typeof timeFn!=="function"||typeof planFn!=="function"||
     typeof guardFn!=="function"||typeof checkTime!=="function")
    return result("analysis-unavailable");
  let timed,settings,budget;
  try{
   timed=timeFn(info);
   if(!Array.isArray(timed?.nonnegative)||!timed.nonnegative.length)
    return result("h264-timeline-incompatible");
   const durationSeconds=d/1e6;
   settings=planFn({duration:durationSeconds,width:info.dw,height:info.dh,bytes:file.size});
   if(!Number.isSafeInteger(settings.fps)||settings.fps!==15||
      !safe(settings.width)||!safe(settings.height)||!safe(settings.frames)||
      settings.frames>180)return result("h264-pilot-limit");
   const timeAudit=checkTime({
    ptsUs:timed.nonnegative.map(p=>p.ptsUs),durationSeconds,fps:settings.fps
   });
   if(typeof checkStart==="function")checkStart(timeAudit);
   else if(timeAudit?.debutFidele!==true)return result("h264-timeline-incompatible");
  }catch{return result("h264-timeline-incompatible")}
  if(stop())return result("cancelled");
  try{
   budget=guardFn({sourceBytes:file.size,sourceWidth:w,sourceHeight:h,
    outputWidth:settings.width,outputHeight:settings.height,
    durationSeconds:d/1e6,withAudio:true});
  }catch{return result("resource-budget")}
  if(budget?.admissible!==true)return result("resource-budget");
  if(stop())return result("cancelled");

  const decoder=checkDecoder||((cfg)=>globalThis.VideoDecoder?.isConfigSupported?.(cfg));
  const encoder=checkEncoder||((cfg)=>globalThis.VideoEncoder?.isConfigSupported?.(cfg));
  const decCfg={codec:info.codec,...(info.desc?{description:info.desc}:{}),
   codedWidth:w,codedHeight:h,hardwareAcceleration:"no-preference",
   optimizeForLatency:false};
  let supported;
  try{supported=await decoder(decCfg)}catch{}
  if(stop())return result("cancelled");
  if(supported?.supported!==true)return result("h264-decoder-unavailable");
  const encCfg={codec:"avc1.42E01F",width:settings.width,height:settings.height,
   framerate:settings.fps,
   bitrate:Math.min(2500000,Math.max(550000,
    settings.width*settings.height*settings.fps*.28)),
   avc:{format:"avc"},latencyMode:"quality"};
  try{supported=await encoder(encCfg)}catch{supported=null}
  if(stop())return result("cancelled");
  if(supported?.supported!==true)return result("h264-encoder-unavailable");

  const audioFn=audioPlan||globalThis.NOVA_AAC_COPY?.planifier;
  const avFn=avsyncAnalyze||globalThis.NOVA_AVSYNC?.analyser;
  const verifyFn=avsyncVerify||globalThis.NOVA_AVSYNC?.verifier;
  if(typeof audioFn!=="function"||typeof avFn!=="function"||
     typeof verifyFn!=="function")return result("analysis-unavailable");
  let audio,audit;
  try{
   audio=await audioFn(file,{durationSeconds:settings.frames/settings.fps,signal});
   if(stop())return result("cancelled");
   if(audio?.mode!=="aac-copy"||!Array.isArray(audio.packets)||audio.packets.length<1)
    return result("audio-not-preservable");
   audit=await avFn(file);
   if(stop())return result("cancelled");
   verifyFn(audit,{videoStartUs:timed.nonnegative[0].ptsUs,
    durationSeconds:settings.frames/settings.fps,allowLeadingGap:true});
  }catch{return result(stop()?"cancelled":"audio-not-preservable")}
  if(stop())return result("cancelled");
  return result("ready-for-export-attempt",{
   proposal:settings,estimatedMiB:budget.mebibytes,
   audio:"aac-copy-verified",sourceFps:n/(d/1e6)
  });
 }catch{return result(stop()?"cancelled":"analysis-unavailable")}
}
return Object.freeze({inspect});
})();
if(typeof module!=="undefined"&&module.exports)module.exports=NOVA_H264_PATH;
