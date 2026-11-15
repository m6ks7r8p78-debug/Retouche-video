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
