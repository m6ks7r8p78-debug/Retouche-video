/** RetoucheProAI Film Studio v0.2 — aperçu GLB original, local et partiel.
 * Animation purement procédurale. Ce module ne lit jamais les médias de référence.
 * Les contacts, la position assise et la parole sont des approximations visuelles.
 */
import { planFilm } from './film-project-v01.mjs';

const SUPPORTED = new Set(['s_asseoir', 'boire', 'poser_objet', 'parler', 'regarder', 'sourire']);
const DURATION = { s_asseoir: 1.8, boire: 3.0, poser_objet: 1.45, parler: 2.5, regarder: 1.3, sourire: 1.3 };
const TINY = 0.0001;
const round = n => Math.round(n * 10000) / 10000;
const rotX = a => [Math.sin(a / 2), 0, 0, Math.cos(a / 2)];
const rotZ = a => [0, 0, Math.sin(a / 2), Math.cos(a / 2)];

function buildSyntheticFilmSequence(request, generator) {
  const project = planFilm(request);
  const blocked = reason => ({
    status: 'scenario_seulement', reason, project, glb: null,
    renderedFilm: false, mediaUploaded: false
  });
  if (project.references.length) return blocked('La reconstruction depuis une photo ou vidéo de référence n’est pas implémentée.');
  if (project.scenes.length !== 1) return blocked('Le prototype de scène animée accepte une seule scène.');
  if (project.characters.length !== 1 || project.characters[0].role === 'a_preciser') {
    return blocked('Le prototype de scène animée exige un unique personnage adulte décrit.');
  }
  if (project.originalPrompt.length > 4000) return blocked('Le générateur 3D existant est limité à 4 000 caractères.');
  if (!generator || typeof generator.parsePrompt !== 'function' ||
      typeof generator.build !== 'function' || typeof generator.encodeGLB !== 'function') {
    throw new TypeError('Générateur 3D v1.9 requis.');
  }
  const requested = project.scenes[0].steps.map(s => s.intent);
  const missingActions = [...new Set(requested.filter(s => !SUPPORTED.has(s)))];
  const selected = requested.filter(s => SUPPORTED.has(s));
  if (selected.length > 10) return blocked('Le pilote est limité à dix gestes animés pour une seule scène.');
  if (!selected.length) return blocked('Aucun geste encore animé dans le prototype v0.2.');
  if (selected.includes('poser_objet') && !selected.includes('boire')) {
    return blocked('Impossible de poser une tasse qui n’a pas été prise dans le scénario.');
  }
  if ((selected.includes('boire') || selected.includes('poser_objet')) &&
      !/\b(cafe|tasse|the|cup|coffee|tea)\b/.test(project.originalPrompt.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase())) {
    return blocked('Une tasse ou une boisson doit être explicitement mentionnée.');
  }
  if (selected.includes('boire') && selected.includes('poser_objet') &&
      selected.indexOf('poser_objet') < selected.indexOf('boire')) {
    return blocked('Le dépôt de tasse doit suivre le geste de boire.');
  }
  if (selected.includes('boire') && selected.includes('s_asseoir') &&
      selected.indexOf('boire') < selected.indexOf('s_asseoir')) {
    return blocked('Le pilote du café assis nécessite de s’asseoir avant de boire.');
  }
  let holdingCup = false;
  for (const intent of selected) {
    if (intent === 'poser_objet' && !holdingCup) {
      return blocked('Le scénario tente de déposer une tasse non tenue.');
    }
    if (intent === 'boire') holdingCup = true;
    if (intent === 'poser_objet') holdingCup = false;
  }
  const config = generator.parsePrompt(project.originalPrompt);
  // Les accessoires/gestes non pris en charge par cette animation ne doivent pas apparaître.
  config.smoke = false;
  config.tobacco = null;
  config.actions = ['pose'];
  const model = generator.build(config);
  if (!Array.isArray(model.nodes) || !Array.isArray(model.materials) || !model.nodes[0]) {
    throw new Error('Structure du générateur 3D inattendue.');
  }
  const nodeByName = name => {
    const index = model.nodes.findIndex(n => n.name === name);
    if (index === -1) throw new Error('Articulation manquante : ' + name);
    return index;
  };
  const root = model.nodes[0];
  const originalChildren = (root.children || []).slice();
  const addNode = (name, parent, translation = [0, 0, 0], scale = null, material = null) => {
    const node = { name, translation: translation.slice() };
    if (scale) node.scale = scale.slice();
    if (material !== null) {
      node.mesh = 0;
      node.extras = { materialIndex: material };
    }
    const index = model.nodes.push(node) - 1;
    if (parent !== null) {
      if (!model.nodes[parent].children) model.nodes[parent].children = [];
      model.nodes[parent].children.push(index);
    }
    return index;
  };

  // L’ossature conserve ses identifiants de nœuds ; seuls ses parents changent.
  root.children = [];
  const actor = addNode('film_acteur_pivot', 0, [0, 0, 0], [1, 1, 1]);
  model.nodes[actor].children = originalChildren;
  const seatMat = model.materials.push({ name: 'chaise_stylisee', color: [.29, .21, .19, 1] }) - 1;
  const tableMat = model.materials.push({ name: 'table_stylisee', color: [.49, .33, .23, 1] }) - 1;
  const cupMat = model.materials.push({ name: 'tasse_claire', color: [.94, .91, .84, 1] }) - 1;
  const coffeeMat = model.materials.push({ name: 'boisson', color: [.23, .12, .075, 1] }) - 1;
  addNode('chaise_assise', 0, [0, .69, -.18], [.34, .055, .38], seatMat);
  addNode('chaise_dossier', 0, [0, 1.00, -.49], [.34, .37, .055], seatMat);
  for (const x of [-.27, .27]) for (const z of [-.43, .08]) {
    addNode('pied_chaise', 0, [x, .34, z], [.045, .34, .045], seatMat);
  }
  addNode('table_plateau', 0, [.37, .66, .72], [.34, .055, .35], tableMat);
  addNode('table_pied', 0, [.37, .32, .72], [.08, .31, .08], tableMat);
  const cupOnTable = addNode('tasse_sur_table_groupe', 0, [.32, .755, .69], [1, 1, 1]);
  const wrist = nodeByName('poignet_droite');
  const cupInHand = addNode('tasse_en_main_groupe', wrist, [.02, -.10, .065], [TINY, TINY, TINY]);
  const addCup = (group, suffix) => {
    addNode('tasse_corps_' + suffix, group, [0, 0, 0], [.073, .082, .075], cupMat);
    addNode('tasse_cafe_' + suffix, group, [0, .071, 0], [.058, .012, .058], coffeeMat);
    addNode('tasse_anse_' + suffix, group, [.086, -.009, 0], [.031, .042, .022], cupMat);
  };
  addCup(cupOnTable, 'table');
  addCup(cupInHand, 'main');

  const pose = {
    sit: 1, hip: 0, knee: 0, shoulder: 0, elbow: 0, head: 0,
    mouth: 1, cupTable: 1, cupHand: TINY
  };
  const frames = [];
  const frame = (time, changes = {}) => {
    Object.assign(pose, changes);
    const t = round(time);
    if (frames.length && t <= frames[frames.length - 1].time) {
      throw new Error('Chronologie d’animation non monotone.');
    }
    frames.push({ time: t, ...pose });
  };
  frame(0);
  const timeline = [];
  let cursor = .2;
  let cupHeld = false;
  for (const intent of selected) {
    const start = round(cursor), duration = DURATION[intent];
    const end = round(start + duration);
    timeline.push({ order: timeline.length + 1, intent, start, end, rendering: 'animation_3d_stylisee' });
    if (intent === 's_asseoir') {
      frame(start + .45, { sit: .91, hip: -.47, knee: .65 });
      frame(start + duration, { sit: .79, hip: -1.03, knee: 1.16 });
    } else if (intent === 'boire') {
      frame(start + .40, { shoulder: -.85, elbow: -.63 });
      // Une permutation de deux objets simplifiés, pas une preuve de contact géométrique.
      frame(start + .89);
      frame(start + .90, { cupTable: TINY, cupHand: 1, shoulder: -.85, elbow: -.63 });
      cupHeld = true;
      frame(start + 1.65, { shoulder: -.80, elbow: -2.43, head: -.035 });
      frame(start + 2.15, { shoulder: -.80, elbow: -2.43, head: -.035 });
      frame(end, { shoulder: -.85, elbow: -.63, head: 0 });
    } else if (intent === 'poser_objet') {
      if (!cupHeld) throw new Error('Tasse indisponible au moment du dépôt.');
      frame(start + .35, { shoulder: -.85, elbow: -.63 });
      frame(start + .54);
      frame(start + .55, { cupTable: 1, cupHand: TINY });
      cupHeld = false;
      frame(end, { shoulder: 0, elbow: 0 });
    } else if (intent === 'parler') {
      frame(start + .35, { mouth: 1.8, head: -.05 });
      frame(start + .72, { mouth: 1.0, head: .025 });
      frame(start + 1.15, { mouth: 1.65, head: -.05 });
      frame(start + 1.6, { mouth: 1.0, head: .01 });
      frame(end, { mouth: 1, head: 0 });
    } else if (intent === 'regarder') {
      frame(start + .4, { head: -.13 });
      frame(end, { head: 0 });
    } else if (intent === 'sourire') {
      frame(start + .35, { mouth: .65 });
      frame(end, { mouth: 1 });
    }
    cursor = end + .20;
  }
  const duration = timeline[timeline.length - 1].end;
  const times = frames.map(f => f.time);
  const track = (node, path, key, make) => ({
    node, path, times, values: frames.map(f => make(f[key]))
  });
  model.animations = [{
    name: 'film_scene_v02',
    label: 'Actions chronologiques stylisées, sans voix',
    duration,
    channels: [
      track(actor, 'scale', 'sit', value => [1, value, 1]),
      ...['gauche', 'droite'].map(side =>
        track(nodeByName('hanche_' + side), 'rotation', 'hip', rotX)),
      ...['gauche', 'droite'].map(side =>
        track(nodeByName('genou_' + side), 'rotation', 'knee', rotX)),
      track(nodeByName('epaule_droite'), 'rotation', 'shoulder', rotX),
      track(nodeByName('coude_droite'), 'rotation', 'elbow', rotX),
      track(nodeByName('tete_pivot'), 'rotation', 'head', rotZ),
      track(nodeByName('bouche_pivot'), 'scale', 'mouth', value => [1, value, 1]),
      track(cupOnTable, 'scale', 'cupTable', value => [value, value, value]),
      track(cupInHand, 'scale', 'cupHand', value => [value, value, value])
    ]
  }];
  model.timeline = timeline;
  const result = generator.encodeGLB(model);
  if (!(result.bytes instanceof Uint8Array) || result.bytes.byteLength < 100 ||
      String.fromCharCode(...result.bytes.subarray(0, 4)) !== 'glTF') {
    throw new Error('Le générateur n’a pas produit un GLB valide.');
  }
  const warnings = [
    'Personnage et accessoires stylisés, aucune personne réelle reproduite.',
    'Assise simulée par compression verticale et articulations simplifiées.',
    'Prise et dépôt de tasse simulés, contacts main-objet non vérifiés.',
    'Mouvement des lèvres muet, aucune voix, aucun dialogue synchronisé.',
    'GLB animé uniquement : aucun film, aucun MP4, aucune génération neuronale.',
    ...(missingActions.length ? ['Gestes non animés : ' + missingActions.join(', ')] : []),
    ...(cupHeld ? ['La tasse reste en main à la fin du scénario demandé.'] : [])
  ];
  return {
    schema: 'retoucheproai.film-motion-preview.v0.2',
    status: 'apercu_partiel_glb_anime',
    project, glb: result.bytes, timeline, duration,
    animatedActions: selected, unanimatedActions: missingActions,
    sceneObjects: ['chaise', 'table', 'tasse'],
    synthetic: true, photorealistic: false, renderedFilm: false,
    containsAudio: false, mediaUploaded: false, warnings
  };
}
export { buildSyntheticFilmSequence };
