import test from "node:test";
import assert from "node:assert/strict";
import {webcrypto,createHash} from "node:crypto";
import ID from "../experiences/nova-output-identity.js";
const fakeVideo={W:160,H:120,dw:160,dh:120,ns:15,durationUs:1000000};
const secret="PRIVATE-GPS-PRIVATE-face.mp4";
function fixture(major="isom"){
 const bytes=new Uint8Array(4096);
 bytes.set([0,0,0,24,102,116,121,112],0);
 for(let i=0;i<4;i++)bytes[8+i]=major.charCodeAt(i);
 return {blob:new Blob([bytes],{type:"video/mp4"}),bytes};
}
const claim={originalWidth:160,originalHeight:120,sourceFrames:15,
 audioMode:"aac-native-encode",filename:secret,sourcePixels:secret};
test("Identité MP4 : hash exact de la sortie, marque isom et index, aucune fuite privée",async()=>{
 const {blob,bytes}=fixture();
 const info={...fakeVideo,name:secret,extraPixels:secret};
 const r=await ID.inspect(blob,claim,{probe:async()=>info,crypto:webcrypto});
 assert.equal(r.majorBrand,"isom");
 assert.equal(r.sizeBytes,bytes.length);
 assert.equal(r.sha256,createHash("sha256").update(bytes).digest("hex"));
 assert.equal(r.matchesClaim,true);
 assert.equal(r.audioMode,"aac-native-encode");
 assert.deepEqual(r.video,{codedWidth:160,codedHeight:120,width:160,
  height:120,frames:15,durationMs:1000});
 const s=ID.serialiser({...r,secretFileName:secret,
  video:{...r.video,privateFrame:secret},
  privacy:{gps:secret}});
 assert.ok(!s.includes("PRIVATE"),"filename or raw file leaked");
 assert.equal(JSON.parse(s).privacy.exportedFileFingerprintIncluded,true);
 assert.equal(JSON.parse(s).privacy.originalMediaHashed,false);
});
test("Identité MP4 : une copie Apple mp42 et un nombre d'images différent sont signalés",async()=>{
 const {blob}=fixture("mp42");
 const r=await ID.inspect(blob,claim,{probe:async()=>({...fakeVideo,W:512,H:902,
  dw:512,dh:902,ns:14}),crypto:webcrypto});
 assert.equal(r.majorBrand,"mp42");
 assert.equal(r.matchesClaim,false);
 assert.equal(JSON.parse(ID.serialiser(r)).video.frames,14);
});
test("Identité MP4 : aucun faux résultat si source illisible, header faux ou SHA indisponible",async()=>{
 await assert.rejects(()=>ID.inspect(new Blob(["small"]),claim,{
  probe:async()=>fakeVideo,crypto:webcrypto}),/hors budget/);
 const a=fixture().blob;
 await assert.rejects(()=>ID.inspect(a,claim,{probe:async()=>null,crypto:webcrypto}),
  /illisible/);
 const bad=new Blob([new Uint8Array(4096)]);
 await assert.rejects(()=>ID.inspect(bad,claim,{probe:async()=>fakeVideo,crypto:webcrypto}),
  /signature/);
 await assert.rejects(()=>ID.inspect(a,claim,{probe:async()=>fakeVideo,crypto:{}}),
  /SHA-256/);
 assert.throws(()=>ID.serialiser({schema:"untrusted",sha256:"deadbeef",matchesClaim:true}),
  /preuve MP4 inconnue/);
});
