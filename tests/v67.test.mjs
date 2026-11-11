/* v6.7 : tests RÉELS (calculs sur images de synthèse, pas de vérification de textes) — node tests/v67.test.mjs */
import { createRequire } from "node:module"; import test from "node:test"; import assert from "node:assert/strict";
const require = createRequire(import.meta.url), A = require("../analyse.js"), C = require("../contribution.js");

/* image « naturelle » de synthèse : dégradés + formes + grain fin, déterministe */
function scene(w = 192, h = 144) {
  let s = 12345; const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4; let v = 70 + 90 * (x / w) + 30 * Math.sin(y / 9) + ((Math.floor((x + 3) / 20) + Math.floor((y + 3) / 20)) & 1 ? 25 : -25);
    if ((x - 60) ** 2 + (y - 70) ** 2 < 900) v = 205; if (x > 130 && y > 90) v = 28;
    const g = (rnd() - .5) * 22; d[i] = v + g + 6 * Math.sin(x / 5); d[i + 1] = v + g; d[i + 2] = v + g - 6 * Math.sin(x / 5); d[i + 3] = 255;
  }
  return { d, w, h };
}
const map = ({ d, w, h }, f) => { const o = new Uint8ClampedArray(d.length); for (let i = 0; i < d.length; i += 4) { const q = f(d[i], d[i + 1], d[i + 2], (i / 4) % w, Math.floor(i / 4 / w)); o[i] = q[0]; o[i + 1] = q[1]; o[i + 2] = q[2]; o[i + 3] = 255 } return { d: o, w, h } };
function flou({ d, w, h }, r) { const o = new Uint8ClampedArray(d.length); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++) { let s = 0, n = 0; for (let j = -r; j <= r; j++) for (let k = -r; k <= r; k++) { const X = x + k, Y = y + j; if (X < 0 || Y < 0 || X >= w || Y >= h) continue; s += d[(Y * w + X) * 4 + c]; n++ } o[(y * w + x) * 4 + c] = s / n; o[(y * w + x) * 4 + 3] = 255 } return { d: o, w, h } }
function blocs({ d, w, h }) { const o = new Uint8ClampedArray(d.length); for (let by = 0; by < h; by += 8) for (let bx = 0; bx < w; bx += 8) for (let c = 0; c < 3; c++) { let s = 0, n = 0; for (let y = by; y < Math.min(h, by + 8); y++) for (let x = bx; x < Math.min(w, bx + 8); x++) { s += d[(y * w + x) * 4 + c]; n++ } const m = s / n; for (let y = by; y < Math.min(h, by + 8); y++) for (let x = bx; x < Math.min(w, bx + 8); x++) { const i = (y * w + x) * 4; o[i + c] = m + (d[i + c] - m) * .25; o[i + 3] = 255 } } return { d: o, w, h } }
const M = im => A.mesurer(im.d, im.w, im.h), cat = (im, c) => (A.detecter(M(im)).find(x => x.categorie.startsWith(c)) || { confiance: 0 }).confiance;
const S = scene();

test("image neutre : aucun filtre détecté avec confiance forte", () => { assert.equal(A.detecter(M(S)).filter(x => x.confiance >= .5).length, 0) });
test("filtre chaud détecté, et plus sûrement que sur l’image neutre", () => { const c = map(S, (r, g, b) => [r * 1.25, g, b * .7]); assert.ok(cat(c, "dominante") >= .5); assert.ok(cat(S, "dominante") < .3); assert.equal(M(c).canalFort, "rouge") });
test("noir et blanc : détecté et déclaré irréversible", () => { const n = map(S, (r, g, b) => { const y = .299 * r + .587 * g + .114 * b; return [y, y, y] }); const x = A.detecter(M(n)).find(x => x.categorie.startsWith("noir et blanc")); assert.ok(x && x.confiance >= .5); assert.equal(x.reversible, "non") });
test("effet rétro (noirs relevés) détecté", () => { assert.ok(cat(map(S, (r, g, b) => [45 + r * .7, 45 + g * .7, 45 + b * .7]), "voile") >= .5); assert.ok(cat(S, "voile") < .5) });
test("hautes lumières écrêtées détectées", () => { assert.ok(cat(map(S, (r, g, b) => [r * 2.2, g * 2.2, b * 2.2]), "hautes lumières") >= .5) });
test("vignettage détecté", () => { const v = map(S, (r, g, b, x, y) => { const k = 1 - .85 * (((x / S.w - .5) ** 2 + (y / S.h - .5) ** 2) * 2); return [r * k, g * k, b * k] }); assert.ok(cat(v, "vignettage") >= .5); assert.ok(cat(S, "vignettage") < .3) });
test("état : flou et compression mesurés, absents de l’image d’origine", () => { const e0 = A.etat(M(S)), ef = A.etat(M(flou(S, 3))), eb = A.etat(M(blocs(S))); assert.ok(ef.flou > e0.flou && ef.flou >= .5); assert.ok(eb.compression > e0.compression && eb.compression >= .5); assert.ok(e0.compression < .3) });
test("mode Fidélité : n’applique jamais une étape générative de retrait ; Reconstruction la signale", () => {
  const n = M(map(S, (r, g, b) => { const y = .299 * r + .587 * g + .114 * b; return [y, y, y] }));
  const pf = A.plan(n, "fidelite"), pr = A.plan(n, "reconstruction");
  assert.ok(pf.ignoresEnFidelite.length >= 1); assert.ok(!pf.etapes.some(e => e.pourquoi.startsWith("noir et blanc")));
  assert.ok(pr.etapes.some(e => e.pourquoi.startsWith("noir et blanc") && e.genere === true)); assert.ok(pf.nonDetecteAutomatiquement.length >= 3);
});
test("cibles : ratio, parité, étiquettes honnêtes pour 144p→4K", () => {
  for (const [w, h] of [[256, 144], [426, 240], [640, 360], [854, 480], [1280, 720], [1920, 1080], [144, 256], [1080, 1920]]) for (const c of A.cibles(w, h, { video: true })) {
    if (c.deja) continue; assert.equal(c.largeur % 2, 0); assert.equal(c.hauteur % 2, 0);
    assert.ok(Math.abs(c.largeur / c.hauteur - w / h) < .012, `${w}x${h}→${c.largeur}x${c.hauteur}`); assert.ok(Math.min(c.largeur, c.hauteur) >= 720);
  }
  const k = A.cibles(256, 144, { video: true })[2]; assert.equal(k.hauteur, 2160); assert.equal(k.facteur, 15); assert.match(k.etiquette, /générés/); assert.ok(k.avertissement && k.conseil); assert.match(k.nomExport, /reconstruite par IA/);
  assert.equal(A.cibles(3840, 2160).every(c => c.deja), true); assert.equal(A.cibleAuto(640, 360).hauteur, 1080); { const a = A.cibleAuto(256, 144); assert.equal(a.hauteur, 720); assert.ok(a.avertissement); assert.equal(A.cibleAuto(3840, 2160), null) }
  assert.equal(A.cibles(1080, 1920)[2].largeur, 2160);
});
test("tuiles : couverture complète, dans l’image, budget mémoire respecté", () => {
  for (const [w, h, e, b] of [[640, 360, 4, 64], [1920, 1080, 2, 48], [257, 131, 4, 32], [50, 40, 4, 64], [1280, 720, 3, 16]]) {
    const t = A.tuiles(w, h, e, b), cov = new Uint8Array(w * h);
    for (const q of t.liste) { assert.ok(q.x >= 0 && q.y >= 0 && q.x + q.w <= w && q.y + q.h <= h); for (let y = q.y; y < q.y + q.h; y++) cov.fill(1, y * w + q.x, y * w + q.x + q.w) }
    assert.ok(cov.every(v => v === 1), `trou ${w}x${h}`); if (t.cote > 64) assert.ok(t.memoireMo <= b + .1);
  }
});
test("scintillement : mesuré, coupes de scène exclues ; lissage des gains le réduit", () => {
  const stable = Array.from({ length: 60 }, (_, i) => .5 + .0005 * i), flick = stable.map((v, i) => v + (i % 2 ? .03 : -.03)), coupe = stable.map((v, i) => i < 30 ? v : v - .3);
  assert.equal(A.scintillement(stable).verdict, "stable"); assert.equal(A.scintillement(flick).verdict, "scintillement visible");
  const c = A.scintillement(coupe); assert.deepEqual(c.coupes, [30]); assert.equal(c.verdict, "stable");
  const g = flick.map(v => .5 / v), gl = A.lisserGains(g, []); assert.ok(A.scintillement(gl).score < A.scintillement(g).score / 3);
  const gc = A.lisserGains([1, 1, 1, 2, 2, 2], [3]); assert.deepEqual(gc, [1, 1, 1, 2, 2, 2]);
});
test("profil X : limites documentées appliquées", () => {
  const p = A.profilX(3840, 2160, 120, 30, false); assert.deepEqual([p.largeur, p.hauteur, p.fps], [1280, 720, 60]); assert.ok(p.debitVideo >= 5e6 && p.debitVideo <= 25e6); assert.equal(p.avertissements.length, 2);
  const q = A.profilX(1080, 1920, 30, 30, true); assert.deepEqual([q.largeur, q.hauteur], [1080, 1920]); assert.equal(q.avertissements.length, 0);
  assert.ok(A.profilX(4000, 1000, 30, 10).avertissements.some(a => /allongé/.test(a))); assert.ok(A.profilX(1280, 720, 30, 1500).avertissements.some(a => /Durée/.test(a)));
});

/* ---------- contribution ---------- */
const now = 1_800_000_000_000, acc = (o = {}) => ({ personneId: "p1", mediaId: "m1", purposes: ["upscaling"], majeur: true, notice: C.VERSION_NOTICE, ...o });
const med = (o = {}) => ({ id: "m1", droitsFichier: true, personnes: ["p1"], etat: "autorise", permissions: { stockage: true }, ...o });
const ok = (m, a, f = "upscaling", o = {}) => C.verifier(m, a, f, { maintenant: now, ...o });
test("verrou : tout réuni → règles OK, mais envoi toujours interdit tant que la collecte est désactivée", () => { const r = ok(med(), [acc()]); assert.equal(r.reglesOk, true); assert.equal(C.DISTANT_ACTIF, false); assert.equal(r.envoiPermis, false) });
test("verrou : chaque autorisation manquante bloque", () => {
  assert.equal(ok(med(), []).reglesOk, false);                                              // aucun accord
  assert.equal(ok(med(), [acc()], "training").reglesOk, false);                             // finalité non accordée (pas de déduction)
  assert.equal(ok(med({ personnes: ["p1", "p2"] }), [acc()]).reglesOk, false);              // 2e personne sans accord
  assert.equal(ok(med(), [acc({ revoked: true })]).reglesOk, false);                        // révoqué
  assert.equal(ok(med(), [acc({ expire: now - 1 })]).reglesOk, false);                      // expiré
  assert.equal(ok(med(), [acc({ notice: "2020-01-01" })]).reglesOk, false);                 // ancienne notice
  assert.equal(ok(med(), [acc({ majeur: false })]).reglesOk, false);                        // mineur
  assert.equal(ok(med({ mineurPresent: true }), [acc()]).reglesOk, false);
  assert.equal(ok(med({ droitsFichier: false }), [acc()]).reglesOk, false);
  assert.equal(ok(med({ tiersProteges: true }), [acc()]).reglesOk, false);
  assert.equal(ok(med({ personnesInconnues: true }), [acc()]).reglesOk, false);
  assert.equal(ok(med({ etat: "accord_complet" }), [acc()]).reglesOk, false);
  assert.equal(ok(med({ etat: "revoque" }), [acc()]).reglesOk, false);
  assert.equal(ok(med(), [acc()], "upscaling", { permissions: ["stockage", "publication_exemples"] }).reglesOk, false);
  assert.equal(ok(med(), [acc({ mediaId: "autre" })]).reglesOk, false);                     // accord donné pour un autre média
});
test("cycle de vie : transitions permises seulement ; révocation sans retour ; historique tenu", () => {
  let c = { etat: "brouillon" }; for (const e of ["invitation_envoyee", "accord_complet", "verification_en_attente", "autorise", "revoque", "exclusion_dataset_en_attente", "exclu_dataset", "supprime"]) c = C.transition(c, e, now, "test");
  assert.equal(c.historique.length, 8); assert.throws(() => C.transition({ etat: "revoque" }, "autorise")); assert.throws(() => C.transition({ etat: "brouillon" }, "autorise")); assert.throws(() => C.transition({ etat: "supprime" }, "brouillon"));
  for (const e of C.ETATS) assert.ok(e === "supprime" || C.ETATS.some(v => C.peut(e, v)), e);
});
test("invitation : usage unique, expiration, jeton faux, jeton absent du registre", async () => {
  const { jeton, enregistrement: e } = await C.creerInvitation("m1", "p1", 1000, now); assert.ok(!JSON.stringify(e).includes(jeton));
  const v = await C.validerInvitation(e, jeton, now + 10); assert.equal(v.ok, true);
  assert.equal((await C.validerInvitation(v.enregistrement, jeton, now + 20)).raison, "invitation déjà utilisée");
  assert.equal((await C.validerInvitation(e, jeton, now + 1000)).raison, "invitation expirée");
  assert.equal((await C.validerInvitation(e, "0".repeat(64), now)).ok, false); assert.equal((await C.validerInvitation(e, "x", now)).ok, false);
  assert.notEqual((await C.creerInvitation("m1", "p1")).jeton, jeton);
});
test("registre chaîné : toute modification ultérieure est détectée", async () => {
  let r = []; for (const t of ["accord", "revocation", "suppression"]) r = await C.ajouterAuRegistre(r, { type: t, quand: now, donnees: { p: "p1" } });
  assert.equal((await C.verifierRegistre(r)).ok, true);
  const f = r.map(x => ({ ...x, donnees: { ...x.donnees } })); f[1].type = "accord"; assert.deepEqual(await C.verifierRegistre(f), { ok: false, ligne: 1 });
  assert.equal((await C.verifierRegistre([r[0], r[2]])).ok, false);
});
test("métadonnées sensibles retirées (GPS, appareil, auteur, dates, nom de fichier)", () => {
  const { meta, retire } = C.minimiserMeta({ GPSLatitude: 48.5, GPSLongitude: 7.7, Make: "Apple", Model: "iPhone", Artist: "x", DateTimeOriginal: "2026", FileName: "a.mp4", width: 640, height: 360, fps: 30 });
  assert.deepEqual(meta, { width: 640, height: 360, fps: 30 }); assert.equal(retire.length, 7);
});
