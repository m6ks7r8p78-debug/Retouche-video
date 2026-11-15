"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const {
 SCHEMA,CRFS,GESTURES,validateP25,validateP26,qualityFlags,buildAdvisory,formatFrench,cli,
}=require("../src/p27_advisory.cjs");

const sizes={18:857919,25:579925,32:415229};
const errors={18:1.815919,25:2.149488,32:2.840385};
const observed={
 "18/18":[850935,1.906378,.107413,.047539],
 "18/25":[571598,2.202168,.443085,.13925],
 "18/32":[408259,2.895912,1.140226,.276611],
 "25/18":[768892,2.193435,.055189,.051522],
 "25/25":[569900,2.270703,.153647,.059874],
 "25/32":[404565,2.970299,.865714,.260005],
 "32/18":[671835,2.848495,.022663,.041213],
 "32/25":[512712,2.857937,.068442,.086369],
 "32/32":[407300,3.001038,.226478,.093833]
};
const peakFrames={lower_lip_bite:287,tongue_visible:431,lip_lick_lower:434,tongue_retract:454};
const deepCopy=x=>structuredClone(x);

function makeFixtures(){
 const p25={
  schema:"retouche-cinema-p25-crf-comparative-v1",
  status:"synthetic_matrix_measured",
  source:"P19_P21_P22_P23_procedural_only",
  no_real_users_or_private_media:true,iphone_safari_physically_tested:false,
  no_training:true,best_profile_for_users_certified:false,no_automatic_export_choice:true,
  frame_count:480,fps:60,crfs_compared:[18,25,32],
  profiles:CRFS.map(crf=>({
   crf,decoded_frames:480,temporal_transitions:479,status:"synthetic_profile_measured",
   p95_h264_color_error_in_mouth:errors[crf],p23_mp4_bytes_including_aac:sizes[crf],
   peak_results:Object.fromEntries(GESTURES.map(g=>[g,{decoded_mouth_changed_pixels:18}]))
  }))
 };
 const meta=()=>({codec:"h264",frames:480,fps:"60/1",width:720,height:720,aac_synthetic:true,duration_s:8});
 const p26={
  schema:"retouche-cinema-p26-second-generation-h264-v1",
  status:"synthetic_second_generation_measured",
  source:"P19_P21_P22_P23_P25_fictional_control_rendering_only",
  source_media_private:false,actual_people_or_real_annotations_used:false,
  training_performed:false,physical_iphone_safari_tested:false,
  no_automatic_app_integration:true,no_universal_crf_choice:true,
  reported_perceptual_stutter:false,second_generation_audio_preserved:true,
  video_stream_comparisons:9,frames_per_comparison:480,transitions_per_comparison:479,
  profiles_first_pass:[18,25,32],profiles_second_pass:[18,25,32],
  summary:CRFS.flatMap(first=>CRFS.map(second=>{
   const [endBytes,after,additional,temporal]=observed[first+"/"+second];
   return {
    pass1_crf:first,pass2_crf:second,
    first_mp4_bytes:sizes[first],second_mp4_bytes:endBytes,
    relative_size_change_pct:Number((100*(endBytes/sizes[first]-1)).toFixed(3)),
    first_metadata:meta(),second_metadata:meta(),
    frames_compared:480,transitions_compared:479,
    p95_first_generation_rgb_mae:errors[first],
    p95_second_generation_rgb_mae:after,
    p95_additional_rgb_mae_vs_source:additional,
    p95_adjacent_frame_change_perturbation:temporal,
    mean_pass1_rgb_mae:errors[first],
    mean_pass2_rgb_mae:after,
    audio_pcm_digest_equal:true,
    codec_perturbation_is_not_playback_stutter:true,
    gesture_realism_verified:false,
    gesture_peak_comparisons:Object.fromEntries(GESTURES.map(g=>[g,{
      frame:peakFrames[g],mae_pass1_vs_original:1,mae_pass2_vs_original:1.1,
      pass1_vs_pass2_changed_pixels_threshold8:40
    }]))
   };
  }))
 };
 return {p25,p26};
}
function reject(update,pattern){
 const {p25,p26}=makeFixtures();
 update(p25,p26);
 assert.throws(()=>buildAdvisory(p25,p26),pattern||/P27 evidence rejected/);
}

test("real schema and three synthetic first-pass tiers accepted",()=>{
 const {p25}=makeFixtures();
 assert.equal(validateP25(p25).size,3);
});
test("all nine source-joined second-generation rows validated",()=>{
 const {p25,p26}=makeFixtures();
 assert.equal(validateP26(p26,validateP25(p25)).length,9);
});
test("advisory is informational only, and all nine audio digests equal",()=>{
 const {p25,p26}=makeFixtures();const r=buildAdvisory(p25,p26);
 assert.equal(r.schema,SCHEMA);assert.equal(r.status,"consultative_synthetic_evidence_only");
 assert.equal(r.comparisons,9);assert.equal(r.frames_per_comparison,480);
 assert.equal(r.observed_counts.pairs_with_verified_identical_decoded_audio,9);
 assert.equal(r.app_control_contract.may_automatically_change_video,false);
 assert.equal(r.app_control_contract.may_autoselect_codec,false);
 assert.equal(r.app_control_contract.may_upload_media,false);
 assert.equal(r.recommendation,null);
});
test("measured risk flags reflect evidence without uncalibrated severity",()=>{
 const {p25,p26}=makeFixtures();const r=buildAdvisory(p25,p26);
 assert.equal(r.observed_counts.pairs_with_measured_p95_error_increase,9);
 assert.equal(r.observed_counts.pairs_with_file_size_growth_and_no_p95_fidelity_gain,3);
 assert.equal(r.observed_counts.pairs_with_additional_temporal_pixel_perturbation,9);
 assert.equal(r.cases.length,9);
 assert.ok(r.cases.every(v=>v.information_only && v.may_change_export_settings===false));
});
test("detailed 32 -> 18 example never claims restored lost detail",()=>{
 const {p25,p26}=makeFixtures();
 const row=buildAdvisory(p25,p26).cases.find(x=>x.pass1_crf===32&&x.pass2_crf===18);
 assert.equal(row.first_mp4_bytes,415229);
 assert.equal(row.second_mp4_bytes,671835);
 assert.equal(row.source_relative_p95_first,2.840385);
 assert.equal(row.source_relative_p95_second,2.848495);
 assert.ok(row.evidence_flags.includes("FILE_LARGER_WITH_NO_MEASURED_P95_FIDELITY_GAIN"));
});
test("percentile difference is distinguished from percentile of per-frame differences",()=>{
 const {p25,p26}=makeFixtures();const row=buildAdvisory(p25,p26).cases[0];
 assert.equal(row.difference_of_p95_values,.090459);
 assert.equal(row.p95_positive_per_frame_error_increase,.107413);
 assert.notEqual(row.difference_of_p95_values,row.p95_positive_per_frame_error_increase);
});
test("French report requires no media names, neutral toward CRF",()=>{
 const {p25,p26}=makeFixtures();const r=formatFrench(buildAdvisory(p25,p26));
 assert.match(r,/diagnostic de fidélité/);
 assert.match(r,/pas de sélection automatique/i);
 assert.match(r,/32 → 18/);
 assert.doesNotMatch(r,/CRF .*recommandé pour les utilisateurs/);
});
test("output deliberately drops arbitrary source paths, private annotations, identifiers",()=>{
 const {p25,p26}=makeFixtures();
 p25.profiles[0].private_filename="user-private-face.mp4";
 p26.summary[0].annotations="REVIEWER_PRIVATE_BIO";
 p26.summary[0].source_secret="t0ken-user-X";
 const serialized=JSON.stringify(buildAdvisory(p25,p26));
 for(const secret of ["user-private-face.mp4","REVIEWER_PRIVATE_BIO","t0ken-user-X"]){
  assert.ok(!serialized.includes(secret));
 }
});
test("CLI writes JSON and readable advisory and uses no video file",()=>{
 const {p25,p26}=makeFixtures();const folder=fs.mkdtempSync(path.join(os.tmpdir(),"p27-"));
 try{
  const a=path.join(folder,"a.json"),b=path.join(folder,"b.json"),out=path.join(folder,"result");
  fs.writeFileSync(a,JSON.stringify(p25));fs.writeFileSync(b,JSON.stringify(p26));
  const original=process.stdout.write;process.stdout.write=()=>true;
  try{cli([a,b,out]);}finally{process.stdout.write=original;}
  const report=JSON.parse(fs.readFileSync(path.join(out,"p27_synthetic_advisory.json"),"utf8"));
  assert.equal(report.comparisons,9);
  assert.ok(fs.readFileSync(path.join(out,"p27_synthetic_advisory_fr.md"),"utf8").length>500);
 }finally{fs.rmSync(folder,{recursive:true,force:true});}
});
test("CLI refuses missing evidence files",()=>assert.throws(()=>cli(["a.json"])));
test("CLI refuses unsupported format",()=>assert.throws(()=>cli(["video.mp4","x.json","out"]),/Only JSON/));
test("reject wrong P25 schema",()=>reject(a=>{a.schema="other"},/P25 schema/));
test("reject wrong P26 schema",()=>reject((a,b)=>{b.schema="other"},/P26 schema/));
test("reject missing P25 provenance",()=>reject(a=>{a.source="unknown"},/P25 provenance/));
test("reject P25 real person media flags",()=>reject(a=>{a.no_real_users_or_private_media=false},/P25 privacy/));
test("reject P26 privacy violation",()=>reject((a,b)=>{b.source_media_private=true},/P26 privacy/));
test("reject falsely claimed physical iPhone",()=>reject((a,b)=>{b.physical_iphone_safari_tested=true},/P26 physical/));
test("reject claims of model training",()=>reject((a,b)=>{b.training_performed=true},/P26 training/));
test("reject unsafe automatic policy",()=>reject((a,b)=>{b.no_automatic_app_integration=false},/P26 automatic/));
test("reject altered audio flag in one of nine cases",()=>reject((a,b)=>{b.summary[0].audio_pcm_digest_equal=false},/P26 verified AAC/));
test("reject false global audio confirmation",()=>reject((a,b)=>{b.second_generation_audio_preserved=false},/P26 AAC preservation/));
test("reject first-pass P95 mismatch across P25 and P26",()=>reject((a,b)=>{b.summary[0].p95_first_generation_rgb_mae=100},/differs between/));
test("reject first-pass MP4 byte mismatch",()=>reject((a,b)=>{b.summary[0].first_mp4_bytes++},/first-pass MP4 bytes/));
test("reject malformed relative size percent",()=>reject((a,b)=>{b.summary[0].relative_size_change_pct=999},/percentage does not match/));
test("reject missing source pair",()=>reject((a,b)=>{b.summary.pop()},/nine rows/));
test("reject duplicated source pair",()=>reject((a,b)=>{b.summary[1]=deepCopy(b.summary[0])},/duplicate pair/));
test("reject nonfinite metrics",()=>reject((a,b)=>{b.summary[0].p95_second_generation_rgb_mae=Infinity},/must be finite/));
test("reject negative metrics",()=>reject((a,b)=>{b.summary[0].p95_additional_rgb_mae_vs_source=-1},/negative/));
test("reject incomplete frame count",()=>reject((a,b)=>{b.summary[0].frames_compared=479},/decoded frames/));
test("reject incomplete transitions",()=>reject((a,b)=>{b.summary[0].transitions_compared=478},/transitions/));
test("reject forged perceptual stutter verification",()=>reject((a,b)=>{b.reported_perceptual_stutter=true},/subjective stutter/));
test("reject forged realism claim",()=>reject((a,b)=>{b.summary[0].gesture_realism_verified=true},/realism boundary/));
test("reject changed codec",()=>reject((a,b)=>{b.summary[0].first_metadata.codec="hevc"},/codec/));
test("reject lost AAC metadata",()=>reject((a,b)=>{b.summary[0].second_metadata.aac_synthetic=false},/synthetic audio/));
test("reject missing mouth gesture peaks",()=>reject((a,b)=>{delete b.summary[0].gesture_peak_comparisons.tongue_visible},/exactly four/));
test("reject missing first-pass profile",()=>reject(a=>{a.profiles.pop()},/three rows/));
test("reject arbitrary CRF",()=>reject((a,b)=>{b.summary[0].pass1_crf=17},/exact synthetic CRF/));
test("reject first-pass unknown status",()=>reject(a=>{a.profiles[0].status="production_ready"},/unknown P25/));
