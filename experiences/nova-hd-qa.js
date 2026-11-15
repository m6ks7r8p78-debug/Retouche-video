/* NOVA HD 0.35 — audit PASSIF de l'export réel.
 * Aucune image/voix conservée dans les rapports, aucun envoi réseau,
 * aucun score de fidélité visuelle inventé sans fichier original.
 * La sortie du moteur 0.34 demeure strictement inchangée.
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
function contexte(){
 return {mediaIncluded:false,sourcePixelsIncluded:false,filenameIncluded:false,
  audioPayloadIncluded:false,automaticUpload:false};
}
function bilan({source,output,outputAudio,sourceFps,modifiedFrames,
 colorMismatchFrames=0,luminosity}={}){
 if(!source||!output||!outputAudio||!Array.isArray(outputAudio.packets)||
    !outputAudio.packets.length)throw Error("NOVA QA : audit audio/vidéo incomplet");
 const packets=outputAudio.packets;
 const last=packets.at(-1),first=packets[0];
 if(![first.timestamp,last.timestamp,last.duration].every(safe)||last.duration<1)
  throw Error("NOVA QA : horodatages AAC invalides");
 const audioEnd=last.timestamp+last.duration;
 if(!safe(audioEnd)||!safe(output.durationUs)||!safe(source.durationUs)||
    !safe(output.ns)||!safe(source.ns)||!safe(modifiedFrames)||
    modifiedFrames>output.ns||!finite(sourceFps)||sourceFps<=0)
  throw Error("NOVA QA : métadonnées de sortie invalides");
 const endDifferenceMs=round((audioEnd-output.durationUs)/1000,1);
 const sourceDifferenceMs=round((output.durationUs-source.durationUs)/1000,1);
 const warnings=[
  "Fidélité des couleurs, netteté, stabilité et synchronisation perceptuelle non certifiées sans comparaison à l'original.",
  "189 interventions ne signifient pas 189 améliorations : seul un contrôle avant/après peut le prouver."
 ].map(x=>x.replace("189",String(modifiedFrames)));
 if(Math.abs(endDifferenceMs)>40)
  warnings.push("Fin des paquets AAC différente de la fin vidéo : "+
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
  schema:"retoucheproai.nova.hd-quality.v1",version:"0.35",
  proofLevel:"technical-output-audit-not-perceptual-certification",
  video:{
   sourceDimensions:[source.dw,source.dh],outputDimensions:[output.dw,output.dh],
   sourceFrames:source.ns,outputFrames:output.ns,
   sourceApproxFps:round(sourceFps,2),
   sourceDurationMs:round(source.durationUs/1000,1),
   outputDurationMs:round(output.durationUs/1000,1),
   outputMinusSourceDurationMs:sourceDifferenceMs,
   frameCountPreserved:output.ns===source.ns,
   dimensionsPreserved:output.dw===source.dw&&output.dh===source.dh
  },
  audio:{
   codec:"AAC-LC",packets:packets.length,sampleRate:outputAudio.sampleRate,
   channels:outputAudio.channels,
   firstPacketMs:round(first.timestamp/1000,1),
   lastPacketEndMs:round(audioEnd/1000,1),
   lastAudioPacketMinusVideoDurationMs:endDifferenceMs,
   synchronizationPerceptuallyCertified:false
  },
  color:{
   encodedOutputBt709:output.color?.kind==="nclx"&&
    output.color?.primaries===1&&output.color?.transfer===1&&
    output.color?.matrix===1&&output.color?.fullRange===false,
   nativeSafariUncertifiedFrames:colorMismatchFrames,
   visuallyIdenticalToSourceCertified:false
  },
  correction:{
   processedFrames:output.ns,interventionFrames:modifiedFrames,
   sampledFrames:sampled?luminosity.frames:0,
   meanAbsoluteLuminanceChange:meanAbs,
   meanSignedLuminanceChange:meanSigned,
   stronglyChangedFrames:strong,
   isProofOfImprovement:false
  },
  warnings,privacy:contexte()
 });
}
return Object.freeze({avant,apres,bilan});
})();
if(typeof module!=="undefined"&&module.exports)module.exports=NOVA_HD_QA;
