/* v8.5 « Fidèle » (conversion sans génération) — tests du calcul pur FFI :   node --test tests/format_fidele_calcul.test.mjs */
import test from "node:test"; import assert from "node:assert/strict"; import { createRequire } from "module";
const require = createRequire(import.meta.url), FFI = require("../format-fidele.js");
const somme = (s, c) => s.reduce((a, v, i) => a + v * c[i], 0);

test("sans sujet ni détail : étirement réparti, longueur voulue atteinte exactement", () => {
  const n = 60, B = FFI.bornes(600, n), c = FFI.largeurs(B), imp = new Float32Array(n).fill(.5), prot = new Uint8Array(n);
  const r = FFI.resoudre(imp, prot, c, 720, Infinity); assert.ok(r.plein); assert.ok(Math.abs(somme(r.s, c) - 720) < 1e-3, "longueur " + somme(r.s, c));
  assert.ok(Math.max(...r.s) - Math.min(...r.s) < .02, "étirement uniforme attendu " + Math.min(...r.s) + "…" + Math.max(...r.s));
});
test("colonnes protégées : s = 1 EXACTEMENT, le fond prend tout l'étirement", () => {
  const n = 80, B = FFI.bornes(800, n), c = FFI.largeurs(B), imp = new Float32Array(n).fill(.3), prot = new Uint8Array(n); prot.fill(1, 30, 50);
  const r = FFI.resoudre(imp, prot, c, 1000, Infinity); for (let i = 30; i < 50; i++) assert.equal(r.s[i], 1);
  assert.ok(Math.abs(somme(r.s, c) - 1000) < 1e-3); assert.ok(r.s[5] > 1.2 && r.s[75] > 1.2);
});
test("zone unie étirée davantage qu'une zone détaillée", () => {
  const n = 40, B = FFI.bornes(400, n), c = FFI.largeurs(B), I = FFI.importance({ n, energie: Float32Array.from({ length: n }, (_, i) => i < 20 ? 2 : 40), mouvement: new Float32Array(n), boites: [] });
  const r = FFI.resoudre(I.imp, I.prot, c, 440, Infinity); assert.ok(r.s[5] > r.s[35] + .05, r.s[5] + " vs " + r.s[35]);
});
test("plafond atteint : remplissage partiel, rien au-delà du plafond, aucun sujet touché", () => {
  const n = 54, B = FFI.bornes(1080, n), c = FFI.largeurs(B), I = FFI.importance({ n, energie: new Float32Array(n).fill(5), boites: [{ a: .4, b: .6, classe: "visage" }] });
  const T = 1920 * 16 / 9, r = FFI.resoudre(I.imp, I.prot, c, T, 1.1); assert.equal(r.plein, false);
  for (let i = 0; i < n; i++) { assert.ok(r.s[i] <= 1.1 + 1e-9); if (I.prot[i]) assert.equal(r.s[i], 1) }
});
test("carte entière : une colonne à s = 1 garde exactement sa largeur (copie pixel pour pixel), carte croissante", () => {
  const n = 90, B = FFI.bornes(1080, n), c = FFI.largeurs(B), I = FFI.importance({ n, energie: Float32Array.from({ length: n }, (_, i) => 3 + (i % 7)), boites: [{ a: .3, b: .55, classe: "personne" }] });
  const r = FFI.resoudre(I.imp, I.prot, c, 1250, Infinity), D = FFI.carte(B, r.s, 1, 37.3);
  for (let i = 0; i < n; i++) { assert.ok(D[i + 1] >= D[i]); if (r.s[i] === 1) assert.equal(D[i + 1] - D[i], B[i + 1] - B[i]) }
  assert.ok(Math.abs(D[n] - D[0] - 1250) <= 1);
});
test("douceur : pas de cassure entre colonnes voisines", () => {
  const n = 90, B = FFI.bornes(1080, n), c = FFI.largeurs(B), I = FFI.importance({ n, energie: Float32Array.from({ length: n }, (_, i) => i % 9 < 4 ? 2 : 30), boites: [{ a: .45, b: .55, classe: "visage" }] });
  const r = FFI.resoudre(I.imp, I.prot, c, 1180, 1.1), m = FFI.mesurer(r.s, c, I.imp, I.prot, 1180); assert.ok(m.saut <= .041, "saut " + m.saut);
});
test("9:16 → 16:9 : la contradiction est mesurée, jamais masquée", () => {
  const n = 90, P = { n, energie: Float32Array.from({ length: n }, (_, i) => 4 + 20 * Math.abs(Math.sin(i / 6))), mouvement: new Float32Array(n), boites: [{ a: .35, b: .65, classe: "personne" }, { a: .42, b: .58, classe: "visage" }] };
  const T = 1920 * 16 / 9, R = FFI.variantes(P, 1080, 1920, T), V = R.variantes;
  assert.ok(Math.abs(V.exact.mesures.remplissage - 1080 / T) < 1e-6);
  assert.ok(V.fidele.mesures.remplissage > V.exact.mesures.remplissage && V.fidele.mesures.remplissage < .37, "fidèle " + V.fidele.mesures.remplissage);
  assert.equal(V.fidele.mesures.visible, false); assert.equal(V.fidele.mesures.etirementProtege, 1); assert.equal(V.fidele.mesures.conservation, 1);
  assert.ok(V.uniforme.mesures.etirementMax > 3.1 && V.uniforme.mesures.visible); assert.ok(Math.abs(V.recadrage.mesures.conservation - 1080 / T) < 1e-6 && V.recadrage.mesures.visible);
  assert.ok(V.total.mesures.remplissage > .999 && V.total.mesures.etirementProtege === 1 && V.total.mesures.visible);
  assert.equal(FFI.choisir(V).id, "fidele"); assert.match(FFI.decrire(V.exact), /100 % de l’image gardée/);
});
test("4:3 → 16:9 avec fond uni et une personne au centre : remplissage total sans toucher la personne", () => {
  const n = 64, P = { n, energie: Float32Array.from({ length: n }, (_, i) => i > 24 && i < 40 ? 30 : 2), boites: [{ a: .4, b: .6, classe: "personne" }] }, T = 480 * 16 / 9, V = FFI.variantes(P, 640, 480, T).variantes;
  assert.ok(V.total.mesures.remplissage > .999, "total " + V.total.mesures.remplissage); assert.equal(V.total.mesures.etirementProtege, 1);
  assert.ok(V.accru.mesures.remplissage > V.fidele.mesures.remplissage && V.accru.mesures.etirementMax <= 1.35 + 1e-9);
});
test("etirementSous : renvoie l'étirement maximal sous une boîte", () => {
  const B = FFI.bornes(100, 10), s = Float32Array.from([1, 1, 1.2, 1.3, 1, 1, 1, 1, 1.05, 1]);
  assert.equal(FFI.etirementSous(B, s, .41, .79), 1); assert.ok(Math.abs(FFI.etirementSous(B, s, .25, .45) - 1.3) < 1e-6);
});
