import test from "node:test";
import assert from "node:assert/strict";
import AAC from "../experiences/nova-aac-copy.js";

const u32=n=>{const b=Buffer.alloc(4);b.writeUInt32BE(n>>>0);return b};
const box=(type,...parts)=>{const bytes=Buffer.concat(parts),h=Buffer.alloc(8);h.writeUInt32BE(bytes.length+8,0);h.write(type,4);return Buffer.concat([h,bytes])};
function fixture({edit=null,rate=48000,sampleType="mp4a",sound=true,wrongOffset=null,sampleGroup=false,packetCount=3,editDurationMs=null,leadingEmptyMs=0,editListVersion=0,editFlags=0,rawEditMedia=null,rawEditDuration=null,asc=null,wrapped=false}={}){
 const actualASC=Buffer.from(asc||[0x11,0x90]);
 const dsi=Buffer.concat([Buffer.from([5,actualASC.length]),actualASC]);
 const dec=Buffer.concat([Buffer.from([4,13+dsi.length,0x40,0x15,0,0,0,0,1,0,0,0,1,0,0]),dsi]);
 const es=Buffer.concat([Buffer.from([3,3+dec.length+3,0,1,0]),dec,Buffer.from([6,1,2])]);
 const esds=box("esds",Buffer.alloc(4),wrapped?es:dsi);
 const entry=Buffer.alloc(36);entry.writeUInt32BE(36+esds.length,0);entry.write(sampleType,4);
 entry.writeUInt16BE(2,24);entry.writeUInt32BE(rate*65536>>>0,32);
 const sample=Buffer.concat([entry,esds]);
 const mdhd=Buffer.alloc(24);mdhd.writeUInt32BE(48000,12);
 const handler=Buffer.alloc(16);handler.write(sound?"soun":"vide",8);
 const stbl=box("stbl",
  box("stsd",Buffer.alloc(4),u32(1),sample),
  box("stts",Buffer.alloc(4),u32(1),u32(packetCount),u32(1024)),
  box("stsc",Buffer.alloc(4),u32(1),u32(1),u32(packetCount),u32(1)),
  box("stsz",Buffer.alloc(4),u32(0),u32(packetCount),...Array.from({length:packetCount},()=>u32(4))),
  box("stco",Buffer.alloc(4),u32(1),u32(wrongOffset??8)),
  ...(sampleGroup==="roll"?[
    box("sgpd",Buffer.from([1,0,0,0]),Buffer.from("roll"),u32(2),u32(1),Buffer.from([0xff,0xff])),
    box("sbgp",Buffer.alloc(4),Buffer.from("roll"),u32(1),u32(packetCount),u32(1))
  ]:sampleGroup?[box("sgpd",Buffer.alloc(8))]:[]));
 let edts=Buffer.alloc(0);
 if(edit!=null||leadingEmptyMs>0){
  const count=leadingEmptyMs>0?2:1,step=editListVersion===1?20:12;
  const elst=Buffer.alloc(8+count*step);
  elst[0]=editListVersion;elst[3]=editFlags;
  elst.writeUInt32BE(count,4);
  const write=(i,duration,media)=>{
   const at=8+i*step;
   if(editListVersion===1){
     elst.writeBigUInt64BE(BigInt(duration),at);
     elst.writeBigInt64BE(BigInt(media),at+8);
     elst.writeInt32BE(65536,at+16);
   }else{
     elst.writeUInt32BE(Number(duration),at);
     elst.writeInt32BE(Number(media),at+4);
     elst.writeInt32BE(65536,at+8);
   }
  };
  if(leadingEmptyMs>0)write(0,leadingEmptyMs,-1);
  write(count-1,rawEditDuration??(editDurationMs??(edit>0?43:64)),
    rawEditMedia??(edit??0));
  edts=box("edts",box("elst",elst));
 }
 const mdat=box("mdat",Buffer.from(Array.from({length:packetCount*4},(_,i)=>i+1)));
 const mvhd=Buffer.alloc(24);mvhd.writeUInt32BE(1000,12);
 const moov=box("moov",box("mvhd",mvhd),box("trak",edts,
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
 await assert.rejects(AAC.planifier(fixture({sampleGroup:true}),{durationSeconds:.06}),/groupes AAC incomplets|groupes d'échantillons AAC/);
});

test("NOVA AAC copy : recopie le groupe roll=-1 sur un fichier compatible",async()=>{
 const file=fixture({sampleGroup:"roll"});
 const plan=await AAC.planifier(file,{durationSeconds:.06});
 assert.equal(plan.rollDistance,-1);
 const packets=[];
 await AAC.copier(file,plan,{addAudioChunkRaw:(buf,type,t,d,meta)=>packets.push([...buf])});
 assert.equal(packets.length,3);
});

test("NOVA AAC copy : amorçage 1024 samples et roll=-1 restent conservables",async()=>{
 const src=fixture({edit:1024,sampleGroup:"roll"});
 const plan=await AAC.planifier(src,{durationSeconds:.042});
 assert.equal(plan.rollDistance,-1);
 assert.equal(plan.editMediaTime,1024);
 assert.equal(plan.editDurationSeconds,.043);
 assert.equal(plan.editStartUs,21333);
 assert.equal(plan.packets.length,3,"conserver aussi le paquet de préchargement");
 assert.ok(plan.outputEditSeconds>.04);
 const actual=[];
 await AAC.copier(src,plan,{addAudioChunkRaw:(data)=>actual.push([...data])});
 assert.deepEqual(actual,[[1,2,3,4],[5,6,7,8],[9,10,11,12]]);
});
test("NOVA AAC copy : refuse montage AAC qui introduit un délai de démarrage ambigu",async()=>{
 await assert.rejects(
   AAC.planifier(fixture({edit:1024,sampleGroup:false}),{durationSeconds:.042}),
   /groupes roll|priming AAC/
 );
});

test("NOVA AAC copy : priming Apple 2112 samples représenté seulement si tous les paquets existent",async()=>{
 const enough=fixture({edit:2112,editDurationMs:44,packetCount:5,sampleGroup:"roll"});
 const p=await AAC.planifier(enough,{durationSeconds:.044});
 assert.equal(p.editMediaTime,2112);
 assert.equal(p.rollDistance,-1);
 assert.equal(p.editStartUs,44000);
 assert.equal(p.packets.length,5);
 assert.equal(p.outputEditSeconds,.044);
 const sampled=[];
 await AAC.copier(enough,p,{addAudioChunkRaw:(bytes,_type,pts)=>sampled.push({size:bytes.length,pts})});
 assert.equal(sampled.length,5);
 assert.equal(sampled[0].pts,0);
 const short=fixture({edit:2112,editDurationMs:43,packetCount:3,sampleGroup:"roll"});
 await assert.rejects(AAC.planifier(short,{durationSeconds:.02}),/sortant de la durée/);
});
test("NOVA AAC copy : refuse un montage edit-list présentant une région audio tronquée",async()=>{
 const file=fixture({edit:1024,editDurationMs:15,packetCount:3,sampleGroup:"roll"});
 await assert.rejects(AAC.planifier(file,{durationSeconds:.10}),/insuffisante/);
});

test("NOVA AAC copy : ne prolonge pas le segment audible au-delà de l'elst original",async()=>{
 const file=fixture({edit:1024,editDurationMs:20,packetCount:3,sampleGroup:"roll"});
 const plan=await AAC.planifier(file,{durationSeconds:.04});
 assert.equal(plan.editStartUs,21333);
 assert.equal(plan.editDurationSeconds,.02);
 assert.equal(plan.outputEditSeconds,.02,"ne pas révéler les échantillons hors segment audio");
});

test("NOVA AAC copy : leading silence elst de 250 ms conservé sans ajouter de son",async()=>{
 const f=fixture({edit:1024,sampleGroup:"roll",packetCount:5,editDurationMs:84,leadingEmptyMs:250});
 const plan=await AAC.planifier(f,{durationSeconds:.334});
 assert.equal(plan.leadingEmptyTicks,250);
 assert.equal(plan.leadingEmptySeconds,.25);
 assert.equal(plan.outputEditGapSeconds,.25);
 assert.equal(plan.editMediaTime,1024);
 assert.equal(plan.editStartUs,21333);
 assert.equal(plan.outputEditSeconds,.084);
 assert.equal(plan.packets.length,5);
});
test("NOVA AAC copy : refuse vide seul, espace de 501 ms, 3 éditions",async()=>{
 await assert.rejects(AAC.planifier(
  fixture({edit:1024,packetCount:5,sampleGroup:"roll",leadingEmptyMs:501,editDurationMs:84}),
  {durationSeconds:.58}),/500 ms/);
 const f=fixture({edit:1024,packetCount:5,sampleGroup:"roll",leadingEmptyMs:250,editDurationMs:84});
 await assert.rejects(AAC.planifier(f,{durationSeconds:.50}),/insuffisante/);
});

test("NOVA 0.13 : version 1 AAC conserve les edits 64 bits simples sans reconversion",async()=>{
 const f=fixture({edit:1024,editListVersion:1,leadingEmptyMs:250,
   packetCount:5,editDurationMs:84,sampleGroup:"roll"});
 const p=await AAC.planifier(f,{durationSeconds:.334});
 assert.equal(p.editListVersion,1);
 assert.equal(p.leadingEmptyTicks,250);
 assert.equal(p.editMediaTime,1024);
 assert.equal(p.rollDistance,-1);
 assert.equal(p.outputEditGapSeconds,.25);
 assert.equal(p.outputEditSeconds,.084);
 assert.equal(p.packets.length,5);
});
test("NOVA 0.13 : version 1 sans vide ni amorçage fonctionne aussi",async()=>{
 const f=fixture({edit:0,editListVersion:1,editDurationMs:64});
 const p=await AAC.planifier(f,{durationSeconds:.06});
 assert.equal(p.editListVersion,1);
 assert.equal(p.editMediaTime,0);
 assert.equal(p.outputEditGapSeconds,0);
 assert.equal(p.packets.length,3);
});
test("NOVA 0.13 : version 1 rejette les grands entiers et le media_time négatif",async()=>{
 await assert.rejects(AAC.planifier(fixture({edit:0,editListVersion:1,
   rawEditMedia:9007199254740993n}),{durationSeconds:.06}),
   /64 bits non représentable/);
 await assert.rejects(AAC.planifier(fixture({edit:0,editListVersion:1,
   rawEditDuration:9007199254740993n}),{durationSeconds:.06}),
   /64 bits non représentable/);
 await assert.rejects(AAC.planifier(fixture({edit:0,editListVersion:1,
   rawEditMedia:-2n}),{durationSeconds:.06}),
   /média négative/);
});

test("NOVA 0.13 : rejette explicitement l'elst répétée ou réservée (ISO flags)",async()=>{
 for(const editListVersion of [0,1]){
  for(const editFlags of [1,2]){
   const f=fixture({edit:0,editDurationMs:64,editListVersion,editFlags});
   await assert.rejects(AAC.planifier(f,{durationSeconds:.06}),
     /édition AAC répétée ou flags elst/);
  }
 }
});

test("AAC iPhone: esds MPEG4 imbriqué 03/04/05 est reconnu sans heuristique d'octets",async()=>{
 const p=await AAC.planifier(fixture({wrapped:true}),{durationSeconds:.06});
 assert.equal(p.mode,"aac-copy");
 assert.deepEqual([...p.asc],[0x11,0x90]);
 assert.equal(p.sampleRate,48000);
});
test("AAC iPhone: fréquence explicite 24 bits ASC index 15 reste AAC-LC si cohérente",async()=>{
 // AOT 2 (5 bits), index 15 (4), 48000 (24), canaux 2 (4), 0 (3)
 const bits="00010"+"1111"+(48000).toString(2).padStart(24,"0")+"0010"+"000";
 const asc=Buffer.from(bits.match(/.{8}/g).map(x=>parseInt(x,2)));
 const p=await AAC.planifier(fixture({asc,wrapped:true}),{durationSeconds:.06});
 assert.deepEqual([...p.asc],[...asc]);
 assert.equal(p.channels,2);
});
test("AAC iPhone: profil HE-AAC AOT5 doit être orienté vers réencodeur natif, pas copié comme LC",async()=>{
 const src=fixture({wrapped:true,asc:[0x29,0x90]}); // AOT 5 SBR
 await assert.rejects(AAC.planifier(src,{durationSeconds:.06}),/profil AAC non LC/);
});
test("AAC iPhone: esds avec deux DSI/longueur incohérente échoue sans fuite",async()=>{
 const src=fixture({wrapped:true});
 // fixture valide : le parseur refuse bien les corruptions ci-dessous.
 const b=new Uint8Array(await src.arrayBuffer());
 let found=-1;for(let i=0;i<b.length-6;i++)
  if(b[i]===3&&b[i+2]===0&&b[i+3]===1&&b[i+4]===0&&b[i+5]===4){
   found=i;break
  }
 assert.ok(found>=0);
 b[found+1]=0x7f;
 await assert.rejects(AAC.planifier(new Blob([b]),{durationSeconds:.06}),/Copie AAC prudente/);
});
