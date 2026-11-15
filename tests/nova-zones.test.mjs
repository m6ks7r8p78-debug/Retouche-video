import test from "node:test";
import assert from "node:assert/strict";
import NOVA from "../experiences/nova-decision.js";
import ZONES from "../experiences/nova-zones.js";

function synth(w=256,h=128,dark=35,light=190){
 const pixels=new Uint8ClampedArray(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=(y*w+x)*4,v=x<w/2?dark+(x%16)*2:light+(x%16)*2;
  pixels[i]=v;pixels[i+1]=v;pixels[i+2]=v;pixels[i+3]=255;
 }
 return {width:w,height:h,data:pixels};
}
const run=(im,size=128)=>ZONES.restituer(im,{size,arbitre:NOVA});
const pixel=(im,x,y)=>im.data[(y*im.width+x)*4];
test("Mosaïque : éclaircit certaines ombres sans modifier les hautes lumières",()=>{
 const img=synth(),copy=img.data.slice(),res=run(img);
 assert.equal(res.bilan.modifiees,1);
 assert.equal(res.bilan.conservees,1);
 assert.ok(pixel(res,12,64)>pixel(img,12,64));
 assert.equal(pixel(res,245,64),pixel(img,245,64));
 assert.deepEqual(img.data,copy,"les pixels source ne sont jamais modifiés");
 assert.equal(res.data.length,img.data.length);
});
test("Mosaïque : conservation exacte d'une image déjà lumineuse",()=>{
 const img=synth(300,200,183,193),res=run(img);
 assert.equal(res.bilan.modifiees,0);
 assert.deepEqual(res.data,img.data);
});
test("Mosaïque : aucune modification quand l'arbitre refuse tous les candidats",()=>{
 const img=synth(),res=ZONES.restituer(img,{
  size:128,arbitre:{arbitrer:()=>({choisi:"original",candidats:[{alertes:["Refus"]}]})}
 });
 assert.deepEqual(res.data,img.data);
 assert.equal(res.bilan.modifiees,0);
});
test("Mosaïque : les raccords de tuiles n'introduisent pas de saut brutal",()=>{
 const img=synth(),res=run(img);
 const delta=(x)=>pixel(res,x,64)-pixel(img,x,64);
 assert.ok(Math.abs(delta(127)-delta(128))<=3);
 assert.ok(Math.abs(delta(126)-delta(127))<=3);
});
test("Mosaïque : dimensions impaires, cases partielles, alpha conservé",()=>{
 const img=synth(301,199,30,180);
 for(let x=0;x<img.width;x++)img.data[x*4+3]=0;
 const r=run(img,64);
 assert.equal(r.data.length,img.data.length);
 assert.equal(r.zones.length,Math.ceil(301/64)*Math.ceil(199/64));
 for(let x=0;x<img.width;x++)assert.equal(r.data[x*4+3],0);
 assert.ok(r.zones.every(z=>z.x+z.width<=301&&z.y+z.height<=199));
});
test("Mosaïque : entrée invalide et réglages hors plage sont rejetés",()=>{
 assert.throws(()=>run({width:2,height:2,data:new Uint8Array(4)}),/invalide/);
 assert.throws(()=>run(synth(),4),/Tuile/);
 assert.throws(()=>ZONES.restituer(synth(),{size:128}),/Arbitre/);
});
test("Mosaïque : résultat reproductible, pas d'état global caché",()=>{
 const img=synth(256,128,32,210),a=run(img),b=run(img);
 assert.deepEqual(a.data,b.data);assert.deepEqual(a.zones,b.zones);
});
