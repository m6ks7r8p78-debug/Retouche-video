/* v7.0 : retirer un filtre du visage (defiltre-visage.js) — de bout en bout dans Chromium, vrais modèles (détecteur, MI-GAN, GFPGAN).
   node tests/dfv.test.mjs
   Médias : tests/medias/filtres_labo (personnes jamais vues par le détecteur, éléments de filtre SIMULÉS, vérité connue) et
   modeles/migan_pipeline_v2.onnx s'il est présent dans tests/medias (sinon téléchargé depuis Hugging Face comme dans l'app).
   Ces résultats ne valent ni validation sur de vrais filtres Snapchat/Instagram ni validation sur iPhone. */
import { spawn } from "child_process"; import path from "path"; import fs from "fs"; import { fileURLToPath } from "url";
const { chromium } = await import(process.env.PW || "playwright");
const HERE = path.dirname(fileURLToPath(import.meta.url)), PORT = 8798;
const srv = spawn(process.execPath, [path.join(HERE, "serveur.mjs")], { env: { ...process.env, PORT }, stdio: "ignore" }); await new Promise(r => setTimeout(r, 600));
const b = await chromium.launch({ args: ["--use-angle=swiftshader"] });
const MIGAN = path.join(HERE, "medias", "migan.onnx");
if (!fs.existsSync(MIGAN)) { console.log("Modèle absent : placer migan_pipeline_v2.onnx dans " + MIGAN + " (voir tests/README.md)."); process.exit(2) }
const MG = fs.readFileSync(MIGAN), servirMigan = pg => pg.route(/huggingface\.co\/.*migan_pipeline_v2\.onnx/, r => r.fulfill({ status: 200, body: MG, headers: { "content-type": "application/octet-stream", "access-control-allow-origin": "*", "content-length": String(MG.length) } }));
const p = await b.newPage(); await servirMigan(p); const errs = []; p.on("pageerror", e => errs.push(e.message)); p.on("dialog", d => d.accept());
await p.goto("http://localhost:" + PORT + "/index.html"); await p.waitForFunction(() => window.VISAGE && window.MODELS && window.chargerModule);
await p.evaluate(() => chargerModule("defiltre")); await p.waitForFunction(() => window.DFV && window.ERASE && window.RVIS);
const CAS = JSON.parse(fs.readFileSync(path.join(HERE, "medias/filtres_labo/cas.json"))).cas;
const res = [], stats = {}; const test = async (n, f) => { let ok = false, info = ""; try { const r = await f(); ok = r.ok; info = r.info } catch (e) { info = "exception : " + e.message.split("\n")[0] } res.push(ok); console.log((ok ? "✓ " : "✗ ") + n + " — " + info) };
await p.evaluate(() => {
  window.img = async u => { const i = new Image(); i.src = u; await i.decode(); const c = document.createElement("canvas"); c.width = i.naturalWidth; c.height = i.naturalHeight; c.getContext("2d").drawImage(i, 0, 0); return c };
  window.px = c => c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
});
for (const c of CAS) {
  await test(`${c.id} ${c.personne.split(" ").pop()} — ${c.filtre}`, async () => {
    const r = await p.evaluate(async c => {
      const F = await img("tests/medias/filtres_labo/" + c.image), V = px(await img("tests/medias/filtres_labo/" + c.vrai)), M = px(await img("tests/medias/filtres_labo/" + c.masque)), A = px(F);
      const t = performance.now(), R = await DFV.retirer(F), O = px(R.canvas), n = F.width * F.height;
      let ex = 0, tp = 0, det = 0, dAv = 0, dAp = 0, hors = 0, nh = 0;
      for (let i = 0; i < n; i++) { const e = M[i * 4] > 76, d = R.trou[i] === 1; ex += e; det += d; tp += e && d;
        const k = i * 4, av = (Math.abs(A[k] - V[k]) + Math.abs(A[k + 1] - V[k + 1]) + Math.abs(A[k + 2] - V[k + 2])) / 3, ap = (Math.abs(O[k] - V[k]) + Math.abs(O[k + 1] - V[k + 1]) + Math.abs(O[k + 2] - V[k + 2])) / 3;
        if (e) { dAv += av; dAp += ap } else { hors += Math.abs(O[k] - A[k]) + Math.abs(O[k + 1] - A[k + 1]) + Math.abs(O[k + 2] - A[k + 2]); nh++ } }
      return { ex, det, rappel: ex ? tp / ex : null, precision: det ? tp / det : null, ecartAvant: ex ? dAv / ex : 0, ecartApres: ex ? dAp / ex : 0, horsMoyen: hors / nh / 3, ms: Math.round(performance.now() - t), j: R.journal.join(" ") };
    }, c);
    (stats[c.filtre] = stats[c.filtre] || []).push(r);
    if (c.filtre === "beaute") return { ok: r.det === 0, info: `rien ne doit être effacé : ${r.det} pixels effacés — ${r.j}` };
    return { ok: r.rappel > .6 && r.ecartApres < r.ecartAvant * .6, info: `rappel ${(100 * r.rappel).toFixed(0)} %, précision ${(100 * r.precision).toFixed(0)} %, écart à la vraie photo dans la zone ${r.ecartAvant.toFixed(1)} → ${r.ecartApres.toFixed(1)}, hors zone ${r.horsMoyen.toFixed(2)}, ${(r.ms / 1000).toFixed(1)} s` };
  });
}
const PROP = JSON.parse(fs.readFileSync(path.join(HERE, "medias/filtres_labo/cas.json"))).proportions || [];
for (const c of PROP) await test(`proportions : yeux agrandis de ${Math.round((c.yeux - 1) * 100)} % (${c.id}), réglage « Yeux » à ${Math.round(100 / c.yeux)} %`, async () => {
  const r = await p.evaluate(async c => {
    const F = await img("tests/medias/filtres_labo/" + c.image), V = px(await img("tests/medias/filtres_labo/" + c.vrai)), M = px(await img("tests/medias/filtres_labo/" + c.masque)), A = px(F);
    const f = (await VISAGE.detecter(F, F.width, F.height, .55))[0], O = px(DFV.deformer(F, f, { yeux: 1 / c.yeux, nez: 1, bas: 1 }));
    let av = 0, ap = 0, n = 0; for (let i = 0; i < M.length; i += 4) if (M[i] > 127) { n++; for (let k = 0; k < 3; k++) { av += Math.abs(A[i + k] - V[i + k]); ap += Math.abs(O[i + k] - V[i + k]) } }
    return { av: av / n / 3, ap: ap / n / 3 } }, c);
  return { ok: r.ap < r.av * .8, info: `écart à la vraie photo autour des yeux ${r.av.toFixed(1)} → ${r.ap.toFixed(1)}` };
});
await test("photo sans filtre : aucun pixel modifié", async () => {
  const r = await p.evaluate(async u => { const F = await img(u), A = px(F), R = await DFV.retirer(F), O = px(R.canvas); let m = 0; for (let i = 0; i < A.length; i++) m = Math.max(m, Math.abs(A[i] - O[i])); return { m, part: R.part, j: R.journal.join(" ") } }, "tests/medias/filtres_labo/" + CAS[0].vrai);
  return { ok: r.m === 0 && r.part === 0, info: r.j + " (écart max " + r.m + ")" };
});
await test("photo sans visage : inchangée, message clair", async () => {
  const r = await p.evaluate(async () => { const F = await img("tests/medias/chat_flou.jpg"), A = px(F), R = await DFV.retirer(F), O = px(R.canvas); let m = 0; for (let i = 0; i < A.length; i++) m = Math.max(m, Math.abs(A[i] - O[i])); return { m, j: R.journal.join(" ") } });
  return { ok: r.m === 0 && /Aucun visage/.test(r.j), info: r.j };
});
await test("écran : ouverture, avant/après, carte, enregistrement prêt, fermeture ; bouton d'accueil relié", async () => {
  const r = await p.evaluate(async u => { const F = await img(u), bl = await new Promise(r => F.toBlob(r, "image/jpeg", .92)); await DFV.ouvrir(new File([bl], "chien.jpg", { type: "image/jpeg" }));
    const ok = !document.querySelector("#dfv_ok").disabled, m = document.querySelector("#dfv_msg").textContent; document.querySelector("#dfv_cb").click(); const carte = document.querySelector("#dfv").classList.contains("carte");
    document.querySelector("#dfv_x").click(); return { ok, m, carte, ferme: document.querySelector("#dfv").hidden, bouton: !!document.querySelector("#pickd") && !!document.querySelector("#dfb") } }, "tests/medias/filtres_labo/" + CAS.find(c => c.filtre === "chien").image);
  return { ok: r.ok && r.carte && r.ferme && r.bouton, info: r.m.slice(0, 150) };
});
await test("détecteur injoignable : message clair, photo intacte", async () => {
  const q = await b.newPage(); q.on("dialog", d => d.accept()); await q.route("**/detecteur_ajouts_v2.onnx", r => r.abort());
  await q.goto("http://localhost:" + PORT + "/index.html"); await q.waitForFunction(() => window.chargerModule);
  const m = await q.evaluate(async u => { await chargerModule("defiltre"); const i = new Image(); i.src = u; await i.decode(); const c = document.createElement("canvas"); c.width = i.width; c.height = i.height; c.getContext("2d").drawImage(i, 0, 0);
    const bl = await new Promise(r => c.toBlob(r, "image/jpeg", .9)); await DFV.ouvrir(new File([bl], "x.jpg", { type: "image/jpeg" })); return document.querySelector("#dfv_msg").textContent + "|" + document.querySelector("#dfv_ok").disabled }, "tests/medias/filtres_labo/" + CAS[0].image);
  await q.close(); return { ok: /Impossible/.test(m) && /pas été modifiée/.test(m) && m.endsWith("true"), info: m.slice(0, 160) };
});
for (const [f, L] of Object.entries(stats)) {
  const moy = k => L.filter(r => r[k] != null).reduce((a, r) => a + r[k], 0) / Math.max(1, L.filter(r => r[k] != null).length);
  console.log(`moyenne ${f} : rappel ${(100 * moy("rappel")).toFixed(0)} %, précision ${(100 * moy("precision")).toFixed(0)} %, écart dans la zone ${moy("ecartAvant").toFixed(1)} → ${moy("ecartApres").toFixed(1)}, ${(moy("ms") / 1000).toFixed(1)} s`);
}
console.log("erreurs de la page : " + (errs.length ? errs.join(" | ") : "aucune"));
console.log("Résultat : " + res.filter(x => x).length + " réussis, " + res.filter(x => !x).length + " échoués.");
await b.close(); srv.kill(); process.exit(res.every(x => x) && !errs.length ? 0 : 1);
