import test from 'node:test';
import assert from 'node:assert/strict';
import generator from './generateur.js';
import { buildSyntheticFilmSequence } from './film-sequence-v02.mjs';

const prompt = "Une femme brune s'assoit dans le salon, boit un café, pose sa tasse, puis parle.";
function readGLB(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  assert.equal(String.fromCharCode(...bytes.slice(0, 4)), 'glTF');
  assert.equal(dv.getUint32(4, true), 2);
  assert.equal(dv.getUint32(8, true), bytes.length);
  assert.equal(String.fromCharCode(...bytes.slice(16, 20)), 'JSON');
  const length = dv.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(bytes.slice(20, 20 + length)));
  const binaryHeader = 20 + length;
  assert.equal(String.fromCharCode(...bytes.slice(binaryHeader + 4, binaryHeader + 8)), 'BIN\0');
  assert.equal(json.buffers[0].byteLength, dv.getUint32(binaryHeader, true));
  return json;
}
test('génère un vrai GLB avec une animation complète et les objets persistants', () => {
  const result = buildSyntheticFilmSequence(prompt, generator);
  assert.equal(result.status, 'apercu_partiel_glb_anime');
  assert.equal(result.renderedFilm, false);
  assert.equal(result.photorealistic, false);
  assert.equal(result.containsAudio, false);
  assert.equal(result.mediaUploaded, false);
  assert.deepEqual(result.animatedActions, ['s_asseoir', 'boire', 'poser_objet', 'parler']);
  const gltf = readGLB(result.glb);
  assert.equal(gltf.animations.length, 1);
  assert.equal(gltf.animations[0].name, 'film_scene_v02');
  assert.ok(gltf.animations[0].channels.length >= 10);
  for (const name of ['film_acteur_pivot', 'chaise_assise', 'table_plateau', 'tasse_sur_table_groupe', 'tasse_en_main_groupe']) {
    assert.ok(gltf.nodes.some(n => n.name === name), name);
  }
  assert.deepEqual(gltf.extras.timeline.map(t => t.intent), result.animatedActions);
});
test('vérifie l’ordre des images-clés et les sorties définies', () => {
  const { glb, duration, timeline } = buildSyntheticFilmSequence(prompt, generator);
  const doc = readGLB(glb);
  const binOffset = 20 + new DataView(glb.buffer).getUint32(12, true) + 8;
  for (const sampler of doc.animations[0].samplers) {
    const input = doc.accessors[sampler.input];
    const view = doc.bufferViews[input.bufferView];
    const start = binOffset + (view.byteOffset || 0);
    const times = new Float32Array(input.count);
    for (let k = 0; k < input.count; k++) {
      times[k] = new DataView(glb.buffer, glb.byteOffset + start + k * 4, 4).getFloat32(0, true);
    }
    assert.ok(times.length > 4);
    for (let k = 1; k < times.length; k++) assert.ok(times[k] > times[k - 1], 'PTS croissants');
    assert.ok(times[times.length - 1] <= duration + .0001);
  }
  assert.ok(timeline.every((entry, i) => entry.end > entry.start &&
    (i === 0 || entry.start > timeline[i - 1].end)));
});
test('ne présente jamais un GLB stylisé comme un film réel', () => {
  const r = buildSyntheticFilmSequence(prompt, generator);
  assert.ok(r.warnings.some(s => s.includes('contacts main-objet non vérifiés')));
  assert.ok(r.warnings.some(s => s.includes('aucun MP4')));
  assert.ok(r.warnings.some(s => s.includes('aucune voix')));
});
test('une référence de personne autorisée ne devient pas un avatar sans reconstruction', () => {
  const r = buildSyntheticFilmSequence({
    prompt,
    references: [{kind:'photo', rightsConfirmed:true, likenessConsent:true}]
  }, generator);
  assert.equal(r.status, 'scenario_seulement');
  assert.equal(r.glb, null);
  assert.equal(r.mediaUploaded, false);
});
test('une scène multi-personnages n’est pas présentée comme prête', () => {
  const r = buildSyntheticFilmSequence('Une femme boit un café puis un homme entre et parle.', generator);
  assert.equal(r.status, 'scenario_seulement');
});
test('refuse de fabriquer une tasse non décrite', () => {
  const r = buildSyntheticFilmSequence('Une femme boit puis parle.', generator);
  assert.equal(r.status, 'scenario_seulement');
  assert.match(r.reason, /tasse ou une boisson/);
});
test('refuse de poser la tasse avant de boire', () => {
  const r = buildSyntheticFilmSequence('Une femme pose une tasse puis boit un café.', generator);
  assert.equal(r.status, 'scenario_seulement');
  assert.match(r.reason, /doit suivre/);
});
test('refuse les scénarios dont tous les gestes sont inconnus', () => {
  const r = buildSyntheticFilmSequence('Une femme court dans un salon.', generator);
  assert.equal(r.status, 'scenario_seulement');
  assert.equal(r.glb, null);
});
test('répertorie les gestes absents plutôt que les animer fictivement', () => {
  const r = buildSyntheticFilmSequence('Une femme ouvre la porte puis boit un café et parle.', generator);
  assert.equal(r.status, 'apercu_partiel_glb_anime');
  assert.ok(r.unanimatedActions.includes('ouvrir'));
});
test('une description à deux scènes reste au stade storyboard', () => {
  const r = buildSyntheticFilmSequence('Une femme marche.\n\nUne femme boit un café.', generator);
  assert.equal(r.status, 'scenario_seulement');
});
