import test from "node:test";
import assert from "node:assert/strict";
import DEMUX from "../experiences/nova-demux.js";

const m=(a,b,c,d,{u=0,v=0,w=1}={})=>[a,b,u,c,d,v,0,0,w];
test("NOVA 0.14 : orientation verticale iPhone 90/270 sans altérer les pixels",()=>{
 const r=DEMUX.analyserOrientation(160,90,m(0,1,-1,0));
 assert.equal(r.dw,90);assert.equal(r.dh,160);
 assert.deepEqual(r.mat,[0,1,-1,0,90,0]);
 assert.equal(r.mirrored,false);assert.equal(r.oriented,true);
 const l=DEMUX.analyserOrientation(160,90,m(0,-1,1,0));
 assert.deepEqual(l.mat,[0,-1,1,0,0,160]);
 assert.deepEqual([l.dw,l.dh],[90,160]);
});
test("NOVA 0.14 : matrices retournées 0/180 et miroir",()=>{
 const normal=DEMUX.analyserOrientation(160,90,m(1,0,0,1));
 const rotated=DEMUX.analyserOrientation(160,90,m(-1,0,0,-1));
 const mirrored=DEMUX.analyserOrientation(160,90,m(-1,0,0,1));
 assert.deepEqual(normal.mat,[1,0,0,1,0,0]);
 assert.deepEqual(rotated.mat,[-1,0,0,-1,160,90]);
 assert.deepEqual(mirrored.mat,[-1,0,0,1,160,0]);
 assert.equal(mirrored.mirrored,true);
 assert.equal(rotated.mirrored,false);
 for(const o of [normal,rotated,mirrored])
  assert.equal(o.dw*o.dh,160*90);
});
test("NOVA 0.14 : refuser matrices MP4 qui déforment, étirent ou projettent l'image",()=>{
 for(const matrix of [
  m(1,0,0.2,1),m(1.1,0,0,1),m(0.707,0.707,-0.707,0.707),
  m(1,0,0,0),m(1,0,0,1,{u:.5}),m(1,0,0,1,{w:.9}),
  m(1,0,0,1,{v:.2}),[NaN,0,0,0,1,0,0,0,1]
 ])assert.equal(DEMUX.analyserOrientation(160,90,matrix),null,JSON.stringify(matrix));
 assert.equal(DEMUX.analyserOrientation(1,90,m(1,0,0,1)),null);
});

test("NOVA 0.15 : les translations tkhd sont canonisées ou explicitement refusées",()=>{
 const portrait=m(0,1,-1,0);portrait[6]=90;
 assert.deepEqual(DEMUX.analyserOrientation(160,90,portrait)?.mat,[0,1,-1,0,90,0]);
 const flipped=m(-1,0,0,-1);flipped[6]=160;flipped[7]=90;
 assert.deepEqual(DEMUX.analyserOrientation(160,90,flipped)?.mat,[-1,0,0,-1,160,90]);
 for(const invalid of [
  (()=>{const x=m(1,0,0,1);x[6]=8;return x})(),
  (()=>{const x=m(0,1,-1,0);x[6]=91;return x})(),
  (()=>{const x=m(0,1,-1,0);x[7]=3;return x})(),
  (()=>{const x=m(1,0,0,1);x[6]=0.25;return x})()
 ])assert.equal(DEMUX.analyserOrientation(160,90,invalid),null,
  "ne jamais ignorer une translation de présentation inattendue");
});
