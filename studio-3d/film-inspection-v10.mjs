/** Film Studio v0.10 — inspection optique de la main et distance radiale
 * des bouts de doigts à la surface d'une tasse synthétique sphéroïdale.
 * Ce contrôle ne calcule pas les collisions physiques, les forces, les
 * glissements ni une véritable saisie humaine.
 */
import {readSyntheticGLB,sampleSyntheticPose} from './film-viewer-v03.mjs';

const NAMES=['index','majeur','annulaire','auriculaire','pouce'];
const finite=n=>Number.isFinite(n);
const round=n=>Math.round(n*100000)/100000;
const norm=p=>Math.hypot(...p);
const sub=(a,b)=>a.map((n,i)=>n-b[i]);

function radialEllipsoidGap(point,world){
 if(!Array.isArray(point)||point.length!==3||point.some(n=>!finite(n))||
    !world||!Array.isArray(world.matrix)||world.matrix.length!==16||
    world.matrix.some(n=>!finite(n)))throw Error('Mesure de surface invalide.');
 const m=world.matrix,rel=sub(point,[m[12],m[13],m[14]]);
 const cols=[[m[0],m[1],m[2]],[m[4],m[5],m[6]],[m[8],m[9],m[10]]];
 const local=cols.map(col=>{
  const scale2=col.reduce((s,x)=>s+x*x,0);
  if(scale2<1e-12)throw Error('Géométrie de tasse dégénérée.');
  return rel.reduce((s,n,i)=>s+n*col[i],0)/scale2;
 });
 const length=norm(local);
 // Proximité de centre : distance au plus petit rayon approximatif.
 if(length<1e-10)return Math.min(...cols.map(norm));
 const onSurface=[m[12],m[13],m[14]];
 for(let j=0;j<3;j++)
  for(let i=0;i<3;i++)onSurface[i]+=cols[j][i]*(local[j]/length);
 return norm(sub(point,onSurface));
}

function gripInspectionTime(timeline){
 const drink=timeline.find(t=>t.intent==='boire');
 if(!drink||!finite(drink.start)||!finite(drink.end)||drink.end<=drink.start)
  throw Error('Geste de prise absent du scénario.');
 return Math.min(drink.end-.05,drink.start+1.08);
}
function cameraForGrip(scene,pose,angles={}){
 const index=scene.doc.nodes.findIndex(n=>n.name==='tasse_corps_table');
 if(index<0||!pose.world[index])throw Error('Corps de tasse introuvable.');
 const pos=pose.world[index].translation;
 if(pos.some(n=>!finite(n)))throw Error('Cible de caméra non valide.');
 return {
  yaw:finite(angles.yaw)?angles.yaw:.30,
  pitch:finite(angles.pitch)?angles.pitch:.10,
  distance:.77,
  target:[pos[0],pos[1]+.015,pos[2]]
 };
}

function inspectGripSurface(glb,timeline,{sampleHz=30}={}){
 if(!Number.isInteger(sampleHz)||sampleHz<15||sampleHz>90)
  throw Error('Fréquence de contrôle surface invalide.');
 if(!Array.isArray(timeline)||timeline.length>10||!timeline.length)
  throw Error('Chronologie d’inspection absente.');
 const scene=readSyntheticGLB(glb);
 const names=scene.doc.nodes.map(n=>n.name);
 const cup=names.indexOf('tasse_corps_table');
 const tips=NAMES.map(name=>names.indexOf('film_doigt_'+name+'_bout'));
 if(cup<0||tips.some(i=>i<0))throw Error('Tasse ou bouts de doigts absents du GLB.');
 const held=[];
 let from=null;
 for(const action of timeline){
  if(action.intent==='boire'&&from===null)from=action.start+.90;
  if(action.intent==='poser_objet'&&from!==null){held.push([from,action.start+.55]);from=null;}
 }
 if(from!==null)held.push([from,scene.clips[0].duration]);
 if(!held.length)throw Error('Aucun transport de tasse à mesurer.');
 let count=0,near=0,min=Infinity,max=0,total=0;
 const perFinger=NAMES.map(name=>({name,min:Infinity,mean:0,samples:0}));
 let snapshots=0;
 for(const [start,end] of held){
  if(!finite(start)||!finite(end)||end<start||end>scene.clips[0].duration+.001)
   throw Error('Intervalle de prise invalide.');
  const n=Math.ceil((end-start)*sampleHz);
  if(n>10000)throw Error('Trop d’échantillons.');
  for(let k=0;k<=n;k++){
   const t=Math.min(end,start+k/sampleHz);
   const pose=sampleSyntheticPose(scene,t),body=pose.world[cup];
   if(!body)throw Error('Corps de tasse non visible.');
   snapshots++;
   let anyNear=false;
   for(let i=0;i<tips.length;i++){
    const tip=pose.world[tips[i]];
    if(!tip)throw Error('Extrémité de doigt manquante.');
    const gap=radialEllipsoidGap(tip.translation,body);
    if(!finite(gap))throw Error('Distance de surface impossible.');
    count++;min=Math.min(min,gap);max=Math.max(max,gap);total+=gap;
    const f=perFinger[i];f.samples++;f.min=Math.min(f.min,gap);f.mean+=gap;
    if(gap<=.035){near++;anyNear=true;}
   }
   if(anyNear){} // observations au niveau des doigts, sans certification de prise
  }
 }
 return {
  schema:'retoucheproai.film-grip-surface-audit.v0.10',
  synthetic:true,
  surfaceApproximation:'distance radiale aux ellipsoides glTF de la tasse',
  physicalGripVerified:false,collisionVerified:false,forceOrFrictionSimulated:false,
  sampleHz,poseSamples:snapshots,tipSamples:count,
  thresholdForVisualProximityM:.035,
  minRadialSurfaceGapM:round(min),meanRadialSurfaceGapM:round(total/count),
  maxRadialSurfaceGapM:round(max),
  tipSamplesNearSurface:near,
  perFinger:perFinger.map(x=>({name:x.name,samples:x.samples,
   minRadialGapM:round(x.min),meanRadialGapM:round(x.mean/x.samples)}))
 };
}
export {radialEllipsoidGap,gripInspectionTime,cameraForGrip,inspectGripSurface};
