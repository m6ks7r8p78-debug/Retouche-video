/* NOVA HD 0.41 — audit PASSIF de l'export réel.
 * Aucune image/voix conservée dans les rapports, aucun envoi réseau,
 * aucun score de fidélité visuelle inventé sans fichier original.
 * Version consolidée : codes RGB préservés, protection des hautes lumières.
 */
var NOVA_HD_QA=(()=>{
"use strict";
const safe=n=>Number.isSafeInteger(n)&&n>=0;
const finite=n=>Number.isFinite(n);
const round=(n,d=3)=>Math.round(n*10**d)/10**d;
function avant(rgba){
 if(!rgba||!safe(rgba.length)||rgba.length<4||rgba.length%4)
  throw Error("NOVA QA : pixels source invalides");
 const pixels=rgba.length/4,stride=Math.max(1,Math.ceil(pixels/2048));
 const luminances=[];
 for(let i=0;i<pixels;i+=stride){
  const k=i*4;
  luminances.push((.2126*rgba[k]+.7152*rgba[k+1]+.0722*rgba[k+2])/255);
 }
 return {stride,luminances}; // Temporaire pendant UNE trame, jamais exporté.
}
function apres(rgba,measure){
 if(!rgba||!Array.isArray(measure?.luminances)||!safe(measure.stride)||
    measure.stride<1||rgba.length%4)throw Error("NOVA QA : mesures incompatibles");
 let sum=0,signed=0,large=0,count=0;
 for(let i=0,j=0;i<rgba.length/4;i+=measure.stride,j++){
  const k=i*4;
  const lum=(.2126*rgba[k]+.7152*rgba[k+1]+.0722*rgba[k+2])/255;
  const before=measure.luminances[j];
  if(!finite(before))throw Error("NOVA QA : luminance hors norme");
  const d=lum-before;sum+=Math.abs(d);signed+=d;large+=Number(Math.abs(d)>.12);count++;
 }
 if(!count||count!==measure.luminances.length)throw Error("NOVA QA : taille de mesures incohérente");
 return {samples:count,meanAbsDelta:sum/count,meanSignedDelta:signed/count,
  largeSampleShare:large/count};
}
async function empreinte(blob){
 if(!blob||typeof blob.arrayBuffer!=="function"||!safe(blob.size))
  throw Error("NOVA QA : fichier à identifier invalide");
 if(!globalThis.crypto?.subtle?.digest)
  throw Error("NOVA QA : empreinte SHA-256 indisponible ; utiliser HTTPS");
 const digest=await globalThis.crypto.subtle.digest("SHA-256",await blob.arrayBuffer());
 return Object.freeze({algorithm:"SHA-256",bytes:blob.size,
  sha256:Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,"0")).join("")});
}
async function lier(bilan,source,output){
 // Séquentiel pour limiter les copies temporaires de vidéos sur iPhone.
 const input=await empreinte(source);
 const result=await empreinte(output);
 return Object.freeze({...bilan,files:{source:input,output:result},
  privacy:{...bilan.privacy,fileFingerprintsIncluded:true}});
}
function contexte(){
 return {mediaIncluded:false,sourcePixelsIncluded:false,filenameIncluded:false,
  audioPayloadIncluded:false,automaticUpload:false};
}
function bilan({source,output,outputAudio,sourceFps,modifiedFrames,
 colorMismatchFrames=0,luminosity,colorPipeline=null,audioProcessing=null,detailProcessing=null}={}){
 if(!source||!output||!outputAudio||!Array.isArray(outputAudio.packets)||
    !outputAudio.packets.length)throw Error("NOVA QA : audit audio/vidéo incomplet");
 const packets=outputAudio.packets;
 const last=packets.at(-1),first=packets[0];
 if(![first.timestamp,last.timestamp,last.duration].every(safe)||last.duration<1)
  throw Error("NOVA QA : horodatages AAC invalides");
 const hasStoredAudit=outputAudio.storedPacketCount!==undefined;
 const packetCount=hasStoredAudit?outputAudio.storedPacketCount:packets.length;
 const audioStart=hasStoredAudit?outputAudio.storedFirstPacketUs:first.timestamp;
 const audioEnd=hasStoredAudit?outputAudio.storedLastPacketEndUs:last.timestamp+last.duration;
 if(!safe(packetCount)||packetCount<packets.length||!safe(audioStart)||
    !safe(audioEnd)||audioEnd<audioStart)throw Error("NOVA QA : audit AAC stocké invalide");
 if(!safe(audioEnd)||!safe(output.durationUs)||!safe(source.durationUs)||
    !safe(output.ns)||!safe(source.ns)||!safe(modifiedFrames)||
    modifiedFrames>output.ns||!finite(sourceFps)||sourceFps<=0)
  throw Error("NOVA QA : métadonnées de sortie invalides");
 const endDifferenceMs=round((audioEnd-output.durationUs)/1000,1);
 const presentedSeconds=outputAudio.editDurationSeconds;
 const presentedEndMs=Number.isFinite(presentedSeconds)&&presentedSeconds>0&&
  Number.isFinite(outputAudio.leadingEmptySeconds)?
  round((presentedSeconds+outputAudio.leadingEmptySeconds)*1000,3):null;
 const sourceDifferenceMs=round((output.durationUs-source.durationUs)/1000,1);
 const warnings=[
  "Les mesures de correction sont prises avant encodage et ne mesurent pas les écarts du MP4 final par rapport à l’original.",
  "Fidélité des couleurs, netteté, stabilité et synchronisation perceptuelle non certifiées sans comparaison à l'original.",
  "189 interventions ne signifient pas 189 améliorations : seul un contrôle avant/après peut le prouver."
 ].map(x=>x.replaceAll("189",String(modifiedFrames)));
 if(Math.abs(endDifferenceMs)>40)
  warnings.push("Fin brute des paquets AAC (amorce et bourrage inclus) différente de la fin vidéo : "+
    (endDifferenceMs>0?"+":"")+endDifferenceMs+
    " ms. Ce n'est pas une mesure directe de synchronisation perceptuelle.");
 if(colorMismatchFrames>0)
  warnings.push(colorMismatchFrames+" trames utilisent le rendu SDR natif de Safari sans preuve d'identité colorimétrique à la source.");
 const sampled=luminosity?.samples>0&&safe(luminosity.frames)&&luminosity.frames>0;
 const meanAbs=sampled?round(luminosity.totalAbsDelta/luminosity.frames,4):null;
 const meanSigned=sampled?round(luminosity.totalSignedDelta/luminosity.frames,4):null;
 const strong=sampled?luminosity.strongFrames:null;
 if(sampled&&strong>0)
  warnings.push(strong+" image(s) ont une variation lumineuse moyenne échantillonnée supérieure à 8 % ; comparer à l'original.");
 return Object.freeze({
  schema:"retoucheproai.nova.hd-quality.v1",version:"0.41",
  proofLevel:"technical-output-audit-not-perceptual-certification",
  video:{
   sourceDimensions:[source.dw,source.dh],outputDimensions:[output.dw,output.dh],
   sourceFrames:source.ns,outputFrames:output.ns,
   sourceApproxFps:round(sourceFps,2),
   sourceDurationMs:round(source.durationUs/1000,1),
   outputDurationMs:round(output.durationUs/1000,1),
   outputMinusSourceDurationMs:sourceDifferenceMs,
   frameCountPreserved:output.ns===source.ns,
   dimensionsPreserved:output.dw===source.dw&&output.dh===source.dh,
   resolutionIncreased:output.dw*output.dh>source.dw*source.dh,
   perceptualDetailGainMeasured:false
  },
  audio:{
   codec:"AAC-LC",packets:packetCount,
   packetScope:hasStoredAudit?"all-stored-aac-packets":"provided-packets-only",
   selectedForCopyPackets:packets.length,
   excludedFromCopyPackets:packetCount-packets.length,
   sampleRate:outputAudio.sampleRate,
   channels:outputAudio.channels,
   firstPacketMs:round(audioStart/1000,1),
   lastPacketEndMs:round(audioEnd/1000,1),
   lastAudioPacketMinusVideoDurationMs:endDifferenceMs,
   packetTimesIncludePrimingAndPadding:true,
   presentedAudioEndMs:presentedEndMs,
   presentedAudioMinusVideoMs:presentedEndMs===null?null:round(presentedEndMs-output.durationUs/1000,3),
   synchronizationPerceptuallyCertified:false,
   processing:audioProcessing
  },
  color:{
   encodedOutputBt709:output.color?.kind==="nclx"&&
    output.color?.primaries===1&&output.color?.transfer===1&&
    output.color?.matrix===1&&output.color?.fullRange===false,
   nativeSafariUncertifiedFrames:colorMismatchFrames,
   nativeDecodedSourceMismatchFrames:colorMismatchFrames,
   visuallyIdenticalToSourceCertified:false,
   pipeline:colorPipeline
  },
  correction:{
   measurementStage:"decoded-canvas-before-output-encoding",
   includesDecoderAndEncoderColorChanges:false,
   processedFrames:output.ns,interventionFrames:modifiedFrames,
   sampledFrames:sampled?luminosity.frames:0,
   meanAbsoluteLuminanceChange:meanAbs,
   meanSignedLuminanceChange:meanSigned,
   stronglyChangedFrames:strong,
   isProofOfImprovement:false
  },
  detail:detailProcessing,
  warnings,privacy:contexte()
 });
}
return Object.freeze({avant,apres,bilan,empreinte,lier});
})();
if(typeof module!=="undefined"&&module.exports)module.exports=NOVA_HD_QA;
