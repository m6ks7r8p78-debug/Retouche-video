/* P11 public annotation UI core. No network, no private media included. */
(function(global){'use strict';
const CHANNELS=['main','doigts','poignet','cigarette','filtre','levres','joues','regard','paupieres','tete','torse','fumee','audio','autre'];
const PHASES=['preparation','approche','contact','inspiration','maintien','retrait','pause','expiration','dispersion','regard_camera','clignement','autre'];
const VISIBILITY=['observe','incertain','non_visible'];
function validNumber(n){return typeof n==='number' && Number.isFinite(n)}
function importData(doc){
 if (!doc || doc.schema!=='retouche-cinema-p11-private-review-dossier-v1' ||
 !Array.isArray(doc.tasks)||!Array.isArray(doc.probes)||doc.tasks.length!==doc.probes.length||doc.tasks.length>500) throw Error('Dossier P11 invalide');
 const pairs=new Set();
 for(let i=0;i<doc.tasks.length;i++){
   const t=doc.tasks[i], p=doc.probes[i];
   if(!/^V\d{3}$/.test(t.video_id)||t.video_id!==p.video_id ||t.split!==p.split||
     t.scene_group!==p.scene_group ||!validNumber(t.start_s)||!validNumber(t.end_s)||
     t.start_s<0||t.end_s<=t.start_s||!Array.isArray(p.observations))throw Error('Passages non concordants');
   const key=[t.video_id,t.start_s,t.end_s].join(':');if(pairs.has(key))throw Error('Passage dupliqué');pairs.add(key);
 }
 return doc;
}
function addObservation({videoId, start, end, channel, phase, visibility, note, reviewerId}){
 if(!/^V\d{3}$/.test(videoId) ||!validNumber(start)||!validNumber(end)||start<0||end<=start||end>14400)throw Error('Temps invalides');
 if(!CHANNELS.includes(channel)||!PHASES.includes(phase)||!VISIBILITY.includes(visibility))throw Error('Catégorie invalide');
 if(typeof reviewerId!=='string'||reviewerId.trim().length<2||reviewerId.length>80)throw Error('Identifiant de relecteur requis');
 if(typeof note!=='string'||note.length>2000)throw Error('Note invalide');
 return {channel,phase,visibility,start_s:Number(start.toFixed(3)),end_s:Number(end.toFixed(3)),note:note.trim(),reviewer_id:reviewerId.trim(),point:null,manual:true,
  smoke_origin:'unknown',second_reviewer:'PENDING',inference_not_ground_truth:true};
}
function exportReview({task,reviewerId,observations}){
 if(!task||!/^V\d{3}$/.test(task.video_id)||!Array.isArray(observations))throw Error('Passage invalide');
 if(!observations.every(x=>x.reviewer_id===reviewerId))throw Error('Observations de relecteurs différents');
 return {schema:'retouche-cinema-p11-human-review-export-v1',privacy:'PRIVATE_METADATA_ONLY_NO_MEDIA',
    reviewer_id:reviewerId,source:{video_id:task.video_id,split:task.split,scene_group:task.scene_group,
      start_s:task.start_s,end_s:task.end_s},
    annotations:observations,source_pixels_or_audio_exported:false,
    independent_human_review_confirmed:false,smoking_action_verified:false,
    age_adult_verified:false,training_eligible:false};
}
global.P11Core={CHANNELS,PHASES,VISIBILITY,importData,addObservation,exportReview};
})(typeof module!=='undefined'&&module.exports?module.exports:window);
