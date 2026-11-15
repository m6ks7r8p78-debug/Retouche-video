/* Retouche Cinema AI P2 — text-only render plan: deterministic, offline, no network, no media bytes. */
(function(root,factory){const api=factory(); if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.RetoucheCinemaRenderPlan=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const VERSION='cinema-p2-render-v01', MAX_CLIPS=120, MAX_SHOTS=16, MAX_SECONDS=600, MAX_PROMPT=3000;
 const MIN_CHUNK=1, MAX_CHUNK=5;
 function assert(condition,message){if(!condition)throw new Error(message)}
 function safeText(v,n){return String(v??'').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'').slice(0,n)}
 function hash(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return (h>>>0)}
 function sanitizeProject(source){
  assert(source&&typeof source==='object'&&!Array.isArray(source),'Projet absent');
  assert(Array.isArray(source.shots)&&source.shots.length>=1&&source.shots.length<=MAX_SHOTS,'Nombre de plans invalide');
  assert(Array.isArray(source.characters)&&source.characters.length>=1&&source.characters.length<=8,'Personnages invalides');
  assert(['text','photo','video'].includes(source.mode),'Mode invalide');
  if(source.mode!=='text') assert(source.has_rights_confirmed===true,'Droits sur les références non confirmés');
  const format=source.format==='9:16'?'9:16':'16:9',ch=new Map();
  source.characters.forEach(c=>{
    assert(c&&/^character_[A-Za-z0-9_]{1,64}$/.test(c.id),'Identifiant de personnage invalide');
    assert(!ch.has(c.id),'Personnage dupliqué');
    ch.set(c.id,{id:c.id,description:safeText(c.description,240),fictional:c.identity_source==='fictional'});
  });
  const props=new Map();(source.props||[]).forEach(p=>{if(p&&typeof p.id==='string'&&/^[a-zA-Z0-9_\-]{1,80}$/.test(p.id)) props.set(p.id,safeText(p.label,120))});
  const ids=new Set(),shots=[];let duration=0;
  for(const s of source.shots){
    assert(s&&/^shot_[A-Za-z0-9_]{1,64}$/.test(s.id),'Identifiant de plan invalide');
    assert(!ids.has(s.id),'Plan dupliqué');ids.add(s.id);
    assert(typeof s.action==='string'&&s.action.trim().length>=3,'Action manquante');
    assert(Number.isInteger(s.duration_seconds)&&s.duration_seconds>=1&&s.duration_seconds<=120,'Durée de plan invalide');
    assert(Array.isArray(s.character_ids)&&s.character_ids.every(id=>ch.has(id)),'Personnage non répertorié');
    assert(Array.isArray(s.prop_ids)&&s.prop_ids.length<=30,'Objets invalides');
    duration+=s.duration_seconds;
    shots.push({id:s.id,action:safeText(s.action,700),dialogue:safeText(s.dialogue,500),location:safeText(s.location,100),camera:safeText(s.camera,80),character_ids:s.character_ids.slice(),prop_ids:s.prop_ids.filter(p=>props.has(p)).slice(0,30),duration_seconds:s.duration_seconds});
  }
  assert(duration<=MAX_SECONDS,'Projet supérieur à dix minutes');
  return {format,mode:source.mode,characters:[...ch.values()],props:[...props].map(([id,label])=>({id,label})),shots,total_duration_seconds:duration};
 }
 function promptFor(shot,data){
  const cast=shot.character_ids.map(id=>data.characters.find(c=>c.id===id)).filter(Boolean);
  const clothing=cast.map(c=>`${c.id} : ${c.description}`).join('; ');
  const objects=shot.prop_ids.map(id=>data.props.find(p=>p.id===id)?.label||id).join(', ');
  const text=[
   'Plan cinématographique cohérent, mouvements naturels, continuité stricte des sujets, cadrage stable.',
   `Lieu : ${shot.location||'Décor à définir'}. Cadrage : ${shot.camera||'Plan moyen'}.`,
   `Personnages (identifiants permanents) : ${clothing}.`,
   `Action à filmer : ${shot.action.trim()}.`,
   objects?`Objets à conserver entre les plans : ${objects}.`:'',
   shot.dialogue?`Texte de dialogue (ne pas ajouter d’autres répliques) : « ${shot.dialogue} ».`:''
  ].filter(Boolean).join('\n');
  assert(text.length<=MAX_PROMPT,'Description de plan trop longue');return text;
 }
 function splitSeconds(s,maxChunk){const n=Math.ceil(s/maxChunk); const base=Math.floor(s/n),extra=s% n;return Array.from({length:n},(_,i)=>base+(i<extra?1:0));}
 function makeRenderManifest(source,{maxClipSeconds=5}={}){
  assert(Number.isInteger(maxClipSeconds)&&maxClipSeconds>=MIN_CHUNK&&maxClipSeconds<=MAX_CHUNK,'Durée maximale de clip invalide');
  const d=sanitizeProject(source);const clips=[];let at=0;
  for(const shot of d.shots){
   const durations=splitSeconds(shot.duration_seconds,maxClipSeconds);
   for(let i=0;i<durations.length;i++){
    const id=`${shot.id}_part_${String(i+1).padStart(2,'0')}`;
    const seed=hash(`${shot.id}:${i}:${shot.action}:${d.format}`)%2147483646+1;
    clips.push({clip_id:id,shot_id:shot.id,part:i+1,parts:durations.length,sequence:clips.length+1,start_seconds:at,duration_seconds:durations[i],format:d.format,seed,
      prompt:promptFor(shot,d),continuity:{character_ids:shot.character_ids.slice(),prop_ids:shot.prop_ids.slice(),previous_clip_id:clips.at(-1)?.clip_id||null},status:'not_submitted',output:null});
    at+=durations[i];
   }
  }
  assert(clips.length<=MAX_CLIPS,'Nombre de clips supérieur à 120');
  const sourceNote=d.mode==='text'?'Description textuelle fictive':'Référence média utilisée par le storyboard, non incluse dans cette demande de rendu';
  return {schema_version:VERSION,project_kind:'render_plan_only',created_by:'Retouche Cinema Director P2',source_mode:d.mode,reference_note:sourceNote,
   model_engine:'not_connected',rendered_video:null,total_duration_seconds:d.total_duration_seconds,format:d.format,
   consent:{project_rights_confirmed:d.mode==='text'||source.has_rights_confirmed===true,remote_transfer_approved:false,training_allowed:false,reference_media_included:false,requires_explicit_activation:true},
   shots:d.shots.map(s=>({id:s.id,duration_seconds:s.duration_seconds,character_ids:s.character_ids.slice(),prop_ids:s.prop_ids.slice()})),
   characters:d.characters.map(c=>({id:c.id,description:c.description,fictional:c.fictional})),objects:d.props,
   clips};
 }
 function validateRenderManifest(m){
  assert(m&&m.schema_version===VERSION,'Schéma de rendu non pris en charge');
  assert(m.model_engine==='not_connected'&&m.rendered_video===null,'Plan de rendu modifié');
  assert(m.consent?.reference_media_included===false&&m.consent?.remote_transfer_approved===false&&m.consent?.training_allowed===false,'Consentements invalides');
  assert(Array.isArray(m.clips)&&m.clips.length>=1&&m.clips.length<=MAX_CLIPS,'Clips invalides');
  let at=0;const ids=new Set();for(const c of m.clips){
   assert(c&&typeof c.clip_id==='string'&&/^shot_[A-Za-z0-9_]+_part_\d+$/.test(c.clip_id),'ID clip invalide');
   assert(!ids.has(c.clip_id),'Clip dupliqué');ids.add(c.clip_id);
   assert(Number.isInteger(c.duration_seconds)&&c.duration_seconds>=1&&c.duration_seconds<=MAX_CHUNK,'Durée de clip invalide');
   assert(c.start_seconds===at,'Synchronisation de clips invalide');at+=c.duration_seconds;
   assert(typeof c.prompt==='string'&&c.prompt.length>=10&&c.prompt.length<=MAX_PROMPT,'Prompt clip invalide');
   assert(c.status==='not_submitted'&&c.output===null,'État de rendu impossible');
   assert(c.continuity&&Array.isArray(c.continuity.character_ids),'Continuité invalide');
  }
  assert(at===m.total_duration_seconds&&at<=MAX_SECONDS,'Durée de film incohérente');
  return true;
 }
 return {VERSION,MAX_CLIP_SECONDS:MAX_CHUNK,makeRenderManifest,validateRenderManifest,sanitizeProject,splitSeconds,hash};
});

