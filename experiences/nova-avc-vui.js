/* NOVA — vérification conservative de l'information couleur H.264 SPS/VUI.
 * Lecture des octets avcC/SPS DÉJÀ extraits, sans média, décodage ni réseau.
 * Comprend profils 8 bits 4:2:0 Baseline/Main/High sans extensions inconnues.
 * Une VUI absente, tronquée ou contradictoire ne valide JAMAIS BT.709.
 */
var NOVA_AVC_VUI=(()=>{
"use strict";
const fail=()=>{throw new Error("SPS/VUI H.264 non vérifiable")};
const safe=n=>Number.isSafeInteger(n)&&n>=0;
function rbsp(nal){
 if(!(nal instanceof Uint8Array)||nal.length<5||nal.length>65535||
    (nal[0]&0x80)!==0||(nal[0]&31)!==7)fail();
 const out=[],len=nal.length;let zeros=0;
 for(let i=1;i<len;i++){
  const v=nal[i];
  if(zeros>=2&&v===3){
   if(i+1>=len||nal[i+1]>3)fail();
   zeros=0;continue;
  }
  out.push(v);zeros=v===0?zeros+1:0;
 }
 return new Uint8Array(out);
}
function reader(bytes){
 let p=0;
 function bits(n){
  if(!safe(n)||n>32||p+n>bytes.length*8)fail();
  let v=0;for(let i=0;i<n;i++,p++)v=v*2+((bytes[p>>3]>>(7-(p&7)))&1);
  if(!safe(v))fail();return v;
 }
 function ue(limit=1000000){
  let leading=0;
  while(bits(1)===0){if(++leading>24)fail()}
  const value=(2**leading-1)+(leading?bits(leading):0);
  if(!safe(value)||value>limit)fail();return value;
 }
 function se(limit=1000000){
  const v=ue(limit*2),s=(v&1)?((v+1)/2):-(v/2);
  if(Math.abs(s)>limit)fail();return s;
 }
 return {bits,ue,se};
}
function scalingList(b,size){
 let last=8,next=8;
 for(let i=0;i<size;i++){
  if(next!==0){const delta=b.se(255);next=(last+delta+256)%256}
  last=next===0?last:next;
 }
}
function parseSPS(nal){
 const b=reader(rbsp(nal)),profile=b.bits(8),constraint=b.bits(8),level=b.bits(8);
 b.ue(31); // seq_parameter_set_id
 let chroma=1,depthY=8,depthC=8;
 if([100,110,122,244,44,83,86,118,128,138,139,134,135].includes(profile)){
  chroma=b.ue(3);
  if(chroma===3)b.bits(1);
  depthY=8+b.ue(8);depthC=8+b.ue(8);
  b.bits(1);
  if(b.bits(1)){
   const count=chroma===3?12:8;
   for(let i=0;i<count;i++)if(b.bits(1))scalingList(b,i<6?16:64);
  }
 }else if(![66,77,88].includes(profile))fail();
 if(chroma!==1||depthY!==8||depthC!==8)fail();
 b.ue(12); // log2_max_frame_num_minus4
 const poc=b.ue(2);
 if(poc===0)b.ue(12);
 else if(poc===1){
  b.bits(1);b.se();b.se();
  const cycles=b.ue(255);for(let i=0;i<cycles;i++)b.se();
 }
 b.ue(255);b.bits(1); // max_num_ref_frames, gaps flag
 const mbsW=b.ue(8191)+1,mbsH=b.ue(8191)+1;
 const frameOnly=b.bits(1);
 if(!frameOnly)b.bits(1);
 b.bits(1);
 const crop=b.bits(1)?[b.ue(65535),b.ue(65535),b.ue(65535),b.ue(65535)]:[0,0,0,0];
 const width=mbsW*16-(crop[0]+crop[1])*2;
 const height=mbsH*16*(2-frameOnly)-(crop[2]+crop[3])*2*(2-frameOnly);
 if(width<2||height<2||width*height>8192*8192)fail();
 if(!b.bits(1))fail(); // vui_parameters_present_flag
 if(b.bits(1)){const aspect=b.bits(8);if(aspect===255){b.bits(16);b.bits(16)}}
 if(b.bits(1))b.bits(1);
 if(!b.bits(1))fail(); // video_signal_type_present_flag
 b.bits(3);const fullRange=!!b.bits(1);
 if(!b.bits(1))fail(); // colour_description_present_flag
 const primaries=b.bits(8),transfer=b.bits(8),matrix=b.bits(8);
 if([primaries,transfer,matrix].some(x=>x!==1)||fullRange)fail();
 return Object.freeze({width,height,profile,level,chroma,depthY,depthC,
  fullRange,primaries,transfer,matrix,constraint,verified:true});
}
function analyser(info){
 if(!info||!/^(avc1|avc3)\./.test(info.codec||"")||
    !(info.desc instanceof Uint8Array))fail();
 const bytes=info.desc;
 if(bytes.length<8||bytes.length>65536||bytes[0]!==1)fail();
 const n=bytes[5]&31;if(n<1||n>8)fail();
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 let at=6,first=null;
 for(let i=0;i<n;i++){
  if(at+2>bytes.length)fail();
  const length=v.getUint16(at);at+=2;
  if(length<5||at+length>bytes.length)fail();
  const parsed=parseSPS(bytes.slice(at,at+length));at+=length;
  if(!first)first=parsed;
  else if(["width","height","fullRange","primaries","transfer","matrix","chroma",
            "depthY","depthC"].some(k=>parsed[k]!==first[k]))fail();
 }
 if(!first||first.width!==info.W||first.height!==info.H)fail();
 const colr=info.color;
 // Les champs explicitement non 709 restent bloquants; code 2=unspecified.
 if(colr){
  if(!["nclx","nclc"].includes(colr.kind)||
     ![1,2].includes(colr.primaries)||
     ![1,2].includes(colr.transfer)||
     ![1,2].includes(colr.matrix)||
     colr.fullRange===true)fail();
 }
 return Object.freeze({...first,colrKind:colr?.kind??"absent",
  qualification:"SPS H264 VUI explicite BT.709 limité ; image perceptuelle non testée"});
}
return Object.freeze({analyser,parseSPS});
})();
if(typeof module!=="undefined"&&module.exports)module.exports=NOVA_AVC_VUI;
