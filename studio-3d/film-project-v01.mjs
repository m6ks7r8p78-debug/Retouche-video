/** RetoucheProAI / Film Studio: contrat de préparation locale v0.1.
 * Aucune IA générative, aucun fichier importé, aucun appel réseau, aucun MP4.
 * Les correspondances textuelles sont heuristiques et partielles.
 */
function planFilm(input) {
  const req = typeof input === 'string' ? { prompt: input } : input;
  if (!req || typeof req !== 'object') throw new TypeError('Demande de film invalide.');
  if (typeof req.prompt !== 'string' || !req.prompt.trim()) throw new Error('Description de film requise.');
  const prompt = req.prompt.trim();
  if (prompt.length > 6000) throw new Error('Description limitée à 6 000 caractères dans ce prototype.');
  const norm = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const normalized = norm(prompt);
  if (/\b(?:enfant|mineur|mineure|adolescent|adolescente|fillette|bebe|child|teen)\b/.test(normalized) ||
      [...normalized.matchAll(/\b(\d{1,2})\s*(?:ans|years old)\b/g)].some(m => Number(m[1]) < 18)) {
    throw new Error('Le prototype de personnages 3D existant est réservé aux personnages adultes.');
  }

  const references = req.references === undefined ? [] : req.references;
  if (!Array.isArray(references) || references.length > 5) throw new Error('Maximum cinq références déclaratives.');
  const referenceSummary = references.map((r, i) => {
    if (!r || !['photo', 'video'].includes(r.kind)) throw new Error(`Référence ${i + 1} : type photo ou video requis.`);
    if (r.rightsConfirmed !== true) throw new Error(`Référence ${i + 1} : droits d'utilisation non confirmés.`);
    if (r.depictsRealPerson !== false && r.likenessConsent !== true) {
      throw new Error(`Référence ${i + 1} : accord de reproduction de l'apparence requis.`);
    }
    if (r.cloneVoice === true && r.voiceConsent !== true) {
      throw new Error(`Référence ${i + 1} : consentement vocal spécifique requis.`);
    }
    return {
      kind: r.kind,
      realPerson: r.depictsRealPerson !== false,
      identityUseAuthorized: r.depictsRealPerson === false || r.likenessConsent === true,
      voiceUseAuthorized: r.cloneVoice === true && r.voiceConsent === true
    };
  });

  const actionPatterns = [
    ['entrer', /\b(?:entre|entrer|arrive|arriver)\b/g],
    ['marcher', /\b(?:marche|marcher|marchant|promene|walking|walks?)\b/g],
    ['s_asseoir', /\b(?:assise?|assoit|asseoir|s'assied|s'assoit|sitting|seated)\b/g],
    ['boire', /\b(?:boit|boire|buvant|drink|drinks|sirote)\b/g],
    ['poser_objet', /\b(?:pose|poser|depose|deposer)\b/g],
    ['fumer', /\b(?:fume|fumer|fumant|cigarette|cigare)\b/g],
    ['parler', /\b(?:parle|parler|discute|discussion|conversation|dialogue|conversation|talks?|speaks?)\b/g],
    ['regarder', /\b(?:regarde|regarder|observe|fixe|looks?)\b/g],
    ['ouvrir', /\b(?:ouvre|ouvrir|open|opens)\b/g],
    ['sourire', /\b(?:sourit|sourire|smiles?)\b/g]
  ];
  const sections = prompt.split(/\n\s*\n|\bsc[eè]ne\s+\d+\s*[:：]\s*/i).filter(s => s.trim());
  const scenes = sections.map((section, sceneIndex) => {
    const src = norm(section);
    const events = [];
    for (const [action, regex] of actionPatterns) {
      regex.lastIndex = 0;
      for (const match of src.matchAll(regex)) {
        const context = src.slice(Math.max(0, match.index - 18), match.index + match[0].length + 18);
        if (action === 'fumer' && /\b(?:ne fume pas|sans fumer|sans cigarette|non fumeur)\b/.test(context)) continue;
        events.push({ action, position: match.index });
      }
    }
    events.sort((a, b) => a.position - b.position || a.action.localeCompare(b.action));
    const locations = [
      ['salon', /\bsalon\b/],
      ['rue', /\brue\b/],
      ['chambre', /\bchambre\b|\blit\b/],
      ['cafe', /\b(?:dans|au|un)\s+cafe\b/],
      ['parc', /\bparc\b/],
      ['cuisine', /\bcuisine\b/]
    ];
    const location = locations.find(([, pattern]) => pattern.test(src));
    return {
      scene: sceneIndex + 1,
      setting: location ? location[0] : 'a_preciser',
      steps: events.slice(0, 40).map((event, index) => ({
        order: index + 1, intent: event.action, state: 'planifie_non_anime'
      })),
      omittedActionCount: Math.max(0, events.length - 40),
      status: 'scenario_seulement'
    };
  });
  const characters = [];
  if (/\b(?:femme|woman|dame)\b/.test(normalized)) characters.push({
    role: 'personnage_feminin', hair: /\b(?:blonde|blond)\b/.test(normalized) ? 'blond' :
      /\b(?:brune|brun|chatain)\b/.test(normalized) ? 'brun' : 'non_precise',
    status: 'description_textuelle_non_modelee'
  });
  if (/\b(?:homme|man|monsieur)\b/.test(normalized)) characters.push({
    role: 'personnage_masculin', hair: 'non_precise', status: 'description_textuelle_non_modelee'
  });
  if (characters.length === 0) characters.push({
    role: 'a_preciser', hair: 'non_precise', status: 'description_textuelle_non_modelee'
  });
  const recognizedCount = scenes.reduce((sum, scene) => sum + scene.steps.length, 0);
  return {
    schema: 'retoucheproai.film-project.v0.1',
    stage: 'storyboard_structuré_uniquement',
    mediaUploaded: false,
    renderAvailable: false,
    originalPrompt: prompt,
    references: referenceSummary,
    characters,
    scenes,
    recognizedActionCount: recognizedCount,
    intendedOutput: { type: 'film', target: 'mp4', generationStatus: 'non_implémentée' },
    missingCapabilities: [
      'compréhension_générale_du_texte',
      'reconstruction_fidèle_et_consentie_de_personne',
      'animation_corporelle_et_contacts_physiques',
      'décors_et_caméras_cohérents',
      'synthèse_vocale_et_dialogues',
      'rendu_film_et_export_audio_video',
      'validation_visuelle_et_Safari_iPhone'
    ]
  };
}
export { planFilm };
