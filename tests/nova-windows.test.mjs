import test from "node:test";
import assert from "node:assert/strict";
import WINDOWS from "../experiences/nova-windows.js";
import TIMELINE from "../experiences/nova-timeline.js";
import EXPORT from "../experiences/nova-export.js";
import PREFLIGHT from "../experiences/nova-real-preflight.js";
test("Ancien profil non étendu: 12 secondes maximum même après ajout des fenêtres",()=>{
 assert.throws(()=>EXPORT.plan({duration:20,width:320,height:180,bytes:10000}),/12 secondes/);
 assert.throws(()=>EXPORT.plan({duration:24.1,width:320,height:180,bytes:10000,
  profile:"h264-windowed-24s"}),/24 secondes/);
 assert.equal(EXPORT.plan({duration:20,width:320,height:180,bytes:10000,
  profile:"h264-windowed-24s"}).frames,300);
});
test("20 secondes, 300 images et 4 fenêtres sans trou, chevauchement ou reset PTS",()=>{
 const timeline=TIMELINE.calculer(20,15,360);
 const r=WINDOWS.creer(timeline.entries);
 assert.equal(r.frames,300);
 assert.equal(r.durationUs,20000000);
 assert.equal(r.windows.length,4);
 assert.deepEqual(r.windows.map(w=>w.frameCount),[90,90,90,30]);
 assert.deepEqual(r.windows.map(w=>w.startIndex),[0,90,180,270]);
 assert.equal(r.windows[0].startUs,0);
 assert.equal(r.windows[3].endUs,20000000);
 assert.equal(r.mode,"single-mp4-windowed-video-continuous-aac");
 assert.equal(r.windows.reduce((sum,w)=>sum+w.frameCount,0),300);
 for(let i=1;i<r.windows.length;i++){
  assert.equal(r.windows[i].startUs,r.windows[i-1].endUs);
  assert.equal(r.windows[i].startIndex,r.windows[i-1].endIndex);
 }
});
test("Un plan de fenêtres truqué est refusé, sans composer de faux MP4",()=>{
 const original=TIMELINE.calculer(2,15,360).entries;
 assert.throws(()=>WINDOWS.creer([]),/timeline/);
 assert.throws(()=>WINDOWS.creer(original,{windowFrames:100}),/timeline/);
 assert.throws(()=>WINDOWS.creer(original.map((x,i)=>i===9?
  {...x,timestamp:x.timestamp+20}:x)),/timeline/);
 assert.throws(()=>WINDOWS.creer(original.map((x,i)=>i===2?
  {...x,index:100}:x)),/timeline/);
 assert.throws(()=>WINDOWS.creer(TIMELINE.calculer(24,15,360).entries.concat([
  {index:360,timestamp:24000000,duration:66667,seekSeconds:24}
 ])),/timeline/);
});
test("24s exactement = 4 fenêtres de 90 trames, mais 24.1s impossible",()=>{
 const timeline=TIMELINE.calculer(24,15,360);
 const r=WINDOWS.creer(timeline.entries);
 assert.equal(r.windows.length,4);
 assert.equal(r.durationUs,24000000);
});
test("OPFS explicite 48s : 720 images, 8 fenêtres contiguës, ancienne voie toujours limitée",()=>{
 assert.throws(()=>EXPORT.plan({duration:48,width:320,height:180,bytes:10000,
  profile:"h264-windowed-24s"}),/24 secondes/);
 assert.throws(()=>EXPORT.plan({duration:48.01,width:320,height:180,bytes:10000,
  profile:"h264-opfs-48s"}),/48 secondes/);
 const settings=EXPORT.plan({duration:48,width:320,height:180,bytes:10000,
  profile:"h264-opfs-48s"});
 assert.equal(settings.frames,720);
 const timeline=TIMELINE.calculer(48,15,720);
 assert.throws(()=>WINDOWS.creer(timeline.entries),/timeline/);
 const windows=WINDOWS.creer(timeline.entries,{profile:"h264-opfs-48s"});
 assert.equal(windows.frames,720);
 assert.equal(windows.durationUs,48000000);
 assert.equal(windows.windows.length,8);
 assert.deepEqual(windows.windows.map(w=>w.startUs),[
  0,6000000,12000000,18000000,24000000,30000000,36000000,42000000
 ]);
 assert.ok(windows.windows.every(w=>w.frameCount===90));
 for(let i=1;i<windows.windows.length;i++)
  assert.equal(windows.windows[i].startUs,windows.windows[i-1].endUs);
 assert.throws(()=>WINDOWS.creer(timeline.entries,{profile:"h264-opfs-96s"}),/timeline/);
});

test("Précontrôle local H264 20s sérialise 300 images, HEVC reste 12s",async()=>{
 const video={
  codec:"avc1.42C01E",W:320,H:180,dw:320,dh:180,ns:300,
  durationUs:20000000
 };
 const file={size:1000000,type:"video/mp4",name:"PERSONNE_PRIVEE.mov",slice(){}};
 const report=await PREFLIGHT.inspect({
  file,probe:async()=>video,
  getEnvironment:()=>({secureContext:true,videoEncoder:true,videoFrame:true,webAssembly:true}),
  h264Inspect:async()=>({
   schema:"retoucheproai.nova.h264-path.v1",status:"ready-for-export-attempt",
   audio:"aac-copy-verified",estimatedMiB:75.4,
   proposal:{width:320,height:180,fps:15,frames:300}
  })
 });
 assert.equal(report.readyForExportAttempt,true);
 assert.equal(report.sourceEngine,"webcodecs-h264-native-pts");
 const data=JSON.parse(PREFLIGHT.serialiser(report));
 assert.equal(data.exportProposal.frames,300);
 assert.equal(data.pilotLimits.maxDurationMs,48000);
 assert.equal(data.pilotLimits.outputSideMax,640);
 assert.equal(data.privacy.mediaUploaded,false);
 assert.equal(data.privacy.mediaModified,false);
 assert.ok(!JSON.stringify(data).includes("PERSONNE"));
});
