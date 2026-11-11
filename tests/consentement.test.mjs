/* Serveur de consentement : parcours complets sur une vraie base SQLite (node:sqlite) avec le schéma livré.  node --test tests/consentement.test.mjs */
import test from "node:test"; import assert from "node:assert/strict"; import fs from "node:fs"; import { DatabaseSync } from "node:sqlite"; import { createRequire } from "node:module";
import { traiter, purger } from "../serveur-consentement/worker.js";
const C = createRequire(import.meta.url)("../contribution.js");
function env() { const d = new DatabaseSync(":memory:"); d.exec(fs.readFileSync(new URL("../serveur-consentement/schema.sql", import.meta.url), "utf8"));
  const prep = (sql, a = []) => ({ bind: (...b) => prep(sql, b), run: async () => { d.prepare(sql).run(...a) }, first: async () => d.prepare(sql).get(...a) ?? null, all: async () => ({ results: d.prepare(sql).all(...a) }) });
  return { DB: { prepare: s => prep(s) }, ORIGINE: "https://retoucheproai.com", COLLECTE_ACTIVE: "0", _d: d } }
const T0 = 1_800_000_000_000;
const ap = async (e, m, path, body, tok, now = T0) => { const r = await traiter(new Request("https://x" + path, { method: m, headers: tok ? { authorization: "Bearer " + tok } : {}, body: body ? JSON.stringify(body) : undefined }), e, now); return { s: r.status, j: await r.json() } };
async function monter(e, pers = ["p1"], extra = {}) { const m = (await ap(e, "POST", "/medias", { droitsFichier: true, personnes: pers, permissions: { stockage: true }, ...extra })).j; return m }
const inviter = async (e, m, pid) => (await ap(e, "POST", `/medias/${m.id}/invitations`, { personneId: pid }, m.jetonProprietaire)).j.jetonInvitation;
const accepter = (e, t, o = {}) => ap(e, "POST", "/invitations/accepter", { jeton: t, purposes: ["upscaling"], majeur: true, lu: true, ...o });

test("parcours complet : deux personnes, accord partiel puis complet ; téléversement toujours refusé", async () => {
  const e = env(), m = await monter(e, ["p1", "p2"]), t1 = await inviter(e, m, "p1"), t2 = await inviter(e, m, "p2");
  assert.equal((await accepter(e, t1)).j.etat, "accord_partiel"); assert.equal((await accepter(e, t2)).j.etat, "accord_complet");
  assert.equal((await ap(e, "POST", `/medias/${m.id}/valider`, {}, m.jetonProprietaire)).j.etat, "verification_en_attente");
  const v = (await ap(e, "GET", `/medias/${m.id}/verifier?finalite=upscaling`, null, m.jetonProprietaire)).j; assert.equal(v.envoiPermis, false); assert.ok(v.raisons.some(r => /non autorisé/.test(r)));
  assert.equal((await ap(e, "POST", `/medias/${m.id}/televerser?finalite=upscaling`, {}, m.jetonProprietaire)).s, 403);
});
test("même avec un média « autorisé » et toutes les règles réunies, aucun envoi tant que la collecte est désactivée", async () => {
  const e = env(), m = await monter(e), t = await inviter(e, m, "p1"); await accepter(e, t); e._d.prepare("UPDATE medias SET etat='autorise' WHERE id=?").run(m.id);
  const v = (await ap(e, "GET", `/medias/${m.id}/verifier?finalite=upscaling`, null, m.jetonProprietaire)).j; assert.equal(v.reglesOk, true); assert.equal(v.envoiPermis, false);
  e.COLLECTE_ACTIVE = "1"; assert.equal((await ap(e, "POST", `/medias/${m.id}/televerser?finalite=upscaling`, {}, m.jetonProprietaire)).s, 403);
  assert.equal((await ap(e, "GET", `/medias/${m.id}/verifier?finalite=training`, null, m.jetonProprietaire)).j.reglesOk, false);
});
test("invitation : usage unique, expirée, fausse ; mineur et notice non lue refusés sans rien enregistrer", async () => {
  const e = env(), m = await monter(e), t = await inviter(e, m, "p1");
  assert.equal((await accepter(e, t, { majeur: false })).s, 403); assert.equal((await accepter(e, t, { lu: false })).s, 400); assert.equal((await accepter(e, t, { purposes: ["inconnu"] })).s, 400);
  assert.equal(e._d.prepare("SELECT COUNT(*) c FROM accords").get().c, 0);
  assert.equal((await accepter(e, t)).s, 201); assert.equal((await accepter(e, t)).j.erreur, "invitation déjà utilisée");
  assert.equal((await accepter(e, "0".repeat(64))).s, 403);
  const t2 = await inviter(e, await monter(e), "p1").catch(() => null); const m3 = await monter(e), t3 = await inviter(e, m3, "p1");
  assert.equal((await ap(e, "POST", "/invitations/accepter", { jeton: t3, purposes: ["upscaling"], majeur: true, lu: true }, null, T0 + 8 * 864e5)).j.erreur, "invitation expirée");
  assert.equal((await ap(e, "POST", `/medias/${m3.id}/invitations`, { personneId: "inconnu" }, m3.jetonProprietaire)).s, 400);
});
test("révocation par la personne : immédiate, définitive, réservée au porteur du jeton", async () => {
  const e = env(), m = await monter(e), a = (await accepter(e, await inviter(e, m, "p1"))).j;
  assert.equal((await ap(e, "POST", `/accords/${a.accord}/revoquer`, { jeton: "f".repeat(64) })).s, 403);
  assert.equal((await ap(e, "POST", `/accords/${a.accord}/revoquer`, { jeton: a.jetonRevocation })).s, 200);
  const v = (await ap(e, "GET", `/medias/${m.id}/verifier?finalite=upscaling`, null, m.jetonProprietaire)).j; assert.equal(v.etat, "revoque"); assert.equal(v.reglesOk, false);
  assert.equal((await ap(e, "POST", `/medias/${m.id}/valider`, {}, m.jetonProprietaire)).j.etat, "revoque");
});
test("refus d’une personne ; accès sans jeton ou avec le jeton d’un autre média refusés", async () => {
  const e = env(), m = await monter(e), m2 = await monter(e), t = await inviter(e, m, "p1");
  assert.equal((await ap(e, "POST", "/invitations/refuser", { jeton: t })).j.etat, "refuse");
  for (const tok of [null, m2.jetonProprietaire, "zz"]) { assert.equal((await ap(e, "GET", `/medias/${m.id}/verifier?finalite=upscaling`, null, tok)).s, 403); assert.equal((await ap(e, "DELETE", `/medias/${m.id}`, null, tok)).s, 403) }
});
test("aucun jeton en clair dans la base ; suppression complète ; purge à l’échéance ; registre chaîné intact", async () => {
  const e = env(), m = await monter(e), t = await inviter(e, m, "p1"), a = (await accepter(e, t)).j, dump = () => JSON.stringify(["medias", "personnes", "invitations", "accords", "registre"].map(x => e._d.prepare("SELECT * FROM " + x).all()));
  for (const s of [m.jetonProprietaire, t, a.jetonRevocation]) assert.ok(!dump().includes(s));
  assert.equal((await ap(e, "DELETE", `/medias/${m.id}`, null, m.jetonProprietaire)).j.supprime, true);
  for (const x of ["medias", "personnes", "invitations", "accords"]) assert.equal(e._d.prepare("SELECT COUNT(*) c FROM " + x).get().c, 0);
  const m2 = await monter(e); assert.equal(await purger(e, T0 + 731 * 864e5), 1); assert.equal(e._d.prepare("SELECT COUNT(*) c FROM medias").get().c, 0);
  const reg = e._d.prepare("SELECT * FROM registre ORDER BY n").all().map(r => ({ ...r, donnees: JSON.parse(r.donnees) })); assert.ok(reg.length >= 6); assert.equal((await C.verifierRegistre(reg)).ok, true);
  reg[2].type = "x"; assert.equal((await C.verifierRegistre(reg)).ok, false);
});
test("entrées invalides : identifiants, trop de personnes, corps trop grand, route inconnue, CORS limité au site", async () => {
  const e = env(); assert.equal((await ap(e, "POST", "/medias", { personnes: ["Jean Dupont <a@b.c>"] })).s, 400); assert.equal((await ap(e, "POST", "/medias", { personnes: Array.from({ length: 13 }, (_, i) => "p" + i) })).s, 400);
  assert.equal((await ap(e, "POST", "/medias", { x: "a".repeat(5000) })).s, 413); assert.equal((await ap(e, "GET", "/n-importe")).s, 404);
  const r = await traiter(new Request("https://x/medias", { method: "OPTIONS" }), e); assert.equal(r.headers.get("access-control-allow-origin"), "https://retoucheproai.com");
});
