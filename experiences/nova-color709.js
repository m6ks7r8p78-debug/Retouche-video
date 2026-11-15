/* NOVA 0.20 — conversion RGBA sRGB Canvas -> Y'CbCr I420 BT.709 limité.
 * Ne remplace PAS la restauration. Source : ITU-R BT.709 + sRGB IEC 61966-2-1.
 * Le Canvas 2D est sRGB ; l'encodeur WebCodecs ne doit pas l'étiqueter
 * mensongèrement comme une image YUV BT.709 limitée.
 * Conversion gamma sRGB -> linéaire -> OETF BT.709 avant sous-échantillonnage
 * 4:2:0. Plage légale Y [16,235], CbCr [16,240], 8 bits, sans alpha.
 */
var NOVA_COLOR709=(()=>{
"use strict";
const fail=s=>{throw new Error("NOVA BT.709 : "+s)};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const rgb709=Object.freeze(Array.from({length:256},(_,i)=>{
 const c=i/255,linear=c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4;
 return linear<0.018?4.5*linear:1.099*linear**0.45-0.099;
}));
function convertir(data,w,h,profile="standard"){
 const pixelLimit=profile==="h264-hd720-opfs-6s"?1280*720:640*360;
 if(!(data instanceof Uint8ClampedArray||data instanceof Uint8Array)||
    !Number.isInteger(w)||!Number.isInteger(h)||w<2||h<2||
    w%2||h%2||w*h>pixelLimit||data.length!==w*h*4)
  fail("RGBA 8 bits, dimensions paires et budget du profil couleur dépassé");
 const n=w*h,nChroma=n/4,out=new Uint8Array(n+nChroma*2);
 let cbPos=n,crPos=n+nChroma;
 for(let row=0;row<h;row+=2)for(let col=0;col<w;col+=2){
  let cb=0,cr=0;
  for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++){
   const index=(row+dy)*w+col+dx,base=index*4;
   if(data[base+3]!==255)fail("alpha non opaque : couleurs indéfinies");
   const r=rgb709[data[base]],g=rgb709[data[base+1]],b=rgb709[data[base+2]];
   const y=0.2126*r+0.7152*g+0.0722*b;
   out[index]=clamp(Math.round(16+219*y),16,235);
   cb+=(b-y)/1.8556;
   cr+=(r-y)/1.5748;
  }
  out[cbPos++]=clamp(Math.round(128+224*cb/4),16,240);
  out[crPos++]=clamp(Math.round(128+224*cr/4),16,240);
 }
 return out;
}
function videoFrame(data,w,h,timestamp,duration,profile="standard"){
 if(typeof VideoFrame!=="function")fail("VideoFrame absent sur cet appareil");
 if(!Number.isSafeInteger(timestamp)||!Number.isSafeInteger(duration)||duration<1)
  fail("horodatage CFR invalide");
 const bytes=convertir(data,w,h,profile);
 const frame=new VideoFrame(bytes,{
  format:"I420",codedWidth:w,codedHeight:h,timestamp,duration,
  colorSpace:{primaries:"bt709",transfer:"bt709",matrix:"bt709",fullRange:false}
 });
 if(frame.format!=="I420"||frame.codedWidth!==w||frame.codedHeight!==h||
    frame.colorSpace?.primaries!=="bt709"||
    frame.colorSpace?.transfer!=="bt709"||
    frame.colorSpace?.matrix!=="bt709"||
    frame.colorSpace?.fullRange!==false){
  frame.close();fail("VideoFrame I420 BT.709 limité non réellement reconnu");
 }
 return frame;
}
return Object.freeze({convertir,videoFrame});
})();
if(typeof module!=="undefined"&&module.exports)module.exports=NOVA_COLOR709;
