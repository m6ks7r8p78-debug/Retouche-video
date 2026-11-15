/* NOVA 0.20 — audit étroit SPS/VUI HEVC avant une conversion SDR.
 * Lit hvcC / SPS : dimensions recadrées, profondeur, chroma, primaires,
 * transfert, matrice et video_full_range_flag. Ne décode aucune image.
 * Chaque section syntaxique hors domaine est REFUSÉE, pas devinée.
 * Structure de référence : ITU-T H.265 (SPS/VUI), FFmpeg cbs_h265.
 */
var NOVA_HEVC_VUI=(()=>{
"use strict";
const fail=s=>{throw new Error("HEVC SPS/VUI : "+s)};
function rbsp(nal){
 if(!(nal instanceof Uint8Array)||nal.length<6||nal.length>65536||
    nal[0]&128||((nal[0]>>1)&63)!==33||
    (((nal[0]&1)<<5)|(nal[1]>>3))!==0||(nal[1]&7)===0)
  fail("NAL SPS HEVC invalide ou multicouche");
 const bytes=[];let zeros=0;
 for(let i=2;i<nal.length;i++){
  const value=nal[i];
  if(zeros>=2&&value===3){
   if(i+1>=nal.length||nal[i+1]>3)fail("octet d'émulation SPS invalide");
   zeros=0;continue;
  }
  bytes.push(value);
  zeros=value===0?zeros+1:0;
 }
 return new Uint8Array(bytes);
}
function reader(bytes){
 let pos=0;
 function bits(n){
  if(!Number.isInteger(n)||n<0||n>64||pos+n>bytes.length*8)
   fail("SPS tronqué ou lecture hors limites");
  let value=0;
  for(let i=0;i<n;i++,pos++)
   value=value*2+((bytes[pos>>3]>>(7-(pos&7)))&1);
  if(!Number.isSafeInteger(value))fail("valeur SPS non sûre");
  return value;
 }
 function ue(max=1000000){
  let leading=0;
  while(bits(1)===0){if(++leading>24)fail("Exp-Golomb SPS excessif")}
  const value=(2**leading-1)+(leading?bits(leading):0);
  if(value>max)fail("champ Exp-Golomb SPS hors bornes");
  return value;
 }
 function se(maxAbs=1000000){
  const v=ue(maxAbs*2),n=v%2?(v+1)/2:-(v/2);
  if(Math.abs(n)>maxAbs)fail("champ signé SPS hors bornes");
  return n;
 }
 return {bits,ue,se,get pos(){return pos}};
}
function scalingList(b){
 for(let size=0;size<4;size++)
  for(let matrix=0;matrix<6;matrix+=(size===3?3:1)){
   if(!b.bits(1))b.ue(5);
   else{
    if(size>1)b.se(255);
    for(let j=0;j<Math.min(64,1<<(4+2*size));j++)b.se(128);
   }
  }
}
function profileTierLevel(b,maxSub){
 for(let i=0;i<3;i++)b.bits(32); // 96 bits general PTL par champs bornés
 const profile=[],level=[];
 for(let i=0;i<maxSub;i++){profile.push(b.bits(1));level.push(b.bits(1))}
 if(maxSub>0)b.bits((8-maxSub)*2);
 for(let i=0;i<maxSub;i++){
  if(profile[i]){b.bits(32);b.bits(32);b.bits(24)}
  if(level[i])b.bits(8);
 }
}
function refPicSets(b,count){
 const seen=[];
 for(let i=0;i<count;i++){
  const predicted=i>0&&!!b.bits(1);
  if(predicted){
   const prev=seen[i-1];
   b.bits(1);b.ue(32767); // delta_rps_sign, abs_delta_rps_minus1
   let included=0;
   for(let j=0;j<=prev;j++){
    const used=b.bits(1);
    const useDelta=used?1:b.bits(1);
    if(useDelta)included++;
   }
   if(included>16)fail("références prédictives trop nombreuses");
   seen.push(included);
  }else{
   const neg=b.ue(15),pos=b.ue(15-neg);
   for(let j=0;j<neg+pos;j++){b.ue(32767);b.bits(1)}
   seen.push(neg+pos);
  }
 }
}
function lireSPS(nal){
 const b=reader(rbsp(nal));
 b.bits(4);
 const sub=b.bits(3);
 if(sub>6)fail("trop de sous-couches SPS");
 b.bits(1);profileTierLevel(b,sub);
 b.ue(15); // sps_seq_parameter_set_id
 const chroma=b.ue(3);
 if(chroma===3)b.bits(1); // separate_colour_plane_flag
 const picWidth=b.ue(65535),picHeight=b.ue(65535);
 const crop=b.bits(1)?[b.ue(65535),b.ue(65535),b.ue(65535),b.ue(65535)]:[0,0,0,0];
 const lumaBits=8+b.ue(8),chromaBits=8+b.ue(8);
 const log2Poc=4+b.ue(12);
 const ordering=b.bits(1);
 for(let i=ordering?0:sub;i<=sub;i++){b.ue(16);b.ue(16);b.ue(100000)}
 for(let i=0;i<6;i++)b.ue(32); // coding/transform sizes, hierarchy
 if(b.bits(1)&&b.bits(1))scalingList(b);
 b.bits(1);b.bits(1); // amp_enabled_flag, sample_adaptive_offset_enabled_flag
 if(b.bits(1)){b.bits(8);b.ue(16);b.ue(16);b.bits(1)}
 refPicSets(b,b.ue(64));
 if(b.bits(1)){
  const n=b.ue(32);
  for(let j=0;j<n;j++){b.bits(log2Poc);b.bits(1)}
 }
 b.bits(1);b.bits(1); // temporal_mvp_enabled, strong_intra_smoothing
 if(!b.bits(1))fail("VUI absent dans le SPS");
 if(b.bits(1)){const aspect=b.bits(8);if(aspect===255)b.bits(32)}
 if(b.bits(1))b.bits(1); // overscan_info_present
 if(!b.bits(1))fail("video_signal_type absent du VUI");
 const videoFormat=b.bits(3),fullRange=!!b.bits(1);
 if(!b.bits(1))fail("couleur VUI non explicitée");
 const primaries=b.bits(8),transfer=b.bits(8),matrix=b.bits(8);
 const cropX=chroma===1||chroma===2?2:1;
 const cropY=chroma===1?2:1;
 const width=picWidth-(crop[0]+crop[1])*cropX;
 const height=picHeight-(crop[2]+crop[3])*cropY;
 if(width<2||height<2)fail("recadrage SPS impossible");
 return Object.freeze({width,height,encodedWidth:picWidth,encodedHeight:picHeight,
  chroma,lumaBits,chromaBits,videoFormat,fullRange,primaries,transfer,matrix,
  syntax:"HEVC SPS VUI"});
}
function analyser(info){
 if(!info||!/^(hvc1|hev1)\./.test(info.codec||"")||
    !globalThis.NOVA_HEVC_ANNEXB?.configuration)
  fail("codec ou module hvcC manquant");
 const cfg=NOVA_HEVC_ANNEXB.configuration(info.desc);
 const sps=cfg.parameterSets.filter(x=>((x[0]>>1)&63)===33);
 if(!sps.length||sps.length>8)fail("quantité de SPS invalide");
 const results=sps.map(lireSPS),first=results[0];
 if(results.some(r=>JSON.stringify(r)!==JSON.stringify(first)))
  fail("SPS HEVC multiples avec couleurs ou tailles différentes");
 const colr=info.color;
 if(!colr||!["nclc","nclx"].includes(colr.kind))
  fail("colr MOV de type inconnu ou absent");
 if(first.width!==info.W||first.height!==info.H)
  fail("dimensions entre SPS et MOV divergentes");
 if(first.chroma!==1||first.lumaBits!==8||first.chromaBits!==8)
  fail("seul HEVC 8 bits 4:2:0 est pris en charge");
 if(first.primaries!==colr.primaries||first.transfer!==colr.transfer||
    first.matrix!==colr.matrix||
    (colr.kind==="nclx"&&first.fullRange!==colr.fullRange))
  fail("métadonnées colr MOV et VUI HEVC contradictoires");
 if(first.primaries!==1||first.transfer!==1||first.matrix!==1||
    first.fullRange)fail("BT.709 SDR plage limitée requis ; HDR/P3/full-range refusés");
 return Object.freeze({...first,colrKind:colr.kind,verified:true});
}
return Object.freeze({rbsp,lireSPS,analyser});
})();
if(typeof module!=="undefined"&&module.exports)module.exports=NOVA_HEVC_VUI;
