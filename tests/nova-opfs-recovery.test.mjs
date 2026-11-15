import test from "node:test";
import assert from "node:assert/strict";
import RECOVERY from "../experiences/nova-opfs-recovery.js";
const ONE_HOUR=RECOVERY.MIN_AGE_MS;
const validName=n=>"export-"+n.repeat(32)+".mp4";
const nowMs=1_800_000_000_000;
function fake(entries=[],{missing=false,failRemove=false}={}){
 const files=new Map(entries.map(e=>[e.name,{
  kind:e.kind??"file",getFile:async()=>{
   if(e.unreadable)throw Error("private source error");
   return {size:e.size??1000,lastModified:e.lastModified??nowMs-2*ONE_HOUR}
  }
 }]));
 const actions=[];
 const dir={
  async *entries(){for(const item of files)yield item},
  async getFileHandle(name,{create}={}){assert.equal(create,false);
   if(!files.has(name)){const e=new Error("Missing");e.name="NotFoundError";throw e}
   return files.get(name)},
  async removeEntry(name){
   if(failRemove)throw Error("quota");
   actions.push(name);files.delete(name);
  }
 };
 return {storage:{async getDirectory(){return {
  async getDirectoryHandle(name,{create}={}){
   assert.equal(name,"nova-opfs-local-v1");assert.equal(create,false);
   if(missing){const e=new Error("Missing");e.name="NotFoundError";throw e}
   return dir;
  }
 }}},files,actions};
}
test("Inventaire OPFS : compteur seulement, noms et contenu média absents",async()=>{
 const old=validName("a"),recent=validName("b"),active=validName("c");
 const env=fake([
  {name:old,size:2345},
  {name:recent,size:1234,lastModified:nowMs-1000},
  {name:active,size:4000},
  {name:"video-privee.mp4",size:300000},
  {name:validName("d"),unreadable:true},
  {name:validName("e"),size:25*1048576}
 ]);
 const report=await RECOVERY.scan({storage:env.storage,nowMs,
  active:n=>n===active});
 assert.equal(report.schema,"retoucheproai.nova.opfs-recovery.v1");
 assert.equal(report.oldFiles,1);assert.equal(report.oldBytes,2345);
 assert.equal(report.recentFiles,1);assert.equal(report.activeFiles,1);
 assert.equal(report.unrecognizedEntries,1);assert.equal(report.unreadableEntries,2);
 assert.equal(report.filesUploaded,false);assert.equal(report.fileContentsRead,false);
 assert.ok(!JSON.stringify(report).includes("video-privee"));
 assert.ok(!JSON.stringify(report).includes(old));
 assert.equal(env.actions.length,0,"aucune suppression au scan");
});
test("Nettoyage volontaire : seulement anciens fichiers reconnus et inactifs",async()=>{
 const old=validName("a"),recent=validName("b"),active=validName("c");
 const env=fake([{name:old},{name:recent,lastModified:nowMs-40000},
  {name:active},{name:"other-folder"}]);
 const report=await RECOVERY.cleanup({storage:env.storage,nowMs,
  active:n=>n===active});
 assert.equal(report.deleted,1);assert.equal(report.failed,0);
 assert.deepEqual(env.actions,[old]);
 assert.equal(env.files.has(recent),true);
 assert.equal(env.files.has(active),true);
 assert.equal(env.files.has("other-folder"),true);
 const again=await RECOVERY.cleanup({storage:env.storage,nowMs,
  active:n=>n===active});
 assert.equal(again.deleted,0);
});
test("Nettoyage : dossier absent, erreurs, annulation et listing trop grand",async()=>{
 const missing=fake([],{missing:true});
 assert.equal((await RECOVERY.scan({storage:missing.storage,nowMs})).oldFiles,0);
 assert.equal((await RECOVERY.cleanup({storage:missing.storage,nowMs})).deleted,0);
 const bad=fake([{name:validName("a")}],{failRemove:true});
 const failed=await RECOVERY.cleanup({storage:bad.storage,nowMs});
 assert.equal(failed.failed,1);assert.equal(failed.deleted,0);
 const ctl=new AbortController();ctl.abort();
 await assert.rejects(RECOVERY.scan({storage:bad.storage,nowMs,signal:ctl.signal}),
  /annulé/);
 const tooMany=fake(Array.from({length:129},(_,i)=>({
  name:validName((i%10).toString())+"extra"+i
 })));
 await assert.rejects(RECOVERY.cleanup({storage:tooMany.storage,nowMs}),
  /trop d'entrées/);
 assert.equal(tooMany.actions.length,0);
});
test("Nettoyage OPFS : race avec export actif lors de la seconde vérification",async()=>{
 const name=validName("d"),env=fake([{name}]);
 let calls=0;
 const report=await RECOVERY.cleanup({storage:env.storage,nowMs,active:()=>{
  calls++;return calls>=2;
 }});
 assert.equal(report.oldFiles,1);
 assert.equal(report.deleted,0);
 assert.equal(env.actions.length,0);
});
