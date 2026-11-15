/* NOVA 0.9 — copie locale AAC-LC sans AudioEncoder, pour pistes MP4 simples.
 * Pas de re-encodage audio, pas d'upload, échec explicite si priming/edit
 * list non trivial (le muxer expérimental ne les préserve pas actuellement).
 */
var NOVA_AAC_COPY=(()=>{
"use strict";
const MAX_MOOV=12*1024*1024,MAX_PACKETS=5000;
const fail=s=>{throw new Error("Copie AAC prudente : "+s)};
const safe=n=>Number.isSafeInteger(n)&&n>=0;
const four=(b,i)=>String.fromCharCode(b[i],b[i+1],b[i+2],b[i+3]);
const dv=b=>new DataView(b.buffer,b.byteOffset,b.byteLength);
function boites(b,start,end){
 const v=dv(b),a=[];
 for(let o=start;o<end;){
  if(o+8>end)fail("boîte tronquée");
  let size=v.getUint32(o),head=8;
  if(size===1){if(o+16>end)fail("en-tête étendu tronqué");size=Number(v.getBigUint64(o+8));head=16}
  else if(!size)size=end-o;
  if(!safe(size)||size<head||o+size>end)fail("taille MP4 incohérente");
  a.push({type:four(b,o+4),start:o+head,end:o+size});
  o+=size;
 }
 return a;
}
function select(a,type){return a.find(x=>x.type===type)||null}
function kids(b,p){return p?boites(b,p.start,p.end):[]}
function need(b,p,type){const q=select(kids(b,p),type);if(!q)fail("table "+type+" absente");return q}
function ascFromEsds(b,esds,sampleRate,channels){
 if(!esds||esds.end-esds.start<8)fail("configuration AAC esds absente");
 const rates=[96000,88200,64000,48000,44100,32000,24000,22050,16000,12000,11025,8000,7350];
 for(let o=esds.start+4;o<esds.end-3;o++){
  if(b[o]!==5)continue;
  let p=o+1,len=0,x,tries=0;
  do{if(p>=esds.end)break;x=b[p++];len=(len<<7)|(x&127);tries++}while(x&128&&tries<4);
  if(tries>4||!safe(len)||len<2||len>6||p+len>esds.end)continue;
  const asc=b.slice(p,p+len),kind=asc[0]>>3,index=((asc[0]&7)<<1)|(asc[1]>>7),c=(asc[1]>>3)&15;
  if(kind===2&&rates[index]===sampleRate&&c===channels)return asc;
 }
 fail("AAC-LC ou paramètres ASC non confirmés");
}
function extract(b,sizeLimit,mdatRanges){
 const root=boites(b,0,b.byteLength),tracks=root.filter(x=>x.type==="trak");
 if(tracks.length>16)fail("trop de pistes");
 const v=dv(b),found=[];
 for(const tr of tracks){
  const mdia=need(b,tr,"mdia"),hdlr=need(b,mdia,"hdlr");
  if(hdlr.start+12>hdlr.end)fail("hdlr tronqué");
  if(four(b,hdlr.start+8)!=="soun")continue;
  const edits=select(kids(b,select(kids(b,tr),"edts")),"elst");
  if(edits){
   if(edits.start+20>edits.end||b[edits.start]!==0||v.getUint32(edits.start+4)!==1||
      v.getInt32(edits.start+12)!==0||v.getInt32(edits.start+16)!==65536)
    fail("trim/priming/edits audio non représentables dans le muxer actuel");
  }
  const mdhd=need(b,mdia,"mdhd");
  const version=b[mdhd.start];if(version!==0&&version!==1)fail("mdhd inconnu");
  const timescale=v.getUint32(mdhd.start+(version===1?20:12));
  if(!safe(timescale)||!timescale)fail("timescale invalide");
  const stbl=need(b,need(b,mdia,"minf"),"stbl"),tables=kids(b,stbl);
  // Les sample groups AAC peuvent porter les règles d'amorçage (roll/prol).
  // Le muxer pilote ne copie pas encore ces groupes : refus explicite
  // pour éviter de présenter un son décalé sur Safari/iPhone.
  if(tables.some(x=>x.type==="sgpd"||x.type==="sbgp"))
   fail("groupes d'échantillons AAC/priming non conservés par le muxer");
  const stsd=select(tables,"stsd"),stsz=select(tables,"stsz"),stsc=select(tables,"stsc"),
    stts=select(tables,"stts"),stco=select(tables,"stco")||select(tables,"co64");
  if(!stsd||!stsz||!stsc||!stts||!stco)fail("index audio incomplet");
  if(stsd.start+16>stsd.end||v.getUint32(stsd.start+4)!==1)fail("description AAC ambiguë");
  const entry=stsd.start+8,entrySize=v.getUint32(entry);
  if(entrySize<36||entry+entrySize>stsd.end||four(b,entry+4)!=="mp4a")
   fail("seul l'AAC MP4 simple est pris en charge");
  const channels=v.getUint16(entry+24),sampleRate=v.getUint32(entry+32)>>>16;
  if((channels!==1&&channels!==2)||sampleRate!==timescale)
   fail("canaux ou timescale AAC incompatibles");
  const asc=ascFromEsds(b,select(boites(b,entry+36,entry+entrySize),"esds"),sampleRate,channels);
  const count=v.getUint32(stsz.start+8),fixed=v.getUint32(stsz.start+4);
  if(!count||count>MAX_PACKETS)fail("quantité de paquets AAC excessive");
  if(!fixed&&stsz.start+12+count*4>stsz.end)fail("tailles AAC tronquées");
  const sizes=Array.from({length:count},(_,i)=>fixed||v.getUint32(stsz.start+12+i*4));
  const nChunks=v.getUint32(stco.start+4),wide=stco.type==="co64";
  if(!nChunks||nChunks>MAX_PACKETS||stco.start+8+nChunks*(wide?8:4)>stco.end)
   fail("chunks AAC invalides");
  const offsets=Array.from({length:nChunks},(_,i)=>wide?Number(v.getBigUint64(stco.start+8+i*8)):v.getUint32(stco.start+8+i*4));
  const nMap=v.getUint32(stsc.start+4);
  if(!nMap||nMap>nChunks||stsc.start+8+nMap*12>stsc.end)fail("stsc AAC invalide");
  const maps=Array.from({length:nMap},(_,i)=>({
    first:v.getUint32(stsc.start+8+i*12),per:v.getUint32(stsc.start+12+i*12),
    desc:v.getUint32(stsc.start+16+i*12)
  }));
  if(maps[0].first!==1||maps.some((m,i)=>!m.per||m.desc!==1||(i&&m.first<=maps[i-1].first)))
   fail("répartition AAC non standard");
  const packetOffsets=[];let index=0,k=0;
  for(let c=0;c<nChunks;c++){
   while(k+1<maps.length&&maps[k+1].first<=c+1)k++;
   let off=offsets[c];
   for(let n=0;n<maps[k].per&&index<count;n++){
    const len=sizes[index++];
    if(!safe(off)||!safe(len)||!len||!safe(off+len)||off+len>sizeLimit||
       !mdatRanges.some(([start,end])=>off>=start&&off+len<=end))
     fail("segment AAC en dehors du fichier");
    packetOffsets.push({offset:off,size:len});off+=len;
   }
  }
  if(index!==count)fail("couverture des samples AAC incomplète");
  const nRuns=v.getUint32(stts.start+4);if(!nRuns||nRuns>10000||stts.start+8+nRuns*8>stts.end)
   fail("durées AAC invalides");
  const packets=[];let t=0;
  for(let i=0;i<nRuns;i++){
   const n=v.getUint32(stts.start+8+i*8),delta=v.getUint32(stts.start+12+i*8);
   if(!n||!delta||packets.length+n>count)fail("stts incohérent");
   for(let j=0;j<n;j++){
    const at=packetOffsets[packets.length];
    const timestamp=Math.round(t*1e6/timescale),duration=Math.round((t+delta)*1e6/timescale)-timestamp;
    packets.push({...at,timestamp,duration});t+=delta;
   }
  }
  if(packets.length!==count||!safe(t))fail("chronologie des AAC incomplète");
  found.push({sampleRate,channels,asc,packets});
 }
 if(found.length!==1)fail(found.length?"pistes AAC multiples":"piste AAC absente");
 return found[0];
}
async function planifier(file,{durationSeconds,signal}={}){
 if(!file||typeof file.slice!=="function"||!safe(file.size)||
  !Number.isFinite(durationSeconds)||durationSeconds<=0)fail("source ou durée invalide");
 let off=0,media=null,boxes=0;
 const mdatRanges=[];
 while(off+8<=file.size){
  if(++boxes>2048)fail("trop de boîtes MP4 de premier niveau");
  if(signal?.aborted)fail("export annulé");
  const d=new DataView(await file.slice(off,Math.min(off+16,file.size)).arrayBuffer());
  if(d.byteLength<8)fail("fichier incomplet");
  let size=d.getUint32(0),head=8;if(size===1){if(d.byteLength<16)fail("en-tête étendu manquant");size=Number(d.getBigUint64(8));head=16}
  else if(!size)size=file.size-off;
  if(!safe(size)||size<head||off+size>file.size)fail("taille de boîte source invalide");
  const type=String.fromCharCode(d.getUint8(4),d.getUint8(5),d.getUint8(6),d.getUint8(7));
  if(type==="mdat")mdatRanges.push([off+head,off+size]);
  if(type==="moov"){
   if(media)fail("index moov multiple non pris en charge");
   if(size-head>MAX_MOOV)fail("index MP4 trop volumineux");
   media=new Uint8Array(await file.slice(off+head,off+size).arrayBuffer());
   if(media.length!==size-head)fail("index MP4 tronqué");
  }
  off+=size;
 }
 if(!media)fail("index MP4 absent");
 if(!mdatRanges.length)fail("boîte mdat source absente");
 const parsed=extract(media,file.size,mdatRanges),outputEnd=Math.round(durationSeconds*1e6);
 // Ne pas recréer les edits de priming : ce chemin ne traite que les pistes
 // déjà alignées à zéro, afin de conserver des unités AAC réellement inchangées.
 const packets=parsed.packets.filter(p=>p.timestamp<outputEnd);
 if(!packets.length||packets[0].timestamp!==0||packets.at(-1).timestamp+
    packets.at(-1).duration<outputEnd-120000)
  fail("AAC sans couverture temporelle alignée avec la vidéo");
 return Object.freeze({...parsed,packets,outputEnd,
   mode:"aac-copy",qualification:"copie AAC-LC MP4 sans réencodage, edits non pris en charge"});
}
async function copier(file,plan,muxer,{signal,onPacket=()=>{}}={}){
 if(!plan?.packets?.length||typeof muxer?.addAudioChunkRaw!=="function")
  fail("plan AAC ou muxer invalide");
 let first=true,count=0;
 for(const packet of plan.packets){
  if(signal?.aborted)fail("export annulé");
  const bytes=new Uint8Array(await file.slice(packet.offset,packet.offset+packet.size).arrayBuffer());
  if(bytes.length!==packet.size)fail("paquet AAC tronqué");
  muxer.addAudioChunkRaw(bytes,"key",packet.timestamp,packet.duration,
    first?{decoderConfig:{codec:"mp4a.40.2",sampleRate:plan.sampleRate,
      numberOfChannels:plan.channels,description:plan.asc}}:undefined);
  first=false;count++;onPacket({timestamp:packet.timestamp,duration:packet.duration});
 }
 return Object.freeze({count,mode:"aac-copy"});
}
return Object.freeze({planifier,copier});
})();
if(typeof module!=="undefined"&&module.exports)module.exports=NOVA_AAC_COPY;
