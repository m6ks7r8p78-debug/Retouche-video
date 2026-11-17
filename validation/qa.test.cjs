const {test}=require('node:test');
const assert=require('node:assert/strict');
globalThis.crypto=require('node:crypto').webcrypto;
const qa=require('../experiences/nova-hd-qa.js');
test('SHA-256 known vector',async()=>{assert.deepEqual(await qa.empreinte(new Blob(['abc'])),{algorithm:'SHA-256',bytes:3,sha256:'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'});});
test('pairs original and exact MP4; detects one changed byte',async()=>{
 const report=await qa.lier({privacy:{mediaIncluded:false}},new Blob(['source']),new Blob(['movie']));
 assert.equal(report.files.source.bytes,6);assert.equal(report.files.output.bytes,5);
 assert.notEqual(report.files.output.sha256,(await qa.empreinte(new Blob(['Movie']))).sha256);
 assert.equal(report.privacy.mediaIncluded,false);assert.equal(report.privacy.fileFingerprintsIncluded,true);
});
test('rejects invalid input',async()=>{await assert.rejects(qa.empreinte({size:-1}));});
test('report separates pre-encoding measurements from final color fidelity',()=>{
 const video={dw:1088,dh:1920,ns:195,durationUs:6465000};
 const result=qa.bilan({source:video,output:video,outputAudio:{packets:[{timestamp:0,duration:6485300}],sampleRate:48000,channels:1},sourceFps:30.2,modifiedFrames:189});
 assert.equal(result.version,'0.41');assert.equal(result.audio.lastAudioPacketMinusVideoDurationMs,20.3);
 assert.equal(result.correction.includesDecoderAndEncoderColorChanges,false);
 assert.equal(result.color.visuallyIdenticalToSourceCertified,false);
 assert.match(result.warnings.join(' '),/avant encodage/);
});
test('stored packet audit takes precedence over copy selection',()=>{
 const v={dw:1088,dh:1920,ns:195,durationUs:6465000};
 const audio={packets:Array.from({length:304},(_,i)=>({timestamp:Math.round(i*1024/48000*1e6),duration:21333})),storedPacketCount:306,storedFirstPacketUs:0,storedLastPacketEndUs:6528000,sampleRate:48000,channels:1};
 const r=qa.bilan({source:v,output:v,outputAudio:audio,sourceFps:30,modifiedFrames:0});
 assert.equal(r.audio.packets,306);assert.equal(r.audio.selectedForCopyPackets,304);
 assert.equal(r.audio.excludedFromCopyPackets,2);assert.equal(r.audio.lastPacketEndMs,6528);
 assert.equal(r.audio.lastAudioPacketMinusVideoDurationMs,63);
 assert.equal(r.audio.synchronizationPerceptuallyCertified,false);
});
test('inconsistent stored packet audit is rejected',()=>{
 const v={dw:2,dh:2,ns:1,durationUs:1000};
 assert.throws(()=>qa.bilan({source:v,output:v,sourceFps:1,modifiedFrames:0,outputAudio:{packets:[{timestamp:0,duration:1000}],storedPacketCount:0,storedFirstPacketUs:0,storedLastPacketEndUs:1000}}),/stocké/);
});
test('audio presentation is distinct from raw priming and padding',()=>{
 const v={dw:1088,dh:1920,ns:195,durationUs:6465000};
 const r=qa.bilan({source:v,output:v,sourceFps:30,modifiedFrames:0,outputAudio:{packets:[{timestamp:0,duration:6524800}],editDurationSeconds:6.465,leadingEmptySeconds:0}});
 assert.equal(r.audio.lastAudioPacketMinusVideoDurationMs,59.8);
 assert.equal(r.audio.presentedAudioEndMs,6465);assert.equal(r.audio.presentedAudioMinusVideoMs,0);
 assert.equal(r.audio.synchronizationPerceptuallyCertified,false);
});
