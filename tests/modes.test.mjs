/* Tests des 3 modes de conversion (v4.4), dans Chrome sans écran — aucun iPhone ici.
   node tests/modes.test.mjs
   Vraies vidéos générées par ffmpeg, vrais exports, fichiers vérifiés par ffprobe (codec, profil, taille, cadence,
   son, images clés). Vérifie aussi : changement de mode avant l'export, Réglages remis après l'export, nom du fichier. */
import { spawn, execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const { chromium } = await import(process.env.PW || "playwright");
const HERE = path.dirname(fileURLToPath(import.meta.url)), PORT = +(process.env.PORT || 8775), OUT = path.join(HERE, "sorties", "modes");
fs.mkdirSync(OUT, { recursive: true });
/* médias de test */
const mk = (n, a) => { const f = path.join(OUT, n); if (!fs.existsSync(f)) execFileSync("ffmpeg", ["-v", "error", "-y", ...a, f]); return f };
const SRC = {
  paysage60: mk("src_720p60_son.mp4", ["-f", "lavfi", "-i", "testsrc2=s=1280x720:r=60:d=2.5", "-f", "lavfi", "-i", "sine=f=440:r=48000:d=2.5", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest"]),
  portrait24: mk("src_720x1280_24_muet.mp4", ["-f", "lavfi", "-i", "testsrc2=s=720x1280:r=24:d=3", "-c:v", "libx264", "-pix_fmt", "yuv420p"]),
  petite30: mk("src_480x270_30_son_1s.mp4", ["-f", "lavfi", "-i", "testsrc2=s=480x270:r=30:d=1", "-f", "lavfi", "-i", "sine=f=330:r=44100:d=1", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest"])
};
const probe = f => JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,codec_name,profile,pix_fmt,width,height,r_frame_rate,sample_rate", "-show_entries", "format=duration", "-of", "json", f]).toString());
const keyGap = f => { const t = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v", "-skip_frame", "nokey", "-show_entries", "frame=pts_time", "-of", "csv=p=0", f]).toString().trim().split("\n").map(Number).filter(x => !isNaN(x));
  return t.length > 1 ? t[1] - t[0] : null };
const fps = r => { const [a, b] = r.split("/").map(Number); return a / (b || 1) };

const srv = spawn(process.execPath, [path.join(HERE, "serveur.mjs")], { env: { ...process.env, PORT }, stdio: "ignore" }); await new Promise(r => setTimeout(r, 600));
const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ["--use-angle=swiftshader", "--autoplay-policy=no-user-gesture-required"] });
const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage(); const errs = []; p.on("pageerror", e => errs.push(e.message)); p.on("dialog", d => d.dismiss());
await p.goto("http://localhost:" + PORT + "/index.html"); await p.waitForFunction(() => window.MODE && window.SR);
const FILTRE = process.env.FILTRE ? new RegExp(process.env.FILTRE) : null;
const res = []; const test = async (n, f) => { if (FILTRE && !FILTRE.test(n)) return; const t0 = Date.now(); let ok = false, info = ""; try { const r = await f(); ok = r.ok; info = r.info } catch (e) { info = "exception : " + e.message.split("\n")[0] }
  res.push(ok); console.log((ok ? "✓ " : "✗ ") + n + (info ? " — " + info : "") + " (" + ((Date.now() - t0) / 1000).toFixed(0) + " s)") };
const load = async f => { await p.setInputFiles("#f", f); await p.waitForFunction(() => v.videoWidth > 0, null, { timeout: 30000 });
  await p.waitForFunction(() => !REC.pr, null, { timeout: 120000 }).catch(() => {}) };
const exp = async (m, name) => { await p.evaluate(m => document.querySelector('[data-mode="' + m + '"]').click(), m);
  await p.click("#ex"); await p.waitForFunction(() => !exporting && /Terminé|Échec|Impossible|annulé|pas pu/.test(document.querySelector("#st1").textContent), null, { timeout: 1800000 });
  const d = await p.evaluate(async () => { if (!outUrl) return null; const a = new Uint8Array(await (await fetch(outUrl)).arrayBuffer()); let s = ""; for (let i = 0; i < a.length; i += 32768) s += String.fromCharCode(...a.subarray(i, i + 32768)); return btoa(s) });
  if (!d) throw new Error("pas de fichier : " + (await p.textContent("#st1")).slice(0, 120));
  const f = path.join(OUT, name); fs.writeFileSync(f, Buffer.from(d, "base64")); const j = probe(f);
  return { f, j, vs: j.streams.find(s => s.codec_type === "video"), as: j.streams.find(s => s.codec_type === "audio"),
    lines: await p.evaluate(() => [...document.querySelectorAll("#orep_l li")].map(l => l.className + ":" + l.textContent)) } };
const state = () => p.evaluate(() => ({ q: $("#q").value, ...Object.fromEntries(["o_max", "o_stab", "o_defl", "o_dust", "o_voice", "o_fluid", "o_fast"].map(i => [i, $("#" + i).checked])) }));

await test("Les 3 modes sont proposés dès l'import, avec un conseil", async () => { await load(SRC.petite30);
  const r = await p.evaluate(() => ({ n: document.querySelectorAll("[data-mode]").length, cur: MODE.cur, h: $("#mhint").textContent }));
  return { ok: r.n === 3 && r.cur === "max" && /Conseillé/.test(r.h), info: "conseil pour 480×270 : " + r.cur } });

await test("Pour X (720p 60 i/s + son) : H.264 High, yuv420p, AAC, 60 i/s gardés, image clé toutes les 2 s", async () => { await load(SRC.paysage60);
  const before = await state(); const o = await exp("x", "x_720p60.mp4"), g = keyGap(o.f), after = await state();
  const ok = o.vs.codec_name === "h264" && o.vs.profile === "High" && o.vs.pix_fmt === "yuv420p" && o.as && o.as.codec_name === "aac" && Math.abs(fps(o.vs.r_frame_rate) - 60) < .5
    && Math.max(o.vs.width, o.vs.height) <= 1920 && g !== null && Math.abs(g - 2) < .05 && JSON.stringify(before) === JSON.stringify(after) && !o.lines.some(l => l.startsWith("bad") || /Contrôle du mode/.test(l));
  return { ok, info: o.vs.codec_name + " " + o.vs.profile + " " + o.vs.pix_fmt + " " + o.vs.width + "×" + o.vs.height + " " + o.vs.r_frame_rate + ", son " + (o.as && o.as.codec_name + " " + o.as.sample_rate) + ", clé toutes les " + g + " s, réglages remis : " + (JSON.stringify(before) === JSON.stringify(after)) } });

await test("Changement de mode avant export : Normale sur la même vidéo (taille et cadence d'origine, pas d'IA)", async () => {
  const o = await exp("normal", "normale_720p60.mp4");
  const ok = o.vs.width === 1280 && o.vs.height === 720 && Math.abs(fps(o.vs.r_frame_rate) - 60) < .5 && !!o.as && o.lines.some(l => /Mode : Conversion normale/.test(l));
  return { ok, info: o.vs.codec_name + " " + o.vs.width + "×" + o.vs.height + " " + o.vs.r_frame_rate + " ; " + (o.lines[0] || "").slice(3, 120) } });

await test("Nom du fichier selon le mode", async () => { const n = await p.evaluate(() => uniqName(curFile.name, "mp4", outMode)); return { ok: /-normale-/.test(n), info: n } });

await test("Pour X, vidéo verticale 24 i/s sans son : pas d'agrandissement, cadence gardée, sans son", async () => { await load(SRC.portrait24); await p.evaluate(() => { const e = $("#o_max"); e.checked = false; e.dispatchEvent(new Event("change")) });
  const o = await exp("x", "x_portrait24.mp4"), g = keyGap(o.f);
  return { ok: o.vs.codec_name === "h264" && o.vs.width === 720 && o.vs.height === 1280 && Math.abs(fps(o.vs.r_frame_rate) - 24) < .2 && !o.as && Math.abs(g - 2) < .1, info: o.vs.width + "×" + o.vs.height + " " + o.vs.r_frame_rate + ", clé " + g + " s" } });

await test("Qualité maximale (IA du téléphone, petite vidéo) : agrandie en Full HD avec le son", async () => { await load(SRC.petite30); await p.evaluate(() => { const e = $("#o_max"); e.checked = true; e.dispatchEvent(new Event("change")) });
  const o = await exp("max", "max_petite.mp4");
  return { ok: Math.max(o.vs.width, o.vs.height) >= 1900 && !!o.as && o.lines.some(l => /Qualité maximale/.test(l)), info: o.vs.codec_name + " " + o.vs.width + "×" + o.vs.height + ", son " + (o.as && o.as.codec_name) } });

await test("Niveau H.264 adapté (1080p60 → 4.2, 4K60 → 5.2, 1080p30 → 4.0)", () => p.evaluate(() => {
  const a = [avcLevel(1920, 1080, 60), avcLevel(3840, 2160, 60), avcLevel(1920, 1080, 30)]; return { ok: a.join() === "avc1.64002A,avc1.640034,avc1.640028", info: a.join(", ") } }));

console.log("Erreurs JavaScript : " + (errs.length ? errs.join(" | ") : "aucune"));
console.log("\nRésultat : " + res.filter(x => x).length + " réussis, " + res.filter(x => !x).length + " échoués.");
await b.close(); srv.kill(); process.exit(res.every(x => x) && !errs.length ? 0 : 1);
