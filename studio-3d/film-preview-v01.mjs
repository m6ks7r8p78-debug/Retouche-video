/** Passerelle expérimentale vers le générateur 3D procédural v1.9.
 * Produit UNIQUEMENT un avatar synthétique GLB stylisé, jamais un film.
 * Ne charge aucune référence personnelle et ne passe pas de média à un service.
 */
import { planFilm } from './film-project-v01.mjs';

export function buildSyntheticActorPreview(request, generator) {
  const project = planFilm(request);
  const blocked = (reason) => ({
    status: 'scenario_seulement',
    reason,
    project,
    mediaUploaded: false,
    renderedFilm: false,
    glb: null
  });
  if (project.references.length) return blocked('Une photo/vidéo personnelle ne peut pas encore servir à reconstruire un acteur.');
  if (project.characters.length !== 1 || project.characters[0].role === 'a_preciser') {
    return blocked('L’aperçu procédural actuel prend seulement un personnage explicitement décrit.');
  }
  if (!generator || typeof generator.parsePrompt !== 'function' ||
    typeof generator.build !== 'function' || typeof generator.encodeGLB !== 'function') {
    throw new TypeError('Générateur procédural v1.9 absent ou incomplet.');
  }
  const config = generator.parsePrompt(project.originalPrompt);
  const glbResult = generator.encodeGLB(generator.build(config));
  if (!(glbResult.bytes instanceof Uint8Array) ||
    glbResult.bytes.length < 20 ||
    String.fromCharCode(...glbResult.bytes.slice(0, 4)) !== 'glTF') {
    throw new Error('Export GLB invalide.');
  }
  const proceduralActions = new Set(['marcher','fumer','sourire']);
  const pendingActions = [...new Set(project.scenes.flatMap(s => s.steps.map(t => t.intent))
    .filter(action => !proceduralActions.has(action)))];
  return {
    status: 'apercu_glb_synthetique',
    project,
    glb: glbResult.bytes,
    generatedModel: { synthetic: true, photorealistic: false, realPerson: false,
      format: 'glb', proceduralOnly: true, notAReadyFilm: true },
    pendingActions,
    generatorWarnings: config.unhandled || [],
    mediaUploaded: false,
    renderedFilm: false
  };
}
