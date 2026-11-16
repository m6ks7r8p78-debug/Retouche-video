/** Film Studio v0.12 — échantillonnage des surfaces des volumes sphéroïdaux.
 * Les primitives GLB sont des sphères étirées. On mesure leurs intersections
 * APPROXIMATIVES, pas des collisions triangle-triangle ou un solveur physique.
 */
import {readSyntheticGLB,sampleSyntheticPose} from './film-viewer-v03.mjs';
import {buildSyntheticFilmSceneV11,ringAndGuidedFingers} from './film-grip-v11.mjs';

const FINGERS=['index','majeur','annulaire','auriculaire','pouce'];
const round=n=>Math.round(n*1e5)/1e5;
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const mag=a=>Math.hypot(...a);

function sampleDirections(count=32){
 if(!Number.isInteger(count)||count<16||count>96)throw Error('Précision des surfaces non prise en charge.');
 const out=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
 for(let i=0;i<count;i++){
  const y=1-2*(i+.5)/count,theta=i*Math.PI*(3-Math.sqrt(5));
  const radius=Math.sqrt(1-y*y);
  out.push([radius*Math.cos(theta),y,radius*Math.sin(theta)]);
 }
 return out;
}
const directions=sampleDirections();

function ellipsoid(matrix){
 if(!Array.isArray(matrix)||matrix.length!==16||matrix.some(v=>!Number.isFinite(v)))
  throw Error('Transformée du volume invalide.');
 const columns=[[matrix[0],matrix[1],matrix[2]],
  [matrix[4],matrix[5],matrix[6]],[matrix[8],matrix[9],matrix[10]]];
 const determinant=dot(columns[0],cross(columns[1],columns[2]));
 if(!Number.isFinite(determinant)||Math.abs(determinant)<1e-9)
  throw Error('Volume sphéroïdal dégénéré.');
 const inv=[cross(columns[1],columns[2]),cross(columns[2],columns[0]),
  cross(columns[0],columns[1])].map(row=>row.map(v=>v/determinant));
 return {matrix,center:[matrix[12],matrix[13],matrix[14]],inv,
  minRadiusM:Math.min(...columns.map(mag))};
}
function surfacePoint(shape,unit){
 if(!Array.isArray(unit)||unit.length!==3||unit.some(x=>!Number.isFinite(x))||
  Math.abs(mag(unit)-1)>.00001)throw Error('Direction de surface non normalisée.');
 const m=shape.matrix;
 return [0,1,2].map(i=>shape.center[i]+m[i]*unit[0]+m[i+4]*unit[1]+m[i+8]*unit[2]);
}
function signedRadialGap(point,shape){
 if(!Array.isArray(point)||point.length!==3||point.some(v=>!Number.isFinite(v)))
  throw Error('Point de contact invalide.');
 const diff=point.map((v,i)=>v-shape.center[i]);
 const local=shape.inv.map(row=>dot(row,diff)),r=mag(local);
 if(r<1e-10)return -shape.minRadiusM;
 // Distance le long du rayon, PAS distance euclidienne minimale.
 return (r-1)*mag(diff)/r;
}
function compareSampledEllipsoids(first,second,{directionsList=directions}={}){
 if(!Array.isArray(directionsList)||directionsList.length<6)
  throw Error('Échantillons de surface absents.');
 let deepest=0,inside=0,near=0;
 for(const u of directionsList){
  for(const [from,to] of [[first,second],[second,first]]){
   const gap=signedRadialGap(surfacePoint(from,u),to);
   deepest=Math.max(deepest,-gap);
   if(gap<-.001)inside++;
   if(Math.abs(gap)<.003)near++;
  }
 }
 return {maxSampledPenetrationM:deepest,insideSurfaceSamples:inside,
  nearSurfaceSamples:near};
}

/** Détecte une pénétration grossière des volumes de la paume/phalanges
 * dans la tasse et les 12 ellipsoïdes de son anse, sur un scénario GLB réel.
 */
function auditFingerVolumes(glb,timeline,{sampleHz=12}={}){
 if(!Number.isInteger(sampleHz)||sampleHz<8||sampleHz>30)
  throw Error('Cadence de mesure volumique non prise en charge.');
 if(!Array.isArray(timeline)||timeline.length<1||timeline.length>10)
  throw Error('Chronologie non conforme.');
 const scene=readSyntheticGLB(glb),names=scene.doc.nodes.map(n=>n.name);
 const find=name=>{
  const id=names.indexOf(name);
  if(id<0||names.lastIndexOf(name)!==id)
   throw Error('Volume du GLB manquant ou dupliqué : '+name);
  if(scene.doc.nodes[id].mesh===undefined)throw Error('Le volume est dépourvu de maillage : '+name);
  return id;
 };
 const body=find('tasse_corps_table'),palm=find('main_droite');
 const parts=[{name:'paume',id:palm},...FINGERS.flatMap(name=>[
  {name:name+'_proximal',id:find('film_doigt_'+name+'_proximal')},
  {name:name+'_bout',id:find('film_doigt_'+name+'_bout')}
 ])];
 const handle=Array.from({length:12},(_,i)=>find('film_anse_boucle_'+i));
 const drink=timeline.find(x=>x.intent==='boire');
 const place=timeline.find(x=>x.intent==='poser_objet');
 if(!drink)throw Error('Animation de tasse absente.');
 const start=drink.start+.98,end=place?place.start+.15:drink.end;
 if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||
   end>scene.clips[0].duration+.001)throw Error('Fenêtre de volume invalide.');
 const iterations=Math.ceil((end-start)*sampleHz);
 if(iterations>3000)throw Error('Audit volumique trop long.');
 const stats=parts.map(p=>({name:p.name,maxCupM:0,maxHandleM:0,insideCup:0,
  insideHandle:0}));
 let maxCupM=0,maxHandleM=0,palmCupM=0,comparisons=0;
 for(let i=0;i<=iterations;i++){
  const t=Math.min(end,start+i/sampleHz),pose=sampleSyntheticPose(scene,t);
  const cup=ellipsoid(pose.world[body].matrix);
  const ring=handle.map(id=>ellipsoid(pose.world[id].matrix));
  for(let j=0;j<parts.length;j++){
   const shape=ellipsoid(pose.world[parts[j].id].matrix);
   const cupPair=compareSampledEllipsoids(shape,cup);
   const st=stats[j];
   st.maxCupM=Math.max(st.maxCupM,cupPair.maxSampledPenetrationM);
   st.insideCup+=cupPair.insideSurfaceSamples;
   maxCupM=Math.max(maxCupM,cupPair.maxSampledPenetrationM);
   if(j===0)palmCupM=Math.max(palmCupM,cupPair.maxSampledPenetrationM);
   for(const h of ring){
    const pair=compareSampledEllipsoids(shape,h);
    st.maxHandleM=Math.max(st.maxHandleM,pair.maxSampledPenetrationM);
    st.insideHandle+=pair.insideSurfaceSamples;
    maxHandleM=Math.max(maxHandleM,pair.maxSampledPenetrationM);
    comparisons++;
   }
  }
 }
 const report={
  schema:'retoucheproai.film-volume-overlap-audit.v0.12',
  synthetic:true,exactTriangleCollisionVerified:false,
  physicsOrGripForceSimulated:false,
  method:'bidirectional sparse ellipsoid surface samples; radial inward gap',
  sampleDirectionsPerEllipsoid:directions.length,
  poseSamples:iterations+1,shapeCount:parts.length,ringSegmentCount:handle.length,
  handlePairComparisons:comparisons,
  maxSampledPalmCupPenetrationM:round(palmCupM),
  maxSampledCupPenetrationM:round(maxCupM),
  maxSampledHandlePenetrationM:round(maxHandleM),
  volumes:stats.map(x=>({name:x.name,
   maxSampledCupPenetrationM:round(x.maxCupM),
   maxSampledHandlePenetrationM:round(x.maxHandleM),
   cupInsideSampleCount:x.insideCup,handleInsideSampleCount:x.insideHandle})),
  rejectionThresholds:{palmCupM:.003,allCupM:.012,handleM:.035}
 };
 if(palmCupM>.003)throw Error('Chevauchement volumique paume–tasse excessif.');
 if(maxCupM>.012)throw Error('Chevauchement volumique doigt–corps de tasse excessif.');
 if(maxHandleM>.035)throw Error('Chevauchement volumique doigt–anse excessif.');
 return report;
}

/** Corrige le volume de paume sans changer ni poignet ni point d'ancrage
 * (et donc sans déplacer la tasse dans son animation vérifiée).
 */
function refinedPalm(args,generator){
 ringAndGuidedFingers(args,generator);
 const palm=args.model.nodes.find(n=>n.name==='main_droite');
 if(!palm||!Array.isArray(palm.translation)||!Array.isArray(palm.scale))
  throw Error('Volume de paume absent.');
 palm.translation=[.15,-.063,-.04];
 palm.scale=[.048,.088,.045];
}
function buildSyntheticFilmSceneV12(request,generator){
 const out=buildSyntheticFilmSceneV11(request,generator,{
  decorateModel:args=>refinedPalm(args,generator)
 });
 if(out.status!=='apercu_partiel_glb_anime')return out;
 const volumeAudit=auditFingerVolumes(out.glb,out.timeline);
 return {...out,schema:'retoucheproai.film-motion-preview.v0.12',volumeAudit,
  warnings:[...out.warnings,
   'Chevauchements mesurés par échantillonnage des surfaces sphéroïdales des doigts, de l’anse et de la tasse : contrôle approximatif, pas de collisions physiques exactes.']};
}
export {sampleDirections,ellipsoid,surfacePoint,signedRadialGap,compareSampledEllipsoids,
 auditFingerVolumes,refinedPalm,buildSyntheticFilmSceneV12};
