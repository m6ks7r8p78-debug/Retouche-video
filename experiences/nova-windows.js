/* NOVA — fenêtre de travail H.264 sûre (pilotage expérimental).
 * Une source et une piste AAC CONTINUES. Chaque fenêtre borne uniquement
 * l'ordonnancement du décodeur/encodeur; il n'y a pas de découpe/remux AAC.
 * Pas de découpage de fichier, pas de réseau, pas de média stocké.
 */
var NOVA_WINDOWS=(()=>{
"use strict";
const fail=()=>{throw new Error("NOVA fenêtres : timeline CFR invalide")};
const safe=n=>Number.isSafeInteger(n)&&n>=0;
function creer(entries,{fps=15,windowFrames=90,maxFrames=360}={}){
 if(!Array.isArray(entries)||entries.length<1||entries.length>maxFrames||
    !safe(maxFrames)||maxFrames>360||maxFrames<1||
    fps!==15||!safe(windowFrames)||windowFrames<1||windowFrames>90)
  fail();
 let last=0;
 for(let i=0;i<entries.length;i++){
  const e=entries[i];
  if(!e||e.index!==i||!safe(e.timestamp)||!safe(e.duration)||
     e.duration<1||e.timestamp!==last||!Number.isFinite(e.seekSeconds)||
     e.seekSeconds<0||e.timestamp>24000000)fail();
  last=e.timestamp+e.duration;
  if(!safe(last)||last>24000000)fail();
 }
 const windows=[];
 for(let startIndex=0;startIndex<entries.length;startIndex+=windowFrames){
  const endIndex=Math.min(entries.length,startIndex+windowFrames);
  const first=entries[startIndex],lastEntry=entries[endIndex-1];
  windows.push(Object.freeze({
   index:windows.length+1,startIndex,endIndex,
   frameCount:endIndex-startIndex,startUs:first.timestamp,
   endUs:lastEntry.timestamp+lastEntry.duration,
   // A new intra frame is requested at each window's start, but the
   // muxer, timestamps, encoder and audio track remain single/continuous.
   keyframeIndex:startIndex
  }));
 }
 for(let i=1;i<windows.length;i++){
  if(windows[i].startUs!==windows[i-1].endUs||
     windows[i].startIndex!==windows[i-1].endIndex)fail();
 }
 return Object.freeze({mode:"single-mp4-windowed-video-continuous-aac",
  fps,frames:entries.length,durationUs:last,windowFrames,
  windows:Object.freeze(windows)});
}
return Object.freeze({creer});
})();
if(typeof module!=="undefined"&&module.exports)module.exports=NOVA_WINDOWS;
