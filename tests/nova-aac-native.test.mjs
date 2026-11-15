import test from "node:test";
import assert from "node:assert/strict";
import NATIVE from "../experiences/nova-aac-native.js";
const makePCM=({rate=48000,channels=2,frames=48000}={})=>({
 sampleRate:rate,channels,frames,durationSeconds:frames/rate,
 samples:Array.from({length:channels},(_,c)=>{
  const a=new Float32Array(frames);
  for(let i=0;i<frames;i++)a[i]=.2*Math.sin(2*Math.PI*(c?600:440)*i/rate);
  return a
 })
});
class AudioDataMock{
 constructor({format,sampleRate,numberOfChannels,numberOfFrames,timestamp,data}){
  assert.equal(format,"f32-planar");
  assert.equal(data.length,numberOfChannels*numberOfFrames);
  this.sampleRate=sampleRate;this.channels=numberOfChannels;
  this.numberOfFrames=numberOfFrames;this.timestamp=timestamp;
 }
 close(){this.closed=true}
}
class EncoderMock{
 static isConfigSupported=async c=>({supported:c.codec==="mp4a.40.2"&&
  c.sampleRate===48000&&c.numberOfChannels===2});
 constructor({output,error}){this.output=output;this.error=error;this.encodeQueueSize=0;this.state="unconfigured"}
 configure(c){this.cfg=c;this.state="configured"}
 encode(input){
  assert.equal(input.closed,undefined);
  const desc=NATIVE.asc(input.sampleRate,input.channels);
  this.output({timestamp:input.timestamp,
   duration:Math.round(input.numberOfFrames*1e6/input.sampleRate),
   byteLength:4,copyTo(buf){buf.set([3,4,5,6])}},
   {decoderConfig:{description:desc}});
 }
 async flush(){}
 close(){this.state="closed"}
}
const file={size:80000,arrayBuffer:async()=>new ArrayBuffer(80000)};
test("AAC natif Safari mock : reconstitue tous les paquets et le multiplexeur avec le son",async()=>{
 const report=await NATIVE.planifier(file,{durationSeconds:1},
  {EncoderClass:EncoderMock,DataClass:AudioDataMock,
   decoder:async()=>makePCM()});
 assert.equal(report.mode,"aac-native-encode");
 assert.equal(report.sampleRate,48000);
 assert.equal(report.channels,2);
 assert.ok(report.packets.length>=46);
 assert.deepEqual([...report.asc],[0x11,0x90]);
 const dst=[];
 const out=await NATIVE.copier(file,report,{
  addAudioChunkRaw(...args){dst.push(args)}
 });
 assert.equal(out.count,report.packets.length);
 assert.equal(dst[0][2],0);
 assert.equal(dst[0][4].decoderConfig.codec,"mp4a.40.2");
 assert.equal(dst[0][4].decoderConfig.sampleRate,48000);
 assert.deepEqual([...dst[0][4].decoderConfig.description],[0x11,0x90]);
 assert.ok(dst.at(-1)[2]+dst.at(-1)[3]>990000);
 assert.ok(dst.every(x=>x[0].length===4));
});
test("AAC natif Safari mock : decodeAudioData sur un MP4 complet sans lecture/partage réseau",async()=>{
 let closed=false,decodedBytes=0;
 class OfflineMock{
  constructor(channels,count,rate){
   assert.equal(channels,2);assert.equal(count,1);assert.equal(rate,48000)
  }
  async decodeAudioData(ab){
   decodedBytes=ab.byteLength;
   return {numberOfChannels:2,sampleRate:48000,length:48000,duration:1,
    getChannelData:c=>makePCM().samples[c]}
  }
  async close(){closed=true}
 }
 const decoded=await NATIVE.decode(file,{durationSeconds:1,OfflineClass:OfflineMock});
 assert.equal(decoded.frames,48000);
 assert.equal(decoded.samples.length,2);
 assert.equal(decodedBytes,file.size);
 // OfflineAudioContext may lack close(); its absence is not an error.
 assert.equal(closed,true);
});
test("AAC natif : ne remplace jamais par du silence les codecs indisponibles",async()=>{
 class Unsupported{
  static isConfigSupported=async()=>({supported:false})
 }
 await assert.rejects(NATIVE.planifier(file,{durationSeconds:1},
  {EncoderClass:Unsupported,DataClass:AudioDataMock,
   decoder:async()=>makePCM()}),/encodeur AAC-LC non pris/);
 await assert.rejects(NATIVE.planifier(file,{durationSeconds:1},
  {EncoderClass:EncoderMock,DataClass:AudioDataMock,
   decoder:async()=>makePCM({frames:30000})}),/couverture audio insuffisante/);
 await assert.rejects(NATIVE.decode({size:17*1048576,arrayBuffer(){}},
  {durationSeconds:1}),/moins de 16 Mio/);
 await assert.rejects(NATIVE.planifier(file,{durationSeconds:1},
  {EncoderClass:EncoderMock,DataClass:AudioDataMock,
   decoder:async()=>makePCM({channels:3})}),/tampon PCM natif invalide/);
});
test("AAC natif : refuse réencodage si l'utilisateur annule",async()=>{
 const ctrl=new AbortController();ctrl.abort();
 await assert.rejects(NATIVE.planifier(file,{durationSeconds:1,signal:ctrl.signal},
  {EncoderClass:EncoderMock,DataClass:AudioDataMock,
   decoder:async()=>makePCM()}),/annulée/);
});

test("AAC natif Safari : durée EncodedAudioChunk nullable reconstruite depuis 1024 samples",async()=>{
 class NoDuration extends EncoderMock{
  encode(input){
   this.output({timestamp:input.timestamp,duration:null,byteLength:4,
    copyTo(buf){buf.set([1,2,3,4])}},{
    decoderConfig:{description:NATIVE.asc(input.sampleRate,input.channels)}
   });
  }
 }
 const report=await NATIVE.planifier(file,{durationSeconds:1},
  {EncoderClass:NoDuration,DataClass:AudioDataMock,decoder:async()=>makePCM()});
 assert.equal(report.mode,"aac-native-encode");
 assert.ok(report.packets.every(p=>p.duration>0));
 assert.ok(report.packets.at(-1).timestamp+report.packets.at(-1).duration>=995000);
});

const WEBKIT_302253_MONO=new Uint8Array([
 3,128,128,128,34,0,0,0,4,128,128,128,20,64,20,0,24,0,0,0,0,0,
 0,0,0,0,5,128,128,128,2,17,136,6,128,128,128,1,2
]);
function webkitDesc(channels=1){
 const b=new Uint8Array(WEBKIT_302253_MONO);
 // AudioSpecificConfig présent dans le DecoderSpecificInfo (tag 05).
 // Ne jamais faire « slice(-8) » : la longueur et l'intégrité comptent.
 if(channels===2)b[31]=0x90;
 return b;
}
test("WebKit #302253 : decoderConfig.description = ES_Descriptor natif, extraction ASC mono",()=>{
 const actual=NATIVE.normalizeDescription(webkitDesc(1),48000,1);
 assert.deepEqual([...actual],[0x11,0x88]);
 assert.ok(actual.length<WEBKIT_302253_MONO.length);
});
test("WebKit #302253 : ES_Descriptor Safari stéréo 48 kHz valide",async()=>{
 const desc=webkitDesc(2);
 assert.deepEqual([...NATIVE.normalizeDescription(desc,48000,2)],[0x11,0x90]);
 class WebkitEncoder extends EncoderMock{
  encode(input){
   const bytes=webkitDesc(2);
   this.output({timestamp:input.timestamp,duration:Math.round(input.numberOfFrames*1e6/input.sampleRate),
    byteLength:4,copyTo(b){b.set([3,4,5,6])}},{
    decoderConfig:{codec:"mp4a.40.2",sampleRate:48000,
     numberOfChannels:2,description:bytes.buffer}
   });
  }
 }
 const result=await NATIVE.planifier(file,{durationSeconds:1},
  {EncoderClass:WebkitEncoder,DataClass:AudioDataMock,decoder:async()=>makePCM()});
 assert.equal(result.mode,"aac-native-encode");
 assert.equal(result.packets.length,47);
 assert.deepEqual([...result.asc],[0x11,0x90]);
 const packets=[];
 await NATIVE.copier(file,result,{addAudioChunkRaw(...a){packets.push(a)}});
 assert.deepEqual([...packets[0][4].decoderConfig.description],[0x11,0x90],
  "MP4 muxer receives ASC only, not Safari's full ES descriptor");
});
test("WebKit #302253 : accepte DataView, esds FullBox ou atome MP4, pas seulement Uint8Array",()=>{
 const raw=webkitDesc(1);
 const dv=new DataView(raw.buffer.slice(0));
 assert.deepEqual([...NATIVE.normalizeDescription(dv,48000,1)],[17,136]);
 const fullbox=new Uint8Array(4+raw.length);
 fullbox.set(raw,4);
 assert.deepEqual([...NATIVE.normalizeDescription(fullbox,48000,1)],[17,136]);
 const atom=new Uint8Array(12+raw.length);
 new DataView(atom.buffer).setUint32(0,atom.length);
 atom.set([101,115,100,115],4);
 atom.set(raw,12);
 assert.deepEqual([...NATIVE.normalizeDescription(atom,48000,1)],[17,136]);
});
test("WebKit #302253 : rejette les descriptions corrompues et les canaux différents",()=>{
 const valid=webkitDesc(1);
 assert.throws(()=>NATIVE.normalizeDescription(valid,44100,1),/fréquence\/canaux/);
 assert.throws(()=>NATIVE.normalizeDescription(valid,48000,2),/fréquence\/canaux/);
 const corrupt=new Uint8Array(valid);corrupt[4]=127;
 assert.throws(()=>NATIVE.normalizeDescription(corrupt,48000,1),/incohérent|ambig|descripteur/);
 const wrongCodec=new Uint8Array(valid);wrongCodec[13]=0x20;
 assert.throws(()=>NATIVE.normalizeDescription(wrongCodec,48000,1),/DecoderConfig/);
 const noLC=new Uint8Array(valid);noLC[30]=0x29;
 assert.throws(()=>NATIVE.normalizeDescription(noLC,48000,1),/non.*AAC-LC/);
 assert.throws(()=>NATIVE.normalizeDescription(new Uint8Array(300),48000,2),/hors limites/);
});
test("WebKit AAC : ne crée plus d'ASC fictive quand l'encodeur ne fournit aucune description",async()=>{
 class NoMeta extends EncoderMock{
  encode(input){this.output({timestamp:input.timestamp,duration:Math.round(input.numberOfFrames*1e6/input.sampleRate),
   byteLength:4,copyTo(buf){buf.set([3,4,5,6])}},{});}
 }
 await assert.rejects(NATIVE.planifier(file,{durationSeconds:1},
  {EncoderClass:NoMeta,DataClass:AudioDataMock,
   decoder:async()=>makePCM()}),/n'a pas fourni d'AudioSpecificConfig/);
});
