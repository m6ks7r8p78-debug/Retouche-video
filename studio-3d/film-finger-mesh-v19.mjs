/** Film Studio v0.19 — géométrie de phalanges effilées, un seul maillage partagé.
 * Sphère d'origine remplacée par un tube fermé à section variable pour les
 * dix segments des cinq doigts. Toujours un modèle synthétique stylisé.
 */
import {buildSyntheticFilmSceneV18} from './film-handgrip-v18.mjs';
import {inspectContinuousTopology} from './film-continuous-v14.mjs';
import {readSyntheticGLB} from './film-viewer-v03.mjs';
import {inspectSyntheticMesh} from './film-webgl-v04.mjs';

const FINGERS=['index','majeur','annulaire','auriculaire','pouce'];
const MESH_NAME='film_phalange_effilee_v19';
const PROFILE=Object.freeze([
 [-1,.20],[-.94,.39],[-.78,.61],[-.53,.88],[-.25,1],
 [.04,.97],[.34,.87],[.60,.72],[.81,.52],[.94,.34],[1,.20]
]);
const length=v=>Math.hypot(...v);
const unit=v=>{const n=length(v);if(!Number.isFinite(n)||n<=0)throw Error('Normale de phalange invalide.');return v.map(x=>x/n);};

function createTaperedPhalanx({radialSegments=12}={}){
 if(!Number.isInteger(radialSegments)||radialSegments<10||radialSegments>24)
  throw Error('Précision de phalange non prise en charge.');
 const positions=[],normals=[],indices=[],rows=PROFILE.length;
 for(let i=0;i<rows;i++){
  const [y,r]=PROFILE[i],prev=PROFILE[Math.max(0,i-1)],next=PROFILE[Math.min(rows-1,i+1)];
  const slope=(next[1]-prev[1])/(next[0]-prev[0]);
  for(let j=0;j<radialSegments;j++){
   const angle=2*Math.PI*j/radialSegments,cos=Math.cos(angle),sin=Math.sin(angle);
   positions.push(r*cos,y,r*sin);
   normals.push(...unit([cos,-slope,sin]));
  }
 }
 for(let i=0;i<rows-1;i++){
  for(let j=0;j<radialSegments;j++){
   const next=(j+1)%radialSegments,
    a=i*radialSegments+j,b=i*radialSegments+next,
    c=(i+1)*radialSegments+j,d=(i+1)*radialSegments+next;
   indices.push(a,b,c,b,d,c);
  }
 }
 const first=positions.length/3,last=first+1;
 positions.push(0,PROFILE[0][0],0,0,PROFILE.at(-1)[0],0);
 normals.push(0,-1,0,0,1,0);
 for(let j=0;j<radialSegments;j++){
  const next=(j+1)%radialSegments,base=(rows-1)*radialSegments;
  indices.push(first,next,j);
  indices.push(last,base+j,base+next);
 }
 return {name:MESH_NAME,materialIndex:0,positions,normals,indices};
}
function decorateTaperedFingerMeshes({model}){
 const mesh=createTaperedPhalanx();
 const meshId=(model.customMeshes??=[]).push(mesh)-1;
 let replaced=0;
 for(const finger of FINGERS)
  for(const part of ['proximal','bout']){
   const name='film_pince_'+finger+'_'+part;
   const node=model.nodes.find(n=>n.name===name);
   if(!node||node.mesh===undefined||!Array.isArray(node.scale))
    throw Error('Phalange articulée absente : '+name);
   if(node.customMeshIndex!==undefined)throw Error('Phalange déjà remplacée : '+name);
   node.customMeshIndex=meshId;
   replaced++;
  }
 if(replaced!==10)throw Error('Mauvais nombre de phalanges.');
}
function auditTaperedFingerMeshes(glb){
 const scene=readSyntheticGLB(glb),names=scene.doc.nodes.map(n=>n.name);
 const ids=[];
 for(const finger of FINGERS){
  for(const part of ['proximal','bout']){
   const name='film_pince_'+finger+'_'+part;
   const id=names.indexOf(name);
   if(id<0||names.lastIndexOf(name)!==id)throw Error('Phalange effilée absente ou dupliquée.');
   ids.push(id);
  }
 }
 const meshId=scene.doc.nodes[ids[0]].mesh;
 if(ids.some(id=>scene.doc.nodes[id].mesh!==meshId))
  throw Error('Les phalanges ne partagent plus le même maillage.');
 const mesh=scene.doc.meshes[meshId];
 if(mesh?.name!==MESH_NAME||mesh.primitives.length!==1||
  mesh.primitives[0].material!==0)
  throw Error('Maillage de peau synthétique non conforme.');
 const decoded=inspectSyntheticMesh(glb,scene).geometries[meshId];
 const topology=inspectContinuousTopology(decoded.positions,decoded.normals,decoded.indices);
 if(!topology.isClosedOrientedManifold||topology.vertices>500||topology.triangles>900)
  throw Error('Phalange triangulée ouverte ou dégénérée.');
 const report={
  schema:'retoucheproai.film-tapered-fingers-audit.v0.19',
  synthetic:true,watertightSharedMesh:true,
  anatomicallyRigged:false,physicallySimulated:false,
  exactFingerCollisionVerified:false,
  fingers:5,segments:ids.length,sharedMeshCount:1,
  triangleCount:topology.triangles,vertexCount:topology.vertices,
  degenerateTriangles:topology.degenerateTriangles,
  boundaryOrNonManifoldEdges:topology.boundaryOrNonManifoldEdges,
  badNormals:topology.badNormals
 };
 return report;
}
function buildSyntheticFilmSceneV19(request,generator){
 const out=buildSyntheticFilmSceneV18(request,generator,{
  decorateModel:args=>decorateTaperedFingerMeshes(args)
 });
 if(out.schema!=='retoucheproai.film-motion-preview.v0.18'||
   out.status!=='apercu_partiel_glb_anime')return out;
 const fingersMeshAudit=auditTaperedFingerMeshes(out.glb);
 return {...out,schema:'retoucheproai.film-motion-preview.v0.19',fingersMeshAudit,
  warnings:[...out.warnings,
   'Dix segments de phalanges effilées partagent un seul maillage fermé triangulé, sans peau anatomique ni collision certifiée.']};
}
export {MESH_NAME,PROFILE,createTaperedPhalanx,decorateTaperedFingerMeshes,
 auditTaperedFingerMeshes,buildSyntheticFilmSceneV19};
