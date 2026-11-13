/* F32 « Changer de format » — tests des quatre modules de calcul (sans navigateur) :   node --test tests/format.test.mjs
   Données synthétiques à vérité connue : valident les calculs, pas le rendu sur de vraies vidéos (voir tests/format_app.test.mjs et le banc). */
import test from "node:test"; import assert from "node:assert/strict"; import { createRequire } from "module";
const require = createRequire(import.meta.url), FMA = require("../format-analyse.js"), FMD = require("../format-directeur.js"), FMM = require("../format-moteur.js"), FMQ = require("../format-qualite.js");

/* « monde » : une grande image à relief, dans laquelle on découpe des vues de caméra */
const monde = (x, y) => 128 + 42 * Math.sin(x / 9 + y / 23) + 30 * Math.sin(x / 31 - y / 13) + 26 * Math.cos((x * x + y * y) / 9000) + 18 * Math.sin(x / 3.1) * Math.sin(y / 4.3);
const bruit = (x, y, k) => { let h = (x * 374761393 + y * 668265263 + k * 2147483647) | 0; h = (h ^ (h >> 13)) * 1274126177; return ((h ^ (h >> 16)) & 255) / 255 - .5 };
/* vue w×h : pixel (x, y) = monde(D(x, y)) ; D = fonction image → monde ; mobile = carré clair posé à (mx, my) dans l'image */
function vue(w, h, D, o = {}) { const d = new Uint8ClampedArray(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const [X, Y] = D(x, y); let v = monde(X, Y) + (o.bruit ? o.bruit * bruit(x, y, o.k || 0) : 0);
  if (o.mobile && x >= o.mobile[0] && x < o.mobile[0] + o.mobile[2] && y >= o.mobile[1] && y < o.mobile[1] + o.mobile[2]) v = 245; const i = (y * w + x) * 4; d[i] = v; d[i + 1] = v * .9 + 10; d[i + 2] = v * .8 + 20; d[i + 3] = 255 } return d }
const pyr = (d, w, h) => FMA.pyramide(FMA.gris(d, w * h), w, h);
const W = 160, H = 90;

test("FMA.mouvement retrouve un décalage, un zoom et une rotation connus", () => {
  const a = .03, k = 1.04, c = [(W - 1) / 2, (H - 1) / 2], A = vue(W, H, (x, y) => [x + 300, y + 200]);
  const B = vue(W, H, (x, y) => { const xc = x - c[0] - 5, yc = y - c[1] + 3, s = 1 / k; return [s * (Math.cos(a) * xc + Math.sin(a) * yc) + c[0] + 300, s * (-Math.sin(a) * xc + Math.cos(a) * yc) + c[1] + 200] });
  const m = FMA.mouvement(pyr(A, W, H), pyr(B, W, H));   /* B(M·x) ≈ A(x) : M = zoom k, rotation a, décalage (5, −3) */
  assert.ok(Math.abs(Math.hypot(1 + m.a, m.b) - k) < .004, "zoom " + Math.hypot(1 + m.a, m.b)); assert.ok(Math.abs(Math.atan2(m.b, 1 + m.a) - a) < .004, "angle"); assert.ok(Math.abs(m.tx - 5) < .35 && Math.abs(m.ty + 3) < .35, "décalage " + m.tx + " " + m.ty); assert.ok(m.inl > .9);
});
test("FMA.suiveur : plan sur pied avec bruit et sujet mobile → aucune dérive, décor verrouillé", () => {
  const S = FMA.suiveur(W, H), C = [], mouv = [];
  for (let i = 0; i < 120; i++) { const r = S.ajouter(pyr(vue(W, H, (x, y) => [x + 300, y + 200], { bruit: 14, k: i, mobile: [10 + i, 30, 22] }), W, H)); C.push(r.C); mouv.push(r.pas) }
  const d = Math.max(...C.map(M => Math.abs(M[2]) + Math.abs(M[5]) + Math.abs(M[0] - 1) * W)); assert.ok(d < .6, "dérive " + d);
  const R = FMA.resumer({ i0: 0, i1: 120, cadence: 30, aw: W, ah: H, mouv, C, pistes: [] }); assert.equal(R.classe, "fixe"); assert.equal(R.verrou, true); assert.deepEqual(R.M[100], FMA.IDENT);
});
test("FMA.suiveur : panoramique de 0,8 px par image suivi sur 150 images sans accumulation d'erreur", () => {
  const S = FMA.suiveur(W, H), C = [], mouv = []; for (let i = 0; i < 150; i++) { const r = S.ajouter(pyr(vue(W, H, (x, y) => [x + 300 + .8 * i, y + 200], { bruit: 8, k: i }), W, H)); C.push(r.C); mouv.push(r.pas) }
  assert.ok(Math.abs(C[149][2] - .8 * 149) < 1.2, "position finale " + C[149][2] + " (attendu " + .8 * 149 + ")");   /* C : image → première image */
  const R = FMA.resumer({ i0: 0, i1: 150, cadence: 30, aw: W, ah: H, mouv, C, pistes: [] }); assert.equal(R.classe, "panoramique"); assert.ok(Math.abs(R.etendue.x - .8 * 149 / W) < .02);
});
test("FMA.coupures : un changement de plan est trouvé, un mouvement rapide n'en crée pas", () => {
  const e = new Float32Array(90).fill(.03); e[40] = .5; assert.deepEqual(FMA.coupures(e, 30), [0, 40]);
  const r = new Float32Array(90).fill(.22); assert.deepEqual(FMA.coupures(r, 30), [0]);   /* écarts élevés partout = mouvement, pas coupure */
  const sA = FMA.signature(vue(W, H, (x, y) => [x, y]), W, H), sB = FMA.signature(vue(W, H, (x, y) => [x + 2, y]), W, H), sC = FMA.signature(vue(W, H, (x, y) => [x * 3 + 900, y * 3 + 700]).map((v, i) => i % 4 === 0 ? 255 - v : v), W, H);
  assert.ok(FMA.ecartSignature(sA, sB) < .05); assert.ok(FMA.ecartSignature(sA, sC) > .16);
});
test("FMA.bandesNoires et FMA.lisere", () => {
  const w = 96, h = 54, mk = (x0, x1) => { const g = new Float32Array(w * h); for (let y = 0; y < h; y++) for (let x = x0; x < x1; x++) g[y * w + x] = 60 + 100 * ((x + y) % 7) / 7; return g };
  const b = FMA.bandesNoires([mk(12, 84), mk(12, 84)], w, h); assert.ok(Math.abs(b.x - 13 / 96) < .011 && Math.abs(b.w - 70 / 96) < .022, JSON.stringify(b)); assert.deepEqual(FMA.bandesNoires([mk(0, 96)], w, h), { x: 0, y: 0, w: 1, h: 1 });
  const p = Float32Array.from({ length: 200 }, (_, k) => k < 3 ? 6 : 110); assert.equal(FMA.lisere(p, 8), 4); assert.equal(FMA.lisere(Float32Array.from({ length: 200 }, () => 110), 8), 0);
  assert.equal(FMA.lisere(Float32Array.from({ length: 200 }, (_, k) => k < 30 ? 6 : 110), 8), 0, "zone sombre large = décor, pas liseré");
});
test("FMA.suivre : piste continue malgré des repérages manquants ; repérage isolé écarté", () => {
  const R = []; for (let i = 0; i < 60; i += 4) { const B = i === 20 || i === 24 ? [] : [{ x: .1 + i * .008, y: .3, w: .2, h: .5, score: .9, classe: "personne" }]; if (i === 32) B.push({ x: .8, y: .1, w: .1, h: .1, score: .6, classe: "objet" }); R.push({ i, boites: B }) }
  const P = FMA.suivre(R, 0, 60, 30); assert.equal(P.length, 1); assert.equal(P[0].classe, "personne"); assert.ok(P[0].present[22] === 1, "trou comblé"); assert.ok(Math.abs(P[0].x[40] - (.1 + 40 * .008)) < .03);
});

/* ---------- Directeur ---------- */
const piste = (n, f, classe = "personne", poids = .9) => { const T = { classe, poids, x: new Float32Array(n), y: new Float32Array(n), w: new Float32Array(n), h: new Float32Array(n), present: new Uint8Array(n).fill(1), duree: 1 }; for (let j = 0; j < n; j++) { const b = f(j); T.x[j] = b[0]; T.y[j] = b[1]; T.w[j] = b[2]; T.h[j] = b[3] } return T };
const scene = (o = {}) => ({ n: 90, cadence: 30, pistes: [], classe: "fixe", touche: { g: 0, d: 0, h: 0, b: 0 }, bord: { relief: { g: .04, d: .04, h: .04, b: .04 }, activite: { g: 0, d: 0, h: 0, b: 0 } }, reel: { g: 0, d: 0, h: 0, b: 0 }, ...o });
test("FMD.geometrie : cohérence entre zoom, part visible et part couverte", () => {
  const G = FMD.geometrie(4 / 3, 16 / 9); assert.equal(G.axeExt, "x"); assert.ok(Math.abs(G.couv(0) - .75) < 1e-9 && G.vis(0) === 1 && Math.abs(G.vis(1) - .75) < 1e-9 && G.couv(1) === 1);
  for (const z of [0, .25, .5, 1]) assert.ok(Math.abs(G.vis(z) * G.couv(z) - .75) < 1e-9); assert.equal(FMD.geometrie(16 / 9, 9 / 16).axeExt, "y"); assert.ok(FMD.geometrie(1.777, 16 / 9).identique);
});
test("FMD : les décisions suivent le contenu", () => {
  const d = (s, As, At, R = {}) => FMD.deciderScene(s, As, At, { mode: "auto", generateur: "migan", ...R });
  /* 4:3 → 16:9, plan fixe, bords calmes : tout garder et reconstruire les côtés */
  let r = d(scene(), 4 / 3, 16 / 9); assert.equal(r.methode, "extension"); assert.equal(r.z, 0); assert.ok(r.plaque);
  /* même scène en mode Fidélité : rien d'inventé */
  r = d(scene(), 4 / 3, 16 / 9, { mode: "fidelite" }); assert.notEqual(r.fond, "genere"); assert.equal(r.z, 0);
  /* sans modèle de reconstruction : prolongement flou */
  r = d(scene(), 4 / 3, 16 / 9, { generateur: "aucun" }); assert.equal(r.methode, "ambiance");
  /* caméra très mobile : jamais de décor fixe */
  r = d(scene({ classe: "complexe", reel: { g: .9, d: .9, h: 0, b: 0 } }), 4 / 3, 16 / 9); assert.ok(!r.plaque);
  /* panoramique : le décor filmé par les autres images est préféré à l'invention quand le bord est chargé */
  r = d(scene({ classe: "panoramique", reel: { g: .8, d: .8, h: 0, b: 0 }, bord: { relief: { g: .3, d: .3, h: 0, b: 0 }, activite: { g: 0, d: 0, h: 0, b: 0 } } }), 4 / 3, 16 / 9); assert.equal(r.methode, "decor");
  /* 16:9 → 9:16, une personne au centre : on recadre sur elle (au moins en partie), elle reste entière */
  r = d(scene({ pistes: [piste(90, () => [.42, .1, .16, .8])] }), 16 / 9, 9 / 16); assert.ok(r.z >= .5, "z = " + r.z); assert.ok(r.mesures.sujets_perdus < .02);
  /* 16:9 → 9:16, deux personnes aux deux bouts : pas de recadrage pur (il en couperait une) */
  r = d(scene({ pistes: [piste(90, () => [.05, .2, .15, .7]), piste(90, () => [.8, .2, .15, .7])] }), 16 / 9, 9 / 16); assert.ok(r.z < 1); assert.ok(r.mesures.sujets_perdus < .1, "perdus " + r.mesures.sujets_perdus);
  /* 9:16 → 16:9, une personne en pied : on ne la coupe pas */
  r = d(scene({ pistes: [piste(90, () => [.2, .05, .6, .9])] }), 9 / 16, 16 / 9); assert.ok(r.z < .5); assert.ok(r.mesures.sujets_perdus < .25);
  /* choix manuels respectés */
  assert.equal(d(scene(), 4 / 3, 16 / 9, { methode: "recadrage" }).methode, "recadrage"); assert.equal(d(scene(), 4 / 3, 16 / 9, { methode: "bandes" }).methode, "bandes"); assert.equal(d(scene(), 4 / 3, 16 / 9, { fond: "ambiance" }).fond, "ambiance");
  assert.equal(d(scene(), 16 / 9, 16 / 9).methode, "identique");
  /* chaque décision donne ses raisons et ses candidats chiffrés */
  r = d(scene(), 4 / 3, 16 / 9); assert.ok(r.raisons.length && r.candidats.length > 8 && r.candidats.every(c => isFinite(c.cout)));
});
test("FMD.trajectoire : le cadre suit le sujet sans à-coup et l'anticipe", () => {
  const n = 150, P = [piste(n, j => [.05 + .5 * Math.min(1, Math.max(0, (j - 30) / 60)), .2, .14, .6])], t = FMD.trajectoire(P, n, "x", .3164, 30, true);
  let dedans = 0; for (let j = 0; j < n; j++) if (P[0].x[j] >= t.pos[j] - .005 && P[0].x[j] + .14 <= t.pos[j] + .3164 + .005) dedans++; assert.ok(dedans >= n * .97, dedans + "/" + n); assert.ok(t.perte < .02);
  const f = FMQ.fluidite(t.pos, 30, .3164); assert.ok(f.acoup < FMQ.SEUILS.acoup, "à-coup " + f.acoup); assert.ok(t.pos[25] > t.pos[0] - 1e-6 && Math.abs(t.pos[149] - t.pos[120]) < .01, "stable à l'arrivée");
  const fixe = FMD.trajectoire([piste(n, () => [.45, .2, .1, .6])], n, "x", .3164, 30, true); assert.ok(Math.max(...fixe.pos) - Math.min(...fixe.pos) < 1e-4);
});
test("FMD.tailleSortie : jamais plus de pixels que la source n'en apporte ; dimensions paires ; plafond", () => {
  const plan = (z, r, ext) => ({ axeExt: ext, axeRec: ext === "x" ? "y" : "x", vis: Math.pow(r, z), couv: Math.pow(r, 1 - z) });
  let t = FMD.tailleSortie(1440, 1080, 16 / 9, [plan(0, .75, "x")], "auto", 3840); assert.deepEqual(t, { W: 1920, H: 1080 });
  t = FMD.tailleSortie(1080, 1920, 16 / 9, [plan(0, .3164, "x")], "auto", 1920); assert.ok(t.W <= 1920 && t.W % 2 === 0 && t.H % 2 === 0 && Math.abs(t.W / t.H - 16 / 9) < .01);
  t = FMD.tailleSortie(1920, 1080, 9 / 16, [plan(1, .3164, "y")], "auto", 3840); assert.ok(Math.abs(t.H - 1080) <= 2 && Math.abs(t.W - 608) <= 2, JSON.stringify(t));   /* recadrage : la hauteur de la source, pas plus */
  t = FMD.tailleSortie(640, 480, 16 / 9, [plan(0, .75, "x")], "1080", 3840); assert.deepEqual(t, { W: 1920, H: 1080 });
});

/* ---------- Moteur ---------- */
test("FMM : géométrie cohérente (image → sortie directement, ou en passant par la plaque)", () => {
  const sw = 1440, sh = 1080, Wo = 1920, Ho = 1080, plan = { methode: "extension", z: 0, axeExt: "x", axeRec: "y", vis: 1, couv: .75, pos: new Float32Array(3) }, Ms = [[1, 0, 40, 0, 1, 0], [1, 0, 0, 0, 1, 0], [1.02, .01, -55, -.01, 1.02, 6]];
  const P = FMM.plaqueCreer(Ms, plan, sw, sh, Wo, Ho); for (let j = 0; j < 3; j++) { const c = FMM.cadre(plan, j, sw, sh, Wo, Ho), B = FMM.versPlaque(P, Ms[j]), A = FMM.versSortie(P, Ms[j], c);
    for (const [x, y] of [[0, 0], [sw, sh], [300, 900]]) { const [qx, qy] = FMM.app(B, x, y), [ox, oy] = FMM.app(A, qx, qy); assert.ok(Math.abs(ox - (c.k * x + c.ox)) < 1e-6 && Math.abs(oy - (c.k * y + c.oy)) < 1e-6) }
    assert.equal(c.lw, 1440); assert.equal(c.ox, 240) }
  /* la plaque couvre toute la sortie de chaque image */
  for (let j = 0; j < 3; j++) { const c = FMM.cadre(plan, j, sw, sh, Wo, Ho), Ai = FMM.inv(FMM.versSortie(P, Ms[j], c)); for (const [x, y] of [[0, 0], [Wo, 0], [0, Ho], [Wo, Ho]]) { const [qx, qy] = FMM.app(Ai, x, y); assert.ok(qx >= -1 && qy >= -1 && qx <= P.w + 1 && qy <= P.h + 1) } }
  const M = FMM.matSource([1, 0, 2, 0, 1, 0], 160, 120, 1440, 1080); assert.ok(Math.abs(M[2] - 18) < 1e-9 && M[0] === 1);   /* 2 px d'analyse = 18 px source */
});
test("FMM.mosaique : le décor est reconstitué à partir d'un panoramique, le sujet mobile disparaît", () => {
  const echs = []; for (let i = 0; i < 24; i++) echs.push({ rgba: vue(W, H, (x, y) => [x + 300 + 3 * (i - 12), y + 200], { mobile: [20 + 5 * i, 30, 18] }), M: [1, 0, 3 * (i - 12), 0, 1, 0] });
  const m = FMM.mosaique(echs, W, H); assert.equal(m.w, W + 3 * 23); let err = 0, n = 0, clair = 0; for (let y = 4; y < H - 4; y++) for (let x = 4; x < m.w - 4; x++) { const p = y * m.w + x; if (m.n[p] < 5) continue; const v = monde(x + m.x0 + 300, y + m.y0 + 200); err += Math.abs(m.rgb[p * 3] - v); n++; if (m.rgb[p * 3] > 240 && v < 220) clair++ }
  assert.ok(err / n < 4, "écart moyen " + err / n); assert.ok(clair < n * .002, "restes du sujet mobile : " + clair);
  const r = FMM.reelDisponible(m, echs.map(e => e.M), W, H, W / H, 21 / 9); assert.ok(r.g > .3 && r.d > .3 && r.h === 0, JSON.stringify(r));
  assert.deepEqual(FMM.reelDisponible(FMM.mosaique([echs[12]], W, H), [echs[12].M], W, H, W / H, 21 / 9), { g: 0, d: 0, h: 0, b: 0 });
});
test("FMM.plaque : décor net à la définition de sortie, robuste à ce qui passe devant ; besoin, reconstruction bornée, fondu", () => {
  const sw = 160, sh = 120, Wo = 240, Ho = 120, plan = { methode: "extension", z: 0, fond: "genere", axeExt: "x", axeRec: "y", vis: 1, couv: 2 / 3, pos: new Float32Array(9) }, Ms = [], F = [];
  for (let i = 0; i < 9; i++) { const t = 6 * (i - 4); Ms.push([1, 0, t, 0, 1, 0]); F.push(vue(sw, sh, (x, y) => [x + 300 + t, y + 200], { mobile: i === 2 ? [100, 40, 30] : null })) }
  const mos = FMM.mosaique(F.map((rgba, i) => ({ rgba, M: Ms[i] })), sw, sh), P = FMM.plaqueCreer(Ms, plan, sw, sh, Wo, Ho); FMM.plaqueReference(P, mos, sw, sh, sw, sh);
  for (let i = 0; i < 9; i++) { const B = FMM.versPlaque(P, Ms[i]), Bi = FMM.inv(B), im = new Uint8ClampedArray(P.w * P.h * 4);   /* pose l'image dans le repère de la plaque (plus proche voisin) */
    for (let y = 0; y < P.h; y++) for (let x = 0; x < P.w; x++) { const [fx, fy] = FMM.app(Bi, x + .5, y + .5), ix = Math.floor(fx), iy = Math.floor(fy); if (ix < 0 || iy < 0 || ix >= sw || iy >= sh) continue; const s = (iy * sw + ix) * 4, d = (y * P.w + x) * 4; im[d] = F[i][s]; im[d + 1] = F[i][s + 1]; im[d + 2] = F[i][s + 2]; im[d + 3] = 255 }
    FMM.plaqueAccumuler(P, im, B, sw, sh) }
  const geo = { k: P.k, x0: P.x0, y0: P.y0, w: P.w, h: P.h }, fin = FMM.plaqueFinir(P); let err = 0, n = 0, clair = 0;
  for (let y = 2; y < fin.h - 2; y++) for (let x = 2; x < fin.w - 2; x++) { const p = y * fin.w + x; if (!fin.valide[p]) continue; const v = monde((x + .5 + geo.x0) / geo.k + 300 - .5, (y + .5 + geo.y0) / geo.k + 200 - .5); err += Math.abs(fin.rgba[p * 4] - v); n++; if (fin.rgba[p * 4] > 236 && v < 215) clair++ }
  assert.ok(n > .6 * fin.w * fin.h); assert.ok(err / n < 5, "écart moyen " + err / n); assert.ok(clair < n * .004, "restes du sujet mobile : " + clair);
  /* ce qui manque : seulement hors de l'image, seulement dans la sortie */
  const bes = FMM.besoin(geo, Ms, plan, sw, sh, Wo, Ho, 2); let nb = 0; for (const v of bes.carte) nb += v; assert.ok(nb > 0 && nb < bes.carte.length);
  const G = FMM.genPreparer(fin, bes, geo, plan, Wo, Ho, .1, 120), pl = FMM.plumeReel(G, 6); assert.ok(G.couverts > 0 && G.couverts <= G.aFaire);
  for (let i = 0; i < G.w * G.h; i++) if (G.trou[i]) { assert.ok(!G.valide[i]); assert.ok(G.D[i] <= .1 * 120 + 1e-6, "au-delà de la portée") }
  const vus = new Uint8Array(G.w * G.h); for (const f of G.fenetres) { assert.ok(f.x >= 0 && f.y >= 0 && f.x + f.w <= G.w && f.y + f.h <= G.h); const e = FMM.genEntree(G, f); assert.equal(e.rgba.length, f.w * f.h * 4);
    for (let i = 0; i < f.w * f.h; i++) if (e.trou[i]) assert.equal(e.rgba[i * 4 + 3], 255, "trou pré-rempli"); const chw = new Uint8Array(3 * f.w * f.h).fill(77); FMM.genPoser(G, f, chw); for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) vus[(f.y + y) * G.w + f.x + x] = 1 }
  for (let i = 0; i < G.w * G.h; i++) if (G.trou[i]) assert.ok(vus[i], "trou hors de toute fenêtre");
  const g = FMM.genFinir(G); let inv = 0; for (let i = 0; i < G.w * G.h; i++) { if (G.invente[i]) { inv++; assert.equal(g.rgba[i * 4], 77); assert.ok(g.rgba[i * 4 + 3] > 0 || G.D[i] >= G.lim - 1) } else if (!G.valide[i]) assert.equal(g.rgba[i * 4 + 3], 0) } assert.equal(inv, G.couverts);
  assert.ok(pl.some(v => v === 255) && pl.some(v => v === 0));
});
test("FMM.gain et FMM.preRemplir", () => {
  const n = 400, a = new Uint8ClampedArray(n * 4), b = new Uint8ClampedArray(n * 4); for (let i = 0; i < n; i++) { const v = 60 + (i * 37) % 120; b.set([v, v, v, 255], i * 4); a.set([v * 1.2, v * .9, v, 255], i * 4) } for (let i = 0; i < 80; i++) a.set([255, 255, 255, 255], i * 4);   /* 20 % de l'image couverte par autre chose */
  const g = FMM.gain(a, b, n); assert.ok(Math.abs(g[0] - 1.2) < .03 && Math.abs(g[1] - .9) < .03 && Math.abs(g[2] - 1) < .03, g.join()); assert.equal(FMM.gain(a, new Uint8ClampedArray(n * 4), n), null);
  const w = 40, h = 30, r = new Uint8ClampedArray(w * h * 4), t = new Uint8Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; if (x < 12) t[i] = 1; else r.set([200, 100, 50, 255], i * 4) } FMM.preRemplir(r, t, w, h);
  assert.deepEqual([...r.slice(0, 4)], [200, 100, 50, 255]);
});

/* ---------- Contrôle qualité ---------- */
function sortie(w, h, x0, x1, f) { const g = new Float32Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) g[y * w + x] = f(x, y, x >= x0 && x < x1); return g }
test("FMQ.mesurer : raccord, lumière, scintillement, netteté, répétition", () => {
  const w = 192, h = 108, z = { x0: 48, y0: 0, x1: 144, y1: 108 }, propre = sortie(w, h, 48, 144, (x, y) => monde(x * 2, y * 2));
  let m = FMQ.mesurer(propre, propre, w, h, z, "x"); assert.equal(m.cotes, 2); assert.ok(m.raccord < 1.6, "raccord " + m.raccord); assert.ok(m.lumiere < .03); assert.ok(m.scintillement < .01); assert.ok(m.nettete > .7 && m.nettete < 1.4);
  /* marche de luminosité de 35 niveaux au raccord, sur une image au relief modéré (cas d'une vraie vidéo) */
  const doux = (x, y) => 128 + .3 * (monde(x * 2, y * 2) - 128), saut = sortie(w, h, 48, 144, (x, y, dedans) => doux(x, y) + (dedans ? 0 : 35)); m = FMQ.mesurer(saut, null, w, h, z, "x"); assert.ok(m.raccord > FMQ.SEUILS.raccord, "raccord " + m.raccord); assert.ok(Math.abs(m.lumiere - 35 / 255) < .03);
  assert.ok(FMQ.mesurer(sortie(w, h, 48, 144, doux), null, w, h, z, "x").raccord < 1.6);
  const tremble = sortie(w, h, 48, 144, (x, y, dedans) => monde(x * 2, y * 2) + (dedans ? 0 : 30 * bruit(x, y, 9))); m = FMQ.mesurer(tremble, propre, w, h, z, "x"); assert.ok(m.scintillement > FMQ.SEUILS.scintillement, "scintillement " + m.scintillement);
  const flou = sortie(w, h, 48, 144, (x, y, dedans) => dedans ? monde(x * 2, y * 2) : 120 + x * .1); m = FMQ.mesurer(flou, null, w, h, z, "x"); assert.ok(m.nettete < .2);
  const motif = sortie(w, h, 48, 144, (x, y, dedans) => dedans ? monde(x * 2, y * 2) : 128 + 60 * Math.sin(x * 2 * Math.PI / 12)); m = FMQ.mesurer(motif, null, w, h, z, "x"); assert.ok(m.repetition > FMQ.SEUILS.repetition, "répétition " + m.repetition);
  assert.ok(FMQ.mesurer(propre, null, w, h, z, "x").repetition < FMQ.SEUILS.repetition);
  m = FMQ.mesurer(sortie(108, 192, 0, 0, (x, y) => monde(x * 2, y * 2)), null, 108, 192, { x0: 0, y0: 48, x1: 108, y1: 144 }, "y"); assert.equal(m.cotes, 2); assert.ok(m.raccord < 1.6);
});
test("FMQ.bilan : la correction proposée correspond au défaut mesuré ; contrôle du fichier", () => {
  const ok = { cotes: 2, raccord: 1, lumiere: .02, scintillement: .3, nettete: .6, repetition: .2 }, plan = { methode: "extension", z: 0, fond: "genere", vis: 1, mesures: { sujets_perdus: 0 }, pos: new Float32Array(30) };
  let b = FMQ.bilan([ok, ok, ok], plan, 30); assert.ok(b.ok && !b.action); assert.ok(b.controles.find(c => c.code === "nettete").info);
  b = FMQ.bilan([{ ...ok, scintillement: 3 }, { ...ok, scintillement: 3 }], plan, 30); assert.equal(b.action, "ambiance"); assert.ok(!b.ok);
  b = FMQ.bilan([{ ...ok, lumiere: .2 }], plan, 30); assert.equal(b.action, "lumiere"); b = FMQ.bilan([{ ...ok, raccord: 5 }], plan, 30); assert.equal(b.action, "plume");
  b = FMQ.bilan([{ ...ok, lumiere: .2, raccord: 5 }], { ...plan, fond: "ambiance" }, 30); assert.ok(b.ok, "un prolongement flou n'a pas de raccord net à juger");
  b = FMQ.bilan([], { methode: "recadrage", z: 1, fond: "aucun", vis: .3, mesures: { sujets_perdus: .3 }, pos: Float32Array.from({ length: 30 }, (_, j) => j % 2 ? .5 : 0) }, 30); assert.ok(!b.ok); assert.ok(b.controles.find(c => c.code === "sujets" && !c.ok)); assert.ok(b.controles.find(c => c.code === "fluidite" && !c.ok));
  assert.ok(FMQ.fichier({ w: 1920, h: 1080, duree: 10, cadence: 30, son: true }, { w: 1920, h: 1080, duree: 10.03, son: true }).ok); assert.ok(!FMQ.fichier({ w: 1920, h: 1080, duree: 10, cadence: 30, son: true }, { w: 1920, h: 1080, duree: 8, son: true }).ok); assert.ok(!FMQ.fichier({ w: 1920, h: 1080, duree: 10, cadence: 30, son: true }, { w: 1280, h: 720, duree: 10, son: true }).ok);
  const a = new Uint8ClampedArray(64).fill(100), c = new Uint8ClampedArray(64).fill(102); assert.ok(Math.abs(FMQ.psnr(a, c, 4, { x0: 0, y0: 0, x1: 4, y1: 4 }) - 42.11) < .1);
});
