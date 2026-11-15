import test from "node:test";
import assert from "node:assert/strict";
import COLOR from "../experiences/nova-hd-color.js";
const base={codec:"hvc1.1.6.L120",W:1920,H:1088,dw:1088,dh:1920,
 color:{kind:"nclx",primaries:1,transfer:1,matrix:1,fullRange:false}};
const frame=(p="bt709",t="bt709",m="bt709",fullRange=false)=>({
 colorSpace:{primaries:p,transfer:t,matrix:m,fullRange}
});
test("NOVA color: colr BT.709 explicite et trame BT.709 vérifiés",()=>{
 const proof=COLOR.metadata(base);
 assert.equal(proof.confirmed,true);
 assert.equal(proof.kind,"mp4-colr-bt709");
 assert.equal(COLOR.verifyFrame(frame(),proof).method,"decoded-frame-bt709");
});
test("NOVA color: absence de colr = vérification par trame décodée, pas faux HDR",()=>{
 const unknown={...base,color:null};
 const e=COLOR.metadata(unknown);
 assert.equal(e.kind,"pending-decoded-frame");
 assert.equal(e.confirmed,false);
 assert.equal(COLOR.verifyFrame(frame(),e).method,"decoded-frame-bt709");
 assert.throws(()=>COLOR.verifyFrame({colorSpace:{}},e),/insuffisamment signalée/);
 assert.throws(()=>COLOR.verifyFrame(frame("bt2020","pq","bt2020-ncl",false),e),/gamut incompatible/);
});
test("NOVA color: MP4 unspecified et nclc sans plage n'autorisent que frame confirmée",()=>{
 for(const col of [
  {kind:"nclx",primaries:2,transfer:2,matrix:2,fullRange:false},
  {kind:"nclc",primaries:1,transfer:1,matrix:1,fullRange:null}
 ]){
  const e=COLOR.metadata({...base,color:col});
  assert.equal(e.kind,"pending-decoded-frame");
  assert.equal(COLOR.verifyFrame(frame(),e).frameFullyTagged,true);
  assert.throws(()=>COLOR.verifyFrame({colorSpace:{}},e));
 }
});
test("NOVA color: sRGB SDR transfert 13 peut être converti correctement vers BT.709",()=>{
 const e=COLOR.metadata({...base,color:{...base.color,transfer:13}});
 assert.equal(e.sourceTransfer,"srgb");
 assert.equal(e.confirmed,true);
 assert.equal(COLOR.verifyFrame(frame("bt709","iec61966-2-1","bt709",false),e).frameFullyTagged,true);
});
test("NOVA color: P3, BT2020 et PQ/HLG explicitement signalés ne sont jamais rebaptisés SDR",()=>{
 for(const color of [
  {kind:"nclx",primaries:9,transfer:16,matrix:9,fullRange:false},
  {kind:"nclx",primaries:12,transfer:13,matrix:1,fullRange:false},
  {kind:"nclx",primaries:1,transfer:18,matrix:1,fullRange:false},
  {kind:"prof"}
 ])assert.throws(()=>COLOR.metadata({...base,color}));
 const proof=COLOR.metadata(base);
 assert.throws(()=>COLOR.verifyFrame(frame("bt2020","hlg","bt2020-ncl",false),proof));
 assert.throws(()=>COLOR.verifyFrame(frame("bt709","bt709","bt709",true),proof),
  /contradictoires/);
});
test("NOVA color: le SPS/VUI HEVC confirme 709 même en l'absence de colr",()=>{
 const oldA=globalThis.NOVA_HEVC_ANNEXB,oldV=globalThis.NOVA_HEVC_VUI;
 globalThis.NOVA_HEVC_ANNEXB={configuration:()=>({parameterSets:[new Uint8Array([66,1,2])]})};
 globalThis.NOVA_HEVC_VUI={lireSPS:()=>({width:1920,height:1088,
  chroma:1,lumaBits:8,chromaBits:8,primaries:1,transfer:1,matrix:1,fullRange:false})};
 try{
  const e=COLOR.metadata({...base,color:null,desc:new Uint8Array([1])});
  assert.equal(e.kind,"hevc-sps-vui-bt709");
  assert.equal(e.spsVerified,true);
  assert.equal(COLOR.verifyFrame({colorSpace:{}},e).method,"hevc-sps-vui-bt709");
  assert.throws(()=>COLOR.metadata({...base,color:{...base.color,primaries:9}}),/gamut/);
  globalThis.NOVA_HEVC_VUI={lireSPS:()=>({width:1920,height:1088,
   chroma:1,lumaBits:8,chromaBits:8,primaries:9,transfer:16,matrix:9,fullRange:false})};
  assert.throws(()=>COLOR.metadata({...base,color:{...base.color}}),/gamut/);
 }finally{
  if(oldA===undefined)delete globalThis.NOVA_HEVC_ANNEXB;
  else globalThis.NOVA_HEVC_ANNEXB=oldA;
  if(oldV===undefined)delete globalThis.NOVA_HEVC_VUI;
  else globalThis.NOVA_HEVC_VUI=oldV;
 }
});
test("NOVA color: rapport technique est borné, ne sérialise aucun nom ou média",()=>{
 const info={...base,name:"PRIVATE-family.mov",fileName:"PRIVATE-family.mov",rawMedia:"PRIVATE-BYTES"};
 const r=COLOR.report(info),s=JSON.stringify(r);
 assert.equal(r.schema,"retoucheproai.nova.hd-color.v1");
 for(const word of ["PRIVATE","rawMedia","fileName","device","userAgent"]){
  assert.equal(s.includes(word),false,word);
 }
});

test("NOVA color: plage SDR complète réellement décodée convertie en plage limitée, sans la confondre avec HDR",()=>{
 const e=COLOR.metadata({...base,color:{...base.color,fullRange:true}});
 assert.equal(e.sourceFullRange,true);
 assert.equal(e.confirmed,true);
 const result=COLOR.verifyFrame(frame("bt709","bt709","bt709",true),e);
 assert.equal(result.rangeConversion,true);
 assert.equal(result.method,"decoded-frame-sdr-full-to-limited");
 assert.throws(()=>COLOR.verifyFrame(frame("bt709","bt709","bt709",false),e),/contradictoires/);
});

test("NOVA SDR : matrice BT.601 SMPTE 170M (6), primaires BT709, plage limitée",()=>{
 const info={...base,color:{...base.color,matrix:6}};
 const evidence=COLOR.metadata(info);
 assert.equal(evidence.kind,"mp4-colr-bt601");
 assert.equal(evidence.expectedMatrix,"smpte170m");
 const verified=COLOR.verifyFrame(frame("bt709","bt709","smpte170m",false),evidence);
 assert.equal(verified.matrixConversion,true);
 assert.equal(verified.method,"decoded-frame-sdr-matrix-to-bt709");
 assert.throws(()=>COLOR.verifyFrame(frame("bt709","bt709","bt709",false),evidence),/contradictoires/);
});
test("NOVA SDR : BT.601 PAL (5) et transfert SMPTE170M (6) admis avec validation native",()=>{
 const info={...base,color:{kind:"nclx",primaries:5,transfer:6,matrix:5,fullRange:false}};
 const proof=COLOR.metadata(info);
 assert.equal(proof.expectedMatrix,"bt470bg");
 const v=COLOR.verifyFrame(frame("bt470bg","smpte170m","bt470bg",false),proof);
 assert.equal(v.matrixConversion,true);
 assert.equal(v.frameFullyTagged,true);
 const sameMatrix=COLOR.verifyFrame(frame("bt470bg","smpte170m","smpte170m",false),proof);
 assert.equal(sameMatrix.matrixConversion,true);
});
test("NOVA SDR : matrice BT.2020 NCL (9) avec primaires 709 et transfert SDR, décodeur requis",()=>{
 const info={...base,color:{...base.color,matrix:9}};
 const proof=COLOR.metadata(info);
 assert.equal(proof.expectedMatrix,"bt2020-ncl");
 assert.equal(proof.kind,"mp4-colr-bt2020-matrix");
 const verified=COLOR.verifyFrame(frame("bt709","bt709","bt2020-ncl",false),proof);
 assert.equal(verified.matrixConversion,true);
 assert.throws(()=>COLOR.verifyFrame(frame("bt709","pq","bt2020-ncl",false),proof),/HDR/);
 assert.throws(()=>COLOR.verifyFrame(frame("bt2020","bt709","bt2020-ncl",false),proof),/gamut/);
});
test("NOVA SDR : matrice 5 versus 6 autorisées dans colr et SPS, mais matrices non 601 contradictoires refusées",()=>{
 const oldA=globalThis.NOVA_HEVC_ANNEXB,oldV=globalThis.NOVA_HEVC_VUI;
 globalThis.NOVA_HEVC_ANNEXB={configuration:()=>({parameterSets:[new Uint8Array([66,1,2])]})};
 globalThis.NOVA_HEVC_VUI={lireSPS:()=>({width:1920,height:1088,chroma:1,
   lumaBits:8,chromaBits:8,primaries:1,transfer:6,matrix:6,fullRange:false})};
 try{
  const info={...base,desc:new Uint8Array([1]),color:{...base.color,matrix:5}};
  const proof=COLOR.metadata(info);
  assert.equal(proof.sourceMatrix,6);
  assert.equal(proof.confirmed,true);
  assert.equal(COLOR.verifyFrame(frame("bt709","smpte170m","smpte170m",false),proof).matrixConversion,true);
  assert.throws(()=>COLOR.metadata({...info,color:{...info.color,matrix:9}}),/contradictoires/);
 }finally{
  if(oldA===undefined)delete globalThis.NOVA_HEVC_ANNEXB;
  else globalThis.NOVA_HEVC_ANNEXB=oldA;
  if(oldV===undefined)delete globalThis.NOVA_HEVC_VUI;
  else globalThis.NOVA_HEVC_VUI=oldV;
 }
});
test("NOVA SDR : diagnostic JSON donne matrice colr et SPS anonymisées",()=>{
 const r=COLOR.report({...base,color:{...base.color,matrix:6},name:"PRIVATE-file.mov"});
 assert.equal(r.colr.matrix,6);
 assert.equal(r.expectedMatrix,"smpte170m");
 assert.ok(!JSON.stringify(r).includes("PRIVATE"));
});

test("Safari HEVC format=null : décodeur matériel BT709 avec source 601 produit un rendu natif déclaré non certifié",async()=>{
 const src={...base,color:{kind:"nclx",primaries:1,transfer:1,matrix:6,fullRange:false}};
 const info=COLOR.metadata(src);
 assert.equal(info.expectedMatrix,"smpte170m");
 const opaque={
  format:null,
  colorSpace:{primaries:"bt709",transfer:"bt709",matrix:"bt709",fullRange:false},
  timestamp:0
 };
 const result=await COLOR.imagePourRendu(opaque,info);
 assert.equal(result.frame,opaque);
 assert.equal(result.owned,false);
 assert.equal(result.proof.method,"native-safari-sdr-bt709-display");
 assert.equal(result.proof.sourceMismatch,true);
 assert.equal(result.proof.colorFidelity,"uncertified-against-source");
 assert.match(result.proof.warning,/Comparer les couleurs/);
});
test("Safari HEVC format=null : garder le refus HDR/P3, plage et primaires incohérentes",async()=>{
 const src={...base,color:{kind:"nclx",primaries:1,transfer:1,matrix:6,fullRange:false}};
 const evidence=COLOR.metadata(src);
 for(const cs of [
  {primaries:"bt2020",transfer:"hlg",matrix:"bt709",fullRange:false},
  {primaries:"bt709",transfer:"pq",matrix:"bt709",fullRange:false},
  {primaries:"bt709",transfer:"bt709",matrix:"bt709",fullRange:true},
  {primaries:"smpte170m",transfer:"bt709",matrix:"bt709",fullRange:false}
 ]){
  const opaque={format:null,colorSpace:cs};
  await assert.rejects(()=>COLOR.imagePourRendu(opaque,evidence),
    /NOVA HD couleur/);
 }
 const unverified=COLOR.metadata({...src,color:{kind:"nclx",primaries:2,
  transfer:2,matrix:6,fullRange:false}});
 await assert.rejects(()=>COLOR.imagePourRendu({format:null,
  colorSpace:{primaries:"bt709",transfer:"bt709",matrix:"bt709",fullRange:false}},
  unverified),/non certifiable/);
});
test("Safari HEVC NV12 non copiable : recours natif uniquement si WebCodecs déclare NotSupportedError",async()=>{
 const evidence=COLOR.metadata({...base,color:{...base.color,matrix:6}});
 const cs={primaries:"bt709",transfer:"bt709",matrix:"bt709",fullRange:false};
 const fr={format:"NV12",colorSpace:cs,codedRect:{x:0,y:0,width:128,height:96},
  allocationSize:()=>20000,
  copyTo:async()=>{const e=new Error("GPU protected");e.name="NotSupportedError";throw e}};
 const result=await COLOR.imagePourRendu(fr,evidence,function DummyVideoFrame(){});
 assert.equal(result.owned,false);
 assert.equal(result.proof.sourceMismatch,true);
 const other={...fr,copyTo:async()=>{throw Error("I/O issue")}};
 await assert.rejects(()=>COLOR.imagePourRendu(other,evidence,function DummyVideoFrame(){}),
  /I\/O issue/);
});
test("Safari opaque : matrice source BT2020 NCL ou gamut P3 ne peuvent pas emprunter l'exception 601",async()=>{
 const i={...base,color:{kind:"nclx",primaries:1,transfer:1,matrix:9,fullRange:false}};
 const ev=COLOR.metadata(i);
 await assert.rejects(()=>COLOR.imagePourRendu({format:null,
  colorSpace:{primaries:"bt709",transfer:"bt709",matrix:"bt709",fullRange:false}},ev),
  /non certifiable/);
});
