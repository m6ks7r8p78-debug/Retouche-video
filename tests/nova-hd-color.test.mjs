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
