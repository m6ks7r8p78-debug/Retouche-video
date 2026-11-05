/* Tests v5.8 : « IA rapide sur serveur » avec la vitesse (barre sous la vidéo, Time Repair, lecture à l'envers)
   et « Mouvement plus fluide ». Kaggle est simulé : KG.traiter renvoie un résultat fabriqué ici avec ffmpeg, au même format
   que le vrai serveur (une image par image du fichier, ordre d'affichage, H.264 sans images B, taille de sortie, option -g).
   Ce résultat est la vidéo d'origine simplement agrandie : si l'app relit la mauvaise image du serveur, l'image exportée
   ne correspond plus à la version sans IA (mesure PSNR image par image contre l'export sans IA, à la même vitesse).
   node tests/ia_serveur_vitesse.test.mjs [medias] [sorties] */
import { spawn, execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const { chromium } = await import(process.env.PW || "playwright");
const HERE = path.dirname(fileURLToPath(import.meta.url)), PORT = 8774, MED = path.resolve(process.argv[2] || path.join(HERE, "medias")), OUT = path.resolve(process.argv[3] || path.join(HERE, "sorties", "ia_vitesse"));
const VID = process.env.VID || "video_vieuxtel.mp4";
fs.mkdirSync(OUT, { recursive: true });
const srv = spawn(process.execPath, [path.join(HERE, "serveur.mjs")], { env: { ...process.env, PORT }, stdio: "ignore" }); await new Promise(r => setTimeout(r, 600));
const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ["--use-angle=swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required", "--enable-unsafe-swiftshader"] });
const p = await b.newPage({ viewport: { width: 390, height: 844 } }); const errs = []; p.on("pageerror", e => errs.push(e.message));
p.on("dialog", d => d.accept());
let appels = [];
/* faux serveur : même contrat que traitement_kaggle.py */
await p.exposeFunction("__fauxKaggle", async o => {
  appels.push(o); const f = path.join(OUT, "faux-serveur.mp4");
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", path.join(MED, VID), "-vf", `scale=${o.ow}:${o.oh}:flags=lanczos`, "-fps_mode", "passthrough",
    "-c:v", "libx264", "-qp", "16", "-bf", "0", ...(o.gop ? ["-g", String(o.gop)] : []), "-pix_fmt", "yuv420p", "-an", f]);
  return fs.readFileSync(f).toString("base64") });
await p.goto("http://localhost:" + PORT + "/index.html"); await p.waitForFunction(() => window.KG && window.SRX && window.STUDIO && window.SR);
await p.evaluate(() => {
  localStorage.setItem("kaggle_jeton", "jeton-de-test"); localStorage.setItem("autorisations", JSON.stringify({ modele: { ok: true }, cloud: { ok: true, at: Date.now() } }));
  window.__lus = [];
  KG.traiter = async (o, ev) => { ev("envoi", 1, "envoi simulé");
    const b64 = await window.__fauxKaggle({ ow: o.ow, oh: o.oh, gop: o.gop || 0, images: o.images }), bin = atob(b64), a = new Uint8Array(bin.length); for (let i = 0; i < a.length; i++) a[i] = bin.charCodeAt(i);
    return { file: new File([a], "ia.mp4", { type: "video/mp4" }), minutes: 0, info: { gpu: "simulé" } } };
  /* relevé des images demandées au serveur */
  const run0 = SRX.run.bind(SRX); SRX.run = async (...x) => { if (SRX.remote) window.__lus.push(SRX.idx); return run0(...x) };
});
const res = []; const test = async (n, f) => { let ok = false, info = ""; try { const r = await f(); ok = r.ok; info = r.info } catch (e) { info = "exception : " + e.message.split("\n")[0] } res.push(ok); console.log((ok ? "✓ " : "✗ ") + n + " — " + info) };
const save = async f => { const d = await p.evaluate(async () => { const a = new Uint8Array(await (await fetch(outUrl)).arrayBuffer()); let s = ""; for (let i = 0; i < a.length; i += 32768) s += String.fromCharCode(...a.subarray(i, i + 32768)); return btoa(s) }); fs.writeFileSync(f, Buffer.from(d, "base64")); return f };
const nbImages = f => +JSON.parse(execFileSync("ffprobe", ["-v", "error", "-count_frames", "-select_streams", "v", "-show_entries", "stream=nb_read_frames", "-of", "json", f]).toString()).streams[0].nb_read_frames;
/* PSNR image par image entre deux exports (même taille, même nombre d'images) */
/* L'export sans IA à l'envers relit la vidéo par l'élément vidéo, l'export avec l'IA rapide image par image ; sur les vidéos
   dont l'horloge commence après 0 (2 images pour video_vieuxtel), les deux sont donc décalés d'un nombre d'images constant.
   On cherche ce décalage constant (−6…+6) : un mauvais choix d'image du serveur, lui, ne serait jamais constant (fantômes). */
const psnr1 = (a, c, d) => { const fa = d > 0 ? `trim=start_frame=${d},setpts=PTS-STARTPTS` : "null", fc = d < 0 ? `trim=start_frame=${-d},setpts=PTS-STARTPTS` : "null";
  const o = execFileSync("ffmpeg", ["-loglevel", "error", "-i", a, "-i", c, "-lavfi", `[0:v]${fa}[x];[1:v]${fc}[y];[x][y]psnr=stats_file=-`, "-f", "null", "-"], { maxBuffer: 1 << 26 }).toString();
  return o.trim().split("\n").filter(l => /psnr_avg/.test(l)).map(l => { const m = l.match(/psnr_avg:(\S+)/)[1]; return m === "inf" ? 99 : +m }).slice(0, -8) };
const psnr = (a, c) => { let best = null; for (let d = -6; d <= 6; d++) { const q = psnr1(a, c, d), m = q.reduce((x, y) => x + y, 0) / q.length; if (!best || m > best.m) best = { q, m, d } } return best };
const done = () => p.waitForFunction(() => !exporting && !analyzing && /Terminé|Échec|IA rapide|rien n’a été envoyé/.test(document.querySelector("#st1").textContent), null, { timeout: 3600000 });
const reglages = (srvOn, fluid) => p.evaluate(([s, fl]) => {
  for (const id of ["o_dust", "o_fast", "o_defl", "o_stab"]) { const e = document.querySelector("#" + id); if (e && e.checked) { e.checked = false; e.dispatchEvent(new Event("change")) } }
  const f = document.querySelector("#o_fluid"); if (f && f.checked !== fl) { f.checked = fl; f.dispatchEvent(new Event("change")) }
  const m = document.querySelector("#o_max"); if (m.checked !== s) { m.checked = s; m.dispatchEvent(new Event("change")) }
  const r = document.querySelector("#o_srv"); if (r.checked !== s) { r.checked = s; r.dispatchEvent(new Event("change")) } }, [srvOn, fluid]);
const vitesse = n => p.evaluate(n => { const e = $("#spd"); e.value = n; e.dispatchEvent(new Event("input")); e.dispatchEvent(new Event("change")) }, n);

/* NOSEQ=1 : l'original ne peut pas être lu image par image (cas de certaines vidéos d'iPhone) → lecteur vidéo + recalage */
if (process.env.NOSEQ === "1") await p.evaluate(() => { window.__noseq = true });
await p.setInputFiles("#f", path.join(MED, VID)); await p.waitForFunction(() => v.videoWidth > 0);
await p.waitForFunction(() => !REC.pr, null, { timeout: 120000 }).catch(() => {});
await p.click('[data-q="1920"]');

/* cas : [nom, lancer l'export, vitesse barre, fluide] */
const cas = [
  ["barre 0,75× (ralenti avec images intermédiaires)", async () => { await vitesse(75); await p.evaluate(() => $("#ex").onclick()) }, false],
  ["barre 1,30× (accéléré, images sautées)", async () => { await vitesse(130); await p.evaluate(() => $("#ex").onclick()) }, false],
  ["Time Repair 0,5× lu à l'envers (fluide)", async () => { await vitesse(100); await p.evaluate(() => { $("#tr_v").value = "0.5"; $("#tr_r").checked = true; $("#tr_f").checked = true; $("#tr_a").value = "sans"; return TR.go() }) }, false],
  ["Time Repair 1× lu à l'envers (sans images intermédiaires)", async () => { await vitesse(100); await p.evaluate(() => { $("#tr_v").value = "1"; $("#tr_r").checked = true; $("#tr_f").checked = false; $("#tr_a").value = "sans"; return TR.go() }) }, false],
  ["« Mouvement plus fluide » (vitesse normale)", async () => { await vitesse(100); await p.evaluate(() => { $("#tr_r").checked = false; return $("#ex").onclick() }) }, true],
];
for (const [nom, lancer, fluid] of cas.filter(c => !process.env.CAS || new RegExp(process.env.CAS, "i").test(c[0]))) {
  const ref = path.join(OUT, nom.replace(/[^a-z0-9]+/gi, "_") + "_sans_ia.mp4"), ia = ref.replace("_sans_ia", "_ia_serveur");
  await test(nom + " : export avec l'IA rapide terminé, bonnes images relues", async () => {
    await reglages(false, fluid); await lancer(); await done(); let t = await p.textContent("#st1"); if (!/Terminé/.test(t)) return { ok: false, info: "sans IA : " + t.slice(0, 160) };
    await save(ref);
    await reglages(true, fluid); appels = []; await p.evaluate(() => { window.__lus = [] }); await lancer(); await done(); t = await p.textContent("#st1");
    if (!/Terminé/.test(t)) return { ok: false, info: "avec IA rapide : " + t.slice(0, 200) };
    await save(ia);
    const lus = await p.evaluate(() => window.__lus), n1 = nbImages(ref), n2 = nbImages(ia), P = psnr(ref, ia), q = P.q, mn = Math.min(...q), moy = P.m;
    const inter = lus.filter(x => typeof x === "object").length, envers = lus.some((x, i) => i && (typeof x === "number" ? x : x.a) < (typeof lus[i - 1] === "number" ? lus[i - 1] : lus[i - 1].a));
    const cal = await p.evaluate(() => window.__iaCalage);
    return { ok: n1 === n2 && (process.env.NOSEQ !== "1" || !!cal) && lus.length === n2 && moy > 38 && mn > 30, info: `${cal ? "recalage " + JSON.stringify(cal) + ", " : ""}décalage ${P.d}, ${n2} images (sans IA ${n1}), relues ${lus.length} dont ${inter} intermédiaires${envers ? ", à l'envers" : ""}, -g ${appels[0] && appels[0].gop}, PSNR moyen ${moy.toFixed(1)} dB, min ${mn.toFixed(1)} dB` } });
}
console.log(errs.length ? "Erreurs de page : " + errs.join(" | ") : "Aucune erreur de page.");
console.log(res.filter(Boolean).length + " / " + res.length + " réussis");
await b.close(); srv.kill(); process.exit(res.every(Boolean) ? 0 : 1);
