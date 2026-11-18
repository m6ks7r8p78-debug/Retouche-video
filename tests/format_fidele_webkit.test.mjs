/* v8.7 — « Changer de format » comme sur iPhone : WebKit (moteur de Safari) en émulation iPhone 15 Pro Max, envoi par le bouton de
   l'accueil, analyse AUTOMATIQUE (aucun clic), export. Cas : vidéo ordinaire, vidéo de téléphone avec rotation (portrait stocké couché),
   plusieurs scènes. node tests/format_fidele_webkit.test.mjs   (PW=<playwright>/index.mjs ; WebKit : npx playwright install webkit) */
import { spawn, execFileSync } from "child_process"; import fs from "fs"; import path from "path"; import { fileURLToPath } from "url";
const HERE = path.dirname(fileURLToPath(import.meta.url)), MED = path.join(HERE, "medias", "fidele"), OUT = path.join(HERE, "sorties", "format_fidele_webkit"); fs.mkdirSync(OUT, { recursive: true });
const ROT = path.join(MED, "telephone_rotation.mp4"); if (!fs.existsSync(ROT)) { const t = path.join(OUT, "couche.mov"); execFileSync("ffmpeg", ["-v", "error", "-y", "-i", path.join(MED, "classe_1080x1920.mp4"), "-vf", "transpose=2,scale=1280:720", "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", "-f", "mov", t]); execFileSync("ffmpeg", ["-v", "error", "-y", "-display_rotation", "90", "-i", t, "-c", "copy", ROT]) }
const pw = await import(process.env.PW || "playwright"), srv = spawn(process.execPath, [path.join(HERE, "serveur.mjs")], { env: { ...process.env, PORT: 8820 }, stdio: "ignore" }); await new Promise(r => setTimeout(r, 700));
const b = await pw.webkit.launch(), p = await (await b.newContext({ ...pw.devices["iPhone 15 Pro Max"] })).newPage(), errs = []; p.on("pageerror", e => errs.push(e.message)); p.on("dialog", d => d.accept());
await p.goto("http://localhost:8820/index.html"); await p.waitForFunction(() => window.chargerModule); await p.evaluate(() => localStorage.setItem("autorisations", JSON.stringify({ modele: { ok: true } })));
const res = [], test = async (n, f) => { let ok = false, info = ""; const t0 = Date.now(); try { const r = await f(); ok = r.ok; info = r.info } catch (e) { info = "exception : " + e.message.split("\n")[0] } res.push(ok); console.log((ok ? "✓ " : "✗ ") + n + " (" + Math.round((Date.now() - t0) / 1000) + " s)" + (info ? "\n    " + info : "")) };
async function envoyer(video, attendu) {
  await p.evaluate(() => { if (window.FMT) FMT.fermer() });
  const [fc] = await Promise.all([p.waitForEvent("filechooser"), p.evaluate(() => document.querySelector("#pickf").click())]); await fc.setFiles(video);
  await p.waitForFunction(() => window.FMT && FMT.etat && FMT.etat.pret && !FMT.etat.occupe, null, { timeout: 600000 }); const a = await p.evaluate(() => ({ msg: document.querySelector("#fmt_msg").textContent, ouverture: FMT.etat.ouverture, faux: !!FMT.etat.vid.faux, sortie: FMT.etat.sortie }));
  const avant = await p.evaluate(() => ({ occupe: FMT.etat.occupe, pret: FMT.etat.pret })); await p.evaluate(() => FMT.creer()); const e = await p.evaluate(() => { const r = FMT.etat.res; return r && { W: r.W, H: r.H, images: r.images, son: r.son, tech: r.tech.ok, ko: r.tech.controles.filter(c => !c.ok).map(c => c.texte), f: { id: r.fidele.identite.ok, max: r.fidele.max, visages: r.fidele.visages, viol: r.fidele.violations.length } } });
  const fin = await p.textContent("#fmt_msg");
  return { ok: !!e && e.W === attendu[0] && e.H === attendu[1] && e.tech && e.son && e.f.id && e.f.max <= 1.0005 && /rien d’inventé/.test(a.msg), info: JSON.stringify({ ouverture: a.ouverture, apercu_image_fixe: a.faux, sortie: a.sortie, export: e, fin, avant }) };
}
await test("Vidéo ordinaire : envoi depuis l'accueil → analyse automatique → export vérifié", () => envoyer(path.join(MED, "personnes_fixe.mp4"), [768, 432]));
await test("Vidéo de téléphone avec rotation (portrait stocké couché) : bien redressée, 720×1280 → 2276×1280", () => envoyer(ROT, [2276, 1280]));
await test("Plusieurs scènes", () => envoyer(path.join(MED, "scenes_multiples.mp4"), [1138, 640]));
console.log(errs.length ? "Erreurs de page : " + errs.join(" | ") : ""); await b.close(); srv.kill();
console.log(res.filter(Boolean).length + "/" + res.length + " réussis"); process.exit(res.every(Boolean) && !errs.length ? 0 : 1);
