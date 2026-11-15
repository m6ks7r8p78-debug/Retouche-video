/* Retouche Cinema AI P18 — measured 2D gesture chronology, continuity and provenance QA.
 * No anatomical/identity proof, no private media access and no remote requests.
 * Read-only annotations of fictional synthetic tests or authorized local clips.
 */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RetoucheP18=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const VERSION='retouche-cinema-p18-motion-continuity-v1';
const PHASES=['approach','contact','inhale','release','pause','exhale'];
const SOURCES=['synthetic_manual','synthetic_procedural','real_unvalidated'];
function must(v,m){if(!v)throw new Error(m)}
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const round=x=>Math.round(x*10000)/10000;
function point(x){must(Array.isArray(x)&&x.length===2&&x.every(v=>finite(v)&&v>=0&&v<=1),'Coordonnees 2D normalisees requises');return x}
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
function auditMeasured(input,opts={}){
 must(input&&SOURCES.includes(input.source_type),'Source: synthetic_manual, synthetic_procedural ou real_unvalidated seulement');
 must(input.recorded_from_pixels!==true,'Aucun octet image admis dans un audit JSON');
 const samples=input.samples;must(Array.isArray(samples)&&samples.length>=8&&samples.length<=20000,'Entre 8 et 20000 observations requises');
 const threshold=opts.maximum_normalized_speed_per_s??1.1;
 must(finite(threshold)&&threshold>=.2&&threshold<=5,'Seuil vitesse non valide');
 const issues=[],phases=[],seen=new Set(),temporal=new Map();let travel=0,contactCount=0,smokeCount=0,blinks=0,gaze=0,lowDetails=0;
 let last=null,releaseTime=null,inhaleEnd=null;
 function add(code,i,extra={}){issues.push({code,index:i,...extra})}
 for(let i=0;i<samples.length;i++){
  const f=samples[i];must(f&&finite(f.t)&&f.t>=0&&f.t<=3600,'Temps de frame invalide');
  must(PHASES.includes(f.phase),'Phase non reconnue');
  point(f.mouth_xy);point(f.filter_xy);point(f.hand_xy);
  must(typeof f.lip_contact==='boolean'&&typeof f.gaze_camera==='boolean','Observation contact/regard manquante');
  must(typeof f.mouth_smoke==='boolean'&&typeof f.blink==='boolean','Observation fumee/clignement manquante');
  must(['unknown','not_observed','subtle_visible'].includes(f.cheek_motion),'Statut joue non reconnu');
  must(['relaxed','sealed','rounded','parted','unknown'].includes(f.lip_shape),'Forme des levres non reconnue');
  if(f.smoke_origin_xy!=null)point(f.smoke_origin_xy);
  if(last){const dt=f.t-last.t;must(dt>.001 && dt<=3,'Horodatages non strictement croissants ou intervalle manquant');
    const vFilter=dist(f.filter_xy,last.filter_xy)/dt,vHand=dist(f.hand_xy,last.hand_xy)/dt;
    if(vFilter>threshold)add('cigarette_position_jump',i,{speed:round(vFilter)});
    if(vHand>threshold)add('hand_position_jump',i,{speed:round(vHand)});
    if(dist(f.filter_xy,f.hand_xy)>.22)add('hand_filter_attachment_unstable',i);
    travel+=dist(f.filter_xy,last.filter_xy);
    if(PHASES.indexOf(f.phase)<PHASES.indexOf(last.phase))add('phase_goes_backward',i);
  }
  if(i===0&&f.t>0.2)add('first_observation_too_late',i);
  if(f.phase==='contact'||f.phase==='inhale'){
    contactCount++;
    if(!f.lip_contact||dist(f.filter_xy,f.mouth_xy)>.085)add('contact_not_aligned',i);
  }
  if(f.phase==='inhale'){
    inhaleEnd=f.t;
    if(f.lip_shape!=='sealed')add('inhale_lip_seal_unconfirmed',i);
    if(f.cheek_motion!=='subtle_visible')lowDetails++;
  }
  if(f.phase==='release'&&releaseTime==null)releaseTime=f.t;
  if(f.mouth_smoke){smokeCount++;
    if(f.phase!=='exhale')add('mouth_smoke_outside_exhale',i);
    if(f.smoke_origin_xy==null)add('smoke_origin_unknown',i);
    else if(dist(f.smoke_origin_xy,f.mouth_xy)>.12&&f.phase==='exhale')add('smoke_not_from_mouth',i);
    if(inhaleEnd==null)add('smoke_without_prior_inhale',i);
  }
  if(f.phase==='exhale'&&f.lip_shape==='sealed')add('sealed_lips_during_exhale',i);
  if(f.blink)blinks++;
  if(f.gaze_camera)gaze++;
  if(!seen.has(f.phase)){seen.add(f.phase);temporal.set(f.phase,f.t)}
  last=f;
 }
 for(const p of PHASES)if(!seen.has(p))add('missing_'+p,-1);
 if(contactCount<2)add('contact_too_short_to_assess',-1);
 if(smokeCount===0)add('mouth_smoke_not_visible',-1);
 if(lowDetails>0)add('cheek_details_unverified',-1,{count:lowDetails});
 if(blinks===0&&last.t-samples[0].t>=4)add('eye_blink_not_visible',-1);
 if(releaseTime!=null&&inhaleEnd!=null&&releaseTime+.15<inhaleEnd)add('inhale_release_overlap',-1);
 const unique=[...new Set(issues.map(e=>e.code))];const observedDuration=round(samples.at(-1).t-samples[0].t);
 return {schema:VERSION,status:unique.length?'review_required':'candidate_only',source_type:input.source_type,
   origin:input.source_type==='synthetic_manual'?'synthetic_2d_points':input.source_type==='synthetic_procedural'?'synthetic_generated_control_points':'real_unvalidated_2d_points',
   sample_count:samples.length,observed_duration_s:observedDuration,
   measured_sample_rate_hz:round((samples.length-1)/Math.max(observedDuration,.00001)),
   issues,issue_codes:unique,
   first_phase_times:Object.fromEntries(temporal),
   gaze_camera_fraction:round(gaze/samples.length),blinks_observed:blinks,
   contact_frames:contactCount,exhale_frames:smokeCount,normalized_filter_travel:round(travel),
   annotation_reviewed:false,human_realism_proven:false,generated_original_frames:0,
   note:'Points 2D annotés fournis: contrôle de cohérence uniquement, aucune reconnaissance anatomique ni preuve de respiration.'};
}
function auditCrossClip(p,P2,P17){
 must(P17&&typeof P17.validateDirectedProject==='function','P17 requis');
 P17.validateDirectedProject(p,P2);
 const issues=[],clips=p.clips;
 for(let i=1;i<clips.length;i++){
  const a=clips[i-1],b=clips[i];const next=new Set(a.continuity_into_next_clip),prev=new Set(b.continuity_from_previous_clip);
  if(next.size!==prev.size||[...next].some(id=>!prev.has(id)))issues.push({code:'cut_continuity_mismatch',clip_id:b.clip_id});
  if(JSON.stringify(a.character_ids)!==JSON.stringify(b.character_ids))issues.push({code:'character_changes_at_cut',clip_id:b.clip_id});
  if(JSON.stringify(a.object_ids)!==JSON.stringify(b.object_ids))issues.push({code:'object_changes_at_cut',clip_id:b.clip_id});
  if(b.start_seconds!==a.start_seconds+a.duration_seconds)issues.push({code:'time_gap_or_overlap',clip_id:b.clip_id});
 }
 return {schema:VERSION,clips_checked:clips.length,cut_count:Math.max(0,clips.length-1),
  continuity_issues:issues,acting_conflicts:p.issues.map(e=>e.code),
  status:issues.length||p.issue_count?'review_required':'storyboard_candidate',
  render_authorized:false,media_transmitted:false,
  note:'Vérification d’instructions de scène; pas d’exécution GPU ni de preuve de contact réel.'};
}
function auditExternalAvailability(handoff){
 must(handoff?.kind==='requirements_only'&&handoff.export_video_now===false,'Contrat P17 non rendu exigé');
 const m=handoff.modules_available_in_this_bundle;
 must(m&&Object.values(m).every(v=>v===false),'La connexion de modules ne peut pas être affirmée sans les exécuter');
 return {nova:'researched_only',camera:'researched_only',pwa:'policy_only',video_generator:'not_connected',
  cannot_render:true,can_use_nova_15fps_as_60fps_renderer:false,
  reasoning:'NOVA 0.19 contient des audits intéressants mais l’ancien pilote d’export peut limiter à 15 i/s et 640 px. La sortie Cinema 60 i/s exige tests et moteur distinct.'};
}
return {VERSION,PHASES,auditMeasured,auditCrossClip,auditExternalAvailability};
});
