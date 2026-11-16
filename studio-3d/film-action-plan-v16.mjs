/** Film Studio v0.16 — planificateur local d'actions répétées.
 * Bibliothèque d'intentions bornée, pas un LLM ni une compréhension libre.
 * Compile seulement ce qui peut être exécuté sans inventer des gestes.
 */
import {planFilm} from './film-project-v01.mjs';

const normalize=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const words={une:1,un:1,deux:2,trois:3,quatre:4,cinq:5};
const explicitCounts=/\b(\d{1,2}|une|un|deux|trois|quatre|cinq)\s+(?:taffes?|bouffees?|inhalations?|puffs?)\b/g;

function compileActionPlanV16(request){
 const project=planFilm(request);
 const src=normalize(project.originalPrompt);
 const declared=[...src.matchAll(explicitCounts)].map(m=>{
  const count=Object.hasOwn(words,m[1])?words[m[1]]:Number(m[1]);
  return {count,position:m.index};
 });
 const counts=[...new Set(declared.map(x=>x.count))];
 if(counts.length>1)throw Error('Nombre de répétitions contradictoire : préciser un seul total.');
 if(counts.length&&(!Number.isInteger(counts[0])||counts[0]<1||counts[0]>5))
  throw Error('Ce pilote accepte une à cinq répétitions maximum.');
 const intents=project.scenes.flatMap(x=>x.steps.map(s=>s.intent));
 const smoke=intents.includes('fumer');
 const other=[...new Set(intents.filter(x=>x!=='fumer'))];
 const denied=project.references.length?'Médias de référence privés non traités dans ce laboratoire.':
  project.scenes.length!==1?'Une seule scène exécutable à ce stade.':
  project.characters.length!==1||project.characters[0].role==='a_preciser'?
  'Personnage adulte féminin ou masculin explicite requis.':
  !smoke?'Pas d’action de cigarette identifiée.':
  other.length?'Action mixte refusée tant que la synchronisation multi-gestes n’est pas programmée : '+other.join(', '):null;
 const count=counts[0]??1;
 const episodes=Array.from({length:count},(_,i)=>({
  order:i+1,intent:'fumer',repeatIndex:i+1,
  phaseLabels:['approcher_cigarette','inspirer','expirer_fumee','reposer_main'],
  resource:'cigarette_unique',durationSeconds:4.8
 }));
 return {
  schema:'retoucheproai.film-action-plan.v0.16',
  kind:'repeated-smoking-action',
  eligible:!denied,
  refusalReason:denied,project,repetitionCount:count,episodes,
  source:'analyse textuelle locale heuristique',mediaUploaded:false,
  fullyNaturalMotion:false
 };
}
export {compileActionPlanV16};
