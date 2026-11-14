/* Tests autonomes du journal et des points de reprise CI. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const REC = require('../outils/directeur-reprise.cjs');
const etat = REC.chargerEtat();
const env = {
  GITHUB_REPOSITORY: 'm6ks7r8p78-debug/Retouche-video',
  GITHUB_REF_NAME: 'chatgpt-ai-director-v01',
  GITHUB_SHA: 'a'.repeat(40),
  GITHUB_RUN_ID: '456789',
  GITHUB_RUN_ATTEMPT: '2',
  GITHUB_JOB: 'tests',
  JOB_RESULT: 'failure',
  MEDIA_SECRET: 'ne-jamais-archiver'
};

test('journal permanent lisible, dernier succes avec provenance', () => {
  assert.equal(etat.pr_brouillon, true);
  assert.match(etat.dernier_succes.sha, /^[a-f0-9]{40}$/);
  assert.ok(etat.prochaines_etapes.length >= 3);
});
test('capture deterministe CI avec statut non confondu avec validation globale', () => {
  const date = new Date('2026-11-14T05:00:00.000Z');
  const p = REC.creerInstantane(env, etat, date);
  assert.equal(p.execution.resultat_job, 'failure');
  assert.equal(p.execution.tentative, 2);
  assert.equal(p.execution.url, 'https://github.com/m6ks7r8p78-debug/Retouche-video/actions/runs/456789');
  assert.equal(p.commit_teste, 'a'.repeat(40));
  assert.equal(p.horodatage, date.toISOString());
  assert.deepEqual(p, REC.creerInstantane(env, etat, date));
  assert.equal(JSON.stringify(p).includes('ne-jamais-archiver'), false);
  assert.match(p.note, /Resultat du job seulement/);
});
test('capture refusee pour main, autre depot ou SHA invalide', () => {
  for (const modification of [
    {GITHUB_REF_NAME: 'main'}, {GITHUB_REPOSITORY: 'autre/depot'},
    {GITHUB_SHA: 'pas-un-sha'}, {GITHUB_RUN_ID: 'NaN'},
    {GITHUB_RUN_ATTEMPT: '0'}, {GITHUB_JOB: 'publier'}, {JOB_RESULT: 'invented'}
  ]) {
    assert.throws(() => REC.creerInstantane({...env, ...modification}, etat));
  }
});
test('garde-fous obligatoires dans le journal permanent', () => {
  assert.throws(() => REC.verifierEtat({...etat, garde_fous: {...etat.garde_fous, main_intouchable: false}}), /Garde-fous/);
  assert.throws(() => REC.verifierEtat({...etat, branche: 'main'}), /incompatible/);
  assert.throws(() => REC.verifierEtat({...etat, dernier_succes: {sha: 'erreur', run_id: 2}}), /succes/);
});
test('ecriture atomique du seul fichier demande (pas de medias)', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'directeur-reprise-'));
  try {
    const cible = path.join(d, 'checkpoint', 'resultat.json');
    const p = REC.creerInstantane(env, etat, new Date('2026-11-14T05:00:00Z'));
    REC.enregistrerInstantane(cible, p);
    assert.deepEqual(JSON.parse(fs.readFileSync(cible, 'utf8')), p);
    assert.deepEqual(fs.readdirSync(path.join(d, 'checkpoint')), ['resultat.json']);
  } finally { fs.rmSync(d, {recursive: true, force: true}); }
});
