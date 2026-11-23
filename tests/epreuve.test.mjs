/* v8.3 — Épreuve de vérité : après l'analyse d'une vidéo, l'app mesure si l'IA fait mieux qu'un simple agrandissement sur
   CETTE vidéo (3 extraits réduits ×2 puis reconstruits, comparés à l'extrait réel) et retire l'IA sinon.
   PW=…/playwright/index.mjs node tests/epreuve.test.mjs [vidéo] */
import { spawn } from "child_process";
import path from "path";
const { chromium } = await import(process.env.PW || "playwright");
const ICI = path.dirname(new URL(import.meta.url).pathname), VID = process.argv[2] || path.join(ICI, "medias", "video_vieuxtel.mp4");
const PORT = 8798, srv = spawn(process.execPath, [path.join(ICI, "serveur.mjs")], { env: { ...process.env, PORT }, stdio: "ignore" }); await new Promise(r => setTimeout(r, 700));
const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await b.newPage({ viewport: { width: 390, height: 844 } }); const errs = []; p.on("pageerror", e => errs.push(e.message));
await p.goto("http://localhost:" + PORT + "/index.html"); await p.waitForFunction(() => window.MODELS && window.SR);
await p.evaluate(() => { localStorage.setItem("autorisations", JSON.stringify({ modele: { ok: true } })); const m = document.querySelector("#o_max"); m.checked = true; m.dispatchEvent(new Event("change")) });
const t0 = Date.now();
await p.setInputFiles("#f", VID); await p.waitForFunction(() => v.videoWidth > 0, null, { timeout: 30000 });
/* L'épreuve coûteuse n'est plus lancée automatiquement au chargement. */
await p.waitForFunction(() => v.videoWidth > 0 && !REC.pr, null, { timeout: 120000 });
await p.evaluate(() => SRX.verifierVideo(curFile));
await p.waitForFunction(() => window.__epreuve !== undefined, null, { timeout: 1800000 });
const r = await p.evaluate(() => ({ e: window.__epreuve, ia: document.querySelector("#o_max").checked, ep: SRX.ep }));
const res = [], test = (n, ok, info) => { res.push(ok); console.log((ok ? "✓ " : "✗ ") + n + " — " + info) };
test("épreuve mesurée sur 3 extraits", r.e && r.e.extraits === 3, JSON.stringify(r.e));
test("écarts plausibles (0 à 0,5)", r.e && r.e.ia >= 0 && r.e.ia < .5 && r.e.agrandi >= 0 && r.e.agrandi < .5, "");
test("décision appliquée (IA gardée seulement si utile)", r.e && r.ia === r.e.utile, "IA " + (r.ia ? "gardée" : "retirée"));
test("aperçu IA de nouveau permis après l'épreuve", r.ep === false, "");
test("aucune erreur de page", !errs.length, errs.join(" | "));
console.log("durée " + Math.round((Date.now() - t0) / 1000) + " s\nRésultat : " + res.filter(Boolean).length + " réussis, " + res.filter(x => !x).length + " échoués.");
await b.close(); srv.kill(); process.exit(res.every(Boolean) ? 0 : 1);
