import test from "node:test";
import assert from "node:assert/strict";
import AV from "../experiences/nova-avsync.js";

// Petites boîtes MP4 synthétiques avec offsets ISO-BMFF réels.
// Aucun fichier personnel : seul le header est testé.
function box(type,...parts){
 const payload=Buffer.concat(parts),header=Buffer.alloc(8);
 header.writeUInt32BE(payload.length+8,0);header.write(type,4,"ascii");
 return Buffer.concat([header,payload]);
}
function full(n){return Buffer.alloc(n)}
function ui32(n){const b=Buffer.alloc(4);b.writeUInt32BE(n);return b}
function track({kind="soun",edit=null,second=false,codec="mp4a",count=60}={}){
 const mh=full(24);mh.writeUInt32BE(48000,12);
 const handler=full(16);handler.write(kind,8,"ascii");
 const d=Buffer.alloc(16);d.writeUInt32BE(16,0);d.write(codec,4,"ascii");
 const stsd=box("stsd",full(4),ui32(1),d);
 const stts=box("stts",full(4),ui32(1),ui32(count),ui32(1024));
 let edts=Buffer.alloc(0);
 if(edit){
  const entries=edit.map(([duration,mediaTime])=>{
   const e=Buffer.alloc(12);e.writeUInt32BE(duration,0);
   e.writeInt32BE(mediaTime,4);e.writeInt32BE(65536,8);return e;
  });
  edts=box("edts",box("elst",full(4),ui32(entries.length),...entries));
 }
 return box("trak",box("mdia",box("mdhd",mh),box("hdlr",handler),
   box("minf",box("stbl",stsd,stts))),edts);
}
function movie({tracks=[track()],after=false}={}){
 const mvhd=full(24);mvhd.writeUInt32BE(1000,12);
 const moov=box("moov",box("mvhd",mvhd),...tracks);
 return new Blob(after?[box("mdat",Buffer.alloc(96)),moov]:[moov,box("mdat",Buffer.alloc(96))],
   {type:"video/mp4"});
}
test("NOVA AV : piste AAC présente avec temps MP4 natifs",async()=>{
 const a=await AV.analyser(movie());
 assert.equal(a.codec,"mp4a");
 assert.equal(a.samples,60);
 assert.equal(a.timescale,48000);
 assert.equal(a.durationUs,1280000);
 assert.equal(a.delayUs,0);
 assert.equal(AV.verifier(a,{durationSeconds:1.2}).aligned,true);
});
test("NOVA AV : moov en fin de fichier et priming AAC simple",async()=>{
 const a=await AV.analyser(movie({after:true,tracks:[track({edit:[[1200,1024]]})]}));
 assert.equal(a.trimUs,21333);
 assert.equal(a.delayUs,0);
 assert.equal(a.presentationEndUs,1200000);
 assert.equal(a.editSegmentUs,1200000);
 assert.ok(AV.verifier(a,{durationSeconds:1.2}).aligned);
});
test("NOVA AV : édition vide initiale de 320 ms détectée et refusée",async()=>{
 const a=await AV.analyser(movie({tracks:[track({edit:[[320,-1],[880,1024]]})]}));
 assert.equal(a.delayUs,320000);
 assert.throws(()=>AV.verifier(a,{durationSeconds:1.0}),/départ audio décalé/);
});
test("NOVA AV : temps audio trop court ou décalage face à la vidéo sont refusés",async()=>{
 const a=await AV.analyser(movie());
 assert.throws(()=>AV.verifier(a,{durationSeconds:2}),/trop précoce/);
 assert.throws(()=>AV.verifier(a,{videoStartUs:200000,durationSeconds:1}),/désalignement/);
});
test("NOVA AV : montage de pré-roll AAC anormal rejeté",async()=>{
 const a=await AV.analyser(movie({tracks:[track({edit:[[1000,10240]]})]}));
 assert.throws(()=>AV.verifier(a,{durationSeconds:1.0}),/trim audio trop important/);
});
test("NOVA AV : fichier muet ne peut pas être prétendu sonore",async()=>{
 const a=await AV.analyser(movie({tracks:[track({kind:"vide"})]}));
 assert.equal(a,null);
 assert.throws(()=>AV.verifier(a,{durationSeconds:1}),/aucune piste/);
});
test("NOVA AV : pistes audio multiples ou codec inconnu refusés",async()=>{
 await assert.rejects(AV.analyser(movie({tracks:[track(),track()]})),/plusieurs pistes audio/);
 await assert.rejects(AV.analyser(movie({tracks:[track({codec:"alac"})]})),/non AAC/);
});
test("NOVA AV : refuse les edit lists multiples sans synchronisation prouvée",async()=>{
 const f=movie({tracks:[track({edit:[[100,-1],[500,0],[400,0]]})]});
 await assert.rejects(AV.analyser(f),/liste de montage audio complexe/);
});
test("NOVA AV : rejette les fichiers tronqués ou sans moov",async()=>{
 await assert.rejects(AV.analyser(new Blob([Buffer.from([0,0,0,99,109,111,111,118])])),/malformée/);
 await assert.rejects(AV.analyser(new Blob([box("mdat",Buffer.alloc(4))])),/introuvable/);
});

test("NOVA AV : l'elst raccourcit la durée réellement présentable",async()=>{
 const a=await AV.analyser(movie({tracks:[track({edit:[[300,1024]]})]}));
 assert.equal(a.durationUs,1280000,"stts couvre plus d'une seconde");
 assert.equal(a.presentationEndUs,300000,"elst ne présente que 300 ms");
 assert.throws(()=>AV.verifier(a,{durationSeconds:1.2}),/trop précoce/);
});
test("NOVA AV : interdit les edit lists référençant une fin sonore inexistante",async()=>{
 await assert.rejects(AV.analyser(movie({tracks:[track({edit:[[1400,1024]]})]})),/dépassant/);
});
