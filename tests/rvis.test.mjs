/* v6.9 : restauration des visages (restauration-visage.js) — de bout en bout dans Chromium, vrai modèle, vrai moteur WebAssembly.
   node tests/rvis.test.mjs            (écrit les visages produits dans tests/sorties/rvis/ pour tests/banc_visages.py --js)
   Médias : 9 portraits officiels de la NASA (domaine public, sources dans tests/medias/visages_dp/sources.json), DÉGRADÉS par le
   test (réduction, flou, JPEG) : la vérité terrain est connue. Ce sont de vrais visages, mais pas de vraies vieilles photos de
   famille ni des photos d'iPhone : ces résultats ne valent pas validation sur iPhone. */
import { spawn } from "child_process"; import path from "path"; import fs from "fs"; import { fileURLToPath } from "url";
const { chromium } = await import(process.env.PW || "playwright");
const HERE = path.dirname(fileURLToPath(import.meta.url)), PORT = 8797, OUT = path.join(HERE, "sorties", "rvis"); fs.mkdirSync(OUT, { recursive: true });
const srv = spawn(process.execPath, [path.join(HERE, "serveur.mjs")], { env: { ...process.env, PORT }, stdio: "ignore" }); await new Promise(r => setTimeout(r, 600));
const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ["--use-angle=swiftshader"] });
const p = await b.newPage(); const errs = []; p.on("pageerror", e => errs.push(e.message)); p.on("dialog", d => d.accept());   /* « Autoriser » le téléchargement du modèle, comme sur le téléphone */
await p.goto("http://localhost:" + PORT + "/index.html"); await p.waitForFunction(() => window.VISAGE && window.MODELS && window.chargerModule);
await p.evaluate(() => chargerModule("visages")); await p.waitForFunction(() => window.RVIS);
const res = []; const test = async (n, f) => { let ok = false, info = ""; try { const r = await f(); ok = r.ok; info = r.info } catch (e) { info = "exception : " + e.message.split("\n")[0] } res.push(ok); console.log((ok ? "✓ " : "✗ ") + n + " — " + info) };
const portraits = JSON.parse(fs.readFileSync(path.join(HERE, "medias/visages_dp/sources.json"))).map(s => "tests/medias/visages_dp/" + s.fichier);

/* aides dans la page : charger une image, la dégrader (réduction + flou + JPEG), comparer deux toiles */
await p.evaluate(() => {
  window.img = async u => { const i = new Image(); i.src = u; await i.decode(); const c = document.createElement("canvas"); c.width = i.naturalWidth; c.height = i.naturalHeight; c.getContext("2d").drawImage(i, 0, 0); return c };
  window.degrader = async (c, e, q) => {   /* photo entière réduite d'un facteur e puis ré-agrandie, recompressée en JPEG qualité q */
    const s = document.createElement("canvas"); s.width = Math.round(c.width * e); s.height = Math.round(c.height * e); const x = s.getContext("2d"); x.imageSmoothingQuality = "high"; x.drawImage(c, 0, 0, s.width, s.height);
    const bl = await new Promise(r => s.toBlob(r, "image/jpeg", q)), i = new Image(); i.src = URL.createObjectURL(bl); await i.decode();
    const o = document.createElement("canvas"); o.width = c.width; o.height = c.height; const y = o.getContext("2d"); y.imageSmoothingQuality = "high"; y.drawImage(i, 0, 0, o.width, o.height); return o };
  window.ecart = (a, b) => { const A = a.getContext("2d").getImageData(0, 0, a.width, a.height).data, B = b.getContext("2d").getImageData(0, 0, b.width, b.height).data; let m = 0, s = 0; for (let i = 0; i < A.length; i++) if (i % 4 !== 3) { const d = Math.abs(A[i] - B[i]); s += d; if (d > m) m = d } return { max: m, moyen: s / (A.length * .75) } };
  window.png = c => c.toDataURL("image/png");
});

await test("modèle téléchargé, empreinte vérifiée, chargé dans le moteur WebAssembly", async () => {
  const t = Date.now(); await p.evaluate(() => RVIS.charger()); const st = await p.evaluate(() => MODELS.status ? MODELS.status("gfpgan") : null);
  return { ok: true, info: "chargé en " + ((Date.now() - t) / 1000).toFixed(1) + " s" + (st && st.then ? "" : "") };
});

const temps = [];
for (const [k, u] of portraits.entries()) {
  await test("portrait " + (k + 1) + " réduit ×0,16 + JPEG 40 → restauré", async () => {
    const r = await p.evaluate(async u => {
      const gt = await img(u), lq = await degrader(gt, .16, .4), R = await RVIS.restaurer(lq, { force: 1 });
      const v = R.visages.find(v => v.statut === "restauré");
      /* visage aligné de la vérité terrain, de l'entrée et de la sortie, avec la même transformation */
      const al = c => { const a = document.createElement("canvas"); a.width = a.height = 512; const x = a.getContext("2d"); x.imageSmoothingQuality = "high"; x.setTransform(v.M[0], v.M[1], -v.M[1], v.M[0], v.M[2], v.M[3]); x.drawImage(c, 0, 0); return png(a) };
      const inv = v && v.inventee, R8 = RVIS.composer(R.S, .8);
      return { visages: R.visages.map(v => v.statut), oeil: v && v.oeil, ms: v && v.msModele, inv, inv8: v && v.inventee,
        hors: (() => { /* hors du visage, rien ne doit changer */ const A = lq.getContext("2d").getImageData(0, 0, 40, 40).data, B = R.canvas.getContext("2d").getImageData(0, 0, 40, 40).data; let m = 0; for (let i = 0; i < A.length; i++) m = Math.max(m, Math.abs(A[i] - B[i])); return m })(),
        gt: v && al(gt), lq: v && al(lq), out: v && al(R.canvas), out8: v && al(R8.canvas) };
    }, u);
    if (r.gt) for (const n of ["gt", "lq", "out", "out8"]) fs.writeFileSync(path.join(OUT, String(k).padStart(2, "0") + "_" + n + ".png"), Buffer.from(r[n].split(",")[1], "base64"));
    if (r.ms) temps.push(r.ms);
    return { ok: r.visages[0] === "restauré" && r.hors === 0 && r.inv > 0 && r.inv8 < r.inv, info: "écart entre les yeux " + r.oeil + " px, modèle " + (r.ms / 1000).toFixed(1) + " s, inventé " + Math.round(100 * r.inv) + " % (force 100 %) / " + Math.round(100 * r.inv8) + " % (80 %), coin de la photo inchangé : " + (r.hors === 0) };
  });
}

await test("les 9 portraits nets d'origine : laissés tels quels, photo identique au pixel près", async () => {
  const r = await p.evaluate(async us => { const o = []; for (const u of us) { const c = await img(u), S = await RVIS.analyser(c), R = RVIS.composer(S); o.push({ s: S.visages.map(v => v.statut + " " + v.nettete), e: ecart(c, R.canvas).max }) } return o }, portraits);
  return { ok: r.every(x => x.s.length === 1 && x.s[0].startsWith("déjà net") && x.e === 0), info: "netteté : " + r.map(x => x.s.join("/")).join(" · ") };
});
await test("les 9 portraits dégradés (×0,3 + JPEG 60, et ×0,16 + JPEG 40) : tous à restaurer", async () => {
  const v = await p.evaluate(async us => { const o = []; for (const u of us) for (const [e, q] of [[.3, .6], [.16, .4]]) { const c = await degrader(await img(u), e, q), S = await RVIS.analyser(c); o.push(S.visages.map(v => v.statut === "restauré" ? "R" + v.nettete : v.statut + v.nettete).join("/")) } return o }, portraits);
  return { ok: v.every(x => x.startsWith("R")), info: v.join(" · ") };
});
await test("aucun visage (chat) : photo inchangée, message honnête", async () => {
  const r = await p.evaluate(async () => { const c = await img("tests/medias/chat_flou.jpg"), R = await RVIS.restaurer(c); return { n: R.visages.length, e: ecart(c, R.canvas), m: RVIS.resume(R.S) } });
  return { ok: r.n === 0 && r.e.max === 0 && /Aucun visage/.test(r.m), info: r.m };
});
await test("visage minuscule (≈ 8 px entre les yeux) : pas restauré, rien n'est inventé", async () => {
  const r = await p.evaluate(async u => { const g = await img(u), s = document.createElement("canvas"); s.width = 900; s.height = 900; const x = s.getContext("2d"); x.fillStyle = "#777"; x.fillRect(0, 0, 900, 900); x.drawImage(g, 400, 400, g.width * .07, g.height * .07);
    const R = await RVIS.restaurer(s); return { s: R.visages.map(v => v.statut + " (" + v.oeil + " px)"), e: ecart(s, R.canvas) } }, portraits[0]);
  return { ok: r.e.max === 0 && !r.s.some(x => x.startsWith("restauré")), info: (r.s.join(", ") || "non repéré") + ", écart max " + r.e.max };
});
await test("force 0 % : le visage recollé est l'original (écart ≤ 2 niveaux, dû au va-et-vient de l'alignement)", async () => {
  const r = await p.evaluate(async u => { const lq = await degrader(await img(u), .16, .4), S = await RVIS.analyser(lq), R = RVIS.composer(S, 0); return { e: ecart(lq, R.canvas), inv: S.visages.find(v => v.statut === "restauré").inventee } }, portraits[1]);
  return { ok: r.e.moyen < .5 && r.inv < .01, info: "écart moyen " + r.e.moyen.toFixed(3) + ", max " + r.e.max + ", inventé " + Math.round(100 * r.inv) + " %" };
});
await test("plusieurs visages sur une photo : chacun repéré et traité séparément", async () => {
  const r = await p.evaluate(async us => { const g = await Promise.all(us.map(img)), s = document.createElement("canvas"); s.width = 1200; s.height = 520; const x = s.getContext("2d");
    g.forEach((c, i) => x.drawImage(c, i * 400, 0, 400, 400 * c.height / c.width)); const lq = await degrader(s, .3, .45), R = await RVIS.restaurer(lq); return R.visages.map(v => v.statut) }, portraits.slice(3, 6));
  return { ok: r.length === 3 && r.every(s => s === "restauré"), info: r.join(", ") };
});
await test("écran : ouverture avec un fichier, avant/après, force, carte, enregistrement prêt, fermeture", async () => {
  const r = await p.evaluate(async u => {
    const lq = await degrader(await img(u), .16, .4), bl = await new Promise(r => lq.toBlob(r, "image/jpeg", .9));
    const pr = RVIS.ouvrir(new File([bl], "essai.jpg", { type: "image/jpeg" })); await pr;
    const ok1 = !document.querySelector("#rv_ok").disabled, m = document.querySelector("#rv_msg").textContent;
    const f = document.querySelector("#rv_force"); f.value = 40; f.dispatchEvent(new Event("input")); await new Promise(r => setTimeout(r, 200));
    document.querySelector("#rv_cb").click(); const carte = document.querySelector("#rvis").classList.contains("carte");
    document.querySelector("#rv_x").click(); return { ok1, m, carte, ferme: document.querySelector("#rvis").hidden };
  }, portraits[4]);
  return { ok: r.ok1 && r.carte && r.ferme && /restauré/.test(r.m), info: r.m };
});
await test("bouton d'accueil « Restaurer les visages d'une photo » présent et relié", async () => {
  const r = await p.evaluate(() => ({ b: !!document.querySelector("#pickv"), f: !!document.querySelector("#fv"), r: !!document.querySelector("#rvb") }));
  return { ok: r.b && r.f && r.r, info: JSON.stringify(r) };
});

await test("téléchargement refusé : rien n'est envoyé ni modifié, explication claire", async () => {
  const q = await b.newPage(); q.on("dialog", d => d.dismiss()); await q.goto("http://localhost:" + PORT + "/index.html"); await q.waitForFunction(() => window.MODELS && window.chargerModule);
  const r = await q.evaluate(async u => { try { STUDIO.revoke("modele"); await MODELS.remove("gfpgan") } catch (e) {} await chargerModule("visages"); const i = new Image(); i.src = u; await i.decode();
    const s = document.createElement("canvas"); s.width = i.width; s.height = i.height; const x = s.getContext("2d"); x.drawImage(i, 0, 0, i.width * .16, i.height * .16); x.drawImage(s, 0, 0, i.width * .16, i.height * .16, 0, 0, i.width, i.height);
    const bl = await new Promise(r => s.toBlob(r, "image/jpeg", .9)); await RVIS.ouvrir(new File([bl], "x.jpg", { type: "image/jpeg" })); return document.querySelector("#rv_msg").textContent }, portraits[0]);
  await q.close(); return { ok: /non autorisé/.test(r), info: r };
});
/* modèle injoignable : page neuve, cache du modèle vidé, téléchargement coupé → message clair, photo intacte */
await test("modèle injoignable : message clair, photo d'origine intacte", async () => {
  const q = await b.newPage(); q.on("dialog", d => d.accept()); await q.route("**/modeles/lourds/**", r => r.abort());
  await q.goto("http://localhost:" + PORT + "/index.html"); await q.waitForFunction(() => window.MODELS && window.chargerModule);
  const r = await q.evaluate(async u => { try { await MODELS.remove("gfpgan") } catch (e) {} await chargerModule("visages");
    const i = new Image(); i.src = u; await i.decode(); const c = document.createElement("canvas"); c.width = i.width; c.height = i.height; c.getContext("2d").drawImage(i, 0, 0);
    const s = document.createElement("canvas"); s.width = c.width; s.height = c.height; const x = s.getContext("2d"); x.drawImage(c, 0, 0, c.width * .16, c.height * .16); x.drawImage(s, 0, 0, c.width * .16, c.height * .16, 0, 0, c.width, c.height);
    const bl = await new Promise(r => s.toBlob(r, "image/jpeg", .9)); await RVIS.ouvrir(new File([bl], "x.jpg", { type: "image/jpeg" }));
    return { m: document.querySelector("#rv_msg").textContent, dis: document.querySelector("#rv_ok").disabled } }, portraits[0]);
  await q.close(); return { ok: /impossible/i.test(r.m) && /connexion|réseau/i.test(r.m) && /pas été modifiée/.test(r.m) && r.dis, info: r.m.slice(0, 160) };
});

console.log("temps du modèle (Chromium, WebAssembly, " + (await p.evaluate(() => ort.env.wasm.numThreads)) + " fil) : médiane " + (temps.sort((a, b) => a - b)[temps.length >> 1] / 1000).toFixed(1) + " s");
console.log("erreurs de la page : " + (errs.length ? errs.join(" | ") : "aucune"));
console.log("Résultat : " + res.filter(x => x).length + " réussis, " + res.filter(x => !x).length + " échoués.");
await b.close(); srv.kill(); process.exit(res.every(x => x) && !errs.length ? 0 : 1);
