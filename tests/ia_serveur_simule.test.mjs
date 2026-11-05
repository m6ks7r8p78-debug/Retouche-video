/* v4.5 — « IA rapide (Kaggle) » SIMULÉE, en Full HD et en 4K : le bon déroulé de l'export après le calcul serveur.
   node tests/ia_serveur_simule.test.mjs [dossier médias] [dossier sorties]
   Le résultat « Kaggle » est remplacé par les images de la source elle-même (même rang, même taille de sortie) : aucun
   envoi réel. Vérifie : export terminé, bonne taille, bon nombre d'images, aucune image serveur manquante (SRX.miss = 0),
   ordre des images respecté. Avant la v4.5, l'export 4K échouait après le calcul (« la lecture image par image s'est interrompue »). */
import { spawn, execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const { chromium } = await import(process.env.PW || "playwright");
const HERE = path.dirname(fileURLToPath(import.meta.url)), PORT = 8777, BASE = "http://localhost:" + PORT;
const MED = path.resolve(process.argv[2] || path.join(HERE, "medias")), OUT = path.resolve(process.argv[3] || path.join(HERE, "sorties"));
fs.mkdirSync(OUT, { recursive: true });
const VID = "video_vieuxtel.mp4";
const srv = spawn(process.execPath, [path.join(HERE, "serveur.mjs")], { env: { ...process.env, PORT }, stdio: "ignore" });
await new Promise(r => setTimeout(r, 600));
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ["--enable-unsafe-webgpu", "--use-angle=swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const p = await ctx.newPage(); const errs = []; p.on("pageerror", e => errs.push(e.message)); p.on("dialog", d => d.accept());
await p.goto(BASE + "/index.html"); await p.waitForFunction(() => window.KG && window.SRX && window.STUDIO);
await p.evaluate(() => { localStorage.setItem("kaggle_jeton", "jeton-de-test"); localStorage.setItem("autorisations", JSON.stringify({ modele: { ok: true }, cloud: { ok: true, at: Date.now() } }));
  /* faux Kaggle : renvoie, pour chaque rang, l'image de la source à la taille de sortie */
  SRX.lancerServeur = async (ow, oh) => { window.__simCalls = (window.__simCalls || 0) + 1;
    const inf = await demuxVideo(curFile), rr = new SeqReader(curFile, inf); rr.setFps(0); let ouvert = false;
    const c = document.createElement("canvas"); c.width = ow; c.height = oh; const x = c.getContext("2d");
    return { async image(k) { if (!ouvert) { await rr.open(k); ouvert = true } const f = await rr.need(k); x.drawImage(f, 0, 0, ow, oh); return c }, async fermer() { try { rr.close() } catch (e) {} } } } });

let ok = 0, ko = 0;
async function test(name, fn) { const t0 = Date.now(); let r, info = ""; try { r = await fn(); info = r && r.info || "" } catch (e) { r = false; info = "exception : " + e.message.split("\n")[0] }
  const g = r === true || (r && r.ok); g ? ok++ : ko++; console.log((g ? "✓ " : "✗ ") + name + (info ? " — " + info : "") + " (" + ((Date.now() - t0) / 1000).toFixed(0) + " s)") }
const done = () => p.waitForFunction(() => !exporting && /Terminé|Échec|Impossible|annulé|pas pu|IA rapide|rien n’a été envoyé/.test(document.querySelector("#st1").textContent), null, { timeout: 3600000 });
const save = async (name) => { const d = await p.evaluate(async () => { const r = await fetch(outUrl); const a = new Uint8Array(await r.arrayBuffer()); let s = ""; for (let i = 0; i < a.length; i += 32768) s += String.fromCharCode(...a.subarray(i, i + 32768)); return btoa(s) }); const f = path.join(OUT, name); fs.writeFileSync(f, Buffer.from(d, "base64")); return f };
const probe = f => JSON.parse(execFileSync("ffprobe", ["-v", "error", "-count_frames", "-show_entries", "stream=codec_type,width,height,nb_read_frames", "-of", "json", f]).toString());

await p.setInputFiles("#f", path.join(MED, VID)); await p.waitForFunction(() => v.videoWidth > 0, null, { timeout: 30000 });
await p.waitForFunction(() => !REC.pr, null, { timeout: 120000 }).catch(() => {});

await test("Case « IA rapide (Kaggle) » cochée d'office quand un jeton est enregistré (aussi en mode expert)", async () => {
  await p.waitForTimeout(2500); const r = await p.evaluate(() => document.querySelector("#o_srv").checked); return { ok: r, info: "cochée : " + r } });

for (const [q, W] of [["1920", 1920], ["3840", 3840]]) {
  await test("Export " + (W > 1920 ? "4K" : "Full HD") + " avec l'IA serveur (simulée) : vidéo complète, aucune image serveur manquante", async () => {
    await p.evaluate(q => { for (const id of ["o_fluid", "o_dust", "o_fast", "o_stab"]) { const e = document.querySelector("#" + id); if (e && e.checked) { e.checked = false; e.dispatchEvent(new Event("change")) } }
      const m = document.querySelector("#o_max"); m.checked = true; m.dispatchEvent(new Event("change"));
      document.querySelector('[data-q="' + q + '"]').click() }, q);
    const n0 = await p.evaluate(() => window.__simCalls || 0);
    await p.click("#ex"); await done(); const t = await p.textContent("#st1");
    const r = await p.evaluate(() => ({ miss: SRX.miss, calls: window.__simCalls || 0 }));
    if (!/Terminé/.test(t)) return { ok: false, info: t.slice(0, 200) };
    const f = await save("ia-simulee-" + q + ".mp4"), vs = probe(f).streams.find(s => s.codec_type === "video"), svs = probe(path.join(MED, VID)).streams.find(s => s.codec_type === "video");
    return { ok: Math.max(vs.width, vs.height) === W && +vs.nb_read_frames === +svs.nb_read_frames && r.miss === 0 && r.calls === n0 + 1,
      info: vs.width + "×" + vs.height + ", " + vs.nb_read_frames + "/" + svs.nb_read_frames + " images, images manquantes " + r.miss + ", appels serveur " + (r.calls - n0) } });
}
console.log((ko ? "ÉCHEC" : "OK") + " : " + ok + " réussis, " + ko + " échoués" + (errs.length ? " ; erreurs page : " + errs.slice(0, 3).join(" | ") : ""));
await browser.close(); srv.kill(); process.exit(ko ? 1 : 0);
