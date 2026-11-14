/* Safety/availability tests for the browser's real feature gates. */
import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
const C=require("../directeur-capacites.js");
const ok={type:"video",webgl:true,videoDecoder:true,videoEncoder:true,audioEncoder:true,voixModele:true,scintillementMesure:true};
test("video with usable local engines: core modules selectable",()=>{
 const c=C.inspecter(ok);
 for(const id of ["debloc","debruitage","detail","lumiere","poussiere","scintillement","stabilisation","voix","resolution"])
 assert.equal(c.disponibles[id],true,id);
});
test("no sequential WebCodecs: no false dust/flicker availability",()=>{
 const c=C.inspecter({...ok,videoDecoder:false});
 assert.equal(c.disponibles.poussiere,false);
 assert.equal(c.disponibles.scintillement,false);
 assert.equal(c.disponibles.stabilisation,true,"stabilisation can also use video seeking");
});
test("flicker estimation unavailable: never suggest automatic flicker repair",()=>{
 const c=C.inspecter({...ok,scintillementMesure:false});
 assert.equal(c.disponibles.scintillement,false);
});
test("audio encoder or voice model missing => no voice module",()=>{
 assert.equal(C.inspecter({...ok,audioEncoder:false}).disponibles.voix,false);
 assert.equal(C.inspecter({...ok,voixModele:false}).disponibles.voix,false);
});
test("video encoder missing: source can be diagnosed but not offered export upscaling",()=>{
 const c=C.inspecter({...ok,videoEncoder:false});
 assert.equal(c.disponibles.resolution,false);
 assert.equal(c.disponibles.export,true,"export step is a provenance placeholder, not actual encoding guarantee");
 assert.ok(c.raison.some(x=>/Encodeur vidéo/.test(x)));
});
test("photo no video-only tools, manual erase remains manual",()=>{
 const c=C.inspecter({...ok,type:"photo",videoDecoder:false,videoEncoder:false,audioEncoder:false});
 for(const id of ["poussiere","stabilisation","scintillement","voix"])assert.equal(c.disponibles[id],false);
 assert.equal(c.disponibles.resolution,true);
 const e=c.options.find(x=>x.id==="effacer_zone");
 assert.equal(e.possible,true);assert.equal(e.declenchement,"manuel");
});
test("optional AR and face recovery never enabled automatically",()=>{
 const c=C.inspecter(ok);
 for(const id of ["retirer_filtre_video","restaurer_visages_video","changer_format"]){
   const e=c.options.find(x=>x.id===id);assert.ok(e.possible);assert.equal(e.declenchement,"manuel");
 }
});
test("unsupported GPU: all shader-based features unavailable",()=>{
 const c=C.inspecter({...ok,webgl:false});
 for(const id of ["debloc","debruitage","detail","lumiere","poussiere","stabilisation","resolution"])assert.equal(c.disponibles[id],false);
});
test("a capability is not a quality guarantee",()=>{
 assert.match(C.inspecter(ok).garantie,/pas validation/);
});
test("pure function, no mutations",()=>{
 const ctx=structuredClone(ok);C.inspecter(ctx);assert.deepEqual(ctx,ok);
});
