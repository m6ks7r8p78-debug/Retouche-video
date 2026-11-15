'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
const lib=require('../av-fidelity-local.js');
let passes=0;const ok=(v,msg)=>{assert.ok(v,msg);passes++};const eq=(a,b,msg)=>{assert.deepEqual(a,b,msg);passes++};
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'retouche_synthetic_av_audit_'));
function run(args){cp.execFileSync('ffmpeg',['-nostdin','-hide_banner','-loglevel','error','-y',...args],{timeout:30000,stdio:'pipe'});}
function f(name){return new File([fs.readFileSync(path.join(tmp,name))],'fixture.mp4',{type:'video/mp4'})}
(async()=>{
 try{
  run(['-f','lavfi','-i','testsrc2=size=160x120:rate=30','-f','lavfi','-i','sine=frequency=770:sample_rate=44100','-t','2.2','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-c:a','aac','-b:a','64k','-shortest',path.join(tmp,'orig.mp4')]);
  run(['-i',path.join(tmp,'orig.mp4'),'-map','0','-c','copy','-movflags','+faststart',path.join(tmp,'good.mp4')]);
  run(['-t','1.8','-i',path.join(tmp,'orig.mp4'),'-map','0','-c','copy',path.join(tmp,'trim.mp4')]);
  run(['-i',path.join(tmp,'orig.mp4'),'-map','0:v','-c','copy',path.join(tmp,'silent.mp4')]);
  const orig=await lib.inspect(f('orig.mp4'));eq(orig.video.sampleCount,66);eq(orig.audio.codec,'mp4a');eq(orig.video.width,160);eq(orig.video.height,120);
  let r=await lib.audit(f('orig.mp4'),f('good.mp4'));eq(r.status,'metadata_consistent');eq(r.warnings.length,0);
  eq(r.action,'no_automatic_change');eq(r.confidence,'metadata_only');ok(!JSON.stringify(r).includes('fixture.mp4'),'File name must not leak');
  r=await lib.audit(f('orig.mp4'),f('trim.mp4'));eq(r.status,'needs_review');ok(r.warnings.some(x=>x.code==='video_sample_count_reduced'));ok(r.warnings.some(x=>x.code==='aac_sample_count_changed'));ok(r.metrics.videoSamplesDelta<0);
  r=await lib.audit(f('orig.mp4'),f('silent.mp4'));eq(r.status,'needs_review');ok(r.warnings.some(x=>x.code==='audio_track_presence_changed'));
  // Patch the original audio edit list media_time only to simulate lost priming.
  // This mutates synthetic metadata, never a real user's media or app export.
  const patch=fs.readFileSync(path.join(tmp,'orig.mp4'));
  const idx=patch.indexOf(Buffer.from('elst'));ok(idx>8,'AAC edit list exists');
  let was=0,found=false;
  // Find elst matching the audio's actual 1024-sample trim, and overwrite it with zero.
  // MP4 elst box: [size][elst][version flags][entries][segment duration][media time]
  let cur=0;while((cur=patch.indexOf(Buffer.from('elst'),cur))>=0){
    const version=patch[cur+4],entries=patch.readUInt32BE(cur+8);
    if(version===0&&entries===1&&cur+20<patch.length){
      const val=patch.readInt32BE(cur+16);
      if(val>0&&val<=4096){was=val;patch.writeInt32BE(0,cur+16);found=true;break}
    }cur+=4;
  }
  ok(found,'audio AAC trim edit list found');ok(was>=500,'positive synthetic AAC trim');
  const edited=new File([patch],'fixture.mp4',{type:'video/mp4'});
  r=await lib.audit(f('orig.mp4'),edited);eq(r.status,'needs_review');ok(r.warnings.some(x=>x.code==='aac_edit_trim_changed'));
  ok(Math.abs(r.metrics.audioEditTrimDeltaMs)>10);
  // A byte-level change in mdat is intentionally invisible to this metadata-only audit.
  // Therefore 'metadata_consistent' MUST NEVER be interpreted as pixel equality.
  const copy=fs.readFileSync(path.join(tmp,'orig.mp4'));
  const mdat=copy.indexOf(Buffer.from('mdat'));ok(mdat>0);copy[mdat+16]^=1;
  r=await lib.audit(f('orig.mp4'),new File([copy],'fixture.mp4',{type:'video/mp4'}));eq(r.status,'metadata_consistent');ok(r.limitations.includes('PAS'),'honest limitation included');
  // Range-read budget: only atom headers and moov, never the H264/AAC payload.
  const b=fs.readFileSync(path.join(tmp,'orig.mp4'));let total=0;
  const ranged={size:b.length,slice:(i,j)=>{total+=j-i;return new Blob([b.subarray(i,j)])}};
  await lib.inspect(ranged);ok(total<b.length/2,'metadata-only; must not read encoded media payload');
  const bad=new File([Buffer.from('not-an-mp4')],'fixture.mp4',{type:'video/mp4'});
  r=await lib.audit(f('orig.mp4'),bad);eq(r.status,'abstain_unsupported_mp4');eq(r.metrics,null);eq(r.warnings.length,0);
  r=await lib.audit(null,bad);eq(r.status,'abstain_unsupported_mp4');
  console.log(JSON.stringify({suite:'local_export_metadata_audit',passed:passes,syntheticOnly:true,
    confirmed:['remux','truncated','audio_missing','edit_list_trim_changed','payload_agnostic','bounded_reads','unsupported_abstains']}));
 }finally{fs.rmSync(tmp,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exitCode=1});