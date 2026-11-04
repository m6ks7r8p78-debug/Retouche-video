/* Tests : remise en ordre automatique de morceaux de vidéo choisis dans le désordre.  node tests/reassemblage.test.mjs
   Crée une vidéo continue (panoramique sur une photo), la coupe en morceaux sans réencodage (comme un téléphone),
   mélange les noms, efface les dates, ajoute un doublon ; vérifie l'ordre retrouvé puis la vidéo regroupée. */
import { spawn, execFileSync as X } from "child_process";
import fs from "fs"; import path from "path"; import os from "os"; import { fileURLToPath } from "url";
const { chromium } = await import(process.env.PW || "playwright");
const HERE = path.dirname(fileURLToPath(import.meta.url)), PORT = 8772, D = fs.mkdtempSync(path.join(os.tmpdir(), "segm-"));
const ff = a => X("ffmpeg", ["-v", "error", "-y", ...a]);
ff(["-loop", "1", "-i", path.join(HERE, "medias", "ref_cafe.png"), "-t", "10", "-vf", "scale=1280:-2,crop=640:360:'(iw-640)*t/10':'(ih-360)*t/10',format=yuv420p", "-r", "30", "-c:v", "libx264", "-g", "30", "-keyint_min", "30", "-sc_threshold", "0", path.join(D, "src.mp4")]);
ff(["-i", path.join(D, "src.mp4"), "-c", "copy", "-f", "segment", "-segment_time", "2", "-reset_timestamps", "1", "-map_metadata", "-1", path.join(D, "s%d.mp4")]);
const names = ["plage.mp4", "IMG_A.mp4", "souvenir.mp4", "video.mp4", "zz.mp4"], segs = fs.readdirSync(D).filter(f => /^s\d\.mp4$/.test(f)).sort();
const shuffled = [3, 0, 4, 1, 2].map(i => segs[i]); const files = shuffled.map((s, k) => { const n = path.join(D, names[k]); fs.renameSync(path.join(D, s), n); return n });
const truth = segs.map(s => names[shuffled.indexOf(s)]); fs.copyFileSync(files[1], path.join(D, "copie.mp4")); files.push(path.join(D, "copie.mp4"));
const srv = spawn(process.execPath, [path.join(HERE, "serveur.mjs")], { env: { ...process.env, PORT }, stdio: "ignore" }); await new Promise(r => setTimeout(r, 600));
const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ["--use-angle=swiftshader"] });
const p = await b.newPage(); const errs = []; p.on("pageerror", e => errs.push(e.message));
await p.goto("http://localhost:" + PORT + "/index.html"); await p.waitForFunction(() => typeof MG !== "undefined" && typeof RA !== "undefined");
const res = []; const test = async (n, f) => { let ok = false, info = ""; try { const r = await f(); ok = r.ok; info = r.info } catch (e) { info = "exception : " + e.message.split("\n")[0] } res.push(ok); console.log((ok ? "✓ " : "✗ ") + n + " — " + info) };
let r;
await test("Ordre retrouvé pour 5 morceaux mélangés, noms trompeurs, dates effacées", async () => {
  await p.setInputFiles("#fm", files); await p.waitForFunction(n => MG.files.length === n, files.length);
  r = await p.evaluate(() => RA.run()); const got = r.order.map(n => n === "copie.mp4" ? "IMG_A.mp4" : n); /* l'original ou sa copie : identiques */
  return { ok: JSON.stringify(got) === JSON.stringify(truth), info: r.order.join(" → ") + (JSON.stringify(got) === JSON.stringify(truth) ? "" : " (attendu " + truth.join(" → ") + ")") } });
await test("Doublon repéré et retiré", async () => ({ ok: r && r.dup === 1 && r.order.length === 5 && r.order.includes("copie.mp4") !== r.order.includes("IMG_A.mp4"), info: (r ? r.dup : "?") + " doublon, " + (r ? r.order.length : "?") + " morceaux gardés" }));
await test("Rapport affiché avec niveau de confiance", async () => { const t = await p.textContent("#mgrep"); return { ok: /Ordre proposé/.test(t) && /Confiance/.test(t) && /doublon/.test(t), info: (r && r.sure ? "confiance bonne" : "confiance faible") } });
await test("Regroupement : une seule vidéo de 10 s sans réencodage", async () => {
  await p.evaluate(() => document.querySelector("#mggo").click()); await p.waitForFunction(() => MG.blob, null, { timeout: 120000 });
  const buf = Buffer.from(await p.evaluate(async () => { const a = new Uint8Array(await MG.blob.arrayBuffer()); let s = ""; for (let i = 0; i < a.length; i += 32768) s += String.fromCharCode(...a.subarray(i, i + 32768)); return btoa(s) }), "base64");
  const o = path.join(D, "out.mp4"); fs.writeFileSync(o, buf); const d = +X("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", o]).toString();
  const same = X("ffmpeg", ["-v", "error", "-i", o, "-map", "0:v", "-f", "md5", "-"]).toString() === X("ffmpeg", ["-v", "error", "-i", path.join(D, "src.mp4"), "-map", "0:v", "-f", "md5", "-"]).toString();
  return { ok: Math.abs(d - 10) < .15 && same, info: "durée " + d.toFixed(2) + " s ; images identiques à la vidéo d’origine : " + (same ? "oui" : "non") } });
await test("Morceau manquant : trou signalé, et ordre juste OU confiance faible avec demande de vérification", async () => {
  await p.evaluate(() => { MG.files = []; MG.render() }); await p.setInputFiles("#fm", files.filter(f => !f.endsWith(truth[2]) && !f.endsWith("copie.mp4"))); await p.waitForFunction(() => MG.files.length === 4);
  const q = await p.evaluate(() => RA.run()); const t = await p.textContent("#mgrep");
  const juste = JSON.stringify(q.order) === JSON.stringify(truth.filter((x, i) => i !== 2));
  return { ok: /manque peut-être/.test(t) && (juste || (!q.sure && /Vérifie l’ordre/.test(t))), info: (juste ? "ordre juste ; " : "ordre incertain, l’app demande de vérifier ; ") + q.order.join(" → ") + (/manque/.test(t) ? " ; trou signalé" : " ; trou NON signalé") } });
console.log("Erreurs JavaScript : " + (errs.length ? errs.join(" | ") : "aucune"));
console.log(`Résultat : ${res.filter(Boolean).length} réussis, ${res.filter(x => !x).length} échoués.`); await b.close(); srv.kill(); fs.rmSync(D, { recursive: true, force: true }); process.exit(res.every(Boolean) && !errs.length ? 0 : 1);
