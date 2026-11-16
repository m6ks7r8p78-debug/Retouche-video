import test from "node:test";
import assert from "node:assert/strict";
import ZONES from "../experiences/nova-zones.js";

// Synthetic RGBA pixels: no photos, no clips, no browser needed.
const W=128,H=128;
function sample(){
 const data=new Uint8ClampedArray(W*H*4);
 for(let i=0;i<data.length;i+=4){data[i]=35;data[i+1]=32;data[i+2]=30;data[i+3]=255;}
 function patch(x,y,r,g,b){
  for(let yy=y;yy<y+8;yy++)for(let xx=x;xx<x+8;xx++){
   const i=(yy*W+xx)*4;data.set([r,g,b,255],i);
  }
 }
 patch(16,16,210,190,170); // luminous skin-colored patch, Y~.75
 patch(32,16,252,252,250); // highlights (already close to clipping)
 patch(48,16,245,125,85); // bright red channel on mixed-midtone tile
 patch(64,16,195,160,140); // brighter midtone
 patch(80,16,18,18,19);   // very dark local detail
 return {width:W,height:H,data};
}
const arbiter={arbitrer(){return {choisi:"ombres",candidats:[{alertes:[]}]}}};
const pixel=(data,x,y)=>Array.from(data.slice((y*W+x)*4,(y*W+x)*4+4));
const brightCount=data=>{
 let n=0;
 for(let i=0;i<data.length;i+=4)
  if(.2126*data[i]+.7152*data[i+1]+.0722*data[i+2]>=235)n++;
 return n;
};
test("NOVA naturel: relève réellement les zones sombres, sans effacer les détails",()=>{
 const img=sample(),res=ZONES.restituer(img,{size:128,arbitre:arbiter});
 assert.equal(res.bilan.intervention,true);
 const before=pixel(img.data,1,1),after=pixel(res.data,1,1);
 assert.ok(after[0]>before[0],`ombres non levées: ${before} -> ${after}`);
 assert.deepEqual(pixel(res.data,81,17).slice(3),[255]);
 assert.ok(pixel(res.data,81,17)[0]>=pixel(img.data,81,17)[0]);
 // Aucune mutation de la source sur place.
 assert.deepEqual(pixel(img.data,1,1),[35,32,30,255]);
});
test("NOVA naturel: protège les zones claires et les reflets contre une nouvelle surexposition",()=>{
 const img=sample(),res=ZONES.restituer(img,{size:128,arbitre:arbiter});
 for(const [x,y] of [[17,17],[33,17]])
  assert.deepEqual(pixel(res.data,x,y),pixel(img.data,x,y),
   `Éclat déjà lumineux à préserver en ${x},${y}`);
 assert.equal(pixel(res.data,49,17)[0],245,
  "Le canal rouge clair ne doit pas être augmenté dans une zone sombre");
 assert.ok(brightCount(res.data)<=brightCount(img.data),
  "Aucune création de nouveaux pixels surexposés à partir de zones sombres");
});
test("NOVA naturel: une image claire sans zone sombre éligible est bit-identique",()=>{
 const img=sample();for(let i=0;i<img.data.length;i+=4)
  img.data.set([218,204,193,255],i);
 const r=ZONES.restituer(img,{size:128,arbitre:arbiter});
 assert.equal(r.bilan.intervention,false);
 assert.deepEqual(r.data,img.data);
});
