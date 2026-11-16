/** Film Studio v0.16 — premier exécuteur d'actions répétables.
 * Une cigarette synthétique, 1–5 cycles réels dans UN clip GLB, sans médias
 * privés. Ce pilote ne résout pas le contact lèvres/cigarette ou la fumée 3D.
 */
import {compileActionPlanV16} from './film-action-plan-v16.mjs';
import {buildSyntheticFilmSceneV15} from './film-morph-v15.mjs';
import {readSyntheticGLB,sampleSyntheticPose} from './film-viewer-v03.mjs';

const round=n=>Math.round(n*10000)/10000;
const distance=(a,b)=>Math.hypot(...a.map((n,i)=>n-b[i]));
const ACTION_SECONDS=4.8,GAP_SECONDS=.35,PREROLL=.2;

function compileRepeatedClip(model,plan){
 const source=model.animations.find(c=>c.name==='fumer');
 if(!source||!source.channels.length||source.duration<1)
  throw Error('Clip élémentaire de cigarette absent.');
 if(!plan.eligible||plan.repetitionCount<1||plan.repetitionCount>5)
  throw Error('Plan d’actions répétées non exécutable.');
 const speed=ACTION_SECONDS/source.duration;
 const timeline=plan.episodes.map((e,index)=>{
  const start=round(PREROLL+index*(ACTION_SECONDS+GAP_SECONDS));
  const end=round(start+ACTION_SECONDS);
  return {...e,start,end,durationSeconds:ACTION_SECONDS,
   phases:[
    {name:'approcher_cigarette',time:round(start+.15*ACTION_SECONDS)},
    {name:'inspirer',time:round(start+.38*ACTION_SECONDS)},
    {name:'expirer_fumee',time:round(start+.68*ACTION_SECONDS)},
    {name:'reposer_main',time:end}
   ]
  };
 });
 const tracks=source.channels.map(track=>{
  const times=[0],values=[track.values[0].slice()];
  const put=(t,v)=>{
   const rounded=round(t),last=times.at(-1);
   if(rounded<last-1e-5)throw Error('Clés de geste non chronologiques.');
   if(Math.abs(rounded-last)<1e-5){values[values.length-1]=v.slice();return;}
   times.push(rounded);values.push(v.slice());
  };
  for(const episode of timeline){
   put(episode.start,track.values[0]);
   for(let i=1;i<track.times.length;i++)
    put(episode.start+track.times[i]*speed,track.values[i]);
   put(episode.end,track.values.at(-1));
   if(episode.order!==timeline.length)put(episode.end+GAP_SECONDS,track.values[0]);
  }
  return {node:track.node,path:track.path,times,values};
 });
 const duration=timeline.at(-1).end;
 model.animations=[{
  name:'film_actions_v16',label:'Gestes répétés programmés localement (non réalistes)',
  duration,channels:tracks
 }];
 model.timeline=timeline;
 return {timeline,duration};
}

function auditRepeatedSmoking(glb,timeline){
 const scene=readSyntheticGLB(glb),names=scene.doc.nodes.map(n=>n.name);
 const one=name=>{
  const id=names.indexOf(name);
  if(id<0||names.lastIndexOf(name)!==id)
   throw Error('Objet synthétique manquant ou dupliqué : '+name);
  return id;
 };
 const cigarette=one('cigarette_tige'),tip=one('cigarette_braise'),
  mouth=one('bouche_pivot'),wrist=one('poignet_droite'),
  smoke=one('fumee_volute_1');
 if(!Array.isArray(timeline)||timeline.length<1||timeline.length>5)
  throw Error('Cycle de cigarette absent.');
 const findings=[];
 for(const episode of timeline){
  const start=sampleSyntheticPose(scene,episode.start,'film_actions_v16');
  const inhale=sampleSyntheticPose(scene,episode.start+ACTION_SECONDS*.45,'film_actions_v16');
  const exhale=sampleSyntheticPose(scene,episode.start+ACTION_SECONDS*.77,'film_actions_v16');
  const end=sampleSyntheticPose(scene,episode.end,'film_actions_v16');
  const motion=distance(start.world[wrist].translation,inhale.world[wrist].translation);
  const returnDistance=distance(start.world[wrist].translation,end.world[wrist].translation);
  const smokeStart=start.world[smoke].scale[0],smokePeak=exhale.world[smoke].scale[0],
   smokeEnd=end.world[smoke].scale[0];
  const lipDistance=distance(inhale.world[tip].translation,inhale.world[mouth].translation);
  const lipsBefore=start.world[mouth].scale[1],lipsOpen=inhale.world[mouth].scale[1];
  if(motion<.04||returnDistance>.004||smokePeak<.025||
     smokeStart>.003||smokeEnd>.003||lipsOpen<=lipsBefore*1.15)
    throw Error('Inspiration, fumée ou retour main non conformes au cycle '+episode.order);
  findings.push({
   order:episode.order,start:episode.start,end:episode.end,
   wristTravelM:round(motion),wristReturnGapM:round(returnDistance),
   smokePeakScale:round(smokePeak),
   mouthToCigaretteTipDistanceM:round(lipDistance),
   physicalLipContactVerified:false,
   threeDimensionalSmokeDynamicsVerified:false
  });
 }
 return {
  schema:'retoucheproai.film-repeated-action-audit.v0.16',
  synthetic:true,sourceGlb:true,episodesVerified:findings.length,
  cigaretteCount:1,lipContactVerified:false,combustionSimulation:false,
  smokeSimulation:'sphères translucides dont l’échelle change',
  fullyNaturalMovementVerified:false,findings
 };
}

function buildSyntheticFilmSceneV16(request,generator){
 const plan=compileActionPlanV16(request);
 const wantsSmoke=plan.project.scenes.some(s=>s.steps.some(st=>st.intent==='fumer'));
 if(!wantsSmoke)return buildSyntheticFilmSceneV15(request,generator);
 const blocked=reason=>({
  schema:'retoucheproai.film-motion-preview.v0.16',status:'scenario_seulement',
  reason,project:plan.project,glb:null,renderedFilm:false,mediaUploaded:false
 });
 if(!plan.eligible)return blocked(plan.refusalReason);
 if(!generator||typeof generator.parsePrompt!=='function'||
    typeof generator.build!=='function'||typeof generator.encodeGLB!=='function')
  throw TypeError('Générateur de personnages synthétiques indisponible.');
 const config=generator.parsePrompt(plan.project.originalPrompt);
 if(config.smoke===false||config.tobacco==='pipe'||config.tobacco==='cigare')
  return blocked('Le pilote répété accepte seulement une cigarette et une description affirmative.');
 config.smoke=true;config.tobacco='cigarette';config.actions=['pose'];
 const model=generator.build(config);
 const {timeline,duration}=compileRepeatedClip(model,plan);
 const glb=generator.encodeGLB(model).bytes;
 const actionAudit=auditRepeatedSmoking(glb,timeline);
 return {
  schema:'retoucheproai.film-motion-preview.v0.16',
  status:'apercu_partiel_glb_anime',project:plan.project,
  glb,timeline,duration,synthetic:true,photorealistic:false,
  renderedFilm:false,containsAudio:false,mediaUploaded:false,
  actionPlan:plan,actionAudit,
  animatedActions:timeline.map(x=>'fumer'),
  unanimatedActions:[],sceneObjects:['personnage','cigarette','fumee_synthetique'],
  warnings:[
   'Une cigarette unique et des gestes répétés dans un GLB entièrement synthétique.',
   'Les fumées sont des sphères animées, et non des fluides ou de la combustion simulée.',
   'La distance entre les lèvres et la cigarette est seulement mesurée : contact non garanti.',
   'Pas de mouvements humains appris, de visage réaliste ni de synchronisation respiratoire.',
   'Aucun export MP4 natif, aucune personne réelle reproduite, aucun média transféré.'
  ]
 };
}
export {ACTION_SECONDS,GAP_SECONDS,PREROLL,compileRepeatedClip,auditRepeatedSmoking,buildSyntheticFilmSceneV16};
