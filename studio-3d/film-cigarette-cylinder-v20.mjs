/** Film Studio v0.20 — tige cylindrique, filtre identifiable et géométrie partagée.
 * Primitives glTF réelles, sans combustion, tabac physique ou photoréalisme.
 */
import {buildSyntheticFilmSceneV19} from './film-finger-mesh-v19.mjs';
import {inspectContinuousTopology} from './film-continuous-v14.mjs';
import {readSyntheticGLB,sampleSyntheticPose} from './film-viewer-v03.mjs';
import {inspectSyntheticMesh} from './film-webgl-v04.mjs';
import {solveSpatialHandTarget} from './film-ik-v17.mjs';

const ROD_MESH='film_cigarette_cylindre_v20';
const FILTER_MESH='film_filtre_cylindre_v20';
const FILTER_NODE='film_filtre_papier_v20';
const FILTER_MATERIAL='filtre_papier_synthetique';
const round=n=>Math.round(n*100000)/100000;
const qmul=(a,b)=>[
 a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],
 a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],
 a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],
 a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]
];
const inverse=q=>[-q[0],-q[1],-q[2],q[3]];
const rotate=(q,v)=>qmul(qmul(q,[...v,0]),inverse(q)).slice(0,3);

// Positionner le filtre ET orienter la tige vers l'extérieur de la bouche.
// Tous les doigts et le récipient suivent le même poignet, sans étirer le bras.
function orientCigaretteAwayFromFace({model,timeline,generator}){
 const nodes=model.nodes,side=model.config.smokeHand;
 const id=name=>{const i=nodes.findIndex(n=>n.name===name);
  if(i<0)throw Error('Repère d’orientation absent : '+name);return i;};
 const shoulder=id('epaule_'+side),elbow=id('coude_'+side),wrist=id('poignet_'+side),
  filter=id('film_cigarette_filtre_contact'),lips=id('film_bouche_cible');
 const parent=nodes.findIndex(n=>n.children?.includes(shoulder));
 const track=node=>model.animations[0].channels.find(ch=>ch.node===node&&ch.path==='rotation');
 const sh=track(shoulder),el=track(elbow),wr=track(wrist);
 if(!sh||!el||!wr)throw Error('Piste d’orientation absente.');
 const scene=readSyntheticGLB(generator.encodeGLB(model).bytes);
 for(const episode of timeline)for(const phase of [.38,.58]){
  const t=episode.start+(episode.end-episode.start)*phase;
  const keys=[sh,el,wr].map(ch=>ch.times.findIndex(a=>Math.abs(a-t)<.00006));
  if(keys.some(i=>i<0))throw Error('Clé d’orientation absente.');
  const pose=sampleSyntheticPose(scene,t,'film_actions_v16');
  const parentRotation=parent<0?[0,0,0,1]:pose.world[parent].rotation;
  // Le bout incandescent est dans la direction -Y locale de la tige.
  // Une rotation -90° autour de X l'aligne sur +Z local de la bouche.
  const desired=qmul(pose.world[lips].rotation,[-Math.SQRT1_2,0,0,Math.SQRT1_2]);
  const offset=rotate(desired,nodes[filter].translation);
  const target=rotate(inverse(parentRotation),pose.world[lips].translation.map(
   (v,i)=>v-offset[i]-pose.world[shoulder].translation[i]));
  const solution=solveSpatialHandTarget({shoulder:[0,0,0],target,
   upperLength:Math.abs(nodes[elbow].translation[1]),lowerOffset:nodes[wrist].translation,
   tipLocal:[0,0,0],wristAngle:0,handSide:side,
   referenceAngles:[sh.values[keys[0]],el.values[keys[1]]].map(q=>2*Math.atan2(q[2],q[3]))});
  sh.values[keys[0]]=solution.shoulderQuaternion;
  el.values[keys[1]]=solution.elbowQuaternion;
  const forearm=qmul(parentRotation,qmul(solution.shoulderQuaternion,solution.elbowQuaternion));
  wr.values[keys[2]]=qmul(inverse(forearm),desired);
 }
}

function createCappedCylinder({radialSegments=16}={}){
 if(!Number.isInteger(radialSegments)||radialSegments<12||radialSegments>24)
  throw Error('Précision de cylindre non prise en charge.');
 const rings=[[-1,.98],[-.985,1],[.985,1],[1,.98]];
 const positions=[],normals=[],indices=[];
 for(let i=0;i<rings.length;i++){
  const [y,r]=rings[i];
  for(let j=0;j<radialSegments;j++){
   const a=j*2*Math.PI/radialSegments,x=Math.cos(a),z=Math.sin(a);
   positions.push(r*x,y,r*z);
   normals.push(x,0,z);
  }
 }
 for(let i=0;i<rings.length-1;i++)
  for(let j=0;j<radialSegments;j++){
   const k=(j+1)%radialSegments,a=i*radialSegments+j,b=i*radialSegments+k,
    c=(i+1)*radialSegments+j,d=(i+1)*radialSegments+k;
   indices.push(a,b,c,b,d,c);
  }
 const lo=positions.length/3,hi=lo+1,last=(rings.length-1)*radialSegments;
 positions.push(0,-1,0,0,1,0);
 normals.push(0,-1,0,0,1,0);
 for(let j=0;j<radialSegments;j++){
  const k=(j+1)%radialSegments;
  indices.push(lo,k,j,hi,last+j,last+k);
 }
 return {positions,normals,indices};
}
function decorateCigaretteCylinder(args){
 const {model}=args;
 const nodes=model.nodes,rod=nodes.findIndex(n=>n.name==='cigarette_tige');
 const side=model.config?.smokeHand,wrist=nodes.findIndex(n=>n.name==='poignet_'+side);
 if(rod<0||wrist<0||!nodes[wrist].children?.includes(rod))
  throw Error('Cigarette et poignet valides requis.');
 if(nodes.some(n=>n.name===FILTER_NODE)||model.materials.some(m=>m.name===FILTER_MATERIAL))
  throw Error('Cigarette cylindrique déjà décorée.');
 const geometry=createCappedCylinder();
 const materials=model.materials;
 const filterMaterial=materials.push({
  name:FILTER_MATERIAL,color:[.64,.43,.24,1]
 })-1;
 const addMesh=(name,materialIndex)=>(model.customMeshes??=[]).push({
  name,materialIndex,...geometry,positions:geometry.positions.slice(),
  normals:geometry.normals.slice(),indices:geometry.indices.slice()
 })-1;
 nodes[rod].customMeshIndex=addMesh(ROD_MESH,7);
 const index=addMesh(FILTER_MESH,filterMaterial);
 const filter=nodes.push({
  name:FILTER_NODE,translation:[.02,-.059,.053],scale:[.017,.029,.017],
  mesh:0,customMeshIndex:index,extras:{materialIndex:filterMaterial}
 })-1;
 (nodes[wrist].children??=[]).push(filter);
 orientCigaretteAwayFromFace(args);
}
function auditCigaretteCylinder(glb,timeline){
 if(!Array.isArray(timeline)||timeline.length<1||timeline.length>5||
  timeline.some(ep=>!Number.isFinite(ep?.start)||!Number.isFinite(ep?.end)||
   ep.start<0||ep.end<=ep.start||ep.end-ep.start>10))
  throw Error('Chronologie de cigarette cylindrique invalide.');
 const scene=readSyntheticGLB(glb),nodes=scene.doc.nodes,names=nodes.map(n=>n.name);
 const find=name=>{
  const i=names.indexOf(name);
  if(i<0||names.lastIndexOf(name)!==i)
   throw Error('Pièce de cigarette cylindrique absente ou dupliquée : '+name);
  return i;
 };
 const rod=find('cigarette_tige'),filter=find(FILTER_NODE);
 const rodMesh=scene.doc.meshes[nodes[rod].mesh],
  filterMesh=scene.doc.meshes[nodes[filter].mesh];
 if(rodMesh?.name!==ROD_MESH||filterMesh?.name!==FILTER_MESH||
   rodMesh.primitives?.[0]?.material!==7)
  throw Error('Matériau ou géométrie de cigarette non conforme.');
 const filterMat=scene.doc.materials.findIndex(m=>m.name===FILTER_MATERIAL);
 if(filterMat<0||filterMesh.primitives[0].material!==filterMat)
  throw Error('Filtre de papier sans matériau distinct.');
 const wearer=nodes.findIndex(n=>n.children?.includes(rod));
 if(wearer<0||!nodes[wearer].children?.includes(filter))
  throw Error('Filtre et cigarette ne suivent pas le même poignet.');
 const meshes=inspectSyntheticMesh(glb,scene).geometries;
 const rodTopo=inspectContinuousTopology(
  meshes[nodes[rod].mesh].positions,meshes[nodes[rod].mesh].normals,
  meshes[nodes[rod].mesh].indices);
 const filterTopo=inspectContinuousTopology(
  meshes[nodes[filter].mesh].positions,meshes[nodes[filter].mesh].normals,
  meshes[nodes[filter].mesh].indices);
 if(!rodTopo.isClosedOrientedManifold||!filterTopo.isClosedOrientedManifold||
  rodTopo.triangles>600||filterTopo.triangles>600)
  throw Error('Cylindre triangulé ouvert ou dégénéré.');
 let maxCoaxialDrift=0,maxTipFilterGap=0;
 for(const ep of timeline){
  for(const fraction of [.0,.38,.58,1]){
   const t=ep.start+(ep.end-ep.start)*fraction;
   const pose=sampleSyntheticPose(scene,t,'film_actions_v16');
   const p=pose.world[rod].translation,q=pose.world[filter].translation;
   const delta=q.map((x,i)=>x-p[i]),matrix=pose.world[rod].matrix;
   const axis=[matrix[4],matrix[5],matrix[6]],length=Math.hypot(...axis);
   if(!Number.isFinite(length)||length<.0001)throw Error('Axe de cigarette dégénéré.');
   const direction=axis.map(x=>x/length);
   const along=delta.reduce((total,x,i)=>total+x*direction[i],0);
   const drift=Math.hypot(...delta.map((x,i)=>x-along*direction[i]));
   maxCoaxialDrift=Math.max(maxCoaxialDrift,drift);
   // Les deux centres sont solidaires d'un seul poignet. Une translation
   // au-delà de la longueur de la tige serait une faute du rig.
   maxTipFilterGap=Math.max(maxTipFilterGap,Math.hypot(...p.map((v,i)=>v-q[i])));
  }
 }
 if(maxCoaxialDrift>.05||maxTipFilterGap>.12)
  throw Error('Le filtre ne reste pas sur la tige de cigarette.');
 const lips=find('film_bouche_cible');
 let minOutwardAlignment=1,orientationSamples=0;
 for(const ep of timeline){
  const start=ep.start+(ep.end-ep.start)*.38,end=ep.start+(ep.end-ep.start)*.58;
  const steps=Math.ceil((end-start)*30);
  for(let i=0;i<=steps;i++){
   const pose=sampleSyntheticPose(scene,start+(end-start)*i/steps,'film_actions_v16');
   const m=pose.world[rod].matrix,b=pose.world[lips].matrix;
   const axis=[-m[4],-m[5],-m[6]],forward=[b[8],b[9],b[10]];
   const alignment=axis.reduce((s,v,j)=>s+v*forward[j],0)/
    (Math.hypot(...axis)*Math.hypot(...forward));
   if(!Number.isFinite(alignment)||alignment<.95)
    throw Error('Orientation de cigarette incorrecte : la tige doit sortir de la bouche.');
   minOutwardAlignment=Math.min(minOutwardAlignment,alignment);orientationSamples++;
  }
 }
 return {
  schema:'retoucheproai.film-cylinder-object-audit.v0.20',
  synthetic:true,rodMaterial:'cigarette_papier',filterMaterial:FILTER_MATERIAL,
  physicallyBurning:false,exactTriangleCollisionVerified:false,
  cylinderCount:1,filterCount:1,
  rodVertices:rodTopo.vertices,rodTriangles:rodTopo.triangles,
  filterTriangles:filterTopo.triangles,
  sampledCoaxialCenterDriftM:round(maxCoaxialDrift),
  maxCenterSeparationM:round(maxTipFilterGap),
  minOutwardAlignment:round(minOutwardAlignment),orientationSamples,
  anatomicalWristLimitsVerified:false,
  sampleCount:timeline.length*4
 };
}
function buildSyntheticFilmSceneV20(request,generator){
 const out=buildSyntheticFilmSceneV19(request,generator,{
  decorateModel:args=>decorateCigaretteCylinder(args)
 });
 if(out.schema!=='retoucheproai.film-motion-preview.v0.19'||
   out.status!=='apercu_partiel_glb_anime')return out;
 const cylinderAudit=auditCigaretteCylinder(out.glb,out.timeline);
 return {...out,schema:'retoucheproai.film-motion-preview.v0.20',cylinderAudit,
  warnings:[...out.warnings,
   'La tige est désormais un cylindre fermé avec filtre distinct, sans combustion ni matière physique.']};
}
export {ROD_MESH,FILTER_MESH,FILTER_NODE,FILTER_MATERIAL,
 createCappedCylinder,decorateCigaretteCylinder,auditCigaretteCylinder,
 buildSyntheticFilmSceneV20};
