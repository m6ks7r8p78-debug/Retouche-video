/* Retouche Cinema AI — P16: directed screen presence + observed gestures.
 * Pure deterministic planner & human annotation data contract, no ML/identity inference.
 * CommonJS and browser. Fictional adult scene synthesis is storyboard JSON only.
 */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RetouchePresenceP16 = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
'use strict';
const VERSION = 'retouche-cinema-p16-presence-v1';
const SCENES = Object.freeze({
  smoking: {label:'Une bouffée de cigarette', object:'cigarette', verb:'tenir, porter aux lèvres, inspirer, retirer, expirer'},
  coffee: {label:'Boire un café', object:'tasse', verb:'approcher la tasse, boire, reposer'},
  conversation: {label:'Conversation', object:'aucun', verb:'écouter, répondre, marquer une pause'},
  walk: {label:'Marche', object:'aucun', verb:'se déplacer et croiser le regard de la caméra'}
});
const INTENTS = Object.freeze({
  sensualite: {label:'Regard langoureux / sensualité', short:'Langueur', cues:['gaze_hold','eyes_soft','mouth_soft','slow_blink'], note:'Regard posé, paupières détendues, bouche souple : ne pas figer les yeux.'},
  dominance: {label:'Autorité / présence dominante', short:'Autorité', cues:['steady_posture','gaze_hold','chin_raise','precise_hands'], note:'Assurance sans agressivité : posture stable, gestes maîtrisés, contact visuel assumé.'},
  elegance: {label:'Classe / élégance', short:'Élégance', cues:['precise_hands','shoulders_relax','subtle_smile','chin_raise'], note:'Moins d’emphase, davantage de précision et de fluidité du geste.'},
  charme: {label:'Charme / complicité caméra', short:'Charme', cues:['gaze_return','subtle_smile','mouth_soft','slow_blink'], note:'Créer un échange vivant : petits retours de regard, sourire discret, micro-variation.'},
  mystere: {label:'Mystère / réserve', short:'Mystère', cues:['gaze_away','gaze_return','head_tilt','stillness'], note:'Laisser une courte hésitation et une variation dans la direction du regard.'}
});
const CUES = Object.freeze({
  gaze_hold: {label:'Regard soutenu vers la caméra', domain:'yeux'},
  gaze_away: {label:'Regard qui s’éloigne', domain:'yeux'},
  gaze_return: {label:'Retour du regard vers la caméra', domain:'yeux'},
  eyes_soft: {label:'Paupières légèrement détendues', domain:'yeux'},
  slow_blink: {label:'Clignement naturel et lent', domain:'yeux'},
  chin_raise: {label:'Léger relèvement du menton', domain:'tête'},
  head_tilt: {label:'Inclinaison subtile de la tête', domain:'tête'},
  subtle_smile: {label:'Début de sourire discret', domain:'visage'},
  mouth_soft: {label:'Lèvres relâchées', domain:'lèvres'},
  lip_press: {label:'Lèvres brièvement pressées', domain:'lèvres'},
  lip_lick: {label:'Langue qui humidifie brièvement les lèvres', domain:'lèvres'},
  lip_bite: {label:'Mordillement discret des lèvres', domain:'lèvres'},
  precise_hands: {label:'Doigts et poignet précis', domain:'main'},
  hand_travel: {label:'Trajectoire continue de la main', domain:'main'},
  steady_posture: {label:'Posture assurée', domain:'corps'},
  shoulders_relax: {label:'Épaules détendues', domain:'corps'},
  stillness: {label:'Pause vivante, non figée', domain:'corps'},
  mouth_contact: {label:'Contact du filtre avec les lèvres', domain:'objet'},
  inhale_lips: {label:'Aspiration visible aux lèvres (candidat)', domain:'respiration'},
  breath_sound: {label:'Respiration audible (candidat)', domain:'audio'},
  smoke_mouth: {label:'Fumée apparaissant à la bouche', domain:'fumée'}
});
const CUE_IDS = Object.freeze(Object.keys(CUES));
const LEVELS = Object.freeze(Object.keys(INTENTS));
const OBSERVATION_EVIDENCE = Object.freeze(['visible','audible','uncertain','not_visible']);
const REPORT_IMPACT = Object.freeze(['non_evalue','faible','modere','fort']);
function num(x,n) {if(typeof x!=='number'||!Number.isFinite(x))throw new Error('Valeur numérique invalide: '+n);return x;}
function bounds(v, min, max, name) {num(v,name);if(v<min||v>max)throw new Error(name+' hors limites');return v;}
function round(v){return Number(v.toFixed(3));}
function validateSpec(input){
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Spécification manquante');
  if(input.fictional_adult!==true)throw new Error('La direction générée est réservée aux personnages adultes fictifs');
  if(!Object.prototype.hasOwnProperty.call(SCENES,input.scene))throw new Error('Scène inconnue');
  const duration_s=bounds(input.duration_s,6,60,'duration_s');
  const strengths={};for(const k of LEVELS)strengths[k]=bounds(input.strengths?.[k]??0,0,5,k);
  return {fictional_adult:true,scene:input.scene,duration_s,strengths};
}
function buildPlan(input) {
  const spec=validateSpec(input);const d=spec.duration_s,beats=[], guard=new Set();
  function beat(id,p1,p2,channel,text,cues) {
    if(guard.has(id))throw new Error('Duplicate beat');guard.add(id);
    const start=round(d*p1),end=round(d*p2);
    if(end<=start)throw new Error('Zero-length beat');
    beats.push({id,start_s:start,end_s:end,layer:channel,direction:text,cues:cues.slice(),status:'planned_not_rendered'});
  }
  beat('establish',0,.16,'corps','Installer l’équilibre du corps. Conserver des micro-mouvements respiratoires, sans arrêt sur image.',['steady_posture','shoulders_relax']);
  if(spec.scene==='smoking'){
    beat('hand_path',.14,.36,'main','Déplacer la cigarette vers les lèvres dans une trajectoire continue : doigts, poignet et coude restent liés.',['hand_travel','precise_hands']);
    beat('lip_contact',.36,.46,'objet','Le filtre touche les lèvres ; l’ouverture s’ajuste progressivement sans traverser l’objet.',['mouth_contact','mouth_soft']);
    beat('inhale',.46,.67,'respiration','Conserver le contact. Faire évoluer subtilement lèvres et joues ; respiration perceptible si elle est visible ou audible, sans fumée expirée.',['mouth_contact','inhale_lips','breath_sound']);
    beat('release',.67,.76,'main','Desserrer la bouche et éloigner progressivement la cigarette sans saut de position.',['hand_travel','mouth_soft']);
    beat('transition',.76,.83,'visage','Conserver un léger temps de transition variable, sans imposer une longue pause universelle.',['stillness']);
    beat('exhale',.83,1,'fumée','Expirer : démarrer la fumée à la bouche, puis suivre sa dispersion. Le son peut suivre la sortie d’air, pas la précéder automatiquement.',['smoke_mouth','breath_sound']);
  } else if(spec.scene==='coffee') {
    beat('reach',.16,.4,'main','Prendre la tasse avec une prise stable et porter l’objet à la bouche.',['hand_travel','precise_hands']);
    beat('drink',.4,.69,'visage','Incliner la tasse et adapter les lèvres sans déplacer l’objet instantanément.',['mouth_soft','precise_hands']);
    beat('lower',.69,1,'main','Reposer la tasse en suivant une trajectoire continue.',['hand_travel','precise_hands']);
  } else if(spec.scene==='walk') {
    beat('motion',.16,.82,'corps','Faire avancer corps, jambes et bras avec variations naturelles du rythme.',['steady_posture','precise_hands']);
    beat('turn',.74,1,'yeux','Laisser le regard revenir vers l’objectif sans rotation brusque de la tête.',['gaze_return','head_tilt']);
  } else {
    beat('listen',.16,.52,'visage','Écouter, laisser vivre les yeux et les lèvres en dehors des mots.',['eyes_soft','mouth_soft']);
    beat('answer',.52,.82,'visage','Parler en liant respiration, articulation et regard.',['mouth_soft','gaze_hold']);
    beat('response',.82,1,'visage','Terminer la phrase ; laisser une réaction et un changement discret de regard.',['gaze_return','subtle_smile']);
  }
  for(const [key,intent] of Object.entries(INTENTS)) {
    const strength=spec.strengths[key]; if(strength<1)continue;
    const cueSet=intent.cues;
    const position={sensualite:[.23,.56],dominance:[.16,.64],elegance:[.26,.74],charme:[.58,.87],mystere:[.27,.58]}[key];
    beat('acting_'+key,position[0],position[1],'direction_'+key,
      intent.note + (strength>=4?' Intensité forte, tout en gardant de petits changements vivants.':' Jeu retenu, sans pose exagérée.'),cueSet);
  }
  // A held gaze and a glance away are compatible only when their intervals are explicitly distinct.
  // These overlapping style beats are acting intentions, NOT simultaneous physical proof.
  beats.sort((a,b)=>a.start_s-b.start_s||a.id.localeCompare(b.id));
  return {schema:VERSION,kind:'fictional_actor_direction',project_status:'storyboard_only',
    fictional_adult:true,source_video_used:false,model_executed:false,rendered_frames:0,
    fps_requested:60,generated_unique_frames:0,scene:spec.scene,duration_s:d,
    artistic_intent:spec.strengths,beats,
    notes:['Les directions se superposent ; synchroniser main, lèvres, regard et respiration dans le moteur vidéo.',
      'Les effets sensuel, dominant ou séduisant sont des objectifs artistiques, pas des intentions vérifiées chez les références réelles.',
      '60 images encodées/s ne prouvent pas 60 poses originales/s.']};
}
function validateObservation(o,maxDuration) {
  if(!o||typeof o!=='object'||Array.isArray(o))throw new Error('Observation absente');
  if(!CUES[o.cue])throw new Error('Repère inconnu');
  bounds(o.start_s,0,maxDuration,'start_s');bounds(o.end_s,0,maxDuration,'end_s');
  if(o.end_s<=o.start_s)throw new Error('Intervalle invalide');
  if(!OBSERVATION_EVIDENCE.includes(o.evidence))throw new Error('Nature de la preuve invalide');
  if(o.cue==='breath_sound'&&o.evidence==='visible')throw new Error('Son ne peut pas être prouvé par image seule');
  if(o.cue!=='breath_sound'&&o.evidence==='audible')throw new Error('Indice visuel ne peut pas être prouvé par audio seul');
  if(!['A','B'].includes(o.reviewer))throw new Error('Relecteur invalide');
  if(o.notes!==undefined&&typeof o.notes!=='string')throw new Error('Notes invalides');
  return {cue:o.cue,start_s:round(o.start_s),end_s:round(o.end_s),evidence:o.evidence,
    reviewer:o.reviewer,notes:(o.notes||'').slice(0,400)};
}
function validateViewerRating(r){
  if(!r||typeof r!=='object')throw new Error('Avis invalide');
  if(!['A','B'].includes(r.reviewer))throw new Error('Relecteur invalide');
  if(!LEVELS.includes(r.dimension))throw new Error('Dimension artistique inconnue');
  bounds(r.score,0,5,'score');
  if(r.assessment!=='subjective_viewer_impression')throw new Error('Une note de présence est une impression de spectateur');
  return {reviewer:r.reviewer,dimension:r.dimension,score:r.score,
    assessment:'subjective_viewer_impression',notes:String(r.notes||'').slice(0,400)};
}
function validateReview(doc){
  if(!doc||doc.schema!==VERSION||doc.kind!=='private_manual_review'||doc.allow_network!==false||doc.export_media!==false)throw new Error('Schéma ou confidentialité invalides');
  if(!doc.source_name||typeof doc.source_name!=='string'||doc.source_name.length>256)throw new Error('Nom de média requis');
  bounds(doc.duration_s,.1,86400,'duration_s');
  if(!Array.isArray(doc.observations)||doc.observations.length>10000)throw new Error('Observations invalides');
  if(!Array.isArray(doc.viewer_ratings)||doc.viewer_ratings.length>1000)throw new Error('Avis invalides');
  const observations=doc.observations.map(o=>validateObservation(o,doc.duration_s));
  const viewer_ratings=doc.viewer_ratings.map(validateViewerRating);
  if(doc.automatic_intent_inference||doc.automatic_arousal_inference||doc.ready_for_training)throw new Error('Attribution automatique d’intention interdite');
  return {schema:VERSION,kind:'private_manual_review',source_name:doc.source_name,duration_s:doc.duration_s,
    allow_network:false,export_media:false,observations,viewer_ratings,
    evidence_type:'human_observations_and_subjective_ratings',
    reviewed_by_two_independent_people_verified:false,ready_for_training:false,
    automatic_intent_inference:false,automatic_arousal_inference:false};
}
function newReview(sourceName,duration){return validateReview({schema:VERSION,kind:'private_manual_review',source_name:sourceName,duration_s:duration,
  allow_network:false,export_media:false,observations:[],viewer_ratings:[]});}
function compareRatings(review){const d=validateReview(review),out=[];
  for(const dim of LEVELS){const a=d.viewer_ratings.filter(x=>x.dimension===dim&&x.reviewer==='A');
   const b=d.viewer_ratings.filter(x=>x.dimension===dim&&x.reviewer==='B');
   if(!a.length||!b.length)continue;
   const x=a[a.length-1].score,y=b[b.length-1].score;
   out.push({dimension:dim,first:x,second:y,delta:Math.abs(x-y),consensus:'not_a_fact_about_subject'});
  }
  return {ratings:out,independent_reviewers_verified:false,psychological_intention_inferred:false,
    audience_response_universal:false};
}
return {VERSION,SCENES,INTENTS,CUES,CUE_IDS,LEVELS,OBSERVATION_EVIDENCE,REPORT_IMPACT,
  validateSpec,buildPlan,validateObservation,validateViewerRating,validateReview,newReview,compareRatings};
});

