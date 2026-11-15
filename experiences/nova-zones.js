/* NOVA MOSAÏQUE v0.2 — restauration classique locale, non générative.
 * Chaque tuile est évaluée avec le même arbitre que le studio.
 * Source jamais modifiée ; interpolation spatiale des forces pour éviter les joints.
 * Aucune détection d'identité ni récupération de vrais pixels perdus.
 */
var NOVA_ZONES=(()=>{
"use strict";
const finite=x=>typeof x==="number"&&Number.isFinite(x);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a),0,1);return t*t*(3-2*t)};
const lum=(d,i)=>(.2126*d[i]+.7152*d[i+1]+.0722*d[i+2])/255;
const val=(v)=>Math.round(v*10000)/10000;
function valider(img){
 if(!img||!Number.isInteger(img.width)||!Number.isInteger(img.height)||img.width<1||img.height<1||
    !img.data||img.data.length!==img.width*img.height*4)throw new TypeError("Image RGBA invalide");
}
function mesures(img,rect,step=2){
 const d=img.data,w=img.width,{x,y,width,height}=rect;
 let sum=0,edge=0,white=0,dark=0,nb=0;
 for(let yy=y;yy<y+height;yy+=step)for(let xx=x;xx<x+width;xx+=step){
  const i=(yy*w+xx)*4;if(d[i+3]<8)continue;
  const l=lum(d,i);sum+=l;white+=(l>.986?1:0);dark+=(l<.22?1:0);
  if(xx+step<x+width)edge+=Math.abs(l-lum(d,i+step*4));
  nb++;
 }
 return {luminance:nb?sum/nb:0,ecretage:nb?white/nb:0,contours:nb?edge/nb:0,
         fractionSombre:nb?dark/nb:0,echantillons:nb};
}
function lever(src,strength,out,index){
 const l=lum(src,index),weight=1-smooth(.32,.82,l);
 for(let ch=0;ch<3;ch++){
  const p=src[index+ch]/255;
  const raised=255*Math.pow(p,.87);
  out[index+ch]=clamp(Math.round(src[index+ch]+(raised-src[index+ch])*strength*weight),0,255);
 }
 out[index+3]=src[index+3];
}
function restituer(image,options={}){
 valider(image);
 const size=Math.round(options.size??128);
 if(!Number.isInteger(size)||size<32||size>512)throw new RangeError("Tuile requise entre 32 et 512 px");
 const arb=options.arbitre;
 if(!arb||typeof arb.arbitrer!=="function")throw new TypeError("Arbitre NOVA requis");
 const w=image.width,h=image.height,cols=Math.ceil(w/size),rows=Math.ceil(h/size),src=image.data;
 const summaries=[],strengths=new Float32Array(cols*rows);
 // 1. Mesurer et évaluer chaque région indépendamment, avec le même protocole.
 for(let iy=0;iy<rows;iy++)for(let ix=0;ix<cols;ix++){
  const x=ix*size,y=iy*size,rect={x,y,width:Math.min(size,w-x),height:Math.min(size,h-y)};
  const m=mesures(image,rect,Math.max(1,Math.floor(size/56)));
  const enough=m.echantillons>=16;
  const eligible=enough&&m.luminance>=.035&&m.luminance<.30&&m.fractionSombre>.18&&m.ecretage<.008;
  const intention=eligible?clamp((.34-m.luminance)*.75,.035,.18):0;
  let finalStrength=0,why=eligible?"En cours de comparaison":"Zone préservée (lumière ou mesures insuffisantes)";
  if(eligible){
   const local=new Uint8ClampedArray(rect.width*rect.height*4);
   for(let ly=0;ly<rect.height;ly++)for(let lx=0;lx<rect.width;lx++){
    const si=((y+ly)*w+x+lx)*4,di=(ly*rect.width+lx)*4;
    for(let ch=0;ch<4;ch++)local[di+ch]=src[si+ch];
    lever(local,intention,local,di);
   }
   const after=mesures({width:rect.width,height:rect.height,data:local},
     {x:0,y:0,width:rect.width,height:rect.height},Math.max(1,Math.floor(size/56)));
   let delta=0,nb=0;
   for(let i=0;i<local.length;i+=12){delta+=Math.abs(local[i]-src[((y+Math.floor(i/4/rect.width))*w+x+(Math.floor(i/4)%rect.width))*4]);nb++}
   const result=arb.arbitrer(m,[{id:"ombres",nom:"Révélation locale des ombres",mesures:after,
     ecart:nb?delta/nb/255:0,confiance:.8,prouvable:true}]);
   const picked=result.choisi==="ombres";
   finalStrength=picked?intention:0;
   why=picked?"Éclaircissement mesurable sous contrôle":result.candidats[0].alertes.join(" ; ");
  }
  strengths[iy*cols+ix]=finalStrength;
  summaries.push({...rect,id:iy*cols+ix,action:finalStrength?"ombres":"original",
    force:val(finalStrength),luminance:val(m.luminance),raison:why});
 }
 // 2. Interpoler les forces des tuiles entre les centres : zéro joint visible.
 const output=new Uint8ClampedArray(src.length);
 // L'export vidéo n'utilise pas la carte de forces ; éviter 4 octets/pixel
 // par image sans changer les pixels calculés ni l'interface photo.
 const contrib=options.includeForces===false?null:new Float32Array(w*h);
 for(let y=0;y<h;y++){
  const ty=y/size-.5,y0=Math.floor(ty),fy=clamp(ty-y0,0,1);
  const r0=clamp(y0,0,rows-1),r1=clamp(y0+1,0,rows-1);
  for(let x=0;x<w;x++){
   const tx=x/size-.5,x0=Math.floor(tx),fx=clamp(tx-x0,0,1);
   const c0=clamp(x0,0,cols-1),c1=clamp(x0+1,0,cols-1);
   const top=strengths[r0*cols+c0]*(1-fx)+strengths[r0*cols+c1]*fx;
   const bot=strengths[r1*cols+c0]*(1-fx)+strengths[r1*cols+c1]*fx;
   const strength=top*(1-fy)+bot*fy,index=(y*w+x)*4;
   if(contrib)contrib[y*w+x]=strength;
   if(strength<.0001){output.set(src.subarray(index,index+4),index);continue}
   lever(src,strength,output,index);
  }
 }
 const modified=summaries.filter(x=>x.action!=="original").length;
 return {width:w,height:h,data:output,zones:summaries,forces:contrib,
   bilan:{total:summaries.length,modifiees:modified,conservees:summaries.length-modified,
          intervention:modified>0,methode:"éclaircissement local non génératif",recherche3D:false,
          evaluation:"indicateurs techniques, pas preuve de réalisme"}};
}
return Object.freeze({restituer,mesures});
})();
if(typeof module!=="undefined"&&module.exports)module.exports=NOVA_ZONES;
