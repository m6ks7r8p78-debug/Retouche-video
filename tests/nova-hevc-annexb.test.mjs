import test from "node:test";
import assert from "node:assert/strict";
import ANNEXB from "../experiences/nova-hevc-annexb.js";
const nal=t=>new Uint8Array([t<<1,1,t===32?7:1]);
const config=()=>{
 const arrays=[32,33,34].map(t=>{
  const n=nal(t);return [0x80|t,0,1,0,n.length,...n]});
 return new Uint8Array([1,...new Array(20).fill(0),3,3,...arrays.flat()]);
};
test("HEVC Annex B : hvcC exige les trois paramètres et 4-byte NAL",()=>{
 const cfg=ANNEXB.configuration(config());
 assert.equal(cfg.lengthBytes,4);
 assert.equal(cfg.parameterSets.length,3);
 assert.deepEqual(cfg.parameterSets.map(x=>x[0]>>1),[32,33,34]);
});
test("HEVC Annex B : extrait des NAL de plusieurs échantillons sans les réordonner",async()=>{
 const x=new Uint8Array([0,0,0,3,2,1,4,0,0,0,3,4,1,5]);
 const data=new Uint8Array([...x,...x]);
 const file=new Blob([data]);const info={codec:"hvc1.1.6.L30",desc:config(),
  ns:2,so:[0,x.length],sz:[x.length,x.length]};
 const a=await ANNEXB.extraire(file,info);
 assert.equal(a.samples,2);assert.equal(a.nals,7);
 assert.equal(a.bytes.length,7*4+3*3+4*3);
 assert.deepEqual(Array.from(a.bytes.slice(0,7)),[0,0,0,1,64,1,7]);
});
test("HEVC Annex B : refuse NAL tronquées, faux paramétrages et surcharges",async()=>{
 const bad=config();bad[bad.length-2]=255;
 assert.throws(()=>ANNEXB.configuration(bad),/NAL hvcC hors limites/);
 const cfg=config();
 assert.throws(()=>ANNEXB.decouper(new Uint8Array([0,0,0,9,2,1,3]),4),/NAL hors limites/);
 assert.throws(()=>ANNEXB.decouper(new Uint8Array([0,0,0]),4),/préfixe/);
 const f=new Blob([new Uint8Array([0,0,0,2,2,1])]);
 const info={codec:"hev1.1.6.L30",desc:cfg,ns:1,so:[0],sz:[6]};
 await assert.rejects(ANNEXB.extraire(f,info,{maxBytes:4}),/budget mémoire/);
 await assert.rejects(ANNEXB.extraire(f,{...info,so:[20]}),/hors fichier/);
 await assert.rejects(ANNEXB.extraire(f,{...info,ns:91}),/hors pilote/);
});
