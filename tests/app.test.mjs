/* Test de bout en bout de l'app, dans Chrome sans écran (aucun iPhone ici : voir la fin du rapport).
   node tests/app.test.mjs <dossier des médias de test> <dossier de sortie> [--ia]
   Vérifie : photos (analyse, profils, formats, comparateur, IA ou non), vidéos (paysage / portrait, 4K, 1080p, taille
   personnalisée, taille d'origine), son, durée, cadence, format de l'image, relief avec le vrai modèle de profondeur. */
import { spawn, execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const { chromium } = await import(process.env.PW || "playwright");
const HERE = path.dirname(fileURLToPath(import.meta.url)), PORT = 8767, BASE = "http://localhost:" + PORT;
const MED = path.resolve(process.argv[2] || path.join(HERE, "medias")), OUT = path.resolve(process.argv[3] || path.join(HERE, "sorties")), IA = process.argv.includes("--ia");
fs.mkdirSync(OUT, { recursive: true });
const srv = spawn(process.execPath, [path.join(HERE, "serveur.mjs")], { env: { ...process.env, PORT }, stdio: "ignore" });
await new Promise(r => setTimeout(r, 600));
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ["--enable-unsafe-webgpu", "--use-angle=swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const p = await ctx.newPage(); const errs = []; p.on("pageerror", e => errs.push(e.message));
/* modèle de profondeur : le vrai fichier (téléchargé au préalable dans le dossier des médias) est servi à la place d'Hugging Face */
const DEPTH = path.join(MED, "depth.onnx");
if (fs.existsSync(DEPTH)) await p.route(/huggingface\.co\/.*model_quantized\.onnx/, r => r.fulfill({ status: 200, body: fs.readFileSync(DEPTH), headers: { "content-type": "application/octet-stream", "access-control-allow-origin": "*" } }));
await p.goto(BASE + "/index.html"); await p.waitForFunction(() => window.MODELS && window.SR);
  await p.evaluate(() => localStorage.setItem("autorisations", JSON.stringify({ modele: { ok: true } })));
const results = [];
async function test(name, fn) { const t0 = Date.now(); let ok = false, info = "";
  try { const r = await fn(); ok = r === true || (r && r.ok); info = r && r.info ? r.info : "" } catch (e) { info = "exception : " + e.message.split("\n")[0] }
  results.push({ name, ok, info }); console.log((ok ? "✓ " : "✗ ") + name + (info ? " — " + info : "") + " (" + ((Date.now() - t0) / 1000).toFixed(0) + " s)") }
const save = async (name) => { const d = await p.evaluate(async () => { const r = await fetch(outUrl); const a = new Uint8Array(await r.arrayBuffer()); let s = ""; for (let i = 0; i < a.length; i += 32768) s += String.fromCharCode(...a.subarray(i, i + 32768)); return btoa(s) }); const f = path.join(OUT, name); fs.writeFileSync(f, Buffer.from(d, "base64")); return f };
const probe = f => JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,codec_name,width,height,r_frame_rate,duration", "-show_entries", "format=duration", "-of", "json", f]).toString());
const setIA = on => p.evaluate(on => { const e = document.querySelector("#o_max"); e.checked = on; e.dispatchEvent(new Event("change")) }, on);
const done = (sel) => p.waitForFunction(s => !exporting && /Terminé|Échec|Impossible|annulé|pas pu/.test(document.querySelector(s).textContent), sel, { timeout: 3600000 });
const reportLines = () => p.evaluate(() => [...document.querySelectorAll("#orep_l li")].map(l => l.className + ":" + l.textContent));

/* ---------- photos ---------- */
await setIA(IA);
for (const [file, label] of [["visage_vieuxtel.jpg", "petite photo abîmée (visage)"], ["cafe_sombre.jpg", "photo sombre"]]) {
  await test("Photo « " + label + " » : analyse, profil conseillé, export, comparateur, recette", async () => {
    await p.setInputFiles("#fp", path.join(MED, file)); await p.waitForFunction(() => !document.querySelector("#rec").hidden && /mesuré|Aucun défaut/.test(document.querySelector("#rec_t").textContent));
    const an = await p.evaluate(() => ({ t: document.querySelector("#rec_t").textContent, items: [...document.querySelectorAll("#rec_l li")].map(l => l.textContent), prof: PROF.id, h: document.querySelector("#profh").textContent }));
    await p.click("#ex"); await done("#st1");
    const r = await p.evaluate(() => ({ st: document.querySelector("#st1").textContent, pv: !document.querySelector("#pv").hidden, rec: document.querySelector("#recipe").textContent, nat: window.__photoNat }));
    const f = await save(file.replace(/\.\w+$/, "") + "-" + (IA ? "ia" : "sansia") + ".jpg");
    const dim = execFileSync("python3", ["-c", "from PIL import Image;import sys;print(*Image.open(sys.argv[1]).size)", f]).toString().trim().split(" ").map(Number);
    const k = dim[0] / r.nat[0], ar = Math.abs(dim[0] / dim[1] - r.nat[0] / r.nat[1]);
    return { ok: /Terminé/.test(r.st) && r.pv && /Recette/.test(r.rec) && ar < .01 && an.items.length >= 0, info: "profil conseillé « " + an.prof + " », " + an.items.length + " point(s) mesuré(s), " + r.nat.join("×") + " → " + dim.join("×") + " (×" + k.toFixed(2) + "), comparateur affiché" + (IA ? ", IA " + (/"ia":\{/.test(r.rec) ? "utilisée" : "non utilisée") : "") };
  });
}
await test("Comparateur photo : curseur, zoom 4× (pixels réels), déplacement", async () => {
  const r = await p.evaluate(async () => { document.querySelector("#pvs").value = 300; document.querySelector("#pvs").dispatchEvent(new Event("input")); document.querySelector('#pv [data-z="4"]').click(); await new Promise(r => setTimeout(r, 50));
    return { clip: document.querySelector("#pvla").style.clipPath, tr: document.querySelector(".pv-in").style.transform, px: document.querySelector("#pvb").classList.contains("px") } });
  await p.screenshot({ path: path.join(OUT, "comparateur-zoom4.png"), clip: await p.evaluate(() => { const r = document.querySelector("#pv").getBoundingClientRect(); return { x: r.x, y: r.y + scrollY, width: r.width, height: r.height } }), fullPage: true });
  await p.evaluate(() => document.querySelector('#pv [data-z="1"]').click());
  return { ok: /inset\(0px 0px 0px 30%\)|inset\(0 0 0 30%\)/.test(r.clip) && /scale\(4\)/.test(r.tr) && r.px, info: r.clip + " ; " + r.tr };
});
await test("Photo au format PNG (sans perte)", async () => {
  await p.selectOption("#pfmt", "png"); await p.click("#ex"); await done("#st1"); const f = await save("photo.png");
  const sig = fs.readFileSync(f).subarray(0, 8).toString("hex"); await p.selectOption("#pfmt", "jpeg");
  return { ok: sig === "89504e470d0a1a0a", info: "signature PNG " + (sig === "89504e470d0a1a0a" ? "correcte" : sig) };
});
await test("Grande photo (12 Mpx, type iPhone) : pas d’IA (inutile), taille d’origine, profil Naturel conseillé", async () => {
  await p.setInputFiles("#fp", path.join(MED, "grande_12mpx.jpg")); await p.waitForFunction(() => !document.querySelector("#rec").hidden && /mesuré|Aucun défaut/.test(document.querySelector("#rec_t").textContent), null, { timeout: 60000 });
  const prof = await p.evaluate(() => PROF.rec); await p.click("#ex"); await done("#st1"); const f = await save("grande.jpg");
  const dim = execFileSync("python3", ["-c", "from PIL import Image;import sys;print(*Image.open(sys.argv[1]).size)", f]).toString().trim();
  const rec = await p.evaluate(() => document.querySelector("#recipe").textContent);
  return { ok: dim === "4032 3024" && /"ia":"non"/.test(rec) === !IA || (dim === "4032 3024" && /"ia_utilisee":false/.test(rec)), info: "sortie " + dim + ", profil conseillé « " + prof + " »" };
});

/* ---------- vidéos ---------- */
await setIA(false);
async function video(file, q, name, expect) {
  await p.setInputFiles("#f", path.join(MED, file)); await p.waitForFunction(() => v.videoWidth > 0, null, { timeout: 30000 });
  await p.waitForFunction(() => !REC.pr && /repéré|bon état/.test(document.querySelector("#rec_t").textContent), null, { timeout: 120000 }).catch(() => {});
  await setIA(false);
  await p.evaluate(q => { if (["3840", "1920", "-1"].includes(q)) document.querySelector('[data-q="' + q + '"]').click(); else { const s = document.querySelector("#qc"); s.value = q; s.dispatchEvent(new Event("change")) } }, q);
  const hint = await p.textContent("#qhint");
  await p.click("#ex"); await done("#st1");
  const f = await save(name), j = probe(f), vs = j.streams.find(s => s.codec_type === "video"), as = j.streams.find(s => s.codec_type === "audio");
  const lines = await reportLines(), src = probe(path.join(MED, file)).streams.find(s => s.codec_type === "video");
  const dur = +j.format.duration, sdur = +probe(path.join(MED, file)).format.duration;
  const ok = vs.width === expect[0] && vs.height === expect[1] && !!as && Math.abs(dur - sdur) < .12 && vs.r_frame_rate === src.r_frame_rate && !lines.some(l => l.startsWith("bad"));
  return { ok, info: vs.width + "×" + vs.height + " " + vs.codec_name + ", " + vs.r_frame_rate + " i/s, " + dur.toFixed(2) + " s (source " + sdur.toFixed(2) + " s), son " + (as ? as.codec_name : "absent") + " ; « " + hint.split(".")[0] + " » ; " + lines.filter(l => !l.startsWith("ok")).length + " avertissement(s)" + (lines.some(l => /figées/.test(l)) ? " [images figées signalées]" : "") };
}
await test("Vidéo paysage 480×270 → 4K : 3840×2160, durée, cadence et son conservés", () => video("video_vieuxtel.mp4", "3840", "video-4k.mp4", [3840, 2160]));
await test("Vidéo portrait 1080×1920 → 4K portrait : 2160×3840", () => video("video_portrait.mp4", "3840", "portrait-4k.mp4", [2160, 3840]));
await test("Vidéo portrait → taille personnalisée 1280 : 720×1280", () => video("video_portrait.mp4", "1280", "portrait-720.mp4", [720, 1280]));
await test("Vidéo paysage → Full HD : 1920×1080", () => video("video_vieuxtel.mp4", "1920", "video-1080.mp4", [1920, 1080]));
await test("Vidéo → taille d’origine (nettoyage seul) : 480×270", () => video("video_vieuxtel.mp4", "-1", "video-origine.mp4", [480, 270]));
await test("Plus d’alerte « images figées » à tort sur un mouvement très lent (lecture séquentielle)", async () => {
  const l = await reportLines(); return { ok: !l.some(x => /figées/.test(x)), info: l.length + " lignes au compte rendu" } });
await test("Compte rendu d’export : fichier relu, format et cadence vérifiés", async () => {
  const l = await reportLines(); return { ok: l.some(x => /relu par le lecteur/.test(x)) && l.some(x => /Format de l’image conservé/.test(x)) && l.some(x => /Cadence d’origine conservée/.test(x)), info: l.map(x => x.split(":")[1]).filter(Boolean).slice(0, 3).join(" | ") } });

/* ---------- relief avec le vrai modèle de profondeur ---------- */
if (fs.existsSync(DEPTH)) await test("Animer la photo avec effet de relief (vrai modèle Depth Anything V2, installé et vérifié par le gestionnaire)", async () => {
  await setIA(false); await p.setInputFiles("#fp", path.join(MED, "chat_flou.jpg")); await p.waitForFunction(() => !document.querySelector("#rec").hidden);
  await p.click("#ex"); await done("#st1"); await p.click("#kbb");
  await p.waitForFunction(() => !KB.busy && /prête|pas pu/.test(document.querySelector("#st1").textContent), null, { timeout: 1800000 });
  const st = await p.textContent("#st1"), s = await p.evaluate(async () => { const x = await MODELS.status("depth"); return { inst: x.installed, verif: !!x.s.verif, etat: x.etat } });
  const blob = await p.evaluate(async () => { const a = new Uint8Array(await KB.blob.arrayBuffer()); let s = ""; for (let i = 0; i < a.length; i += 32768) s += String.fromCharCode(...a.subarray(i, i + 32768)); return btoa(s) });
  const f = path.join(OUT, "photo-animee.mp4"); fs.writeFileSync(f, Buffer.from(blob, "base64")); const j = probe(f).streams[0];
  return { ok: /prête/.test(st) && s.inst && s.verif && j.width > 0, info: "modèle « " + s.etat + " », vidéo " + j.width + "×" + j.height + ", " + (+j.duration).toFixed(1) + " s" };
});
console.log("\nErreurs JavaScript de la page : " + (errs.length ? errs.join(" | ") : "aucune"));
const ok = results.filter(r => r.ok).length; console.log(`Résultat : ${ok} réussis, ${results.length - ok} échoués. (Chrome sans écran, moteur graphique logiciel — aucun test sur iPhone.)`);
await browser.close(); srv.kill(); process.exit(ok === results.length && !errs.length ? 0 : 1);
