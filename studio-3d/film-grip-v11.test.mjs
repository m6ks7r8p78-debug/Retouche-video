import test from 'node:test';
import assert from 'node:assert/strict';
import generator from './generateur.js';
import {buildSyntheticFilmSceneV11,auditHandleGrip,RING_SEGMENTS,gripStrength}
 from './film-grip-v11.mjs';
import {buildSyntheticFilmSceneV10} from './film-scene-v10.mjs';
import {readSyntheticGLB,sampleSyntheticPose} from './film-viewer-v03.mjs';
const female="Une femme brune s'assoit dans le salon, boit un café, pose sa tasse, puis parle.";
const male="Un homme brun s'assoit, boit du thé, pose sa tasse, puis parle.";

test('v0.11 : une anse ajourée de douze segments, une seule tasse',()=>{
 const out=buildSyntheticFilmSceneV11(female,generator);
 assert.equal(out.schema,'retoucheproai.film-motion-preview.v0.11');
 const scene=readSyntheticGLB(out.glb),names=scene.doc.nodes.map(x=>x.name);
 const ring=names.indexOf('tasse_anse_table');
 assert.equal(scene.doc.nodes[ring].mesh,undefined);
 assert.equal(scene.doc.nodes[ring].children.length,RING_SEGMENTS);
 assert.equal(names.filter(n=>n==='tasse_unique_mobile').length,1);
 for(let i=0;i<RING_SEGMENTS;i++)
  assert.equal(names.filter(n=>n==='film_anse_boucle_'+i).length,1);
 assert.equal(out.mediaUploaded,false);
 assert.equal(out.renderedFilm,false);
});
test('l’audit du GLB suit réellement les cinq doigts autour de la boucle',()=>{
 const out=buildSyntheticFilmSceneV11(female,generator);
 const a=out.handleAudit;
 assert.equal(a.schema,'retoucheproai.film-handle-grip-audit.v0.11');
 assert.equal(a.physicalContactVerified,false);
 assert.equal(a.realMeshCollisionVerified,false);
 assert.equal(a.forceOrFrictionSimulated,false);
 assert.equal(a.handleSegmentCount,12);
 assert.equal(a.fingers.length,5);
 assert.ok(a.poseSamples>50);
 assert.ok(a.nearHandleFraction>=.95);
 assert.ok(a.maxMeanFingertipHandleGapM<.03);
 assert.ok(a.deepestFingertipCenterInsideCupM<=.012);
 assert.ok(a.fingers.every(f=>f.meanGapM<.03));
 assert.equal(out.motionAudit.physicalContactVerified,false);
});
test('les positions des doigts sont recalculées, continues et réversibles',()=>{
 const out=buildSyntheticFilmSceneV11(female,generator);
 const scene=readSyntheticGLB(out.glb),names=scene.doc.nodes.map(x=>x.name);
 const drink=out.timeline.find(x=>x.intent==='boire');
 const place=out.timeline.find(x=>x.intent==='poser_objet');
 assert.equal(gripStrength(0,out.timeline),0);
 assert.ok(gripStrength(drink.start+.91,out.timeline)>.99);
 assert.equal(gripStrength(place.start+.56,out.timeline),0);
 for(const name of ['index','majeur','annulaire','auriculaire','pouce']){
  const id=names.indexOf('film_doigt_'+name+'_pivot');
  const translation=scene.clips[0].tracks.find(t=>t.node===id&&t.path==='translation');
  assert.ok(translation&&translation.times.length>100);
  assert.deepEqual(translation.values[0],translation.values.at(-1));
  let largest=0;
  for(let i=1;i<translation.values.length;i++)
   largest=Math.max(largest,Math.hypot(...translation.values[i].map((v,j)=>v-translation.values[i-1][j])));
  assert.ok(largest<.08,'Déplacement brutal de racine de doigt : '+name);
 }
 const pose=sampleSyntheticPose(scene,drink.start+1.2);
 assert.ok(pose.world[names.indexOf('film_anse_boucle_1')]);
});
test('homme synthétique : même prise segmentée sans utilisation de média privé',()=>{
 const out=buildSyntheticFilmSceneV11(male,generator);
 assert.equal(out.handleAudit.handleSegmentCount,12);
 assert.ok(out.handleAudit.nearHandleFraction>=.95);
 assert.equal(out.surfaceAudit.physicalGripVerified,false);
});
test('la modification v0.11 ne transforme pas rétroactivement les sorties v0.10',()=>{
 const old=buildSyntheticFilmSceneV10(female,generator);
 const scene=readSyntheticGLB(old.glb);
 const handle=scene.doc.nodes.find(n=>n.name==='tasse_anse_table');
 assert.ok(handle.mesh>=0);
 assert.equal(old.handleAudit,undefined);
 assert.equal(old.schema,'retoucheproai.film-motion-preview.v0.10');
});
test('un scénario non pris en charge ne produit pas d’animation ni d’audit factices',()=>{
 const out=buildSyntheticFilmSceneV11({prompt:female,references:[{kind:'photo',rightsConfirmed:true,likenessConsent:true}]},generator);
 assert.equal(out.status,'scenario_seulement');
 assert.equal(out.glb,null);
 assert.equal(out.handleAudit,undefined);
});
test('audit refuse la corruption d’une racine de doigt exportée',()=>{
 const out=buildSyntheticFilmSceneV11(female,generator);
 const bytes=out.glb.slice(),doc=readSyntheticGLB(bytes).doc;
 const id=doc.nodes.findIndex(n=>n.name==='film_doigt_index_pivot');
 const clip=doc.animations.find(x=>x.name==='film_scene_v03');
 const ch=clip.channels.find(x=>x.target.node===id&&x.target.path==='translation');
 assert.ok(ch);
 const acc=doc.accessors[clip.samplers[ch.sampler].output],view=doc.bufferViews[acc.bufferView];
 const dv=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 const at=20+dv.getUint32(12,true)+8+view.byteOffset+
  (acc.byteOffset||0)+Math.floor(acc.count/2)*12;
 dv.setFloat32(at,3,true);
 assert.throws(()=>auditHandleGrip(bytes,out.timeline),/Doigts trop éloignés/);
});
