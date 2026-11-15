/* RetoucheProAI AURA → Studio natif : transfert local, aucune transmission réseau.
   Ce script est chargé APRÈS app.js sur la même origine ; ack signifie seulement
   que le fichier a été passé au formulaire, pas que l'IA a terminé. */
(() => {
  'use strict';
  const CHANNEL = 'retoucheproai:aura:handoff:v1';
  const seen = new Map();
  window.addEventListener('message', event => {
    if (event.origin !== location.origin || event.source !== window.parent || window.parent === window) return;
    const m = event.data;
    if (!m || m.channel !== CHANNEL || m.type !== 'import' || typeof m.id !== 'string' || m.id.length > 96) return;
    const reply = (ok, reason) => event.source.postMessage({channel:CHANNEL, type:'ack', id:m.id, ok, reason}, event.origin === 'null' ? '*' : event.origin);
    if (seen.has(m.id)) { const state = seen.get(m.id); reply(state.ok, state.reason); return; }
    let state;
    try {
      if (!(m.file instanceof File) || m.file.size === 0) throw Error('fichier vide ou invalide');
      const kind = m.kind === 'image' ? 'image' : m.kind === 'video' ? 'video' : null;
      if (!kind) throw Error('type de média non pris en charge');
      const image = /^image\//.test(m.file.type) || /\.(jpe?g|png|webp|heic|heif|avif)$/i.test(m.file.name);
      const video = /^video\//.test(m.file.type) || /\.(mp4|mov|m4v|webm|3gp)$/i.test(m.file.name);
      if (!(kind === 'image' ? image : video)) throw Error('type de fichier incompatible');
      const input = document.getElementById(kind === 'image' ? 'fp' : 'f');
      if (!(input instanceof HTMLInputElement) || input.type !== 'file' || !document.getElementById('app'))
        throw Error('formulaire du studio indisponible');
      if (typeof DataTransfer !== 'function') throw Error('import automatique indisponible sur ce navigateur');
      const dt = new DataTransfer(); dt.items.add(m.file); input.files = dt.files;
      input.dispatchEvent(new Event('change', {bubbles:true}));
      state = {ok:true, reason:'Fichier transmis au formulaire du studio. Traitement non encore confirmé.'};
    } catch(err) {
      state = {ok:false, reason:err.message || 'import impossible'};
    }
    seen.set(m.id, state);
    if (seen.size > 25) seen.delete(seen.keys().next().value);
    reply(state.ok, state.reason);
  });
})();