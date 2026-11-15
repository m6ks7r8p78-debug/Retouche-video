/* Retouche Cinema P9 - locally entered annotations, not automatic pose detection.
 * No external dependencies, no network, no faces/pixels/voice in exported JSON.
 */
(function(root,factory){ const api=factory(); if(typeof module!=='undefined'&&module.exports)module.exports=api;root.RetoucheP9=api; })(typeof window!=='undefined'?window:globalThis,function(){
'use strict';
const CHANNELS = Object.freeze(['main','doigts','poignet','cigarette','filtre','levres','joues','regard','paupieres','tete','torse','fumee','audio','autre']);
const PHASES = Object.freeze(['preparation','approche','contact','inspiration','maintien','retrait','pause','expiration','dispersion','regard_camera','clignement','autre']);
const VISIBILITY = Object.freeze(['observe','incertain','non_visible']);
function clamp(t){return Math.max(0,Math.min(1,t))}
function num(t){return Number.isFinite(Number(t))?Number(t):NaN}
function validateAnnotation(a,duration){
 if(!a || !CHANNELS.includes(a.channel) || !PHASES.includes(a.phase) || !VISIBILITY.includes(a.visibility))throw Error('Canal/phase/visibilité non reconnu');
 const start=num(a.start_s),end=num(a.end_s);
 if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||end-start>120)throw Error('Intervalle temporel invalide');
 if(Number.isFinite(duration)&&duration>0&&end>duration+.1)throw Error('L’annotation dépasse la durée du clip');
 if(a.point!==null&&a.point!==undefined){if(!Array.isArray(a.point)||a.point.length!==2||a.point.some(v=>typeof v!=='number'||!Number.isFinite(v)||v<0||v>1))throw Error('Point normalisé incorrect');}
 if((a.note||'').length>1000)throw Error('Note trop longue');
 return {id:String(a.id||('annotation-'+Math.random().toString(36).slice(2,10))),channel:a.channel,phase:a.phase,visibility:a.visibility,
 start_s:Number(start.toFixed(3)),end_s:Number(end.toFixed(3)),point:a.point||null,note:String(a.note||''),manual:true,
 smoke_origin:a.smoke_origin==='mouth'||a.smoke_origin==='tip'?a.smoke_origin:'unknown'};
}
function buildProject(file,age,records,rights=false){
 if(!file||typeof file.name!=='string')throw Error('Video locale manquante');
 if(!['verified_adult','unknown','restricted'].includes(age))throw Error('Statut de majorité invalide');
 const dur=num(file.duration);
 const entries=records.map(a=>validateAnnotation(a,dur));
 const qa=evaluateEvidence(entries);
 return {schema:'retouche-cinema-p9-private-human-annotations-v1',
   privacy:'METADATA_ONLY_LOCAL_NO_MEDIA',
   source:{local_filename:file.name,size_bytes:file.size||null,duration_s:Number.isFinite(dur)?Number(dur.toFixed(3)):null},
   eligibility:{adult_evidence:age,rights_checked_by_annotator:!!rights,pre_review_complete:age==='verified_adult'&&!!rights&&entries.length>=8&&qa.independent_channels_checked>=8&&qa.chronological_warnings.length===0,ready_for_training:false,independent_human_adjudication:'PENDING'},
   annotations:entries,qa,no_pixels_exported:true,no_audio_exported:true,identity_proven:false};
}
function evaluateEvidence(a){
 const seen=new Set(a.filter(x=>x.visibility==='observe').map(x=>x.channel));
 const target=['main','doigts','poignet','filtre','levres','joues','regard','torse','fumee','audio'];
 const missing=target.filter(x=>!seen.has(x));
 const warning=[];
 const hits=(phase)=>a.filter(x=>x.phase===phase && x.visibility==='observe');
 const contact=hits('contact'),inhale=hits('inspiration'),release=hits('retrait'),exhale=hits('expiration');
 if(!contact.length)warning.push('contact_filtre_levres_non_annote');
 if(!inhale.length)warning.push('inspiration_non_annotee');
 if(!release.length)warning.push('retrait_non_annote');
 if(!exhale.length)warning.push('expiration_non_annotee');
 if(contact.length&&inhale.length&&Math.min(...inhale.map(x=>x.start_s))<Math.min(...contact.map(x=>x.start_s))-.15)warning.push('inspiration_avant_contact_verifier');
 if(release.length&&exhale.length&&Math.min(...exhale.map(x=>x.start_s))<Math.min(...release.map(x=>x.start_s))-.15)warning.push('expiration_avant_retrait_verifier');
 if(a.some(x=>x.channel==='fumee'&&x.smoke_origin==='unknown'))warning.push('origine_fumee_non_distinguee');
 return {annotation_count:a.length,observed_channels:[...seen],missing_observed_channels:missing,
  independent_channels_checked:target.length-missing.length,
  chronological_warnings:warning,quality_claim:'ANNOTATION_HUMAINE_SEULEMENT',
  not_recognized_automatically:true};
}
return Object.freeze({CHANNELS,PHASES,VISIBILITY,validateAnnotation,buildProject,evaluateEvidence});
});
