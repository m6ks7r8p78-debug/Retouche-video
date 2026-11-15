"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {
 SCHEMA,STATUS,projectNova,projectQuality,projectCinema,makeHandoff,formatFrench,cli
}=require("../src/p28_readonly_bridge.cjs");

const ROOT=path.resolve(__dirname,"../../..");
const source1=path.resolve(ROOT,"studio-cinema/p25/results/proof/p25_crf_matrix_synthetic_report.json");
const source2=path.resolve(ROOT,"studio-cinema/p26/results/proof/p26_second_generation_synthetic_report.json");
const load=()=>[
 JSON.parse(fs.readFileSync(source1,"utf8")),
 JSON.parse(fs.readFileSync(source2,"utf8")),
];
const validNova=()=>({
 schema:"retoucheproai.nova.real-preflight.v1",version:1,
 status:"ready-for-export-attempt",readyForExportAttempt:true,
 source:{bytes:22222,videoCategory:"local-video",codec:"hevc",
   width:300,height:200,filename:"PRIVATE_SAMPLE.mov",gps:"GPS_NOT_PUBLIC"},
 exportProposal:{width:300,height:200,fps:15,frames:20},
 privacy:{mediaUploaded:false,rawMediaInReport:false,filenameInReport:false,
    automaticSharing:false,mediaModified:false},
 privateNotes:"SPECIAL_PRIVATE_FACE_NOTES",
});
const validQuality=()=>({
 version:2,media:"video",verdict:"a_verifier",
 compte:{ameliore:1,degrade:1,stable:2,compare:4},
 alertes:["PRIVATE_USER_NOTE_ALERT"],
 constats:[{metric:"UserGPS","value":"PRIVATE_IDENTIFIER"}],
 preuve:"PRIVATE_REVIEW_COMMENT",
});
function doesNotLeak(value){
 const json=JSON.stringify(value);
 for(const privateItem of [
  "PRIVATE_SAMPLE.mov","GPS_NOT_PUBLIC","SPECIAL_PRIVATE_FACE_NOTES",
  "PRIVATE_USER_NOTE_ALERT","PRIVATE_IDENTIFIER","PRIVATE_REVIEW_COMMENT"
 ])assert.ok(!json.includes(privateItem),privateItem);
}
test("P28 accepts real regenerated P25/P26 reports and keeps synthetic scope",()=>{
 const [p25,p26]=load();
 const r=makeHandoff(p25,p26);
 assert.equal(r.schema,SCHEMA);
 assert.equal(r.status,STATUS);
 assert.equal(r.cinema_synthetic_research.reference_scope,"fictional_720x720_h264_only");
 assert.equal(r.cinema_synthetic_research.applies_to_user_file,false);
 assert.equal(r.cinema_synthetic_research.cases_compared,9);
});
test("matches measured 9/3/9/9 counts without inventing a recommendation",()=>{
 const c=projectCinema(...load());
 assert.equal(c.p95_color_error_increased_cases,9);
 assert.equal(c.size_increased_without_p95_fidelity_gain_cases,3);
 assert.equal(c.temporal_pixel_change_perturbation_cases,9);
 assert.equal(c.synthetic_aac_equal_cases,9);
 assert.equal(c.never_score_real_fidelity,true);
});
test("NOVA and Director absent are explicitly shown as not supplied",()=>{
 const r=makeHandoff(...load());
 assert.equal(r.nova_real_preflight_status.connection,"not_supplied");
 assert.equal(r.director_technical_quality_status.connection,"not_supplied");
});
test("known NOVA status is accepted but not certified for media fidelity",()=>{
 const x=projectNova(validNova());
 assert.equal(x.status,"ready-for-export-attempt");
 assert.equal(x.ready_for_attempt_reported_by_nova,true);
 assert.equal(x.readiness_is_not_fidelity_clearance,true);
});
test("NOVA refusal and cancellation statuses retain their honest origin",()=>{
 for(const status of ["cancelled","unsupported-video-codec","resource-budget","analysis-unavailable"]){
  const x=validNova();x.status=status;x.readyForExportAttempt=false;
  assert.equal(projectNova(x).status,status);
 }
});
test("Director technical result can never certify human realism",()=>{
 const r=projectQuality(validQuality());
 assert.equal(r.degraded_technical_signals,1);
 assert.equal(r.number_of_technical_signals_compared,4);
 assert.equal(r.realism_or_fidelity_certified,false);
});
test("generated report redacts all private source strings and unknown keys",()=>{
 const x=makeHandoff(...load(),{novaPreflight:validNova(),qualityReport:validQuality()});
 doesNotLeak(x);
 assert.ok(!JSON.stringify(x).includes('"source":{'));
});
test("P28 cannot modify media or choose export or candidate even if upstream is ready",()=>{
 const x=makeHandoff(...load(),{novaPreflight:validNova(),qualityReport:validQuality()});
 for(const key of ["export_video","change_codec","replace_original","modify_source",
  "upload_media","trigger_reconstruction","select_export_profile","write_application_state"]){
  assert.equal(x.permissions[key],false,key);
 }
 assert.equal(x.codec_recommendation,null);
 assert.equal(x.automatically_selected_candidate,null);
 assert.equal(x.advice_for_personal_file,null);
});
test("keeps NOVA preflight and Director diagnostic distinct from Cinema benchmark",()=>{
 const x=makeHandoff(...load(),{novaPreflight:validNova(),qualityReport:validQuality()});
 assert.equal(x.context_isolation.cinema_result_never_certifies_user_media,true);
 assert.equal(x.context_isolation.nova_ready_for_export_attempt_is_not_an_export_success,true);
 assert.equal(x.context_isolation.director_comparison_does_not_measure_realism,true);
 assert.equal(x.context_isolation.no_unapproved_crosslab_import_or_runtime_dependency,true);
});
test("returns only projection, source input untouched",()=>{
 const [a,b]=load();const nova=validNova(),dir=validQuality();
 const before=JSON.stringify([a,b,nova,dir]);
 makeHandoff(a,b,{novaPreflight:nova,qualityReport:dir});
 assert.equal(JSON.stringify([a,b,nova,dir]),before);
});
test("French report retains missing-vs-provided statuses and cautious wording",()=>{
 const r=formatFrench(makeHandoff(...load(),{novaPreflight:validNova(),qualityReport:validQuality()}));
 assert.match(r,/ready-for-export-attempt/);
 assert.match(r,/a_verifier/);
 assert.match(r,/vidéo d'un utilisateur/);
 assert.match(r,/aucune recommandation d'export/i);
 doesNotLeak(r);
});
test("bad NOVA schema rejected",()=>{
 const p=validNova();p.schema="fake";
 assert.throws(()=>projectNova(p),/NOVA preflight schema/);
});
test("bad NOVA version rejected",()=>{
 const p=validNova();p.version=3;
 assert.throws(()=>projectNova(p),/NOVA preflight version/);
});
test("NOVA status not a known code rejected",()=>{
 const p=validNova();p.status="magical-export-complete";
 assert.throws(()=>projectNova(p),/NOVA status/);
});
test("NOVA ready boolean cannot disagree with status",()=>{
 const p=validNova();p.readyForExportAttempt=false;
 assert.throws(()=>projectNova(p),/readiness.status/);
});
test("NOVA reports cannot claim uploaded media",()=>{
 const p=validNova();p.privacy.mediaUploaded=true;
 assert.throws(()=>projectNova(p),/mediaUploaded/);
});
test("NOVA cannot quietly remove a privacy field",()=>{
 const p=validNova();delete p.privacy.filenameInReport;
 assert.throws(()=>projectNova(p),/filenameInReport/);
});
test("NOVA source cannot claim modification",()=>{
 const p=validNova();p.privacy.mediaModified=true;
 assert.throws(()=>projectNova(p),/mediaModified/);
});
test("Director wrong version rejected",()=>{
 const p=validQuality();p.version=3;
 assert.throws(()=>projectQuality(p),/Directeur qualité version/);
});
test("Director photo result cannot be attached to Cinema video evidence",()=>{
 const p=validQuality();p.media="photo";
 assert.throws(()=>projectQuality(p),/Directeur qualité media scope/);
});
test("Director unknown verdict rejected",()=>{
 const p=validQuality();p.verdict="physical-realism-proven";
 assert.throws(()=>projectQuality(p),/Director quality verdict/);
});
test("Director invalid count totals rejected",()=>{
 const p=validQuality();p.compte.compare=999;
 assert.throws(()=>projectQuality(p),/counts incoherent/);
});
test("Director negative counts rejected",()=>{
 const p=validQuality();p.compte.degrade=-2;
 assert.throws(()=>projectQuality(p),/bounded count/);
});
test("Director overflowing signal counts rejected",()=>{
 const p=validQuality();p.compte.compare=2**54;
 assert.throws(()=>projectQuality(p),/bounded count/);
});
test("forged P25 provenance rejected even if report status says synthetic",()=>{
 const [a,b]=load();a.source="real_person_media";
 assert.throws(()=>makeHandoff(a,b),/P27 evidence rejected/);
});
test("P26 changed audio rejected before handoff",()=>{
 const [a,b]=load();b.summary[0].audio_pcm_digest_equal=false;
 assert.throws(()=>makeHandoff(a,b),/P27 evidence rejected/);
});
test("P26 mismatched P95 rejected before handoff",()=>{
 const [a,b]=load();b.summary[0].p95_first_generation_rgb_mae=1000;
 assert.throws(()=>makeHandoff(a,b),/P27 evidence rejected/);
});
test("P26 false physical Safari status rejected",()=>{
 const [a,b]=load();b.physical_iphone_safari_tested=true;
 assert.throws(()=>makeHandoff(a,b),/P27 evidence rejected/);
});
test("P25 duplicated profile refused",()=>{
 const [a,b]=load();a.profiles[1]=structuredClone(a.profiles[0]);
 assert.throws(()=>makeHandoff(a,b),/P27 evidence rejected/);
});
test("P26 missing pair refused",()=>{
 const [a,b]=load();b.summary.pop();
 assert.throws(()=>makeHandoff(a,b),/P27 evidence rejected/);
});
test("no raw video or filename appears in CLI output",()=>{
 const [a,b]=load();
 const r=makeHandoff(a,b);
 assert.equal(JSON.stringify(r).includes("P25_CRF18_synthetic_H264_AAC.mp4"),false);
});
test("fails closed if missing P25/P26 reports",()=>{
 assert.throws(()=>makeHandoff({},{}),/P27 evidence rejected/);
});
test("CLI refuses arguments without exact files",()=>{
 assert.throws(()=>cli(["fake.json"]),/usage/);
});
