/** Film Studio v0.13 — volumes de raccord entre l'avant-bras et la paume.
 * Cinq ellipsoïdes orientés suivent le poignet et rejoignent la paume.
 * Mesures géométriques approximatives, sans cinématique biomécanique ni
 * validation de collisions exactes entre triangles.
 */
import {buildSyntheticFilmSceneV12,refinedPalm,ellipsoid,compareSampledEllipsoids} from './film-volume-v12.mjs';
import {readSyntheticGLB,sampleSyntheticPose} from './film-viewer-v03.mjs';
const PATH=[[0,0,0],[.025,.042,-.015],[.058,.070,-.025],[.097,.065,-.030],[.126,.005,-.038],[.15,-.063,-.04]];
const RADII=[.015,.018,.022,.025,.028];
const count=RADII.length;
const norm=v=>Math.hypot(...v);
const minus=(a,b)=>a.map((x,i)=>x-b[i]);
const plus=(a,b)=>a.map((x,i)=>x+b[i]);
const scaled=(a,s)=>a.map(x=>x*s);
const round=n=>Math.round(n*1e5)/1e5;
function alignUp(d){
 const l=norm(d);
 if(!Number.isFinite(l)||l<1e-6)throw Error('Direction de raccord nulle.');
 const [x,y,z]=d.map(a=>a/l);
 const q=y<-.999999?[1,0,0,0]:[z,0,-x,1+y];
 const ql=norm(q);return q.map(v=>v/ql);
}
function appendPalmBridge(args,generator){
 refinedPalm(args,generator);
 const {model,ids}=args;
 const nodes=model.nodes,wrist=ids.wrist;
 const palm=nodes.find(n=>n.name==='main_droite');
 if(!palm||!nodes[wrist]||norm(minus(palm.translation,PATH.at(-1)))>.001)
  throw Error('Matrice du poignet/paume inattendue.');
 for(let i=0;i<count;i++){
  const left=PATH[i],right=PATH[i+1],dir=minus(right,left);
  const node={name:'film_liaison_poignet_paume_'+i,
   translation:scaled(plus(left,right),.5),rotation:alignUp(dir),
   scale:[RADII[i],norm(dir)*.68,RADII[i]],mesh:0,
   extras:{materialIndex:palm.extras?.materialIndex??0}};
  const index=nodes.push(node)-1;
  (nodes[wrist].children??=[]).push(index);
 }
}
function supportRadius(shape,direction){
 const m=shape.matrix;
 return Math.hypot(...[0,4,8].map(j=>m[j]*direction[0]+m[j+1]*direction[1]+m[j+2]*direction[2]));
}
function seamGap(a,b){
 const delta=minus(b.center,a.center),distance=norm(delta);
 if(distance<1e-8)return 0;
 const direction=delta.map(x=>x/distance);
 return Math.max(0,distance-supportRadius(a,direction)-supportRadius(b,direction));
}
function auditBridge(glb,timeline,{sampleHz=12}={}){
 if(!Number.isInteger(sampleHz)||sampleHz<8||sampleHz>30)
  throw Error('Cadence de raccord non prise en charge.');
 if(!Array.isArray(timeline)||timeline.length<1||timeline.length>10)
  throw Error('Chronologie de raccord invalide.');
 const scene=readSyntheticGLB(glb),names=scene.doc.nodes.map(n=>n.name);
 const get=name=>{
  const id=names.indexOf(name);
  if(id<0||names.lastIndexOf(name)!==id)throw Error('Nœud de raccord manquant/dupliqué.');
  return id;
 };
 const bridge=Array.from({length:count},(_,i)=>get('film_liaison_poignet_paume_'+i));
 const cup=get('tasse_corps_table'),wrist=get('poignet_droite'),
  palm=get('main_droite'),forearm=get('avant_bras_droite');
 for(const id of bridge)if(!scene.doc.nodes[wrist].children?.includes(id)||
   scene.doc.nodes[id].mesh===undefined)throw Error('Raccord absent du poignet.');
 const drink=timeline.find(t=>t.intent==='boire'),place=timeline.find(t=>t.intent==='poser_objet');
 if(!drink)throw Error('Geste boire absent.');
 const start=drink.start+.98,end=place?place.start+.15:drink.end;
 if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||
  end>scene.clips[0].duration+.001)throw Error('Fenêtre de raccord invalide.');
 const n=Math.ceil((end-start)*sampleHz);
 if(n>3000)throw Error('Audit de raccord trop long.');
 let maxCup=0,maxSeamGap=0,minForearmOverlap=Infinity,minPalmOverlap=Infinity,poses=0;
 for(let i=0;i<=n;i++){
  const t=Math.min(end,start+i/sampleHz),pose=sampleSyntheticPose(scene,t);
  const cupShape=ellipsoid(pose.world[cup].matrix);
  const shapes=bridge.map(id=>ellipsoid(pose.world[id].matrix));
  const arm=ellipsoid(pose.world[forearm].matrix),hand=ellipsoid(pose.world[palm].matrix);
  const first=compareSampledEllipsoids(arm,shapes[0]);
  const last=compareSampledEllipsoids(shapes.at(-1),hand);
  minForearmOverlap=Math.min(minForearmOverlap,first.maxSampledPenetrationM);
  minPalmOverlap=Math.min(minPalmOverlap,last.maxSampledPenetrationM);
  for(let j=0;j<shapes.length;j++){
   maxCup=Math.max(maxCup,compareSampledEllipsoids(shapes[j],cupShape).maxSampledPenetrationM);
   if(j>0)maxSeamGap=Math.max(maxSeamGap,seamGap(shapes[j-1],shapes[j]));
  }
  poses++;
 }
 const report={schema:'retoucheproai.film-wrist-bridge-audit.v0.13',synthetic:true,
  physicallyConnected:false,exactMeshCollisionVerified:false,
  geometricSampled:true,method:'sampled ellipsoid overlap plus support function along centerlines',
  segments:count,poses,
  maxSampledCupPenetrationM:round(maxCup),
  maxProjectedSeamGapM:round(maxSeamGap),
  minSampledForearmBridgeOverlapM:round(minForearmOverlap),
  minSampledBridgePalmOverlapM:round(minPalmOverlap),
  thresholds:{cupPenetrationM:.004,seamGapM:.003,minEndOverlapM:.002}
 };
 if(maxCup>.004)throw Error('Raccord du poignet traverse la tasse.');
 if(maxSeamGap>.003||minForearmOverlap<.002||minPalmOverlap<.002)
  throw Error('Discontinuité poignet–paume détectée.');
 return report;
}
function buildSyntheticFilmSceneV13(request,generator){
 const out=buildSyntheticFilmSceneV12(request,generator,{
  decorateModel:args=>appendPalmBridge(args,generator)
 });
 if(out.status!=='apercu_partiel_glb_anime')return out;
 const bridgeAudit=auditBridge(out.glb,out.timeline);
 return {...out,schema:'retoucheproai.film-motion-preview.v0.13',bridgeAudit,
  warnings:[...out.warnings,
   'Cinq volumes orientés relient visuellement l’avant-bras et la paume, avec contrôle géométrique des jonctions et du dégagement de la tasse ; pas de biomécanique ni de collisions exactes.']
 };
}
export {PATH,RADII,alignUp,appendPalmBridge,auditBridge,buildSyntheticFilmSceneV13};
