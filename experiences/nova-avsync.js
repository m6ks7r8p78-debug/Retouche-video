/* NOVA 0.7 experiment: audit strict de la chronologie audio source MP4.
 * Ne décode aucun son, ne lit que les boîtes moov, ne transmet aucune donnée.
 * Les edits AAC complexes sont rejetés plutôt que de prétendre conserver la synchro.
 */
var NOVA_AVSYNC=(()=>{
"use strict";
const MAX_MOOV=12*1024*1024,MAX_TRACKS=16;
const fail=msg=>{throw new Error("Audit audio MP4 : "+msg)};
const safe=n=>Number.isSafeInteger(n)&&n>=0;
const text4=(b,i)=>String.fromCharCode(b[i],b[i+1],b[i+2],b[i+3]);
function boites(b,start,end){
 const d=new DataView(b.buffer,b.byteOffset,b.byteLength),out=[];
 for(let i=start;i<end;){
  if(i+8>end)fail("en-tête de boîte tronqué");
  let n=d.getUint32(i),h=8;
  if(n===1){if(i+16>end)fail("boîte étendue tronquée");n=Number(d.getBigUint64(i+8));h=16}
  else if(n===0)n=end-i;
  if(!safe(n)||n<h||i+n>end)fail("taille de boîte invalide");
  out.push({type:text4(b,i+4),start:i+h,end:i+n});
  i+=n;
 }
 return out;
}
function one(boxes,type){return boxes.find(x=>x.type===type)||null}
function enfants(b,p){
 return p?boites(b,p.start,p.end):[];
}
function number64(x){
 const n=Number(x);
 if(!Number.isSafeInteger(n))fail("entier 64 bits trop grand");
 return n;
}
function analyserMoov(b){
 const dv=new DataView(b.buffer,b.byteOffset,b.byteLength);
 const root=boites(b,0,b.length),mvhd=one(root,"mvhd");
 if(!mvhd||mvhd.start+24>mvhd.end)fail("échelle du film absente");
 const movieVersion=b[mvhd.start];
 if(movieVersion!==0&&movieVersion!==1)fail("version mvhd inconnue");
 const movieTimescale=dv.getUint32(mvhd.start+(movieVersion===1?20:12));
 if(!safe(movieTimescale)||!movieTimescale)fail("échelle du film invalide");
 const tracks=root.filter(x=>x.type==="trak");
 if(!tracks.length||tracks.length>MAX_TRACKS)fail("nombre de pistes inhabituel");
 const audios=[];
 for(const track of tracks){
  const t=enfants(b,track),mdia=one(t,"mdia"),m=enfants(b,mdia);
  const hdlr=one(m,"hdlr");if(!hdlr||hdlr.start+12>hdlr.end)fail("type de piste absent");
  if(text4(b,hdlr.start+8)!=="soun")continue;
  const mdhd=one(m,"mdhd");
  if(!mdhd||mdhd.start+24>mdhd.end)fail("échelle audio absente");
  const version=b[mdhd.start];
  if(version!==0&&version!==1)fail("version mdhd inconnue");
  const timescale=dv.getUint32(mdhd.start+(version===1?20:12));
  if(!safe(timescale)||!timescale)fail("échelle audio invalide");
  const minf=one(m,"minf"),stbl=one(enfants(b,minf),"stbl"),st=enfants(b,stbl);
  const stsd=one(st,"stsd"),stts=one(st,"stts");
  if(!stsd||!stts||stsd.start+16>stsd.end||stts.start+8>stts.end)
   fail("tables d'échantillons audio absentes");
  if(dv.getUint32(stsd.start+4)!==1)fail("plusieurs descriptions audio non prises en charge");
  const desc=stsd.start+8;
  if(text4(b,desc+4)!=="mp4a")fail("piste audio non AAC : réencodage fidèle non établi");
  const count=dv.getUint32(stts.start+4);
  if(!count||count>10000||stts.start+8+count*8>stts.end)
   fail("table de temps audio invalide");
  let ticks=0,samples=0;
  for(let i=0;i<count;i++){
   const n=dv.getUint32(stts.start+8+i*8),delta=dv.getUint32(stts.start+12+i*8);
   if(!n||!delta)fail("échantillon audio à durée nulle");
   ticks+=n*delta;samples+=n;
   if(!safe(ticks)||!safe(samples)||samples>200000)fail("durée audio débordante");
  }
  const edts=one(t,"edts"),elst=one(enfants(b,edts),"elst");
  let leadingEmptyTicks=0,mediaTime=0,edits=0,editSegmentTicks=null;
  if(elst){
   const v=b[elst.start];edits=dv.getUint32(elst.start+4);
   if((v!==0&&v!==1)||edits<1||edits>2)fail("liste de montage audio complexe");
   const step=v===1?20:12;
   if(elst.start+8+step*edits>elst.end)fail("liste de montage audio tronquée");
   const entries=[];
   for(let i=0;i<edits;i++){
    const p=elst.start+8+i*step;
    const seg=v===1?number64(dv.getBigUint64(p)):dv.getUint32(p);
    const media=v===1?Number(dv.getBigInt64(p+8)):dv.getInt32(p+4);
    const rate=dv.getInt32(p+(v===1?16:8));
    if(rate!==65536||!safe(seg)||!Number.isSafeInteger(media))fail("vitesse ou temps de montage audio non standard");
    entries.push({seg,media});
   }
   if(edits===2){
    if(entries[0].media!==-1||entries[1].media<0)fail("enchaînement d'éditions audio inconnu");
    leadingEmptyTicks=entries[0].seg;mediaTime=entries[1].media;
    editSegmentTicks=entries[1].seg;
   }else{
    if(entries[0].media<0)fail("édition audio vide sans segment");
    mediaTime=entries[0].media;
    editSegmentTicks=entries[0].seg;
   }
  }
  const delayUs=Math.round(leadingEmptyTicks*1e6/movieTimescale);
  const trimUs=Math.round(mediaTime*1e6/timescale);
  const durationUs=Math.round(ticks*1e6/timescale);
  const editSegmentUs=editSegmentTicks==null?null:
    Math.round(editSegmentTicks*1e6/movieTimescale);
  const mediaAvailableUs=durationUs-trimUs;
  if(![delayUs,trimUs,durationUs].every(safe)||!safe(mediaAvailableUs)||
     (editSegmentUs!=null&&(!safe(editSegmentUs)||editSegmentUs>mediaAvailableUs+10000)))
   fail("liste de montage audio dépassant les échantillons décodables");
  // Un elst raccourcit la durée présentée même si stts couvre davantage.
  // Ne jamais prétendre avoir 2 s de son lorsque l'édition en expose 1 s.
  const presentedUs=Math.min(mediaAvailableUs,editSegmentUs??mediaAvailableUs);
  audios.push(Object.freeze({codec:"mp4a",samples,timescale,movieTimescale,
    delayUs,trimUs,durationUs,editSegmentUs,
    presentationEndUs:delayUs+presentedUs,
    edits,qualification:"analyse stts/mdhd/elst, sans mesure du son décodé"}));
 }
 if(audios.length>1)fail("plusieurs pistes audio : correspondance non garantie");
 return audios[0]??null;
}
async function analyser(file){
 if(!file||typeof file.slice!=="function"||!safe(file.size)||file.size<8)
  fail("fichier source invalide");
 let offset=0;
 while(offset+8<=file.size){
  const h=new DataView(await file.slice(offset,Math.min(file.size,offset+16)).arrayBuffer());
  if(h.byteLength<8)fail("en-tête incomplet");
  let size=h.getUint32(0),head=8;
  if(size===1){
   if(h.byteLength<16)fail("boîte étendue incomplète");
   size=number64(h.getBigUint64(8));head=16;
  }else if(size===0)size=file.size-offset;
  if(!safe(size)||size<head||offset+size>file.size)fail("structure MP4 malformée");
  const type=String.fromCharCode(...new Uint8Array(h.buffer,h.byteOffset+4,4));
  if(type==="moov"){
   if(size-head>MAX_MOOV)fail("index MP4 trop volumineux pour ce pilote");
   const buf=new Uint8Array(await file.slice(offset+head,offset+size).arrayBuffer());
   if(buf.byteLength!==size-head)fail("index MP4 tronqué");
   return analyserMoov(buf);
  }
  offset+=size;
 }
 fail("boîte moov introuvable");
}
function verifier(audio,{videoStartUs=0,durationSeconds,allowLeadingGap=false}={}){
 if(!audio)fail("aucune piste audio identifiable ; sortie sonore non garantie");
 if(!safe(videoStartUs)||!Number.isFinite(durationSeconds)||durationSeconds<=0)
  fail("référence vidéo invalide");
 // Un décodeur decodeAudioData peut gérer l'amorçage AAC, mais ses règles
 // de montage complexes ne sont pas démontrées, et sa timeline est perdue.
 if(audio.trimUs>125000)
  fail("trim audio trop important pour un décodage PCM sans chronologie");
 if(audio.delayUs>80000&&!allowLeadingGap)
  fail("départ audio décalé : ce pilote ne doit pas supprimer ce délai");
 if(audio.delayUs>500000)
  fail("décalage de début audio supérieur à 500 ms");
 // Un lead-in n'est permis que si le chemin bitstream-copy a déjà prouvé
 // la présence d'une elst vide et peut la recréer dans le MP4 progressif.
 if(allowLeadingGap){
   if(videoStartUs>100000)
     fail("première image trop tardive pour valider le décalage AAC");
 }else if(Math.abs(audio.delayUs-videoStartUs)>100000)
   fail("désalignement initial audio/vidéo");
 if(audio.presentationEndUs<durationSeconds*1e6-160000)
  fail("fin de piste audio trop précoce");
 return Object.freeze({...audio,aligned:true,
  qualification:"source MP4 vérifiée aux tables de temps, pas preuve de lip-sync"});
}
return Object.freeze({analyser,analyserMoov,verifier});
})();
if(typeof module!=="undefined"&&module.exports)module.exports=NOVA_AVSYNC;
