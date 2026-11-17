const fs=require('fs'),assert=require('assert');
const pair=require('../experiences/nova-hevc-pair.js');
global.NOVA_DEMUX=require('../experiences/nova-demux.js');
(async()=>{
 for(const [suffix,matrix] of [['601',6],['709',1]]){
 const r=JSON.parse(fs.readFileSync(`experiences/nova-pair-${suffix}.json`));
 const info=await NOVA_DEMUX.analyser(new Blob([fs.readFileSync(`experiences/nova-pair-${suffix}.mov`)]));
 assert.equal(info.color.matrix,matrix); assert.equal(info.color.primaries,1);assert.equal(info.color.transfer,1);assert.equal(info.ns,15);assert.equal(info.W,384);assert.equal(info.H,216);assert(info.key[0]);
 assert.equal(pair.synthese(r,r.patches,{}).meanAbsRgb255,0);
 assert.throws(()=>pair.validerReference({...r,matrix:9}));
 const obs=r.patches.map(p=>({...p,rgb:p.rgb.slice()}));obs[6].rgb[1]+=15;
 const result=pair.synthese(r,obs,{});assert.equal(result.maxAbsRgb255,15);assert.equal(result.meanAbsRgb255,.625);assert.equal(result.source.matrix,matrix);
 }
 await assert.rejects(pair.runPair({signal:AbortSignal.abort()}),/cancelled/);
 // Orchestration test only; this mocked decoder is NOT a browser measurement.
 let current;global.fetch=async path=>{const data=fs.readFileSync('experiences/'+path.replace('./','')); if(path.endsWith('.json'))current=JSON.parse(data);return {ok:true,arrayBuffer:async()=>data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength)}};
 global.EncodedVideoChunk=class{constructor(x){Object.assign(this,x)}};
 global.VideoDecoder=class{static async isConfigSupported(){return {supported:true}}constructor(c){this.c=c;this.state='configured'}configure(){}decode(c){this.c.output({timestamp:c.timestamp,close(){},colorSpace:{},format:'NV12'})}async flush(){}close(){this.state='closed'}};
 global.document={createElement(){return {getContext(){return {drawImage(){},getImageData(){let data=new Uint8ClampedArray(384*216*4);for(let y=0;y<216;y++)for(let x=0;x<384;x++){let rgb=current.patches[Math.floor(y/108)*4+Math.floor(x/96)].rgb;data.set([...rgb,255],(y*384+x)*4)}return {data}}}}}}};
 const combined=await pair.runPair();assert.equal(combined.results.length,2);assert.deepEqual(combined.results.map(r=>r.source.matrix),[6,1]);assert.equal(combined.maxAbsRgb255,0);
 let closed=0;
 const BaseDecoder=global.VideoDecoder;
 global.VideoDecoder=class extends BaseDecoder{flush(){return new Promise(()=>{})}close(){closed++;super.close()}};
 const aborter=new AbortController();
 const pending=pair.runPair({signal:aborter.signal});
 setTimeout(()=>aborter.abort(),10);
 await assert.rejects(pending,/cancelled/);assert.equal(closed,1);
 global.VideoDecoder=BaseDecoder;
 console.log('PASS: actual MOV demux, metadata, reference validation, peak error, cancellation during stuck decoder flush with cleanup, mocked two-file orchestration. No Safari measurement performed.');
})().catch(e=>{console.error(e);process.exit(1)});
