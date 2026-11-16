/** Film Studio v0.15 — deux zones de déformation sur un tube GLB fermé.
 * Animation par cibles morph glTF, PAS une peau multi-os ni une simulation physique.
 */
import {buildSyntheticFilmSceneV14,addContinuousWrist,WRIST_MESH,inspectContinuousTopology} from './film-continuous-v14.mjs';
import {gripStrength} from './film-grip-v11.mjs';
import {readSyntheticGLB,sampleSyntheticPose} from './film-viewer-v03.mjs';
import {inspectSyntheticMesh} from './film-webgl-v04.mjs';
import {ellipsoid,signedRadialGap} from './film-volume-v12.mjs';

const round=n=>Math.round(n*100000)/100000;
const distance=(a,b)=>Math.hypot(...a.map((x,i)=>x-b[i]));
const clamp=x=>Math.max(0,Math.min(1,x));

function createWristMorphTargets(mesh){
 if(!mesh||!Array.isArray(mesh.positions)||!Number.isInteger(mesh.radialSegments)||
    !Number.isInteger(mesh.ringCount)||mesh.ringCount<5)
  throw Error('Tube source de déformation manquant.');
 const targets=[
  {center:.30,width:.23,vector:[0,.014,-.007]},
  {center:.73,width:.20,vector:[-.013,.002,.012]}
 ];
 const out=targets.map(({center,width,vector})=>{
  const positions=new Array(mesh.positions.length).fill(0);
  for(let ring=1;ring<mesh.ringCount-1;ring++){
   const u=ring/(mesh.ringCount-1);
   const bell=Math.exp(-Math.pow((u-center)/width,2))*Math.pow(Math.sin(Math.PI*u),2);
   for(let radial=0;radial<mesh.radialSegments;radial++){
    const base=(ring*mesh.radialSegments+radial)*3;
    for(let k=0;k<3;k++)positions[base+k]=bell*vector[k];
   }
  }
  return {positions};
 });
 return out;
}
function morphWeightAt(time,timeline){
 if(!Number.isFinite(time)||!Array.isArray(timeline))throw Error('Temps ou scénario de déformation invalide.');
 const g=gripStrength(time,timeline);
 const drink=timeline.find(x=>x.intent==='boire');
 const wave=drink?Math.max(0,Math.sin(Math.PI*(time-(drink.start+.85))/1.95)):0;
 return [round(clamp(.80*g)),round(clamp((.22+.58*wave)*g))];
}
function addMorphWrist({model,output,ids,fineTimes,...rest},generator){
 addContinuousWrist({model,output,ids,fineTimes,...rest},generator);
 const mesh=(model.customMeshes||[]).find(x=>x.name===WRIST_MESH),
  nodeId=model.nodes.findIndex(x=>x.name===WRIST_MESH);
 if(!mesh||nodeId<0||!Array.isArray(fineTimes)||fineTimes.length<10)
  throw Error('Manchette à déformer indisponible.');
 mesh.morphTargets=createWristMorphTargets(mesh);
 model.nodes[nodeId].morphWeights=[0,0];
 model.animations[0].channels.push({
  node:nodeId,path:'weights',times:fineTimes,
  values:fineTimes.map(t=>morphWeightAt(t,output.timeline))
 });
}

/** Compare les positions déformées du GLB final à la tasse réelle animée.
 * Ne conclut pas à une collision triangle-triangle exhaustive.
 */
function auditMorphWrist(glb,timeline,{sampleHz=15}={}){
 if(!Number.isInteger(sampleHz)||sampleHz<10||sampleHz>30)
  throw Error('Cadence morph invalide.');
 if(!Array.isArray(timeline)||!timeline.length||timeline.length>10)
  throw Error('Scénario morph invalide.');
 const scene=readSyntheticGLB(glb),names=scene.doc.nodes.map(n=>n.name),
  node=names.indexOf(WRIST_MESH),cup=names.indexOf('tasse_corps_table');
 if(node<0||cup<0||names.lastIndexOf(WRIST_MESH)!==node)
  throw Error('Manchette morph absente ou dupliquée.');
 const shape=scene.doc.nodes[node],geo=inspectSyntheticMesh(glb,scene).geometries[shape.mesh];
 if(geo.morph.length!==2)throw Error('Deux cibles morph requises.');
 const topo=inspectContinuousTopology(geo.positions,geo.normals,geo.indices);
 if(!topo.isClosedOrientedManifold)throw Error('Maillage morph initial non fermé.');
 const track=scene.clips[0].tracks.find(t=>t.node===node&&t.path==='weights');
 if(!track||track.values.length<10||track.values.some(v=>v.length!==2||
    v.some(x=>!Number.isFinite(x)||x<0||x>1)))
  throw Error('Piste morph incomplète.');
 const drink=timeline.find(x=>x.intent==='boire'),
  place=timeline.find(x=>x.intent==='poser_objet');
 if(!drink)throw Error('Scénario boire absent.');
 const start=drink.start+.5,end=place?place.start+.5:drink.end;
 if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||
    end>scene.clips[0].duration+.001)throw Error('Fenêtre de déformation invalide.');
 const count=Math.ceil((end-start)*sampleHz);
 if(count>5000)throw Error('Trop de poses de déformation.');
 const nverts=geo.positions.length/3;
 let maxPen=0,maxDelta=0,changed=0,maxStep=.0;
 let prev=null;
 for(let i=0;i<=count;i++){
  const t=Math.min(end,start+i/sampleHz),pose=sampleSyntheticPose(scene,t);
  const weights=pose.world[node].weights;
  if(weights.length!==2)throw Error('Poids animés absents de la manchette.');
  if(prev)maxStep=Math.max(maxStep,...weights.map((x,j)=>Math.abs(x-prev[j])));
  prev=weights.slice();
  const m=pose.world[node].matrix,body=ellipsoid(pose.world[cup].matrix);
  for(let j=0;j<nverts;j++){
   let local=[];
   for(let k=0;k<3;k++){
    const a=geo.positions[3*j+k];
    let delta=0;
    for(let z=0;z<2;z++)delta+=weights[z]*geo.morph[z][3*j+k];
    local[k]=a+delta;maxDelta=Math.max(maxDelta,Math.abs(delta));
   }
   if(weights[0]>.01||weights[1]>.01){
    const dist=distance(local,[geo.positions[3*j],geo.positions[3*j+1],geo.positions[3*j+2]]);
    if(dist>.0005)changed++;
   }
   const world=[0,1,2].map(k=>m[k]*local[0]+m[4+k]*local[1]+m[8+k]*local[2]+m[12+k]);
   maxPen=Math.max(maxPen,-signedRadialGap(world,body));
  }
 }
 const startShape=sampleSyntheticPose(scene,0).world[node].weights;
 const report={
  schema:'retoucheproai.film-morph-wrist-audit.v0.15',
  synthetic:true,glTFMorphTargets:true,targetCount:2,
  boneSkinning:false,physicallyDeformedSkin:false,
  exactMeshCollisionVerified:false,
  vertexCount:nverts,triangles:topo.triangles,
  poseSamples:count+1,changedVertexSamples:changed,
  maxCoordinateDisplacementM:round(maxDelta),
  maxSampledCupPenetrationM:round(maxPen),
  maxWeightStep:round(maxStep),
  startingWeights:startShape.map(round),
  threshold:{cupM:.005,weightStep:.18}
 };
 if(changed<100||maxDelta<.001)throw Error('Déformation du raccord non visible dans les sommets.');
 if(maxPen>.005)throw Error('Déformation du raccord traverse la tasse.');
 if(maxStep>.18)throw Error('Saut temporel des poids morph.');
 if(startShape.some(x=>Math.abs(x)>.001))throw Error('Manchette non neutre au départ.');
 return report;
}
function buildSyntheticFilmSceneV15(request,generator){
 const out=buildSyntheticFilmSceneV14(request,generator,{
  decorateModel:args=>addMorphWrist(args,generator)
 });
 if(out.status!=='apercu_partiel_glb_anime')return out;
 const morphAudit=auditMorphWrist(out.glb,out.timeline);
 return {...out,schema:'retoucheproai.film-motion-preview.v0.15',morphAudit,
  warnings:[...out.warnings,
   'Manchette 3D déformable sur deux zones par cibles morph glTF, sans squelette cutané multi-os, sans forces ni collisions exactes.']};
}
export {createWristMorphTargets,morphWeightAt,addMorphWrist,auditMorphWrist,buildSyntheticFilmSceneV15};
