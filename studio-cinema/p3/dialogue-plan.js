/* Retouche Cinema AI P3 — deterministic, offline, text-only timed dialogue plan. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.RetoucheCinemaDialogue=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const VERSION='cinema-p3-dialogue-v01';
 const check=(c,msg)=>{if(!c)throw new Error(msg)};
 const round=n=>Math.round(n*100)/100;
 function buildDialoguePlan(project,manifest){
  check(project&&manifest&&manifest.schema_version==='cinema-p2-render-v01','Manifeste vidéo P2 absent');
  check(project.schema_version==='cinema-p1.0','Projet Cinema P1 absent');
  check(project.mode==='text'||project.has_rights_confirmed===true,'Droits sur les références non confirmés');
  check(Array.isArray(project.shots)&&Array.isArray(manifest.shots),'Plans non valides');
  check(project.shots.length===manifest.shots.length,'Les plans ont changé depuis le dernier export');
  let at=0;const lines=[],timeline=[],ids=new Set();
  for(let i=0;i<project.shots.length;i++){
   const shot=project.shots[i], expected=manifest.shots[i];
   check(shot.id===expected.id && shot.duration_seconds===expected.duration_seconds,'Durée ou identité du plan modifiée');
   check(JSON.stringify(shot.character_ids)===JSON.stringify(expected.character_ids),'Personnage modifié depuis la préparation');
   check(!ids.has(shot.id),'Identifiants de plans dupliqués');ids.add(shot.id);
   const txt=String(shot.dialogue||'').trim();
   const duration=shot.duration_seconds;
   timeline.push({shot_id:shot.id,start_seconds:at,duration_seconds:duration,character_ids:shot.character_ids.slice()});
   if(txt){
    check(txt.length<=280,'Dialogue trop long pour une réplique');
    check(duration>=2,'Plan trop court pour une réplique');
    const speaker=shot.dialogue_speaker_id||(shot.character_ids.length===1?shot.character_ids[0]:null);
    check(speaker&&shot.character_ids.includes(speaker),'Choisir le personnage qui parle dans le plan '+shot.id);
    const estimated=Math.max(.5,txt.length/14.5);
    check(estimated<=duration-.6,'Allonger le plan ou raccourcir la réplique '+shot.id);
    const start=round(at+.3),end=round(at+duration-.2);
    lines.push({line_id:'line_'+shot.id,shot_id:shot.id,speaker_id:speaker,start_seconds:start,end_seconds:end,text:txt,voice:'fr',status:'not_generated'});
   }
   at+=duration;
  }
  check(at===manifest.total_duration_seconds,'Durée totale incohérente');
  return {schema_version:VERSION,project_kind:'dialogue_timing_only',video_manifest_schema:manifest.schema_version,total_duration_seconds:at,format:manifest.format,source_mode:manifest.source_mode,voice_engine:'offline_not_connected',rendered_audio:null,consent:{reference_media_included:false,voice_cloning_allowed:false,remote_transfer_approved:false,training_allowed:false},shots:timeline,lines};
 }
 function validateDialoguePlan(p,manifest){
  check(p&&p.schema_version===VERSION,'Schéma dialogue invalide');
  check(p.project_kind==='dialogue_timing_only'&&p.voice_engine==='offline_not_connected'&&p.rendered_audio===null,'Faux statut de rendu audio');
  check(p.consent?.reference_media_included===false&&p.consent.voice_cloning_allowed===false&&p.consent.remote_transfer_approved===false&&p.consent.training_allowed===false,'Autorisation invalide');
  check(p.total_duration_seconds===manifest.total_duration_seconds&&p.format===manifest.format,'Durée ou format incohérent');
  check(Array.isArray(p.shots)&&p.shots.length===manifest.shots.length,'Plans incohérents');
  let at=0;for(let i=0;i<p.shots.length;i++){const s=p.shots[i],m=manifest.shots[i];check(s.shot_id===m.id&&s.duration_seconds===m.duration_seconds&&s.start_seconds===at,'Synchronisation des plans invalide');at+=s.duration_seconds;}
  check(Array.isArray(p.lines)&&p.lines.length<=p.shots.length,'Répliques invalides');
  const observed=new Set();for(const l of p.lines){
   check(!observed.has(l.shot_id),'Plusieurs répliques par plan non supportées en P3');observed.add(l.shot_id);
   const s=p.shots.find(x=>x.shot_id===l.shot_id);
   check(s&&s.character_ids.includes(l.speaker_id),'Voix non reliée à un personnage du plan');
   check(l.start_seconds>=s.start_seconds&&l.end_seconds<=s.start_seconds+s.duration_seconds&&l.start_seconds<l.end_seconds,'Temps hors plan');
   check(typeof l.text==='string'&&l.text.trim().length>=1&&l.text.length<=280&&l.voice==='fr'&&l.status==='not_generated','Réplique invalide');
  }
  return true;
 }
 return {VERSION,buildDialoguePlan,validateDialoguePlan};
});
