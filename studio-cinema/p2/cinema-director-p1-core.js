/* Retouche Cinema P1 — deterministic, offline storyboard director.
 * This is deliberately NOT a video-generation model. No network calls.
 * MIT-style original implementation for the project, 2026.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.RetoucheCinemaDirector = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const VERSION = 'cinema-p1.0';
  const MAX_SHOTS = 16, MAX_SECONDS = 600;
  const reduce = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Number(n) || lo));
  const places = [
    ['salon', /\b(salon|canape)\b/], ['rue', /\b(rue|trottoir|avenue)\b/],
    ['cuisine', /\b(cuisine)\b/], ['chambre', /\b(chambre|lit)\b/],
    ['restaurant', /\b(restaurant|bistrot)\b/], ['cafe', /\b(dans un cafe|au cafe|entree? dans un cafe)\b/],
    ['parc', /\b(parc|jardin)\b/], ['plage', /\b(plage|mer)\b/],
    ['bureau', /\b(bureau)\b/], ['terrasse', /\b(terrasse)\b/]
  ];
  const props = [
    ['tasse', /\b(tasse|cafe|the|mug)\b/], ['telephone', /\b(telephone|portable|smartphone|appel)\b/],
    ['cigarette', /\b(cigarette|fume|fumer)\b/], ['sac', /\b(sac|valise)\b/],
    ['livre', /\b(livre|roman)\b/], ['lunettes', /\b(lunettes)\b/], ['verre', /\b(verre|eau)\b/]
  ];
  function getDesiredDuration(s) {
    const x = reduce(s);
    const clock = x.match(/\b(\d{1,2})\s*(?:min|minutes?)\s*(\d{1,2})\s*(?:s|sec|secondes?)\b/);
    if (clock) return clamp(+clock[1] * 60 + +clock[2], 5, MAX_SECONDS);
    const words = {un:1,une:1,deux:2,trois:3,quatre:4,cinq:5,six:6,sept:7,huit:8,neuf:9,dix:10};
    const num = '(\\d{1,3}|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix)';
    const unit = new RegExp('\\b' + num + '\\s*(minutes?|mins?|secondes?|secs?)\\b');
    const m = x.match(unit);
    if (!m) return 45;
    const n = words[m[1]] || Number(m[1]);
    return clamp(n * (/^min/.test(m[2]) ? 60 : 1), 5, MAX_SECONDS);
  }
  function detectPlace(s, prior) {
    const x = reduce(s);
    for (const [name, re] of places) if (re.test(x)) return name;
    return prior || 'Décor à définir';
  }
  function detectProps(s) { const x = reduce(s); return props.filter(([, re]) => re.test(x)).map(([name]) => name); }
  function detectCharacters(s, mode) {
    const x = reduce(s);
    const a = [];
    const two = /\b(avec (son|sa|une?|l')?\s*(ami|amie|compagnon|compagne)|discute avec|conversation avec|ils discutent|elles discutent)\b/.test(x);
    const gender = /\b(femme|madame|blonde|brune)\b/.test(x) ? 'femme' : /\b(homme|monsieur|brun|blond)\b/.test(x) ? 'homme' : 'personnage';
    const color = /\b(blonde|blond)\b/.test(x) ? 'blonds' : /\b(brune|brun)\b/.test(x) ? 'bruns' : '';
    const age = x.match(/\b(\d{2})\s*ans\b/);
    a.push({id:'character_01',role:'principal',description:(gender + ' adulte' + (color ? ' aux cheveux '+color : '') + (age ? ' de '+age[1]+' ans' : '')).trim(),identity_source:mode==='text'?'fictional':'reference_non_verifiee',reference_id:mode==='text'?null:'media_01',voice_consented:false});
    if (two) a.push({id:'character_02',role:'secondaire',description:'autre personne adulte, apparence à préciser',identity_source:'fictional',reference_id:null,voice_consented:false});
    return a;
  }
  function extractActions(input) {
    let s=String(input).trim().replace(/\s+/g, ' ');
    // Intentional rule-based split, rather than an AI semantic parse.
    const parts = s.split(/(?:[.!?;]+\s+|\s*,?\s*\b(?:puis|ensuite|apres cela|plus tard|et ensuite)\b\s*[,:]?\s*)/i)
      .map(x => x.replace(/^[,\s]+|[,\s]+$/g, '').trim()).filter(Boolean);
    const desc = parts.filter(x => !/^(?:ambiance|style|lumi[eè]re|format|qualit[eé]|dur[eé]e|film\s+de|\d+\s*(?:minutes?|secondes?))\b/i.test(x));
    return (desc.length ? desc : [s]).slice(0,MAX_SHOTS);
  }
  function planType(action) {
    const a=reduce(action);
    if (/\b(telephone|boit|cafe|tasse|main|regarde|sourit|parle|discute|fume|yeux)\b/.test(a)) return 'Plan rapproché';
    if (/\b(marche|court|entre|sort|rue|traverse|avance)\b/.test(a)) return 'Plan d’ensemble';
    return 'Plan moyen';
  }
  function rebalance(shots, seconds) {
    if (!shots.length) return shots;
    const total=Math.max(shots.length*2,clamp(seconds,5,MAX_SECONDS));
    const base=Math.floor(total/shots.length);
    let left=total-base*shots.length;
    shots.forEach(s => {s.duration_seconds=base+(left-- > 0 ? 1:0);});
    return shots;
  }
  function buildProject(config) {
    const cfg=config||{}; const description=String(cfg.description||'').trim();
    if (!description || description.length>4000) throw new Error('Décris ton film (1 à 4 000 caractères).');
    const mode=['text','photo','video'].includes(cfg.mode)?cfg.mode:'text';
    if(mode!=='text' && (!cfg.media || !cfg.media.name)) throw new Error('Ajoute un fichier photo ou vidéo.');
    if(mode!=='text' && !cfg.hasRights) throw new Error('Confirme tes droits sur cette référence avant de continuer.');
    const media=mode==='text'?null:{id:'media_01',name:String(cfg.media.name).slice(0,180),mime_type:String(cfg.media.type||''),size_bytes:Math.max(0,Number(cfg.media.size)||0),transferred:false,embedded:false};
    if(media && media.size_bytes>200*1024*1024) throw new Error('Fichier trop volumineux pour ce prototype (200 Mo max).');
    const characters=detectCharacters(description,mode);
    let lastLocation=detectPlace(description), allProps=[];
    const actions=extractActions(description);
    const shots=actions.map((action,i)=>{
      const matched=detectPlace(action,null);
      if(matched!=='Décor à définir') lastLocation=matched;
      const used=detectProps(action);
      for(const p of used) if(!allProps.includes(p)) allProps.push(p);
      return {id:'shot_'+String(i+1).padStart(2,'0'),title:'Plan '+(i+1),action,location:lastLocation,camera:planType(action),character_ids:characters.map(c=>c.id),prop_ids:used,duration_seconds:4,render_status:'not_rendered',dialogue:'',render_uri:null};
    });
    const requested=getDesiredDuration(description);
    rebalance(shots,requested);
    return {
      schema_version:VERSION,project_type:'storyboard_and_animatic',status:'storyboard_only',
      description,mode,media,has_rights_confirmed:mode==='text'?null:true,
      characters,props:allProps.map((p,i)=>({id:p,label:p,owner_character_id:'character_01',continuity_note:'À garder cohérent entre les plans'})),
      shots,requested_duration_seconds:requested,format:/\b(9\s*[:/]\s*16|vertical|portrait)\b/i.test(description)?'9:16':'16:9',
      quality_flags:[],rendered_video:null,video_model_connected:false,
      privacy:{uploaded_to_server:false,media_embedded_in_json:false,training_opt_in:false},
      disclaimer:'Découpage déterministe + animatique dessinée ; aucun film IA photoréaliste généré.'
    };
  }
  function diagnostics(project) {
    const out=[];
    const shots=project.shots||[];
    if (shots.length>MAX_SHOTS || !shots.length) out.push('Nombre de plans invalide.');
    if (new Set(shots.map(s=>s.id)).size!==shots.length) out.push('Identifiants de plans dupliqués.');
    const ids=new Set((project.characters||[]).map(c=>c.id));
    for(const s of shots){
      if(!s.action || !s.action.trim()) out.push('Plan sans action : '+s.id);
      if(!Number.isInteger(Number(s.duration_seconds)) || s.duration_seconds<1 || s.duration_seconds>120) out.push('Durée de plan invalide : '+s.id);
      if((s.character_ids||[]).some(id=>!ids.has(id))) out.push('Personnage non répertorié : '+s.id);
    }
    if(shots.reduce((n,s)=>n+Number(s.duration_seconds||0),0)>MAX_SECONDS) out.push('Durée totale supérieure à dix minutes.');
    if(project.mode!=='text' && !project.has_rights_confirmed) out.push('Droits de référence non confirmés.');
    if((project.characters||[]).length>1) out.push('Deux personnages repérés : vérifier lequel parle ou agit dans chaque plan.');
    if(project.media) out.push('Référence locale : les images originales ne sont pas incluses dans l’export JSON.');
    out.push('Aucune génération vidéo IA réelle connectée : animatique de démonstration uniquement.');
    return [...new Set(out)];
  }
  function validateImported(obj) {
    if(!obj || obj.schema_version!==VERSION) throw new Error('Version de projet non prise en charge.');
    if(!Array.isArray(obj.shots)||!obj.shots.length||obj.shots.length>MAX_SHOTS) throw new Error('Nombre de plans invalide.');
    if(!Array.isArray(obj.characters)||obj.characters.length>8) throw new Error('Personnages invalides.');
    if(!['text','photo','video'].includes(obj.mode)) throw new Error('Mode invalide.');
    // Only data that the offline editor knows how to handle, never include foreign URLs or embedded pixels.
    const clone=JSON.parse(JSON.stringify(obj));
    clone.media=obj.media?{id:'media_01',name:String(obj.media.name||'').slice(0,180),mime_type:String(obj.media.mime_type||''),size_bytes:Math.max(0,Number(obj.media.size_bytes)||0),embedded:false,transferred:false}:null;
    clone.description=String(obj.description||'').slice(0,4000);
    clone.shots=clone.shots.map((s,i)=>({
      id:String(s.id||'').slice(0,70),title:String(s.title||'Plan '+(i+1)).slice(0,80),action:String(s.action||'').slice(0,700),
      location:String(s.location||'Décor à définir').slice(0,100),camera:String(s.camera||'Plan moyen').slice(0,80),
      character_ids:Array.isArray(s.character_ids)?s.character_ids.map(x=>String(x).slice(0,80)):[],
      prop_ids:Array.isArray(s.prop_ids)?s.prop_ids.map(x=>String(x).slice(0,80)):[],
      duration_seconds:Number(s.duration_seconds),render_status:'not_rendered',dialogue:String(s.dialogue||'').slice(0,500),render_uri:null
    }));
    clone.characters=clone.characters.map(c=>({id:String(c.id).slice(0,80),role:String(c.role||'').slice(0,80),description:String(c.description||'').slice(0,240),identity_source:String(c.identity_source||'fictional').slice(0,60),reference_id:c.reference_id?String(c.reference_id).slice(0,80):null,voice_consented:false}));
    clone.props=Array.isArray(clone.props)?clone.props.slice(0,30).map(p=>({id:String(p.id||'').slice(0,80),label:String(p.label||'').slice(0,80),owner_character_id:String(p.owner_character_id||'').slice(0,80),continuity_note:String(p.continuity_note||'').slice(0,180)})):[];
    clone.rendered_video=null;clone.video_model_connected=false;clone.status='storyboard_only';
    clone.privacy={uploaded_to_server:false,media_embedded_in_json:false,training_opt_in:false};
    if(diagnostics(clone).some(x=>/invalide|sans action|non répertorié|supérieure|non confirmés|dupliqués/.test(x)))throw new Error('Projet JSON non conforme : vérifie les plans, durées et droits.');
    return clone;
  }
  function totalDuration(project){return project.shots.reduce((v,s)=>v+Number(s.duration_seconds||0),0)}
  function nextId(project){let n=1;while(project.shots.some(s=>s.id==='shot_'+String(n).padStart(2,'0')))n++;return 'shot_'+String(n).padStart(2,'0')}
  return {VERSION,MAX_SHOTS,MAX_SECONDS,buildProject,detectPlace,detectProps,extractActions,getDesiredDuration,diagnostics,validateImported,totalDuration,nextId};
});

