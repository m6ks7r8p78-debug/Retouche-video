"use strict";
/**
 * Cinema P28 — *read-only* evidence handoff to the published experimental
 * NOVA_REAL_PREFLIGHT and DIRECTEUR_QUALITE contract shapes.
 *
 * NO media read, no file choice, no export, no codec recommendation, no
 * modification of either lab, no network or access to personal user data.
 * Cinema reference is ALWAYS synthetic and NEVER certifies an individual file.
 */
const fs=require("node:fs");
const path=require("node:path");
const {buildAdvisory}=require("../../p27/src/p27_advisory.cjs");

const SCHEMA="retouche-cinema-p28-crosslab-readonly-v1";
const NOVA_SCHEMA="retoucheproai.nova.real-preflight.v1";
const NOVA_STATUSES=new Set([
 "ready-for-export-attempt","not-video","file-budget","browser-unavailable",
 "insecure-context","container-unreadable","unsupported-video-codec",
 "hevc-profile-or-timeline-incompatible","resource-budget",
 "audio-not-preservable","analysis-unavailable","cancelled",
]);
const QUALITY_VERDICTS=new Set(["indetermine","a_verifier","mesures_en_progres","mesures_stables"]);
const STATUS="research_reference_only_no_export_clearance";

function demand(test,reason){
 if(!test)throw new TypeError("P28 read-only handoff refused: "+reason);
}
function obj(o,description){
 demand(o&&typeof o==="object"&&!Array.isArray(o),description+" object missing");
 return o;
}
function exact(value,expected,label){demand(value===expected,label+" changed");}
function safeCount(value,label){
 demand(Number.isSafeInteger(value)&&value>=0&&value<=1e6,label+" must be a bounded count");
 return value;
}
function onlyKnownEnum(value,allowed,label){
 demand(typeof value==="string"&&allowed.has(value),label+" unknown");
 return value;
}
function projectNova(p){
 if(p===undefined||p===null)return Object.freeze({
  connection:"not_supplied",status:null,local_input_status:"not_inspected_by_p28",
  readiness_is_not_fidelity_clearance:true,
 });
 obj(p,"NOVA preflight");
 exact(p.schema,NOVA_SCHEMA,"NOVA preflight schema");
 exact(p.version,1,"NOVA preflight version");
 const status=onlyKnownEnum(p.status,NOVA_STATUSES,"NOVA status");
 exact(p.readyForExportAttempt,status==="ready-for-export-attempt",
       "NOVA readiness/status consistency");
 const privacy=obj(p.privacy,"NOVA privacy");
 for(const key of ["mediaUploaded","rawMediaInReport","filenameInReport","automaticSharing","mediaModified"]){
  exact(privacy[key],false,"NOVA privacy "+key);
 }
 // Trust only the schema-level read-only status; do not include source metadata,
 // identifiers, file sizes, codec, or proposals in this exported evidence.
 return Object.freeze({
  connection:"status_only_contract",
  status,
  local_input_status:"evaluated_by_nova_not_by_cinema",
  ready_for_attempt_reported_by_nova:p.readyForExportAttempt,
  readiness_is_not_fidelity_clearance:true,
  privacy_flags_self_reported_not_external_audit:true,
 });
}
function projectQuality(q){
 if(q===undefined||q===null)return Object.freeze({
  connection:"not_supplied",status:null,realism_or_fidelity_certified:false,
 });
 obj(q,"Directeur qualité");
 exact(q.version,2,"Directeur qualité version");
 exact(q.media,"video","Directeur qualité media scope");
 const verdict=onlyKnownEnum(q.verdict,QUALITY_VERDICTS,"Directeur quality verdict");
 const count=obj(q.compte,"Director quality count");
 const ameliore=safeCount(count.ameliore,"improved");
 const degrade=safeCount(count.degrade,"degraded");
 const stable=safeCount(count.stable,"stable");
 const compared=safeCount(count.compare,"compared");
 demand(ameliore+degrade+stable===compared,"Directeur quality counts incoherent");
 // Do not forward free-form alerts, reasons, raw before/after signals, any
 // possible identifiers, or user video metadata.
 return Object.freeze({
  connection:"counts_only_contract",status:verdict,
  number_of_technical_signals_compared:compared,
  degraded_technical_signals:degrade,
  realism_or_fidelity_certified:false,
  no_quality_score_invented:true,
 });
}
function projectCinema(first,second){
 // Rebuild P27 from P25 and P26 each time to reject incomplete/mismatched
 // evidence; never trust an externally inserted 'green' status.
 const verified=buildAdvisory(first,second);
 exact(verified.schema,"retouche-cinema-p27-fidelity-advisory-v1","P27 schema");
 exact(verified.status,"consultative_synthetic_evidence_only","P27 synthetic status");
 exact(verified.evidence_level,"synthetic-tested","P27 evidence level");
 exact(verified.comparisons,9,"P27 comparisons");
 const policy=obj(verified.app_control_contract,"P27 policy");
 exact(policy.mode,"read_only_diagnostic","P27 policy");
 for(const key of ["may_autoselect_codec","may_automatically_change_video","may_upload_media"]){
  exact(policy[key],false,"P27 policy "+key);
 }
 exact(verified.recommendation,null,"P27 recommendation");
 const counts=obj(verified.observed_counts,"P27 observations");
 const p95=safeCount(counts.pairs_with_measured_p95_error_increase,"P27 error cases");
 const growth=safeCount(counts.pairs_with_file_size_growth_and_no_p95_fidelity_gain,"P27 size-growth cases");
 const audio=safeCount(counts.pairs_with_verified_identical_decoded_audio,"P27 AAC cases");
 const temporal=safeCount(counts.pairs_with_additional_temporal_pixel_perturbation,"P27 temporal cases");
 for(const n of [p95,growth,audio,temporal])demand(n<=9,"P27 counts exceed nine");
 demand(audio===9,"P27 synthetic audio must be verified in all cases");
 return Object.freeze({
  evidence_level:"synthetic-tested",reference_scope:"fictional_720x720_h264_only",
  applies_to_user_file:false,real_video_measured:false,
  cases_compared:9,
  p95_color_error_increased_cases:p95,
  size_increased_without_p95_fidelity_gain_cases:growth,
  temporal_pixel_change_perturbation_cases:temporal,
  synthetic_aac_equal_cases:audio,
  never_score_real_fidelity:true,
 });
}
function makeHandoff(p25,p26,{novaPreflight,qualityReport}={}){
 const cinema=projectCinema(p25,p26);
 const nova=projectNova(novaPreflight);
 const director=projectQuality(qualityReport);
 return Object.freeze({
  schema:SCHEMA,status:STATUS,version:1,
  scope:"nonproduction_diagnostic_contract_test",
  cinema_synthetic_research:cinema,
  nova_real_preflight_status:nova,
  director_technical_quality_status:director,
  context_isolation:{
   cinema_result_never_certifies_user_media:true,
   nova_ready_for_export_attempt_is_not_an_export_success:true,
   director_comparison_does_not_measure_realism:true,
   no_unapproved_crosslab_import_or_runtime_dependency:true,
  },
  permissions:{
   export_video:false,change_codec:false,replace_original:false,
   modify_source:false,upload_media:false,trigger_reconstruction:false,
   select_export_profile:false,write_application_state:false,
  },
  review_requirements:{
   independent_integration_pull_request:true,authorized_real_media_evaluation:true,
   physical_iphone_safari_validation:true,human_perceptual_review:true,
  },
  advice_for_personal_file:null,
  codec_recommendation:null,
  automatically_selected_candidate:null,
 });
}
function formatFrench(envelope){
 obj(envelope,"P28 output");
 exact(envelope.schema,SCHEMA,"P28 schema");
 const c=envelope.cinema_synthetic_research;
 const n=envelope.nova_real_preflight_status;
 const d=envelope.director_technical_quality_status;
 return [
  "# Cinema P28 — relais de diagnostic en lecture seule",
  "",
  "**Démonstration de laboratoire uniquement : aucune recommandation d'export.**",
  "",
  "Le laboratoire Cinema a étudié "+c.cases_compared+
    " compressions fictives : "+c.p95_color_error_increased_cases+
    " cas d'erreur couleur P95 accrue ; "+c.size_increased_without_p95_fidelity_gain_cases+
    " fichiers plus lourds sans meilleure fidélité selon la même mesure.",
  "",
  "**NOVA** — statut de précontrôle : "+(n.status||"non fourni")+
    ". Cette étape ne vaut ni autorisation d'export ni certificat de fidélité.",
  "",
  "**Directeur IA** — comparaison technique : "+(d.status||"non fournie")+
    ". Aucun score de naturel humain n'est inféré.",
  "",
  "**Important** : ces constats Cinema n'ont pas été mesurés sur la vidéo d'un utilisateur.",
  "",
  "Le contrat empêche la sélection automatique d'un CRF, l'altération ou le téléchargement d'un média, et toute affirmation de réussite Safari iPhone physique.",
  "",
  "Avant intégration : PR séparée, test privé sur source autorisée, analyse perceptive et essai physique iPhone Safari.",
  "",
 ].join("\n");
}
function cli(args){
 demand(args.length===3,"usage: node p28_readonly_bridge.cjs p25.json p26.json out_dir");
 const [a,b,dir]=args;
 demand(a.endsWith(".json")&&b.endsWith(".json"),"only source JSON reports allowed");
 const result=makeHandoff(JSON.parse(fs.readFileSync(a,"utf8")),JSON.parse(fs.readFileSync(b,"utf8")));
 fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(dir,"p28_readonly_handoff.json"),JSON.stringify(result,null,2)+"\n");
 fs.writeFileSync(path.join(dir,"p28_readonly_handoff_fr.md"),formatFrench(result));
 process.stdout.write(JSON.stringify({schema:result.schema,status:result.status,
  user_media_processed:false,export_allowed:false,proof:result.cinema_synthetic_research})+"\n");
 return result;
}
if(require.main===module){
 try{cli(process.argv.slice(2));}
 catch(error){console.error(error.message);process.exitCode=1;}
}
module.exports={SCHEMA,STATUS,projectNova,projectQuality,projectCinema,
 makeHandoff,formatFrench,cli};
