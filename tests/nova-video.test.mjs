import test from "node:test";
import assert from "node:assert/strict";
import VIDEO from "../experiences/nova-video.js";

function environnement(){
 const originalDocument=globalThis.document,originalImageData=globalThis.ImageData;
 const handlers=new Map(),callbacks=new Map();
 let callbackId=0,painted=0,calls=0;
 const ctx={drawImage:()=>{},getImageData:()=>({width:100,height:60,data:new Uint8ClampedArray(100*60*4)}),
  putImageData:()=>{painted++}};
 const canvas={width:0,height:0,hidden:true,getContext:()=>ctx};
 globalThis.document={createElement:(tag)=>{assert.equal(tag,"canvas");return {width:0,height:0,getContext:()=>ctx}}};
 globalThis.ImageData=class {constructor(data,width,height){this.data=data;this.width=width;this.height=height}};
 const video={readyState:2,videoWidth:200,videoHeight:120,currentTime:0,paused:true,ended:false,
  addEventListener:(name,cb)=>{const set=handlers.get(name)||new Set();set.add(cb);handlers.set(name,set)},
  removeEventListener:(name,cb)=>handlers.get(name)?.delete(cb),
  requestVideoFrameCallback:cb=>{callbackId++;callbacks.set(callbackId,cb);return callbackId},
  cancelVideoFrameCallback:id=>callbacks.delete(id),
  emettre(name){for(const cb of handlers.get(name)||[])cb()},
  frame(time=1000){const first=callbacks.keys().next().value;if(!first)return false;const cb=callbacks.get(first);callbacks.delete(first);cb(time);return true}
 };
 const moteur={restituer:image=>{calls++;return {...image,bilan:{modifiees:1}}}};
 const arbitre={arbitrer:()=>({choisi:"original"})};
 const restore=()=>{globalThis.document=originalDocument;globalThis.ImageData=originalImageData};
 return {video,canvas,moteur,arbitre,restore,painted:()=>painted,calls:()=>calls,callbacks,handlers};
}
test("prévisualisation : produit une vraie image RGBA locale",()=>{
 const e=environnement();try{
  const p=VIDEO.creer(e);assert.equal(p.lancer(),true);
  assert.equal(e.painted(),1);assert.equal(e.calls(),1);
  assert.equal(p.statistiques().resolution[0],200);
  assert.equal(e.canvas.hidden,false);
  assert.equal(p.statistiques().imagesCalculees,1);
  p.detruire();assert.equal(e.canvas.hidden,true);
 }finally{e.restore()}
});
test("prévisualisation : lecture native, cadence limitée, seeked réactualise l'image",()=>{
 const e=environnement();try{
  const p=VIDEO.creer({...e,intervalMs:200});p.lancer();
  e.video.paused=false;e.video.emettre("play");
  assert.equal(e.callbacks.size,1);
  e.video.frame(1000);assert.equal(e.painted(),2);
  e.video.frame(1050);assert.equal(e.painted(),2);
  e.video.frame(1230);assert.equal(e.painted(),3);
  e.video.paused=true;e.video.emettre("pause");
  assert.equal(e.callbacks.size,0);
  e.video.emettre("seeked");assert.equal(e.painted(),4);
  p.detruire();assert.equal(e.handlers.get("seeked").size,0);
 }finally{e.restore()}
});
test("prévisualisation : arrête sans écraser ou exporter un média",()=>{
 const e=environnement();try{
  const p=VIDEO.creer(e);
  e.video.readyState=1;
  assert.equal(p.rendre(),null);
  assert.equal(e.painted(),0);
  e.video.readyState=2;p.lancer();p.detruire();p.detruire();
  assert.equal(p.statistiques().actif,false);assert.equal(e.canvas.hidden,true);
  assert.equal(p.lancer(),false);
 }finally{e.restore()}
});
test("prévisualisation : refuse les dépendances absentes",()=>{
 assert.throws(()=>VIDEO.creer({}),/requis/);
});
