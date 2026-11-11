/* v6.6 : l'iPhone peut retirer le moteur graphique (WebGL) quand sa mémoire est saturée — vu dans les diagnostics sur des vidéos 4K
   (« Canvas has no frame » sur tous les exports suivants). Ce test retire le moteur exprès et vérifie que l'app s'en remet.
   node tests/moteur_graphique.test.mjs */
import { spawn, execFileSync as X } from "child_process";
import fs from "fs"; import path from "path"; import os from "os"; import { fileURLToPath } from "url";
const { chromium } = await import(process.env.PW || "playwright");
const HERE = path.dirname(fileURLToPath(import.meta.url)), PORT = 8774, D = fs.mkdtempSync(path.join(os.tmpdir(), "glp-"));
const SRC = path.join(D, "src.mp4");
X("ffmpeg", ["-v", "error", "-y", "-loop", "1", "-i", path.join(HERE, "medias", "ref_cafe.png"), "-t", "4", "-vf", "scale=1280:-2,crop=640:360:'(iw-640)*t/4':'(ih-360)*t/4',format=yuv420p", "-r", "30", "-c:v", "libx264", "-g", "30", SRC]);
const srv = spawn(process.execPath, [path.join(HERE, "serveur.mjs")], { env: { ...process.env, PORT }, stdio: "ignore" }); await new Promise(r => setTimeout(r, 600));
const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ["--use-angle=swiftshader"] });
const p = await b.newPage({ viewport: { width: 390, height: 844 } }); const errs = []; p.on("pageerror", e => errs.push(e.message));
await p.goto("http://localhost:" + PORT + "/index.html"); await p.waitForFunction(() => window.MODELS && window.SR && typeof glPerdu === "function");
const res = []; const test = async (n, f) => { let ok = false, info = ""; try { const r = await f(); ok = r.ok; info = r.info } catch (e) { info = "exception : " + e.message.split("\n")[0] } res.push(ok); console.log((ok ? "✓ " : "✗ ") + n + " — " + info) };
/* attente par interrogation (waitForFunction s'appuie sur l'affichage, qui peut être suspendu quand le moteur est retiré) */
const attendre = async (f, ms, quoi) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await p.evaluate(f).catch(() => false)) return; await p.waitForTimeout(100) } throw new Error("attente dépassée : " + quoi + " — " + await p.evaluate(() => "glLost=" + glLost + " isLost=" + gl.isContextLost()).catch(e => e.message)) };
const fini = () => attendre(() => !exporting && /Terminé|Échec|Impossible|annulé|pas pu/.test(document.querySelector("#st1").textContent), 600000, "fin de l'export");
/* moyenne et écart des couleurs de l'image affichée (une image noire ou vide donne 0 / 0) */
const mesure = () => p.evaluate(() => { draw(); const c = document.createElement("canvas"); c.width = 64; c.height = 36; const x = c.getContext("2d"); x.drawImage(cv, 0, 0, 64, 36); const d = x.getImageData(0, 0, 64, 36).data; let s = 0, s2 = 0, n = 0; for (let i = 0; i < d.length; i += 4) { const y = (d[i] + d[i + 1] + d[i + 2]) / 3; s += y; s2 += y * y; n++ } const m = s / n; return { m: +m.toFixed(2), e: +Math.sqrt(Math.max(0, s2 / n - m * m)).toFixed(2), sig: Array.from(d.filter((_, i) => i % 97 === 0)).join(",") } });
const video = async (o) => { const buf = Buffer.from(await p.evaluate(async () => { const a = new Uint8Array(await outBlob.arrayBuffer()); let s = ""; for (let i = 0; i < a.length; i += 32768) s += String.fromCharCode(...a.subarray(i, i + 32768)); return btoa(s) }), "base64"); fs.writeFileSync(o, buf);
  const n = +X("ffprobe", ["-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=nb_read_frames", "-of", "csv=p=0", o]).toString();
  /* luminance moyenne de chaque image : une image noire (moteur retiré) se verrait tout de suite */
  const ys = X("ffmpeg", ["-v", "error", "-i", o, "-vf", "scale=16:9,format=gray", "-f", "rawvideo", "-"], { maxBuffer: 1 << 28 }); const moy = []; for (let i = 0; i + 144 <= ys.length; i += 144) { let s = 0; for (let k = 0; k < 144; k++)s += ys[i + k]; moy.push(s / 144) }
  return { n, min: Math.min(...moy), moy } };
console.log("· page prête");
await p.setInputFiles("#f", SRC); await p.waitForFunction(() => v.videoWidth > 0, null, { timeout: 30000 });
await p.waitForFunction(() => !REC.pr && /repéré|bon état/.test(document.querySelector("#rec_t").textContent), null, { timeout: 120000 }).catch(() => {});
console.log("· vidéo chargée");
await p.evaluate(() => { v.pause(); v.currentTime = 1 }); await p.waitForTimeout(800); console.log("· prêt à mesurer");
let avant, ref;
await test("Aperçu : après retrait puis retour du moteur graphique, l'image est exactement la même", async () => {
  avant = await mesure();
  await p.evaluate(() => { window.__ext = gl.getExtension("WEBGL_lose_context"); window.__ext.loseContext() }); await attendre(() => glPerdu(), 10000, "retrait du moteur");
  const perdu = await p.evaluate(() => glPerdu()); await p.evaluate(() => window.__ext.restoreContext()); await attendre(() => !glPerdu(), 10000, "retour du moteur"); await p.waitForTimeout(300);
  const apres = await mesure();
  return { ok: perdu && avant.e > 3 && apres.sig === avant.sig, info: "avant : moyenne " + avant.m + ", écart " + avant.e + " ; après : moyenne " + apres.m + ", écart " + apres.e + (apres.sig === avant.sig ? " ; pixels identiques" : " ; PIXELS DIFFÉRENTS") } });
await test("Export de référence (sans incident)", async () => { await p.selectOption("#q", "1080").catch(() => {}); await p.click("#ex"); await fini(); const t = await p.textContent("#st1"); ref = await video(path.join(D, "ref.mp4")); return { ok: /Terminé/.test(t) && ref.n >= 115 && ref.min > 8, info: ref.n + " images, image la plus sombre : " + ref.min.toFixed(1) } });
await test("Export : moteur retiré en plein milieu → l'export reprend à la même image et se termine, aucune image noire ni perdue", async () => {
  await p.evaluate(() => { window.__coup = 0; const t = setInterval(() => { const m = /(\d+) ?%/.exec(document.querySelector("#st1").textContent); if (exporting && m && +m[1] >= 35 && !window.__coup) { window.__coup = 1; clearInterval(t); const e = gl.getExtension("WEBGL_lose_context"); e.loseContext(); setTimeout(() => e.restoreContext(), 700) } }, 20) });
  await p.click("#ex"); await fini(); const t = await p.textContent("#st1"), coup = await p.evaluate(() => window.__coup), rep = await p.evaluate(() => window.__glN);
  const o = await video(path.join(D, "coupe.mp4")); let ecart = 0; for (let i = 0; i < Math.min(o.moy.length, ref.moy.length); i++)ecart = Math.max(ecart, Math.abs(o.moy[i] - ref.moy[i]));
  return { ok: /Terminé/.test(t) && coup === 1 && rep >= 1 && o.n === ref.n && ecart < 1.5, info: (coup ? "moteur retiré pendant l'export, " + rep + " reprise(s)" : "LE MOTEUR N'A PAS ÉTÉ RETIRÉ") + " ; " + o.n + " images (référence " + ref.n + ") ; écart maximal de luminosité avec la référence : " + ecart.toFixed(2) + " ; « " + t.slice(0, 60) + " »" } });
await test("Moteur absent au lancement d'un export → l'app attend son retour au lieu d'échouer", async () => {
  await p.evaluate(() => { const e = gl.getExtension("WEBGL_lose_context"); e.loseContext(); setTimeout(() => e.restoreContext(), 1500) }); await attendre(() => glPerdu(), 10000, "retrait du moteur");
  await p.click("#ex"); await fini(); const t = await p.textContent("#st1"); const o = await video(path.join(D, "attente.mp4"));
  return { ok: /Terminé/.test(t) && o.n === ref.n && o.min > 8, info: o.n + " images ; « " + t.slice(0, 60) + " »" } });
await test("Moteur qui ne revient pas → message clair, et l'export suivant fonctionne une fois le moteur revenu", async () => {
  await p.evaluate(() => { window.__e2 = gl.getExtension("WEBGL_lose_context"); window.__e2.loseContext(); window.glPret0 = glPret }); await attendre(() => glPerdu(), 10000, "retrait du moteur");
  await p.click("#ex"); await fini(); const t = await p.textContent("#st1");
  await p.evaluate(() => window.__e2.restoreContext()); await attendre(() => !glPerdu(), 10000, "retour du moteur"); await p.click("#ex"); await fini(); const t2 = await p.textContent("#st1");
  return { ok: /mémoire graphique/.test(t) && /Terminé/.test(t2), info: "« " + t.slice(0, 90) + "… » puis « " + t2.slice(0, 40) + " »" } });
console.log("Erreurs JavaScript : " + (errs.length ? errs.join(" | ") : "aucune"));
console.log(`Résultat : ${res.filter(Boolean).length} réussis, ${res.filter(x => !x).length} échoués.`); await b.close(); srv.kill(); fs.rmSync(D, { recursive: true, force: true }); process.exit(res.every(Boolean) && !errs.length ? 0 : 1);
