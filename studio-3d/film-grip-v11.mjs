/** Film Studio v0.11 — anse ajourée, trajectoires des doigts ciblant la boucle.
 * Géométrie synthétique uniquement. Aucun solveur de collision/force/friction.
 */
import {decorateFingerRig} from './film-fingers-v09.mjs';
import {buildSyntheticFilmSceneV10} from './film-scene-v10.mjs';
import {readSyntheticGLB,sampleSyntheticPose} from './film-viewer-v03.mjs';
import {radialEllipsoidGap} from './film-inspection-v10.mjs';
const RING_SEGMENTS=12;
const FINGER_TARGETS=[
 {name:'index',angle:68,z:.030},
 {name:'majeur',angle:28,z:.030},
 {name:'annulaire',angle:-23,z:.030},
 {name:'auriculaire',angle:-65,z:.030},
 {name:'pouce',angle:105,z:-.030}
];
const round=n=>Math.round(n*1e5)/1e5;
const len=v=>Math.hypot(...v),sub=(a,b)=>a.map((x,i)=>x-b[i]),
 add=(a,b)=>a.map((x,i)=>x+b[i]),scale=(v,k)=>v.map(x=>x*k);
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const smooth=v=>{const t=Math.max(0,Math.min(1,v));return t*t*(3-2*t);};
function inverseLinear(m,v){
 const a=[m[0],m[1],m[2]],b=[m[4],m[5],m[6]],c=[m[8],m[9],m[10]];
 const det=dot(a,cross(b,c));
 if(!Number.isFinite(det)||Math.abs(det)<1e-8)throw Error('Matrice de poignet singulière.');
 return [dot(v,cross(b,c)),dot(a,cross(v,c)),dot(a,cross(b,v))].map(x=>x/det);
}
function transform(m,p){
 return [m[12]+m[0]*p[0]+m[4]*p[1]+m[8]*p[2],
   m[13]+m[1]*p[0]+m[5]*p[1]+m[9]*p[2],
   m[14]+m[2]*p[0]+m[6]*p[1]+m[10]*p[2]];
}
function gripStrength(t,timeline){
 let up=0,down=1;
 for(const a of timeline){
  if(a.intent==='boire')up=Math.max(up,smooth((t-a.start-.50)/.40));
  if(a.intent==='poser_objet')down=Math.min(down,1-smooth((t-a.start-.18)/.37));
 }
 return up*down;
}
function ringAndGuidedFingers({model,output,ids,fineTimes},generator){
 decorateFingerRig({model,output,ids,fineTimes});
 const nodes=model.nodes,handle=nodes.find(n=>n.name==='tasse_anse_table');
 if(!handle||handle.mesh===undefined||!Array.isArray(handle.scale))throw Error('Anse pleine manquante.');
 const material=handle.extras?.materialIndex??0;
 delete handle.mesh;delete handle.extras;handle.scale=[1,1,1];handle.children=[];
 for(let j=0;j<RING_SEGMENTS;j++){
  const theta=2*Math.PI*j/RING_SEGMENTS;
  handle.children.push(nodes.push({
   name:'film_anse_boucle_'+j,
   translation:[.034*Math.cos(theta),.044*Math.sin(theta),0],
   scale:[.012,.012,.014],mesh:0,extras:{materialIndex:material}
  })-1);
 }
 const palm=nodes.find(n=>n.name==='main_droite');
 if(palm?.scale)palm.scale=[.077,.094,.055];
 // Échantillonner le rig intermédiaire ENCODE avant de le modifier : les
 // corrections sont donc calculées sur les transformations réellement exportées.
 const preliminary=readSyntheticGLB(generator.encodeGLB(model).bytes);
 const names=preliminary.doc.nodes.map(n=>n.name),find=name=>{
  const id=names.indexOf(name);
  if(id<0||names.lastIndexOf(name)!==id)throw Error('Nœud de rig manquant : '+name);
  return id;
 };
 const wrist=find('poignet_droite'),ring=find('tasse_anse_table');
 for(const finger of FINGER_TARGETS){
  const base=find('film_doigt_'+finger.name+'_pivot');
  const tip=find('film_doigt_'+finger.name+'_bout');
  const baseline=nodes[base].translation.slice(),theta=finger.angle*Math.PI/180;
  const goal=[.034*Math.cos(theta),.044*Math.sin(theta),finger.z];
  const values=fineTimes.map(t=>{
   const strength=gripStrength(t,output.timeline);
   if(strength<1e-8)return baseline.slice();
   const pose=sampleSyntheticPose(preliminary,t);
   const correction=inverseLinear(pose.world[wrist].matrix,
    sub(transform(pose.world[ring].matrix,goal),pose.world[tip].translation));
   if(correction.some(n=>!Number.isFinite(n))||len(correction)*strength>.35)
    throw Error('Correction de doigt hors limites.');
   return add(baseline,scale(correction,strength));
  });
  model.animations[0].channels.push({node:base,path:'translation',times:fineTimes,values});
 }
}
function auditHandleGrip(glb,timeline,{sampleHz=30}={}){
 if(!Number.isInteger(sampleHz)||sampleHz<15||sampleHz>90)
  throw Error('Cadence d’audit de l’anse invalide.');
 if(!Array.isArray(timeline)||timeline.length<1||timeline.length>10)
  throw Error('Chronologie non conforme.');
 const scene=readSyntheticGLB(glb),names=scene.doc.nodes.map(n=>n.name);
 const find=name=>{
  const id=names.indexOf(name);
  if(id<0||names.lastIndexOf(name)!==id)throw Error('Nœud GLB manquant/dupliqué : '+name);
  return id;
 };
 const cup=find('tasse_corps_table'),handle=find('tasse_anse_table');
 if(scene.doc.nodes[handle].mesh!==undefined)throw Error('Anse toujours pleine.');
 const segments=Array.from({length:RING_SEGMENTS},(_,i)=>find('film_anse_boucle_'+i));
 if(scene.doc.nodes[handle].children?.length!==RING_SEGMENTS)throw Error('Anse ajourée incomplète.');
 const drink=timeline.find(x=>x.intent==='boire'),place=timeline.find(x=>x.intent==='poser_objet');
 if(!drink)throw Error('Action boire absente.');
 const start=drink.start+.94,end=place?place.start+.18:Math.min(drink.end,scene.clips[0].duration);
 if(!Number.isFinite(end)||end<=start||end>scene.clips[0].duration+.001)
  throw Error('Fenêtre de préhension non valide.');
 const fingers=FINGER_TARGETS.map(f=>({name:f.name,tip:find('film_doigt_'+f.name+'_bout'),min:Infinity,max:0,total:0,n:0}));
 const count=Math.ceil((end-start)*sampleHz)+1;
 let deep=0,near=0;
 for(let i=0;i<count;i++){
  const pose=sampleSyntheticPose(scene,Math.min(end,start+i/sampleHz));
  for(const finger of fingers){
   const point=pose.world[finger.tip].translation;
   const surfaceGap=Math.min(...segments.map(id=>radialEllipsoidGap(point,pose.world[id])));
   if(!Number.isFinite(surfaceGap))throw Error('Distance à l’anse non finie.');
   finger.min=Math.min(finger.min,surfaceGap);
   finger.max=Math.max(finger.max,surfaceGap);
   finger.total+=surfaceGap;finger.n++;
   if(surfaceGap<.035)near++;
   // Seul le CENTRE de chaque bout de doigt est contrôlé : ceci n'est
   // pas une détection de collision des surfaces des maillages.
   const body=pose.world[cup],ext=body.scale,center=body.translation;
   const normalized=Math.hypot(...point.map((v,j)=>(v-center[j])/ext[j]));
   if(normalized<1)deep=Math.max(deep,radialEllipsoidGap(point,body));
  }
 }
 const readings=fingers.map(f=>({name:f.name,minGapM:round(f.min),
  meanGapM:round(f.total/f.n),maxGapM:round(f.max)}));
 const meanWorst=Math.max(...readings.map(f=>f.meanGapM));
 const fraction=near/(count*fingers.length);
 const report={
  schema:'retoucheproai.film-handle-grip-audit.v0.11',synthetic:true,
  physicalContactVerified:false,realMeshCollisionVerified:false,
  forceOrFrictionSimulated:false,
  approximation:'anse en 12 ellipsoides; centres des bouts de doigts',
  handleSegmentCount:RING_SEGMENTS,handleLoopCount:1,sampleHz,
  poseSamples:count,nearHandleFraction:round(fraction),
  maxMeanFingertipHandleGapM:round(meanWorst),
  deepestFingertipCenterInsideCupM:round(deep),fingers:readings
 };
 if(meanWorst>.045||fraction<.7)throw Error('Doigts trop éloignés de l’anse.');
 if(deep>.012)throw Error('Centre de doigt enfoncé dans le corps de la tasse.');
 return report;
}
function buildSyntheticFilmSceneV11(request,generator){
 const out=buildSyntheticFilmSceneV10(request,generator,{
  decorateModel:args=>ringAndGuidedFingers(args,generator)
 });
 if(out.status!=='apercu_partiel_glb_anime')return out;
 const handleAudit=auditHandleGrip(out.glb,out.timeline);
 return {...out,schema:'retoucheproai.film-motion-preview.v0.11',handleAudit,
  warnings:[...out.warnings,
   'Anse ajourée et doigts guidés géométriquement autour de la boucle ; ni collision des maillages ni force de préhension physique prouvées.']};
}
export {RING_SEGMENTS,FINGER_TARGETS,gripStrength,ringAndGuidedFingers,auditHandleGrip,buildSyntheticFilmSceneV11};
