import test from "node:test";
import assert from "node:assert/strict";
import OPFS from "../experiences/nova-opfs-stream.js";
const muxer={StreamTarget:class{constructor(options){this.options=options}}};
const random={getRandomValues(a){a.fill(7);return a}};
function storage({failWrite=false}={}){
 const all=new Map(),calls=[];
 let last=null;
 const folder={
  async getFileHandle(name,{create}={}){
   if(!create)throw Error("create required");
   const file={name,removed:false,bytes:[],
    async createWritable(){return {
     async write({type,position,data}){
      assert.equal(type,"write");
      calls.push({position,bytes:data.length});
      if(failWrite)throw Error("PRIVATE_FAILED_DISK");
      file.bytes.push({position,data:new Uint8Array(data)});
     },
     async close(){last=file},
     async abort(){file.aborted=true}
    }},
    async getFile(){
     const size=Math.max(0,...file.bytes.map(x=>x.position+x.data.length));
     const out=new Uint8Array(size);
     for(const e of file.bytes)out.set(e.data,e.position);
     return {size,bytes:out};
    }};
   all.set(name,file);return file;
  },
  async removeEntry(name){const file=all.get(name);if(file)file.removed=true;all.delete(name)}
 };
 return {store:{async getDirectory(){return {async getDirectoryHandle(name,{create}={}){
  assert.equal(name,"nova-opfs-local-v1");assert.equal(create,true);return folder
 }}}},all,calls,getLast:()=>last};
}
test("OPFS : le StreamTarget utilise positions explicites, copies et File final",async()=>{
 const env=storage();
 const sink=await OPFS.create({storage:env.store,muxer,random});
 assert.equal(sink.snapshot().mode,"opfs-local-stream");
 const borrowed=new Uint8Array(1100).fill(11);
 sink.target.options.onData(borrowed,0);
 borrowed.fill(99); // la source peut recycler le buffer immédiatement
 sink.target.options.onData(new Uint8Array(1024).fill(42),1100);
 await sink.drain();
 const {file,metrics}=await sink.finish();
 assert.equal(file.size,2124);
 assert.equal(file.bytes[50],11);
 assert.equal(file.bytes[1200],42);
 assert.equal(metrics.writeCount,2);
 assert.equal(metrics.bytes,2124);
 assert.ok(metrics.peakPendingBytes<=2*1048576);
 assert.equal(env.all.size,1);
 await sink.release();
 await sink.release();
 assert.equal(env.all.size,0);
});
test("OPFS : positions hors ordre préservées au lieu de réécrire dans le mauvais ordre",async()=>{
 const env=storage(),sink=await OPFS.create({storage:env.store,muxer,random});
 sink.target.options.onData(new Uint8Array(1024).fill(2),1024);
 sink.target.options.onData(new Uint8Array(1024).fill(1),0);
 const {file}=await sink.finish();
 assert.equal(file.bytes[0],1);
 assert.equal(file.bytes[1024],2);
 await sink.release();
});
test("OPFS : file bornée, erreur de disque et annulation ne produisent jamais de succès",async()=>{
 for(const scenario of ["pending","disk","abort"]){
  const env=storage({failWrite:scenario==="disk"});
  const ctl=new AbortController();
  const sink=await OPFS.create({storage:env.store,muxer,random,signal:ctl.signal,
   maxPendingBytes:65536,maxFileBytes:3*1048576});
  if(scenario==="pending"){
   assert.throws(()=>sink.target.options.onData(new Uint8Array(65537),0),
    /file d'écriture/);
   await assert.rejects(sink.finish(),/interrompue/);
  }else if(scenario==="disk"){
   sink.target.options.onData(new Uint8Array(2048),0);
   await assert.rejects(sink.finish(),/interrompue/);
  }else{
   ctl.abort();
   assert.throws(()=>sink.target.options.onData(new Uint8Array(2048),0),
    /annulé/);
   await assert.rejects(sink.finish(),/annulé/);
  }
  await sink.release();
  assert.equal(env.all.size,0);
 }
});
test("OPFS : API absente et limite de fichier >24 MiB refusées",async()=>{
 await assert.rejects(OPFS.create({storage:null,muxer,random}),/stockage privé/);
 const env=storage();
 await assert.rejects(OPFS.create({storage:env.store,muxer,random,
  maxFileBytes:25*1048576}),/limites/);
 assert.equal(env.all.size,0);
});
