/* F10 (v7.5) — retirer un filtre AR en vidéo, de bout en bout dans Chromium (vrais modèles : YuNet, détecteur, MI-GAN, GFPGAN).
   node tests/rfv.test.mjs        (préparer : python3 tests/labo_filtres/video_filtre.py creer ; tests/medias/migan.onnx, voir tests/README.md)
   Filtre SIMULÉ, vérité connue : ne vaut ni validation sur de vrais filtres Snapchat/Instagram ni validation sur iPhone. */
import { spawn, execFileSync } from "child_process"; import fs from "fs"; import path from "path"; import { fileURLToPath } from "url";
const { chromium } = await import(process.env.PW || "playwright");
const HERE = path.dirname(fileURLToPath(import.meta.url)), PORT = 8787, MED = path.join(HERE, "medias"), OUT = path.join(HERE, "sorties", "f10");
const VID = path.join(MED, "filtre_video.mp4"), MIGAN = path.join(MED, "migan.onnx");
if (!fs.existsSync(VID)) { console.log("Vidéo absente : python3 tests/labo_filtres/video_filtre.py creer"); process.exit(2) }
if (!fs.existsSync(MIGAN)) { console.log("Modèle absent : placer migan_pipeline_v2.onnx dans " + MIGAN); process.exit(2) }
fs.mkdirSync(OUT, { recursive: true });
const srv = spawn(process.execPath, [path.join(HERE, "serveur.mjs")], { env: { ...process.env, PORT }, stdio: "ignore" }); await new Promise(r => setTimeout(r, 600));
const b = await chromium.launch({ args: ["--enable-unsafe-webgpu", "--use-angle=swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"] });
const p = await (await b.newContext({ viewport: { width: 430, height: 932 } })).newPage(); const errs = []; p.on("pageerror", e => errs.push(e.message));
p.on("dialog", d => /diagnostic/i.test(d.message()) ? d.dismiss() : d.accept());   /* aucun diagnostic envoyé depuis les tests */
const MG = fs.readFileSync(MIGAN); await p.route(/huggingface\.co\/.*migan_pipeline_v2\.onnx/, r => r.fulfill({ status: 200, body: MG, headers: { "content-type": "application/octet-stream", "access-control-allow-origin": "*" } }));
await p.goto("http://localhost:" + PORT + "/index.html"); await p.waitForFunction(() => window.MODELS && window.VISAGE && window.chargerModule);
await p.evaluate(() => localStorage.setItem("autorisations", JSON.stringify({ modele: { ok: true } })));
const res = []; const test = async (n, f) => { const t0 = Date.now(); let ok = false, info = ""; try { const r = await f(); ok = r.ok; info = r.info } catch (e) { info = "exception : " + e.message.split("\n")[0] } res.push(ok); console.log((ok ? "✓ " : "✗ ") + n + " — " + info + " (" + Math.round((Date.now() - t0) / 1000) + " s)") };
const done = () => p.waitForFunction(() => !exporting && /Terminé|Échec|Impossible|annulé|pas pu/.test(document.querySelector("#st1").textContent), null, { timeout: 3600000 });
const save = async name => { const d = await p.evaluate(async () => { const a = new Uint8Array(await (await fetch(outUrl)).arrayBuffer()); let s = ""; for (let i = 0; i < a.length; i += 32768) s += String.fromCharCode(...a.subarray(i, i + 32768)); return btoa(s) });
  const f = path.join(OUT, name); fs.writeFileSync(f, Buffer.from(d, "base64")); return f };
const coche = (id, on) => p.evaluate(([id, on]) => { const e = document.getElementById(id); e.checked = on; e.dispatchEvent(new Event("change")) }, [id, on]);
const ouvrir = async f => { await p.setInputFiles("#f", f); await p.waitForFunction(() => v.videoWidth > 0); await p.waitForTimeout(1500);
  await p.evaluate(() => { const e = document.querySelector("#o_max"); e.checked = false; e.dispatchEvent(new Event("change")); document.querySelector('[data-q="-1"]').click() }) };
const exporter = () => p.evaluate(() => setTimeout(() => document.querySelector("#ex").click(), 0));

await test("Recalage fin : retrouve une rotation de 3°, un zoom de 4 % et un décalage connus", () => p.evaluate(async () => {
  await chargerModule("filtrevideo"); const T = RFV._t, HS = T.HS, R = new Float32Array(HS * HS);
  const f = (x, y) => 128 + 40 * Math.sin(x / 9 + y / 23) + 30 * Math.sin(x / 31 - y / 13) + 25 * Math.cos((x * x + y * y) / 9000);
  const a = .05, k = 1.04, c = HS / 2, D = [k * Math.cos(a), -k * Math.sin(a), 0, k * Math.sin(a), k * Math.cos(a), 0]; D[2] = 6 + c - (D[0] * c + D[1] * c); D[5] = -4 + c - (D[3] * c + D[4] * c);
  const Di = T.inv(D), I = new Float32Array(HS * HS);   /* I(D(x)) = R(x)  ⇔  I(y) = R(D⁻¹(y)) */
  for (let y = 0; y < HS; y++) for (let x = 0; x < HS; x++) { R[y * HS + x] = f(x, y); I[y * HS + x] = f(Di[0] * x + Di[1] * y + Di[2], Di[3] * x + Di[4] * y + Di[5]) }
  const E = T.recaler(T.pyramide(R), T.pyramide(I)); if (!E) return { ok: false, info: "recalage refusé" };
  const e = { echelle: Math.hypot(E[0], E[3]) - k, angle: Math.atan2(E[3], E[0]) - a, tx: E[0] * c + E[1] * c + E[2] - c - 6, ty: E[3] * c + E[4] * c + E[5] - c + 4 };
  return { ok: Math.abs(e.echelle) < .004 && Math.abs(e.angle) < .004 && Math.abs(e.tx) < .4 && Math.abs(e.ty) < .4, info: "erreurs : échelle " + e.echelle.toFixed(4) + ", angle " + e.angle.toFixed(4) + " rad, décalage " + e.tx.toFixed(2) + " / " + e.ty.toFixed(2) + " px" } }));

let sans, avec;
await test("Export de référence sans l'option (taille d'origine)", async () => { await ouvrir(VID); await coche("o_rfv", false); await coche("o_rvv", false); await exporter(); await done(); sans = await save("app_sans.mp4");
  return { ok: /Terminé/.test(await p.textContent("#st1")), info: path.basename(sans) } });
await test("Export avec « Retirer le filtre du visage » : suivi, une seule reconstruction, vidéo complète", async () => {
  await coche("o_rfv", true); await exporter(); await done(); avec = await save("app_sans_filtre.mp4"); const r = await p.evaluate(() => window.__rfv);
  const j = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=width,height,nb_read_frames", "-of", "json", avec]).toString()).streams[0];
  return { ok: r && r.avec_filtre >= 32 && r.sections === 1 && j.nb_read_frames >= 35 && j.width === 480 && j.height === 640, info: JSON.stringify({ ...r, journal: undefined, texte: undefined }) + " ; sortie " + j.width + "×" + j.height + ", " + j.nb_read_frames + " images" } });
await test("Mesure contre la vérité : zone bien plus proche de la vraie vidéo, sans scintillement ajouté", async () => {
  const o = execFileSync("python3", [path.join(HERE, "labo_filtres", "video_filtre.py"), "mesurer", sans, avec], { env: { ...process.env, PYTHONPATH: path.join(HERE, "visage_ia", "faux") }, stdio: ["ignore", "pipe", "ignore"] }).toString().trim().split("\n").pop();
  const m = JSON.parse(o), S = m["app_sans.mp4"], A = m["app_sans_filtre.mp4"]; fs.writeFileSync(path.join(OUT, "mesures_app.json"), JSON.stringify(m, null, 1));
  return { ok: A.ecart_zone < .7 * S.ecart_zone && A.scintillement <= S.scintillement * 1.02 && A.lpips_tete < S.lpips_tete, info: `sans ${S.ecart_zone}/${S.scintillement}/${S.lpips_tete} ; avec ${A.ecart_zone}/${A.scintillement}/${A.lpips_tete} (écart dans la zone / scintillement / LPIPS de la tête)` } });
await test("Filtre + visages ensemble : les visages sont restaurés sur l'image déjà nettoyée, export complet", async () => {
  await coche("o_rvv", true); await exporter(); await done(); const f = await save("app_filtre_et_visages.mp4"); const r = await p.evaluate(() => ({ f: window.__rfv, v: window.__rvv, st: document.querySelector("#st1").textContent })); await coche("o_rvv", false);
  return { ok: /Terminé/.test(r.st) && r.f && r.f.sections === 1 && r.v && !r.v.erreur, info: "filtre : " + r.f.avec_filtre + " images ; visages : " + (r.v.texte || JSON.stringify(r.v)) } });
await test("Vidéo sans filtre : rien n'est retiré, message clair", async () => {
  const f = path.join(MED, "visage_video.mp4"); if (!fs.existsSync(f)) return { ok: true, info: "vidéo sans filtre absente (python3 tests/visage_ia/video_visage.py creer) : cas sauté" };
  await ouvrir(f); await coche("o_rfv", true); await exporter(); await done(); const r = await p.evaluate(() => window.__rfv); await coche("o_rfv", false);
  return { ok: r && r.avec_filtre === 0 && /Aucun élément/.test(r.texte), info: r.texte } });

console.log("Erreurs JavaScript : " + (errs.length ? errs.join(" | ") : "aucune"));
console.log("Résultat : " + res.filter(Boolean).length + " réussis, " + res.filter(x => !x).length + " échoués. (Chromium sans écran, WebAssembly — aucun test sur iPhone.)");
await b.close(); srv.kill(); process.exit(res.every(Boolean) && !errs.length ? 0 : 1);
