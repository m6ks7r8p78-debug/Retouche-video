/* NOVA 0.30 — recours audio natif SUR L'APPAREIL lorsque AAC bitstream
 * ne peut pas être copié. Ne jamais masquer une perte de son.
 * Priorité au AAC original ; recours à décodage MP4 natif + AudioEncoder AAC-LC
 * seulement si Safari expose explicitement le codec, la durée est couverte
 * et le buffer final contient des échantillons AAC.
 * Pas de CDN, serveur, capture du micro, ni changement automatique sans rapport.
 */
var NOVA_AAC_NATIVE=(()=>{
"use strict";
const MAX_FILE=16*1048576,MAX_SEC=12.2,MAX_CHUNKS=2000,MAX_AAC=4*1048576;
const error=m=>{throw new Error("Audio natif NOVA : "+m)};
const safe=n=>Number.isSafeInteger(n)&&n>=0;
const rates=[96000,88200,64000,48000,44100,32000,24000,22050,
 16000,12000,11025,8000,7350];
function asc(rate,channels){
 const i=rates.indexOf(rate);
 if(i<0||![1,2].includes(channels))error("configuration ASC AAC-LC non représentable");
 return new Uint8Array([(2<<3)|(i>>1),((i&1)<<7)|(channels<<3)]);
}
async function capability({AudioEncoderClass=globalThis.AudioEncoder,
 SampleRate=48000,channels=2}={}){
 if(typeof AudioEncoderClass!=="function"||!AudioEncoderClass.isConfigSupported)
  error("AudioEncoder AAC indisponible sur ce Safari");
 const config={codec:"mp4a.40.2",sampleRate:SampleRate,
  numberOfChannels:channels,bitrate:channels===1?96000:160000,
  aac:{format:"aac"}};
 let supported;
 try{supported=await AudioEncoderClass.isConfigSupported(config)}
 catch{error("test du codec AAC natif non abouti")}
 if(!supported?.supported)error("encodeur AAC-LC non pris en charge");
 return config;
}
async function decode(file,{durationSeconds,signal,
 OfflineClass=globalThis.OfflineAudioContext,
 AudioClass=globalThis.AudioContext||globalThis.webkitAudioContext}={}){
 if(!file||typeof file.arrayBuffer!=="function"||!safe(file.size)||
    !file.size||file.size>MAX_FILE)
  error("recours réservé aux clips locaux de moins de 16 Mio");
 if(!Number.isFinite(durationSeconds)||durationSeconds<=0||
    durationSeconds>MAX_SEC)error("durée vidéo hors du recours audio");
 if(signal?.aborted)error("opération annulée");
 let ctx;
 try{
  if(typeof OfflineClass==="function")ctx=new OfflineClass(2,1,48000);
  else if(typeof AudioClass==="function")ctx=new AudioClass({sampleRate:48000});
  else error("décodeur audio Web Audio indisponible");
  const bytes=await file.arrayBuffer();
  if(signal?.aborted)error("opération annulée");
  const buffer=await ctx.decodeAudioData(bytes);
  if(signal?.aborted)error("opération annulée");
  if(!buffer||![1,2].includes(buffer.numberOfChannels)||
     !rates.includes(buffer.sampleRate)||buffer.length<1||
     buffer.duration>MAX_SEC+.15)
   error("piste audio décodée incomplète ou multicanale");
  // Un échantillon trop court produit un fichier vidéo mensongèrement muet.
  if(Math.abs(buffer.duration-durationSeconds)>.095)
   error("durée audio décodée différente de la vidéo");
  const channels=buffer.numberOfChannels,rate=buffer.sampleRate;
  const samples=Array.from({length:channels},(_,c)=>{
   const a=buffer.getChannelData(c);
   if(a.length!==buffer.length)error("canal audio tronqué");
   return new Float32Array(a);
  });
  return Object.freeze({channels,sampleRate:rate,frames:buffer.length,
   durationSeconds:buffer.length/rate,samples});
 }catch(e){
  if(String(e?.message||"").startsWith("Audio natif NOVA :"))throw e;
  error("décodage de la piste audio locale indisponible");
 }finally{try{await ctx?.close?.()}catch{}}
}
async function planifier(file,{durationSeconds,signal}={},{
 EncoderClass=globalThis.AudioEncoder,
 DataClass=globalThis.AudioData,
 decoder=decode}={}){
 if(typeof DataClass!=="function")error("AudioData indisponible");
 const pcm=await decoder(file,{durationSeconds,signal});
 if(signal?.aborted)error("opération annulée");
 if(!pcm||![1,2].includes(pcm.channels)||!rates.includes(pcm.sampleRate)||
    !safe(pcm.frames)||pcm.frames<1||!Array.isArray(pcm.samples)||
    pcm.samples.length!==pcm.channels||
    pcm.samples.some(v=>!(v instanceof Float32Array)||v.length!==pcm.frames))
  error("tampon PCM natif invalide");
 if(Math.abs(pcm.frames/pcm.sampleRate-durationSeconds)>.095)
  error("couverture audio insuffisante");
 const cfg=await capability({AudioEncoderClass:EncoderClass,
  SampleRate:pcm.sampleRate,channels:pcm.channels});
 if(signal?.aborted)error("opération annulée");
 const packets=[],maxDuration=Math.round(durationSeconds*1e6);
 let encoder,failed=null,seenConfig=null,totalBytes=0;
 try{
  encoder=new EncoderClass({output:(chunk,meta)=>{
   try{
    const timestamp=chunk.timestamp;
    // WebCodecs autorise EncodedAudioChunk.duration à être null. Pour un
    // flux AAC-LC brut, chaque access unit couvre 1024 samples ; on le
    // reconstruit si Safari ne signale pas la durée. La fin est auditée.
    const duration=chunk.duration==null?
      Math.round(1024*1e6/pcm.sampleRate):chunk.duration;
    if(!safe(timestamp)||!safe(duration)||!duration||
       timestamp>maxDuration+100000||packets.length>=MAX_CHUNKS)
     error("horodatages ou nombre de paquets AAC invalides");
    const bytes=new Uint8Array(chunk.byteLength);
    if(!bytes.length||bytes.length>65536)error("paquet AAC encodé invalide");
    chunk.copyTo(bytes);
    if(bytes.length>=2&&bytes[0]===0xff&&(bytes[1]&0xf0)===0xf0)
     error("en-tête ADTS dans AAC brut non pris en charge");
    totalBytes+=bytes.length;
    if(totalBytes>MAX_AAC)error("taille AAC réencodée hors budget");
    const desc=meta?.decoderConfig?.description;
    if(desc!=null){
     const arr=new Uint8Array(desc.buffer??desc,desc.byteOffset??0,desc.byteLength);
     if(arr.length<2||arr.length>32)error("ASC natif AAC invalide");
     if(seenConfig&&arr.some((x,i)=>x!==seenConfig[i])||
        seenConfig&&seenConfig.length!==arr.length)
      error("configuration AAC native modifiée en cours de flux");
     seenConfig=new Uint8Array(arr);
    }
    packets.push({bytes,timestamp,duration});
   }catch(e){failed=e}
  },error:e=>{failed=e}});
  encoder.configure(cfg);
  const chunkFrames=1024;
  for(let start=0;start<pcm.frames;start+=chunkFrames){
   if(failed)throw failed;
   if(signal?.aborted)error("opération annulée");
   const count=Math.min(chunkFrames,pcm.frames-start);
   const data=new Float32Array(count*pcm.channels);
   for(let c=0;c<pcm.channels;c++)
    data.set(pcm.samples[c].subarray(start,start+count),c*count);
   const chunk=new DataClass({format:"f32-planar",sampleRate:pcm.sampleRate,
    numberOfFrames:count,numberOfChannels:pcm.channels,
    timestamp:Math.round(start*1e6/pcm.sampleRate),data});
   try{encoder.encode(chunk)}finally{chunk.close()}
   if(encoder.encodeQueueSize>8){
    const startWait=Date.now();
    while(encoder.encodeQueueSize>4){
     if(failed)throw failed;
     if(signal?.aborted)error("opération annulée");
     if(Date.now()-startWait>20000)error("encodeur AAC saturé");
     await new Promise(resolve=>setTimeout(resolve,10));
    }
   }
  }
  await encoder.flush();
  if(failed)throw failed;
  if(!packets.length)error("l'encodeur AAC n'a produit aucun paquet");
  // Ne pas demander au muxer d'inventer des paquets silencieux.
  packets.sort((a,b)=>a.timestamp-b.timestamp);
  if(packets[0].timestamp!==0||
     packets.some((p,i)=>i>0&&p.timestamp<=packets[i-1].timestamp))
   error("horodatages AAC réencodés non continus");
  const end=Math.max(...packets.map(p=>p.timestamp+p.duration));
  if(end<maxDuration-90000||end>maxDuration+120000)
   error("durée audio AAC réencodée non alignée");
  const description=seenConfig||asc(pcm.sampleRate,pcm.channels);
  return Object.freeze({mode:"aac-native-encode",packets,asc:description,
   sampleRate:pcm.sampleRate,channels:pcm.channels,
   outputEnd:maxDuration,
   qualification:"AAC-LC réencodé localement par le navigateur : vérifier son et synchronisation; pas de copie bit pour bit",
   outputEditGapSeconds:0});
 }catch(e){
  if(String(e?.message||"").startsWith("Audio natif NOVA :"))throw e;
  error("encodeur AAC natif interrompu ou indisponible");
 }finally{try{if(encoder?.state!=="closed")encoder?.close()}catch{}}
}
async function copier(_file,plan,muxer,{signal,onPacket=()=>{}}={}){
 if(plan?.mode!=="aac-native-encode"||!plan.packets?.length||
    !plan.asc||typeof muxer?.addAudioChunkRaw!=="function")
  error("plan de réencodage AAC invalide");
 let first=true,count=0;
 for(const p of plan.packets){
  if(signal?.aborted)error("opération annulée");
  muxer.addAudioChunkRaw(p.bytes,"key",p.timestamp,p.duration,
   first?{decoderConfig:{codec:"mp4a.40.2",sampleRate:plan.sampleRate,
    numberOfChannels:plan.channels,description:plan.asc}}:undefined);
  first=false;count++;onPacket({timestamp:p.timestamp,duration:p.duration});
 }
 return Object.freeze({mode:plan.mode,count});
}
return Object.freeze({capability,decode,planifier,copier,asc});
})();
if(typeof module!=="undefined"&&module.exports)module.exports=NOVA_AAC_NATIVE;
