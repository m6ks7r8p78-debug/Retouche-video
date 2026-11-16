/** Film Studio v0.14 — un seul maillage fermé pour la manchette poignet–paume.
 * Animation rigide attachée au poignet, pas de déformation cutanée ou de
 * skinning biomécanique. Audit des triangles et des poses GLB finales.
 */
import generatorDefault from './generateur.js';
import {buildSyntheticFilmSceneV12,refinedPalm,ellipsoid,signedRadialGap} from './film-volume-v12.mjs';
import {PATH} from './film-bridge-v13.mjs';
import {readSyntheticGLB,sampleSyntheticPose} from './film-viewer-v03.mjs';
import {inspectSyntheticMesh} from './film-webgl-v04.mjs';

const WRIST_MESH='film_manchon_continu_poignet_paume';
const CONTROL=[[0,.028,0],...PATH];
const RADIO=[.058,.027,.021,.024,.027,.030,.049];
const round=x=>Math.round(x*1e5)/1e5;
const sub=(a,b)=>a.map((n,i)=>n-b[i]);
const add=(a,b)=>a.map((n,i)=>n+b[i]);
const mul=(a,s)=>a.map(n=>n*s);
const dot=(a,b)=>a.reduce((s,n,i)=>s+n*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=a=>Math.hypot(...a);
const unit=a=>{const n=norm(a);if(!Number.isFinite(n)||n<1e-9)throw Error('Direction de manchette dégénérée.');return mul(a,1/n);};
function interpolateControl(t){
 const seg=Math.min(CONTROL.length-2,Math.max(0,Math.floor(t))),
   u=Math.min(1,Math.max(0,t-seg));
 const p0=CONTROL[Math.max(0,seg-1)],p1=CONTROL[seg],p2=CONTROL[seg+1],
  p3=CONTROL[Math.min(CONTROL.length-1,seg+2)];
 // Cubic Hermite, tangent central damped to avoid overshoot at bends.
 const m1=mul(sub(p2,p0),.32),m2=mul(sub(p3,p1),.32),u2=u*u,u3=u2*u;
 const center=[0,1,2].map(i=>
  (2*u3-3*u2+1)*p1[i]+(u3-2*u2+u)*m1[i]+
  (-2*u3+3*u2)*p2[i]+(u3-u2)*m2[i]);
 const radius=RADIO[seg]+(RADIO[seg+1]-RADIO[seg])*(u*u*(3-2*u));
 return {center,radius};
}
function createContinuousWristMesh({radialSegments=16,stepsPerSegment=5}={}){
 if(!Number.isInteger(radialSegments)||radialSegments<12||radialSegments>32||
  !Number.isInteger(stepsPerSegment)||stepsPerSegment<3||stepsPerSegment>10)
  throw Error('Précision du maillage continu non prise en charge.');
 const rings=(CONTROL.length-1)*stepsPerSegment+1,positions=[],normals=[],indices=[];
 const curves=Array.from({length:rings},(_,j)=>interpolateControl(j/stepsPerSegment));
 for(let j=0;j<rings;j++){
  const center=curves[j].center,radius=curves[j].radius;
  const tangent=unit(sub(curves[Math.min(rings-1,j+1)].center,
                        curves[Math.max(0,j-1)].center));
  const ref=Math.abs(dot(tangent,[0,0,1]))>.92?[0,1,0]:[0,0,1];
  const u=unit(cross(ref,tangent)),v=unit(cross(tangent,u));
  for(let k=0;k<radialSegments;k++){
   const theta=2*Math.PI*k/radialSegments;
   const radial=add(mul(u,Math.cos(theta)),mul(v,Math.sin(theta)));
   const point=add(center,mul(radial,radius));
   positions.push(...point);normals.push(...radial);
  }
 }
 for(let j=0;j<rings-1;j++)
  for(let k=0;k<radialSegments;k++){
   const next=(k+1)%radialSegments;
   const a=j*radialSegments+k,a1=j*radialSegments+next,
     b=(j+1)*radialSegments+k,b1=(j+1)*radialSegments+next;
   indices.push(a,a1,b,a1,b1,b);
  }
 const startCap=positions.length/3,endCap=startCap+1;
 positions.push(...curves[0].center,...curves.at(-1).center);
 const startNormal=unit(sub(curves[0].center,curves[1].center));
 const endNormal=unit(sub(curves.at(-1).center,curves.at(-2).center));
 normals.push(...startNormal,...endNormal);
 for(let k=0;k<radialSegments;k++){
  const next=(k+1)%radialSegments;
  indices.push(startCap,next,k);
  const base=(rings-1)*radialSegments;
  indices.push(endCap,base+k,base+next);
 }
 return {name:WRIST_MESH,positions,normals,indices,materialIndex:0,
  ringCount:rings,radialSegments};
}
function addContinuousWrist({model,ids,...rest},generator){
 refinedPalm({model,ids,...rest},generator);
 const wrist=model.nodes[ids.wrist];
 if(!wrist)throw Error('Poignet du rig absent.');
 const mesh=createContinuousWristMesh();
 const index=(model.customMeshes??=[]).push(mesh)-1;
 const id=model.nodes.push({
  name:WRIST_MESH,translation:[0,0,0],scale:[1,1,1],mesh:0,
  customMeshIndex:index
 })-1;
 (wrist.children??=[]).push(id);
}

/** Vérification des arêtes orientées d'une surface fermée.
 * Cela garantit la topologie du tube, pas le contact physique de la main.
 */
function inspectContinuousTopology(positions,normals,indices){
 if(!positions||!normals||!indices||positions.length!==normals.length||
    positions.length<90||positions.length%3!==0||
    indices.length<90||indices.length%3!==0)throw Error('Maillage triangulé continu invalide.');
 const edges=new Map();
 let degenerate=0,badNormal=0;
 for(let j=0;j<normals.length;j+=3){
  const n=norm([normals[j],normals[j+1],normals[j+2]]);
  if(!Number.isFinite(n)||Math.abs(n-1)>.05)badNormal++;
 }
 for(let i=0;i<indices.length;i+=3){
  const [a,b,c]=[indices[i],indices[i+1],indices[i+2]];
  if([a,b,c].some(x=>!Number.isInteger(x)||x<0||x>=positions.length/3)||
    a===b||a===c||b===c)throw Error('Indice triangulaire invalide.');
  const pa=positions.slice(a*3,a*3+3),pb=positions.slice(b*3,b*3+3),
   pc=positions.slice(c*3,c*3+3);
  if(norm(cross(sub(pb,pa),sub(pc,pa)))<1e-9)degenerate++;
  for(const [u,v] of [[a,b],[b,c],[c,a]]){
   const key=Math.min(u,v)+':'+Math.max(u,v);
   const e=edges.get(key)||{forward:0,reverse:0};
   if(u<v)e.forward++;else e.reverse++;
   edges.set(key,e);
  }
 }
 const badEdges=[...edges.values()].filter(e=>e.forward!==1||e.reverse!==1).length;
 return {vertices:positions.length/3,triangles:indices.length/3,
  edges:edges.size,boundaryOrNonManifoldEdges:badEdges,
  degenerateTriangles:degenerate,badNormals:badNormal,
  isClosedOrientedManifold:badEdges===0&&degenerate===0&&badNormal===0};
}
function auditContinuousWrist(glb,timeline,{sampleHz=12}={}){
 if(!Number.isInteger(sampleHz)||sampleHz<8||sampleHz>30)throw Error('Cadence d’audit maillage invalide.');
 if(!Array.isArray(timeline)||timeline.length<1||timeline.length>10)
  throw Error('Chronologie maillage absente.');
 const scene=readSyntheticGLB(glb),names=scene.doc.nodes.map(n=>n.name);
 const idx=names.indexOf(WRIST_MESH);
 if(idx<0||names.lastIndexOf(WRIST_MESH)!==idx)throw Error('Maillage continu absent ou dupliqué.');
 if(names.some(n=>n.startsWith('film_liaison_poignet_paume_')))
  throw Error('Anciennes sphères de raccord encore présentes.');
 const wrist=names.indexOf('poignet_droite'),cup=names.indexOf('tasse_corps_table');
 if(wrist<0||cup<0||!scene.doc.nodes[wrist].children?.includes(idx))
  throw Error('Manchette non attachée au poignet.');
 const meshIdx=scene.doc.nodes[idx].mesh,mesh=scene.doc.meshes[meshIdx];
 if(!mesh||mesh.primitives.length!==1||mesh.primitives[0].material!==0)
  throw Error('Manchette custom mesh non conforme.');
 const parsed=inspectSyntheticMesh(glb,scene),geo=parsed.geometries[meshIdx];
 const topo=inspectContinuousTopology(geo.positions,geo.normals,geo.indices);
 if(!topo.isClosedOrientedManifold||topo.vertices>1024||topo.triangles>2048)
  throw Error('Surface de raccord ouverte ou dégénérée.');
 const drink=timeline.find(t=>t.intent==='boire'),place=timeline.find(t=>t.intent==='poser_objet');
 if(!drink)throw Error('Geste boire absent.');
 const start=drink.start+.98,end=place?place.start+.15:drink.end;
 if(!Number.isFinite(start)||!Number.isFinite(end)||start>=end||
    end>scene.clips[0].duration+.001)throw Error('Fenêtre d’audit continue invalide.');
 const steps=Math.ceil((end-start)*sampleHz);
 if(steps>3000)throw Error('Trop de poses maillage.');
 let maxCupM=0,poseCount=0,maxDriftM=0;
 for(let i=0;i<=steps;i++){
  const t=Math.min(end,start+i/sampleHz),pose=sampleSyntheticPose(scene,t);
  const matrix=pose.world[idx].matrix,cupShape=ellipsoid(pose.world[cup].matrix);
  const wristMatrix=pose.world[wrist].matrix;
  maxDriftM=Math.max(maxDriftM,Math.hypot(...[0,1,2].map(j=>matrix[j+12]-wristMatrix[j+12])));
  // Échantillons de sommets ET centroïdes des triangles, après animation.
  const worldAt=j=>{
   const p=geo.positions.slice(j*3,j*3+3);
   return [0,1,2].map(k=>matrix[k*4]*p[0]+matrix[k+4]*p[1]+matrix[k+8]*p[2]+matrix[k+12]);
  };
  const positions=Array.from({length:topo.vertices},(_,j)=>worldAt(j));
  for(const p of positions)maxCupM=Math.max(maxCupM,-signedRadialGap(p,cupShape));
  for(let q=0;q<geo.indices.length;q+=3){
   const a=positions[geo.indices[q]],b=positions[geo.indices[q+1]],c=positions[geo.indices[q+2]];
   const center=[0,1,2].map(k=>(a[k]+b[k]+c[k])/3);
   maxCupM=Math.max(maxCupM,-signedRadialGap(center,cupShape));
  }
  poseCount++;
 }
 const report={schema:'retoucheproai.film-continuous-wrist-audit.v0.14',
  synthetic:true,skinned:false,physicallyConnected:false,
  exactTriangleCollisionVerified:false,
  method:'manifold edge audit and sampled animated vertex/triangle-centroid clearance',
  vertices:topo.vertices,triangles:topo.triangles,
  boundaryOrNonManifoldEdges:topo.boundaryOrNonManifoldEdges,
  degenerateTriangles:topo.degenerateTriangles,badNormals:topo.badNormals,
  poseSamples:poseCount,maxSampledCupPenetrationM:round(maxCupM),
  maxWristAttachmentDriftM:round(maxDriftM),
  threshold:{cupM:.005,wristDriftM:.0001}
 };
 if(maxCupM>.005)throw Error('Maillage continu pénètre le corps de tasse.');
 if(maxDriftM>.0001)throw Error('Maillage continu ne suit plus le poignet.');
 return report;
}
function buildSyntheticFilmSceneV14(request,generator=generatorDefault){
 const out=buildSyntheticFilmSceneV12(request,generator,{
  decorateModel:args=>addContinuousWrist(args,generator)
 });
 if(out.status!=='apercu_partiel_glb_anime')return out;
 const continuousAudit=auditContinuousWrist(out.glb,out.timeline);
 return {...out,schema:'retoucheproai.film-motion-preview.v0.14',continuousAudit,
  warnings:[...out.warnings,'Un seul tube triangulé fermé relie le poignet à la paume, animé rigidement ; aucune peau déformable, aucun calcul de forces ou contact physique démontré.']};
}
export {WRIST_MESH,CONTROL,RADIO,createContinuousWristMesh,inspectContinuousTopology,
 addContinuousWrist,auditContinuousWrist,buildSyntheticFilmSceneV14};
