/** Petite interface locale : les entrées utilisateur n’entrent jamais dans innerHTML. */
import './generateur.js';
import { buildSyntheticFilmSequence } from './film-sequence-v02.mjs';

const prompt = document.querySelector('#prompt');
const create = document.querySelector('#create');
const status = document.querySelector('#status');
const download = document.querySelector('#download');
const steps = document.querySelector('#steps');
const limits = document.querySelector('#limits');
let currentUrl = null;
const textItem = (parent, value) => {
  const li = document.createElement('li');
  li.textContent = String(value);
  parent.appendChild(li);
};
create.addEventListener('click', () => {
  create.disabled = true;
  status.classList.remove('error');
  if (currentUrl) URL.revokeObjectURL(currentUrl);
  currentUrl = null;
  download.hidden = true;
  download.removeAttribute('href');
  steps.replaceChildren();
  limits.replaceChildren();
  try {
    const output = buildSyntheticFilmSequence(prompt.value, globalThis.Retouche3DGenerator);
    if (output.status !== 'apercu_partiel_glb_anime') {
      output.project.scenes.forEach(scene => scene.steps.forEach(step => textItem(steps, step.intent + ' (non animé)')));
      textItem(limits, output.reason);
      status.textContent = 'Description analysée ; aucun fichier 3D créé pour ce scénario.';
      return;
    }
    output.timeline.forEach(item => textItem(steps, item.order + '. ' + item.intent.replaceAll('_', ' ') + ' · ' + item.start.toFixed(1) + '–' + item.end.toFixed(1) + ' s'));
    output.warnings.forEach(warning => textItem(limits, warning));
    currentUrl = URL.createObjectURL(new Blob([output.glb], { type: 'model/gltf-binary' }));
    download.href = currentUrl;
    download.hidden = false;
    status.textContent = 'Animation 3D créée localement : ' + output.animatedActions.length + ' gestes, ' + output.duration.toFixed(1) + ' secondes. Aucun MP4 généré.';
  } catch (error) {
    status.classList.add('error');
    status.textContent = 'Impossible de préparer la scène : ' + (error?.message || 'erreur inconnue');
  } finally {
    create.disabled = false;
  }
});
window.addEventListener('pagehide', () => { if (currentUrl) URL.revokeObjectURL(currentUrl); });
