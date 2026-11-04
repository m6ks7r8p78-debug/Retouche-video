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
console.log("Erreurs JavaScript : " + (errs.length ? errs.join(" | ") : "aucune"));
console.log(`Résultat : ${res.filter(Boolean).length} réussis, ${res.filter(x => !x).length} échoués.`); await b.close(); srv.kill(); process.exit(res.every(Boolean) && !errs.length ? 0 : 1);
