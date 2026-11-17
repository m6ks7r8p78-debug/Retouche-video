const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const zones=require('../experiences/nova-zones.js'),qa=require('../experiences/nova-hd-qa.js');
const src=fs.readFileSync(require.resolve('../experiences/nova-native-hd.js'),'utf8').replace('return Object.freeze({analyse,','return Object.freeze({rgba709,bufferLimit,analyse,');
const sandbox={module:{exports:{}},NOVA_COLOR709:{videoFrame(){}},VideoFrame:class{constructor(data,options){this.data=data;this.options=options;}}};vm.runInNewContext(src,sandbox);const hd=sandbox.module.exports;
test('neutral code values keep BT709 limited-range luma',()=>{
 for(const code of [0,16,32,64,128,192,235,255]){
  const a=Uint8Array.from([code,code,code,255,code,code,code,255,code,code,code,255,code,code,code,255]);
  const f=hd.rgba709(a,2,2,0,33333);
  assert.ok(Math.abs(f.data[0]-(16+219*code/255))<=1);
  assert.equal(f.data[4],128);assert.equal(f.data[5],128);
  assert.equal(f.options.colorSpace.transfer,'bt709');
 }
});
test('output conversion rejects invalid size',()=>assert.throws(()=>hd.rgba709(new Uint8Array(12),3,1,0,1)));
test('highlight protection preserves bright channels within a dark tile',()=>{
 const data=new Uint8ClampedArray(64*64*4);for(let i=0;i<data.length;i+=4)data.set([32,32,32,255],i);
 data.set([250,50,30,255],0);data.set([240,240,240,255],4);const original=data.slice();
 const r=zones.restituer({width:64,height:64,data},{size:64,arbitre:{arbitrer(){return {choisi:'ombres'}}}});
 assert.deepEqual(data,original);assert.equal(r.data[0],250);assert.deepEqual([...r.data.slice(4,8)],[240,240,240,255]);
 assert.ok(r.data[8]>32); // actual shadow correction, not an identity-only test
});
test('decoder buffer stays within its byte budget at full HD',()=>{
 const p={width:1088,height:1920};assert.ok(hd.bufferLimit(p)*p.width*p.height*4<=96*1048576);
 const estimate=hd.plannedMemory(p,4815517);assert.ok(estimate>150&&estimate<170);
 assert.throws(()=>hd.plannedMemory(p,60*1048576),/mémoire/);
});
test('quality report never claims detail gains from same-size output',()=>{
 const v={dw:1088,dh:1920,ns:195,durationUs:6465000};
 const r=qa.bilan({source:v,output:v,outputAudio:{packets:[{timestamp:0,duration:6465000}]},sourceFps:30,modifiedFrames:195});
 assert.equal(r.version,'0.41');assert.equal(r.video.resolutionIncreased,false);assert.equal(r.video.perceptualDetailGainMeasured,false);
 assert.match(r.warnings[2],/195 interventions ne signifient pas 195 améliorations/);
});
