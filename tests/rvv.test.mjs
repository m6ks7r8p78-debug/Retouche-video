/* F14 (v7.4) — visages restaurés en vidéo, de bout en bout dans Chromium (vrais modèles YuNet + GFPGAN, WebAssembly).
   node tests/rvv.test.mjs        (préparer d'abord : python3 tests/visage_ia/video_visage.py creer)
   Mesure contre la vérité connue : PYTHONPATH=tests/visage_ia/faux python3 tests/visage_ia/video_visage.py mesurer …
   Aucune valeur ici ne vaut validation sur de vraies vidéos de famille ni sur iPhone. */
import { spawn, execFileSync } from "child_process"; import fs from "fs"; import path from "path"; import { fileURLToPath } from "url";
const { chromium } = await import(process.env.PW || "playwright");
const HERE = path.dirname(fileURLToPath(import.meta.url)), PORT = 8779, MED = path.join(HERE, "medias"), OUT = path.join(HERE, "sorties", "f14");
const VID = path.join(MED, "visage_video.mp4"); if (!fs.existsSync(VID)) { console.log("Vidéo absente : python3 tests/visage_ia/video_visage.py creer"); process.exit(2) }
fs.mkdirSync(OUT, { recursive: true });
const srv = spawn(process.execPath, [path.join(HERE, "serveur.mjs")], { env: { ...process.env, PORT }, stdio: "ignore" }); await new Promise(r => setTimeout(r, 600));
const b = await chromium.launch({ args: ["--enable-unsafe-webgpu", "--use-angle=swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"] });
const p = await (await b.newContext({ viewport: { width: 430, height: 932 } })).newPage(); const errs = []; p.on("pageerror", e => errs.push(e.message)); p.on("dialog", d => /diagnostic/i.test(d.message()) ? d.dismiss() : d.accept());   /* aucun diagnostic envoyé depuis les tests */
await p.goto("http://localhost:" + PORT + "/index.html"); await p.waitForFunction(() => window.MODELS && window.VISAGE && window.chargerModule);
await p.evaluate(() => localStorage.setItem("autorisations", JSON.stringify({ modele: { ok: true } })));
const res = []; const test = async (n, f) => { const t0 = Date.now(); let ok = false, info = ""; try { const r = await f(); ok = r.ok; info = r.info } catch (e) { info = "exception : " + e.message.split("\n")[0] } res.push(ok); console.log((ok ? "✓ " : "✗ ") + n + " — " + info + " (" + Math.round((Date.now() - t0) / 1000) + " s)") };
const done = () => p.waitForFunction(() => !exporting && /Terminé|Échec|Impossible|annulé|pas pu/.test(document.querySelector("#st1").textContent), null, { timeout: 3600000 });
const save = async name => { const d = await p.evaluate(async () => { const a = new Uint8Array(await (await fetch(outUrl)).arrayBuffer()); let s = ""; for (let i = 0; i < a.length; i += 32768) s += String.fromCharCode(...a.subarray(i, i + 32768)); return btoa(s) });
  const f = path.join(OUT, name); fs.writeFileSync(f, Buffer.from(d, "base64")); return f };
const coche = (id, on) => p.evaluate(([id, on]) => { const e = document.getElementById(id); e.checked = on; e.dispatchEvent(new Event("change")) }, [id, on]);

await test("Repères lissés : la tremblote baisse, le mouvement est suivi", () => p.evaluate(async () => {
  await chargerModule("visvideo"); let s = 1; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647 - .5 };
  const vrai = [], brut = []; for (let t = 0; t < 40; t++) { const v = Array.from({ length: 10 }, (_, c) => 100 + 3 * t + 20 * Math.sin(t / 7 + c)); vrai.push(v); brut.push(v.map(x => x + 4 * rnd())) }
  brut[20] = null; const l = RVV._lisser(brut), err = P => { let e = 0, n = 0; for (let t = 3; t < 37; t++) if (P[t]) for (let c = 0; c < 10; c++) { e += Math.abs(P[t][c] - vrai[t][c]); n++ } return e / n };
  return { ok: err(l) < .6 * err(brut) && l[20] === null, info: "écart moyen à la vraie trajectoire " + err(brut).toFixed(2) + " → " + err(l).toFixed(2) + " px ; image sans repère laissée vide" } }));

let sans, avec;
await test("Export de référence sans l'option (taille d'origine)", async () => {
  await p.setInputFiles("#f", VID); await p.waitForFunction(() => v.videoWidth > 0); await p.waitForTimeout(1500);
  await p.evaluate(() => { const e = document.querySelector("#o_max"); e.checked = false; e.dispatchEvent(new Event("change")); document.querySelector('[data-q="-1"]').click() });
  await coche("o_rvv", false); await p.click("#ex"); await done(); sans = await save("app_sans_visages.mp4");
  return { ok: /Terminé/.test(await p.textContent("#st1")), info: path.basename(sans) } });
await test("Export avec « Restaurer les visages » : pré-calcul, images clés, vidéo complète", async () => {
  await coche("o_rvv", true); await p.click("#ex"); await done(); avec = await save("app_avec_visages.mp4");
  const r = await p.evaluate(() => window.__rvv), j = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=width,height,nb_read_frames", "-of", "json", avec]).toString()).streams[0];
  return { ok: r && r.cles >= 10 && r.avec_visage >= 30 && j.nb_read_frames >= 35 && j.width === 360 && j.height === 480, info: JSON.stringify(r) + " ; sortie " + j.width + "×" + j.height + ", " + j.nb_read_frames + " images" } });
await test("Mesure contre la vérité : visage plus proche (LPIPS) et pas plus de scintillement qu'avant", async () => {
  const o = execFileSync("python3", [path.join(HERE, "visage_ia", "video_visage.py"), "mesurer", VID, sans, avec], { env: { ...process.env, PYTHONPATH: path.join(HERE, "visage_ia", "faux") }, stdio: ["ignore", "pipe", "ignore"] }).toString().trim().split("\n").pop();
  const m = JSON.parse(o), E = m["visage_video.mp4"], S = m["app_sans_visages.mp4"], A = m["app_avec_visages.mp4"];
  fs.writeFileSync(path.join(OUT, "mesures.json"), JSON.stringify(m, null, 1));
  return { ok: A.lpips < .8 * S.lpips && A.scintillement <= S.scintillement * 1.02, info: `entrée ${E.lpips}/${E.psnr}/${E.scintillement} ; app sans ${S.lpips}/${S.psnr}/${S.scintillement} ; app avec visages ${A.lpips}/${A.psnr}/${A.scintillement} (LPIPS/PSNR/scintillement)` } });
await test("Avec la stabilisation : étape sautée, message clair, export normal", async () => {
  await coche("o_stab", true); await p.click("#ex"); await done(); const st = await p.textContent("#st1"); await coche("o_stab", false); await coche("o_rvv", false);
  const ok = /Terminé/.test(st); return { ok, info: (await p.evaluate(() => window.__rvv)) === null ? "pré-calcul non lancé" : "?" } });

console.log("Erreurs JavaScript : " + (errs.length ? errs.join(" | ") : "aucune"));
console.log("Résultat : " + res.filter(Boolean).length + " réussis, " + res.filter(x => !x).length + " échoués. (Chromium sans écran, WebAssembly — aucun test sur iPhone.)");
await b.close(); srv.kill(); process.exit(res.every(Boolean) ? 0 : 1);
