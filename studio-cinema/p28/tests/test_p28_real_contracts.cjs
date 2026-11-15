"use strict";
/**
 * P28 cross-lab smoke: use the exact real NOVA / Directeur source modules
 * checked out from their own experimental branches, without modifying them.
 * All input measurements are fabricated and synthetic. No video files opened.
 */
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.resolve(__dirname,"../../..");
const bridge=require("../src/p28_readonly_bridge.cjs");
const novaPreflight=require(path.join(root,"crosslab/nova/experiences/nova-real-preflight.js"));
const novaDecision=require(path.join(root,"crosslab/nova/experiences/nova-decision.js"));
const directorQuality=require(path.join(root,"crosslab/director/directeur-qualite.js"));
const first=JSON.parse(fs.readFileSync(path.join(root,"studio-cinema/p25/results/proof/p25_crf_matrix_synthetic_report.json"),"utf8"));
const second=JSON.parse(fs.readFileSync(path.join(root,"studio-cinema/p26/results/proof/p26_second_generation_synthetic_report.json"),"utf8"));

function makeNovaReport(){
 const simulated={
   schema:"retoucheproai.nova.real-preflight.v1",version:1,
   status:"ready-for-export-attempt",readyForExportAttempt:true,
   source:{bytes:2048,videoCategory:"local-video",codec:"hevc",
     width:320,height:180,durationMs:1200,frames:15,estimatedSourceFps:12.5,
     name:"SECRET_USER_MOV.mov",personalNotes:"PRIVATE_NOTES"},
   audio:"aac-copy-verified",estimatedMiB:31,
   blockers:[],advisories:[],
   privacy:{mediaUploaded:false,rawMediaInReport:false,
     filenameInReport:false,automaticSharing:false,mediaModified:false},
   exportProposal:{width:320,height:180,fps:15,frames:18},
   privateExtra:"NEVER_EXPOSE_PERSON_INFO"
 };
 return JSON.parse(novaPreflight.serialiser(simulated));
}
function makeDirectorReport(){
 return directorQuality.evaluer(
 {noise:3.2,sharp:16,blk:{r:.25},p2:.10,p98:.90,shake:1.1,flicker:.020},
 {noise:2.7,sharp:14,blk:{r:.31},p2:.12,p98:.89,shake:.8,flicker:.010},
 {media:"video"}
 );
}
test("load real experimental NOVA serializer and Director quality contract",()=>{
 assert.equal(typeof novaPreflight.serialiser,"function");
 assert.equal(typeof directorQuality.evaluer,"function");
 assert.equal(typeof novaDecision.arbitrer,"function");
});
test("run actual NOVA report sanitizer, then P28 strips source info",()=>{
 const nova=makeNovaReport();
 assert.equal(nova.schema,"retoucheproai.nova.real-preflight.v1");
 assert.equal(nova.status,"ready-for-export-attempt");
 const result=bridge.makeHandoff(first,second,{novaPreflight:nova});
 assert.equal(result.nova_real_preflight_status.status,"ready-for-export-attempt");
 assert.equal(result.permissions.export_video,false);
 assert.equal(result.context_isolation.nova_ready_for_export_attempt_is_not_an_export_success,true);
 const text=JSON.stringify(result);
 assert.ok(!text.includes("SECRET_USER_MOV"));
 assert.ok(!text.includes("privateExtra"));
 assert.ok(!text.includes("2048"));
});
test("run actual Director quality comparator, then P28 retains only enum/counts",()=>{
 const q=makeDirectorReport();
 assert.equal(q.version,2);
 assert.equal(q.media,"video");
 const result=bridge.makeHandoff(first,second,{qualityReport:q});
 assert.equal(result.director_technical_quality_status.status,q.verdict);
 assert.equal(result.director_technical_quality_status.number_of_technical_signals_compared,q.compte.compare);
 assert.equal(result.director_technical_quality_status.realism_or_fidelity_certified,false);
 assert.ok(!JSON.stringify(result).includes("Contraste dynamique"));
});
test("NOVA candidate choice remains exactly the same before/after building P28",()=>{
 const source={luminance:.19,ecretage:.002,contours:.11};
 const candidate={
   id:"lumiere",mesures:{luminance:.24,ecretage:.003,contours:.112},
   ecart:.03,confiance:.85,prouvable:true
 };
 const baseline=novaDecision.arbitrer(source,[candidate]);
 const envelope=bridge.makeHandoff(first,second,{
   novaPreflight:makeNovaReport(),qualityReport:makeDirectorReport()
 });
 const after=novaDecision.arbitrer(source,[candidate]);
 assert.deepEqual(after,baseline);
 assert.equal(envelope.automatically_selected_candidate,null);
 assert.equal(envelope.advice_for_personal_file,null);
});
test("actual NOVA preflight 'ready' and actual Director quality warning cannot grant export permission",()=>{
 const r=bridge.makeHandoff(first,second,{
   novaPreflight:makeNovaReport(),qualityReport:makeDirectorReport()
 });
 assert.equal(r.scope,"nonproduction_diagnostic_contract_test");
 assert.equal(r.cinema_synthetic_research.applies_to_user_file,false);
 assert.equal(r.codec_recommendation,null);
 assert.deepEqual(Object.values(r.permissions),Array(8).fill(false));
});
test("P28 does not mutate actual NOVA report or Director quality report",()=>{
 const nova=makeNovaReport(),d=makeDirectorReport();
 const before=JSON.stringify([nova,d,first,second]);
 const result=bridge.makeHandoff(first,second,{novaPreflight:nova,qualityReport:d});
 assert.equal(JSON.stringify([nova,d,first,second]),before);
 assert.equal(result.cinema_synthetic_research.evidence_level,"synthetic-tested");
});
