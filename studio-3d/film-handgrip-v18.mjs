/** Film Studio v0.18 — phalanges procédurales de la main qui tient une cigarette.
 * Cinq doigts articulés solidaires du poignet ; index/majeur opposés autour
 * de la tige. Ce n'est PAS une force de serrage ni une collision de triangles.
 */
import {buildSyntheticFilmSceneV17} from './film-ik-v17.mjs';
import {ACTION_SECONDS} from './film-actions-v16.mjs';
import {readSyntheticGLB,sampleSyntheticPose} from './film-viewer-v03.mjs';
import {ellipsoid,compareSampledEllipsoids} from './film-volume-v12.mjs';

const FINGERS=Object.freeze([
 {name:'index',base:[-.008,-.025,.053],angle:.09,tipRadius:.011},
 {name:'majeur',base:[.048,-.025,.053],angle:-.09,tipRadius:.011},
 {name:'annulaire',base:[.081,-.021,.032],angle:-.18,tipRadius:.011},
 {name:'auriculaire',base:[.100,-.017,.014],angle:-.23,tipRadius:.010},
 {name:'pouce',base:[-.042,-.035,.027],angle:.21,tipRadius:.013}
]);
const round=v=>Math.round(v*1e5)/1e5;
const clamp=v=>Math.max(0,Math.min(1,v));
const smooth=v=>{const t=clamp(v);return t*t*(3-2*t);};
const quatZ=a=>[0,0,Math.sin(a/2),Math.cos(a/2)];
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function localPoint(m,world){
 if(!Array.isArray(m)||m.length!==16||!Array.isArray(world)||world.length!==3)
  throw Error('Matrice de poignet invalide.');
 const d=world.map((x,i)=>x-m[i+12]);
 const a=[m[0],m[1],m[2]],b=[m[4],m[5],m[6]],c=[m[8],m[9],m[10]];
 const determinant=dot(a,cross(b,c));
 if(!Number.isFinite(determinant)||Math.abs(determinant)<1e-10)
  throw Error('Poignet dégénéré.');
 return [dot(d,cross(b,c)),dot(a,cross(d,c)),dot(a,cross(b,d))].map(x=>x/determinant);
}

function pinchStrengthAt(t,timeline){
 if(!Number.isFinite(t)||!Array.isArray(timeline))throw Error('Cadence de préhension invalide.');
 // La cigarette ne quitte jamais l'index et le majeur lorsque la main descend.
 // La pression visuelle monte légèrement au moment de l'inhalation.
 let amount=.55;
 for(const e of timeline){
  if(!Number.isFinite(e.start)||!Number.isFinite(e.end)||e.end<=e.start)
   throw Error('Épisode de préhension invalide.');
  if(t<e.start||t>e.end)continue;
  const u=(t-e.start)/ACTION_SECONDS;
  amount=Math.max(amount,.55+.45*smooth((u-.13)/.25)*(1-smooth((u-.73)/.17)));
 }
 return clamp(amount);
}
function decorateCigaretteFingers({model,timeline}){
 const nodes=model.nodes,side=model.config.smokeHand;
 if(!['droite','gauche'].includes(side))throw Error('Main du geste de fumer inconnue.');
 const wrist=nodes.findIndex(n=>n.name==='poignet_'+side);
 const rod=nodes.findIndex(n=>n.name==='cigarette_tige');
 if(wrist<0||rod<0||!nodes[wrist].children?.includes(rod))
  throw Error('Poignet et cigarette non reliés.');
 // Le volume original de la paume engloutissait visuellement la tige.
 // Repositionner ce volume dans le demi-espace opposé au cylindre, tout en
 // conservant le poignet et la cigarette exactement où ils sont.
 const palm=nodes.find(n=>n.name==='main_'+side);
 if(!palm||!Array.isArray(palm.translation)||!Array.isArray(palm.scale))
  throw Error('Volume de paume de la main porteuse absent.');
 palm.translation=[side==='droite'?-.035:.035,-.055,-.01];
 palm.scale=[.048,.077,.037];
 const sh=nodes.findIndex(n=>n.name==='epaule_'+side);
 const timeSource=model.animations[0].channels.find(ch=>ch.node===sh&&ch.path==='rotation');
 if(!timeSource||!Array.isArray(timeSource.times)||timeSource.times.length<10)
  throw Error('Clés temporelles de prise de cigarette manquantes.');
 const times=timeSource.times.slice(),channels=model.animations[0].channels;
 const push=(name,parent,translation,scale,material=0)=>{
  const n={name,translation:translation.slice()};
  if(scale){n.mesh=0;n.scale=scale.slice();n.extras={materialIndex:material};}
  const id=nodes.push(n)-1;
  (nodes[parent].children??=[]).push(id);
  return id;
 };
 for(const finger of FINGERS){
  const base=push('film_pince_'+finger.name+'_pivot',wrist,finger.base);
  push('film_pince_'+finger.name+'_proximal',base,[0,-.027,0],[.012,.029,.012]);
  const hinge=push('film_pince_'+finger.name+'_articulation',base,[0,-.055,0]);
  push('film_pince_'+finger.name+'_bout',hinge,[0,-.019,0],
   [finger.tipRadius,.019,finger.tipRadius]);
  const intensity=t=>pinchStrengthAt(t,timeline);
  // La rotation est petite : les deux centres restent de part et d'autre
  // de la cigarette. Les trois autres doigts restent détendus.
  const multiplier=['index','majeur'].includes(finger.name)?1:.34;
  channels.push({node:base,path:'rotation',times,
   values:times.map(t=>quatZ(finger.angle*intensity(t)*multiplier))});
  channels.push({node:hinge,path:'rotation',times,
   values:times.map(t=>quatZ(finger.angle*intensity(t)*multiplier*.45))});
 }
}

function auditCigaretteFingerGrip(glb,timeline,{sampleHz=24}={}){
 if(!Number.isInteger(sampleHz)||sampleHz<12||sampleHz>60)
  throw Error('Cadence de doigts non prise en charge.');
 if(!Array.isArray(timeline)||timeline.length<1||timeline.length>5)
  throw Error('Épisodes de doigts manquants.');
 const scene=readSyntheticGLB(glb),names=scene.doc.nodes.map(n=>n.name);
 const id=name=>{
  const i=names.indexOf(name);
  if(i<0||names.lastIndexOf(name)!==i)
   throw Error('Doigt ou objet absent ou dupliqué : '+name);
  return i;
 };
 const rod=id('cigarette_tige'),wrist=scene.doc.nodes.findIndex(n=>n.children?.includes(rod));
 const palm=id('main_'+(scene.doc.extras?.smokeHand||'droite'));
 if(wrist<0||!['poignet_droite','poignet_gauche'].includes(names[wrist]))
  throw Error('Le cylindre de cigarette n’est pas rattaché à la main.');
 const fingerIds=FINGERS.map(f=>({name:f.name,
  tip:id('film_pince_'+f.name+'_bout'),
  base:id('film_pince_'+f.name+'_pivot'),
  hinge:id('film_pince_'+f.name+'_articulation')}));
 if(fingerIds.some(f=>!scene.doc.nodes[wrist].children?.includes(f.base)||
   scene.doc.nodes[f.tip].mesh===undefined))
  throw Error('Les cinq doigts ne suivent pas la cigarette.');
 const animation=scene.clips[0],trackIds=fingerIds.flatMap(f=>[f.base,f.hinge]);
 if(trackIds.some(node=>!animation.tracks.some(t=>t.node===node&&t.path==='rotation')))
  throw Error('Articulations de phalange non animées.');
 let proximitySamples=0,maxRadialGap=-Infinity,minRadialGap=Infinity,
  maxVerticalOffset=0,minOppositionM=Infinity,maxWristDriftM=0,
  maxPalmCigaretteSampledPenetrationM=0;
 const phases=[];
 for(const episode of timeline){
  const readings=[];
  for(const fraction of [.38,.48,.58]){
   const t=episode.start+ACTION_SECONDS*fraction;
   const pose=sampleSyntheticPose(scene,t,'film_actions_v16');
   const wristMatrix=pose.world[wrist].matrix;
   const volume=compareSampledEllipsoids(
    ellipsoid(pose.world[palm].matrix),ellipsoid(pose.world[rod].matrix));
   maxPalmCigaretteSampledPenetrationM=Math.max(
    maxPalmCigaretteSampledPenetrationM,volume.maxSampledPenetrationM);
   const center=localPoint(wristMatrix,pose.world[rod].translation);
   const results={};
   for(const f of fingerIds.slice(0,2)){
    const tip=localPoint(wristMatrix,pose.world[f.tip].translation);
    const radial=Math.hypot(tip[0]-center[0],tip[2]-center[2]);
    const gap=radial-.017-(scene.doc.nodes[f.tip].scale[0]||0);
    maxRadialGap=Math.max(maxRadialGap,gap);
    minRadialGap=Math.min(minRadialGap,gap);
    maxVerticalOffset=Math.max(maxVerticalOffset,Math.abs(tip[1]-center[1]));
    results[f.name]={radialSurfaceGapM:round(gap),position:tip};
    proximitySamples++;
   }
   const left=results.index.position,right=results.majeur.position;
   if(!(left[0]<center[0]&&right[0]>center[0]))
    throw Error('Index et majeur ne sont plus opposés autour de la cigarette.');
   const separation=right[0]-left[0];
   minOppositionM=Math.min(minOppositionM,separation);
   readings.push({fraction,indexGapM:results.index.radialSurfaceGapM,
    majeurGapM:results.majeur.radialSurfaceGapM,
    oppositionM:round(separation)});
  }
  phases.push({order:episode.order,readings});
 }
 // Vérifie explicitement une phase de retour au lieu de ne regarder que l'inhalation.
 for(const ep of timeline){
  const pose=sampleSyntheticPose(scene,ep.end,'film_actions_v16');
  const rodPoint=localPoint(pose.world[wrist].matrix,pose.world[rod].translation);
  for(const f of fingerIds.slice(0,2)){
   const fingerPoint=localPoint(pose.world[wrist].matrix,pose.world[f.tip].translation);
   maxWristDriftM=Math.max(maxWristDriftM,Math.abs(fingerPoint[2]-rodPoint[2]));
  }
 }
 const report={
  schema:'retoucheproai.film-cigarette-grip-audit.v0.18',
  synthetic:true,anatomicalFingerRig:false,physicalGripForceVerified:false,
  exactMeshContactVerified:false,fingerCount:5,grippingFingerCount:2,
  hingedFingerChannels:10,smokingHand:names[wrist].slice('poignet_'.length),
  episodesVerified:phases.length,proximitySamples,
  maximumRadialSurfaceGapM:round(maxRadialGap),
  minimumRadialSurfaceGapM:round(minRadialGap),
  maximumAxialCenterOffsetM:round(maxVerticalOffset),
  minimumOpposingFingerDistanceM:round(minOppositionM),
  maximumReturnDepthOffsetM:round(maxWristDriftM),
  maxSampledPalmCigarettePenetrationM:round(maxPalmCigaretteSampledPenetrationM),
  palmCigaretteExactTriangleCollisionVerified:false,
  phases,limits:{absoluteSurfaceGapM:.018,axialCenterOffsetM:.100}
 };
 if(proximitySamples!==timeline.length*6||Math.max(Math.abs(maxRadialGap),Math.abs(minRadialGap))>.018)
  throw Error('Prise stylisée de la cigarette hors tolérance radiale.');
 if(maxVerticalOffset>.100||minOppositionM<.02)
  throw Error('Doigts hors de l’axe de la cigarette ou non opposés.');
 if(maxPalmCigaretteSampledPenetrationM>.003)
  throw Error('La paume traverse le volume de la cigarette.');
 return report;
}
function buildSyntheticFilmSceneV18(request,generator){
 const out=buildSyntheticFilmSceneV17(request,generator,{
  decorateModel:args=>decorateCigaretteFingers(args)
 });
 if(out.schema!=='retoucheproai.film-motion-preview.v0.17'||
    out.status!=='apercu_partiel_glb_anime')return out;
 const gripAudit=auditCigaretteFingerGrip(out.glb,out.timeline);
 return {...out,schema:'retoucheproai.film-motion-preview.v0.18',gripAudit,
  warnings:[...out.warnings,
   'Cinq doigts procéduraux suivent le poignet ; deux phalanges opposées restent proches de la tige. Aucune force ni prise physique certifiée.']};
}
export {FINGERS,pinchStrengthAt,decorateCigaretteFingers,localPoint,
 auditCigaretteFingerGrip,buildSyntheticFilmSceneV18};
