/* v3.3 — « Effacer une zone » (MI-GAN), de bout en bout dans Chrome sans écran (aucun iPhone ici).
   node tests/effacer.test.mjs [dossier des médias]
   Le vrai modèle (migan_pipeline_v2.onnx, 28 Mo, empreinte 6f1f3530…) doit être dans le dossier des médias sous le nom
   migan.onnx ; il est servi à la place d'Hugging Face. Vérifie : outils internes, refus de téléchargement (rien envoyé),
   modèle abîmé refusé, vraie reconstruction, pixels hors zone identiques au pixel près, carte des zones inventées,
   refuser / garder / annuler / revenir à l'original, exports (JPEG, PNG sans perte, carte, provenance), historique,
   grande photo 12 Mpx, photo trop grande réduite, ouverture depuis le résultat d'une photo améliorée. */
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
const { chromium } = await import(process.env.PW || "playwright");
const HERE = path.dirname(fileURLToPath(import.meta.url)), PORT = 8773, BASE = "http://localhost:" + PORT;
const MED = path.resolve(process.argv[2] || path.join(HERE, "medias")), MIGAN = path.join(MED, "migan.onnx");
const SHA = "6f1f3530a1a2324b19752018ce756088b07973cda8d7d890034ace5c8a48c40b";
if (!fs.existsSync(MIGAN)) { console.log("Modèle absent : placer migan_pipeline_v2.onnx dans " + MIGAN + " (voir tests/README.md)."); process.exit(2) }
const MODEL = fs.readFileSync(MIGAN);
if (crypto.createHash("sha256").update(MODEL).digest("hex") !== SHA) { console.log("Le fichier " + MIGAN + " n'est pas le bon modèle (empreinte)."); process.exit(2) }
const BAD = Buffer.from(MODEL); BAD[5000000] ^= 0xff;
/* sélection au toucher (EdgeTAM) : poids servis à la place d'Hugging Face (tests/medias/edgetam_enc.onnx_data et edgetam_dec.onnx_data) */
const ENC = path.join(MED, "edgetam_enc.onnx_data"), DEC = path.join(MED, "edgetam_dec.onnx_data"), SEG = fs.existsSync(ENC) && fs.existsSync(DEC);

const srv = spawn(process.execPath, [path.join(HERE, "serveur.mjs")], { env: { ...process.env, PORT }, stdio: "ignore" });
await new Promise(r => setTimeout(r, 600));
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ["--enable-unsafe-webgpu", "--use-angle=swiftshader", "--ignore-gpu-blocklist"] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: false });
const p = await ctx.newPage(); const errs = []; p.on("pageerror", e => errs.push(e.message));
let serve = "none", hfReq = 0;
await p.route(/huggingface\.co\/.*migan_pipeline_v2\.onnx/, r => { hfReq++; if (serve === "none") return r.abort(); r.fulfill({ status: 200, body: serve === "bad" ? BAD : MODEL, headers: { "content-type": "application/octet-stream", "access-control-allow-origin": "*", "content-length": String(MODEL.length) } }) });
if (SEG) for (const [re, f] of [[/vision_encoder\.onnx_data/, ENC], [/prompt_encoder_mask_decoder\.onnx_data/, DEC]]) { const b = fs.readFileSync(f); await p.route(re, r => r.fulfill({ status: 200, body: b, headers: { "content-type": "application/octet-stream", "access-control-allow-origin": "*", "content-length": String(b.length) } })) }
await p.goto(BASE + "/index.html"); await p.waitForFunction(() => window.ERASE && window.MODELS && window.STUDIO);
await p.evaluate(() => { localStorage.removeItem("autorisations"); localStorage.removeItem("recettes"); window.__out = []; window.shareBlob = async (b, n) => { window.__out.push({ n, b }) } });

let ok = 0, ko = 0; const t00 = Date.now();
async function test(name, fn) { const t0 = Date.now(); let r, info = ""; try { r = await fn(); info = r && r.info || "" } catch (e) { r = false; info = "exception : " + e.message.split("\n")[0] }
  const good = r === true || (r && r.ok); good ? ok++ : ko++; console.log((good ? "✓ " : "✗ ") + name + (info ? " — " + info : "") + " (" + ((Date.now() - t0) / 1000).toFixed(1) + " s)") }
const msg = () => p.textContent("#ez_msg");
/* peint un trait sur l'image (coordonnées en pixels de l'image), avec la souris */
async function paint(pts, size) {
  if (size) await p.evaluate(v => { const e = document.querySelector("#ez_sz"); e.value = v }, size);
  const m = await p.evaluate(() => { const r = document.querySelector("#ez_stage").getBoundingClientRect(), v = ERASE.state.vs; return { l: r.left, t: r.top, s: v.s, tx: v.tx, ty: v.ty } });
  const sc = q => [m.l + m.tx + q[0] * m.s, m.t + m.ty + q[1] * m.s];
  await p.mouse.move(...sc(pts[0])); await p.mouse.down();
  for (const q of pts.slice(1)) await p.mouse.move(...sc(q), { steps: 6 });
  await p.mouse.up();
}
const recon = () => p.evaluate(() => new Promise(res => { document.querySelector("#ez_go").click(); const t = setInterval(() => { const S = ERASE.state; if (S && !S.busy) { clearInterval(t); res(!!S.prop) } }, 100) }));
/* compare la photo courante à l'original : pixels changés dans / hors de la carte des zones inventées */
const diff = () => p.evaluate(() => { const S = ERASE.state, c = document.createElement("canvas"); c.width = S.w; c.height = S.h; const x = c.getContext("2d"); x.drawImage(S.orig, 0, 0);
  const o = x.getImageData(0, 0, S.w, S.h).data, d = S.cx.getImageData(0, 0, S.w, S.h).data; let inG = 0, outG = 0, chIn = 0, g = 0;
  for (let i = 0; i < S.w * S.h; i++) { const ch = o[i * 4] !== d[i * 4] || o[i * 4 + 1] !== d[i * 4 + 1] || o[i * 4 + 2] !== d[i * 4 + 2]; if (S.G[i]) { g++; if (ch) chIn++ } else if (ch) outG++ }
  return { g, chIn, outG } });

/* ---------- 1. outils internes ---------- */
await test("Outils internes : réduction des très grandes photos, élargissement du masque, rectangle, contexte, tenseurs, pose de la pièce", () => p.evaluate(() => {
  const T = ERASE._t, f = T.fit(8064, 6048), g = T.fit(4032, 3024);
  const m = new Uint8Array(100); m[55] = 1; const d = T.dilate(m, 10, 10, 2), b = T.bbox(d, 10, 10), c = T.context({ x: 500, y: 10, w: 40, h: 40 }, 600, 400);
  const rgba = new Uint8Array([10, 20, 30, 255, 40, 50, 60, 255]), t = T.tensors(rgba, new Uint8Array([1, 0]), 2), pc = T.patch(new Uint8Array([1, 2, 3, 4, 5, 6]), new Uint8Array([1, 0]), 2);
  const dst = new Uint8ClampedArray([9, 9, 9, 255, 8, 8, 8, 255]); T.apply(dst, pc);
  const ok = f.w * f.h <= 16e6 && Math.abs(f.w / f.h - 8064 / 6048) < .002 && g.k === 1 && d.reduce((a, b) => a + b) === 25 && b.x === 3 && b.w === 5 && c.x === 404 && c.w === 196 && c.y === 0 && c.h === 146
    && t.img.join() === "10,40,20,50,30,60" && t.msk.join() === "0,255" && dst.join() === "1,3,5,255,8,8,8,255";
  return { ok, info: "48 Mpx → " + f.w + "×" + f.h + " ; masque élargi : 25 px ; contexte " + c.w + "×" + c.h } }));

await test("Nettoyage du contour proposé : garde la partie touchée, bouche ses trous, agrandit sans décalage", () => p.evaluate(() => {
  const T = ERASE._t, w = 12, h = 8, m = new Uint8Array(w * h);
  for (let y = 1; y < 6; y++) for (let x = 1; x < 6; x++) m[y * w + x] = 1; m[3 * w + 3] = 0;          /* bloc touché, avec un trou */
  for (let y = 2; y < 4; y++) for (let x = 8; x < 11; x++) m[y * w + x] = 1;                          /* autre bloc, à ignorer */
  const c = T.clean(m, w, h, 2, 2), n = c.reduce((a, b) => a + b, 0);
  const lo = new Float32Array(4).fill(-1); lo[3] = 1; const u = T.upmask(lo, 2, 8, 8);                  /* coin bas-droit seulement */
  return { ok: n === 25 && c[3 * w + 3] === 1 && c[2 * w + 9] === 0 && u[0] === 0 && u[63] === 1 && u[7] === 0, info: "pixels gardés : " + n + " (25 attendus)" } }));

/* ---------- 2. ouverture ---------- */
await test("Bouton « Effacer une zone » sur l'accueil : la photo s'ouvre, rien n'est inventé, Reconstruire désactivé sans masque", async () => {
  await p.setInputFiles("#fe", path.join(MED, "ref_cafe.png")); await p.waitForFunction(() => ERASE.state && ERASE.state.w);
  const r = await p.evaluate(() => ({ vis: !document.querySelector("#ez").hidden, w: ERASE.state.w, h: ERASE.state.h, badge: document.querySelector("#ez_badge").textContent, go: document.querySelector("#ez_go").disabled }));
  return { ok: r.vis && r.w === 600 && r.h === 400 && /rien d.inventé/.test(r.badge) && r.go, info: r.w + "×" + r.h + ", « " + r.badge + " »" } });

/* ---------- 3. autorisation et intégrité du modèle ---------- */
await paint([[395, 160], [400, 240], [380, 300]], 46);
await test("Téléchargement refusé : aucune requête vers Hugging Face, photo intacte", async () => {
  hfReq = 0; const got = await recon(); const m = await msg(), d = await diff();
  return { ok: !got && hfReq === 0 && d.outG === 0 && d.g === 0 && /autoris/i.test(m), info: "requêtes : " + hfReq + " ; message : " + m.slice(0, 80) } });
await p.evaluate(() => localStorage.setItem("autorisations", JSON.stringify({ modele: { ok: true, at: Date.now() } })));
await test("Modèle abîmé (1 octet changé) : refusé par l'empreinte, rien d'effacé", async () => {
  serve = "bad"; const got = await recon(); const m = await msg(), d = await diff(), st = await p.evaluate(async () => (await MODELS.status("migan")).installed);
  return { ok: !got && !st && d.g === 0 && d.outG === 0, info: "installé : " + st + " ; message : " + m.slice(0, 90) } });

/* ---------- 4. vraie reconstruction ---------- */
serve = "good";
let first;
await test("Reconstruction réelle (cuillère effacée) : proposition affichée, marquée comme inventée", async () => {
  const t0 = Date.now(), got = await recon(), r = await p.evaluate(() => { const S = ERASE.state; return { px: S.prop && S.prop.px, ms: S.prop && S.prop.ms, badge: document.querySelector("#ez_badge").textContent, dec: !document.querySelector("#ez_dec").hidden, st: 0 } });
  const st = await p.evaluate(async () => (await MODELS.status("migan")).installed); first = r;
  return { ok: got && r.px > 2000 && /inventée/.test(r.badge) && r.dec && st, info: r.px + " pixels proposés, " + (r.ms / 1000).toFixed(1) + " s (téléchargement simulé compris), modèle installé et vérifié : " + st } });
await test("Refuser : la photo ne change pas", async () => { await p.click("#ez_no"); const d = await diff(); return { ok: d.g === 0 && d.outG === 0 && !(await p.evaluate(() => !!ERASE.state.prop)), info: "pixels changés : " + d.outG } });
await test("Garder : seuls les pixels de la carte changent (hors zone identique au pixel près), la carte compte exactement la zone", async () => {
  const t0 = Date.now(); const got = await recon(); const ms = await p.evaluate(() => ERASE.state.prop.ms); await p.click("#ez_yes"); const d = await diff(), r = await p.evaluate(() => ({ ops: ERASE.state.ops.length, badge: document.querySelector("#ez_badge").textContent, exp: !document.querySelector("#ez_exp").hidden }));
  return { ok: got && d.outG === 0 && d.g === first.px && d.chIn > d.g * .5 && r.ops === 1 && /inventées/.test(r.badge) && r.exp, info: "inventés " + d.g + ", modifiés dans la zone " + d.chIn + ", modifiés hors zone " + d.outG + " ; calcul seul " + (ms / 1000).toFixed(1) + " s" } });
await p.screenshot({ path: path.join(HERE, "sorties", "effacer_resultat.png") }).catch(() => {});

await test("Affichages Original / Résultat / Zones inventées, opacité de la carte", async () => {
  const r = [];
  const frame = () => p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  for (const v of ["orig", "map", "res"]) { await p.click(`#ez [data-v="${v}"]`); await p.mouse.move(5, 5); await frame(); r.push(await p.textContent("#ez_badge")) }
  await p.click('#ez [data-v="map"]'); const op = await p.evaluate(() => !document.querySelector("#ez_op").hidden); await p.screenshot({ path: path.join(HERE, "sorties", "effacer_carte.png") }).catch(() => {}); await p.click('#ez [data-v="res"]');
  return { ok: r[0] === "Original" && /Carte/.test(r[1]) && /inventées/.test(r[2]) && op, info: r.join(" | ") } });

/* ---------- 5. exports ---------- */
await test("Exports : JPEG, PNG sans perte identique au résultat, carte en pleine taille, fiche de provenance complète", async () => {
  await p.evaluate(() => (window.__out = [])); await p.click("#ez_save"); await p.click("#ez_more"); await p.click("#ez_png"); await p.click("#ez_smap"); await p.click("#ez_sprov");
  await p.waitForFunction(() => window.__out.length === 4, null, { timeout: 60000 });
  const r = await p.evaluate(async () => { const S = ERASE.state, o = window.__out, dim = async b => { const i = await createImageBitmap(b); return [i.width, i.height, i] };
    const [jw, jh] = await dim(o[0].b), [pw, ph, pi] = await dim(o[1].b), [mw, mh] = await dim(o[2].b);
    const c = document.createElement("canvas"); c.width = pw; c.height = ph; const x = c.getContext("2d"); x.drawImage(pi, 0, 0); const a = x.getImageData(0, 0, pw, ph).data, b = S.cx.getImageData(0, 0, S.w, S.h).data; let n = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++;
    const pv = JSON.parse(await o[3].b.text());
    return { names: o.map(e => e.n), types: o.map(e => e.b.type), jw, jh, pw, ph, mw, mh, n, pv: { sha: pv.ia.fichier_sha256, ops: pv.operations.length, tot: pv.pixels_inventes_total, av: pv.avertissement, lic: pv.ia.licence } } });
  return { ok: r.types.join() === "image/jpeg,image/png,image/png,application/json" && r.jw === 600 && r.pw === 600 && r.mw === 600 && r.n === 0 && r.pv.sha === SHA && r.pv.ops === 1 && r.pv.tot === first.px && /inventées/.test(r.pv.av) && /MIT/.test(r.pv.lic),
    info: r.names.join(", ") + " ; PNG : " + r.n + " octet(s) différent(s) du résultat" } });
await test("Historique : l'effacement est noté (modèle, pixels inventés) et s'affiche sans risque dans ⚙️ Paramètres", () => p.evaluate(() => { const h = JSON.parse(localStorage.getItem("recettes") || "[]"), e = h[h.length - 1]; return { ok: !!e && e.profil === "effacement" && /MI-GAN/.test(e.ia.modele) && /pixels inventés/.test(e.operations[0]), info: e && e.operations[0] } }));

/* ---------- 6. annuler, recommencer, original ---------- */
await test("Annuler la reconstruction : retour exact à la photo d'avant, masque rétabli", async () => {
  await p.click("#ez_undo"); const d = await diff(), r = await p.evaluate(() => ({ ops: ERASE.state.ops.length, strokes: ERASE.state.strokes.length, go: document.querySelector("#ez_go").disabled }));
  return { ok: d.g === 0 && d.outG === 0 && r.ops === 0 && r.strokes > 0 && !r.go, info: "traits rétablis : " + r.strokes } });
await test("Gommer une partie du masque puis Recommencer le masque", async () => {
  await p.click('#ez [data-m="sub"]'); await paint([[395, 160], [400, 240], [380, 300]], 90); const a = await p.evaluate(() => ERASE.state.strokes.length);
  await p.click("#ez_clear"); const b = await p.evaluate(() => ({ n: ERASE.state.strokes.length, go: document.querySelector("#ez_go").disabled })); await p.click('#ez [data-m="add"]');
  return { ok: a >= 2 && b.n === 0 && b.go, info: "traits avant : " + a + ", après : " + b.n } });
await test("Sélection au toucher (EdgeTAM) : toucher la cuillère propose son contour, puis l'effacement ne touche que lui", async () => {
  if (!SEG) return { ok: false, info: "poids EdgeTAM absents de " + MED };
  await p.click('#ez [data-m="tap"]');
  const m = await p.evaluate(() => { const r = document.querySelector("#ez_stage").getBoundingClientRect(), v = ERASE.state.vs; return { l: r.left, t: r.top, s: v.s, tx: v.tx, ty: v.ty } });
  await p.mouse.click(m.l + m.tx + 388 * m.s, m.t + m.ty + 250 * m.s);
  await p.waitForFunction(() => ERASE.state && !ERASE.state.busy && (ERASE.state.lastSel || /échoué|non autorisé|Rien de net/.test(document.querySelector("#ez_msg").textContent)), null, { timeout: 300000 });
  const r = await p.evaluate(() => { const S = ERASE.state, st = S.strokes[S.strokes.length - 1]; return { sel: S.lastSel, b: st && st.sel ? [st.x, st.y, st.w, st.h] : null, msg: document.querySelector("#ez_msg").textContent } });
  if (!r.sel) return { ok: false, info: r.msg };
  await p.click('#ez [data-m="add"]');
  const got = await recon(); await p.click("#ez_yes"); const d = await diff();
  const inSpoon = r.b && r.b[0] >= 300 && r.b[0] + r.b[2] <= 430 && r.b[1] >= 150 && r.b[1] + r.b[3] <= 345;
  const pct = 100 * r.sel.px / (600 * 400);
  await p.screenshot({ path: path.join(HERE, "sorties", "effacer_toucher.png") }).catch(() => {});
  p.once("dialog", dd => dd.accept()); await p.click("#ez_more"); await p.click("#ez_reset");
  return { ok: inSpoon && pct > .5 && pct < 8 && r.sel.score > .7 && got && d.outG === 0 && d.g > 0,
    info: "contour " + r.b.join(",") + " (x,y,l,h), " + pct.toFixed(1) + " % de la photo, confiance " + r.sel.score + ", lecture " + r.sel.lecture_ms + " ms, contour " + r.sel.ms + " ms ; puis " + d.g + " px inventés, hors zone modifiés " + d.outG } });
await test("Deux zones successives, puis « Revenir à l'original » : plus rien d'inventé", async () => {
  await paint([[120, 330], [180, 340]], 30); await recon(); await p.click("#ez_yes");
  await paint([[520, 60], [560, 90]], 30); await recon(); await p.click("#ez_yes");
  const a = await diff(), n = await p.evaluate(() => ERASE.state.ops.length);
  p.once("dialog", d => d.accept()); await p.click("#ez_more"); await p.click("#ez_reset"); const b = await diff();
  return { ok: n === 2 && a.outG === 0 && a.g > 0 && b.g === 0 && b.outG === 0, info: "2 zones : " + a.g + " px inventés, hors zone modifiés " + a.outG + " ; après retour : " + b.g } });

/* ---------- 7. grandes photos ---------- */
await test("Grande photo 12 Mpx : effacement, pixels hors zone intacts", async () => {
  await p.evaluate(() => { ERASE.state.saved = true; ERASE.close() });
  const big = path.join(MED, "grande_12mpx.jpg"); if (!fs.existsSync(big)) return { ok: false, info: "grande_12mpx.jpg absente (python3 tests/creer_medias.py)" };
  await p.setInputFiles("#fe", big); await p.waitForFunction(() => ERASE.state && ERASE.state.w > 3000, null, { timeout: 60000 });
  const wh = await p.evaluate(() => [ERASE.state.w, ERASE.state.h]);
  await paint([[wh[0] * .4, wh[1] * .4], [wh[0] * .45, wh[1] * .45]], 40); const got = await recon(); const ms = await p.evaluate(() => ERASE.state.prop && ERASE.state.prop.ms); await p.click("#ez_yes");
  const d = await diff();
  return { ok: got && d.outG === 0 && d.g > 0, info: wh.join("×") + " ; " + d.g + " px inventés en " + (ms / 1000).toFixed(1) + " s ; hors zone modifiés : " + d.outG } });
await test("Photo de 20 Mpx : réduite sous la limite de Safari, et c'est dit à l'écran", async () => {
  await p.evaluate(() => { ERASE.state.saved = true; ERASE.close() });
  const r = await p.evaluate(async () => { const c = new OffscreenCanvas(5472, 3648), x = c.getContext("2d"); x.fillStyle = "#468"; x.fillRect(0, 0, 5472, 3648); x.fillStyle = "#fc3"; x.fillRect(800, 800, 900, 600);
    const b = await c.convertToBlob({ type: "image/jpeg", quality: .9 }); await ERASE.open(new File([b], "grande20.jpg", { type: "image/jpeg" }));
    const S = ERASE.state; return { w: S.w, h: S.h, red: S.reduced, m: document.querySelector("#ez_msg").textContent } });
  return { ok: r.red && r.w * r.h <= 16e6 && /réduite/.test(r.m), info: r.w + "×" + r.h + " — " + r.m.slice(0, 60) } });

/* ---------- 8. depuis le résultat d'une photo améliorée ---------- */
if (!process.env.RAPIDE) await test("Depuis une photo améliorée : le bouton « Effacer une zone de la photo d'origine » ouvre l'original choisi", async () => {
  await p.evaluate(() => { ERASE.state.saved = true; ERASE.close() });
  await p.setInputFiles("#fp", path.join(MED, "cafe_flou.jpg")); await p.waitForFunction(() => !document.querySelector("#rec").hidden, null, { timeout: 60000 });
  await p.click("#ex"); await p.waitForFunction(() => !document.querySelector("#erb").hidden, null, { timeout: 600000 });
  await p.click("#erb"); await p.waitForFunction(() => ERASE.state && ERASE.state.w);
  const r = await p.evaluate(() => ({ name: ERASE.state.name, w: ERASE.state.w, nat: window.__photoNat }));
  await p.evaluate(() => ERASE.close());
  return { ok: r.name === "cafe_flou.jpg" && r.w === r.nat[0], info: r.name + " " + r.w + " px (original : " + r.nat[0] + ")" } });

await test("Fermer libère le modèle de la mémoire ; aucune erreur JavaScript", async () => { const l = await p.evaluate(() => ERASE.loaded() || ERASE.segLoaded()); return { ok: !l && errs.length === 0, info: errs.length ? errs.join(" | ").slice(0, 200) : "aucune erreur" } });

console.log("\nRésultat : " + ok + " réussis, " + ko + " échoués (" + ((Date.now() - t00) / 1000).toFixed(0) + " s).");
await browser.close(); srv.kill(); process.exit(ko ? 1 : 0);
