/* Point de reprise du Directeur IA. Aucun accès réseau, aucun média, aucun push. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const ETAT = path.resolve(__dirname, '../suivi/directeur-ia.json');
const DEPOT = 'm6ks7r8p78-debug/Retouche-video';
const BRANCHE = 'chatgpt-ai-director-v01';
const SHA40 = /^[a-f0-9]{40}$/i;

function verifierEtat(etat) {
  if (!etat || etat.schema !== 1 || etat.depot !== DEPOT || etat.branche !== BRANCHE || etat.pr !== 1 || etat.pr_brouillon !== true) {
    throw new Error('Point de reprise incompatible : depot, branche ou PR incorrects');
  }
  if (!etat.dernier_succes || !SHA40.test(etat.dernier_succes.sha) || !Number.isSafeInteger(etat.dernier_succes.run_id) || etat.dernier_succes.run_id <= 0) {
    throw new Error('Dernier succes non verifiable');
  }
  if (!Array.isArray(etat.termine) || !Array.isArray(etat.prochaines_etapes) || !etat.prochaines_etapes.length ||
      ![...etat.termine, ...etat.prochaines_etapes].every(s => typeof s === 'string' && s.trim() && s.length <= 500)) {
    throw new Error('Journal de reprise invalide');
  }
  if (!etat.garde_fous || etat.garde_fous.main_intouchable !== true || etat.garde_fous.pas_de_fusion !== true ||
      etat.garde_fous.pas_de_deploiement !== true || etat.garde_fous.pas_de_medias_personnels !== true) {
    throw new Error('Garde-fous absents');
  }
  return etat;
}

function creerInstantane(env, etat, date = new Date()) {
  verifierEtat(etat);
  if (env.GITHUB_REPOSITORY !== DEPOT || env.GITHUB_REF_NAME !== BRANCHE) {
    throw new Error('Capture refusee hors de la branche ChatGPT autorisee');
  }
  if (!SHA40.test(env.GITHUB_SHA || '')) throw new Error('SHA GitHub invalide');
  const runId = Number(env.GITHUB_RUN_ID);
  const tentative = Number(env.GITHUB_RUN_ATTEMPT);
  if (!Number.isSafeInteger(runId) || runId <= 0 || !Number.isSafeInteger(tentative) || tentative < 1) {
    throw new Error('Execution GitHub invalide');
  }
  if (!['tests', 'parcours-navigateur'].includes(env.GITHUB_JOB)) throw new Error('Job inconnu');
  if (!['success', 'failure', 'cancelled', 'skipped'].includes(env.JOB_RESULT)) throw new Error('Resultat CI invalide');
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) throw new Error('Date invalide');
  return {
    schema: 1,
    type: 'point_de_reprise_ci',
    depot: DEPOT,
    branche: BRANCHE,
    pr: 1,
    commit_teste: env.GITHUB_SHA.toLowerCase(),
    execution: {id: runId, tentative, job: env.GITHUB_JOB, resultat_job: env.JOB_RESULT,
      url: `https://github.com/${DEPOT}/actions/runs/${runId}`},
    horodatage: date.toISOString(),
    dernier_succes_avant_cette_execution: etat.dernier_succes,
    prochaines_etapes: etat.prochaines_etapes.slice(),
    garde_fous: etat.garde_fous,
    note: 'Resultat du job seulement. Verifier les autres jobs et le bilan global avant de declarer le commit valide. Aucun redemarrage ChatGPT automatique.'
  };
}

function chargerEtat() { return verifierEtat(JSON.parse(fs.readFileSync(ETAT, 'utf8'))); }
function enregistrerInstantane(dest, instantane) {
  const cible = path.resolve(dest);
  fs.mkdirSync(path.dirname(cible), {recursive: true});
  const temporaire = `${cible}.tmp-${process.pid}`;
  try {
    fs.writeFileSync(temporaire, JSON.stringify(instantane, null, 2) + '\n', {encoding: 'utf8', flag: 'wx', mode: 0o600});
    fs.renameSync(temporaire, cible);
  } finally { try { fs.unlinkSync(temporaire); } catch (_) { /* deja deplace */ } }
}

function executer(args = process.argv.slice(2), env = process.env) {
  const commande = args[0];
  const etat = chargerEtat();
  if (commande === 'inspecter') {
    const message = [
      `${etat.depot} / ${etat.branche} / PR #${etat.pr} (brouillon)`,
      `Dernier succes CONNU dans le journal : ${etat.dernier_succes.sha} / run ${etat.dernier_succes.run_id}`,
      'Verifier le HEAD actuel et le statut de TOUS les jobs CI : ce journal ne se met pas a jour tout seul.',
      'Prochaines etapes :', ...etat.prochaines_etapes.map((v, i) => `${i + 1}. ${v}`)
    ].join('\n');
    process.stdout.write(message + '\n');
    return message;
  }
  if (commande === 'capture' && args[1] === '--out' && args[2] && args.length === 3) {
    const resultat = creerInstantane(env, etat);
    enregistrerInstantane(args[2], resultat);
    process.stdout.write(`Point CI ${resultat.execution.job}: ${resultat.execution.resultat_job} -> ${args[2]}\n`);
    return resultat;
  }
  throw new Error('Usage : node outils/directeur-reprise.cjs inspecter | capture --out CHEMIN.json');
}

if (require.main === module) {
  try { executer(); } catch (erreur) { console.error(erreur.message); process.exitCode = 1; }
}
module.exports = {verifierEtat, creerInstantane, enregistrerInstantane, chargerEtat, executer};
