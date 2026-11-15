/** Film Studio v0.8 — audit cinématique du GLB réellement exporté.
 * Un audit de trajectoire et de l'ancrage main–tasse n'est PAS une physique
 * du contact, un contrôle des doigts ou un rendu cinéma photoréaliste.
 */
import {buildSyntheticFilmSceneV03} from './film-contact-v03.mjs';
import {readSyntheticGLB,sampleSyntheticPose} from './film-viewer-v03.mjs';

const gap=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const quant=(x)=>Math.round(x*100000)/100000;

function auditCupMovement(glb,timeline,{sampleHz=120}={}){
 if(!Number.isInteger(sampleHz)||sampleHz<60||sampleHz>240)
   throw Error('Échantillonnage cinématique hors limites.');
 if(!Array.isArray(timeline)||timeline.length<1||timeline.length>10)
   throw Error('Chronologie du mouvement absente.');
 const doc=readSyntheticGLB(glb);
 const names=doc.doc.nodes.map(n=>n.name);
 const find=name=>names.indexOf(name);
 const cup=find('tasse_unique_mobile'),grip=find('tasse_en_main_groupe');
 if(cup<0||grip<0||names.filter(n=>n==='tasse_unique_mobile').length!==1)
   throw Error('La tasse unique ou le point de prise est absent.');
 const duration=doc.clips.find(a=>a.name==='film_scene_v03')?.duration;
 if(!finite(duration)||duration<=0||duration>120)
   throw Error('Durée du GLB cinématique invalide.');
 const drinking=timeline.filter(a=>a.intent==='boire');
 const release=timeline.filter(a=>a.intent==='poser_objet');
 const holding=[];
 let from=null;
 for(const item of timeline){
   if(!finite(item.start)||!finite(item.end)||item.end<=item.start)throw Error('Temps du scénario invalide.');
   if(item.intent==='boire'&&from===null)from=item.start+.90;
   if(item.intent==='poser_objet'&&from!==null){
     holding.push([from,item.start+.55]);from=null;
   }
 }
 if(from!==null)holding.push([from,duration]);
 const transferEvents=[
   ...drinking.map(a=>({kind:'prise',time:a.start+.90})),
   ...release.map(a=>({kind:'depot',time:a.start+.55}))
 ].sort((a,b)=>a.time-b.time);
 const count=Math.ceil(duration*sampleHz);
 if(count>25000)throw Error('Trajectoire trop longue pour audit local.');
 const times=Array.from({length:count+1},(_,i)=>Math.min(duration,i/sampleHz));
 for(const event of transferEvents){
   for(const delta of [-.025,-.01,-.005,0,.005,.01,.025]){
     if(event.time+delta>=0&&event.time+delta<=duration)times.push(event.time+delta);
   }
 }
 times.sort((a,b)=>a-b);
 const frames=[];
 let lastTime=-1;
 for(const t of times){
   if(t<=lastTime+1e-7)continue;
   const pose=sampleSyntheticPose(doc,t);
   const p=pose.world[cup]?.translation,h=pose.world[grip]?.translation;
   if(!p||!h||[...p,...h].some(n=>!finite(n)))throw Error('Coordonnées du GLB invalides.');
   frames.push({t,pos:p,grip:h});
   lastTime=t;
 }
 const moving=frames.slice(1).map((frame,i)=>{
   const previous=frames[i],dt=frame.t-previous.t;
   return {t:frame.t,step:gap(frame.pos,previous.pos),velocity:gap(frame.pos,previous.pos)/dt};
 });
 const maxSpeedMps=moving.reduce((s,k)=>Math.max(s,k.velocity),0);
 const maxFrameStepM=moving.reduce((s,k)=>Math.max(s,k.step),0);
 const maxGripGapM=frames.reduce((max,frame)=>{
   const held=holding.some(([a,b])=>frame.t>=a&&frame.t<=b);
   return held?Math.max(max,gap(frame.pos,frame.grip)):max;
 },0);
 const first=frames[0],last=frames.at(-1);
 const initialFinalCupGapM=gap(first.pos,last.pos);
 const transitionAudit=transferEvents.map(event=>{
   const before=sampleSyntheticPose(doc,Math.max(0,event.time-.005)).world[cup].translation;
   const after=sampleSyntheticPose(doc,Math.min(duration,event.time+.005)).world[cup].translation;
   const at=sampleSyntheticPose(doc,event.time);
   return {
     kind:event.kind,time:quant(event.time),
     displacementAcross10msM:quant(gap(before,after)),
     gripGapAtTransferM:quant(gap(at.world[cup].translation,at.world[grip].translation))
   };
 });
 const degrees=q=>2*Math.atan2(q[0],q[3])*180/Math.PI;
 const tiltKeys=[...drinking.flatMap(a=>[a.start+.2,a.start+1.7,a.end])];
 const cupTiltDegrees=tiltKeys.map(t=>{
   const pose=sampleSyntheticPose(doc,t).world[cup];
   if(!pose)throw Error('Orientation de la tasse absente.');
   return quant(degrees(pose.rotation));
 });
 const report={
   schema:'retoucheproai.film-motion-audit.v0.8',
   synthetic:true,physicalContactVerified:false,fingerCollisionVerified:false,
   framesAudited:frames.length,durationSeconds:quant(duration),sampleHz,
   maxSpeedMps:quant(maxSpeedMps),maxSampleDisplacementM:quant(maxFrameStepM),
   maxGripGapM:quant(maxGripGapM),initialFinalCupGapM:quant(initialFinalCupGapM),
   tiltDegreesSampled:cupTiltDegrees,transfers:transitionAudit,
   thresholds:{maxSpeedMps:6,maxGripGapM:.025,maxTransfer10msM:.04,maxReturnGapM:.025}
 };
 if(!Number.isFinite(maxSpeedMps)||maxSpeedMps>report.thresholds.maxSpeedMps)
   throw Error('Trajectoire de tasse trop rapide : déplacement brusque ou saut détecté.');
 if(maxGripGapM>.025)
   throw Error('Le récipient décroche du point de prise pendant son transport.');
 if(transitionAudit.some(t=>t.displacementAcross10msM>.04))
   throw Error('Saut de tasse au moment de la prise ou du dépôt.');
 if(release.length&&initialFinalCupGapM>.025)
   throw Error('Tasse non revenue à son emplacement après dépôt.');
 return report;
}
function buildSyntheticFilmSceneV08(request,generator){
 const out=buildSyntheticFilmSceneV03(request,generator);
 if(out.status!=='apercu_partiel_glb_anime')return out;
 const movementAudit=auditCupMovement(out.glb,out.timeline);
 const warnings=[...out.warnings,
   'Animation de boisson inclinée progressivement, sans preuve de contact lèvres–tasse.',
   'Audit cinématique 120 Hz : déplacement, continuité des transferts et retour sur la table ; pas de simulation physique.'];
 return {...out,schema:'retoucheproai.film-motion-preview.v0.8',motionAudit:movementAudit,warnings};
}
export {auditCupMovement,buildSyntheticFilmSceneV08};
