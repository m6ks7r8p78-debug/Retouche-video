import test from "node:test";
import assert from "node:assert/strict";
import AVC from "../experiences/nova-avc-vui.js";
const base={codec:"avc1.42E01F",W:160,H:90};
test("AVC SPS: absent ou tronqué ne suffit jamais pour prouver BT709",()=>{
 for(const info of [null,{},base,{...base,desc:new Uint8Array(1)},
  {...base,desc:new Uint8Array([1,66,0,10,255,225,0,4,103,1,2,3])}]){
  assert.throws(()=>AVC.analyser(info),/non vérifiable/);
 }
});
test("AVC SPS: faux codec et type NAL inconnu toujours refusés",()=>{
 const fake={...base,desc:new Uint8Array([1,66,0,10,255,225,0,5,104,1,2,3,4])};
 assert.throws(()=>AVC.analyser(fake),/non vérifiable/);
 assert.throws(()=>AVC.analyser({...fake,codec:"hvc1.1.6.L30"}),/non vérifiable/);
});
test("AVC SPS: ne valide pas des pixels ou un conteneur extérieur au fichier local",()=>{
 assert.equal(typeof AVC.parseSPS,"function");
 assert.equal(typeof AVC.analyser,"function");
 assert.equal("fetch" in AVC,false);
 assert.equal("decode" in AVC,false);
});
