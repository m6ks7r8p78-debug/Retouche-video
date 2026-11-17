const fs=require('fs'),assert=require('assert');
const test=require('../experiences/nova-export-color-test.js');
const demux=require('../experiences/nova-demux.js');
const aac=require('../experiences/nova-aac-copy.js');
const read=n=>new Blob([fs.readFileSync('experiences/'+n)]);
(async()=>{
 const patches=JSON.parse(fs.readFileSync('experiences/nova-pair-601.json')).patches;
 assert.equal(test.compare(patches,patches).maxAbsRgb255,0);
 const changed=structuredClone(patches);changed[6].rgb[1]+=15;
 assert.equal(test.compare(patches,changed).maxAbsRgb255,15);
 assert.equal(test.compare(patches,changed).meanAbsRgb255,.625);
 assert.throws(()=>test.compare(patches,changed.slice(1)));
 changed[0].rgb[0]=NaN;assert.throws(()=>test.compare(patches,changed));
 for(const [suffix,matrix] of [['601',6],['709',1]]){
  const file=read(`nova-roundtrip-${suffix}.mov`);
  const info=await demux.analyser(file);
  assert.equal(info.ns,15);assert.equal(info.color.matrix,matrix);
  assert.equal(info.color.primaries,1);assert.equal(info.color.transfer,1);
  const audio=await aac.planifier(file,{durationSeconds:1});
  assert.equal(audio.mode,'aac-copy');assert(audio.packets.length>0);
  console.log(suffix+': actual fixture MOV parsed; '+audio.packets.length+' AAC packets eligible for copy');
 }
 await assert.rejects(test.run({signal:AbortSignal.abort()}),/cancelled/);
 console.log('PASS: exact comparisons, isolated peak, malformed data, cancellation, actual MOV and AAC input validation. Browser codec execution NOT tested.');
})().catch(e=>{console.error(e);process.exit(1)});
