/* Retouche Cinema P4 — deterministic, text-only continuity bible. No video generation or uploads. */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.RetoucheCinemaContinuity=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const VERSION='cinema-p4-bible-v01';
 const check=(v,msg)=>{if(!v)throw Error(msg)};
 const isSafeId=(s)=>typeof s==='string'&&/^[A-Za-z0-9_]{1,80}$/.test(s);
 const noDuplicates=ids=>new Set(ids).size===ids.length;
 function buildBible(project,manifest,lookNotes={}){
   check(project?.schema_version==='cinema-p1.0','Projet P1 invalide');
   check(manifest?.schema_version==='cinema-p2-render-v01','Projet P2 invalide');
   check(project.mode==='text'||project.has_rights_confirmed===true,'Droits sur la référence non confirmés');
   check(manifest.consent?.reference_media_included===false,'Le manifeste doit exclure les références privées');
   check(Array.isArray(project.characters)&&Array.isArray(manifest.characters),'Personnages manquants');
   check(Array.isArray(manifest.clips)&&manifest.clips.length>0&&manifest.clips.length<=300,'Clips invalides');
   check(lookNotes&&typeof lookNotes==='object'&&!Array.isArray(lookNotes),'Notes invalides');
   const characters=project.characters.map(c=>{
     check(isSafeId(c.id),'Personnage sans identifiant sûr');
     check(typeof c.description==='string','Description invalide');
     check(c.identity_source==='fictional'||c.identity_source==='reference','Source du personnage invalide');
     const note=lookNotes[c.id]??'';
     check(typeof note==='string'&&note.length<=300,'Description visuelle trop longue');
     return {id:c.id,source:c.identity_source,description:c.description,
       appearance_note:note.trim(),identity_proven:false,appearance_reference_media_embedded:false};
   });
   check(noDuplicates(characters.map(c=>c.id)),'Personnages dupliqués');
   const known=new Set(characters.map(c=>c.id));
   check(Object.keys(lookNotes).every(k=>known.has(k)),'Notes pour personnage inconnu');
   const clips=manifest.clips.map((c,i)=>{
     const ids=c.continuity?.character_ids,props=c.continuity?.prop_ids;
     check(isSafeId(c.clip_id)&&c.sequence===i+1,'Ordre et ID clip invalides');
     check(Array.isArray(ids)&&ids.every(id=>known.has(id))&&noDuplicates(ids),'IDs personnages incohérents');
     check(Array.isArray(props),'Props manquants');
     return {clip_id:c.clip_id,shot_id:c.shot_id,sequence:c.sequence,
       character_ids:ids.slice(),prop_ids:props.slice(),
       visual_rendered:false, continuity_verified:false};
   });
   check(noDuplicates(clips.map(c=>c.clip_id)),'Clips dupliqués');
   const edges=[];
   for(let i=1;i<clips.length;i++){
     const a=clips[i-1],b=clips[i],same=a.character_ids.filter(id=>b.character_ids.includes(id));
     const vanish=a.prop_ids.filter(id=>!b.prop_ids.includes(id));
     edges.push({from_clip:a.clip_id,to_clip:b.clip_id,shared_character_ids:same,
       props_absent_in_next_plan:vanish,transition_assumption:'cut_until_verified',
       status:'needs_review',identity_proven:false});
   }
   const b={schema_version:VERSION,project_kind:'text_only_continuity_bible',
     original_media_embedded:false,photos_uploaded:false,training_allowed:false,
     video_model_connected:false,identity_verified:false,
     characters,clips,edges,
     notice:'Notes textuelles, absence de preuve d’identité; le rendu vidéo et les visages restent à évaluer séparément.'};
   validateBible(b,manifest);return b;
 }
 function validateBible(b,manifest){
   check(b?.schema_version===VERSION&&b.original_media_embedded===false&&b.photos_uploaded===false&&b.training_allowed===false,'Données privées interdites');
   check(b.video_model_connected===false&&b.identity_verified===false,'Faux statut IA ou identité');
   check(b.project_kind==='text_only_continuity_bible','Type de bible incorrect');
   check(b.clips.length===manifest.clips.length,'Clips manquants');
   check(b.edges.length===Math.max(0,b.clips.length-1),'Transitions manquantes');
   for(let i=0;i<b.clips.length;i++){
     const c=b.clips[i],m=manifest.clips[i];
     check(c.clip_id===m.clip_id&&c.sequence===m.sequence&&c.visual_rendered===false&&c.continuity_verified===false,'Ordre ou statut falsifié');
   }
   for(let i=0;i<b.edges.length;i++){
     const e=b.edges[i];
     check(e.from_clip===b.clips[i].clip_id&&e.to_clip===b.clips[i+1].clip_id&&e.status==='needs_review'&&e.identity_proven===false,'Vérification abusive');
   }
   return true;
 }
 function buildEvidenceTemplate(b){
   check(b?.schema_version===VERSION,'Bible P4 absente');
   const checks=[];
   for(const e of b.edges)for(const id of e.shared_character_ids){
     checks.push({check_id:'review_'+String(checks.length+1).padStart(3,'0'),
       from_clip:e.from_clip,to_clip:e.to_clip,entity_id:id,transition:'cut',regions:null});
   }
   return {schema_version:'cinema-p4-evidence-v01',media_transfer_approved:false,
     instructions:'Annoter les régions relatives [x,y,largeur,hauteur] dans [0,1] ; passer transition=continuous uniquement si cadrages comparables. Ajouter SHA-256 originaux par clip. Aucune identité certifiée.',
     clip_sha256:{},checks};
 }
 function augmentRenderManifest(manifest,bible){
   validateBible(bible,manifest);
   const out=JSON.parse(JSON.stringify(manifest));
   // Keep exact P2 schema so existing ComfyUI gateway continues to validate it.
   const notes=new Map(bible.characters.map(c=>[c.id,c.appearance_note]));
   for(const clip of out.clips){
     const locks=clip.continuity.character_ids.map(id=>({id,note:notes.get(id)})).filter(c=>c.note);
     if(locks.length){
       const instruction='\nMémoire visuelle à respecter pour les plans suivants (description utilisateur, non garantie d’identité) : '+
         locks.map(x=>x.id+' : '+x.note).join(' ; ')+'.';
       check(clip.prompt.length+instruction.length<=3000,'Mémoire trop longue pour les clips P2');
       clip.prompt+=instruction;
     }
   }
   // The manifest is still NOT a real rendered video or a remote consent.
   check(out.model_engine==='not_connected'&&out.rendered_video===null&&out.consent.remote_transfer_approved===false,
     'Le manifeste P4 ne doit pas activer de moteur ou d’envoi');
   return out;
 }
 return {VERSION,buildBible,validateBible,buildEvidenceTemplate,augmentRenderManifest};
});
