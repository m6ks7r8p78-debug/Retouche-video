/* v8.1 — kaggle.js : moteur « Cinéma » (SeedVR2) contre l'IA standard, avec une fausse API Kaggle (aucun réseau).
   Vérifie : script de calcul envoyé, Internet du calcul (seulement pour Cinéma), fichier de repli envoyé, params.moteur,
   et que l'IA standard est strictement inchangée.   node --test tests/kaggle_cinema.test.mjs */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";

const ICI = path.dirname(fileURLToPath(import.meta.url)), RACINE = path.join(ICI, "..");

async function lancer(moteur) {
  const appels = [], envois = {};
  const ctx = {
    console, Blob, File, JSON, Math, Date, Promise, Error, Object, String, Number, encodeURIComponent, AbortController, Uint8Array,
    localStorage: { getItem: () => "KGAT_jeton_de_test_123456789", setItem() {}, removeItem() {} },
    setTimeout: f => { f(); return 0 }, clearTimeout() {}, navigator: {}, DIAG: {},
    fetch: async (u, o = {}) => {
      if (!/^https?:/.test(u)) {           /* fichiers de l'app */
        const f = path.join(RACINE, u); if (!fs.existsSync(f)) return { ok: false };
        const b = fs.readFileSync(f); return { ok: true, blob: async () => new Blob([b]), text: async () => b.toString("utf8") } }
      if (u.includes("/kaggle/sortie")) {  /* relais : résultat */
        const f = new URL(u).searchParams.get("f");
        if (f === "info.json") return { ok: true, json: async () => ({ ok: true, images_lues: 10, sortie: { width: 64, height: 48 }, moteur: moteur === "cinema" ? "seedvr2-3b" : undefined }) };
        return { ok: true, headers: { get: () => "3" }, blob: async () => new Blob([new Uint8Array(3)]) } }
      const m = u.split("/").pop(), body = JSON.parse(o.body || "{}"); appels.push([m, body]);
      const rep = { IntrospectToken: { active: true, username: "testeur" }, StartBlobUpload: { createUrl: "https://stockage/" + body.name, token: "tk-" + body.name },
        GetDatasetStatus: { status: "ready" }, GetKernelSessionStatus: { status: "COMPLETE" },
        ListDatasetFiles: { datasetFiles: Object.entries(envois).map(([name, n]) => ({ name, totalBytes: n })) } }[m] || {};
      return { ok: true, status: 200, text: async () => JSON.stringify(rep) } },
    XMLHttpRequest: class { open(_, u) { this.u = u } setRequestHeader() {} get upload() { return this._up || (this._up = {}) }
      send(b) { const n = this.u.split("/").pop(); envois[n] = b.size; b.text().then(t => { envois["__" + n] = t; this.status = 200; this.onload() }) } },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(RACINE, "kaggle.js"), "utf8") + "\nthis.KG = KG;", ctx);
  const r = await ctx.KG.traiter({ moteur, file: new File([new Uint8Array(1000)], "clip.mp4"), dw: 32, dh: 24, ow: 64, oh: 48, dn: 0.3, images: 10 }, () => {});
  return { r, appels, envois };
}

test("Cinéma : script SeedVR2, Internet du calcul, repli envoyé, params.moteur", async () => {
  const { r, appels, envois } = await lancer("cinema");
  const sk = appels.find(([m]) => m === "SaveKernel")[1];
  assert.equal(sk.text, fs.readFileSync(path.join(RACINE, "serveur-ia/cinema_kaggle.py"), "utf8"));
  assert.equal(sk.enableInternet, true); assert.equal(sk.enableGpu, true); assert.equal(sk.isPrivate, true);
  assert.ok("traitement_kaggle.py" in envois, "le script de repli doit être envoyé");
  assert.equal(envois["__traitement_kaggle.py"], fs.readFileSync(path.join(RACINE, "serveur-ia/traitement_kaggle.py"), "utf8"));
  assert.equal(JSON.parse(envois["__params.json"]).moteur, "cinema");
  assert.equal(r.info.moteur, "seedvr2-3b");
  assert.ok(appels.some(([m]) => m === "DeleteKernel") && appels.some(([m]) => m === "DeleteDataset"), "ménage chez Kaggle");
});

test("Standard : inchangé (pas d'Internet, pas de fichier en plus)", async () => {
  const { appels, envois } = await lancer("standard");
  const sk = appels.find(([m]) => m === "SaveKernel")[1];
  assert.equal(sk.text, fs.readFileSync(path.join(RACINE, "serveur-ia/traitement_kaggle.py"), "utf8"));
  assert.equal(sk.enableInternet, false);
  assert.deepEqual(Object.keys(envois).filter(k => !k.startsWith("__")).sort(), ["ia_serveur.py", "params.json", "sr.bin", "sr2.bin", "video.mp4"]);
  assert.equal(JSON.parse(envois["__params.json"]).moteur, "standard");
});
