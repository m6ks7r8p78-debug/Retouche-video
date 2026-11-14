/* Directeur IA v1.1 — banc MULTI-CAS du vrai module « Retirer le filtre du visage » (filtre-video.js) dans Chrome.
   Pour chaque vidéo de tests/medias/filtre_multi/ (portraits NASA du domaine public, filtres AR SIMULÉS, vérité connue) :
   export sans l'option, export avec l'option, mesure contre la vérité (écart dans la zone, scintillement, LPIPS de la tête).
   Préparer : PYTHONPATH=tests/visage_ia/faux python3 tests/labo_filtres/video_filtre_multi.py creer ; tests/medias/migan.onnx.
   CHROME=/chemin/google-chrome (codecs H.264/AAC requis).   node tests/banc_filtres_app.mjs → tests/sorties/f10/banc_app.json
   Ne vaut ni validation sur de vrais filtres Snapchat/Instagram ni validation sur iPhone. */
import { spawn, execFileSync } from "child_process"; import fs from "fs"; import path from "path"; import { fileURLToPath } from "url";
const { chromium } = await import(process.env.PW || "playwright");
const HERE = path.dirname(fileURLToPath(import.meta.url)), PORT = 8793, MED = path.join(HERE, "medias"), DOS = path.join(MED, "filtre_multi"), OUT = path.join(HERE, "sorties", "f10");
const MIGAN = path.join(MED, "migan.onnx");
if (!fs.existsSync(MIGAN) || !fs.existsSync(DOS)) { console.log("Préparer : migan.onnx et video_filtre_multi.py creer"); process.exit(2) }
const CAS = fs.readdirSync(DOS).filter(f => /^p\d+_[a-z]+\.mp4$/.test(f)).sort(); fs.mkdirSync(OUT, { recursive: true });
const srv = spawn(process.execPath, [path.join(HERE, "serveur.mjs")], { env: { ...process.env, PORT }, stdio: "ignore" }); await new Promise(r => setTimeout(r, 600));
const b = await chromium.launch({ ...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}), args: ["--use-angle=swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"] });
const p = await (await b.newContext({ viewport: { width: 430, height: 932 } })).newPage(); const errs = []; p.on("pageerror", e => errs.push(e.message));
p.on("dialog", d => /diagnostic/i.test(d.message()) ? d.dismiss() : d.accept());
const MG = fs.readFileSync(MIGAN); await p.route(/huggingface\.co\/.*migan_pipeline_v2\.onnx/, r => r.fulfill({ status: 200, body: MG, headers: { "content-type": "application/octet-stream", "access-control-allow-origin": "*" } }));
await p.goto("http://localhost:" + PORT + "/index.html"); await p.waitForFunction(() => window.MODELS && window.VISAGE && window.chargerModule);
await p.evaluate(() => localStorage.setItem("autorisations", JSON.stringify({ modele: { ok: true } })));
const done = () => p.waitForFunction(() => !exporting && /Terminé|Échec|Impossible|annulé|pas pu/.test(document.querySelector("#st1").textContent), null, { timeout: 3600000 });
const save = async name => { const d = await p.evaluate(async () => { const a = new Uint8Array(await (await fetch(outUrl)).arrayBuffer()); let s = ""; for (let i = 0; i < a.length; i += 32768) s += String.fromCharCode(...a.subarray(i, i + 32768)); return btoa(s) });
  const f = path.join(OUT, name); fs.writeFileSync(f, Buffer.from(d, "base64")); return f };
const coche = (id, on) => p.evaluate(([id, on]) => { const e = document.getElementById(id); e.checked = on; e.dispatchEvent(new Event("change")) }, [id, on]);
const ouvrir = async f => { await p.setInputFiles("#f", f); await p.waitForFunction(() => v.videoWidth > 0); await p.waitForTimeout(1500);
  await p.evaluate(() => { const e = document.querySelector("#o_max"); e.checked = false; e.dispatchEvent(new Event("change")); document.querySelector('[data-q="-1"]').click() }) };
const exporter = () => p.evaluate(() => setTimeout(() => document.querySelector("#ex").click(), 0));
const resultats = [];
for (const f of CAS) {
  const cas = f.replace(/\.mp4$/, ""), t0 = Date.now();
  try {
    await coche("o_rfv", false); await coche("o_rvv", false); await ouvrir(path.join(DOS, f));
    await exporter(); await done(); const sans = await save(cas + "__sans.mp4");
    await coche("o_rfv", true); await exporter(); await done(); const avec = await save(cas + "__avec.mp4"); const r = await p.evaluate(() => window.__rfv); await coche("o_rfv", false);
    const o = execFileSync("python3", [path.join(HERE, "labo_filtres", "video_filtre_multi.py"), "mesurer", cas, sans, avec], { env: { ...process.env, PYTHONPATH: path.join(HERE, "visage_ia", "faux") }, stdio: ["ignore", "pipe", "ignore"] }).toString().trim().split("\n").pop();
    const m = JSON.parse(o), S = m[path.basename(sans)], A = m[path.basename(avec)];
    resultats.push({ cas, sans: S, avec: A, module: { avec_filtre: r && r.avec_filtre, sections: r && r.sections, ms: r && r.ms }, s: Math.round((Date.now() - t0) / 1000) });
    console.log(`${cas} : écart zone ${S.ecart_zone} → ${A.ecart_zone} ; scintillement ${S.scintillement} → ${A.scintillement} ; LPIPS tête ${S.lpips_tete} → ${A.lpips_tete} ; sections ${r && r.sections} (${Math.round((Date.now() - t0) / 1000)} s)`);
  } catch (e) { resultats.push({ cas, erreur: String(e.message || e).split("\n")[0] }); console.log(cas + " : ERREUR " + String(e.message || e).split("\n")[0]) }
}
const sortie = { banc: "filtres_ar_app_multi/1", date: new Date().toISOString(), navigateur: "Chrome sans écran, GPU simulé (SwiftShader)", donnees: "synthetique",
  avertissement: "Portraits NASA du domaine public, filtres AR simulés (chien, chat, éléments au hasard). Ne vaut ni validation sur de vrais filtres ni sur iPhone.", resultats, erreurs_js: errs };
fs.writeFileSync(path.join(OUT, "banc_app.json"), JSON.stringify(sortie, null, 1));
console.log("Erreurs JavaScript : " + (errs.length ? errs.join(" | ") : "aucune")); await b.close(); srv.kill(); process.exit(resultats.every(r => !r.erreur) ? 0 : 1);
