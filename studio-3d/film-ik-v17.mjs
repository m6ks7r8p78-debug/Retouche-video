/** Film Studio v0.17 — retargeting cinématique réutilisable vers des cibles spatiales.
 * Un solveur d'épaule (orientation 3D) et de coude (charnière planaire)
 * positionne le FILTRE d'une cigarette à proximité d'une cible liée aux lèvres.
 * Ni collision volumique, ni pression, ni animation humaine apprise.
 */
import {buildSyntheticFilmSceneV16,ACTION_SECONDS} from './film-actions-v16.mjs';
import {readSyntheticGLB,sampleSyntheticPose} from './film-viewer-v03.mjs';

const round=x=>Math.round(x*100000)/100000;
const norm=v=>Math.hypot(...v);
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const dist=(a,b)=>norm(sub(a,b));
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
const qz=a=>[0,0,Math.sin(a/2),Math.cos(a/2)];
const signedZ=q=>2*Math.atan2(q[2],q[3]);
const yawZ=(yaw,angle)=>{
 const sy=Math.sin(yaw/2),cy=Math.cos(yaw/2);
 const sz=Math.sin(angle/2),cz=Math.cos(angle/2);
 return [sy*sz,sy*cz,cy*sz,cy*cz];
};
const two=(a,b)=>Math.hypot(a,b);

function solveSpatialHandTarget({shoulder,target,upperLength,lowerOffset,tipLocal,
 wristAngle,handSide='droite',referenceAngles=[0,0]}){
 const values=[...shoulder,...target,upperLength,...lowerOffset,...tipLocal,wristAngle,...referenceAngles];
 if(values.some(x=>!Number.isFinite(x))||shoulder.length!==3||target.length!==3||
   lowerOffset.length!==3||tipLocal.length!==3||upperLength<=.05||upperLength>1||
   !['droite','gauche'].includes(handSide))
  throw Error('Paramètres cinématiques invalides.');
 if(Math.abs(lowerOffset[0])>.0001||Math.abs(lowerOffset[2])>.0001||
   Math.abs(tipLocal[2])>.15)
  throw Error('Ce solveur nécessite un coude planaire et un objet proche de la main.');
 // La charnière de poignet tourne dans le plan x-y, sans modifier le z local.
 const cs=Math.cos(wristAngle),sn=Math.sin(wristAngle);
 const tipX=tipLocal[0]*cs-tipLocal[1]*sn;
 const tipY=tipLocal[0]*sn+tipLocal[1]*cs;
 const second=[lowerOffset[0]+tipX,lowerOffset[1]+tipY];
 const lowerLength=two(...second);
 const d=sub(target,shoulder),r=two(d[0],d[2]);
 const dzLocal=lowerOffset[2]+tipLocal[2];
 if(r<=Math.abs(dzLocal)+.00001)
  throw Error('Cible trop proche de l’axe de profondeur pour ce rig.');
 const sideways=Math.sqrt(r*r-dzLocal*dzLocal);
 const xLocal=(handSide==='droite'?-1:1)*sideways;
 const yaw=Math.atan2(dzLocal*d[0]-xLocal*d[2],xLocal*d[0]+dzLocal*d[2]);
 const reach=two(xLocal,d[1]),minimum=Math.abs(upperLength-lowerLength),maximum=upperLength+lowerLength;
 if(reach<minimum+.00001||reach>maximum-.00001)
  throw Error('Cible hors de portée du bras rigide (pas d’étirement).');
 const cosine=clamp((reach*reach+upperLength*upperLength-lowerLength*lowerLength)/
                     (2*reach*upperLength),-1,1);
 const base=Math.atan2(d[1],xLocal),offset=Math.acos(cosine);
 const possibilities=[-1,1].map(sign=>{
  const angle=base+sign*offset,
   ex=upperLength*Math.cos(angle),ey=upperLength*Math.sin(angle);
  const shoulderZ=wrap(Math.atan2(ex,-ey));
  const elbowZ=wrap(Math.atan2(d[1]-ey,xLocal-ex)-Math.atan2(second[1],second[0])-shoulderZ);
  const delta=wrap(shoulderZ-referenceAngles[0])**2+
              wrap(elbowZ-referenceAngles[1])**2;
  return {shoulderZ,elbowZ,cost:delta};
 });
 possibilities.sort((a,b)=>a.cost-b.cost);
 const best=possibilities[0];
 return {
  shoulderQuaternion:yawZ(yaw,best.shoulderZ),
  elbowQuaternion:qz(best.elbowZ),
  shoulderYaw:round(yaw),shoulderBend:round(best.shoulderZ),
  elbowBend:round(best.elbowZ),
  geometricReachM:round(reach),armReachMinM:round(minimum),armReachMaxM:round(maximum),
  target:target.slice(),analyticResidualM:0,
  approachType:'targeted_articulated_3d_not_physical_contact'
 };
}

function retargetCigaretteToLips({model,timeline,generator}){
 const nodes=model.nodes,unique=name=>{
  const i=nodes.findIndex(x=>x.name===name);
  if(i<0||nodes.findLastIndex(x=>x.name===name)!==i)
   throw Error('Point du rig absent ou ambigu : '+name);
  return i;
 };
 const side=model.config.smokeHand;
 const shoulder=unique('epaule_'+side),elbow=unique('coude_'+side),
  wrist=unique('poignet_'+side),mouth=unique('bouche_pivot'),
  rod=unique('cigarette_tige');
 if(!nodes[wrist].children?.includes(rod))
  throw Error('La cigarette doit être rattachée au poignet avant retargeting.');
 // Le filtre est près de l'extrémité supérieure du cylindre (vers la main).
 // La braise demeure à l'autre extrémité, à l'écart de la bouche.
 const filter=nodes.push({
  name:'film_cigarette_filtre_contact',translation:[.02,-.03,.053]
 })-1;
 (nodes[wrist].children??=[]).push(filter);
 const lips=nodes.push({
  name:'film_bouche_cible',translation:[0,0,.014]
 })-1;
 (nodes[mouth].children??=[]).push(lips);
 const tracks=model.animations[0].channels,track=(node)=>{
  const x=tracks.find(t=>t.node===node&&t.path==='rotation');
  if(!x)throw Error('Piste cinématique absente du nœud '+node);
  return x;
 };
 const sh=track(shoulder),el=track(elbow),wr=track(wrist);
 // Prévisualisation depuis les matrices GLB exactes avant correction.
 const preview=readSyntheticGLB(generator.encodeGLB(model).bytes);
 const facts=[];
 for(const episode of timeline){
  for(const fraction of [.38,.58]){
   const t=Math.round((episode.start+fraction*ACTION_SECONDS)*10000)/10000;
   const i=sh.times.findIndex(a=>Math.abs(a-t)<.00006);
   const j=el.times.findIndex(a=>Math.abs(a-t)<.00006);
   const w=wr.times.findIndex(a=>Math.abs(a-t)<.00006);
   if(i<0||j<0||w<0)throw Error('Clés exactes de la phase d’inhalation manquantes.');
   const pose=sampleSyntheticPose(preview,t,'film_actions_v16');
   const target=pose.world[lips].translation;
   const origin=pose.world[shoulder].translation;
   const result=solveSpatialHandTarget({
    shoulder:origin,target,
    upperLength:Math.abs(nodes[elbow].translation[1]),
    lowerOffset:nodes[wrist].translation,
    tipLocal:nodes[filter].translation,
    wristAngle:signedZ(wr.values[w]),
    handSide:side,
    referenceAngles:[signedZ(sh.values[i]),signedZ(el.values[j])]
   });
   sh.values[i]=result.shoulderQuaternion.slice();
   el.values[j]=result.elbowQuaternion.slice();
   facts.push({episode:episode.order,t,reachM:result.geometricReachM,
    shoulderYaw:result.shoulderYaw,handSide:side});
  }
 }
 return facts;
}

function auditCigaretteLipApproach(glb,timeline,{sampleHz=30}={}){
 if(!Number.isInteger(sampleHz)||sampleHz<15||sampleHz>60)
  throw Error('Cadence de contrôle de la main invalide.');
 if(!Array.isArray(timeline)||!timeline.length||timeline.length>5)
  throw Error('Chronologie de contact absente.');
 const scene=readSyntheticGLB(glb),names=scene.doc.nodes.map(x=>x.name);
 const id=name=>{
  const i=names.indexOf(name);
  if(i<0||names.lastIndexOf(name)!==i)throw Error('Point de contact absent : '+name);
  return i;
 };
 const filter=id('film_cigarette_filtre_contact'),lips=id('film_bouche_cible');
 const wrist=scene.doc.nodes.findIndex(x=>x.children?.includes(filter));
 if(wrist<0||!['poignet_droite','poignet_gauche'].includes(names[wrist]))
  throw Error('Le point filtre n’est pas rattaché à un poignet valide.');
 let peakApproachM=0,peakSpeedMps=0,checked=0;
 const measurements=[];
 for(const episode of timeline){
  const samples=[];
  for(const fraction of [.38,.48,.58]){
   const t=episode.start+ACTION_SECONDS*fraction;
   const pose=sampleSyntheticPose(scene,t,'film_actions_v16');
   const gap=dist(pose.world[filter].translation,pose.world[lips].translation);
   samples.push({phase:fraction,lipFilterGapM:round(gap)});
   peakApproachM=Math.max(peakApproachM,gap);checked++;
  }
  let previous=null;
  const start=episode.start,end=episode.end;
  for(let i=0;i<=Math.ceil((end-start)*sampleHz);i++){
   const t=Math.min(end,start+i/sampleHz),pose=sampleSyntheticPose(scene,t,'film_actions_v16');
   const xyz=pose.world[wrist].translation;
   if(previous){
    const dt=t-previous.time;
    if(dt>1e-6)peakSpeedMps=Math.max(peakSpeedMps,dist(xyz,previous.xyz)/dt);
   }
   previous={time:t,xyz};
  }
  measurements.push({episode:episode.order,samples});
 }
 const report={
  schema:'retoucheproai.film-lip-approach-audit.v0.17',
  animated3D:true,geometricLipContactTarget:true,exactSurfaceContactVerified:false,
  fluidOrCombustionPhysicsVerified:false,skinCollisionVerified:false,
  sampleCount:checked,peakApproachGapM:round(peakApproachM),
  peakWristSpeedMps:round(peakSpeedMps),
  samplesPerSecond:sampleHz,
  episodes:measurements,
  limits:{lipGapM:.022,wristSpeedMps:5}
 };
 if(peakApproachM>.022)throw Error('Le filtre manque les lèvres : distance >22 mm.');
 if(peakSpeedMps>5)throw Error('Déplacement du poignet trop rapide pour une animation continue.');
 return report;
}

function buildSyntheticFilmSceneV17(request,generator,{decorateModel}={}){
 const details=[];
 const result=buildSyntheticFilmSceneV16(request,generator,{
  decorateModel:args=>{
   details.push(...retargetCigaretteToLips(args));
   if(decorateModel!==undefined){
    if(typeof decorateModel!=='function')throw TypeError('Décorateur de préhension non valide.');
    decorateModel(args);
   }
  }
 });
 if(result.schema!=='retoucheproai.film-motion-preview.v0.16'||
    result.status!=='apercu_partiel_glb_anime')return result;
 const lipAudit=auditCigaretteLipApproach(result.glb,result.timeline);
 return {...result,schema:'retoucheproai.film-motion-preview.v0.17',
  lipAudit,retargeting:details,
  warnings:[...result.warnings.filter(x=>!x.includes('distance entre les lèvres')),
   'Le filtre est guidé vers une cible liée à la bouche ; il ne s’agit ni d’une pression réelle ni d’un contact physique certifié.']
 };
}
export {solveSpatialHandTarget,retargetCigaretteToLips,auditCigaretteLipApproach,
 buildSyntheticFilmSceneV17};
