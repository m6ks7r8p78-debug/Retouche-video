import test from "node:test";
import assert from "node:assert/strict";
import LAB from "../experiences/nova-hevc-601-patches.js";
const ids=["black","shadow","light-skin","white","blue-shadow",
 "skin-shadow","red","highlight"];
const colors=[[18,16,20],[49,46,51],[210,166,142],[250,250,247],
 [31,36,48],[91,67,61],[221,64,45],[242,231,218]];
const reference=()=>({
 schema:"retoucheproai.nova.synthetic-hevc-601-patches.v1",
 origin:"ffmpeg-synthetic-only",width:384,height:216,
 primaries:1,transfer:1,matrix:6,frames:15,
 patches:ids.map((id,i)=>({id,rgb:colors[i]}))
});
test("HEVC 1/1/6: refuse une mire qui n'est pas strictement synthétique",()=>{
 for(const change of [
  r=>{r.origin="private-upload"},
  r=>{r.matrix=1},
  r=>{r.width=1920},
  r=>{r.patches[0].rgb[0]=Number.NaN},
  r=>{r.patches[1].id="private"}
 ]){
  const r=reference();change(r);
  assert.throws(()=>LAB.validerReference(r),/synthétique|référence|invalides/i);
 }
});
test("HEVC Safari: mesure les huit régions Canvas, sans pixels ni nom utilisateur dans JSON",()=>{
 const r=reference(),rgba=new Uint8ClampedArray(384*216*4);
 for(let y=0;y<216;y++)for(let x=0;x<384;x++){
  const c=colors[Math.floor(y/108)*4+Math.floor(x/96)],k=(y*384+x)*4;
  rgba[k]=c[0];rgba[k+1]=c[1];rgba[k+2]=c[2];rgba[k+3]=255;
 }
 const m=LAB.moyens(rgba,384,216);
 assert.deepEqual(m.map(x=>x.rgb),colors);
 const frame={format:"PRIVATE_FAMILY_MOV",colorSpace:{
  primaries:"bt709",transfer:"bt709",matrix:"bt709",fullRange:false,
  filename:"PRIVATE_LOCATION_GPS"}};
 const result=LAB.synthese(r,m,frame);
 assert.equal(result.status,"measured-not-source-certified");
 assert.equal(result.meanAbsRgb255,0);
 assert.equal(result.maxAbsRgb255,0);
 assert.equal(result.decoded.matrix,"bt709");
 assert.equal(result.decoded.format,"unspecified");
 assert.equal(result.privacy.personalMediaIncluded,false);
 assert.equal(result.patches.length,8);
 assert.ok(!JSON.stringify(result).includes("PRIVATE"));
 assert.ok(!JSON.stringify(result).includes("GPS"));
});
test("HEVC Safari: un rendu matériel divergent est signalé sans fausse fidélité",()=>{
 const r=reference();
 const measurements=r.patches.map(p=>({id:p.id,
  rgb:p.rgb.map(v=>Math.min(255,v+18))}));
 const result=LAB.synthese(r,measurements,{
  format:null,colorSpace:{primaries:"bt709",matrix:"bt709",
   transfer:"bt709",fullRange:false}
 });
 assert.equal(result.direction,"large-variation");
 assert.ok(result.meanAbsRgb255>10);
 assert.equal(result.source.matrix,6);
 assert.equal(result.privacy.networkUpload,false);
});
test("HEVC Safari: aucun résultat si référence et mesures non conformes",()=>{
 const r=reference(),measurements=r.patches.map(p=>({...p}));
 measurements[0].id="not-synthetic";
 assert.throws(()=>LAB.synthese(r,measurements,{}),/Mesures/);
 assert.throws(()=>LAB.moyens(new Uint8Array(123),384,216));
});
