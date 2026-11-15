/* Retouche Cinema P17 — clip-level direction from P16 performance cues and P2 render plans.
 * No model execution, media reads, network transfer, identity estimation or audience inference.
 * Author: Retouche Cinema AI research prototype.
 */
(function(root, factory){
  const api=factory(); if(typeof module==='object' && module.exports)module.exports=api;
  else root.RetoucheP17=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const VERSION='retouche-cinema-p17-directed-clips-v1';
const SCENES=['smoking','coffee','conversation','walk'];
const sceneActions={
  smoking:'Personnage adulte fictif : porte une cigarette aux lèvres, aspire doucement, retire puis expire la fumée.',
  coffee:'Personnage adulte fictif : prend une tasse, boit une gorgée puis repose la tasse.',
  conversation:'Personnage adulte fictif : écoute et répond avec pauses et expressions naturelles.',
  walk:'Personnage adulte fictif : marche d’un pas naturel, croise le regard de la caméra puis poursuit sa marche.'
};
const sceneProps={smoking:{id:'prop_cigarette',label:'une cigarette fictive, même géométrie et prise entre plans'},coffee:{id:'prop_tasse',label:'la même tasse entre tous les plans'}};
const round=(x)=>Math.round(x*1000)/1000;
function ensure(ok,msg){if(!ok)throw new Error(msg)}
function printable(s,max=180){ensure(typeof s==='string'&&s.trim().length>0,'Texte requis');return s.replace(/[\u0000-\u001f]/g,' ').trim().slice(0,max)}
function overlaps(a,b){return a.start_s<b.end_s-1e-6 && b.start_s<a.end_s-1e-6}
function localizeBeat(beat,clip){const a=Math.max(beat.start_s,clip.start_seconds),b=Math.min(beat.end_s,clip.start_seconds+clip.duration_seconds);
  if(b<=a+1e-6)return null;
  return {id:beat.id,layer:beat.layer,local_start_s:round(a-clip.start_seconds),local_end_s:round(b-clip.start_seconds),absolute_start_s:round(a),absolute_end_s:round(b),cues:beat.cues.slice(),direction:beat.direction};
}
function cueConflict(beatA,beatB){
  const a=beatA.cues,b=beatB.cues;
  const pair=(x,y)=>(a.includes(x)&&b.includes(y))||(a.includes(y)&&b.includes(x));
  if(pair('gaze_hold','gaze_away'))return 'regard_fixe_et_detourne';
  if(pair('mouth_contact','lip_lick'))return 'langue_et_filtre_simultanes';
  if(pair('mouth_contact','lip_bite'))return 'mordillement_et_filtre_simultanes';
  return null;
}
function inspectLayerConflicts(beats){
  const conflicts=[],seen=new Set();
  for(let i=0;i<beats.length;i++)for(let j=i+1;j<beats.length;j++){
    const a=beats[i],b=beats[j];if(!overlaps({start_s:a.local_start_s,end_s:a.local_end_s},{start_s:b.local_start_s,end_s:b.local_end_s}))continue;
    const type=cueConflict(a,b);if(!type)continue;
    const key=[a.id,b.id,type].sort().join(':');if(seen.has(key))continue;seen.add(key);
    conflicts.push({code:type,between:[a.id,b.id],local_overlap_start_s:round(Math.max(a.local_start_s,b.local_start_s)),local_overlap_end_s:round(Math.min(a.local_end_s,b.local_end_s)),requires_human_review:true});
  }
  return conflicts;
}
function planProject(spec, P16, P2){
  ensure(P16&&typeof P16.buildPlan==='function'&&P2&&typeof P2.makeRenderManifest==='function','Modules P16 et P2 requis');
  ensure(spec&&SCENES.includes(spec.scene),'Scène P17 non reconnue');
  ensure(Number.isInteger(spec.duration_s)&&spec.duration_s>=6&&spec.duration_s<=60,'Durée entière entre 6 et 60 secondes requise');
  const character=printable(spec.character_description||'Femme adulte fictive, apparence cohérente, tenue simple, mouvements naturels.',240);
  const scene=P16.buildPlan({fictional_adult:spec.fictional_adult,scene:spec.scene,duration_s:spec.duration_s,strengths:spec.strengths});
  const prop=sceneProps[spec.scene];
  const src={mode:'text',format:spec.format==='9:16'?'9:16':'16:9',characters:[{id:'character_01',description:character,identity_source:'fictional'}],
    props:prop?[prop]:[],shots:[{id:'shot_01',duration_seconds:spec.duration_s,character_ids:['character_01'],prop_ids:prop?[prop.id]:[],
    action:sceneActions[spec.scene],camera:spec.camera||'Plan moyen stable, légère profondeur de champ',location:spec.location||'Décor neutre avec lumière naturelle',dialogue:''}]};
  const maxClipSeconds=spec.maxClipSeconds??5;
  const manifest=P2.makeRenderManifest(src,{maxClipSeconds});P2.validateRenderManifest(manifest);
  const clips=[];
  for(const clip of manifest.clips){
    const active=scene.beats.map(b=>localizeBeat(b,clip)).filter(Boolean);
    const conflicts=inspectLayerConflicts(active);
    const starts=clip.start_seconds,ends=starts+clip.duration_seconds;
    const cuts=scene.beats.filter(b=>b.start_s<ends-1e-6&&b.end_s>ends+1e-6);
    const prev=scene.beats.filter(b=>b.start_s<starts-1e-6&&b.end_s>starts+1e-6);
    const prompts=active.map(b=>`${b.local_start_s.toFixed(2)}–${b.local_end_s.toFixed(2)} s [${b.layer}] ${b.direction}`);
    const text=[clip.prompt,'Direction du jeu (chronologie LOCALE de ce clip, en secondes) :',...prompts,
      'Conserver la même personne fictive, les objets, leur position et les expressions entre clips. Aucune nouvelle identité ni variation de vêtements.',
      'Ne pas confondre 60 images vidéo encodées avec 60 poses originales/s. Ne pas sauter la trajectoire main→objet→bouche.'];
    const prompt=text.join('\n');ensure(prompt.length<=3000,`Prompt trop long sur ${clip.clip_id}; réduire le nombre de couches.`);
    clips.push({clip_id:clip.clip_id,shot_id:clip.shot_id,start_seconds:starts,duration_seconds:clip.duration_seconds,
      original_seed:clip.seed,character_ids:clip.continuity.character_ids.slice(),object_ids:clip.continuity.prop_ids.slice(),
      source_prompt:clip.prompt,prompt,active_beats:active,continuity_from_previous_clip:prev.map(x=>x.id),
      continuity_into_next_clip:cuts.map(x=>x.id),needs_reference_frame_from_prior_clip:prev.length>0,
      known_conflicts:conflicts,quality_gate:conflicts.length?'review_required':'not_tested',
      render_status:'not_submitted',rendered_video:null,actual_unique_generated_frames:0});
  }
  const issues=clips.flatMap(c=>c.known_conflicts.map(x=>({...x,clip_id:c.clip_id})));
  const renderClips=manifest.clips.map((c,i)=>({...c,prompt:clips[i].prompt}));
  const renderManifest={...manifest,clips:renderClips,created_by:'Retouche Cinema AI P17 + P2',reference_note:'Plan de fiction textuelle seulement; aucune image de référence incluse'};
  P2.validateRenderManifest(renderManifest);
  const result={schema:VERSION,storyboard_only:true,fictional_adult:true,remote_transfer_approved:false,source_media_included:false,model_engine:'not_connected',
    render_status:'not_submitted',rendered_video:null,requested_fps:60,unique_frames_generated:0,scene:spec.scene,duration_s:spec.duration_s,
    p16_version:scene.schema,p2_version:manifest.schema_version,character_description:character,acting_plan:scene,
    p2_render_manifest:renderManifest,clips,issue_count:issues.length,issues,
    warnings:['Les contradictions de regard sont proposées pour revue, pas corrigées silencieusement.','Aucun modèle génératif n’a été lancé; tous les clips sont des consignes.',
      'L’effet de charme ou d’autorité est une direction de jeu, non une vérité sur une personne filmée.']};
  validateDirectedProject(result,P2);
  return result;
}
function validateDirectedProject(p,P2){
  ensure(p&&p.schema===VERSION&&p.storyboard_only===true&&p.fictional_adult===true,'Schéma P17 invalide');
  ensure(p.remote_transfer_approved===false&&p.source_media_included===false&&p.rendered_video===null&&p.model_engine==='not_connected','Données privées ou rendu imprévu');
  ensure(p.unique_frames_generated===0&&Array.isArray(p.clips)&&p.clips.length>0,'Frames inventées');
  P2.validateRenderManifest(p.p2_render_manifest);
  let at=0;
  for(let i=0;i<p.clips.length;i++){
    const c=p.clips[i];ensure(c.start_seconds===at && c.duration_seconds>0,'Horodatage P17 invalide');
    ensure(c.clip_id===p.p2_render_manifest.clips[i].clip_id,'Clips non alignés');
    ensure(c.render_status==='not_submitted' && c.rendered_video===null,'Faux résultat');
    for(const b of c.active_beats){ensure(b.local_start_s>=0&&b.local_end_s<=c.duration_seconds+.001&&b.local_end_s>b.local_start_s,'Beat hors durée')}
    at+=c.duration_seconds;
  }
  ensure(at===p.duration_s,'Durée incohérente');return true;
}
return {VERSION,planProject,inspectLayerConflicts,localizeBeat,cueConflict,validateDirectedProject};
});
