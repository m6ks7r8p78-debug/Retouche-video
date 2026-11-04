/* v3.4 — « IA rapide sur serveur (Kaggle) », de bout en bout avec le VRAI Kaggle et le VRAI relais (aucune simulation).
   KAGGLE_JETON=… node tests/ia_serveur.test.mjs [dossier médias] [dossier sorties]
   (jeton lu sinon dans ~/.kaggle/access_token). Utilise le quota GPU du compte (quelques minutes).
   Vérifie : refus sans jeton et refus de l'envoi = aucune requête à Kaggle ; export Full HD complet avec l'IA calculée sur
   Kaggle (taille, nombre d'images, durée, son) ; chaque image exportée correspond à la bonne image de la source (aucun
   décalage) ; aucune image manquante ; rien ne reste chez Kaggle après coup. */
import { spawn, execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
const { chromium } = await import(process.env.PW || "playwright");
const HERE = path.dirname(fileURLToPath(import.meta.url)), PORT = 8776, BASE = "http://localhost:" + PORT;
const MED = path.resolve(process.argv[2] || path.join(HERE, "medias")), OUT = path.resolve(process.argv[3] || path.join(HERE, "sorties"));
fs.mkdirSync(OUT, { recursive: true });
const JETON = process.env.KAGGLE_JETON || (() => { try { return fs.readFileSync(path.join(os.homedir(), ".kaggle", "access_token"), "utf8").trim() } catch (e) { return "" } })();
if (!JETON) { console.log("Jeton Kaggle absent (KAGGLE_JETON ou ~/.kaggle/access_token)."); process.exit(2) }
const VID = "video_vieuxtel.mp4";
const srv = spawn(process.execPath, [path.join(HERE, "serveur.mjs")], { env: { ...process.env, PORT }, stdio: "ignore" });
await new Promise(r => setTimeout(r, 600));
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ["--enable-unsafe-webgpu", "--use-angle=swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const p = await ctx.newPage(); const errs = []; p.on("pageerror", e => errs.push(e.message));
let kg = 0; p.on("request", r => { if (/kaggle|retouche-kaggle|googleapis\.com\/upload/.test(r.url())) kg++ });
let repondre = true; p.on("dialog", d => repondre ? d.accept() : d.dismiss());
await p.goto(BASE + "/index.html"); await p.waitForFunction(() => window.KG && window.SRX && window.STUDIO);
await p.evaluate(() => { localStorage.removeItem("kaggle_jeton"); localStorage.setItem("autorisations", JSON.stringify({ modele: { ok: true }, cloud: { ok: true, at: Date.now() } })) });

let ok = 0, ko = 0; const t00 = Date.now();
async function test(name, fn) { const t0 = Date.now(); let r, info = ""; try { r = await fn(); info = r && r.info || "" } catch (e) { r = false; info = "exception : " + e.message.split("\n")[0] }
  const g = r === true || (r && r.ok); g ? ok++ : ko++; console.log((g ? "✓ " : "✗ ") + name + (info ? " — " + info : "") + " (" + ((Date.now() - t0) / 1000).toFixed(0) + " s)") }
const done = () => p.waitForFunction(() => !exporting && /Terminé|Échec|Impossible|annulé|pas pu|IA rapide|rien n’a été envoyé/.test(document.querySelector("#st1").textContent), null, { timeout: 3600000 });
const st = () => p.textContent("#st1");
const save = async (name) => { const d = await p.evaluate(async () => { const r = await fetch(outUrl); const a = new Uint8Array(await r.arrayBuffer()); let s = ""; for (let i = 0; i < a.length; i += 32768) s += String.fromCharCode(...a.subarray(i, i + 32768)); return btoa(s) }); const f = path.join(OUT, name); fs.writeFileSync(f, Buffer.from(d, "base64")); return f };
const probe = f => JSON.parse(execFileSync("ffprobe", ["-v", "error", "-count_frames", "-show_entries", "stream=codec_type,width,height,r_frame_rate,nb_read_frames", "-show_entries", "format=duration", "-of", "json", f]).toString());
async function preparer() {
  await p.setInputFiles("#f", path.join(MED, VID)); await p.waitForFunction(() => v.videoWidth > 0, null, { timeout: 30000 });
  await p.waitForFunction(() => !REC.pr, null, { timeout: 120000 }).catch(() => {});
  await p.evaluate(() => { for (const id of ["o_fluid", "o_dust", "o_fast"]) { const e = document.querySelector("#" + id); if (e && e.checked) { e.checked = false; e.dispatchEvent(new Event("change")) } }
    const m = document.querySelector("#o_max"); m.checked = true; m.dispatchEvent(new Event("change"));
    const s = document.querySelector("#o_srv"); s.checked = true; s.dispatchEvent(new Event("change"));
    document.querySelector('[data-q="1920"]').click() });
}

await test("Sans jeton Kaggle : l'export s'arrête avec la marche à suivre, rien n'est envoyé", async () => {
  await preparer(); kg = 0; await p.click("#ex"); await done(); const t = await st();
  return { ok: /jeton Kaggle/.test(t) && kg === 0, info: "requêtes Kaggle : " + kg + " ; « " + t.slice(0, 90) + " »" } });

await p.evaluate(j => localStorage.setItem("kaggle_jeton", j), JETON);
await test("Envoi refusé dans la fenêtre d'accord : rien n'est envoyé", async () => {
  repondre = false; kg = 0; await p.click("#ex"); await done(); repondre = true; const t = await st();
  return { ok: /rien n’a été envoyé/.test(t) && kg <= 1, info: "requêtes Kaggle : " + kg + " (lecture du compte seulement) ; « " + t.slice(0, 80) + " »" } });

let sortie = null;
await test("Export Full HD avec l'IA calculée sur Kaggle : vidéo complète, bonne taille, bon nombre d'images, son présent", async () => {
  const t0 = Date.now(); await p.click("#ex"); await done(); const t = await st();
  if (!/Terminé/.test(t)) return { ok: false, info: t.slice(0, 200) };
  sortie = await save("ia-serveur-1080p.mp4"); const j = probe(sortie), vs = j.streams.find(s => s.codec_type === "video"), as = j.streams.find(s => s.codec_type === "audio");
  const src = probe(path.join(MED, VID)), svs = src.streams.find(s => s.codec_type === "video");
  const r = await p.evaluate(() => ({ ia: window.__iaServeur, miss: SRX.miss, rec: document.querySelector("#recipe").textContent }));
  return { ok: vs.width === 1920 && vs.height === 1080 && +vs.nb_read_frames === +svs.nb_read_frames && !!as && Math.abs(+j.format.duration - +src.format.duration) < .12 && r.miss === 0 && r.ia && r.ia.images === +svs.nb_read_frames,
    info: vs.width + "×" + vs.height + ", " + vs.nb_read_frames + "/" + svs.nb_read_frames + " images, " + (+j.format.duration).toFixed(2) + " s, son " + (as ? "oui" : "non") + " ; serveur : " + JSON.stringify(r.ia) + " ; total " + ((Date.now() - t0) / 60000).toFixed(1) + " min" } });

await test("Ordre des images : chaque image exportée correspond à la bonne image de la source (aucun décalage)", async () => {
  if (!sortie) return { ok: false, info: "pas de vidéo" };
  const py = `
import subprocess, numpy as np, sys
def lire(f):
    r = subprocess.run(["ffmpeg","-loglevel","error","-i",f,"-vf","scale=48:27:flags=area,format=gray","-fps_mode","passthrough","-f","rawvideo","-"],capture_output=True).stdout
    return np.frombuffer(r,np.uint8).reshape(-1,27,48).astype(float)
A, B = lire(sys.argv[1]), lire(sys.argv[2]); n = min(len(A), len(B)); bad = 0; pires = []
for i in range(2, n-2, 7):
    e = [np.abs(A[i]-B[i+d]).mean() for d in (-2,-1,0,1,2)]
    if int(np.argmin(e)) != 2 and e[2] - min(e) > 0.5: bad += 1; pires.append(i)
print(bad, n, pires[:5])`;
  const o = execFileSync("python3", ["-c", py, path.join(MED, VID), sortie]).toString().trim().split(" ");
  return { ok: o[0] === "0", info: "images contrôlées toutes les 7 : décalages trouvés " + o[0] + " sur " + o[1] + " images" } });

await test("Ménage : plus aucun jeu de données ni calcul « retouche-ia-… » de ce test chez Kaggle", async () => {
  const r = await p.evaluate(async () => { const u = await KG.moi();
    const k = await KG._api("kernels.KernelsApiService", "ListKernels", { user: u, pageSize: 50, search: "retouche ia" });
    const d = await KG._api("datasets.DatasetApiService", "ListDatasets", { user: u, pageSize: 50, search: "retouche ia" });
    const re = new RegExp("/" + KG.dernier + "(-donnees)?$"); return { slug: KG.dernier, k: (k.kernels || []).map(x => x.ref).filter(x => re.test(x)), d: (d.datasets || []).map(x => x.ref).filter(x => re.test(x)) } });
  return { ok: !!r.slug && !r.k.length && !r.d.length, info: "calcul de ce test « " + r.slug + " » — calculs restants : " + (r.k.join(", ") || "aucun") + " ; jeux de données restants : " + (r.d.join(", ") || "aucun") } });

await test("Aucune erreur JavaScript", async () => ({ ok: errs.length === 0, info: errs.join(" | ").slice(0, 200) || "aucune" }));
console.log("\nRésultat : " + ok + " réussis, " + ko + " échoués (" + ((Date.now() - t00) / 60000).toFixed(1) + " min).");
await browser.close(); srv.kill(); process.exit(ko ? 1 : 0);
