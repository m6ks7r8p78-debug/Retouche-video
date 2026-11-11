/* v6.8 : repérage du visage (YuNet), zones de filtre AR proposées, suivi vidéo.  node tests/visage.test.mjs
   Mesures réelles dans Chromium sur tests/medias/ref_visage.png ; les accessoires sont DESSINÉS par le test (aucune photo
   réelle sous filtre n’est disponible ici) : ces résultats ne valent donc pas mesure sur de vrais filtres de réseaux sociaux. */
import { spawn } from "child_process"; import path from "path"; import { fileURLToPath } from "url";
const { chromium } = await import(process.env.PW || "playwright");
const HERE = path.dirname(fileURLToPath(import.meta.url)), PORT = 8793;
const srv = spawn(process.execPath, [path.join(HERE, "serveur.mjs")], { env: { ...process.env, PORT }, stdio: "ignore" }); await new Promise(r => setTimeout(r, 600));
const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ["--use-angle=swiftshader"] });
const p = await b.newPage(); const errs = []; p.on("pageerror", e => errs.push(e.message));
await p.goto("http://localhost:" + PORT + "/index.html"); await p.waitForFunction(() => window.VISAGE && window.MODELS);
const res = []; const test = async (n, f) => { let ok = false, info = ""; try { const r = await f(); ok = r.ok; info = r.info } catch (e) { info = "exception : " + e.message.split("\n")[0] } res.push(ok); console.log((ok ? "✓ " : "✗ ") + n + " — " + info) };

await p.evaluate(async () => {
  const im = new Image(); im.src = "tests/medias/ref_visage.png"; await im.decode(); window.IM = im;
  window.toile = (dessin, rot) => { const c = document.createElement("canvas"); c.width = im.width; c.height = im.height; const x = c.getContext("2d");
    if (rot) { x.translate(c.width / 2, c.height / 2); x.rotate(rot); x.translate(-c.width / 2, -c.height / 2) } x.drawImage(im, 0, 0); if (dessin) dessin(x); return c };
  window.F0 = (await VISAGE.detecter(im, im.width, im.height))[0]; window.R0 = VISAGE.repere(F0);
  window.pt = (a, b) => [R0.ox + (a * R0.ux + b * R0.vx) * R0.d, R0.oy + (a * R0.uy + b * R0.vy) * R0.d];
  /* accessoires type « filtre chien » : truffe, deux oreilles, langue ; et lunettes */
  window.chien = x => { const d = R0.d, e = (a, b, ra, rb, col) => { const [cx, cy] = pt(a, b); x.fillStyle = col; x.beginPath(); x.ellipse(cx, cy, ra * d, rb * d, 0, 0, 7); x.fill() };
    e(R0.nez[0], R0.nez[1], .36, .3, "#2b1a12"); e(-.95, -1.8, .5, .6, "#8a5a2b"); e(.95, -1.8, .5, .6, "#8a5a2b"); e(R0.bouche[0], R0.bouche[1] + .5, .32, .4, "#e8456b") };
  window.lunettes = x => { const d = R0.d; x.fillStyle = "#101014"; for (const s of [-1, 1]) { const [cx, cy] = pt(.5 * s, .02); x.beginPath(); x.ellipse(cx, cy, .5 * d, .36 * d, 0, 0, 7); x.fill() } const [a, b2] = pt(-1.2, -.05); x.fillRect(a, b2, 2.4 * d, .1 * d) };
  window.conf = (r, re) => { const z = r.propositions[0] && r.propositions[0].zones.find(z => re.test(z.nom)); return z ? z.confiance : -1 };
});

await test("Modèle livré : empreinte vérifiée, un visage trouvé avec ses 5 repères", () => p.evaluate(async () => {
  const F = await VISAGE.detecter(IM, IM.width, IM.height), f = F[0], dans = f && f.pts.every((v, i) => v > 0 && v < (i % 2 ? IM.height : IM.width));
  const yeuxAuDessus = f && f.pts[1] < f.pts[5] && f.pts[3] < f.pts[5] && f.pts[5] < f.pts[7];
  return { ok: F.length === 1 && f.score > .8 && dans && yeuxAuDessus, info: F.length + " visage, confiance " + (f && f.score) + ", boîte " + Math.round(f.w) + "×" + Math.round(f.h) } }));
await test("Image sans visage : rien de détecté, rien de proposé", () => p.evaluate(async () => {
  const c = document.createElement("canvas"); c.width = 400; c.height = 300; const x = c.getContext("2d"); const g = x.createLinearGradient(0, 0, 400, 300); g.addColorStop(0, "#27a"); g.addColorStop(1, "#dc8"); x.fillStyle = g; x.fillRect(0, 0, 400, 300);
  const r = await VISAGE.proposer(c, 400, 300); return { ok: r.visages === 0 && r.propositions.length === 0, info: r.visages + " visage" } }));
await test("Photo sans filtre : aucune zone proposée avec confiance ≥ 50 %", () => p.evaluate(async () => {
  const r = await VISAGE.proposer(IM, IM.width, IM.height), z = r.propositions[0].zones, fortes = z.filter(z => z.confiance >= .5);
  return { ok: fortes.length === 0, info: z.map(z => z.nom.split(" ")[0] + " " + Math.round(z.part * 100) + "%→" + z.confiance).join(", ") } }));
await test("Accessoires de filtre dessinés (truffe, 2 oreilles, langue) : les 4 zones sont proposées, pas les autres", () => p.evaluate(async () => {
  const c = toile(chien), r = await VISAGE.proposer(c, c.width, c.height), v = [/nez/, /haut à gauche/, /haut à droite/, /bouche/].map(re => conf(r, re)), faux = [/lunettes/, /joue gauche/, /joue droite/].map(re => conf(r, re));
  return { ok: v.every(x => x >= .5) && faux.every(x => x < .5), info: "proposées " + v.join("/") + " ; non proposées " + faux.join("/") } }));
await test("Lunettes dessinées : zone des yeux proposée", () => p.evaluate(async () => { const c = toile(lunettes), r = await VISAGE.proposer(c, c.width, c.height); return { ok: conf(r, /lunettes/) >= .5 && conf(r, /nez/) < .5, info: "lunettes " + conf(r, /lunettes/) + ", nez " + conf(r, /nez/) } }));
await test("Masque proposé : couvre la truffe dessinée (≥ 90 %) sans déborder sur tout le visage", () => p.evaluate(async () => {
  const c = toile(chien), r = await VISAGE.proposer(c, c.width, c.height), m = r.propositions[0].zones.find(z => /nez/.test(z.nom)).masque, d = R0.d, [cx, cy] = pt(R0.nez[0], R0.nez[1]);
  let dedans = 0, tot = 0, surf = 0; for (const v of m.sel) surf += v;
  for (let y = Math.floor(cy - .3 * d); y <= cy + .3 * d; y++) for (let x = Math.floor(cx - .36 * d); x <= cx + .36 * d; x++) { if (((x - cx) / (.36 * d)) ** 2 + ((y - cy) / (.3 * d)) ** 2 > .9) continue; tot++; const ix = x - m.x, iy = y - m.y; if (ix >= 0 && iy >= 0 && ix < m.w && iy < m.h && m.sel[iy * m.w + ix]) dedans++ }
  return { ok: dedans / tot >= .9 && surf < F0.w * F0.h * .25, info: Math.round(100 * dedans / tot) + " % de la truffe couverte, masque = " + Math.round(100 * surf / (F0.w * F0.h)) + " % du visage" } }));
await test("Tête penchée de 20° : visage retrouvé et truffe toujours proposée", () => p.evaluate(async () => {
  const c = toile(chien, .35), r = await VISAGE.proposer(c, c.width, c.height); return { ok: r.visages >= 1 && conf(r, /nez/) >= .5, info: r.visages + " visage, nez " + conf(r, /nez/) } }));
await test("Suivi : visage qui se déplace sur 24 images, trou de 3 images comblé, tremblement réduit", () => p.evaluate(async () => {
  const P = [], W = 640, H = 640; for (let i = 0; i < 24; i++) { const c = document.createElement("canvas"); c.width = W; c.height = H; const x = c.getContext("2d"); x.fillStyle = "#567"; x.fillRect(0, 0, W, H);
    x.drawImage(IM, 20 + i * 4 + (i % 2 ? 3 : -3), 60 + Math.round(10 * Math.sin(i / 4)), 440, 440); const F = await VISAGE.detecter(c, W, H); P.push(i >= 10 && i <= 12 ? null : (F[0] || null)) }
  const brut = VISAGE.tremblement(P.filter(Boolean)), L = VISAGE.lisserPiste(P), lis = VISAGE.tremblement(L.piste);
  return { ok: P.filter(Boolean).length === 21 && L.segments.length === 1 && L.piste.every(Boolean) && L.piste[11].interpole && lis < brut * .6, info: "21/21 détections, 1 segment, tremblement " + brut + " → " + lis } }));
await test("Suivi : changement de plan = nouvelle piste (pas de lissage à travers la coupe) ; longue disparition non inventée", () => p.evaluate(() => {
  const f = (x, y) => ({ x, y, w: 100, h: 120, pts: [x + 30, y + 40, x + 70, y + 40, x + 50, y + 70, x + 35, y + 95, x + 65, y + 95], score: .9 });
  const P = []; for (let i = 0; i < 10; i++) P.push(f(100 + i, 100)); for (let i = 0; i < 10; i++) P.push(f(400 + i, 300)); for (let i = 0; i < 9; i++) P.push(null); for (let i = 0; i < 5; i++) P.push(f(410, 300));
  const L = VISAGE.lisserPiste(P), s = L.segments; return { ok: s.length === 3 && s[0].fin === 9 && s[1].debut === 10 && Math.abs(L.piste[9].x - 109) < 2 && Math.abs(L.piste[10].x - 400) < 2 && L.piste.slice(20, 29).every(v => v === null), info: s.length + " pistes, coupe à l’image " + s[1].debut + ", 9 images sans visage laissées vides" } }));
await test("Report du masque d’une image à l’autre : suit déplacement, taille et rotation (recouvrement ≥ 85 %)", () => p.evaluate(() => {
  const mk = (ox, oy, d, ang) => { const ux = Math.cos(ang), uy = Math.sin(ang), vx = -uy, vy = ux, P = (a, b) => [ox + (a * ux + b * vx) * d, oy + (a * uy + b * vy) * d]; return { f: { x: ox - d, y: oy - d, w: 2 * d, h: 2.4 * d, pts: [...P(-.5, 0), ...P(.5, 0), ...P(0, .65), ...P(-.35, 1.15), ...P(.35, 1.15)] }, P } };
  const A = mk(200, 200, 60, 0), B = mk(330, 260, 84, .3), W = 640, H = 640, disque = (F, w, h) => { const [cx, cy] = F.P(0, .65), r = .4 * (Math.hypot(F.f.pts[2] - F.f.pts[0], F.f.pts[3] - F.f.pts[1])), m = new Uint8Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) m[y * w + x] = 1; return m };
  const mA = disque(A, W, H), vrai = disque(B, W, H), q = VISAGE.propager({ x: 0, y: 0, w: W, h: H, sel: mA }, A.f, B.f, W, H); let i = 0, u = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const ix = x - q.x, iy = y - q.y, v = ix >= 0 && iy >= 0 && ix < q.w && iy < q.h && q.sel[iy * q.w + ix] ? 1 : 0, t = vrai[y * W + x]; i += v & t; u += v | t }
  return { ok: i / u >= .85 && Math.abs(q.echelle - 1.4) < .01, info: "recouvrement " + Math.round(100 * i / u) + " %, échelle ×" + q.echelle } }));

await test("Photos abîmées du même visage (floue, sombre, vieux téléphone) : visage trouvé, aucune fausse proposition", () => p.evaluate(async () => {
  const o = []; let ok = true; for (const n of ["flou", "sombre", "vieuxtel"]) { const im = new Image(); im.src = "tests/medias/visage_" + n + ".jpg"; await im.decode(); const r = await VISAGE.proposer(im, im.width, im.height), f = r.propositions[0] ? r.propositions[0].zones.filter(z => z.confiance >= .5).length : -1; ok = ok && r.visages === 1 && f <= 0; o.push(n + " : " + r.visages + " visage, " + (f < 0 ? "visage trop petit : aucune hypothèse" : f + " proposition")) }
  return { ok, info: o.join(" ; ") } }));
await test("Outil Effacer : le bouton pré-remplit le masque avec les zones proposées, et ↶ les retire", async () => {
  await p.evaluate(async () => { await chargerModule("effacer"); const c = toile(chien); const bl = await new Promise(r => c.toBlob(r, "image/png")); await ERASE.open(new File([bl], "chien.png", { type: "image/png" })) });
  await p.waitForFunction(() => ERASE.state && ERASE.state.w); await p.click("#ez_auto"); await p.waitForFunction(() => ERASE.state.autoProp, null, { timeout: 60000 });
  const r = await p.evaluate(() => ({ n: ERASE.state.strokes.length, pr: ERASE.state.autoProp.proposes.length, go: !document.querySelector("#ez_go").disabled, msg: document.querySelector("#ez_msg").textContent.slice(0, 60) }));
  for (let i = 0; i < r.n; i++) await p.click("#ez_undo"); const apres = await p.evaluate(() => ERASE.state.strokes.length);
  return { ok: r.n === 4 && r.pr === 4 && r.go && apres === 0, info: r.n + " zones dans le masque, bouton Reconstruire actif : " + r.go + ", après annulation : " + apres + " — « " + r.msg + "… »" } });

console.log("Erreurs JavaScript : " + (errs.length ? errs.join(" | ") : "aucune"));
console.log("Résultat : " + res.filter(Boolean).length + " réussis, " + res.filter(x => !x).length + " échoués.");
await b.close(); srv.kill(); process.exit(res.every(Boolean) && !errs.length ? 0 : 1);
