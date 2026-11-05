/* « Rendu photographe » (v6.0) : le moteur du navigateur donne le même résultat que le modèle d'origine (PyTorch),
   y compris aux raccords des tuiles ; échelle de sortie respectée ; utilisé pour les photos avec l'IA ; repli propre en cas d'échec.
   node tests/photopro.test.mjs     (calcul sur le processeur : environ 1 à 3 minutes) */
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
const { chromium } = await import(process.env.PW || "playwright");
const HERE = path.dirname(fileURLToPath(import.meta.url)), PORT = 8784, BASE = "http://localhost:" + PORT + "/";
const srv = spawn(process.execPath, [path.join(HERE, "serveur.mjs")], { env: { ...process.env, PORT }, stdio: "ignore" }); await new Promise(r => setTimeout(r, 600));
const b = await chromium.launch({ executablePath: process.env.CHROME || undefined });
const res = []; const test = async (n, f) => { let ok = false, info = ""; try { const r = await f(); ok = r.ok; info = r.info } catch (e) { info = "exception : " + e.message.split("\n")[0] } res.push(ok); console.log((ok ? "✓ " : "✗ ") + n + " — " + info) };

const p = await b.newPage(); const errs = []; p.on("pageerror", e => errs.push(e.message));
/* pas de WebGPU dans ce navigateur de test : calcul sur le processeur (même modèle, même code) ; téléchargement autorisé */
await p.addInitScript(() => { try { Object.defineProperty(navigator, "gpu", { value: undefined }) } catch (e) {} });
await p.addInitScript(() => { try { localStorage.setItem("autorisations", JSON.stringify({ modele: { ok: true, at: Date.now() } })) } catch (e) {} });
await p.goto(BASE + "index.html"); await p.waitForFunction(() => window.PHOTOPRO && window.MODELS);
const img = async u => p.evaluate(async u => { const i = new Image(); i.src = u; await i.decode(); return true }, u);

await test("Même résultat que le modèle d’origine, tuiles comprises (image 200×170 → 800×680)", async () => {
  await img("tests/medias/photopro/entree.png");
  const r = await p.evaluate(async () => {
    const ld = async u => { const i = new Image(); i.src = u; await i.decode(); return i };
    const e = await ld("tests/medias/photopro/entree.png"), ref = await ld("tests/medias/photopro/reference_x4.png");
    const t0 = performance.now(); const c = await PHOTOPRO.run(e, 4, null, null); const ms = performance.now() - t0;
    const a = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    const k = document.createElement("canvas"); k.width = ref.width; k.height = ref.height; const kx = k.getContext("2d"); kx.drawImage(ref, 0, 0); const d = kx.getImageData(0, 0, k.width, k.height).data;
    let s = 0, n = 0; const h = new Uint32Array(256);
    for (let i = 0; i < a.length; i += 4) for (let j = 0; j < 3; j++) { const x = Math.abs(a[i + j] - d[i + j]); s += x; n++; h[x]++ }
    let acc = 0, p99 = 0; for (let v = 0; v < 256; v++) { acc += h[v]; if (acc >= n * .99) { p99 = v; break } }
    return { w: c.width, h: c.height, moy: +(s / n).toFixed(2), p99, ms: Math.round(ms), moteur: PHOTOPRO.moteur() };
  });
  return { ok: r.w === 800 && r.h === 680 && r.moy < 1.5 && r.p99 <= 6, info: JSON.stringify(r) } });

await test("Échelle demandée respectée (×2,5) et résultat réutilisé pour la même image", async () => {
  const r = await p.evaluate(async () => { const i = new Image(); i.src = "tests/medias/photopro/entree.png"; await i.decode();
    const c1 = await PHOTOPRO.run(i, 2.5, null, "essai"); const t0 = performance.now(); const c2 = await PHOTOPRO.run(i, 2.5, null, "essai");
    return { w: c1.width, h: c1.height, meme: c1 === c2, ms2: Math.round(performance.now() - t0) } });
  return { ok: r.w === 500 && r.h === 425 && r.meme && r.ms2 < 50, info: JSON.stringify(r) } });

await test("Photo avec l’IA : le rendu photographe est utilisé (et pas le réseau compact)", async () => {
  if (await p.evaluate(() => document.body.classList.contains("simple"))) await p.click("#modeb");
  await p.setInputFiles("#fp", path.join(HERE, "medias", "photopro", "entree.png")); await p.waitForFunction(() => !document.querySelector("#rec").hidden, null, { timeout: 60000 });
  await p.evaluate(() => { const e = document.querySelector("#o_max"); e.checked = true; e.dispatchEvent(new Event("change")) });
  await p.click("#ex"); await p.waitForFunction(() => !exporting && /Terminé|pas pu/.test(document.querySelector("#st1").textContent), null, { timeout: 900000 });
  const r = await p.evaluate(() => ({ pro: SRX.pro === true, off: !!SRX.proOff, st: document.querySelector("#st1").textContent.slice(0, 80), taille: outBlob && outBlob.size }));
  return { ok: r.pro && !r.off && /Terminé/.test(r.st) && r.taille > 10000, info: JSON.stringify(r) } });

await test("Panne du rendu photographe : message clair et repli sur l’IA standard", async () => {
  const r = await p.evaluate(async () => { const v = PHOTOPRO.run; PHOTOPRO.run = async () => { throw new Error("image trop grande") }; SRX.proOff = false;
    try { const i = new Image(); i.src = "tests/medias/photopro/entree.png"; await i.decode(); const c = await SRX.run(i, 2, null, null); return { w: c.width, pro: SRX.pro, off: SRX.proOff } } finally { PHOTOPRO.run = v } });
  return { ok: r.w === 400 && r.pro === false && r.off === true, info: JSON.stringify(r) } });

console.log("Erreurs JavaScript : " + (errs.length ? errs.join(" | ") : "aucune"));
await b.close(); srv.kill();
console.log("\nRésultat : " + res.filter(x => x).length + " réussis, " + res.filter(x => !x).length + " échoués.");
process.exit(res.every(x => x) && !errs.length ? 0 : 1);
