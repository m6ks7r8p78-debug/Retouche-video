import test from 'node:test';
import assert from 'node:assert/strict';
import generator from './generateur.js';
import {FINGERS,pinchStrengthAt,auditCigaretteFingerGrip,
 buildSyntheticFilmSceneV18} from './film-handgrip-v18.mjs';
import {buildSyntheticFilmSceneV17} from './film-ik-v17.mjs';
import {readSyntheticGLB,sampleSyntheticPose} from './film-viewer-v03.mjs';
const female='Une femme adulte brune fume trois taffes de cigarette.';
const male='Un homme adulte fume deux taffes de cigarette de la main gauche.';
const cup="Une femme brune s'assoit dans le salon, boit un café, pose sa tasse, puis parle.";

test('les cinq doigts sont uniques, appartiennent au bon poignet et ont dix pistes',()=>{
 const out=buildSyntheticFilmSceneV18(female,generator),scene=readSyntheticGLB(out.glb);
 assert.equal(out.status,'apercu_partiel_glb_anime');
 assert.equal(out.schema,'retoucheproai.film-motion-preview.v0.18');
 const names=scene.doc.nodes.map(n=>n.name),wrist=names.indexOf('poignet_droite');
 for(const finger of FINGERS){
  const prefix='film_pince_'+finger.name+'_';
  const pivot=names.indexOf(prefix+'pivot'),hinge=names.indexOf(prefix+'articulation');
  assert.ok(pivot>=0&&hinge>=0);
  assert.ok(scene.doc.nodes[wrist].children.includes(pivot));
  assert.equal(names.filter(x=>x===prefix+'bout').length,1);
  assert.ok(scene.clips[0].tracks.some(t=>t.node===pivot&&t.path==='rotation'));
  assert.ok(scene.clips[0].tracks.some(t=>t.node===hinge&&t.path==='rotation'));
 }
 assert.equal(scene.doc.nodes.filter(n=>n.name==='cigarette_tige').length,1);
 assert.equal(out.gripAudit.fingerCount,5);
 assert.equal(out.gripAudit.hingedFingerChannels,10);
});
test('index et majeur sont opposés près de la tige pendant chacune des trois inhalations',()=>{
 const out=buildSyntheticFilmSceneV18(female,generator),a=out.gripAudit;
 assert.equal(a.episodesVerified,3);
 assert.equal(a.proximitySamples,18);
 assert.equal(a.grippingFingerCount,2);
 assert.ok(a.maximumRadialSurfaceGapM<.018);
 assert.ok(a.minimumRadialSurfaceGapM>-.018);
 assert.ok(a.minimumOpposingFingerDistanceM>.02);
 assert.ok(a.maximumAxialCenterOffsetM<.100);
 assert.equal(a.exactMeshContactVerified,false);
 assert.equal(a.physicalGripForceVerified,false);
 assert.equal(a.maxSampledPalmCigarettePenetrationM,0);
 assert.equal(a.palmCigaretteExactTriangleCollisionVerified,false);
 assert.equal(out.lipAudit.exactSurfaceContactVerified,false);
});
test('les phalanges suivent le poignet à différents instants du mouvement',()=>{
 const out=buildSyntheticFilmSceneV18(female,generator),scene=readSyntheticGLB(out.glb);
 const nodes=scene.doc.nodes,names=nodes.map(n=>n.name);
 const tip=names.indexOf('film_pince_index_bout'),wrist=names.indexOf('poignet_droite');
 const drink=out.timeline[0];
 let prev=null,changed=false;
 for(const t of [0,drink.start+1.1,drink.start+2.2,drink.end]){
  const pose=sampleSyntheticPose(scene,t,'film_actions_v16');
  const local=pose.world[tip].translation.map((v,k)=>v-pose.world[wrist].translation[k]);
  assert.ok(local.every(Number.isFinite));
  if(prev&&Math.hypot(...pose.world[tip].translation.map((v,k)=>v-prev[k]))>.01)
   changed=true;
  prev=pose.world[tip].translation;
 }
 assert.equal(changed,true);
});
test('les cinq doigts ont une amplitude douce, sans ouverture brusque',()=>{
 const out=buildSyntheticFilmSceneV18(female,generator),scene=readSyntheticGLB(out.glb);
 const fingers=scene.clips[0].tracks.filter(t=>scene.doc.nodes[t.node].name.startsWith('film_pince_'));
 assert.equal(fingers.length,10);
 for(const track of fingers){
  for(let i=1;i<track.values.length;i++){
   const a=track.values[i-1],b=track.values[i];
   const delta=Math.min(1,Math.abs(a.reduce((sum,v,j)=>sum+v*b[j],0)));
   assert.ok(2*Math.acos(delta)<.08);
  }
 }
});
test('un personnage masculin avec la main gauche conserve sa préhension',()=>{
 const out=buildSyntheticFilmSceneV18(male,generator),scene=readSyntheticGLB(out.glb);
 const names=scene.doc.nodes.map(n=>n.name),wrist=names.indexOf('poignet_gauche');
 assert.equal(out.gripAudit.smokingHand,'gauche');
 assert.equal(out.gripAudit.episodesVerified,2);
 assert.ok(scene.doc.nodes[wrist].children.some(i=>names[i]==='film_pince_index_pivot'));
 assert.ok(out.lipAudit.peakApproachGapM<=.022);
});
test('un geste de tasse conserve le moteur précédent et aucun doigt de cigarette',()=>{
 const out=buildSyntheticFilmSceneV18(cup,generator),scene=readSyntheticGLB(out.glb);
 assert.equal(out.schema,'retoucheproai.film-motion-preview.v0.15');
 assert.equal(out.gripAudit,undefined);
 assert.equal(scene.doc.nodes.some(n=>n.name.startsWith('film_pince_')),false);
});
test('le moteur v0.17 ne reçoit pas les nouveaux doigts par défaut',()=>{
 const out=buildSyntheticFilmSceneV17(female,generator),scene=readSyntheticGLB(out.glb);
 assert.equal(out.schema,'retoucheproai.film-motion-preview.v0.17');
 assert.equal(out.gripAudit,undefined);
 assert.equal(scene.doc.nodes.some(n=>n.name.startsWith('film_pince_')),false);
});
test('pas de modèle exporté à partir de références privées ou description négative',()=>{
 for(const input of [
  {prompt:female,references:[{kind:'video',rightsConfirmed:true,likenessConsent:true}]},
  'Une femme tient une cigarette sans fumer.'
 ]){
  const out=buildSyntheticFilmSceneV18(input,generator);
  assert.equal(out.status,'scenario_seulement');
  assert.equal(out.glb,null);
  assert.equal(out.gripAudit,undefined);
 }
});
test('une pince incohérente dans le GLB exporté est détectée',()=>{
 const out=buildSyntheticFilmSceneV18(female,generator),bytes=out.glb.slice();
 const dv=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),
  size=dv.getUint32(12,true),raw=new TextDecoder().decode(bytes.subarray(20,20+size));
 const find='"name":"film_pince_index_pivot","translation":[-0.008,';
 const replace='"name":"film_pince_index_pivot","translation":[-9.008,';
 assert.ok(raw.includes(find));
 assert.equal(find.length,replace.length);
 bytes.set(new TextEncoder().encode(raw.replace(find,replace)),20);
 assert.throws(()=>auditCigaretteFingerGrip(bytes,out.timeline),/hors tolérance radiale/);
});
test('le retour à l’ancienne paume englobante est détecté sur le GLB final',()=>{
 const out=buildSyntheticFilmSceneV18(female,generator),bytes=out.glb.slice();
 const dv=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),
  size=dv.getUint32(12,true),raw=new TextDecoder().decode(bytes.subarray(20,20+size));
 const good='"name":"main_droite","translation":[-0.035,-0.055,-0.01]';
 const broken='"name":"main_droite","translation":[0.0035,-0.055,0.053]';
 assert.equal(good.length,broken.length);
 assert.ok(raw.includes(good));
 bytes.set(new TextEncoder().encode(raw.replace(good,broken)),20);
 assert.throws(()=>auditCigaretteFingerGrip(bytes,out.timeline),/paume traverse/);
});

test('la séquence de pince reste bornée et refuse les échantillons invalides',()=>{
 const out=buildSyntheticFilmSceneV18(female,generator);
 const episode=out.timeline;
 assert.ok(pinchStrengthAt(episode[0].start+2.4,episode)>
  pinchStrengthAt(episode[0].start,episode));
 assert.throws(()=>pinchStrengthAt(NaN,episode),/Cadence/);
 assert.throws(()=>auditCigaretteFingerGrip(out.glb,episode,{sampleHz:180}),/Cadence/);
});
