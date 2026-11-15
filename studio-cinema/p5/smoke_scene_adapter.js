/* Retouche Cinema P5 — synthetic adult, text-only smoking action choreography.
 * No personal video, model, upload or remote rendering is included.
 */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.RetoucheSmokeScene=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const VERSION='cinema-p5-smoke-scene-v01';
 const rules=[
  '1. Conserver le même personnage ADULTE FICTIF, son visage et sa tenue d’un plan à l’autre.',
  '2. Maintenir une SEULE cigarette de taille stable, tenue entre index et majeur ; vérifier le contact des doigts, sans doigt supplémentaire.',
  '3. Main vers la bouche, contact au bord des lèvres, inspiration discrète ; éviter l’interpénétration doigt/visage.',
  '4. Retirer la main avant l’expiration ; fumée en filaments diffus se dissipant progressivement, sans formes rigides ni apparition soudaine.',
  '5. Ne pas changer de main ni de cigarette entre les plans. Conserver l’éclairage, les manches et la position de caméra.',
  '6. Aucun média de référence réel ni identité biométrique ; ne pas garantir le photoréalisme ou la véracité du mouvement.'
 ];
 function assert(p,s){if(!p)throw new Error(s)}
 function augmentSmokeManifest(m,{shotIds,adultFictionalConfirmed=false}={}){
  assert(m&&m.schema_version==='cinema-p2-render-v01','Schéma P2 attendu');
  assert(m.model_engine==='not_connected'&&m.rendered_video===null,'Moteur non autorisé');
  assert(m.consent?.remote_transfer_approved===false&&m.consent?.reference_media_included===false,'Aucune donnée distante ni personnelle');
  assert(adultFictionalConfirmed===true&&m.source_mode==='text','Scène adulte et entièrement fictive requise');
  assert(Array.isArray(shotIds)&&shotIds.length>0&&shotIds.every(s=>typeof s==='string'),'Plans à chorégraphier requis');
  const wanted=new Set(shotIds);assert(wanted.size===shotIds.length,'Plans dupliqués');
  const known=new Set(m.shots.map(s=>s.id)); assert([...wanted].every(s=>known.has(s)),'Plan inconnu');
  const ids=new Set();m.shots.filter(s=>wanted.has(s.id)).forEach(s=>s.character_ids.forEach(id=>ids.add(id)));
  assert(ids.size>0,'Personnage absent');
  for(const id of ids){const c=m.characters.find(c=>c.id===id);assert(c&&c.fictional===true,'Référence réelle non autorisée dans ce démonstrateur')}
  const append='\nMOUVEMENT MAIN–OBJET–BOUCHE (protocole P5, intentions non garanties) :\n'+rules.join('\n');
  const out=JSON.parse(JSON.stringify(m));
  for(const clip of out.clips){
   if(!wanted.has(clip.shot_id))continue;
   assert(clip.status==='not_submitted'&&clip.output===null,'Clip déjà rendu ou modifié');
   assert(clip.prompt.length+append.length<=3000,'Prompt trop long pour le moteur P2');
   clip.prompt+=append;
  }
  assert(out.model_engine==='not_connected'&&out.rendered_video===null&&out.consent.remote_transfer_approved===false,'État externe inattendu');
  return out;
 }
 return {VERSION,rules,augmentSmokeManifest};
});
