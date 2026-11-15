import test from "node:test";
import assert from "node:assert/strict";
import REPORT from "../experiences/nova-local-export-report.js";
const privateName="VIDEO_PERSONNELLE_TRES_PRIVEE.mov";
const result={
 blob:{size:123456},storageMode:"opfs-local-stream",audioMode:"aac-copy",
 plan:{width:320,height:180,fps:15,frames:720,duration:48,filename:privateName},
 windowPlan:{count:8,name:privateName},
 pipelineAudit:{elapsedMs:20230,encodedFrames:720,peakVideoEncodeQueue:3,
  jsHeapPeakBytes:null,encodedVideoBytes:99000,encodedAudioBytes:9000,
  filename:privateName,checkpoints:[{name:privateName}]},
 storageMetrics:{totalBytesWritten:160000,peakPendingBytes:65536,
  bufferLimitBytes:2*1048576,writeCount:48,filename:privateName},
 audioAudit:{packets:2251,rawPackets:[privateName]},
 colorAudit:{kind:"nclx",primaries:1,transfer:1,matrix:1,fullRange:false},
 sourceInfo:{name:privateName,pixels:privateName}
};
test("Rapport succès : seulement compteurs de ressources et liste blanche de confidentialité",()=>{
 const report=REPORT.success(result,{storageEstimate:{
  usage:2*1048576,quota:100*1048576,rawSource:privateName
 }});
 const json=REPORT.serialize(report);
 assert.equal(report.status,"local-mp4-created");
 assert.equal(report.physicalIphoneVerified,false);
 assert.equal(report.totalDeviceMemoryMeasured,false);
 assert.equal(report.pipeline.jsHeapPeakBytes,null);
 assert.equal(report.opfs.peakPendingBytes,65536);
 assert.equal(report.audio.packetsChecked,2251);
 assert.equal(report.originStorageEstimate.quotaBytes,100*1048576);
 assert.equal(report.privacy.privateMediaIncluded,false);
 assert.equal(report.privacy.automaticUpload,false);
 assert.ok(!json.includes(privateName));
 assert.ok(!json.includes("sourceInfo"));
 assert.ok(!json.includes("rawPackets"));
 assert.ok(!json.includes("checkpoints"));
 assert.ok(!json.includes("rawSource"));
 assert.ok(json.length<6000);
});
test("Rapport refus/annulation : ne copie jamais le message d'exception",()=>{
 const report=REPORT.failure({storageMode:"opfs",stage:"video",errorCode:privateName});
 const json=REPORT.serialize(report);
 assert.equal(report.status,"local-export-refused-or-cancelled");
 assert.equal(report.output,null);
 assert.equal(report.stage,"video");
 assert.ok(!json.includes(privateName));
 assert.equal(report.physicalIphoneVerified,false);
});
test("Rapport : validation du schéma et compteurs malformés",()=>{
 assert.throws(()=>REPORT.success(null),/invalide/);
 assert.throws(()=>REPORT.serialize({}),/inconnu/);
 const altered=REPORT.success({...result,plan:{width:-2,height:Infinity,
  fps:15,frames:720,duration:48},storageMetrics:{peakPendingBytes:Infinity}});
 assert.equal(altered.output.width,null);
 assert.equal(altered.output.height,null);
 assert.equal(altered.opfs.peakPendingBytes,null);
});
