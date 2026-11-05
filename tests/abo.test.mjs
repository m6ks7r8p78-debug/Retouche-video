/* Tests des offres Gratuit / Premium (v5.6) : éteintes (rien ne change), allumées sans Premium (verrous), avec Premium,
   vérification d'un code, pubs absentes pour Premium, et route /abo/verifier du serveur.  node tests/abo.test.mjs */
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
const { chromium } = await import(process.env.PW || "playwright");
const HERE = path.dirname(fileURLToPath(import.meta.url)), RACINE = path.join(HERE, ".."), PORT = 8781;
const srv = spawn(process.execPath, [path.join(HERE, "serveur.mjs")], { env: { ...process.env, PORT }, stdio: "ignore" }); await new Promise(r => setTimeout(r, 600));
const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ["--use-angle=swiftshader"] });
const res = []; const test = async (n, f) => { let ok = false, info = ""; try { const r = await f(); ok = r.ok; info = r.info } catch (e) { info = "exception : " + e.message.split("\n")[0] } res.push(ok); console.log((ok ? "✓ " : "✗ ") + n + " — " + info) };
const URLAPP = "http://localhost:" + PORT + "/index.html";
const ABO = fs.readFileSync(path.join(RACINE, "abo.js"), "utf8"), PUB = fs.readFileSync(path.join(RACINE, "pub.js"), "utf8");
const allumer = s => s.replace("actif: false", "actif: true").replace(/serveur: "[^"]*"/, 'serveur: "http://localhost:' + PORT + '/__abo"').replace('pass: "", mensuel: "", annuel: ""', 'pass: "https://exemple.test/p", mensuel: "https://exemple.test/m", annuel: "https://exemple.test/a"');

async function page({ on = false, premium = null, verif = null, pubOn = false } = {}) {
  const p = await b.newPage(); p.__errs = []; p.on("pageerror", e => p.__errs.push(e.message)); p.__pub = 0;
  p.on("request", r => { if (/googlesyndication|doubleclick/.test(r.url())) p.__pub++ });
  if (on) await p.route("**/abo.js", r => r.fulfill({ contentType: "text/javascript", body: allumer(ABO) }));
  if (pubOn) await p.route("**/pub.js", r => r.fulfill({ contentType: "text/javascript", body: PUB.replace("actif: false", "actif: true").replace(/domaine: "[^"]*"/, 'domaine: "localhost"').replace('banniere: ""', 'banniere: "1"') }));
  await p.route(/googlesyndication|doubleclick/, r => r.fulfill({ contentType: "text/javascript", body: "" }));
  if (verif) await p.route("**/__abo/abo/verifier", r => r.fulfill({ status: verif.status || 200, contentType: "application/json", body: JSON.stringify(verif.body) }));
  if (premium) await p.addInitScript(e => localStorage.setItem("abo_etat", JSON.stringify(e)), premium);
  await p.goto(URLAPP); await p.waitForFunction(() => window.ABO && window.STUDIO); await p.waitForTimeout(300);
  return p;
}
const dlgTitre = p => p.evaluate(() => { const d = document.getElementById("abo-dlg"); return d && d.open ? d.querySelector("h2").textContent : "" });
const fermer = p => p.evaluate(() => { const d = document.getElementById("abo-dlg"); if (d && d.open) d.close() });

let p = await page();
await test("Éteint : rien ne change (pas de bouton, 4K et IA libres, export non enveloppé)", async () => {
  await p.evaluate(() => document.querySelector('[data-q="3840"]').click());
  const r = await p.evaluate(() => ({ b: !!document.getElementById("abo-b"), q: document.getElementById("q").value, ia: document.getElementById("o_max").checked, w: !!document.getElementById("ex").__abo, v: document.documentElement.classList.contains("abo-verrou"), prem: ABO.premium() }));
  return { ok: !r.b && r.q === "3840" && r.ia && !r.w && !r.v && r.prem && !(await dlgTitre(p)) && !p.__errs.length, info: JSON.stringify(r) } });
await p.close();

p = await page({ on: true });
await test("Allumé sans Premium : bouton Premium, IA décochée, 4K ramenée en Full HD", async () => {
  const r = await p.evaluate(() => ({ b: document.getElementById("abo-b").textContent, q: document.getElementById("q").value, ia: document.getElementById("o_max").checked, v: document.documentElement.classList.contains("abo-verrou") }));
  return { ok: r.b === "Premium" && +r.q <= 1920 && !r.ia && r.v && !p.__errs.length, info: JSON.stringify(r) } });
await test("Allumé sans Premium : toucher 4K ouvre l’offre et garde Full HD", async () => {
  await p.evaluate(() => document.querySelector('[data-q="3840"]').click()); const t = await dlgTitre(p); const q = await p.evaluate(() => document.getElementById("q").value); await fermer(p);
  return { ok: /4K/.test(t) && q === "1920", info: "« " + t + " », q=" + q } });
await test("Allumé sans Premium : chaque outil Premium ouvre l’offre (filtre, effacer, Time Repair, regrouper, lot, IA)", async () => {
  const out = [];
  for (const s of ["#fltb", "#erb", "#picke", "#tr_go", "#pickm", "#mggo", "#exall"]) { await p.evaluate(s => { const e = document.querySelector(s); e.hidden = false; e.click() }, s); out.push(s + ":" + ((await dlgTitre(p)) ? "ok" : "NON")); await fermer(p) }
  await p.evaluate(() => { const c = document.getElementById("o_max"); c.checked = true; c.dispatchEvent(new Event("change", { bubbles: true })) });
  const ia = await dlgTitre(p); const coche = await p.evaluate(() => document.getElementById("o_max").checked); await fermer(p);
  out.push("IA:" + (/IA/.test(ia) && !coche ? "ok" : "NON"));
  return { ok: out.every(x => x.endsWith(":ok")), info: out.join(" ") } });
await test("Allumé sans Premium : un export 4K lancé par le code (lot, avant/après) est bloqué", async () => {
  const r = await p.evaluate(async () => { const q = document.getElementById("q"); q.value = "3840"; await document.getElementById("ex").onclick(); return { q: q.value, d: document.getElementById("abo-dlg").open } });
  await fermer(p); return { ok: r.q === "1920" && r.d, info: JSON.stringify(r) } });
await test("Offre : 3 formules aux bons prix, lien de paiement ouvert, champ code proposé", async () => {
  await p.evaluate(() => ABO.ouvrir()); const r = await p.evaluate(() => [...document.querySelectorAll("#abo-dlg [data-plan]")].map(x => x.querySelector("b").textContent + " " + x.querySelector(".abo-prix").textContent));
  await p.evaluate(() => { window.__ouvert = []; window.open = (u, t, f) => { window.__ouvert.push(u); return null } });
  await p.click('#abo-dlg [data-plan="annuel"]'); const u = (await p.evaluate(() => window.__ouvert))[0] || ""; const code = await p.evaluate(() => document.querySelector("#abo-dlg .abo-code").open); await fermer(p);
  return { ok: r.join("|") === "Pass 7 jours 2,99 €|Mensuel 5,99 €|Annuel 34,99 €" && /exemple\.test\/a/.test(u) && code, info: r.join(" | ") + " → " + u } });
await p.close();

p = await page({ on: true, verif: { body: { premium: true, plan: "abonnement", fin: null } } });
await test("Code valide : Premium activé et gardé, 4K débloquée après rechargement", async () => {
  await p.evaluate(() => ABO.verifierCle("ABCD-1234-EFGH-5678")); await p.reload(); await p.waitForFunction(() => window.ABO); await p.waitForTimeout(300);
  await p.evaluate(() => document.querySelector('[data-q="3840"]').click());
  const r = await p.evaluate(() => ({ prem: ABO.premium(), b: document.getElementById("abo-b").textContent, q: document.getElementById("q").value, v: document.documentElement.classList.contains("abo-verrou") }));
  return { ok: r.prem && r.b === "✓ Premium" && r.q === "3840" && !r.v && !(await dlgTitre(p)), info: JSON.stringify(r) } });
await p.close();

p = await page({ on: true, verif: { body: { premium: false, definitif: true, raison: "Code inconnu : vérifie qu’il est copié en entier." } } });
await test("Code refusé : message clair, pas de Premium", async () => {
  const m = await p.evaluate(async () => { try { await ABO.verifierCle("FAUX-0000-0000"); return "accepté ?!" } catch (e) { return e.message } });
  return { ok: /Code inconnu/.test(m) && !(await p.evaluate(() => ABO.premium())), info: m } });
await p.close();

await test("Règles de validité : pass expiré, grâce hors ligne de 7 jours", async () => {
  const q = await page({ on: true }); const r = await q.evaluate(() => { const J = 864e5, n = Date.now();
    return [ABO._valide({ verifie: n, fin: n + J }), ABO._valide({ verifie: n, fin: n - 1 }), ABO._valide({ verifie: n - 6 * J }), ABO._valide({ verifie: n - 8 * J }), ABO._valide(null)] });
  await q.close(); return { ok: JSON.stringify(r) === "[true,false,true,false,false]", info: JSON.stringify(r) } });

p = await page({ on: true, pubOn: true, premium: { source: "polar", cle: "ABCD-1234-EFGH", verifie: Date.now(), fin: null } });
await test("Premium + pubs allumées : aucune pub chargée, aucun emplacement", async () => {
  await p.waitForTimeout(500); const ban = await p.evaluate(() => !!document.getElementById("pub-bas"));
  return { ok: p.__pub === 0 && !ban, info: p.__pub + " requête(s) de pub, bannière " + ban } });
await p.close();
p = await page({ on: true, pubOn: true });
await test("Gratuit + pubs allumées : la bannière est bien là", async () => {
  await p.waitForTimeout(500); const ban = await p.evaluate(() => !!document.getElementById("pub-bas")); return { ok: ban, info: "bannière " + ban } });
await p.close();

await test("Page Tarifs : s’affiche, « bientôt » tant que c’est éteint, aucune erreur", async () => {
  const q = await b.newPage(); const errs = []; q.on("pageerror", e => errs.push(e.message)); await q.goto("http://localhost:" + PORT + "/tarifs.html");
  await q.click('[data-plan="mensuel"]'); const t = await q.textContent("#bientot"); const w = await q.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1); await q.close();
  return { ok: /bientôt/.test(t) && w && !errs.length, info: "« " + t + " », largeur ok " + w } });

/* serveur : route /abo/verifier avec un faux Polar */
const W = await import(pathToFileURL(path.join(RACINE, "serveur", "worker.js")).href);
const faux = rep => (globalThis.fetch = async (u, o) => { faux.dernier = { u, o }; return new Response(JSON.stringify(rep.body), { status: rep.status || 200 }) });
const appel = (cle, env = { POLAR_ORG: "org_1" }) => W.default.fetch(new Request("https://x/abo/verifier", { method: "POST", headers: { origin: "https://retoucheproai.com", "content-type": "application/json" }, body: JSON.stringify({ cle }) }), env).then(async r => ({ s: r.status, j: await r.json(), o: r.headers.get("access-control-allow-origin") }));
await test("Serveur : clé d’abonnement valide → Premium (organisation transmise à Polar)", async () => {
  faux({ body: { status: "granted", expires_at: null } }); const r = await appel("ABCD-1234-EFGH");
  const body = JSON.parse(faux.dernier.o.body); return { ok: r.j.premium && r.j.plan === "abonnement" && body.organization_id === "org_1" && body.key === "ABCD-1234-EFGH" && r.o === "https://retoucheproai.com", info: JSON.stringify(r.j) } });
await test("Serveur : abonnement terminé, pass expiré, code inconnu, réglage manquant", async () => {
  faux({ body: { status: "revoked" } }); const a = await appel("ABCD-1234-EFGH");
  faux({ body: { status: "granted", expires_at: "2020-01-01T00:00:00Z" } }); const e = await appel("ABCD-1234-EFGH");
  faux({ status: 404, body: {} }); const c = await appel("ABCD-1234-EFGH");
  const n = await appel("ABCD-1234-EFGH", {});
  return { ok: !a.j.premium && a.j.definitif && /terminé/.test(a.j.raison) && !e.j.premium && /expiré/.test(e.j.raison) && !c.j.premium && c.j.definitif && n.s === 503,
    info: [a.j.raison, e.j.raison, c.j.raison, n.s].join(" | ") } });

await b.close(); srv.kill();
console.log("\nRésultat : " + res.filter(x => x).length + " réussis, " + res.filter(x => !x).length + " échoués.");
process.exit(res.every(x => x) ? 0 : 1);
