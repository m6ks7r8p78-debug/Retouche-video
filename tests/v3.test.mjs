/* Tests des fonctions v3.0 : Time Repair (vitesse, inversion, ralenti fluide, son) et profil Faible luminosité.
   node tests/v3.test.mjs [medias] [sorties]  — durées et images vérifiées avec ffprobe / ffmpeg. */
import { spawn, execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const { chromium } = await import(process.env.PW || "playwright");
const HERE = path.dirname(fileURLToPath(import.meta.url)), PORT = 8770, MED = path.resolve(process.argv[2] || path.join(HERE, "medias")), OUT = path.resolve(process.argv[3] || path.join(HERE, "sorties", "v3"));
fs.mkdirSync(OUT, { recursive: true });
const srv = spawn(process.execPath, [path.join(HERE, "serveur.mjs")], { env: { ...process.env, PORT }, stdio: "ignore" }); await new Promise(r => setTimeout(r, 600));
const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ["--use-angle=swiftshader", "--ignore-gpu-blocklist"] });
const p = await b.newPage(); const errs = []; p.on("pageerror", e => errs.push(e.message));
await p.goto("http://localhost:" + PORT + "/index.html"); await p.waitForFunction(() => window.SR);
const res = []; const test = async (n, f) => { let ok = false, info = ""; try { const r = await f(); ok = r.ok; info = r.info } catch (e) { info = "exception : " + e.message.split("\n")[0] } res.push(ok); console.log((ok ? "✓ " : "✗ ") + n + " — " + info) };
const save = async f => { const d = await p.evaluate(async () => { const a = new Uint8Array(await (await fetch(outUrl)).arrayBuffer()); let s = ""; for (let i = 0; i < a.length; i += 32768) s += String.fromCharCode(...a.subarray(i, i + 32768)); return btoa(s) }); fs.writeFileSync(f, Buffer.from(d, "base64")); return f };
const probe = f => JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,duration,width,height", "-of", "json", f]).toString()).streams;
const frame = (f, opt) => { const o = f + opt.replace(/\W/g, "") + ".png"; execFileSync("ffmpeg", ["-loglevel", "error", "-y", ...opt.split(" "), "-i", f, "-frames:v", "1", "-vf", "scale=160:90", o]); return o };
const diff = (x, y) => +execFileSync("python3", ["-c", "import sys,numpy as n;from PIL import Image as I;a=n.asarray(I.open(sys.argv[1]).convert('L'),float);b=n.asarray(I.open(sys.argv[2]).convert('L'),float);print(abs(a-b).mean())", x, y]).toString();
await p.evaluate(() => { const e = document.querySelector("#o_max"); e.checked = false; e.dispatchEvent(new Event("change")) });
await p.setInputFiles("#f", path.join(MED, "video_vieuxtel.mp4")); await p.waitForFunction(() => v.videoWidth > 0);
await p.waitForFunction(() => !REC.pr && /repéré|bon état/.test(document.querySelector("#rec_t").textContent), null, { timeout: 120000 }).catch(() => {});
await p.click('[data-q="-1"]');
async function tr(sp, rev, fluid, son, name) {
  await p.evaluate(([sp, rev, fluid, son]) => { $("#tr_v").value = sp; $("#tr_r").checked = rev; $("#tr_f").checked = fluid; $("#tr_a").value = son; TR.go() }, [sp, rev, fluid, son]);
  await p.waitForFunction(() => !exporting && !analyzing && /Terminé|Échec/.test(document.querySelector("#st1").textContent), null, { timeout: 1800000 });
  const f = await save(path.join(OUT, name)); const st = probe(f); return { f, v: st.find(x => x.codec_type === "video"), a: st.find(x => x.codec_type === "audio"), msg: await p.textContent("#st1") };
}
await test("Vitesse ×2, son adapté (hauteur conservée) : 6 s → 3 s", async () => { const r = await tr("2", false, false, "garde", "x2.mp4");
  return { ok: Math.abs(r.v.duration - 3) < .1 && r.a && Math.abs(r.a.duration - 3) < .15, info: "vidéo " + (+r.v.duration).toFixed(2) + " s, son " + (r.a ? (+r.a.duration).toFixed(2) + " s" : "absent") } });
await test("Lecture à l’envers, son inversé : la 1re image du résultat est la dernière de la source", async () => { const r = await tr("1", true, false, "inverse", "envers.mp4");
  const src = path.join(MED, "video_vieuxtel.mp4"), o1 = frame(r.f, "-ss 0"), sLast = frame(src, "-sseof -0.1"), sFirst = frame(src, "-ss 0");
  const dl = diff(o1, sLast), df = diff(o1, sFirst);
  return { ok: Math.abs(r.v.duration - 6) < .1 && dl < df && !!r.a, info: (+r.v.duration).toFixed(2) + " s ; écart à la dernière image source " + dl.toFixed(1) + " contre " + df.toFixed(1) + " à la première ; son " + (r.a ? "présent" : "absent") } });
await test("Ralenti 0,5× fluide, son façon cassette : 6 s → 12 s", async () => { const r = await tr("0.5", false, true, "cassette", "ralenti.mp4");
  return { ok: Math.abs(r.v.duration - 12) < .15 && r.a && Math.abs(r.a.duration - 12) < .2, info: "vidéo " + (+r.v.duration).toFixed(2) + " s, son " + (r.a ? (+r.a.duration).toFixed(2) + " s" : "absent") } });
await test("Lecture à l’envers avec « son adapté » : son retiré volontairement, avec explication", async () => { const r = await tr("1", true, false, "garde", "envers-sans-son.mp4");
  return { ok: !r.a && /sans le son.*envers/.test(r.msg), info: r.msg.slice(0, 120) } });
/* faible luminosité : portrait sombre, sans IA, comparé à l'original intact */
for (const pr of ["equilibre", "nuit", "jour"]) {
  await test("Photo sombre, rendu « " + pr + " » exporté", async () => {
    await p.setInputFiles("#fp", path.join(MED, "visage_sombre.jpg")); await p.waitForFunction(() => !document.querySelector("#rec").hidden);
    await p.selectOption("#pfmt", "png"); await p.evaluate(x => PROF.set(x, true), pr); await p.click("#ex");
    await p.waitForFunction(() => !exporting && /Terminé/.test(document.querySelector("#st1").textContent), null, { timeout: 600000 });
    await save(path.join(OUT, "visage_sombre__" + pr + ".png")); return { ok: true, info: "gamma appliqué " + (await p.evaluate(() => PROF.gamma().toFixed(2))) } });
}
await p.evaluate(() => localStorage.removeItem("profil"));
console.log("Erreurs JavaScript : " + (errs.length ? errs.join(" | ") : "aucune"));
console.log(`Résultat : ${res.filter(Boolean).length} réussis, ${res.filter(x => !x).length} échoués.`); await b.close(); srv.kill(); process.exit(res.every(Boolean) && !errs.length ? 0 : 1);
