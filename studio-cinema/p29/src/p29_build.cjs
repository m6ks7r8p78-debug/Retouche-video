"use strict";
/**
 * P29 mobile preview builder. Accepts ONLY a verified synthetic P28 handoff.
 * Whitelisted numbers -> static local-only page. No uploads, no user media,
 * no API, no automatic edit/export, no hidden production integration.
 */
const fs=require("node:fs");
const path=require("node:path");
const SCHEMA="retouche-cinema-p29-synthetic-mobile-preview-v1";
const INPUT_SCHEMA="retouche-cinema-p28-crosslab-readonly-v1";
const PERMISSION_KEYS=[
 "export_video","change_codec","replace_original","modify_source",
 "upload_media","trigger_reconstruction","select_export_profile","write_application_state",
];
function check(ok,label){if(!ok)throw new TypeError("P29 cannot render unverified evidence: "+label)}
function obj(x,label){check(x!==null&&typeof x==="object"&&!Array.isArray(x),label+" object required");return x}
function exact(x,value,label){check(x===value,label+" unexpected")}
function count(x,label){check(Number.isSafeInteger(x)&&x>=0&&x<=9,label+" must be between 0 and 9");return x}
function verifiedPreview(handoff){
 obj(handoff,"P28 handoff");
 exact(handoff.schema,INPUT_SCHEMA,"P28 schema");
 exact(handoff.version,1,"P28 version");
 exact(handoff.status,"research_reference_only_no_export_clearance","P28 status");
 exact(handoff.scope,"nonproduction_diagnostic_contract_test","P28 scope");
 const policy=obj(handoff.permissions,"P28 permission policy");
 check(Object.keys(policy).length===PERMISSION_KEYS.length,"P28 permissions list changed");
 for(const key of PERMISSION_KEYS)exact(policy[key],false,"P28 permission "+key);
 exact(handoff.codec_recommendation,null,"P28 codec recommendation");
 exact(handoff.advice_for_personal_file,null,"P28 personal file advice");
 exact(handoff.automatically_selected_candidate,null,"P28 candidate");
 const context=obj(handoff.context_isolation,"P28 context isolation");
 for(const key of [
  "cinema_result_never_certifies_user_media",
  "nova_ready_for_export_attempt_is_not_an_export_success",
  "director_comparison_does_not_measure_realism",
  "no_unapproved_crosslab_import_or_runtime_dependency",
 ])exact(context[key],true,"P28 separation "+key);
 const c=obj(handoff.cinema_synthetic_research,"P28 synthetic research");
 exact(c.evidence_level,"synthetic-tested","synthetic proof");
 exact(c.reference_scope,"fictional_720x720_h264_only","P28 reference scope");
 exact(c.applies_to_user_file,false,"P28 applies to user file");
 exact(c.real_video_measured,false,"P28 real video");
 exact(c.never_score_real_fidelity,true,"P28 human fidelity restriction");
 exact(c.cases_compared,9,"P28 tested cases");
 const moreError=count(c.p95_color_error_increased_cases,"P28 worse color");
 const moreSize=count(c.size_increased_without_p95_fidelity_gain_cases,"P28 bigger no gain");
 const changes=count(c.temporal_pixel_change_perturbation_cases,"P28 temporal");
 const audio=count(c.synthetic_aac_equal_cases,"P28 sound preserved");
 exact(audio,9,"P28 synthetic audio verification");
 check(moreSize<=moreError,"P28 size-overhead warning must be subset of error-increase cases");
 const n=obj(handoff.nova_real_preflight_status,"P28 NOVA status");
 const d=obj(handoff.director_technical_quality_status,"P28 Director status");
 // Preview intentionally avoids presenting a status of a real user source.
 // If a caller submits a NOVA or Director state, reject it rather than
 // implying a live real-video assessment in a synthetic demonstration.
 exact(n.connection,"not_supplied","NOVA connection must be absent for synthetic preview");
 exact(d.connection,"not_supplied","Director connection must be absent for synthetic preview");
 return Object.freeze({
  schema:SCHEMA,
  status:"verified_synthetic_preview_only",
  source_label:"Démonstration de laboratoire — dessins fictifs",
  benchmark_cases:9,
  cases_color_error_increase:moreError,
  cases_file_larger_no_gain:moreSize,
  cases_temporal_pixel_change:changes,
  cases_audio_preserved:audio,
  user_video_analyzed:false,
  may_modify_or_export_video:false,
  physical_iphone_safari_tested:false,
  recommendation:null,
 });
}
function build(handoff,outputDir){
 const payload=verifiedPreview(handoff);
 const dir=path.resolve(outputDir);
 const src=path.resolve(__dirname,"../preview");
 fs.mkdirSync(dir,{recursive:true});
 for(const name of ["index.html","preview.js","preview.css"])
  fs.copyFileSync(path.join(src,name),path.join(dir,name));
 // No raw data strings are passed through; payload is fixed-schema and only
 // contains fixed authored text + validated bounded integers.
 const js="\"use strict\";\nwindow.CINEMA_P29_SYNTHETIC=Object.freeze("+JSON.stringify(payload)+");\n";
 fs.writeFileSync(path.join(dir,"preview-data.js"),js);
 fs.writeFileSync(path.join(dir,"p29_synthetic_preview_report.json"),
   JSON.stringify({schema:SCHEMA,preview_only:true,proof:payload,files:["index.html","preview.js","preview.css","preview-data.js"]},null,2)+"\n");
 return payload;
}
function cli(args){
 check(args.length===2,"usage: node p29_build.cjs p28_readonly_handoff.json output_folder");
 const [input,out]=args;
 check(input.endsWith(".json"),"source must be a JSON handoff");
 const result=build(JSON.parse(fs.readFileSync(input,"utf8")),out);
 process.stdout.write(JSON.stringify({status:result.status,cases:result.benchmark_cases,
  user_video_analyzed:false,automatic_export:false,physical_iphone_tested:false})+"\n");
}
if(require.main===module){
 try{cli(process.argv.slice(2))}
 catch(e){console.error(e.message);process.exitCode=1}
}
module.exports={SCHEMA,INPUT_SCHEMA,PERMISSION_KEYS,verifiedPreview,build,cli};
