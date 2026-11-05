/* Serveur v7 : route /diag (diagnostic anonyme) avec une base D1 simulée par SQLite (node --experimental-sqlite).
   node --experimental-sqlite tests/diag_serveur.test.mjs */
import { DatabaseSync } from "node:sqlite";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const W = (await import(join(dirname(fileURLToPath(import.meta.url)), "..", "serveur", "worker.js"))).default;
const sql = new DatabaseSync(":memory:");
const stmt = (q, a = []) => ({ bind: (...b) => stmt(q, b), run: async () => sql.prepare(q).run(...a), all: async () => ({ results: sql.prepare(q).all(...a) }), first: async () => sql.prepare(q).get(...a) });
const D1 = { prepare: q => stmt(q), batch: async l => { for (const s of l) await s.run() } };
const env = { DIAG: D1, DIAG_CLE: "secret-de-test" };
let ok = 0, ko = 0; const check = (c, t) => { if (c) { ok++; console.log("✓ " + t) } else { ko++; console.log("✗ " + t) } };
const call = (path, init = {}, e = env) => W.fetch(new Request("https://srv.test" + path, { ...init, headers: { origin: "https://retoucheproai.com", ...(init.headers || {}) } }), e);
const lot = [{ id: "abc123def", kind: "camera", t: "2026-11-05T20:00:00Z", ver: "v6.0", appareil: { marque: "Nokia", modele: "N95", annee: 2008, nom: "VID_0001.3gp" }, ua: "Mozilla/5.0 …", objectif: { coins: .2 } },
  { id: "abc123def", kind: "camera" }, { id: "../../x", kind: "mauvais" }, { id: "zz99yy88xx", kind: "analyse", src: "640x480 12s IMG_2020.MOV" }];
let r = await call("/diag", { method: "POST", body: JSON.stringify({ lot }), headers: { "content-type": "application/json" } });
let j = await r.json();
check(r.status === 200 && j.n === 3 && r.headers.get("access-control-allow-origin") === "https://retoucheproai.com", "lot reçu (3 lignes valides sur 4), CORS de l'app");
const rows = sql.prepare("SELECT * FROM diag").all();
check(rows.length === 2, "doublon ignoré (" + rows.length + " lignes)");
const all = rows.map(x => x.data).join(" ");
check(!/VID_0001|IMG_2020|Mozilla/.test(all), "noms de fichiers et empreinte du navigateur retirés");
check(/Nokia/.test(all) && /N95/.test(all), "marque et modèle de l'appareil gardés");
r = await call("/diag/export"); check(r.status === 401, "export refusé sans clé");
r = await call("/diag/export", { headers: { authorization: "Bearer secret-de-test" } }); j = await r.json();
check(r.status === 200 && j.total === 2 && j.lignes[0].data.appareil.annee === 2008, "export avec la clé");
r = await call("/diag", { method: "POST", body: JSON.stringify({ lot }) }, {}); check(r.status === 503, "sans base liée : réponse « pas encore ouvert »");
r = await W.fetch(new Request("https://srv.test/diag", { method: "POST", body: JSON.stringify({ lot }), headers: { origin: "https://exemple.com" } }), env);
check(r.status === 403, "autre site refusé");
console.log(`\n${ok} réussis, ${ko} échoués`); process.exit(ko ? 1 : 0);
