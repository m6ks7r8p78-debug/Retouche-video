/** Film Studio v0.9 — cinq doigts procéduraux et proximité d'assise.
 * La fermeture des phalanges est une cinématique stylisée, pas un solveur
 * de collision et ne prouve pas qu'une vraie main peut saisir l'objet.
 */
import {buildSyntheticFilmSceneV03} from './film-contact-v03.mjs';
import {auditCupMovement} from './film-motion-v08.mjs';
import {readSyntheticGLB,sampleSyntheticPose} from './film-viewer-v03.mjs';

const FINGERS=Object.freeze([
 {name:'index',offset:[-.053,-.011,.047],curl:.33},
 {name:'majeur',offset:[-.024,-.013,.065],curl:.37},
 {name:'annulaire',offset:[.006,-.013,.068],curl:.38},
 {name:'auriculaire',offset:[.034,-.011,.053],curl:.32},
 {name:'pouce',offset:[-.057,-.002,-.014],curl:-.40}
]);
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const smooth=v=>{const t=clamp(v,0,1);return t*t*(3-2*t);};
const quatX=a=>[Math.sin(a/2),0,0,Math.cos(a/2)];
const quatZ=a=>[0,0,Math.sin(a/2),Math.cos(a/2)];
const distance=(a,b)=>Math.hypot(...a.map((n,i)=>n-b[i]));
const round=n=>Math.round(n*100000)/100000;

/** Poignet approche la tasse avant la prise et relâche progressivement avant le dépôt. */
function fingerClosureAt(time,timeline){
 let closure=0;
 for(const action of timeline){
  if(action.intent==='boire')
   closure=Math.max(closure,smooth((time-(action.start+.47))/.43));
  if(action.intent==='poser_objet')
   closure=Math.min(closure,1-smooth((time-(action.start+.26))/.29));
 }
 return clamp(closure,0,1);
}

function decorateFingerRig({model,output,ids,fineTimes}){
 const nodes=model.nodes,channels=model.animations[0].channels;
 const {wrist,onHand}=ids;
 if(!nodes[wrist]||!nodes[onHand]||!Array.isArray(fineTimes)||fineTimes.length<5)
  throw Error('Poignet ou trajectoire 3D indisponible.');
 const anchor=nodes[onHand].translation;
 if(!Array.isArray(anchor)||anchor.length!==3)throw Error('Ancrage de doigts absent.');
 const add=(name,parent,translation,scale=null)=>{
  const node={name,translation:translation.slice()};
  if(scale){node.scale=scale.slice();node.mesh=0;node.extras={materialIndex:0};}
  const id=nodes.push(node)-1;
  (nodes[parent].children??=[]).push(id);
  return id;
 };
 for(const finger of FINGERS){
  const base=add('film_doigt_'+finger.name+'_pivot',wrist,
   anchor.map((n,i)=>n+finger.offset[i]));
  add('film_doigt_'+finger.name+'_proximal',base,[0,-.021,0],[.016,.029,.016]);
  const distal=add('film_doigt_'+finger.name+'_articulation',base,[0,-.045,0]);
  add('film_doigt_'+finger.name+'_bout',distal,[0,-.021,0],[.014,.025,.015]);
  const rotation=finger.name==='pouce'?quatZ:quatX;
  channels.push({
   node:base,path:'rotation',times:fineTimes,
   values:fineTimes.map(t=>rotation(finger.curl*fingerClosureAt(t,output.timeline)))
  });
  channels.push({
   node:distal,path:'rotation',times:fineTimes,
   values:fineTimes.map(t=>rotation(finger.curl*1.55*fingerClosureAt(t,output.timeline)))
  });
 }
 // Sur ce personnage purement procédural, la base du bassin est à 0.82 m.
 // À l'échelle assise 0.79, son bas descend à ~0.648 m.
 // Ajuster le plateau du siège à cette altitude pour réduire l'ancienne
 // intersection grossière. Cela n'atteste pas l'équilibre biomécanique.
 const seat=nodes.find(n=>n.name==='chaise_assise');
 if(!seat||!seat.scale||!seat.translation)
  throw Error('Siège 3D synthétique absent.');
 seat.translation[1]=.592;
}

function auditFingerAndSeat(glb,timeline,{sampleHz=60}={}){
 if(!Number.isInteger(sampleHz)||sampleHz<20||sampleHz>120)
  throw Error('Fréquence de mesure des doigts non prise en charge.');
 const scene=readSyntheticGLB(glb);
 const names=scene.doc.nodes.map(n=>n.name);
 const find=name=>{
  const i=names.indexOf(name);
  if(i<0||names.lastIndexOf(name)!==i)throw Error('Nœud de doigt ou de scène 3D manquant/dupliqué : '+name);
  return i;
 };
 const cup=find('tasse_unique_mobile'),pelvis=find('bassin'),seat=find('chaise_assise');
 const tips=FINGERS.map(f=>find('film_doigt_'+f.name+'_bout'));
 const hinges=FINGERS.flatMap(f=>[
  find('film_doigt_'+f.name+'_pivot'),find('film_doigt_'+f.name+'_articulation')
 ]);
 const duration=scene.clips[0].duration;
 if(!Number.isFinite(duration)||duration<=0||duration>120)
  throw Error('Durée non exploitable.');
 const held=[];
 let beginning=null;
 for(const action of timeline){
  if(action.intent==='boire'&&beginning===null)beginning=action.start+.90;
  if(action.intent==='poser_objet'&&beginning!==null){
   held.push([beginning,action.start+.55]);
   beginning=null;
  }
 }
 if(beginning!==null)held.push([beginning,duration]);
 const frames=Math.ceil(duration*sampleHz);
 let maxProximityM=0,minProximityM=Infinity,proximitySamples=0;
 for(let i=0;i<=frames;i++){
  const time=Math.min(duration,i/sampleHz);
  if(!held.some(([a,b])=>time>=a&&time<=b))continue;
  const pose=sampleSyntheticPose(scene,time);
  const c=pose.world[cup].translation;
  for(const id of tips){
   const n=distance(c,pose.world[id].translation);
   if(!Number.isFinite(n))throw Error('Position de phalange invalide.');
   maxProximityM=Math.max(maxProximityM,n);
   minProximityM=Math.min(minProximityM,n);
   proximitySamples++;
  }
 }
 const tracks=scene.clips[0].tracks.filter(t=>hinges.includes(t.node)&&t.path==='rotation');
 if(tracks.length!==10)throw Error('Les dix pistes de phalanges ne sont pas présentes.');
 let maxAngularStepRadians=0;
 for(const track of tracks){
  if(track.times.length<4)throw Error('Animation des phalanges insuffisante.');
  for(let i=1;i<track.values.length;i++){
   const a=track.values[i-1],b=track.values[i];
   const dot=Math.min(1,Math.abs(a.reduce((s,n,j)=>s+n*b[j],0)));
   const angle=2*Math.acos(dot);
   if(!Number.isFinite(angle))throw Error('Rotation de phalange invalide.');
   maxAngularStepRadians=Math.max(maxAngularStepRadians,angle);
  }
 }
 const drink=timeline.find(x=>x.intent==='boire');
 const place=timeline.find(x=>x.intent==='poser_objet');
 const closeAtPickup=drink?fingerClosureAt(drink.start+.90,timeline):null;
 const openAfterDeposit=place?fingerClosureAt(place.start+.55,timeline):null;
 const seated=timeline.find(x=>x.intent==='s_asseoir');
 let seatClearanceM=null,standingClearanceM=null;
 if(seated){
  const measure=t=>{
   const pose=sampleSyntheticPose(scene,t);
   const p=pose.world[pelvis],s=pose.world[seat];
   return p.translation[1]-p.scale[1]-s.translation[1]-s.scale[1];
  };
  seatClearanceM=measure(Math.min(duration,seated.end));
  standingClearanceM=measure(0);
 }
 const audit={
  schema:'retoucheproai.film-hand-seat-audit.v0.9',
  synthetic:true,physicallyGrasped:false,fingerCollisionVerified:false,
  bodyBalanceVerified:false,seatPressureMeasured:false,
  fingerCount:FINGERS.length,hingeCount:hinges.length,
  sampleHz,proximitySamples,
  fingertipCupDistanceRangeM:proximitySamples?
   {min:round(minProximityM),max:round(maxProximityM)}:null,
  maxAngularStepRadians:round(maxAngularStepRadians),
  closureAtPickup:closeAtPickup===null?null:round(closeAtPickup),
  closureAfterDeposit:openAfterDeposit===null?null:round(openAfterDeposit),
  seatedPelvisSurfaceClearanceM:seatClearanceM===null?null:round(seatClearanceM),
  standingPelvisSurfaceClearanceM:standingClearanceM===null?null:round(standingClearanceM)
 };
 if(drink&&(proximitySamples<5||maxProximityM>.26))
  throw Error('Doigts trop éloignés de la tasse lors du transport.');
 if(drink&&closeAtPickup<.98)throw Error('Doigts non fermés au moment de la prise.');
 if(place&&openAfterDeposit>.02)throw Error('Doigts non ouverts après le dépôt.');
 if(maxAngularStepRadians>.22)
  throw Error('Saut angulaire dans les articulations des doigts.');
 if(seated&&(Math.abs(seatClearanceM)>.03||standingClearanceM<.05))
  throw Error('Assise géométrique incohérente avec le plateau de la chaise.');
 return audit;
}

function buildSyntheticFilmSceneV09(request,generator){
 const result=buildSyntheticFilmSceneV03(request,generator,{decorateModel:decorateFingerRig});
 if(result.status!=='apercu_partiel_glb_anime')return result;
 const motionAudit=auditCupMovement(result.glb,result.timeline);
 const handSeatAudit=auditFingerAndSeat(result.glb,result.timeline);
 return {...result,schema:'retoucheproai.film-motion-preview.v0.9',
  motionAudit,handSeatAudit,
  warnings:[...result.warnings,
   'Cinq doigts stylisés se ferment et s’ouvrent sur un objet : proximité mesurée, sans préhension ni collision physique démontrée.',
   'Siège rapproché du bassin pour limiter les intersections visuelles, sans calcul d’équilibre du corps.',
   'Audit cinématique local de la tasse à 120 Hz et des articulations à 60 Hz ; pas de rendu vidéo ni de simulation physique.']
 };
}
export {FINGERS,fingerClosureAt,decorateFingerRig,auditFingerAndSeat,buildSyntheticFilmSceneV09};
