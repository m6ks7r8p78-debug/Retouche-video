/* Essai de bout en bout de « Changer de format » dans Chromium (vrais modèles, vraie app).
   node tests/format/essai.mjs VIDEO [format=auto] [mode=auto] [dossier_sortie] [reglages JSON]
   → sortie.mp4, apercu.png, diag.json ; résumé sur la sortie standard. Sert aussi de brique à tests/format.test.mjs et au banc. */
import { spawn } from "child_process"; import fs from "fs"; import path from "path"; import { fileURLToPath } from "url";
const HERE = path.dirname(fileURLToPath(import.meta.url)), TESTS = path.join(HERE, "..");
export async function navigateur(port = 8791, moteur = "chromium") {
  const pw = await import(process.env.PW || "playwright"), srv = spawn(process.execPath, [path.join(TESTS, "serveur.mjs")], { env: { ...process.env, PORT: port }, stdio: "ignore" }); await new Promise(r => setTimeout(r, 600));
  const b = await pw[moteur].launch(moteur === "chromium" ? { args: ["--enable-unsafe-webgpu", "--use-angle=swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"] } : {});
  const p = await (await b.newContext({ viewport: { width: 430, height: 932 } })).newPage(), errs = []; p.on("pageerror", e => errs.push(e.message)); p.on("dialog", d => /diagnostic/i.test(d.message()) ? d.dismiss() : d.accept());
  const MG = path.join(TESTS, "medias", "migan.onnx"); if (fs.existsSync(MG)) { const body = fs.readFileSync(MG); await p.route(/huggingface\.co\/.*migan_pipeline_v2\.onnx/, r => r.fulfill({ status: 200, body, headers: { "content-type": "application/octet-stream", "access-control-allow-origin": "*" } })) }
  await p.goto("http://localhost:" + port + "/index.html"); await p.waitForFunction(() => window.MODELS && window.VISAGE && window.chargerModule);
  await p.evaluate(() => localStorage.setItem("autorisations", JSON.stringify({ modele: { ok: true } })));
  return { p, errs, fermer: async () => { await b.close(); srv.kill() } };
}
/* ouvre l'outil avec une vidéo, règle, analyse ; renvoie le diagnostic */
export async function analyser(p, video, format = "auto", mode = "auto", reglages = {}) {
  await p.evaluate(async () => { await chargerModule("format"); await FMT.ouvrir() }); await p.setInputFiles("#fmt_f", video);
  await p.waitForFunction(() => FMT.etat && FMT.etat.lecteur, null, { timeout: 60000 });
  await p.evaluate(([f, m, r]) => { const E = FMT.etat; if (f.includes("x")) { E.format = "perso"; E.perso = f.split("x").map(Number) } else E.format = f; E.reglages.mode = m; Object.assign(E.reglages, r) }, [format, mode, reglages]);
  const t0 = Date.now(); await p.evaluate(() => FMT.lancer()); const msg = await p.textContent("#fmt_msg");
  if (!(await p.evaluate(() => FMT.etat.pret))) throw new Error("analyse : " + msg);
  return { ms: Date.now() - t0, msg, diag: await p.evaluate(() => FMT.diagnostic()) };
}
export async function exporter(p, fichier) {
  const t0 = Date.now(); await p.evaluate(() => FMT.creer()); const msg = await p.textContent("#fmt_msg"); const r = await p.evaluate(() => { const r = FMT.etat.res; return r && { W: r.W, H: r.H, images: r.images, codec: r.codec, son: r.son, sonNote: r.sonNote, ms: r.ms, tech: r.tech, qcs: r.qcs.map(q => q && { ok: q.ok, valeurs: q.valeurs, ko: q.controles.filter(c => !c.ok).map(c => c.code) }), taille: r.blob.size } });
  if (!r) throw new Error("export : " + msg);
  const d = await p.evaluate(async () => { const a = new Uint8Array(await FMT.etat.res.blob.arrayBuffer()); let s = ""; for (let i = 0; i < a.length; i += 32768) s += String.fromCharCode(...a.subarray(i, i + 32768)); return btoa(s) }); fs.writeFileSync(fichier, Buffer.from(d, "base64"));
  return { ...r, msMur: Date.now() - t0, msg };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [, , VID, FORMAT = "auto", MODE = "auto", OUT = path.join(TESTS, "sorties", "format"), REG = "{}"] = process.argv; fs.mkdirSync(OUT, { recursive: true }); const nom = path.basename(VID).replace(/\.[^.]+$/, "") + "_" + FORMAT.replace(":", "x") + "_" + MODE;
  const N = await navigateur(); try { const a = await analyser(N.p, path.resolve(VID), FORMAT, MODE, JSON.parse(REG)); console.log("ANALYSE", a.ms, "ms —", a.msg); for (const [i, s] of a.diag.scenes.entries()) console.log("  scène", i + 1, JSON.stringify({ images: s.images, classe: s.classe, sujets: s.sujets, methode: s.methode, z: s.z, fond: s.fond, parts: s.parts, qc: s.qc && { ok: s.qc.ok, v: Object.fromEntries(Object.entries(s.qc.valeurs).map(([k, v]) => [k, v == null ? v : +(+v).toFixed(3)])), j: s.qc.journal } }));
    await N.p.locator("#fmt_cv").screenshot({ path: path.join(OUT, nom + "_apercu.png") }); await N.p.screenshot({ path: path.join(OUT, nom + "_ecran.png") });
    const e = await exporter(N.p, path.join(OUT, nom + ".mp4")); console.log("EXPORT", JSON.stringify(e)); fs.writeFileSync(path.join(OUT, nom + ".json"), JSON.stringify({ analyse: a, export: e }, null, 1));
  } catch (e) { console.log("ÉCHEC", e.message) } finally { if (N.errs.length) console.log("ERREURS PAGE", N.errs); await N.fermer() }
}
