import test from "node:test";
import assert from "node:assert/strict";
import AAC from "../experiences/nova-aac-copy.js";

const u32=n=>{const b=Buffer.alloc(4);b.writeUInt32BE(n>>>0);return b};
const box=(type,...parts)=>{const bytes=Buffer.concat(parts),h=Buffer.alloc(8);h.writeUInt32BE(bytes.length+8,0);h.write(type,4);return Buffer.concat([h,bytes])};
function fixture({edit=null,rate=48000,sampleType="mp4a",sound=true,wrongOffset=null,sampleGroup=false}={}){
 const esds=box("esds",Buffer.alloc(4),Buffer.from([5,2,0x11,0x90]));
 const entry=Buffer.alloc(36);entry.writeUInt32BE(36+esds.length,0);entry.write(sampleType,4);
 entry.writeUInt16BE(2,24);entry.writeUInt32BE(rate*65536>>>0,32);
 const sample=Buffer.concat([entry,esds]);
 const mdhd=Buffer.alloc(24);mdhd.writeUInt32BE(48000,12);
 const handler=Buffer.alloc(16);handler.write(sound?"soun":"vide",8);
 const stbl=box("stbl",
  box("stsd",Buffer.alloc(4),u32(1),sample),
  box("stts",Buffer.alloc(4),u32(1),u32(3),u32(1024)),
  box("stsc",Buffer.alloc(4),u32(1),u32(1),u32(3),u32(1)),
  box("stsz",Buffer.alloc(4),u32(0),u32(3),u32(4),u32(4),u32(4)),
  box("stco",Buffer.alloc(4),u32(1),u32(wrongOffset??8)),
  ...(sampleGroup?[box("sgpd",Buffer.alloc(8))]:[]));
 let edts=Buffer.alloc(0);
 if(edit!=null){
  const elst=Buffer.alloc(20);elst.writeUInt32BE(1,4);elst.writeUInt32BE(3072,8);
  elst.writeInt32BE(edit,12);elst.writeInt32BE(65536,16);
  edts=box("edts",box("elst",elst));
 }
 const mdat=box("mdat",Buffer.from([1,2,3,4,5,6,7,8,9,10,11,12]));
 const moov=box("moov",box("trak",edts,
  box("mdia",box("mdhd",mdhd),box("hdlr",handler),box("minf",stbl))));
 return new Blob([mdat,moov],{type:"video/mp4"});
}
test("NOVA AAC copy : conserve bit pour bit 3 paquets AAC correctement horodatés",async()=>{
 const file=fixture(),p=await AAC.planifier(file,{durationSeconds:3*1024/48000});
 assert.equal(p.packets.length,3);assert.equal(p.channels,2);assert.equal(p.sampleRate,48000);
 assert.deepEqual([...p.asc],[0x11,0x90]);
 const seen=[];
 const audit=await AAC.copier(file,p,{addAudioChunkRaw:(data,type,t,d,meta)=>seen.push({data:[...data],type,t,d,meta})});
 assert.equal(audit.count,3);
 assert.deepEqual(seen.map(x=>x.data),[[1,2,3,4],[5,6,7,8],[9,10,11,12]]);
 assert.deepEqual(seen.map(x=>x.t),[0,21333,42667]);
 assert.equal(seen[0].meta.decoderConfig.codec,"mp4a.40.2");
 assert.equal(seen[0].meta.decoderConfig.numberOfChannels,2);
});
test("NOVA AAC copy : edts à temps média zéro acceptable",async()=>{
 assert.equal((await AAC.planifier(fixture({edit:0}),{durationSeconds:.06})).packets.length,3);
});
test("NOVA AAC copy : refuse l'amorçage AAC tronqué sans edit-list correspondante",async()=>{
 await assert.rejects(AAC.planifier(fixture({edit:1024}),{durationSeconds:.06}),/priming|edits/);
});
test("NOVA AAC copy : refuse piste, config et fréquence non vérifiées",async()=>{
 for(const f of [fixture({sound:false}),fixture({sampleType:"alac"}),fixture({rate:44100})])
  await assert.rejects(AAC.planifier(f,{durationSeconds:.06}),/Copie AAC prudente/);
});
test("NOVA AAC copy : n'annonce pas de piste complète si elle est trop courte",async()=>{
 await assert.rejects(AAC.planifier(fixture(),{durationSeconds:1}),/couverture/);
});
test("NOVA AAC copy : annulation avant lecture ou copie",async()=>{
 const c=new AbortController();c.abort();
 await assert.rejects(AAC.planifier(fixture(),{durationSeconds:.06,signal:c.signal}),/annulé/);
 const file=fixture(),p=await AAC.planifier(file,{durationSeconds:.06});
 await assert.rejects(AAC.copier(file,p,{addAudioChunkRaw(){}},{signal:c.signal}),/annulé/);
});


test("NOVA AAC copy : refuse les samples pointant sur moov plutôt que mdat",async()=>{
 await assert.rejects(AAC.planifier(fixture({wrongOffset:20}),{durationSeconds:.06}),/en dehors du fichier|Copie AAC prudente/);
});
test("NOVA AAC copy : refuse les métadonnées de priming en sample groups non transférées",async()=>{
 await assert.rejects(AAC.planifier(fixture({sampleGroup:true}),{durationSeconds:.06}),/groupes d'échantillons AAC/);
});
