/** Film Studio v0.3 - une seule tasse, contact suivi par point d'ancrage.
 * Contrat géométrique et IK planaire analytique sur le bras droit stylisé.
 * Pas de simulation physique : collision, poids, doigts et lèvres non modélisés.
 */
import {buildSyntheticFilmSequence} from './film-sequence-v02.mjs';
import {readSyntheticGLB,sampleSyntheticPose} from './film-viewer-v03.mjs';
const CUP=[.312,.8,.54];
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const norm=(a,b)=>Math.hypot(...a.map((x,i)=>x-b[i]));
const rad=q=>2*Math.atan2(q[0],q[3]);
const quat=a=>[Math.sin(a/2),0,0,Math.cos(a/2)];
const round=t=>Math.round(t*10000)/10000;
function reachCup(scaleY,desired=CUP){
 const shoulderY=1.51;
 const downward=shoulderY-desired[1]/scaleY;
 const forward=desired[2];
 const upper=.41,lower=Math.hypot(.51,.065);
 const distance=Math.hypot(downward,forward);
 if(distance<Math.abs(upper-lower)+1e-5||distance>upper+lower-1e-5)
   throw Error('Tasse hors de portée du bras stylisé.');
 const cos=clamp((distance*distance+upper*upper-lower*lower)/(2*distance*upper),-1,1);
 const direction=Math.atan2(forward,downward)-Math.acos(cos);
 const u=downward-upper*Math.cos(direction);
 const v=forward-upper*Math.sin(direction);
 const second=Math.atan2(v,u);
 const shoulder=-direction;
 const elbow=Math.atan2(.065,.51)-second-shoulder;
 return {shoulder,elbow};
}
function buildSyntheticFilmSceneV03(request,generator){
 const output=buildSyntheticFilmSequence(request,generator);
 if(output.status!=='apercu_partiel_glb_anime')return output;
 const {internalModel:model}=output;
 if(!model||model.animations?.length!==1)throw Error('Rig 3D intermédiaire absent.');
 const idx=name=>{
   const n=model.nodes.findIndex(x=>x.name===name);
   if(n<0)throw Error('Articulation manquante: '+name);
   return n;
 };
 const actor=idx('film_acteur_pivot'),sh=idx('epaule_droite'),el=idx('coude_droite');
 const cupTarget=[model.nodes[sh].translation[0]+.02,.8,.54];
 const onTable=idx('tasse_sur_table_groupe'),onHand=idx('tasse_en_main_groupe');
 const channels=model.animations[0].channels;
 const tr=(node,path)=>channels.find(x=>x.node===node&&x.path===path);
 const shoulderTrack=tr(sh,'rotation'),elbowTrack=tr(el,'rotation'),
       actorTrack=tr(actor,'scale'),handTrack=tr(onHand,'scale'),tableTrack=tr(onTable,'scale');
 if([shoulderTrack,elbowTrack,actorTrack,handTrack,tableTrack].some(x=>!x))
   throw Error('Pistes animées de l’acteur ou de la tasse absentes.');
 const times=handTrack.times;
 const same=channels.every(track=>track.times.length===times.length&&
   track.times.every((t,i)=>Math.abs(t-times[i])<.00001));
 if(!same)throw Error('Horodatages non unifiés dans le rig v0.2.');

 // Ramener la tasse en portée pour le bras synthétique, sans déformer l'avant-bras.
 model.nodes[onTable].translation=cupTarget.slice();
 model.nodes[idx('table_plateau')].translation=[cupTarget[0]+.058,.66,.54];
 model.nodes[idx('table_pied')].translation=[cupTarget[0]+.058,.32,.54];

 const IKtimes=[];
 for(const action of output.timeline){
   if(action.intent==='boire'){
     IKtimes.push(round(action.start+.40),round(action.start+.89),round(action.start+.90));
   }
   if(action.intent==='poser_objet'){
     IKtimes.push(round(action.start+.35),round(action.start+.54),round(action.start+.55));
   }
 }
 for(let i=0;i<times.length;i++){
   if(!IKtimes.some(t=>Math.abs(times[i]-t)<.00001))continue;
   const sit=actorTrack.values[i][1];
   const solution=reachCup(sit,cupTarget);
   shoulderTrack.values[i]=quat(solution.shoulder);
   elbowTrack.values[i]=quat(solution.elbow);
 }
 // Conserver un seul objet animé, plutôt que deux copies alternativement visibles.
 const cup={
   name:'tasse_unique_mobile',translation:cupTarget.slice(),scale:[1,1,1],
   children:[...(model.nodes[onTable].children||[])]
 };
 const cupId=model.nodes.push(cup)-1;
 model.nodes[0].children.push(cupId);
 model.nodes[onTable].children=[];
 model.nodes[onHand].children=[];
 // Géométrie du point de prise : épaule + bras + avant-bras + ancrage.
 // Échantillonnage dense de la trajectoire : éviter l’écart entre
 // l’interpolation des articulations et une translation en ligne droite.
 const sampleTrack=(track,t)=>{
   let i=0;while(i<track.times.length-2&&track.times[i+1]<t)i++;
   const a=track.times[i],b=track.times[i+1]??a;
   const mix=b===a?0:clamp((t-a)/(b-a),0,1);
   const v=track.values[i].map((x,k)=>x+((track.values[i+1]?.[k]??x)-x)*mix);
   if(track.path==='rotation'){const n=Math.hypot(...v)||1;return v.map(x=>x/n);}
   return v;
 };
 const wristAt=t=>{
   const sit=sampleTrack(actorTrack,t)[1];
   const a=rad(sampleTrack(shoulderTrack,t));
   const b=rad(sampleTrack(elbowTrack,t)),sum=a+b;
   return [
     cupTarget[0],
     sit*(1.51-.41*Math.cos(a)-.51*Math.cos(sum)-.065*Math.sin(sum)),
     -.41*Math.sin(a)-.51*Math.sin(sum)+.065*Math.cos(sum)
   ];
 };
 const duration=output.duration;
 const extra=Array.from({length:Math.ceil(duration/.025)},(_,i)=>round(Math.min(duration,(i+1)*.025)));
 const fineTimes=[...new Set([...times,...extra])].sort((a,b)=>a-b);
 const positions=fineTimes.map(t=>sampleTrack(handTrack,t)[0]>.5?wristAt(t):cupTarget.slice());
 channels.push({node:cupId,path:'translation',times:fineTimes,values:positions});
 handTrack.values=times.map(()=>[.0001,.0001,.0001]);
 tableTrack.values=times.map(()=>[.0001,.0001,.0001]);
 model.animations[0].name='film_scene_v03';
 model.animations[0].label='Tasse unique pilotée par le point de prise, bouche muette';
 const glb=generator.encodeGLB(model).bytes;
 const scene=readSyntheticGLB(glb);
 const held=[];
 let from=null;
 for(const item of output.timeline){
   if(item.intent==='boire'&&from===null)from=round(item.start+.90);
   if(item.intent==='poser_objet'&&from!==null){
     held.push([from,round(item.start+.55)]);from=null;
   }
 }
 if(from!==null)held.push([from,output.duration]);
 const metrics=[];
 for(const [begin,end] of held){
  for(let t=begin;t<=end+1e-5;t+=.05){
    const sample=sampleSyntheticPose(scene,Math.min(t,end));
    const hand=sample.world[onHand]?.translation,cup=sample.world[cupId]?.translation;
    if(!hand||!cup)throw Error('Point de prise de la tasse indisponible.');
    metrics.push(norm(hand,cup));
  }
  const sample=sampleSyntheticPose(scene,end);
  metrics.push(norm(sample.world[onHand].translation,sample.world[cupId].translation));
 }
 const maxAnchorGap=metrics.length?Math.max(...metrics):null;
 if(maxAnchorGap!==null&&(!Number.isFinite(maxAnchorGap)||maxAnchorGap>.025))
  throw Error('Écart main-tasse supérieur à 25 mm : export refusé pour ce pilote.');
 const warnings=output.warnings.filter(s=>!s.includes('Prise et dépôt de tasse simulés'));
 warnings.push('La tasse unique suit un point d’ancrage calculé et non les doigts. Contacts de surface/collisions non prouvés.');
 if(maxAnchorGap!==null)warnings.push('Écart maximum calculé centre d’ancrage–tasse : '+Math.round(maxAnchorGap*1000)+' mm (échantillonnage 20 Hz).');
 return {
   ...output,internalModel:undefined,glb,
   schema:'retoucheproai.film-motion-preview.v0.3',
   status:'apercu_partiel_glb_anime',
   contactAudit:{kind:'ancrage_geométrique_non_physique',sampleCount:metrics.length,
     maxGapMeters:maxAnchorGap,thresholdMeters:.025,actualCollisionVerified:false},
   warnings
 };
}
export {reachCup,buildSyntheticFilmSceneV03};