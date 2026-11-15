/* NOVA HD 0.28 : preuve couleur progressive HEVC, sans préjuger du colr.
 * Un MOV iPhone peut omettre/laisser "unspecified" dans colr tout en ayant
 * un SPS/VUI et/ou des VideoFrame SDR 709 explicitement signalés.
 * Les couleurs HDR/P3 reconnues ne doivent PAS être renommées BT.709.
 */
var NOVA_HD_COLOR=(()=>{
"use strict";
const err=s=>{throw new Error("NOVA HD couleur : "+s)};
const recognized=x=>x?.kind==="nclc"||x?.kind==="nclx";
const known=x=>Number.isInteger(x)&&x!==0&&x!==2;
const SDR_XFER=new Set([1,13]);
const VIDEO_XFER=new Set(["bt709","iec61966-2-1"]);
function hvcSps(info){
 if(!/^(hvc1|hev1)\./.test(info?.codec||""))return null;
 if(!globalThis.NOVA_HEVC_ANNEXB?.configuration||
    !globalThis.NOVA_HEVC_VUI?.lireSPS)return null;
 try{
  const config=NOVA_HEVC_ANNEXB.configuration(info.desc);
  const nals=config.parameterSets.filter(n=>((n[0]>>1)&63)===33);
  if(!nals.length||nals.length>8)return null;
  const all=nals.map(NOVA_HEVC_VUI.lireSPS),ref=all[0];
  if(all.some(x=>JSON.stringify(x)!==JSON.stringify(ref)))
   err("SPS multiples contradictoires");
  if(ref.width!==info.W||ref.height!==info.H)
   err("dimensions SPS et MOV contradictoires");
  if(ref.chroma!==1||ref.lumaBits!==8||ref.chromaBits!==8)
   err("HEVC hors 8 bits 4:2:0 : conversion non certifiée");
  return ref;
 }catch(e){
  if(String(e?.message||"").startsWith("NOVA HD couleur :"))throw e;
  return null; // Pas de preuve SPS exploitable ; le décodeur reste un recours.
 }
}
function metadata(info){
 if(!info||!Number.isSafeInteger(info.W)||!Number.isSafeInteger(info.H))
  err("métadonnées MP4 invalides");
 if(info.pixelAspect&&info.pixelAspect.h!==info.pixelAspect.v)
  err("pixels anamorphiques : géométrie non conservable");
 const c=info.color,s=hvcSps(info);
 if(c&&!recognized(c))err("profil colr ICC/inconnu non certifiable");
 const colors=[c,s].filter(Boolean);
 for(const x of colors){
  if(known(x.primaries)&&x.primaries!==1)
   err("gamut HDR/P3/BT2020 explicitement identifié, conversion SDR non autorisée");
  if(known(x.transfer)&&!SDR_XFER.has(x.transfer))
   err("transfert HDR/PQ/HLG explicitement identifié, conversion SDR non autorisée");
  if(known(x.matrix)&&x.matrix!==1)
   err("matrice couleur incompatible BT.709");
  // La plage entière n'est pas du HDR. Une fois confirmée par le
  // décodeur, Canvas sRGB -> I420 limité réalise une conversion de plage.
 }
 // Ne jamais ignorer deux identifications connues et contradictoires.
 if(c&&s)for(const k of ["primaries","transfer","matrix"]){
  if(known(c[k])&&known(s[k])&&c[k]!==s[k]&&
     !(k==="transfer"&&SDR_XFER.has(c[k])&&SDR_XFER.has(s[k])))
   err("colr MOV et SPS/VUI contradictoires");
 }
 if(c&&s&&c.fullRange!==null&&c.fullRange!==undefined&&
    c.fullRange!==s.fullRange)err("plage entre colr et SPS/VUI contradictoire");
 const explicit=x=>!!x&&x.primaries===1&&SDR_XFER.has(x.transfer)&&
    x.matrix===1&&typeof x.fullRange==="boolean";
 const confirmed=explicit(s)||explicit(c);
 const kind=explicit(s)?"hevc-sps-vui-bt709":
  explicit(c)?"mp4-colr-bt709":"pending-decoded-frame";
 return Object.freeze({kind,confirmed,needsFrameCheck:true,
  colrPresent:!!c,spsVerified:explicit(s),sourceTransfer:
   s?.transfer===13||c?.transfer===13?"srgb":"bt709-or-unspecified",
  sourceFullRange:typeof s?.fullRange==="boolean"?s.fullRange:
   typeof c?.fullRange==="boolean"?c.fullRange:null});
}
function verifyFrame(frame,evidence){
 if(!frame||!evidence)err("image native ou preuve couleur absente");
 const cs=frame.colorSpace||{},p=cs.primaries,t=cs.transfer,
  matrix=cs.matrix,range=cs.fullRange;
 if(p!==null&&p!==undefined&&p!=="bt709")err("trame décodée gamut incompatible : "+String(p));
 if(t!==null&&t!==undefined&&!VIDEO_XFER.has(t))
  err("trame décodée HDR ou transfert incompatible : "+String(t));
 if(matrix!==null&&matrix!==undefined&&matrix!=="bt709")
  err("trame décodée matrice incompatible : "+String(matrix));
 if(typeof range==="boolean"&&typeof evidence.sourceFullRange==="boolean"&&
    range!==evidence.sourceFullRange)
  err("plage déclarée et décodée contradictoires");
 const full=p==="bt709"&&VIDEO_XFER.has(t)&&matrix==="bt709"&&
  typeof range==="boolean";
 if(!full&&!evidence.confirmed)
  err("couleur insuffisamment signalée par colr, SPS et VideoFrame");
 // Si la source est en plage complète, exigence de preuve vidéo : ne pas
 // prétendre que le décodeur l'a correctement traitée sans indication.
 if(evidence.sourceFullRange===true&&range!==true)
  err("plage complète source non vérifiable après décodage");
 return Object.freeze({method:full?
    (range?"decoded-frame-sdr-full-to-limited":"decoded-frame-bt709"):
    evidence.kind,
  spsVerified:evidence.spsVerified,frameFullyTagged:full,
  sourceTransfer:evidence.sourceTransfer,
  rangeConversion:range===true});
}
function report(info){
 const c=recognized(info?.color)?info.color:null;
 const fields=x=>x?{primaries:Number.isInteger(x.primaries)?x.primaries:null,
   transfer:Number.isInteger(x.transfer)?x.transfer:null,
   matrix:Number.isInteger(x.matrix)?x.matrix:null,
   fullRange:typeof x.fullRange==="boolean"?x.fullRange:null}:null;
 let evidence=null,warning=null;
 try{evidence=metadata(info)}
 catch(e){warning=String(e?.message||"").slice(0,180)}
 return Object.freeze({
  schema:"retoucheproai.nova.hd-color.v1",
  colr:fields(c),hevcSpsPresent:!!(()=>{try{return hvcSps(info)}catch{return null}})(),
  evidence:evidence?.kind??null,sourceTransfer:evidence?.sourceTransfer??null,
  warning,
  explanation:"Informations techniques locales seulement. L'absence de colr ne prouve ni SDR ni HDR. Aucun média transmis."
 });
}
return Object.freeze({metadata,verifyFrame,report});
})();
if(typeof module!=="undefined"&&module.exports)module.exports=NOVA_HD_COLOR;
