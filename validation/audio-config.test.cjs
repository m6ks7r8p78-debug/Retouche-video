const {test}=require('node:test'),assert=require('node:assert/strict');
const {resolveAudioConfig}=require('../experiences/nova-aac-copy.js');
const asc=(aot,index,channels)=>new Uint8Array([(aot<<3)|(index>>1),((index&1)<<7)|(channels<<3)]);
test('legacy stereo sample entry with AAC mono uses ASC mono',()=>{
 const r=resolveAudioConfig(asc(2,4,1),44100,2);assert.equal(r.channels,1);assert.equal(r.legacyStereoEntryForMono,true);
});
test('matching mono and stereo unchanged',()=>{for(const n of [1,2]){const r=resolveAudioConfig(asc(2,3,n),48000,n);assert.equal(r.channels,n);assert.equal(r.legacyStereoEntryForMono,false)}});
test('contradictory rate refused',()=>assert.throws(()=>resolveAudioConfig(asc(2,4,1),48000,2),/fréquence/));
test('reverse channel mismatch refused',()=>assert.throws(()=>resolveAudioConfig(asc(2,4,2),44100,1),/canaux/));
test('PCE and multichannel remain refused',()=>{for(const n of [0,6])assert.throws(()=>resolveAudioConfig(asc(2,4,n),44100,2),/canaux/)});
test('non-LC profile refused',()=>assert.throws(()=>resolveAudioConfig(asc(5,4,1),44100,2),/non LC/));
test('truncated config refused',()=>assert.throws(()=>resolveAudioConfig(new Uint8Array([18]),44100,2)));
