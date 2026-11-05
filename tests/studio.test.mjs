/* Tests : autorisations, sauvegarde chiffrée / restauration, assistant en langage courant.  node tests/studio.test.mjs */
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
const { chromium } = await import(process.env.PW || "playwright");
const HERE = path.dirname(fileURLToPath(import.meta.url)), PORT = 8771;
const srv = spawn(process.execPath, [path.join(HERE, "serveur.mjs")], { env: { ...process.env, PORT }, stdio: "ignore" }); await new Promise(r => setTimeout(r, 600));
const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ["--use-angle=swiftshader"] });
const p = await b.newPage(); const errs = []; p.on("pageerror", e => errs.push(e.message));
let answer = false; p.on("dialog", d => answer ? d.accept() : d.dismiss());
await p.goto("http://localhost:" + PORT + "/index.html"); await p.waitForFunction(() => window.STUDIO && window.MODELS);
const res = []; const test = async (n, f) => { let ok = false, info = ""; try { const r = await f(); ok = r.ok; info = r.info } catch (e) { info = "exception : " + e.message.split("\n")[0] } res.push(ok); console.log((ok ? "✓ " : "✗ ") + n + " — " + info) };
await test("Lien refusé : rien n’est envoyé au serveur", async () => { answer = false; const req = []; p.on("request", r => { if (/workers\.dev/.test(r.url())) req.push(r.url()) });
  await p.evaluate(() => LINK.go("https://www.tiktok.com/@a/video/123")); await p.waitForTimeout(500);
  return { ok: req.length === 0 && /non autorisé/.test(await p.textContent("#lnkst")), info: req.length + " requête(s), « " + (await p.textContent("#lnkst")).slice(0, 50) + "… »" } });
await test("Téléchargement de modèle refusé : aucune demande, erreur claire", () => p.evaluate(async () => {
  MODELS._test.add({ id: "tz", nom: "z", url: "/__test/model.bin?k=tz", integre: false, taille: 6291456, sha256: "x", role: "", fonction: "", version: "", secours: "" });
  let c; try { await MODELS.download("tz") } catch (e) { c = e.code } const l = (await (await fetch("/__test/log")).json()).filter(x => x.k === "tz");
  return { ok: c === "ANNULE" && l.length === 0, info: c + ", " + l.length + " demande(s)" } }));
await test("Autorisation accordée, mémorisée, puis retirée", async () => { answer = true; const a = await p.evaluate(() => STUDIO.consent("modele"));
  const g = await p.evaluate(() => STUDIO.granted("modele")); await p.evaluate(() => STUDIO.revoke("modele")); const g2 = await p.evaluate(() => STUDIO.granted("modele"));
  return { ok: a && g && !g2, info: "accordée → mémorisée → retirée" } });
await test("Sauvegarde chiffrée : relue avec la bonne phrase, refusée avec une mauvaise ou si modifiée", () => p.evaluate(async () => {
  localStorage.setItem("profil", "naturel"); localStorage.setItem("secret_hors_liste", "x"); const o = await STUDIO.backup("phrase longue 123");
  localStorage.removeItem("profil"); const n = await STUDIO.restore(o, "phrase longue 123"); const back = localStorage.getItem("profil");
  let bad = ""; try { await STUDIO.restore(o, "mauvaise") } catch (e) { bad = e.message }
  const t = { ...o, donnees: o.donnees.slice(0, -4) + (o.donnees.slice(-4) === "AAAA" ? "BBBB" : "AAAA") }; let tam = ""; try { await STUDIO.restore(t, "phrase longue 123") } catch (e) { tam = e.message }
  const clair = JSON.stringify(o).includes("naturel"); localStorage.removeItem("profil");
  return { ok: o.chiffre && !clair && back === "naturel" && n > 0 && /incorrecte/.test(bad) && /incorrecte|modifié/.test(tam) && !JSON.stringify(o).includes("secret_hors_liste"), info: n + " réglages restaurés ; contenu illisible sans la phrase ; mauvaise phrase et fichier modifié refusés ; clés hors liste exclues" } }));
await test("Sauvegarde refusée si ce n’est pas un fichier de l’app", () => p.evaluate(async () => { let m = ""; try { await STUDIO.restore({ format: "autre" }) } catch (e) { m = e.message } return { ok: /pas une sauvegarde/.test(m), info: m } }));
await test("Assistant (vidéo) : « stabilise, réduis le bruit, vidéo sombre, exporte en 4K si la qualité le permet »", async () => {
  await p.setInputFiles("#f", path.join(HERE, "medias", "video_vieuxtel.mp4")); await p.waitForFunction(() => v.videoWidth > 0); await p.waitForTimeout(1500);
  const r = await p.evaluate(() => { const out = STUDIO.plan("Stabilise, réduis le bruit, la vidéo est sombre, exporte en 4K si la qualité le permet et améliore les visages");
    return { out, q: document.querySelector("#q").value, stab: document.querySelector("#o_stab").checked, dn: P.dn, prof: PROF.id } });
  return { ok: r.q === "3840" && r.stab && r.dn >= .5 && r.prof === "nuit" && r.out.some(x => /×8/.test(x[1])) && r.out.some(x => x[0] === "warn" && /Visages/.test(x[1])), info: r.out.length + " lignes ; 4K avec avertissement ×8 ; stabilisation ; bruit ; rendu Faible luminosité ; visages : limite expliquée" } });
await test("Assistant : vitesse et sens préparés ; génération refusée honnêtement", () => p.evaluate(() => { const out = STUDIO.plan("remets à l'envers au ralenti et génère une musique");
  return { ok: document.querySelector("#tr_r").checked && document.querySelector("#tr_v").value === "0.5" && out.some(x => x[0] === "warn" && /Génération/.test(x[1])), info: out.map(x => x[0]).join(",") } }));
await test("Fenêtre ⚙️ Paramètres : autorisations, sauvegarde, historique", async () => { await p.evaluate(() => document.querySelector("#stb").click()); await p.waitForFunction(() => document.querySelector("#stg").open, null, { timeout: 120000 });
  const t = await p.textContent("#stg"); await p.evaluate(() => document.querySelector('#stg [data-s="close"]').click()); return { ok: /Autorisations/.test(t) && /Sauvegarde/.test(t) && /Historique/.test(t), info: "affichée et fermée" } });
/* v3.2 */
await test("Sauvegarde piégée restaurée : l’historique s’affiche sans exécuter de code", async () => {
  await p.evaluate(async () => { window.__pwned = 0; localStorage.removeItem("recettes");
    const piege = [{ date: "x", media: '<img src=x onerror="window.__pwned=1">', source: "<b>gras</b>", sortie: "<script>window.__pwned=2<\/script>", profil: "\"'><svg onload=window.__pwned=3>", operations: ["<i>op</i>"], ia: "non" }, "pas un objet"];
    await STUDIO.restore({ format: "retouche-sauvegarde", v: 1, chiffre: false, contenu: { data: { recettes: JSON.stringify(piege) } } }) });
  await p.evaluate(() => document.querySelector("#stb").click()); await p.waitForTimeout(400);
  const r = await p.evaluate(() => ({ pw: window.__pwned, img: document.querySelectorAll("#stg li img, #stg li svg, #stg li script, #stg li b").length, txt: document.querySelector("#stg").textContent }));
  await p.evaluate(() => { document.querySelector('#stg [data-s="close"]').click(); localStorage.removeItem("recettes") });
  return { ok: r.pw === 0 && r.img === 0 && /<b>gras<\/b>/.test(r.txt), info: "code exécuté : " + (r.pw ? "OUI" : "non") + " ; balises créées : " + r.img + " ; texte affiché tel quel" } });
await test("Diagnostic (version Claude) : rien d’envoyé sans autorisation, envoyé après « Autoriser »", async () => {
  const r = await p.evaluate(async () => { const sent = []; localStorage.removeItem("autorisations");
    window.claude = { use: async k => k === "db" ? { collection: () => ({ doc: id => ({ set: async x => sent.push(id) }) }) } : null };
    localStorage.setItem("diag_hist", JSON.stringify([{ id: "t1", kind: "test", sent: false }])); await DIAG.flush(); const avant = sent.length;
    document.querySelector("#stb").click(); await new Promise(r => setTimeout(r, 300));
    const btn = document.querySelector('#stg [data-s="grant"][data-k="diagnostic"]'); if (btn) btn.click(); await new Promise(r => setTimeout(r, 300)); await DIAG.flush();
    const apres = sent.length, g = STUDIO.granted("diagnostic"); document.querySelector('#stg [data-s="close"]').click();
    STUDIO.revoke("diagnostic"); delete window.claude; localStorage.removeItem("diag_hist"); return { avant, apres, g, btn: !!btn } });
  return { ok: r.avant === 0 && r.btn && r.g && r.apres >= 1, info: "avant : " + r.avant + " envoi ; bouton Autoriser : " + (r.btn ? "présent" : "absent") + " ; après : " + r.apres + " envoi(s)" } });
await test("Polices de l’app chargées localement (aucune requête vers Google)", async () => {
  await p.close(); /* dernier test : libère la page précédente (vidéo chargée, GPU simulé sur processeur) */
  const cx = await b.newContext(), p2 = await cx.newPage(); const ext = []; p2.on("request", r => { const u = new URL(r.url()); if (u.hostname !== "localhost") ext.push(u.hostname) });
  await p2.goto("http://localhost:" + PORT + "/index.html", { waitUntil: "domcontentloaded", timeout: 120000 }); await p2.waitForFunction(() => window.STUDIO, null, { timeout: 120000 }); await p2.evaluate(() => document.fonts.ready);
  const f = await p2.evaluate(async () => { await document.fonts.load("700 20px 'Bricolage Grotesque'"); await document.fonts.load("400 14px 'Instrument Sans'"); await document.fonts.load("400 14px 'DM Mono'");
    /* document.fonts.check() répond « vrai » même quand la police n'existe pas : on vérifie qu'elle est réellement chargée */
    return ["Bricolage Grotesque", "Instrument Sans", "DM Mono"].map(n => [...document.fonts].some(ff => ff.family.replace(/["']/g, "") === n && ff.status === "loaded")) });
  await cx.close(); return { ok: f.every(Boolean) && ext.length === 0, info: "polices : " + f.map(x => x ? "chargée" : "absente").join(", ") + " ; requêtes externes : " + (ext.length ? [...new Set(ext)].join(", ") : "aucune") } });
console.log("Erreurs JavaScript : " + (errs.length ? errs.join(" | ") : "aucune"));
console.log(`Résultat : ${res.filter(Boolean).length} réussis, ${res.filter(x => !x).length} échoués.`); await b.close(); srv.kill(); process.exit(res.every(Boolean) && !errs.length ? 0 : 1);
