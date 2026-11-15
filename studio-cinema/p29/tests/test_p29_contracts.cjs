"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const {SCHEMA,INPUT_SCHEMA,PERMISSION_KEYS,verifiedPreview,build,cli}
 =require("../src/p29_build.cjs");

function sample(){
 const perms={};for(const k of PERMISSION_KEYS)perms[k]=false;
 return {
  schema:INPUT_SCHEMA,version:1,
  status:"research_reference_only_no_export_clearance",
  scope:"nonproduction_diagnostic_contract_test",
  permissions:perms,codec_recommendation:null,
  advice_for_personal_file:null,automatically_selected_candidate:null,
  context_isolation:{
   cinema_result_never_certifies_user_media:true,
   nova_ready_for_export_attempt_is_not_an_export_success:true,
   director_comparison_does_not_measure_realism:true,
   no_unapproved_crosslab_import_or_runtime_dependency:true,
  },
  cinema_synthetic_research:{
   evidence_level:"synthetic-tested",reference_scope:"fictional_720x720_h264_only",
   applies_to_user_file:false,real_video_measured:false,
   never_score_real_fidelity:true,cases_compared:9,
   p95_color_error_increased_cases:9,
   size_increased_without_p95_fidelity_gain_cases:3,
   temporal_pixel_change_perturbation_cases:9,
   synthetic_aac_equal_cases:9
  },
  nova_real_preflight_status:{connection:"not_supplied",status:null},
  director_technical_quality_status:{connection:"not_supplied",status:null}
 };
}
function reject(change,pattern){
 const x=sample();change(x);
 assert.throws(()=>verifiedPreview(x),pattern||/P29 cannot render unverified evidence/);
}
test("P29 accepts conservative P28 research state",()=>{
 const x=verifiedPreview(sample());
 assert.equal(x.schema,SCHEMA);assert.equal(x.status,"verified_synthetic_preview_only");
 assert.equal(x.benchmark_cases,9);assert.equal(x.cases_color_error_increase,9);
 assert.equal(x.cases_file_larger_no_gain,3);
 assert.equal(x.cases_temporal_pixel_change,9);
 assert.equal(x.cases_audio_preserved,9);
});
test("P29 makes no export or personal video assertion",()=>{
 const x=verifiedPreview(sample());
 assert.equal(x.user_video_analyzed,false);
 assert.equal(x.may_modify_or_export_video,false);
 assert.equal(x.physical_iphone_safari_tested,false);
 assert.equal(x.recommendation,null);
});
test("P29 projects only safe fields even if input contains private strings",()=>{
 const x=sample();
 x.identity="PRIVATE_PERSON_NAME";x.nova_real_preflight_status.path="/Users/private.mov";
 x.cinema_synthetic_research.userFilename="SECRET_USER_FILE.mp4";
 const out=JSON.stringify(verifiedPreview(x));
 for(const word of ["PRIVATE_PERSON_NAME","private.mov","SECRET_USER_FILE.mp4"])
  assert.ok(!out.includes(word));
});
test("P29 generated preview contains ONLY static local resources and bounded numbers",()=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),"cinema-p29-"));
 try{
  const output=build(sample(),folder);
  assert.equal(output.cases_file_larger_no_gain,3);
  const files=fs.readdirSync(folder).sort();
  assert.deepEqual(files,["index.html","p29_synthetic_preview_report.json",
    "preview-data.js","preview.css","preview.js"]);
  const data=fs.readFileSync(path.join(folder,"preview-data.js"),"utf8");
  assert.match(data,/verified_synthetic_preview_only/);
  assert.match(data,/user_video_analyzed":false/);
  assert.doesNotMatch(data,/PRIVATE_USER/);
  assert.doesNotMatch(data,/XMLHttpRequest|fetch\(|VideoEncoder/);
 }finally{fs.rmSync(folder,{recursive:true,force:true});}
});
test("P29 builder does not mutate input report",()=>{
 const obj=sample(),snapshot=JSON.stringify(obj);
 verifiedPreview(obj);
 assert.equal(JSON.stringify(obj),snapshot);
});
test("reject arbitrary source schema",()=>reject(x=>{x.schema="real-private"}));
test("reject missing source schema",()=>reject(x=>{delete x.schema}));
test("reject wrong source version",()=>reject(x=>{x.version=2}));
test("reject production state",()=>reject(x=>{x.status="production-verified"}));
test("reject production app scope",()=>reject(x=>{x.scope="integrated_in_real_app"}));
for(const key of PERMISSION_KEYS){
 test("reject permission escalation "+key,()=>reject(x=>{x.permissions[key]=true}));
}
test("reject missing protection key",()=>reject(x=>{delete x.permissions.upload_media}));
test("reject unexpected protection key",()=>reject(x=>{x.permissions.some_new_future_export=true}));
test("reject codec recommendation",()=>reject(x=>{x.codec_recommendation=18}));
test("reject personalized advice",()=>reject(x=>{x.advice_for_personal_file={quality:"bad"}}));
test("reject auto candidate",()=>reject(x=>{x.automatically_selected_candidate="smooth"}));
for(const key of [
 "cinema_result_never_certifies_user_media",
 "nova_ready_for_export_attempt_is_not_an_export_success",
 "director_comparison_does_not_measure_realism",
 "no_unapproved_crosslab_import_or_runtime_dependency",
]){
 test("reject lost isolation "+key,()=>reject(x=>{x.context_isolation[key]=false}));
}
test("reject real source provenance",()=>reject(x=>{x.cinema_synthetic_research.reference_scope="real_videos"}));
test("reject wrong evidence level",()=>reject(x=>{x.cinema_synthetic_research.evidence_level="physical-iphone-tested"}));
test("reject wrongly attached personal file",()=>reject(x=>{x.cinema_synthetic_research.applies_to_user_file=true}));
test("reject measured real videos",()=>reject(x=>{x.cinema_synthetic_research.real_video_measured=true}));
test("reject realism certification",()=>reject(x=>{x.cinema_synthetic_research.never_score_real_fidelity=false}));
test("reject incomplete case count",()=>reject(x=>{x.cinema_synthetic_research.cases_compared=8}));
test("reject out-of-range color count",()=>reject(x=>{x.cinema_synthetic_research.p95_color_error_increased_cases=10}));
test("reject negative size count",()=>reject(x=>{x.cinema_synthetic_research.size_increased_without_p95_fidelity_gain_cases=-1}));
test("reject noninteger temporal count",()=>reject(x=>{x.cinema_synthetic_research.temporal_pixel_change_perturbation_cases=8.4}));
test("reject missing verified audio",()=>reject(x=>{x.cinema_synthetic_research.synthetic_aac_equal_cases=8}));
test("reject contradictory result counts",()=>reject(x=>{
 x.cinema_synthetic_research.p95_color_error_increased_cases=2;
 x.cinema_synthetic_research.size_increased_without_p95_fidelity_gain_cases=3;
}));
test("reject live NOVA media status in a synthetic-only demo",()=>reject(x=>{
 x.nova_real_preflight_status.connection="status_only_contract";
 x.nova_real_preflight_status.status="ready-for-export-attempt";
}));
test("reject live Director media comparison in a synthetic-only demo",()=>reject(x=>{
 x.director_technical_quality_status.connection="counts_only_contract";
 x.director_technical_quality_status.status="a_verifier";
}));
test("reject missing status object",()=>reject(x=>{delete x.nova_real_preflight_status}));
test("reject absent Director report",()=>reject(x=>{delete x.director_technical_quality_status}));
test("CLI refuses any input other than 2 arguments",()=>assert.throws(()=>cli([])));
test("CLI refuses media input file",()=>assert.throws(()=>cli(["film.mp4","out"])));
test("CSP and markup prohibit media imports and display experimental warning",()=>{
 const file=fs.readFileSync(path.resolve(__dirname,"../preview/index.html"),"utf8");
 assert.match(file,/connect-src 'none'/);
 assert.match(file,/media-src 'none'/);
 assert.match(file,/DÉMONSTRATION SYNTHÉTIQUE/);
 assert.match(file,/Aucune de vos vidéos n'a été analysée/);
 assert.doesNotMatch(file,/<input\b|<video\b|<form\b/);
 assert.match(file,/aria-live="polite"/);
 assert.match(file,/aria-expanded="false"/);
});
test("browser code has no network, media, storage, download or source edits",()=>{
 const file=fs.readFileSync(path.resolve(__dirname,"../preview/preview.js"),"utf8");
 assert.doesNotMatch(file,/\bfetch\s*\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage|indexedDB|VideoEncoder|VideoDecoder|FileReader|URL\.createObjectURL|document\.write|innerHTML|\.download/);
 assert.match(file,/textContent/);
 assert.match(file,/details\.hidden/);
});
