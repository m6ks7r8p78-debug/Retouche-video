/* F32 « Changer de format » — de bout en bout dans Chromium, avec les vrais modèles (YuNet, EfficientDet, MI-GAN) et la vraie app.
   node tests/format_app.test.mjs        (préparer : sh tests/format/creer_videos.sh DOSSIER_SOURCES ; tests/medias/migan.onnx — voir tests/README.md)
   Les fichiers produits sont relus par ffprobe / ffmpeg (outils indépendants de l'app). Ne vaut pas validation sur iPhone. */
import { execFileSync, spawnSync } from "child_process"; import fs from "fs"; import path from "path"; import { fileURLToPath } from "url";
import { navigateur, analyser, exporter } from "./format/essai.mjs";
const HERE = path.dirname(fileURLToPath(import.meta.url)), MED = path.join(HERE, "medias", "format"), OUT = path.join(HERE, "sorties", "format_app"); fs.mkdirSync(OUT, { recursive: true });
const V = n => path.join(MED, n); for (const f of ["plan_fixe.mp4", "panoramique_ancien.mp4", "plusieurs_plans.mp4", "bandes_noires.mp4", "secours.webm"]) if (!fs.existsSync(V(f))) { console.log("Vidéo absente : " + f + " → sh tests/format/creer_videos.sh DOSSIER_SOURCES"); process.exit(2) }
const probe = f => { const j = JSON.parse(execFileSync("ffprobe", ["-v", "0", "-count_frames", "-show_entries", "stream=codec_type,codec_name,width,height,nb_read_frames,duration,avg_frame_rate", "-of", "json", f]).toString()).streams, v = j.find(s => s.codec_type === "video"), a = j.find(s => s.codec_type === "audio"), [n, d] = v.avg_frame_rate.split("/").map(Number); return { w: v.width, h: v.height, n: +v.nb_read_frames, d: +v.duration, fps: n / d, codec: v.codec_name, son: a ? a.codec_name : null, dSon: a ? +a.duration : 0 } };
/* PSNR (dB) entre la partie centrale de la sortie (là où est l'image d'origine) et la source mise à la même taille */
/* g : place de l'image d'origine dans la sortie {ox, oy, lw, lh} et zone utile de la source {x, y, w, h} (géométrie donnée par l'app) ; marge m retirée */
const psnrCentre = (src, out, g, z, m = 6) => { const k = g.lw / z.w, cw = Math.floor((g.lw - 2 * m) / 2) * 2, ch = Math.floor((g.lh - 2 * m) / 2) * 2, r = spawnSync("ffmpeg", ["-v", "info", "-i", out, "-i", src, "-filter_complex", `[0:v]crop=${cw}:${ch}:${Math.round(g.ox + m)}:${Math.round(g.oy + m)}[a];[1:v]crop=${z.w}:${z.h}:${z.x}:${z.y},scale=${Math.round(g.lw)}:${Math.round(g.lh)}:flags=bicubic,crop=${cw}:${ch}:${m}:${m}[b];[a][b]psnr`, "-f", "null", "-"]).stderr.toString().match(/average:([\d.]+)/); return r ? +r[1] : 0 };
const geometrie = () => p.evaluate(() => { const E = FMT.etat, r = E.res, Z = E.zone, lh = r.H, lw = Z.w * r.H / Z.h; return { g: { ox: (r.W - lw) / 2, oy: 0, lw, lh }, z: { x: Z.x, y: Z.y, w: Z.w, h: Z.h } } });
/* variation moyenne d'une image à la suivante (niveaux 0-255) dans un rectangle de la sortie */
const variation = (out, x, y, w, h) => { const r = spawnSync("ffmpeg", ["-v", "0", "-i", out, "-vf", `crop=${w}:${h}:${x}:${y},format=gray,tblend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-`, "-f", "null", "-"]).stdout.toString(), v = [...r.matchAll(/YAVG=([\d.]+)/g)].map(m => +m[1]); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : -1 };
const moyenne = (out, x, y, w, h) => { const r = spawnSync("ffmpeg", ["-v", "0", "-i", out, "-vf", `crop=${w}:${h}:${x}:${y},format=gray,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-`, "-frames:v", "20", "-f", "null", "-"]).stdout.toString(), v = [...r.matchAll(/YAVG=([\d.]+)/g)].map(m => +m[1]); return v.reduce((a, b) => a + b, 0) / v.length };

const N = await navigateur(8792), p = N.p, res = [];
const test = async (n, f) => { const t0 = Date.now(); let ok = false, info = ""; try { const r = await f(); ok = r.ok; info = r.info } catch (e) { info = "exception : " + e.message.split("\n")[0] } res.push(ok); console.log((ok ? "✓ " : "✗ ") + n + " — " + info + " (" + Math.round((Date.now() - t0) / 1000) + " s)") };
const pret = () => p.waitForFunction(() => FMT.etat && !FMT.etat.occupe, null, { timeout: 900000 });
const etat = () => p.evaluate(() => { const E = FMT.etat; return { pret: E.pret, sortie: E.sortie, plans: E.plans.map(p => ({ methode: p.methode, z: p.z, fond: p.fond, sujets: 1 - p.mesures.sujets_perdus })), qc: E.qc.map(q => q && { ok: q.ok, journal: q.journal }), parts: E.plans.map((_, s) => { const d = E.decors.get(s); return d ? d.parts : null }), zone: E.zone, scenes: E.analyse.scenes.length, reprise: !!E.reprise, generateur: E.generateur, msg: document.querySelector("#fmt_msg").textContent } });

await test("Le module n'est pas chargé au démarrage ; le bouton du studio l'ouvre", async () => {
  const avant = await p.evaluate(() => typeof FMT); const [fc] = await Promise.all([p.waitForEvent("filechooser"), p.evaluate(() => document.querySelector("#pickf").click())]); await fc.setFiles(V("plan_fixe.mp4"));
  await p.waitForFunction(() => window.FMT && FMT.etat && FMT.etat.lecteur, null, { timeout: 60000 }); const t = await p.textContent("#fmt_msg"), vis = await p.isVisible("#fmt");
  return { ok: avant === "undefined" && vis && /384×288/.test(t) && /10,0 s/.test(t), info: t } });

let s1;
await test("4:3 → 16:9, plan fixe, mode Auto : toute l'image gardée, côtés reconstruits, contrôles mesurés et passés", async () => {
  await p.click('#fmt_fmts [data-f="16:9"]'); await p.click("#fmt_go"); await pret(); s1 = await etat(); const cv = await p.evaluate(() => { const c = document.querySelector("#fmt_cv"); return c.width / c.height }), fiche = await p.textContent("#fmt_fiche");
  return { ok: s1.pret && s1.plans[0].methode === "extension" && s1.plans[0].z === 0 && s1.qc[0].ok && Math.abs(cv - 16 / 9) < .01 && s1.parts[0].invente > .4 && /Raccord avec l’image/.test(fiche) && /inventé par le modèle/.test(fiche), info: JSON.stringify(s1.plans[0]) + " " + JSON.stringify(s1.parts[0]) + " zone " + JSON.stringify(s1.zone) } });

let f1;
await test("Export : fichier 16:9 complet (images, durée, cadence, son d'origine), image d'origine fidèle, côtés stables", async () => {
  await p.click("#fmt_ex"); await pret(); f1 = path.join(OUT, "fixe_16x9.mp4"); await exporterVers(f1);
  const o = probe(f1), s = probe(V("plan_fixe.mp4")), G = await geometrie(), lw = G.g.lw, ps = psnrCentre(V("plan_fixe.mp4"), f1, G.g, G.z), cote = Math.floor((o.w - lw) / 2) - 6, vc = variation(f1, 0, 0, cote, o.h), vi = variation(f1, Math.round((o.w - lw) / 2 + 20), 0, Math.round(lw - 40), o.h), bilan = await p.textContent("#fmt_bilan");
  return { ok: Math.abs(o.w / o.h - 16 / 9) < .01 && o.n === s.n && Math.abs(o.d - s.d) < .1 && Math.abs(o.fps - s.fps) < .05 && o.son === "aac" && Math.abs(o.dSon - s.dSon) < .05 && ps > 30 && vc < vi && /Dimensions/.test(bilan) && !/class="ko"/.test(await p.innerHTML("#fmt_bilan")),
    info: `${o.w}×${o.h}, ${o.n}/${s.n} images, ${o.d.toFixed(2)}/${s.d.toFixed(2)} s, ${o.fps.toFixed(2)} i/s, son ${o.son} ${o.dSon.toFixed(2)} s ; PSNR centre ${ps.toFixed(1)} dB ; variation côtés ${vc.toFixed(2)} < image ${vi.toFixed(2)}` } });

await test("Carte : les pixels inventés sont montrés en rose dans l'aperçu ; curseur de comparaison", async () => {
  const lire = () => p.evaluate(() => { const c = document.querySelector("#fmt_cv"), Z = FMT.etat.zone, ox = (c.width - Z.w * c.height / Z.h) / 2, d = c.getContext("2d").getImageData(Math.round(ox - 24), c.height >> 1, 12, 1).data; return [d[0], d[1], d[2]] });
  await p.evaluate(() => { FMT.etat.split = 0; document.querySelector("#fmt_cmp").click() }); const a = await lire(); await p.click("#fmt_carte"); const b = await lire(); await p.click("#fmt_carte"); await p.click("#fmt_cmp"); await p.mouse.click(426, 200); const c = await lire();
  return { ok: b[0] - b[1] > a[0] - a[1] + 25 && c[0] + c[1] + c[2] < 24, info: "sans carte " + a + " ; avec carte " + b + " ; original (bandes) " + c } });

await test("Mode Fidélité : aucun pixel inventé", async () => { await p.click('#fmt_modes [data-m="fidelite"]'); await pret(); const s = await etat();
  return { ok: s.plans[0].fond !== "genere" && s.plans[0].z === 0 && (!s.parts[0] || s.parts[0].invente === 0), info: JSON.stringify(s.plans[0]) } });

await test("Reconstruction max puis « Relancer la reconstruction » : le décor inventé change, les contrôles sont refaits", async () => {
  await p.click('#fmt_modes [data-m="max"]'); await pret(); const h = () => p.evaluate(() => { const g = [...FMT.etat.couches.values()].pop(); const d = g.cv.x.getImageData(0, 0, g.cv.width, g.cv.height).data; let s = 0; for (let i = 0; i < d.length; i += 97) s = (s * 31 + d[i]) >>> 0; return s });
  const a = await h(), sa = await etat(); await p.click("#fmt_re"); await pret(); const b = await h(), sb = await etat();
  return { ok: sa.plans[0].methode === "extension" && a !== b && sb.qc[0] && sb.plans[0].methode === "extension", info: "empreintes " + a + " → " + b + " ; inventé " + Math.round(sb.parts[0].invente * 100) + " %" } });

await test("Choix manuel « Bandes noires » pour la scène : l'export a de vraies bandes noires", async () => {
  await p.selectOption("#fmt_meth", "bandes"); await pret(); const s = await etat(); await p.click("#fmt_ex"); await pret(); const f = path.join(OUT, "bandes.mp4"); await exporterVers(f); const o = probe(f), m = moyenne(f, 0, 0, 40, o.h);
  return { ok: s.plans[0].methode === "bandes" && m < 20, info: "luminosité du côté : " + m.toFixed(1) + " / 255" } });

await test("Passage à 9:16 : nouvelle décision (la personne reste entière), sortie verticale ; résolution et cadence réglables", async () => {
  await p.selectOption("#fmt_meth", "auto"); await pret(); await p.click('#fmt_modes [data-m="auto"]'); await pret(); await p.click('#fmt_fmts [data-f="9:16"]'); await pret(); await p.click("#fmt_av summary"); await p.selectOption("#fmt_rr", "720"); await pret(); await p.selectOption("#fmt_rc", "24"); await pret();
  const s = await etat(); await p.click("#fmt_ex"); await pret(); const f = path.join(OUT, "fixe_9x16.mp4"); await exporterVers(f); const o = probe(f);
  return { ok: s.plans[0].sujets > .95 && o.w === 720 && o.h === 1280 && Math.abs(o.fps - 24) < .3 && Math.abs(o.n - 240) <= 3 && Math.abs(o.d - 10) < .15 && o.son === "aac", info: JSON.stringify(s.plans[0]) + ` → ${o.w}×${o.h}, ${o.n} images, ${o.fps.toFixed(2)} i/s` } });

await test("Reprise : la même vidéo rouverte retrouve son analyse sans la refaire", async () => {
  await p.evaluate(() => FMT.fermer()); const a = await analyser(p, V("plan_fixe.mp4"), "1:1", "auto"), s = await etat();
  return { ok: s.reprise && s.pret && Math.abs(s.sortie.W - s.sortie.H) < 2, info: "analyse + préparation " + a.ms + " ms ; sortie " + s.sortie.W + "×" + s.sortie.H + " ; " + s.plans[0].methode } });

await test("Panoramique 4:3 → 16:9 : les côtés viennent des autres images de la scène (décor retrouvé, rien d'inventé)", async () => {
  await p.evaluate(() => FMT.fermer()); await analyser(p, V("panoramique_ancien.mp4"), "16:9", "auto"); const s = await etat(); await p.click("#fmt_ex"); await pret(); const f = path.join(OUT, "pano_16x9.mp4"); await exporterVers(f); const o = probe(f);
  return { ok: s.plans[0].methode === "decor" && s.parts[0].reel > .5 && s.parts[0].invente === 0 && s.qc[0].ok && o.n === 90, info: JSON.stringify(s.parts[0]) } });

await test("Plusieurs plans → 1:1 : scènes séparées, une décision et des contrôles par scène, export continu", async () => {
  await p.evaluate(() => FMT.fermer()); await analyser(p, V("plusieurs_plans.mp4"), "1:1", "auto"); const s = await etat(), src = probe(V("plusieurs_plans.mp4")); await p.click("#fmt_ex"); await pret(); const f = path.join(OUT, "plans_1x1.mp4"); await exporterVers(f); const o = probe(f), nb = await p.locator("#fmt_scenes button").count();
  return { ok: s.scenes >= 2 && nb === s.scenes && s.qc.length === s.scenes && s.qc.every(Boolean) && o.w === o.h && o.n === src.n && Math.abs(o.d - src.d) < .1 && o.son === "aac", info: s.scenes + " scènes : " + s.plans.map(q => q.methode + (q.z ? " z=" + q.z : "")).join(" | ") + ` ; ${o.n}/${src.n} images` } });

await test("Vieille vidéo 4:3 incrustée dans un cadre 16:9 : les bandes noires d'origine sont retirées avant la conversion", async () => {
  await p.evaluate(() => FMT.fermer()); await analyser(p, V("bandes_noires.mp4"), "16:9", "auto"); const s = await etat();
  return { ok: s.zone.bandes && Math.abs(s.zone.w - 384) <= 8 && s.zone.x >= 62 && s.plans[0].methode !== "identique", info: "zone utile " + JSON.stringify(s.zone) + " → " + s.plans[0].methode } });

await test("Format non MP4 (WebM) : lecture de secours, analyse et export fonctionnent", async () => {
  await p.evaluate(() => FMT.fermer()); await analyser(p, V("secours.webm"), "16:9", "fidelite"); const t = await p.evaluate(() => FMT.etat.lecteur.type); await p.click("#fmt_ex"); await pret(); const f = path.join(OUT, "secours.mp4"); await exporterVers(f); const o = probe(f);
  return { ok: t === "balise" && Math.abs(o.w / o.h - 16 / 9) < .01 && Math.abs(o.d - 3) < .25, info: `lecteur ${t} → ${o.w}×${o.h}, ${o.n} images, ${o.d.toFixed(2)} s` } });

await test("Téléchargement du modèle refusé : rien n'est inventé, l'outil le dit et continue avec le reste", async () => {
  await p.evaluate(async () => { FMT.fermer(); localStorage.removeItem("autorisations"); const c = await caches.open("retouche-modeles-v1").catch(() => null); if (c) for (const k of await c.keys()) if (/migan/.test(k.url)) await c.delete(k); if (window.ERASE && ERASE.unload) await ERASE.unload(); try { await MODELS.remove("migan") } catch (e) {} });
  p.removeAllListeners("dialog"); p.on("dialog", d => d.dismiss()); let a; try { a = await analyser(p, V("plan_fixe.mp4"), "16:9", "max", { fond: "genere" }) } finally { p.removeAllListeners("dialog"); p.on("dialog", d => d.accept()) } const s = await etat(), fiche = await p.textContent("#fmt_fiche");
  await p.evaluate(() => localStorage.setItem("autorisations", JSON.stringify({ modele: { ok: true } })));
  return { ok: s.pret && s.generateur === false && (!s.parts[0] || s.parts[0].invente === 0) && s.plans[0].fond !== "genere", info: s.plans[0].methode + " / " + s.plans[0].fond + " ; générateur " + s.generateur + " ; " + (fiche.match(/Reconstruction impossible[^.]*\./) || [""])[0] } });

await test("« Améliorer cette vidéo » : la vidéo au nouveau format passe dans l'atelier d'amélioration existant", async () => {
  await p.evaluate(() => FMT.fermer()); await analyser(p, V("plan_fixe.mp4"), "16:9", "fidelite"); await p.click("#fmt_ex"); await pret(); const W = await p.evaluate(() => FMT.etat.res.W); await p.click("#fmt_am"); await p.waitForFunction(() => v.videoWidth > 0, null, { timeout: 30000 });
  const r = await p.evaluate(() => ({ w: v.videoWidth, h: v.videoHeight, ferme: !document.querySelector("#fmt"), nom: curFile.name }));
  return { ok: r.w === W && r.ferme && /16x9\.mp4$/.test(r.nom), info: JSON.stringify(r) } });

await test("Le bouton « Changer le format de cette vidéo » de l'atelier rouvre l'outil avec la vidéo en cours ; aucune erreur de page", async () => {
  await p.evaluate(() => document.querySelector("#fmb").click()); await p.waitForFunction(() => FMT.etat && FMT.etat.lecteur, null, { timeout: 60000 }); const n = await p.evaluate(() => FMT.etat.file.name); await p.click("#fmt_x");
  return { ok: /16x9\.mp4$/.test(n) && !(await p.$("#fmt")) && !N.errs.length, info: n + " ; erreurs : " + (N.errs.join(" | ") || "aucune") } });

async function exporterVers(f) { const d = await p.evaluate(async () => { const a = new Uint8Array(await FMT.etat.res.blob.arrayBuffer()); let s = ""; for (let i = 0; i < a.length; i += 32768) s += String.fromCharCode(...a.subarray(i, i + 32768)); return btoa(s) }); fs.writeFileSync(f, Buffer.from(d, "base64")) }
await N.fermer(); const ok = res.filter(Boolean).length; console.log("\nRésultat : " + ok + " réussis, " + (res.length - ok) + " échoués."); process.exit(ok === res.length ? 0 : 1);
