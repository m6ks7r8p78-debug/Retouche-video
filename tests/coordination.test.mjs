import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {checkIndex,validateRegistry} from "../outils/coordination/validate.mjs";
const root=path.resolve(fileURLToPath(new URL("../",import.meta.url)));
const registry=JSON.parse(await fs.readFile(path.join(root,"coordination","REGISTRE.json"),"utf8"));
const clone=()=>structuredClone(registry);
test("Coordination : l'index réel est structurellement valide",async()=>{
 const result=await checkIndex();
 assert.ok(result.labs>=9);
 assert.ok(result.handoffs>=5);
});
test("Coordination : rejette les laboratoires doublonnés",()=>{
 const bad=clone();
 bad.labs.push({...bad.labs[0]});
 assert.throws(()=>validateRegistry(bad),/doublon/);
});
test("Coordination : liens externes, non HTTPS et paramètres interdits",()=>{
 for(const url of [
  "https://example.com/private",
  "http://github.com/m6ks7r8p78-debug/Retouche-video/pull/3",
  "https://github.com/m6ks7r8p78-debug/Retouche-video/pull/3?token=secret"
 ]){
  const bad=clone();bad.labs[0].links=[url];
  assert.throws(()=>validateRegistry(bad),/références GitHub publiques/);
 }
});
test("Coordination : un relais proposé n'est pas présenté comme intégré",()=>{
 const bad=clone();bad.proposedHandoffs[0].state="integrated";
 assert.throws(()=>validateRegistry(bad),/jamais une intégration validée/);
});
test("Coordination : une PR brouillon doit avoir un numéro",()=>{
 const bad=clone();bad.labs[0].pr=null;
 assert.throws(()=>validateRegistry(bad),/PR brouillon/);
});
test("Coordination : le dossier est exclusivement documentaire, sans média",async()=>{
 const entries=await fs.readdir(path.join(root,"coordination"));
 assert.ok(entries.includes("RELAIS_UNIVERSEL.md"));
 assert.ok(entries.includes("PROTOCOLE.md"));
 assert.ok(entries.includes("REGISTRE.json"));
 assert.ok(entries.every(f=>/\.(md|json)$/.test(f)));
 const protocol=await fs.readFile(path.join(root,"coordination","PROTOCOLE.md"),"utf8");
 assert.match(protocol,/main/);
 assert.match(protocol,/déploiement/);
 assert.match(protocol,/physique/);
});
