/** Film Studio v0.20 — tige cylindrique, filtre identifiable et géométrie partagée.
 * Primitives glTF réelles, sans combustion, tabac physique ou photoréalisme.
 */
import {buildSyntheticFilmSceneV19} from './film-finger-mesh-v19.mjs';
import {inspectContinuousTopology} from './film-continuous-v14.mjs';
import {readSyntheticGLB,sampleSyntheticPose} from './film-viewer-v03.mjs';
import {inspectSyntheticMesh} from './film-webgl-v04.mjs';

const ROD_MESH='film_cigarette_cylindre_v20';
const FILTER_MESH='film_filtre_cylindre_v20';
const FILTER_NODE='film_filtre_papier_v20';
const FILTER_MATERIAL='filtre_papier_synthetique';
const round=n=>Math.round(n*100000)/100000;

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
function decorateCigaretteCylinder({model}){
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
}
function auditCigaretteCylinder(glb,timeline){
 if(!Array.isArray(timeline)||timeline.length<1||timeline.length>5)
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
   const drift=Math.hypot(...[0,2].map(i=>p[i]-q[i]));
   maxCoaxialDrift=Math.max(maxCoaxialDrift,drift);
   // Les deux centres sont solidaires d'un seul poignet. Une translation
   // au-delà de la longueur de la tige serait une faute du rig.
   maxTipFilterGap=Math.max(maxTipFilterGap,Math.hypot(...p.map((v,i)=>v-q[i])));
  }
 }
 if(maxCoaxialDrift>.05||maxTipFilterGap>.12)
  throw Error('Le filtre ne reste pas sur la tige de cigarette.');
 return {
  schema:'retoucheproai.film-cylinder-object-audit.v0.20',
  synthetic:true,rodMaterial:'cigarette_papier',filterMaterial:FILTER_MATERIAL,
  physicallyBurning:false,exactTriangleCollisionVerified:false,
  cylinderCount:1,filterCount:1,
  rodVertices:rodTopo.vertices,rodTriangles:rodTopo.triangles,
  filterTriangles:filterTopo.triangles,
  sampledCoaxialCenterDriftM:round(maxCoaxialDrift),
  maxCenterSeparationM:round(maxTipFilterGap),
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
