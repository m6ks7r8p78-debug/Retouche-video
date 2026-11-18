/* v8.4 « Zéro perte » (Changer de format) — de bout en bout dans Chromium, vraie app :
   vertical 360×640 (panoramique fabriqué à partir de demo/chat-apres.jpg) → 16:9.
   1. sans serveur : sortie 1138×640, image d'origine à l'échelle 1, contrôle pixel par pixel = 0 différence, centre fidèle (ffmpeg) ;
   2. serveur Kaggle SIMULÉ (serveur-ia/extension_kaggle.py lancé ici avec RETOUCHE_FAUX_GENERATEUR=1) : les décors partent,
      la couche revient et remplit tout le côté ajouté (plus de flou), toujours 0 pixel d'origine modifié.
   node tests/format_zero.test.mjs   (PW=<playwright>/index.mjs, CHROME=<chrome avec H.264> si besoin) */
import { execFileSync, spawnSync } from "child_process"; import fs from "fs"; import path from "path"; import { fileURLToPath } from "url";
import { navigateur, analyser, exporter } from "./format/essai.mjs";
const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.join(HERE, ".."), OUT = path.join(HERE, "sorties", "format_zero"), VID = path.join(HERE, "medias", "format", "vertical_pano.mp4");
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(path.dirname(VID), { recursive: true });
if (!fs.existsSync(VID)) execFileSync("ffmpeg", ["-v", "error", "-y", "-loop", "1", "-i", path.join(ROOT, "demo", "chat-apres.jpg"), "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000", "-filter_complex", "[0:v]crop=240:426:'(iw-240)*t/4':27,scale=360:640:flags=lanczos,setsar=1,fps=30[v]", "-map", "[v]", "-map", "1:a", "-t", "4", "-c:v", "libx264", "-crf", "16", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", VID]);
const psnr = (out, ox) => { const t = spawnSync("ffmpeg", ["-v", "info", "-i", out, "-i", VID, "-filter_complex", `[0:v]crop=360:640:${ox}:0[a];[a][1:v]psnr`, "-f", "null", "-"]).stderr.toString(); return +(t.match(/average:([\d.]+)/) || [0, 0])[1] };
const res = [], test = async (n, f) => { let ok = false, info = ""; try { const r = await f(); ok = r.ok; info = r.info } catch (e) { info = "exception : " + e.message.split("\n")[0] } res.push(ok); console.log((ok ? "✓ " : "✗ ") + n + (info ? "\n    " + info : "")) };

const N = await navigateur(8798), p = N.p, SRV = path.join(OUT, "serveur");
await p.exposeFunction("serveurFaux", (params, fichiers) => { fs.rmSync(SRV, { recursive: true, force: true }); for (const d of ["e", "s"]) fs.mkdirSync(path.join(SRV, d), { recursive: true });
  for (const [n, b] of Object.entries(fichiers)) fs.writeFileSync(path.join(SRV, "e", n), Buffer.from(b, "base64")); fs.writeFileSync(path.join(SRV, "e", "params.json"), params);
  execFileSync("python3", [path.join(ROOT, "serveur-ia", "extension_kaggle.py")], { env: { ...process.env, RETOUCHE_ENTREE: path.join(SRV, "e"), RETOUCHE_SORTIE: path.join(SRV, "s"), RETOUCHE_FAUX_GENERATEUR: "1" }, stdio: "ignore" });
  return fs.readFileSync(path.join(SRV, "s", "info.json"), "utf8") });
const zero = () => p.evaluate(() => FMT.etat.res.zero);

await test("Sans serveur : 9:16 → 16:9 en 1138×640, image posée telle quelle, contrôle pixel par pixel sans aucune différence", async () => {
  const a = await analyser(p, VID, "16:9", "zero"), e = await exporter(p, path.join(OUT, "local.mp4")), z = await zero(), c = await p.evaluate(() => FMM.cadre(FMT.etat.plans[0], 0, 360, 640, 1138, 640)), q = psnr(path.join(OUT, "local.mp4"), c.ox);
  return { ok: e.W === 1138 && e.H === 640 && c.k === 1 && c.ox === 389 && z.ok && z.differents === 0 && z.images >= 8 && !z.perte && q > 38 && /Zéro perte : chaque pixel filmé est gardé/.test(a.msg) && /Zéro perte vérifié/.test(await p.textContent("#fmt_bilan")), info: JSON.stringify({ z, psnr_centre: q }) } });

await test("Serveur simulé : seuls les décors partent, la couche revient et remplit tout le côté ajouté ; 0 pixel d'origine modifié", async () => {
  await p.evaluate(() => { localStorage.setItem("kaggle_jeton", "essai"); const a = JSON.parse(localStorage.getItem("autorisations") || "{}"); a.cloud = { ok: true }; localStorage.setItem("autorisations", JSON.stringify(a));
    KG.etendre = async (o, ev) => { const b64 = async b => { const u = new Uint8Array(await b.arrayBuffer()); let s = ""; for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode(...u.subarray(i, i + 32768)); return btoa(s) }, f = {};
      for (const t of o.travaux) { f["plaque_" + t.id + ".png"] = await b64(t.plaque); f["trou_" + t.id + ".png"] = await b64(t.trou) } window.__envoi = o.travaux.map(t => ({ w: t.w, h: t.h, fen: t.fenetres.length, types: [t.plaque.type, t.trou.type] }));
      return Object.assign(JSON.parse(await serveurFaux(JSON.stringify({ version: 1, graine: o.graine, travaux: o.travaux.map(t => ({ id: t.id, w: t.w, h: t.h, fenetres: t.fenetres, echelle: t.echelle })) }), f)), { minutes: 0 }) } });
  await analyser(p, VID, "16:9", "zero", { scenes: { 0: { methode: "extension" } } }); const envoi = await p.evaluate(() => window.__envoi), parts = await p.evaluate(() => FMT.etat.decors.get(0).parts), serveur = await p.evaluate(() => [...FMT.etat.couches.values()].some(g => g.serveur));
  const e = await exporter(p, path.join(OUT, "serveur.mp4")), z = await zero();
  return { ok: envoi && envoi.length === 1 && envoi[0].types.every(t => t === "image/png") && serveur && parts.flou < .02 && parts.invente > .2 && z.ok && z.differents === 0 && e.W === 1138, info: JSON.stringify({ envoi, parts, z }) } });

await test("v9.0 parcours par défaut : accueil → « Plein écran, rien coupé » (choix par défaut) → analyse automatique → côtés dessinés par le serveur, 0 pixel d'origine modifié", async () => {
  const VP = path.join(HERE, "medias", "fidele", "personnes_fixe.mp4"); if (!fs.existsSync(VP)) return { ok: false, info: "lancer tests/fidele/creer_videos.sh" };
  await p.evaluate(() => { FMT.fermer(); delete window.__fmtSansAuto; localStorage.removeItem("fmt_ecran") });
  const [fc] = await Promise.all([p.waitForEvent("filechooser"), p.evaluate(() => document.querySelector("#pickf").click())]); await fc.setFiles(VP);
  await p.waitForFunction(() => window.FMT && FMT.etat && FMT.etat.pret && !FMT.etat.occupe, null, { timeout: 600000 });
  const a = await p.evaluate(() => ({ mode: FMT.etat.reglages.mode, presse: document.querySelector('#fmt_ecr [data-e="ia"]').getAttribute("aria-pressed"), parts: FMT.etat.decors.get(0) && FMT.etat.decors.get(0).parts, plan: FMT.etat.plans.map(q => [q.methode, q.fond, q.z]), qc: FMT.etat.qc.map(q => q && q.journal), serveur: [...FMT.etat.couches.values()].some(g => g.serveur), sortie: FMT.etat.sortie }));
  const e = await exporter(p, path.join(OUT, "defaut_ia.mp4")), z = await zero(); await p.evaluate(() => { window.__fmtSansAuto = true });
  return { ok: a.mode === "zero" && a.presse === "true" && a.serveur && a.parts && a.parts.flou < .05 && z.ok && z.differents === 0 && e.W === 768 && e.H === 432, info: JSON.stringify({ ...a, z }) } });

await test("v9.1 sans jeton Kaggle : le téléphone dessine TOUT le côté (LaMa), plus aucun flou ni bande, 0 pixel d'origine modifié", async () => {
  const VP = path.join(HERE, "medias", "fidele", "personnes_fixe.mp4"); if (!fs.existsSync(VP) || !fs.existsSync(path.join(HERE, "medias", "lama_fp32.onnx"))) return { ok: false, info: "vidéo ou tests/medias/lama_fp32.onnx absents" };
  await p.evaluate(() => { FMT.fermer(); localStorage.removeItem("kaggle_jeton") });
  await analyser(p, VP, "16:9", "zero", { fond: "genere" }); const a = await p.evaluate(() => ({ parts: FMT.etat.decors.get(0) && FMT.etat.decors.get(0).parts, journal: FMT.etat.qc[0].journal, kg: KG.actif() }));
  const e = await exporter(p, path.join(OUT, "lama.mp4")), z = await zero();
  return { ok: !a.kg && a.parts && a.parts.flou < .02 && a.parts.invente > .5 && /LaMa/.test(a.journal.join(" ")) && z.ok && z.differents === 0 && e.W === 768, info: JSON.stringify({ parts: a.parts, z }) } });

console.log(N.errs.length ? "Erreurs de page : " + N.errs.join(" | ") : ""); await N.fermer();
console.log(res.filter(Boolean).length + "/" + res.length + " réussis"); process.exit(res.every(Boolean) && !N.errs.length ? 0 : 1);
