/* Synthetic-only end-to-end test of the actual native HD exporter.
 * Restoration is identity to isolate render / RGB-to-I420 / H264 / mux / replay.
 * No user-selected files are read. */
var NOVA_EXPORT_COLOR_TEST=(()=>{
'use strict';
const round=n=>Math.round(n*1000)/1000;
const check=signal=>{if(signal?.aborted)throw Error('cancelled')};
function compare(before,after){
 if(!Array.isArray(before)||before.length!==8||!Array.isArray(after)||after.length!==8)throw Error('invalid-patches');
 let sum=0,max=0;
 const patches=before.map((a,i)=>{
  const b=after[i];
  if(a.id!==b?.id||![a.rgb,b.rgb].every(v=>Array.isArray(v)&&v.length===3&&v.every(n=>Number.isFinite(n)&&n>=0&&n<=255)))throw Error('invalid-patches');
  const delta=b.rgb.map((v,k)=>round(v-a.rgb[k]));
  delta.forEach(d=>{sum+=Math.abs(d);max=Math.max(max,Math.abs(d))});
  return {id:a.id,before:a.rgb,after:b.rgb,delta};
 });
 return {meanAbsRgb255:round(sum/24),maxAbsRgb255:round(max),patches};
}
async function decode(blob,signal){
 check(signal);
 const info=await NOVA_DEMUX.analyser(blob);
 if(!info||info.W!==384||info.H!==216||info.ns!==15||!info.key[0])throw Error('unexpected-fixture');
 const cfg=await NOVA_NATIVE_HD.configDecoder(info);
 let decoder,first=null,failed=false,count=0,timer,abort;
 try{
  decoder=new VideoDecoder({output:f=>{count++;if(!first&&f.timestamp===info.ptsUs[0])first=f;else f.close()},error:()=>{failed=true}});
  decoder.configure(cfg);
  for(let i=0;i<info.ns;i++){
   check(signal);const start=info.so[i],size=info.sz[i];
   if(!Number.isSafeInteger(start)||!Number.isSafeInteger(size)||start<0||size<1||start+size>blob.size)throw Error('invalid-sample');
   decoder.decode(new EncodedVideoChunk({type:info.key[i]?'key':'delta',timestamp:info.ptsUs[i],data:await blob.slice(start,start+size).arrayBuffer()}));
  }
  await Promise.race([decoder.flush(),new Promise((_,reject)=>{
   timer=setTimeout(()=>reject(Error('decode-timeout')),15000);
   abort=()=>reject(Error('cancelled'));signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
  })]);
  check(signal);if(failed||!first||count!==15)throw Error('decode-incomplete');
  const canvas=document.createElement('canvas');canvas.width=384;canvas.height=216;
  try{
   const ctx=canvas.getContext('2d',{willReadFrequently:true,colorSpace:'srgb'});if(!ctx)throw Error('canvas-unavailable');
   ctx.drawImage(first,0,0);
   return {patches:NOVA_HEVC_PAIR.moyens(ctx.getImageData(0,0,384,216).data,384,216),decoded:NOVA_HEVC_PAIR.safeFrame(first),info};
  }finally{canvas.width=0;canvas.height=0}
 }finally{
  clearTimeout(timer);if(abort)signal?.removeEventListener('abort',abort);
  first?.close();if(decoder&&decoder.state!=='closed')decoder.close();
 }
}
async function run({signal,onProgress=()=>{}}={}){
 const results=[];
 for(const [suffix,matrix] of [['601',6],['709',1]]){
  check(signal);onProgress('Lecture de la mire 1/1/'+matrix+'…');
  const response=await fetch('./nova-roundtrip-'+suffix+'.mov',{cache:'no-store',signal});
  if(!response.ok)throw Error('fixture-unavailable');
  const file=await response.blob();if(file.size<1||file.size>250000)throw Error('fixture-size-invalid');
  const before=await decode(file,signal);
  const c=before.info.color;
  if(c?.primaries!==1||c?.transfer!==1||c?.matrix!==matrix)throw Error('fixture-color-invalid');
  onProgress('Export H.264 et contrôle AAC de la mire 1/1/'+matrix+'…');
  const output=await NOVA_NATIVE_HD.exporter({file,signal,detailEnabled:false,
   moteur:{restituer:img=>({data:img.data,bilan:{intervention:false}})},arbitre:{arbitrer:()=>null}});
  check(signal);onProgress('Relecture du MP4 exporté pour la mire 1/1/'+matrix+'…');
  const after=await decode(output.blob,signal);
  results.push({sourceMatrix:matrix,outputCodec:after.info.codec,
   beforeDecoded:before.decoded,afterDecoded:after.decoded,
   ...compare(before.patches,after.patches),outputBytes:output.blob.size,
   inputFrames:before.info.ns,outputFrames:after.info.ns,
   audioPacketsVerified:output.qualityReport.audio.packets,
   outputBt709Verified:output.qualityReport.color.encodedOutputBt709});
 }
 return {schema:'retoucheproai.nova.synthetic-export-roundtrip.v1',status:'measured-not-source-certified',
  origin:'ffmpeg-synthetic-only',restoration:'identity-for-test-only',results,
  privacy:{personalMediaIncluded:false,rawMediaIncluded:false,rawFrameIncluded:false,deviceIdentifiersIncluded:false,networkUpload:false},
  limitation:'Première image de chaque mire fixe : comparaison Canvas avant export et après relecture du MP4 du moteur HD réel. Restauration désactivée pour isoler le chemin couleur. Ni certification des vidéos personnelles ni mesure perceptuelle ou de synchronisation audio.'};
}
return Object.freeze({compare,decode,run});
})();
if(typeof module!=='undefined'&&module.exports)module.exports=NOVA_EXPORT_COLOR_TEST;
