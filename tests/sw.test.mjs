// Service worker : à l'activation d'une nouvelle version, seuls les anciens caches de l'app doivent partir.
// Les modèles IA téléchargés (cache « retouche-modeles-v1 ») et les caches de l'autre app du site (/radar/) doivent rester.
// Usage : node tests/sw.test.mjs [chemin/vers/sw.js]
import fs from "fs";
import vm from "vm";
import path from "path";
import { fileURLToPath } from "url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = fs.readFileSync(path.join(HERE, "..", "sw.js"), "utf8");
const C = SRC.match(/const C="([^"]+)"/)[1];
import crypto from "crypto";
/* empreinte des fichiers hors ligne : « --maj » l'écrit dans sw.js ; sans option, le test échoue si elle n'est plus à jour */
const listes = n => JSON.parse(SRC.match(new RegExp(n + "=(\\[[^\\]]+\\])"))[1]);
const empreinte = () => { const h = crypto.createHash("sha256"); for (const f of [...listes("F"), ...listes("LOURDS")]) if (f !== "./") { h.update(f); h.update(fs.readFileSync(path.join(HERE, "..", f))) } return h.digest("hex").slice(0, 16) };
if (process.argv.includes("--maj")) { fs.writeFileSync(path.join(HERE, "..", "sw.js"), SRC.replace(/const H="[^"]*"/, 'const H="' + empreinte() + '"')); console.log("empreinte écrite : " + empreinte()); process.exit(0) }

let ok = 0, ko = 0;
const check = (cond, label) => { if (cond) { ok++; console.log("✓ " + label) } else { ko++; console.log("✗ " + label) } };

async function activate(names) {
  const store = new Set(names), handlers = {};
  const ctx = {
    self: { addEventListener: (t, f) => (handlers[t] = f), skipWaiting: () => {}, clients: { claim: async () => {} } },
    caches: { keys: async () => [...store], delete: async n => store.delete(n), open: async () => ({ addAll: async () => {}, put: async () => {}, match: async () => ({}), add: async () => {} }) },
    location: { origin: "https://exemple.github.io" }, URL, Request: class { constructor(u) { this.url = u } }, fetch: async () => { throw new Error("hors ligne") }
  };
  ctx.self.clients = ctx.self.clients;
  vm.runInNewContext(SRC, ctx);
  let p; handlers.activate({ waitUntil: x => (p = x) }); await p;
  return store;
}

const kept = await activate(["retouche-v1", "retouche-v20", "retouche-modeles-v1", "radar-cache", C]);
check(kept.has(C), "le cache de la version en cours (" + C + ") est gardé");
check(!kept.has("retouche-v20") && !kept.has("retouche-v1"), "les anciennes versions de l'app sont retirées");
check(kept.has("retouche-modeles-v1"), "les modèles IA téléchargés (retouche-modeles-v1) sont gardés");
check(kept.has("radar-cache"), "les caches de l'autre app du site (/radar/) sont gardés");

check(SRC.includes('const H="' + empreinte() + '"'), "l'empreinte des fichiers est à jour (sinon : node tests/sw.test.mjs --maj, et changer le numéro du cache C)");
const F = JSON.parse(SRC.match(/F=(\[[^\]]+\])/)[1]);
const missing = F.filter(f => f !== "./" && !fs.existsSync(path.join(HERE, "..", f)));
check(missing.length === 0, "tous les fichiers mis hors ligne existent" + (missing.length ? " (manquent : " + missing.join(", ") + ")" : ""));
const html = fs.readFileSync(path.join(HERE, "..", "index.html"), "utf8");
const css = (html.match(/href="(polices\/[^"]+\.css)"/) || [])[1];
if (css) {
  const fonts = [...fs.readFileSync(path.join(HERE, "..", css), "utf8").matchAll(/url\((polices\/[^)]+)\)/g)].map(m => m[1]);
  check(fonts.every(f => F.includes(f)) && F.includes(css), "les polices locales sont disponibles hors ligne");
  check(!/fonts\.(googleapis|gstatic)\.com/.test(html), "aucune requête vers Google Fonts à l'ouverture");
}

console.log("\nRésultat : " + ok + " réussis, " + ko + " échoués.");
process.exit(ko ? 1 : 0);
