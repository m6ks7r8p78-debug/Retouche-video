/* NOVA 0.22 — mesures du pipeline audiovisuel COMPLET, sans collecte externe.
 * L'encodeur/muxer in-memory peut allouer plus que les payloads mesurés.
 * Le budget ci-dessous borne leurs octets utiles AVANT le mux, pas le RSS.
 * Pas de timers ni API Web requis : même code testé dans Node.
 */
var NOVA_EXPORT_METER=(()=>{
"use strict";
const MiB=1048576,DEFAULT=24*MiB;
const stages=["preflight","audio","video","video-flush","aac-copy","mux","verify","complete"];
const fail=s=>{throw new Error("NOVA 0.22 budget export : "+s)};
function create({maxEncodedBytes=DEFAULT,clock,readJsHeap,
  frameProfile="standard"}={}){
 if(!["standard","h264-hd720-opfs-6s"].includes(frameProfile))
  fail("profil de copie image invalide");
 const maxFrameCopyBytes=frameProfile==="h264-hd720-opfs-6s"?
  1280*720*16:640*360*16;
 if(!Number.isSafeInteger(maxEncodedBytes)||maxEncodedBytes<1024||maxEncodedBytes>DEFAULT)
  fail("limite encodée invalide (1 Kio à 24 Mio)");
 const now=typeof clock==="function"?clock:
  ()=>typeof performance!=="undefined"&&typeof performance.now==="function"?
   performance.now():Date.now();
 const memory=typeof readJsHeap==="function"?readJsHeap:()=>{
  const n=typeof performance!=="undefined"?performance.memory?.usedJSHeapSize:null;
  return Number.isSafeInteger(n)&&n>=0?n:null;
 };
 const start=now();
 if(!Number.isFinite(start))fail("horloge invalide");
 let last=start,current=0,finished=false,frames=0;
 let total=0,videoBytes=0,audioBytes=0,peakVideoQueue=0;
 let jsStart=null,jsPeak=null,jsEnd=null,peakFrameCopyBytes=0;
 const times={},checkpoints=[];
 function observe(){
  const n=memory();
  if(n!==null&&Number.isSafeInteger(n)&&n>=0){
   if(jsStart===null)jsStart=n;
   jsPeak=Math.max(jsPeak??0,n);jsEnd=n;
  }
 }
 function stage(name){
  if(finished)fail("échantillonnage après clôture");
  const index=stages.indexOf(name);
  if(index<=0||index<current)fail("ordre des phases invalide : "+name);
  const stamp=now();
  if(!Number.isFinite(stamp)||stamp<last)fail("horloge non monotone");
  const elapsed=stamp-last,old=stages[current];
  times[old]=(times[old]||0)+elapsed;
  checkpoints.push({name:old,elapsedMs:elapsed});
  last=stamp;current=index;
  observe();
  if(name==="complete")finished=true;
 }
 function add(kind,bytes){
  if(finished)fail("octets après clôture");
  if(!["video","audio"].includes(kind)||!Number.isSafeInteger(bytes)||bytes<0)
   fail("taille vidéo/AAC invalide");
  if(total+bytes>maxEncodedBytes)
   fail("octets H.264/AAC dépassent le plafond mémoire de "+maxEncodedBytes+" octets");
  total+=bytes;
  if(kind==="video")videoBytes+=bytes;else audioBytes+=bytes;
  observe();
 }
 let finalMp4Bytes=null;
 function finalSize(bytes){
  if(finished||!Number.isSafeInteger(bytes)||bytes<1024)
   fail("taille du MP4 final invalide");
  if(bytes>maxEncodedBytes)
   fail("MP4 final dépasse le plafond mémoire de "+maxEncodedBytes+" octets");
  finalMp4Bytes=bytes;observe();
 }
 function frame({queue=0,bufferBytes=0}={}){
  if(finished||!Number.isSafeInteger(queue)||queue<0||queue>1000||
     !Number.isSafeInteger(bufferBytes)||bufferBytes<0||bufferBytes>maxFrameCopyBytes)
   fail("statistiques image/encodeur invalides");
  frames++;peakVideoQueue=Math.max(peakVideoQueue,queue);
  peakFrameCopyBytes=Math.max(peakFrameCopyBytes,bufferBytes);
  observe();
 }
 function snapshot(){
  observe();
  const stamp=now();
  if(!Number.isFinite(stamp)||stamp<last)fail("horloge non monotone");
  const durations={...times};
  if(!finished)durations[stages[current]]=(durations[stages[current]]||0)+(stamp-last);
  return Object.freeze({
   completed:finished,elapsedMs:stamp-start,
   stagesMs:Object.freeze(durations),checkpoints:checkpoints.map(x=>({...x})),
   maxEncodedBytes,encodedPayloadBytes:total,
   encodedVideoBytes:videoBytes,encodedAudioBytes:audioBytes,
   finalMp4Bytes,
   frames,peakVideoEncodeQueue:peakVideoQueue,peakFrameCopyBytes,
   jsHeapStartBytes:jsStart,jsHeapPeakBytes:jsPeak,jsHeapEndBytes:jsEnd,
   qualification:"payload bytes, JS heap (optional); excludes mux overhead, WASM heap and process RSS"
  });
 }
 observe();
 return Object.freeze({stage,add,frame,finalSize,snapshot});
}
return Object.freeze({create,DEFAULT_ENCODED_BYTES:DEFAULT});
})();
if(typeof module!=="undefined"&&module.exports)module.exports=NOVA_EXPORT_METER;
