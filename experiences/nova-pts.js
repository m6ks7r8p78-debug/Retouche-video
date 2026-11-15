/* RetoucheProAI NOVA 0.5 — lecteur séquentiel fondé sur les PTS MP4 natifs.
 * B-frame/VFR : décode les échantillons dans l'ordre du fichier (DTS),
 * reçoit les VideoFrame horodatées (PTS), puis choisit la dernière image
 * présentée à l'instant demandé, sans HTMLVideoElement.seek().
 * IMPORTANT : cette API n'est pas un décodeur universel : fichiers MP4
 * non pris en charge / edit lists complexes -> refus explicite.
 */
var NOVA_PTS=(()=>{
"use strict";
function planifier(info){
 if(!info||!Number.isInteger(info.ns)||info.ns<1||
    !Array.isArray(info.ptsUs)||info.ptsUs.length!==info.ns||
    !Array.isArray(info.key)||info.key.length!==info.ns||
    !Array.isArray(info.so)||info.so.length!==info.ns||
    !Array.isArray(info.sz)||info.sz.length!==info.ns||
    !Number.isInteger(info.W)||info.W<=0||!Number.isInteger(info.H)||info.H<=0||
    !Number.isInteger(info.dw)||info.dw<=0||!Number.isInteger(info.dh)||info.dh<=0)
  throw new TypeError("Table vidéo MP4 invalide");
 if(!info.key[0])throw new Error("Première image clé absente");
 if(info.W*info.H>1920*1080)throw new Error("Décodage PTS pilote limité aux sources Full HD");
 const sorted=Array.from({length:info.ns},(_,index)=>({index,ptsUs:info.ptsUs[index]}))
   .sort((a,b)=>a.ptsUs-b.ptsUs||a.index-b.index);
 const nonnegative=sorted.filter(x=>x.ptsUs>=0);
 if(!nonnegative.length)throw new Error("Aucune image vidéo présentable");
 for(let i=0;i<sorted.length;i++){
  if(!Number.isSafeInteger(sorted[i].ptsUs))throw new Error("PTS source invalide");
  if(i&&sorted[i].ptsUs===sorted[i-1].ptsUs)throw new Error("PTS source dupliqué");
 }
 if(sorted[0].ptsUs< -250000)throw new Error("Preroll négatif trop important");
 const rankByPTS=new Map(sorted.map((e,i)=>[e.ptsUs,i]));
 return Object.freeze({sorted,nonnegative,rankByPTS,
   premierPTS:nonnegative[0].ptsUs,dernierPTS:nonnegative.at(-1).ptsUs,mode:"MP4 PTS avec VideoDecoder"});
}
function choisir(sorted,seconds){
 if(!Array.isArray(sorted)||!sorted.length||!Number.isFinite(seconds)||seconds<0)
  throw new TypeError("Recherche temporelle invalide");
 const goal=Math.round(seconds*1e6);
 let lo=0,hi=sorted.length-1;
 if(goal<=sorted[0].ptsUs)return sorted[0];
 while(lo<hi){
  const m=Math.ceil((lo+hi)/2);
  if(sorted[m].ptsUs<=goal)lo=m;else hi=m-1;
 }
 return sorted[lo];
}
/* Echantillonnage CFR : accepte une vraie trame légèrement future seulement
 * si elle est plus proche du temps de sortie et située dans une demi-période.
 * Ne fabrique ni interpolation, ni image absente.
 */
function choisirProche(sorted,seconds,fps=15){
 if(!Number.isFinite(fps)||fps<=0)throw new TypeError("Cadence cible invalide");
 const previous=choisir(sorted,seconds);
 const goal=Math.round(seconds*1e6),maxLeadUs=Math.floor(500000/fps);
 const idx=sorted.indexOf(previous),next=sorted[idx+1];
 if(next&&next.ptsUs>goal&&next.ptsUs-goal<=maxLeadUs &&
    next.ptsUs-goal<Math.abs(goal-previous.ptsUs))return next;
 return previous;
}
async function creer(file,{signal}={}){
 if(!file||typeof file.slice!=="function"||!Number.isFinite(file.size))
  throw new TypeError("Fichier local MP4 requis");
 if(typeof VideoDecoder==="undefined"||typeof EncodedVideoChunk==="undefined")
  throw new Error("VideoDecoder indisponible sur ce navigateur");
 if(!globalThis.NOVA_DEMUX||typeof NOVA_DEMUX.analyser!=="function")
  throw new Error("Démultiplexeur NOVA indisponible");
 const info=await NOVA_DEMUX.analyser(file);
 if(!info)throw new Error("MP4 non pris en charge par le lecteur à PTS (tables ou edit list)");
 if(signal?.aborted)throw new Error("Export annulé");
 const timeline=planifier(info);
 const cfg={codec:info.codec,...(info.desc?{description:info.desc}:{}),
   codedWidth:info.W,codedHeight:info.H,hardwareAcceleration:"no-preference",optimizeForLatency:false};
 const supported=await VideoDecoder.isConfigSupported(cfg);
 if(!supported.supported)throw new Error("Codec vidéo source non pris en charge par VideoDecoder");
 const frames=new Map();
 const state={closed:false,fed:0,target:-1,decoded:0,dropped:0,fail:null,done:false,flush:false,can:null,lastIndex:-1,seeked:0};
 let wake=null,waiter=null;
 const notify=()=>{if(wake){const done=wake;wake=null;done()}};
 const decoder=new VideoDecoder({
  output:frame=>{
   if(state.closed){frame.close();return}
   const rank=timeline.rankByPTS.get(frame.timestamp);
   if(rank==null){frame.close();state.fail=new Error("PTS du décodeur inconnu");notify();return}
   state.decoded++;
   if(rank<state.target){frame.close();state.dropped++;notify();return}
   const old=frames.get(rank);if(old)old.close();
   frames.set(rank,frame);
   if(frames.size>10){state.fail=new Error("Mémoire du décodeur saturée");notify();return}
   notify();
  },
  error:e=>{state.fail=e;notify()}
 });
 try{decoder.configure(cfg)}
 catch(e){try{decoder.close()}catch(_){}throw e}
 async function wait(ms=60){
  if(state.closed)throw new Error("Décodeur fermé");
  if(signal?.aborted)throw new Error("Export annulé");
  await new Promise(resolve=>{
   let done=false;
   const finish=()=>{if(done)return;done=true;clearTimeout(timer);if(wake===finish)wake=null;resolve()};
   const timer=setTimeout(finish,ms);
   wake=finish;
  });
 }
 async function feed(index){
  if(signal?.aborted)throw new Error("Export annulé");
  const length=info.sz[index],start=info.so[index];
  const data=new Uint8Array(await file.slice(start,start+length).arrayBuffer());
  if(data.length!==length)throw new Error("Échantillon source tronqué");
  decoder.decode(new EncodedVideoChunk({type:info.key[index]?"key":"delta",
    timestamp:info.ptsUs[index],data}));
  state.fed=index+1;
 }
 function eliminate(target){
  for(const [rank,frame] of frames)if(rank<target){frame.close();frames.delete(rank);state.dropped++}
 }
 async function imageA(seconds,target){
  if(state.closed||decoder.state!=="configured")throw new Error("Décodeur inactif");
  if(signal?.aborted)throw new Error("Export annulé");
  const selected=choisirProche(timeline.nonnegative,seconds);
  const rank=timeline.rankByPTS.get(selected.ptsUs);
  if(rank<state.target)throw new Error("Lecture non monotone interdite");
  state.target=rank;eliminate(rank);
  const started=Date.now();
  while(!frames.has(rank)){
   if(state.fail)throw state.fail;
   if(signal?.aborted)throw new Error("Export annulé");
   if(Date.now()-started>15000)throw new Error("Décodage source PTS trop lent");
   if(state.fed<info.ns){
    // Limite d'anticipation : moins de RAM et aucun saut vers de futures scènes.
    const need=selected.index+8;
    if(state.fed<Math.min(info.ns,need) && decoder.decodeQueueSize<4){
      await feed(state.fed);
      continue;
    }
    // Quelques échantillons supplémentaires seulement en cas de réordonnancement profond.
    if(Date.now()-started>1000 && decoder.decodeQueueSize<2){
      await feed(state.fed);continue;
    }
    await wait(35);continue;
   }
   if(!state.flush){
    state.flush=true;
    await decoder.flush();
    state.done=true;
    continue;
   }
   if(!frames.has(rank))throw new Error("Image PTS absente après décodage complet");
  }
  const fr=frames.get(rank);
  // Rendu de la source, avec matrice de rotation issue du MP4 (comme SeqReader).
  const w=target.width,h=target.height;
  if(!w||!h)throw new Error("Surface de sortie invalide");
  const x=target.getContext("2d",{willReadFrequently:true});
  x.setTransform(1,0,0,1,0,0);x.clearRect(0,0,w,h);
  const sx=w/info.dw,sy=h/info.dh,m=info.mat;
  x.setTransform(m[0]*sx,m[1]*sy,m[2]*sx,m[3]*sy,m[4]*sx,m[5]*sy);
  x.drawImage(fr,0,0,info.W,info.H);
  x.setTransform(1,0,0,1,0,0);
  return {selectedPTSUs:selected.ptsUs,sourceIndex:selected.index,rank,
    actualSeconds:selected.ptsUs/1e6,rotationApplied:true,mode:"pts"};
 }
 function fermer(){
  if(state.closed)return;
  state.closed=true;notify();
  for(const f of frames.values())try{f.close()}catch(_){}
  frames.clear();
  try{if(decoder.state!=="closed")decoder.close()}catch(_){}
 }
 return Object.freeze({imageA,fermer,info:{width:info.dw,height:info.dh,
   samples:info.ns,codec:info.codec,editMediaTime:info.editMediaTime,
   firstPTSUs:timeline.premierPTS,lastPTSUs:timeline.dernierPTS,
   ptsUs:timeline.nonnegative.map(x=>x.ptsUs)},
   statistiques:()=>({fed:state.fed,decoded:state.decoded,dropped:state.dropped,held:frames.size})});
}
return Object.freeze({creer,planifier,choisir,choisirProche});
})();
if(typeof module!=="undefined"&&module.exports)module.exports=NOVA_PTS;
