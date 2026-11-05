/* Banc de qualité des profils (Naturel / Équilibré / Détails), avec et sans IA, sur les mêmes images abîmées.
   node tests/qualite.test.mjs [medias] [sorties]   puis   python3 tests/qualite_mesures.py [medias] [sorties]
   Chaque image est traitée par la vraie app (mêmes réglages automatiques que pour un utilisateur). */
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const { chromium } = await import(process.env.PW || "playwright");
const HERE = path.dirname(fileURLToPath(import.meta.url)), PORT = 8768, BASE = "http://localhost:" + PORT;
const MED = path.resolve(process.argv[2] || path.join(HERE, "medias")), OUT = path.resolve(process.argv[3] || path.join(HERE, "sorties", "qualite"));
const IMGS = (process.env.IMGS || "visage_vieuxtel,chat_vieuxtel,fusee_flou").split(",");
fs.mkdirSync(OUT, { recursive: true });
const srv = spawn(process.execPath, [path.join(HERE, "serveur.mjs")], { env: { ...process.env, PORT }, stdio: "ignore" });
await new Promise(r => setTimeout(r, 600));
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ["--enable-unsafe-webgpu", "--use-angle=swiftshader", "--ignore-gpu-blocklist"] });
const p = await browser.newPage(); await p.goto(BASE + "/index.html"); await p.waitForFunction(() => window.MODELS && window.SR);
/* v4.0+ : le mode simple cache les réglages ; le banc travaille en mode expert */
if (await p.evaluate(() => document.body.classList.contains("simple"))) await p.click("#modeb");
/* v6.0 : téléchargement du modèle du rendu photographe autorisé pour le banc */
await p.evaluate(() => localStorage.setItem("autorisations", JSON.stringify({ modele: { ok: true, at: Date.now() } })));
/* SANS_VISAGES=1 : protection des visages coupée (sert à la calibrer) */
const SV = !!process.env.SANS_VISAGES; await p.evaluate(sv => MODELS.setOff("visages", sv), SV);
const PROFS = (process.env.PROFS || "naturel,equilibre,details").split(",");
const save = async f => { const d = await p.evaluate(async () => { const r = await fetch(outUrl); const a = new Uint8Array(await r.arrayBuffer()); let s = ""; for (let i = 0; i < a.length; i += 32768) s += String.fromCharCode(...a.subarray(i, i + 32768)); return btoa(s) }); fs.writeFileSync(f, Buffer.from(d, "base64")) };
for (const img of IMGS) {
  await p.setInputFiles("#fp", path.join(MED, img + ".jpg")); await p.waitForFunction(() => !document.querySelector("#rec").hidden);
  await p.selectOption("#pfmt", "png");
  for (const [ia, profs] of [[false, ["equilibre"]], [true, PROFS]]) {
    await p.evaluate(ia => { const e = document.querySelector("#o_max"); e.checked = ia; e.dispatchEvent(new Event("change")) }, ia);
    for (const prof of profs) {
      const f = path.join(OUT, `${img}__${ia ? (SV ? "iabrute" : "ia") : "sansia"}_${prof}.png`); if (fs.existsSync(f)) { console.log("déjà fait :", path.basename(f)); continue }
      const t0 = Date.now(); await p.evaluate(pr => PROF.set(pr, true), prof); await p.click("#ex");
      await p.waitForFunction(() => !exporting && /Terminé|pas pu/.test(document.querySelector("#st1").textContent), null, { timeout: 3600000 });
      await save(f); console.log(path.basename(f), ((Date.now() - t0) / 1000).toFixed(0) + " s");
    }
  }
}
await p.evaluate(() => { try { localStorage.removeItem("profil"); MODELS.setOff("visages", false) } catch (e) {} });
await browser.close(); srv.kill();
