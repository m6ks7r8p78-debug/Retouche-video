/* Verrou de l'intégration AUBE v11.0 / PR #92.
   Tests STRUCTURELS : aucun appareil iPhone ni GPU réel testé ici. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {fileURLToPath} from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const binary=name=>fs.readFileSync(path.join(root,name));
const text=name=>binary(name).toString("utf8");
const blobSHA=name=>{
  const bytes=binary(name);
  return crypto.createHash("sha1").update(Buffer.from("blob "+bytes.length+"\0")).update(bytes).digest("hex");
};
const unchanged={
  "aube.css":"f0d5013e80a0ed5cb7e9560ace0fe2ae4fbd6d69",
  "aube.js":"17ab3b8da9da89837b4029333e610d4b5afb2f41",
  "aube-etapes.css":"836ec5e9414142908990d799852891e2089457a1",
  "aube-etapes.js":"f482ff70c6cfe83b74038b2c12155565f5a67138",
  "sr.bin":"32e0d26a5685149aa03ca43f35df6cd0ead36a87",
  "sr2.bin":"8cf6dcf4c0e1560d5108fc7ed3c37d5b6f1d1274"
};
for(const [name,sha] of Object.entries(unchanged)){
  assert.equal(blobSHA(name),sha,name+" : fichier validé modifié sans autorisation");
}
console.log("✓ 4 fichiers AUBE et 2 poids IA inchangés (identité Git stricte)");

const html=text("index.html");
const ids=[...html.matchAll(/\bid=["']([^"']+)["']/g)].map(x=>x[1]);
assert.equal(ids.length,185,"169 IDs historiques AUBE + 16 nouveaux IDs PR92 requis");
assert.equal(new Set(ids).size,ids.length,"IDs de la page dupliqués");
for(const id of ["modeb","f","fp","st0","app","pg","out","o_max","o_x","o_xp",
                 "qwrap","rec_l","ia_test","ia_result","ia_before","ia_after",
                 "auto_note","auto_tweaks","auto_reprocess"]){
  assert.ok(ids.includes(id),"Identifiant de commande disparu : "+id);
}
console.log("✓ 185 IDs préservés, y compris traitement, comparaison et export pour X");

for(const f of ["aube.css","aube-etapes.css","aube.js","aube-etapes.js"]){
  const fragment=f.endsWith(".css")?'href="'+f+'"':'src="'+f+'"';
  assert.equal(html.split(fragment).length,2,f+" absente ou injectée plusieurs fois");
}
assert.equal(html.split('src="budget-ia.js"').length,2,"budget-ia.js doit charger exactement une fois");
assert.match(html,/body\.simple #qwrap/);
assert.doesNotMatch(html,/body\.simple #flow,body\.simple #outils/,
                   "Règle héritée de PR92 masquerait des étapes AUBE");
console.log("✓ AUBE intacte, nouvelles commandes IA accessibles en mode avancé");

assert.match(text("app.js"),/const VER="v11\.1-essai"/,"ne pas rétrograder vers v10.3");
assert.match(text("app.js"),/const IATEST=/);
assert.match(text("app.js"),/window\.__simpleExportDone/);
assert.match(text("mode-simple.js"),/window\.__simpleRefresh/);
assert.match(text("sr.js"),/__iaDeadlineMs/);
assert.match(text("sr-gpu.js"),/__iaDeadlineMs/);
assert.match(text("kaggle.js"),/checkTime/);
console.log("✓ moteur expérimental v11.1 et garde-fous IA reliés");

const sw=text("sw.js");
assert.match(sw,/const C="retouche-v111"/,"cache ne doit pas rétrograder à v103");
for(const f of ["budget-ia.js","aube.css","aube-etapes.css","aube.js","aube-etapes.js"]){
  assert.ok(sw.includes('"'+f+'"'),"ressource hors ligne absente : "+f);
}
console.log("✓ ressources AUBE/IA présentes dans le cache PWA v111");
console.log("Attention : tests JS statiques uniquement, Safari iPhone et export complet non mesurés.");
