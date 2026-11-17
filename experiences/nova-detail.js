/* Netteté SDR expérimentale : accentuation bornée, pas super-résolution. */
var NOVA_DETAIL=(()=>{
'use strict';
function appliquer(img,{enabled=false}={}){
 const w=img?.width,h=img?.height,src=img?.data;
 if(!Number.isSafeInteger(w)||!Number.isSafeInteger(h)||w<1||h<1||
    w*h>1088*1920||!src||src.length!==w*h*4)
  throw Error('NOVA netteté : image invalide');
 const report={enabled:!!enabled,method:'bounded-luma-unsharp-v1',changedPixels:0,
  maxChannelDelta:0,resolutionIncreased:false,reconstructedDetails:false};
 if(!enabled)return {data:src,report};
 const lum=new Float32Array(w*h),out=new Uint8ClampedArray(src);
 for(let i=0;i<lum.length;i++){
  const k=i*4;if(src[k+3]!==255)throw Error('NOVA netteté : alpha non opaque');
  lum[i]=.2126*src[k]+.7152*src[k+1]+.0722*src[k+2];
 }
 for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
  const i=y*w+x,k=i*4,L=lum[i];
  if(L<24||L>224)continue; // ombres profondes / hautes lumières protégées
  const a=lum[i-1],b=lum[i+1],c=lum[i-w],d=lum[i+w];
  const lo=Math.min(L,a,b,c,d),hi=Math.max(L,a,b,c,d);
  // Ne pas renforcer les petites fluctuations ni les pixels isolés.
  if(hi-lo<12)continue;
  const residual=L-(a+b+c+d)/4;
  if(Math.abs(residual)<=2.5)continue;
  const positive=residual>0;
  const support=positive?Number(a<L-2.5)+Number(b<L-2.5)+Number(c<L-2.5)+Number(d<L-2.5):
   Number(a>L+2.5)+Number(b>L+2.5)+Number(c>L+2.5)+Number(d>L+2.5);
  if(support<1||support>2)continue;
  let delta=Math.sign(residual)*Math.min(3,(Math.abs(residual)-2.5)*.5);
  delta=Math.max(lo-L,Math.min(hi-L,delta));
  // Même variation pour R,G,B : différences de canaux préservées.
  delta=Math.round(Math.max(-Math.min(src[k],src[k+1],src[k+2]),
    Math.min(255-Math.max(src[k],src[k+1],src[k+2]),delta)));
  if(!delta)continue;
  out[k]=src[k]+delta;out[k+1]=src[k+1]+delta;out[k+2]=src[k+2]+delta;
  report.changedPixels++;report.maxChannelDelta=Math.max(report.maxChannelDelta,Math.abs(delta));
 }
 return {data:out,report};
}
return Object.freeze({appliquer});
})();
if(typeof module!=='undefined'&&module.exports)module.exports=NOVA_DETAIL;
