"use strict";

/**
 * Cinema P27 — advisory-only, fail-closed analysis of existing P25/P26 evidence.
 * This module NEVER reads video frames, chooses a codec, restores pixels,
 * makes a network call, alters a user's media, or changes RetoucheProAI.
 * It accepts ONLY exact synthetic P25 and P26 report contracts and returns
 * a small projected report with no media filenames/paths or raw input objects.
 */

const fs = require("node:fs");
const path = require("node:path");
const P25_SCHEMA = "retouche-cinema-p25-crf-comparative-v1";
const P26_SCHEMA = "retouche-cinema-p26-second-generation-h264-v1";
const SCHEMA = "retouche-cinema-p27-fidelity-advisory-v1";
const CRFS = Object.freeze([18, 25, 32]);
const GESTURES = Object.freeze(["lower_lip_bite", "lip_lick_lower", "tongue_visible", "tongue_retract"]);
const EPS = 0.00001;

function demand(ok, message) {
  if (!ok) throw new Error("P27 evidence rejected: " + message);
}
function object(value, label) {
  demand(value !== null && typeof value === "object" && !Array.isArray(value), label + " object required");
  return value;
}
function number(value, label, options={}) {
  demand(typeof value === "number" && Number.isFinite(value), label + " must be finite");
  if (options.nonnegative) demand(value >= 0, label + " cannot be negative");
  if (options.positive) demand(value > 0, label + " must be positive");
  if (options.integer) demand(Number.isSafeInteger(value), label + " must be an integer");
  return value;
}
function oneOfCrfs(value, name) {
  demand(typeof value === "number" && Number.isInteger(value) && CRFS.includes(value),
    name + " must use the exact synthetic CRF matrix");
  return value;
}
function exact(value, wanted, label) {
  demand(value === wanted, label + " unexpected; report cannot be trusted");
}
function approx(a, b, label) {
  number(a, label + " P25", {nonnegative:true});
  number(b, label + " P26", {nonnegative:true});
  demand(Math.abs(a-b) < EPS, label + " differs between P25 and P26");
}
function knownPeaks(peaks, label) {
  object(peaks, label);
  demand(Object.keys(peaks).length === GESTURES.length && GESTURES.every(g => Object.hasOwn(peaks,g)),
    label + " must include exactly four synthetic controls");
}
function videoMetadata(meta, label) {
  object(meta, label);
  exact(meta.codec, "h264", label + " codec");
  exact(meta.frames, 480, label + " frame count");
  exact(meta.fps, "60/1", label + " framerate");
  exact(meta.width, 720, label + " width");
  exact(meta.height, 720, label + " height");
  exact(meta.aac_synthetic, true, label + " synthetic audio presence");
  number(meta.duration_s, label + " duration", {positive:true});
  demand(Math.abs(meta.duration_s-8)<0.12, label + " duration must be 8 s");
}
function validateP25(data) {
  object(data, "P25 report");
  exact(data.schema,P25_SCHEMA,"P25 schema");
  exact(data.status,"synthetic_matrix_measured","P25 validation");
  exact(data.source,"P19_P21_P22_P23_procedural_only","P25 provenance");
  exact(data.no_real_users_or_private_media,true,"P25 privacy");
  exact(data.iphone_safari_physically_tested,false,"P25 physical device");
  exact(data.no_training,true,"P25 training");
  exact(data.best_profile_for_users_certified,false,"P25 overclaim");
  exact(data.no_automatic_export_choice,true,"P25 automatic export");
  exact(data.frame_count,480,"P25 frame count");
  exact(data.fps,60,"P25 fps");
  demand(Array.isArray(data.crfs_compared) && JSON.stringify(data.crfs_compared)===JSON.stringify(CRFS),
     "P25 CRF profile list must be exact");
  demand(Array.isArray(data.profiles) && data.profiles.length===3,"P25 must have three rows");
  const map=new Map();
  for(const p of data.profiles){
    object(p,"P25 row");
    const crf=oneOfCrfs(p.crf,"P25 CRF");
    demand(!map.has(crf),"duplicate P25 CRF");
    exact(p.decoded_frames,480,"P25 decoded frames");
    exact(p.temporal_transitions,479,"P25 transitions");
    demand(p.status==="synthetic_profile_measured" ||
           p.status==="human_review_required_signal_lost",
           "unknown P25 status");
    number(p.p95_h264_color_error_in_mouth,"P25 measured error",{nonnegative:true});
    number(p.p23_mp4_bytes_including_aac,"P25 MP4 size",{positive:true,integer:true});
    knownPeaks(p.peak_results,"P25 peak results");
    for(const g of GESTURES){
      const v=p.peak_results[g];
      object(v,"P25 peak "+g);
      number(v.decoded_mouth_changed_pixels,"P25 gesture signal",{integer:true,nonnegative:true});
    }
    map.set(crf,p);
  }
  demand(map.size===3,"P25 profile completeness");
  return map;
}
function validateP26(data, firstPass) {
  object(data,"P26 report");
  exact(data.schema,P26_SCHEMA,"P26 schema");
  exact(data.status,"synthetic_second_generation_measured","P26 validation");
  exact(data.source,"P19_P21_P22_P23_P25_fictional_control_rendering_only","P26 provenance");
  exact(data.source_media_private,false,"P26 privacy");
  exact(data.actual_people_or_real_annotations_used,false,"P26 real-person usage");
  exact(data.training_performed,false,"P26 training");
  exact(data.physical_iphone_safari_tested,false,"P26 physical device");
  exact(data.no_automatic_app_integration,true,"P26 automatic app integration");
  exact(data.no_universal_crf_choice,true,"P26 CRF policy");
  exact(data.reported_perceptual_stutter,false,"P26 subjective stutter");
  exact(data.second_generation_audio_preserved,true,"P26 AAC preservation");
  exact(data.video_stream_comparisons,9,"P26 comparison count");
  exact(data.frames_per_comparison,480,"P26 frames");
  exact(data.transitions_per_comparison,479,"P26 transitions");
  for(const field of ["profiles_first_pass","profiles_second_pass"]){
    demand(Array.isArray(data[field]) &&
      JSON.stringify(data[field])===JSON.stringify(CRFS),field+" must contain 18,25,32");
  }
  demand(Array.isArray(data.summary)&&data.summary.length===9,"P26 matrix must have nine rows");
  const found=new Set();
  for(const row of data.summary){
    object(row,"P26 matrix row");
    const a=oneOfCrfs(row.pass1_crf,"first pass CRF");
    const b=oneOfCrfs(row.pass2_crf,"second pass CRF");
    demand(!found.has(a+"/"+b),"P26 duplicate pair");
    found.add(a+"/"+b);
    exact(row.frames_compared,480,"P26 decoded frames");
    exact(row.transitions_compared,479,"P26 transitions");
    exact(row.audio_pcm_digest_equal,true,"P26 verified AAC");
    exact(row.codec_perturbation_is_not_playback_stutter,true,"P26 stutter boundary");
    exact(row.gesture_realism_verified,false,"P26 realism boundary");
    videoMetadata(row.first_metadata,"P26 first metadata");
    videoMetadata(row.second_metadata,"P26 second metadata");
    number(row.first_mp4_bytes,"P26 first size",{positive:true,integer:true});
    number(row.second_mp4_bytes,"P26 second size",{positive:true,integer:true});
    number(row.p95_first_generation_rgb_mae,"P26 first P95",{nonnegative:true});
    number(row.p95_second_generation_rgb_mae,"P26 second P95",{nonnegative:true});
    number(row.p95_additional_rgb_mae_vs_source,"P26 additional P95",{nonnegative:true});
    number(row.p95_adjacent_frame_change_perturbation,"P26 temporal perturbation",{nonnegative:true});
    number(row.mean_pass1_rgb_mae,"P26 first mean",{nonnegative:true});
    number(row.mean_pass2_rgb_mae,"P26 second mean",{nonnegative:true});
    number(row.relative_size_change_pct,"P26 relative size change");
    knownPeaks(row.gesture_peak_comparisons,"P26 peak comparisons");
    for(const g of GESTURES){
      const v=object(row.gesture_peak_comparisons[g],"P26 gesture peak");
      number(v.frame,"P26 gesture frame",{integer:true,nonnegative:true});
      demand(v.frame<480,"P26 gesture index too large");
      number(v.mae_pass1_vs_original,"P26 peak first delta",{nonnegative:true});
      number(v.mae_pass2_vs_original,"P26 peak second delta",{nonnegative:true});
      number(v.pass1_vs_pass2_changed_pixels_threshold8,"P26 peak changed pixels",{integer:true,nonnegative:true});
    }
    approx(firstPass.get(a).p95_h264_color_error_in_mouth,
      row.p95_first_generation_rgb_mae, a+" first-pass P95");
    exact(row.first_mp4_bytes,firstPass.get(a).p23_mp4_bytes_including_aac,
      a+" first-pass MP4 bytes");
    const actualPct=100*(row.second_mp4_bytes/row.first_mp4_bytes-1);
    demand(Math.abs(actualPct-row.relative_size_change_pct)<0.0015,
      "reported second-pass size percentage does not match bytes");
  }
  demand(found.size===9,"P26 matrix incomplete");
  return data.summary;
}
function qualityFlags(row) {
  const extra=row.p95_second_generation_rgb_mae-row.p95_first_generation_rgb_mae;
  const flags=[];
  if(extra>EPS) flags.push("MEASURED_ERROR_INCREASED_AFTER_SECOND_ENCODE");
  if(row.second_mp4_bytes>row.first_mp4_bytes &&
     extra>=-EPS) flags.push("FILE_LARGER_WITH_NO_MEASURED_P95_FIDELITY_GAIN");
  if(row.p95_adjacent_frame_change_perturbation>EPS)
    flags.push("ADDITIONAL_FRAME_TO_FRAME_PIXEL_PERTURBATION");
  return flags;
}
function round(x,n=6){return Number(x.toFixed(n));}
function buildAdvisory(p25,p26){
  const first=validateP25(p25);
  const rows=validateP26(p26,first);
  const advice=rows.map(row=>{
    const extra=row.p95_second_generation_rgb_mae-row.p95_first_generation_rgb_mae;
    return {
      pass1_crf:row.pass1_crf,
      pass2_crf:row.pass2_crf,
      first_mp4_bytes:row.first_mp4_bytes,
      second_mp4_bytes:row.second_mp4_bytes,
      relative_file_size_change_pct:row.relative_size_change_pct,
      source_relative_p95_first:row.p95_first_generation_rgb_mae,
      source_relative_p95_second:row.p95_second_generation_rgb_mae,
      difference_of_p95_values:round(extra),
      p95_positive_per_frame_error_increase:row.p95_additional_rgb_mae_vs_source,
      p95_frame_change_perturbation:row.p95_adjacent_frame_change_perturbation,
      audio_decoded_unchanged:true,
      evidence_flags:qualityFlags(row),
      information_only:true,
      may_change_export_settings:false,
    };
  }).sort((a,b)=>a.pass1_crf-b.pass1_crf||a.pass2_crf-b.pass2_crf);
  const warnings=Array.from(new Set(advice.flatMap(a=>a.evidence_flags))).sort();
  const status=advice.every(x=>x.information_only&&x.audio_decoded_unchanged)?
      "consultative_synthetic_evidence_only":"review_required";
  return {
    schema:SCHEMA,
    status,
    evidence_level:"synthetic-tested",
    data_origin:"fictional_P19_P21_P23_P25_P26_only",
    comparisons:9,
    frames_per_comparison:480,
    frame_transitions_per_comparison:479,
    groups_by_initial_compression:[18,25,32],
    measured_p25_p26_consistency:true,
    observed_information_codes:warnings,
    observed_counts:{
      pairs_with_measured_p95_error_increase:
        advice.filter(x=>x.evidence_flags.includes("MEASURED_ERROR_INCREASED_AFTER_SECOND_ENCODE")).length,
      pairs_with_file_size_growth_and_no_p95_fidelity_gain:
        advice.filter(x=>x.evidence_flags.includes("FILE_LARGER_WITH_NO_MEASURED_P95_FIDELITY_GAIN")).length,
      pairs_with_additional_temporal_pixel_perturbation:
        advice.filter(x=>x.evidence_flags.includes("ADDITIONAL_FRAME_TO_FRAME_PIXEL_PERTURBATION")).length,
      pairs_with_verified_identical_decoded_audio:advice.filter(x=>x.audio_decoded_unchanged).length,
    },
    cases:advice,
    app_control_contract:{
      mode:"read_only_diagnostic",
      may_autoselect_codec:false,
      may_automatically_change_video:false,
      may_upload_media:false,
      requires_separate_user_consent_and_integration_review:true,
      no_user_media_inspected:true,
    },
    limitations:[
      "Un score d'erreur RGB synthétique n'est pas calibré pour la perception humaine.",
      "Une perturbation temporelle de pixels ne prouve pas une saccade de lecture.",
      "Un CRF bas lors du second encodage ne restaure pas des détails déjà perdus.",
      "Les résultats 720p H.264 ne certifient pas HEVC, HDR, 4K, X ou Safari physique.",
      "Le rapport ne recommande aucun profil pour les vidéos personnelles.",
    ],
    physical_iphone_tested:false,
    neural_model_trained:false,
    actual_person_video_inspected:false,
    recommendation:null,
  };
}
function formatFrench(report){
  object(report,"P27 report");
  exact(report.schema,SCHEMA,"P27 output schema");
  const out=[
    "# Cinema P27 — diagnostic de fidélité après recompression",
    "",
    "**Preuve : synthétique seulement. Aucun réglage automatiquement recommandé.**",
    "",
    "P27 compare les chiffres mesurés des mêmes clips vectoriels fictifs P25 et P26. Les indicateurs ne constituent pas des scores de perception humaine.",
    "",
    "| CRF initial → suivant | Taille finale (Ko) | Erreur P95 initiale → finale | Évolution taille |",
    "|---|---:|---:|---:|",
  ];
  for(const row of report.cases){
    out.push("| "+row.pass1_crf+" → "+row.pass2_crf+" | "+
      round(row.second_mp4_bytes/1000,1).toFixed(1)+" | "+
      row.source_relative_p95_first.toFixed(3)+" → "+row.source_relative_p95_second.toFixed(3)+" | "+
      row.relative_file_size_change_pct.toFixed(1)+" % |");
  }
  out.push("",
    "**Constats techniques :** "+report.observed_counts.pairs_with_measured_p95_error_increase+
    "/9 cas augmentent l'erreur P95 ; "+
    report.observed_counts.pairs_with_file_size_growth_and_no_p95_fidelity_gain+
    "/9 cas augmentent la taille sans diminuer l'erreur P95 ; piste audio décodée identique dans "+
    report.observed_counts.pairs_with_verified_identical_decoded_audio+"/9 cas.",
    "",
    "**Garde-fou :** pas de sélection automatique de CRF, pas de modification ni envoi de vidéo, pas de résultat Safari iPhone physique.",
    "",
    "La **différence entre deux P95** n'est **pas** égale au P95 des différences image par image. Les deux mesures sont séparées dans le JSON.",
    "",
    ...report.limitations.map(s=>"- "+s),
    "",
    "Document produit à partir de données fictives et de tests de laboratoire, à examiner par le coordinateur avant toute intégration."
  );
  return out.join("\n")+"\n";
}
function main(argv){
  if(argv.length!==3 || argv[0]!=="--p25" || !argv[1] || !argv[2].startsWith("--p26=")){
    throw new Error("Usage: node studio-cinema/p27/src/p27_advisory.cjs --p25 path.json --p26=path.json [output-dir]");
  }
}
// Intentionally provide a simple strict CLI: no flags for runtime actions, only report paths.
function cli(args){
  demand(args.length===3,"Usage: node p27_advisory.cjs p25_report.json p26_report.json output_directory");
  const [first,second,out]=args;
  demand(first.endsWith(".json")&&second.endsWith(".json"),"Only JSON evidence files supported");
  const p25=JSON.parse(fs.readFileSync(first,"utf8"));
  const p26=JSON.parse(fs.readFileSync(second,"utf8"));
  const report=buildAdvisory(p25,p26);
  const dir=path.resolve(out);
  fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,"p27_synthetic_advisory.json"),JSON.stringify(report,null,2)+"\n");
  fs.writeFileSync(path.join(dir,"p27_synthetic_advisory_fr.md"),formatFrench(report));
  process.stdout.write(JSON.stringify({schema:report.schema,status:report.status,
    evidence:report.evidence_level,counts:report.observed_counts,automatic_actions:false})+"\n");
}
if(require.main===module){
  try{cli(process.argv.slice(2));}
  catch(error){console.error("P27 refused untrusted evidence:",error.message);process.exitCode=1;}
}
module.exports={SCHEMA,CRFS,GESTURES,validateP25,validateP26,qualityFlags,buildAdvisory,formatFrench,cli};
