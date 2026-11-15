import test from "node:test";
import assert from "node:assert/strict";
import EXPORT from "../experiences/nova-export.js";
const ordinary={duration:2.4,width:320,height:180,bytes:80_000};
test("NOVA MP4 : calcul réel des dimensions et des trames",()=>{
 const p=EXPORT.plan(ordinary);
 assert.equal(p.width,320);assert.equal(p.height,180);
 assert.equal(p.frames,36);assert.equal(p.fps,15);
 assert.equal(p.audio,"conserver ou refuser");
});
test("NOVA MP4 : limite physique de résolution, ratio et dimensions paires",()=>{
 const p=EXPORT.plan({duration:8,width:1920,height:1080,bytes:12_000_000});
 assert.equal(p.width,640);assert.equal(p.height,360);
 const portrait=EXPORT.plan({duration:3,width:719,height:1279,bytes:500_000});
 assert.ok(Math.max(portrait.width,portrait.height)<=640);
 assert.equal(portrait.width%2,0);assert.equal(portrait.height%2,0);
 assert.ok(portrait.height>portrait.width);
});
test("NOVA MP4 : durée, fichier et cadence encadrés",()=>{
 assert.throws(()=>EXPORT.plan({...ordinary,duration:12.1}),/12 secondes/);
 assert.throws(()=>EXPORT.plan({...ordinary,duration:-1}),/12 secondes/);
 assert.throws(()=>EXPORT.plan({...ordinary,bytes:61*1024*1024}),/60 Mo/);
 assert.throws(()=>EXPORT.plan({...ordinary,fps:30}),/15 images/);
 assert.throws(()=>EXPORT.plan({...ordinary,maxSide:900}),/640 px/);
 assert.throws(()=>EXPORT.plan({...ordinary,width:0}),/invalides/);
});
test("NOVA MP4 : exige un vrai fichier et les deux moteurs",async()=>{
 await assert.rejects(EXPORT.exporter(),/Fichier et moteurs/);
 await assert.rejects(EXPORT.exporter({file:{arrayBuffer(){}},moteur:{restituer(){}},arbitre:{arbitrer(){}}}),/WebCodecs/);
});
