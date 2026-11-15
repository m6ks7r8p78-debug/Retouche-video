/* NOVA 0.4 — contrat d'horodatage pour le pilote vidéo.
 * Découpage déterministe en trames CFR. Ne prétend pas retrouver les PTS natifs
 * du fichier importé : HTMLVideoElement fait une recherche temporelle approximative.
 */
var NOVA_TIMELINE=(()=>{
"use strict";
const finite=x=>typeof x==="number"&&Number.isFinite(x);
function calculer(duree,fps,maxFrames=200){
 if(!finite(duree)||duree<=0||!finite(fps)||fps<=0)throw new RangeError("Durée/cadence invalides");
 const count=Math.floor(duree*fps+1e-8);
 if(!Number.isSafeInteger(count)||count<1||count>maxFrames)throw new RangeError("Nombre d'images non autorisé");
 const endUs=Math.round(count*1e6/fps);
 const entries=Array.from({length:count},(_,i)=>{
  const timestamp=Math.round(i*1e6/fps);
  const next=Math.round((i+1)*1e6/fps);
  return {index:i,seekSeconds:i/fps,timestamp,duration:next-timestamp,keyFrame:i===0||i%(fps*2)===0};
 });
 return {count,entries,durationSeconds:count/fps,durationUs:endUs,mode:"CFR échantillonné; PTS source non disponibles"};
}
function validerPosition(actual,expected,sourceDuration,tolerance=.086){
 if(!finite(actual)||!finite(expected)||!finite(sourceDuration)||sourceDuration<=0)
  throw new TypeError("Positions temporelles invalides");
 const distance=Math.abs(actual-expected);
 return {distance,ok:distance<=tolerance,actual,expected,tolerance};
}
function verifierAudio(nbFrames,sampleRate,durationSeconds,toleranceSeconds=.12){
 if(!Number.isInteger(nbFrames)||nbFrames<1||!finite(sampleRate)||sampleRate<=0||
    !finite(durationSeconds)||durationSeconds<=0)
   throw new TypeError("Audio invalide");
 const availableSeconds=nbFrames/sampleRate;
 const missingSeconds=Math.max(0,durationSeconds-availableSeconds);
 return {ok:missingSeconds<=toleranceSeconds,availableSeconds,missingSeconds,
   targetFrames:Math.max(1,Math.ceil(durationSeconds*sampleRate)),toleranceSeconds};
}
return Object.freeze({calculer,validerPosition,verifierAudio});
})();
if(typeof module!=="undefined"&&module.exports)module.exports=NOVA_TIMELINE;
