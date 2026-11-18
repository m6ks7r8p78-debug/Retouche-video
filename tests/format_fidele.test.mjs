/* v8.5 « Fidèle » — conversion de format SANS GÉNÉRATION, de bout en bout dans Chromium (vraie app, vrais détecteurs, vrai encodeur),
   sur de VRAIES vidéos (personnes, caméra mobile, scènes complexes) : python… voir tests/fidele/creer_videos.sh.
   node tests/format_fidele.test.mjs   (PW=<playwright>/index.mjs ; RAPIDE=1 saute la vidéo 1080×1920) */
import { execFileSync, spawnSync } from "child_process"; import fs from "fs"; import path from "path"; import { fileURLToPath } from "url";
import { navigateur, analyser, exporter } from "./format/essai.mjs";
const HERE = path.dirname(fileURLToPath(import.meta.url)), MED = path.join(HERE, "medias", "fidele"), OUT = path.join(HERE, "sorties", "format_fidele"); fs.mkdirSync(OUT, { recursive: true });
const V = n => path.join(MED, n + ".mp4"); if (!fs.existsSync(V("personnes_fixe"))) { console.log("Vidéos absentes : lancer tests/fidele/creer_videos.sh"); process.exit(1) }
/* 4:3 (vieux téléphone) fabriquée à partir de la rue : pour 4:3 → 16:9 et 4:3 → 9:16 */
const V43 = path.join(MED, "rue_4x3.mp4"); if (!fs.existsSync(V43)) execFileSync("ffmpeg", ["-v", "error", "-y", "-i", V("rue_pietons"), "-i", (process.env.SRC || "/home/claude/medias_src") + "/vtest.avi", "-filter_complex", "[1:v]trim=20:25,setpts=PTS-STARTPTS,crop=768:576:0:0,scale=640:480,setsar=1[v]", "-map", "[v]", "-map", "0:a", "-c:v", "libx264", "-crf", "14", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", V43]);
/* portrait 4:3 (une personne assise, mur uni autour) : là, un remplissage plus grand est possible sans toucher le sujet */
const VC = path.join(MED, "portrait_4x3.mp4"); if (!fs.existsSync(VC)) execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", "28", "-t", "4", "-i", (process.env.SRC || "/home/claude/medias_src") + "/iv/head-pose-face-detection-female.mp4", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000", "-filter_complex", "[0:v]crop=576:432:96:0,setsar=1[v]", "-map", "[v]", "-map", "1:a", "-c:v", "libx264", "-crf", "14", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", VC]);
const probe = f => JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,width,height,r_frame_rate,nb_frames,duration", "-show_entries", "format=duration", "-of", "json", f]).toString());
const res = [], test = async (n, f) => { let ok = false, info = ""; const t0 = Date.now(); try { const r = await f(); ok = r.ok; info = r.info } catch (e) { info = "exception : " + e.message.split("\n")[0] } res.push(ok); console.log((ok ? "✓ " : "✗ ") + n + " (" + Math.round((Date.now() - t0) / 1000) + " s)" + (info ? "\n    " + info : "")) };
const N = await navigateur(8799), p = N.p, fid = () => p.evaluate(() => { const f = FMT.etat.res.fidele; return { ...f, violations: f.violations.length } });
const plans = () => p.evaluate(() => FMT.etat.plans.map((q, s) => ({ variante: q.variante, m: q.mesures, qc: FMT.etat.qc[s] && FMT.etat.qc[s].ok, journal: FMT.etat.qc[s] && FMT.etat.qc[s].journal })));
/* contrôle commun d'une conversion Fidèle exportée */
async function fidele(nom, video, format, attendu) {
  const a = await analyser(p, video, format, "fidele"), P = await plans(), out = path.join(OUT, nom + ".mp4"), e = await exporter(p, out), f = await fid(), src = probe(video), dst = probe(out);
  const sv = src.streams.find(s => s.codec_type === "video"), dv = dst.streams.find(s => s.codec_type === "video"), da = dst.streams.find(s => s.codec_type === "audio");
  const dureeOK = Math.abs(+dst.format.duration - +src.format.duration) < .12, cadOK = sv.r_frame_rate === dv.r_frame_rate, imgOK = +dv.nb_frames === +sv.nb_frames;
  const ok = e.W === attendu[0] && e.H === attendu[1] && P.every(q => q.m.conservation === 1 && !q.m.visible && (q.m.etirementProtege == null || q.m.etirementProtege === 1)) && f.max <= 1.0005 && f.violations === 0
    && (!f.identite.images || f.identite.ok) && Math.abs(f.stabilite - 1) < .15 && dureeOK && cadOK && imgOK && !!da && e.tech.ok && /rien d’inventé/.test(a.msg);
  ffmpegPlanche(out, nom);
  return { ok, P, f, e, info: JSON.stringify({ sortie: e.W + "×" + e.H, scenes: P.length, remplissage: P.map(q => +q.m.remplissage.toFixed(3)), etirMax: P.map(q => +q.m.etirementMax.toFixed(3)), visages: f.visages, etirVisages: f.max, identite: f.identite, stabilite: +f.stabilite.toFixed(3), images: [sv.nb_frames, dv.nb_frames], cadence: [sv.r_frame_rate, dv.r_frame_rate], duree: [src.format.duration, dst.format.duration], son: !!da, analyse_ms: a.ms, export_ms: e.ms, ms_par_image: Math.round(e.ms / e.images) }) };
}
const ffmpegPlanche = (f, nom) => spawnSync("ffmpeg", ["-v", "error", "-y", "-ss", "1.5", "-i", f, "-frames:v", "1", "-vf", "scale=-2:360", path.join(OUT, nom + ".png")]);

await test("Personnes, caméra fixe : 9:16 → 16:9 à la taille d'origine, 100 % gardé, visages vérifiés image par image, son, durée, cadence", async () => fidele("personnes", V("personnes_fixe"), "16:9", [768, 432]));
await test("Visages, caméra qui balaye : aucun visage étiré, géométrie stable", async () => fidele("visages_pan", V("visages_pan"), "16:9", [768, 432]));
await test("Rue, piétons, 10 images/s : cadence inhabituelle gardée", async () => fidele("rue", V("rue_pietons"), "16:9", [1024, 576]));
await test("Allée de magasin, caméra qui avance (parallaxe)", async () => fidele("allee", V("allee_complexe"), "16:9", [1138, 640]));
await test("Plusieurs scènes : une décision par scène", async () => { const r = await fidele("scenes", V("scenes_multiples"), "16:9", [1138, 640]); r.ok = r.ok && r.P.length >= 3; return r });
await test("Vieux téléphone 4:3 → 16:9, portrait devant un mur : plus de remplissage sans toucher les sujets ; « Remplissage total » remplit tout, sujets intacts", async () => { const r = await fidele("portrait_43", VC, "16:9", [768, 432]);
  const V = await p.evaluate(() => FMT.etat.plans[0].V), ex = V.exact.mesures.remplissage; r.ok = r.ok && r.P[0].m.remplissage > ex + .01 && V.total.mesures.remplissage > .999 && V.total.mesures.etirementProtege === 1; r.info += " total=" + V.total.mesures.remplissage.toFixed(3) + " étir. max " + V.total.mesures.etirementMax.toFixed(2); return r });
await test("4:3 → 16:9, rue où des piétons passent PARTOUT : rien n'est étiré (fidélité d'abord), et c'est dit", async () => { const r = await fidele("rue_43", V43, "16:9", [854, 480]); const t = await p.textContent("#fmt_fiche"); r.ok = r.ok && r.P[0].m.etirementMax === 1 && /aucune zone ne peut être étirée/.test(t); return r });
await test("4:3 → 9:16 (axe vertical) : même méthode, par lignes", async () => fidele("43_vers_916", V43, "9:16", [640, 1138]));
if (!process.env.RAPIDE) await test("Taille iPhone 1080×1920 → 3414×1920 (un pixel filmé = un pixel du fichier), salle de classe", async () => fidele("classe", V("classe_1080x1920"), "16:9", [3414, 1920]));

await test("Variantes : aucune n'est activée sans choix ; « Proportions exactes » = image entière identique ; « Recadrage » et « Étirement uniforme » signalés", async () => {
  await analyser(p, V("personnes_fixe"), "16:9", "fidele"); const auto = await plans();
  const choisir = v => p.evaluate(async v => { FMT.etat.reglages.variante = v; await FMT.maj("reglage"); return FMT.etat.plans.map((q, s) => ({ v: q.variante, m: q.mesures, qc: FMT.etat.qc[s].ok, ko: FMT.etat.qc[s].controles.filter(c => !c.ok).map(c => c.code) })) }, v);
  const ex = await choisir("exact"), e = await exporter(p, path.join(OUT, "exact.mp4")), f = await fid(), rc = await choisir("recadrage"), un = await choisir("uniforme");
  return { ok: auto[0].variante === "fidele" && ex[0].m.etirementMax === 1 && f.identite.ok && f.identite.images > 0 && rc[0].m.conservation < .4 && rc[0].ko.includes("conservation") && un[0].m.visible && un[0].ko.includes("fond"),
    info: JSON.stringify({ auto: auto[0].variante, exact: { etir: ex[0].m.etirementMax, identite: f.identite }, recadrage: { conservation: rc[0].m.conservation, ko: rc[0].ko }, uniforme: { etir: un[0].m.etirementMax, ko: un[0].ko } }) } });

await test("Correction avant l'export : sujets retirés exprès + remplissage total → les visages trouvés sous l'étirement sont protégés", async () => {
  await analyser(p, V("personnes_fixe"), "16:9", "fidele");
  const r = await p.evaluate(async () => { const E = FMT.etat; E.reglages.variante = "total"; for (const sc of E.analyse.scenes) sc.pistes = []; E.ffExtra = {}; FMT._t.decider(); const avant = E.plans[0].mesures.etirementProtege; await FMT._t.controler(0, () => {});
    return { avant, journal: E.qc[0].journal, ok: E.qc[0].ok, controles: E.qc[0].controles.map(c => c.code + ":" + c.ok), extra: (E.ffExtra[0] || []).length } });
  return { ok: r.extra > 0 && /protégée/.test(r.journal.join(" ")) && r.controles.includes("visages:true"), info: JSON.stringify(r) } });

await test("Correction à l'export : un visage manqué avant l'export est trouvé image par image, protégé, vidéo refaite", async () => {
  await analyser(p, V("personnes_fixe"), "16:9", "fidele");
  await p.evaluate(() => { const E = FMT.etat; E.reglages.variante = "total"; for (const sc of E.analyse.scenes) sc.pistes = []; E.ffExtra = {}; FMT._t.decider() });
  const e = await exporter(p, path.join(OUT, "corrige.mp4")), f = await p.evaluate(() => { const f = FMT.etat.res.fidele; return { corrige: f.corrige, restant: f.violations.length, max: f.max, visages: f.visages } }), bilan = await p.textContent("#fmt_bilan");
  return { ok: f.corrige > 0 && f.restant === 0 && f.max <= 1.0005 && /Correction automatique/.test(bilan), info: JSON.stringify(f) } });

/* côtés : « ambiance » (défaut) = image floutée, sans aucun détail (pas de décor), stable dans le temps ; « bandes noires » au choix */
const stats = (f, crop) => { const t = spawnSync("ffmpeg", ["-v", "info", "-i", f, "-vf", "crop=" + crop + ",signalstats,metadata=print", "-f", "null", "-"]).stderr.toString(); const y = [...t.matchAll(/YAVG=([\d.]+)/g)].map(m => +m[1]); return { moy: y.reduce((a, b) => a + b, 0) / y.length, sauts: Math.max(...y.slice(1).map((v, i) => Math.abs(v - y[i]))) } };
const detail = (f, crop) => +(spawnSync("ffmpeg", ["-v", "info", "-ss", "2", "-i", f, "-frames:v", "1", "-vf", "crop=" + crop + ",format=gray,edgedetect=low=0.04:high=0.1,signalstats,metadata=print", "-f", "null", "-"]).stderr.toString().match(/YAVG=([\d.]+)/) || [0, 99])[1];
await test("Côtés « ambiance » (défaut) : aucune bande noire, aucun contour (rien d'inventé), stable d'une image à l'autre", async () => {
  await analyser(p, V("personnes_fixe"), "16:9", "fidele"); const b = await p.evaluate(() => FMT.etat.reglages.bords), e = await exporter(p, path.join(OUT, "ambiance.mp4")), f = await fid(), z = stats(path.join(OUT, "ambiance.mp4"), "200:432:20:0"), d = detail(path.join(OUT, "ambiance.mp4"), "200:432:20:0");
  ffmpegPlanche(path.join(OUT, "ambiance.mp4"), "ambiance"); return { ok: b === "ambiance" && z.moy > 25 && z.sauts < 3 && d < .5 && f.identite.ok, info: JSON.stringify({ bords: b, luminance: +z.moy.toFixed(1), saut_max_image_a_image: +z.sauts.toFixed(2), contours: d, identite: f.identite.ok }) } });
await test("Côtés en bandes noires (option)", async () => {
  await analyser(p, V("personnes_fixe"), "16:9", "fidele", { bords: "noir" }); await exporter(p, path.join(OUT, "noir.mp4")); const z = stats(path.join(OUT, "noir.mp4"), "200:432:20:0");
  return { ok: z.moy < 18, info: "luminance " + z.moy.toFixed(1) } });

console.log(N.errs.length ? "Erreurs de page : " + N.errs.join(" | ") : ""); await N.fermer();
console.log(res.filter(Boolean).length + "/" + res.length + " réussis"); process.exit(res.every(Boolean) && !N.errs.length ? 0 : 1);
