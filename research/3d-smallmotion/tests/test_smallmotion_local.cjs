const assert = require('node:assert/strict');
const {analyze} = require('../smallmotion-local.js');
const W=160,H=120;
function make(seed=0,{shift=1,object=false,blank=false,flash=false}={}){
 let state=seed+1;
 function rand(){state=(Math.imul(state,1664525)+1013904223)>>>0;return state>>>24;}
 const base=new Uint8Array(W*H);for(let i=0;i<base.length;i++)base[i]=blank?80:rand();
 const objectPixels=new Uint8Array(24*20);for(let i=0;i<objectPixels.length;i++)objectPixels[i]=rand();
 const images=[];
 for(let frame=0;frame<2;frame++){
  const data=new Uint8ClampedArray(W*H*4);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
   const xx=(x-frame*shift+W)%W;let v=base[y*W+xx];
   const ox=x-66,oy=y-(45+frame*(object?4:0));
   if(object && ox>=0&&ox<24&&oy>=0&&oy<20)v=objectPixels[oy*24+ox];
   if(flash&&frame===1)v=Math.max(0,v-90);
   const k=4*(y*W+x);data[k]=data[k+1]=data[k+2]=v;data[k+3]=255;
  }
  images.push({width:W,height:H,data});
 }
 return images;
}
const run=(label,a,b,allowed)=>{const res=analyze(a,b);console.log(label,res.status,res.candidates.length,res.matched||0);assert.ok(allowed.includes(res.status),label+' '+JSON.stringify(res));return res};
for(const seed of [1,5,10]){
 const [a,b]=make(seed,{object:true,shift:1});run('moving',a,b,['local_motion_candidate']);
 const [s,t]=make(seed,{shift:1});run('static',s,t,['no_supported_local_motion']);
}
{
 const [a,b]=make(1,{blank:true});run('blank',a,b,['abstain_texture']);
 const [s,t]=make(1,{flash:true});run('flash',s,t,['abstain_cut_or_flash','abstain_matches']);
 const [aa,bb]=make(1);assert.throws(()=>analyze(aa,{...bb,width:159}));
}
console.log('Tests navigateur JavaScript local : OK');