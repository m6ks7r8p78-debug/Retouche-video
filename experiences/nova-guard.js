/* NOVA 0.6 — garde-fous mémoire et files WebCodecs.
 * Estimations conservatrices et NON mesure de la mémoire réelle de Safari.
 * Aucun déblocage HD/4K tant que les bancs physiques ne sont pas validés.
 */
var NOVA_GUARD=(()=>{
"use strict";
const MiB=1024*1024;
const entier=(n)=>Number.isSafeInteger(n)&&n>=0;
function estimerMemoire({sourceBytes,sourceWidth,sourceHeight,outputWidth,outputHeight,
  durationSeconds,withAudio=true,sampleRate=48000,channels=2,limitMiB=160}={}){
 if(!entier(sourceBytes)||!entier(sourceWidth)||!entier(sourceHeight)||
    !entier(outputWidth)||!entier(outputHeight)||
    ![sourceWidth,sourceHeight,outputWidth,outputHeight].every(n=>n>0)||
    !Number.isFinite(durationSeconds)||durationSeconds<=0||
    !Number.isFinite(limitMiB)||limitMiB<=0||
    !Number.isFinite(sampleRate)||sampleRate<=0||!entier(channels)||channels<1||channels>8)
   throw new TypeError("Estimation mémoire : paramètres invalides");
 // Le pic inclut une copie pour decodeAudioData, des surfaces WebCodecs,
 // les buffers RGBA de Mosaïque/Worker, du PCM et le muxer en mémoire.
 // Les nombres sont des coefficients prudents, pas une mesure matérielle.
 const detail={
  sourceEtCopie:sourceBytes*(withAudio?2:1),
  tramesDecodees:sourceWidth*sourceHeight*4*6,
  tramesEtTraitement:outputWidth*outputHeight*4*6,
  pcm:withAudio?durationSeconds*sampleRate*channels*4*3:0,
  muxage:4*MiB+Math.min(sourceBytes,12*MiB),
  reserve:24*MiB
 };
 const bytes=Math.ceil(Object.values(detail).reduce((a,b)=>a+b,0));
 return Object.freeze({bytes,mebibytes:+(bytes/MiB).toFixed(1),
  limitMiB,admissible:bytes<=limitMiB*MiB,detail:Object.freeze(detail),
  qualification:"estimation préventive, non télémétrie mémoire iPhone"});
}
function exigerBudget(config){
 const e=estimerMemoire(config);
 if(!e.admissible)throw new RangeError(
  "Risque mémoire élevé sur mobile ("+e.mebibytes+" Mio estimés pour "+e.limitMiB+
  " Mio de budget conservateur). Réduisez le fichier ou la durée ; export non lancé.");
 return e;
}
function auditerPTS({ptsUs,durationSeconds,fps}={}){
 if(!Array.isArray(ptsUs)||!ptsUs.length||!ptsUs.every(Number.isSafeInteger)||
   !Number.isFinite(durationSeconds)||durationSeconds<=0||
   !Number.isFinite(fps)||fps<=0)throw new TypeError("Audit PTS invalide");
 const ordered=ptsUs.filter(v=>v>=0).sort((a,b)=>a-b);
 if(!ordered.length)throw new Error("Aucun PTS présentable");
 for(let i=1;i<ordered.length;i++)if(ordered[i]<=ordered[i-1])
  throw new Error("PTS dupliqué ou non monotone");
 const leadingUs=ordered[0];
 const gapUs=ordered.slice(1).reduce((big,v,i)=>Math.max(big,v-ordered[i]),0);
 const tailUs=Math.round(durationSeconds*1e6)-ordered.at(-1);
 // Une première image trop tardive serait affichée artificiellement à t=0.
 const toleranceUs=Math.ceil(1e6/fps);
 return Object.freeze({leadingUs,maxGapUs:gapUs,tailUs,
  debutFidele:leadingUs<=toleranceUs,
  avertissementLongIntervalle:gapUs>500000,
  toleranceUs,sourceFrames:ordered.length});
}
function exigerDebutFidele(audit){
 if(!audit?.debutFidele)throw new Error(
  "PTS source : première image trop tardive ; ne pas inventer une image au début du film");
 return audit;
}
function attendreEncodeur(encoder,{maxQueue=4,timeoutMs=12000,signal}={}){
 if(!encoder||!Number.isInteger(maxQueue)||maxQueue<0||
    !Number.isInteger(timeoutMs)||timeoutMs<1)throw new TypeError("Encodeur ou seuil invalide");
 if(signal?.aborted)return Promise.reject(new Error("Export annulé"));
 if(encoder.state==="closed")return Promise.reject(new Error("Encodeur fermé"));
 if(encoder.encodeQueueSize<=maxQueue)return Promise.resolve();
 return new Promise((resolve,reject)=>{
  let settled=false,timer;
  const cleanup=()=>{
   clearTimeout(timer);
   encoder.removeEventListener("dequeue",drain);
   signal?.removeEventListener("abort",abort);
  };
  const finish=(e)=>{
   if(settled)return;
   settled=true;cleanup();e?reject(e):resolve();
  };
  const abort=()=>finish(new Error("Export annulé"));
  const drain=()=>{
   if(encoder.state==="closed")finish(new Error("Encodeur fermé pendant l'attente"));
   else if(encoder.encodeQueueSize<=maxQueue)finish();
  };
  encoder.addEventListener("dequeue",drain);
  signal?.addEventListener("abort",abort,{once:true});
  timer=setTimeout(()=>finish(new Error("Encodeur bloqué : file d'attente saturée")),timeoutMs);
  drain();
 });
}
return Object.freeze({estimerMemoire,exigerBudget,auditerPTS,exigerDebutFidele,attendreEncodeur});
})();
if(typeof module!=="undefined"&&module.exports)module.exports=NOVA_GUARD;
