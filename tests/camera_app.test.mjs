/* Caméra virtuelle (v6.0) dans l'app, de bout en bout (Chrome sans écran) :
   une vidéo filmée par un « vieil objectif » simulé (flou, coins sombres, franges) est importée ;
   - l'analyse retrouve les défauts et affiche la fiche de l'appareil ;
   - case décochée : rendu identique AU PIXEL PRÈS à celui de l'app sans le module ;
   - case cochée : franges supprimées, coins éclaircis, image plus nette, et l'export se termine.
   node tests/camera_app.test.mjs     (PW=chemin de playwright si besoin ; Python 3 + numpy, scipy, pillow ; ffmpeg) */
import { spawn, execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
const { chromium } = await import(process.env.PW || "playwright");
const HERE = path.dirname(fileURLToPath(import.meta.url)), PORT = 8771, BASE = "http://localhost:" + PORT;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "camapp-")), VID = path.join(TMP, "vieil_objectif.mp4");
const SIG = 1.8, VG = .4, SR = .003, SB = -.0025;
execFileSync("python3", [path.join(HERE, "camera_video.py"), "mire", VID, SIG, VG, SR, SB].map(String));
const srv = spawn(process.execPath, [path.join(HERE, "serveur.mjs")], { env: { ...process.env, PORT }, stdio: "ignore" });
await new Promise(r => setTimeout(r, 600));
const browser = await chromium.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", args: ["--use-angle=swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"] });
const p = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const errs = []; p.on("pageerror", e => errs.push(e.message));
let ok = 0, ko = 0; const check = (c, t) => { if (c) { ok++; console.log("✓ " + t) } else { ko++; console.log("✗ " + t) } };
try {
  await p.goto(BASE + "/index.html"); await p.waitForFunction(() => window.CAM && window.MODELS);
  await p.evaluate(() => { const e = document.querySelector("#o_max"); e.checked = false; e.dispatchEvent(new Event("change")) });
  await p.setInputFiles("#f", VID);
  await p.waitForFunction(() => CAM.S.lens && CAM.S.fiche && !document.querySelector("#camf").hidden, null, { timeout: 180000 });
  const L = await p.evaluate(() => ({ lens: CAM.S.lens, fiche: CAM.S.fiche, txt: document.querySelector("#camf").textContent }));
  console.log("mesures :", JSON.stringify({ vg: L.lens.vg, ca: L.lens.ca, sig: L.lens.sig, k: L.lens.k, notes: L.lens.notes }));
  console.log("fiche :", L.txt);
  /* la correction retenue est étalonnée sur l'image compressée (couleur en demi-définition) : proche de la frange simulée, pas égale */
  check(Math.abs(L.lens.ca[0] - SR) <= .001 && Math.abs(L.lens.ca[1] - SB) <= .001 && Math.sign(L.lens.ca[0]) === Math.sign(SR) && Math.sign(L.lens.ca[1]) === Math.sign(SB), `franges retrouvées (correction ${L.lens.ca} pour ${SR}, ${SB} simulées)`);
  check(L.lens.vg > .15, `coins sombres retrouvés (correction ${L.lens.vg})`);
  check(Math.abs(L.lens.sig - SIG) <= .45 && L.lens.k > .3, `flou retrouvé (σ ${L.lens.sig}, correction ${L.lens.k})`);
  check(/Appareil/.test(L.txt) && /960×540/.test(L.txt), "fiche de l'appareil affichée");

  /* image figée au milieu de la vidéo, rendue dans trois états */
  await p.evaluate(async () => { v.pause(); await seekEl(v, v.duration / 2); await new Promise(r => setTimeout(r, 300)) });
  const snap = () => p.evaluate(() => { draw(); const c = document.createElement("canvas"); c.width = cv.width; c.height = cv.height; const x = c.getContext("2d"); x.drawImage(cv, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data; let h = 0; for (let i = 0; i < d.length; i += 7) h = (h * 31 + d[i]) >>> 0; return { h, w: c.width, hh: c.height } });
  const off = await snap();
  const sansModule = await p.evaluate(() => { const keep = window.CAM; window.CAM = undefined; try { draw(); const c = document.createElement("canvas"); c.width = cv.width; c.height = cv.height; const x = c.getContext("2d"); x.drawImage(cv, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data; let h = 0; for (let i = 0; i < d.length; i += 7) h = (h * 31 + d[i]) >>> 0; return h } finally { window.CAM = keep } });
  check(off.h === sansModule, "case décochée : rendu identique au pixel près à l'app sans caméra virtuelle");

  /* mesures sur le rendu, case décochée puis cochée (même image, aperçu en définition d'origine) */
  const mesure = () => p.evaluate(() => { draw(); const W = cv.width, H = cv.height, w = 480, h = Math.round(480 * H / W), c = document.createElement("canvas"), x = c.getContext("2d", { willReadFrequently: true });
    c.width = w; c.height = h; x.drawImage(cv, 0, 0, w, h); const d = x.getImageData(0, 0, w, h).data, y = new Float32Array(w * h); for (let i = 0, k = 0; i < d.length; i += 4, k++) y[k] = .299 * d[i] + .587 * d[i + 1] + .114 * d[i + 2];
    const fr = CAM.franges({ W: w, H: h, d }), vg = CAM.vignetage({ W: w, H: h, y });
    /* flou : centre en définition du rendu, ramené à l'échelle de la source */
    const s = W / v.videoWidth, cw = Math.min(640, W), ch = Math.min(640, H); c.width = cw; c.height = ch; x.drawImage(cv, (W - cw) / 2, (H - ch) / 2, cw, ch, 0, 0, cw, ch);
    const d2 = x.getImageData(0, 0, cw, ch).data, y2 = new Float32Array(cw * ch); for (let i = 0, k = 0; i < d2.length; i += 4, k++) y2[k] = .299 * d2[i] + .587 * d2[i + 1] + .114 * d2[i + 2];
    const fl = CAM.flou({ W: cw, H: ch, y: y2 });
    return { fr: fr && [fr.r.s, fr.b.s], vg, fl: fl && +(fl.sigma / s).toFixed(2) } });
  const m0 = await mesure();
  await p.evaluate(() => { const e = document.querySelector("#o_cam"); e.checked = true; e.dispatchEvent(new Event("change")) });
  const m1 = await mesure();
  console.log("rendu habituel :", JSON.stringify(m0)); console.log("caméra virtuelle :", JSON.stringify(m1));
  check(m1.fr && Math.abs(m1.fr[0]) <= .0006 && Math.abs(m1.fr[1]) <= .0006 && Math.hypot(...m0.fr) > .002, `franges supprimées (${m0.fr} → ${m1.fr})`);
  check(m1.vg > m0.vg * 1.1, `coins éclaircis (rapport coins / centre ${m0.vg.toFixed(3)} → ${m1.vg.toFixed(3)})`);
  check(m1.fl && m0.fl && m1.fl < m0.fl - .1, `image plus nette (flou ${m0.fl} → ${m1.fl} px)`);
  check(await p.evaluate(() => /corrigé/.test(document.querySelector("#camf").textContent)), "la fiche indique que la correction est appliquée");

  /* export complet avec la case cochée */
  await p.evaluate(() => { document.querySelector("#q").value = "-1"; document.querySelector("#q").dispatchEvent(new Event("change")) });
  await p.click("#ex");
  await p.waitForFunction(() => !exporting && /Terminé|Échec|Impossible|annulé|pas pu/.test(document.querySelector("#st1").textContent), null, { timeout: 900000 });
  const fin = await p.evaluate(() => ({ t: document.querySelector("#st1").textContent, n: outBlob && outBlob.size }));
  check(/Terminé/.test(fin.t) && fin.n > 10000, "export terminé (" + fin.t.slice(0, 60) + ")");
  const diag = await p.evaluate(() => DIAG.hist().filter(d => d.kind === "camera").pop());
  check(diag && diag.appareil && diag.objectif && !JSON.stringify(diag).includes("vieil_objectif"), "diagnostic « camera » enregistré, sans nom de fichier");
  check(!errs.length, "aucune erreur de page" + (errs.length ? " : " + errs.join(" | ") : ""));
} catch (e) { ko++; console.log("✗ exception : " + e.message.split("\n")[0]) }
finally { await browser.close(); srv.kill() }
console.log(`\n${ok} réussis, ${ko} échoués`); process.exit(ko ? 1 : 0);
