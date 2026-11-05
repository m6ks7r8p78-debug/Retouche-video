/* Tests de l'accès propriétaire (v5.8) sur le site public simulé (https://retoucheproai.com servi depuis le dépôt).
   Le vrai code n'est jamais écrit dans le dépôt : le passer en variable.   PROPRIO_CODE=XXXXX-… node tests/proprio.test.mjs */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const { chromium } = await import(process.env.PW || "playwright");
const HERE = path.dirname(fileURLToPath(import.meta.url)), RACINE = path.join(HERE, ".."), CODE = process.env.PROPRIO_CODE;
if (!CODE) { console.log("PROPRIO_CODE manquant : test sauté."); process.exit(0) }
const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ["--use-angle=swiftshader"] });
const res = []; const test = async (n, f) => { let ok = false, info = ""; try { const r = await f(); ok = r.ok; info = r.info } catch (e) { info = "exception : " + e.message.split("\n")[0] } res.push(ok); console.log((ok ? "✓ " : "✗ ") + n + " — " + info) };

/* premium / pubs : versions « allumées » pour vérifier que le propriétaire passe au travers */
const ABO_ON = fs.readFileSync(path.join(RACINE, "abo.js"), "utf8").replace("actif: false,", "actif: true,");
const PUB_ON = fs.readFileSync(path.join(RACINE, "pub.js"), "utf8").replace("actif: false", "actif: true").replace(/domaine: "[^"]*"/, 'domaine: "retoucheproai.com"')
  .replace(/adsense: "[^"]*"/, 'adsense: "ca-pub-0000000000000000"').replace('banniere: ""', 'banniere: "111"').replace('recompense: ""', 'recompense: "/1/test"');

async function contexte(allume) {
  const c = await b.newContext(); const req = [];
  c.on("request", r => { if (/googlesyndication|doubleclick/.test(r.url())) req.push(r.url()) });
  await c.route(/googlesyndication|doubleclick/, r => r.abort());
  await c.route("https://retoucheproai.com/**", r => {
    const p = new URL(r.request().url()).pathname;
    if (allume && p.endsWith("/abo.js")) return r.fulfill({ contentType: "text/javascript", body: ABO_ON });
    if (allume && p.endsWith("/pub.js")) return r.fulfill({ contentType: "text/javascript", body: PUB_ON });
    const f = path.join(RACINE, p.replace(/^\/$/, "/index.html")); fs.existsSync(f) ? r.fulfill({ path: f }) : r.fulfill({ status: 404, body: "" });
  });
  c.__req = req; return c;
}
async function ouvrir(c, hash = "") {
  const p = await c.newPage(); const alertes = []; p.on("dialog", d => { alertes.push(d.message()); d.accept() });
  await p.goto("https://retoucheproai.com/" + hash); await p.waitForTimeout(600); await p.waitForLoadState("load"); await p.waitForFunction(() => window.ABO && window.PUB);
  p.__alertes = alertes; return p;
}
const etat = p => p.evaluate(() => ({ proprio: !!window.PROPRIO, stock: localStorage.getItem("proprio"), mode: localStorage.getItem("ui_mode"),
  lien: getComputedStyle(document.getElementById("lnkf")).display, expert: !document.body.classList.contains("simple"), hash: location.hash,
  premium: ABO.premium(), bouton: (document.getElementById("abo-b") || {}).textContent || "", verrou: document.documentElement.classList.contains("abo-verrou") }));

await test("Code faux : refusé, rien n'est activé, lien retiré de l'adresse", async () => {
  const c = await contexte(false), p = await ouvrir(c, "#proprio=AAAAA-BBBBB-CCCCC-DDDDD"); await p.waitForTimeout(300); const e = await etat(p); await c.close();
  return { ok: !e.proprio && !e.stock && e.lien === "none" && e.hash === "" && p.__alertes.some(a => /incorrect/.test(a)), info: JSON.stringify(e) } });

let C = await contexte(true);
await test("Bon code (Premium et pubs allumés) : propriétaire, mode expert, « Colle un lien » visible, adresse nettoyée", async () => {
  const p = await ouvrir(C, "#proprio=" + CODE.toLowerCase()); await p.waitForFunction(() => window.PROPRIO); await p.waitForTimeout(800); const e = await etat(p);
  return { ok: e.proprio && e.stock === "1" && e.mode === "expert" && e.expert && e.lien !== "none" && e.hash === "" && p.__alertes.some(a => /activé/.test(a)), info: JSON.stringify(e) } });

await test("Reste actif après fermeture : tout débloqué, aucun cadenas, bouton « ✓ Propriétaire », aucune pub chargée", async () => {
  C.__req.length = 0; const p = await ouvrir(C); await p.waitForTimeout(1500); const e = await etat(p);
  const coche = await p.evaluate(() => { const mx = document.getElementById("o_max"); if (!mx) return "absent"; mx.checked = true; mx.dispatchEvent(new Event("change", { bubbles: true })); return new Promise(r => setTimeout(() => r(mx.checked && !document.querySelector(".abo-dlg[open]")), 1800)) });
  await p.close();
  return { ok: e.proprio && e.premium && !e.verrou && /Propriétaire/.test(e.bouton) && C.__req.length === 0 && coche === true, info: JSON.stringify({ ...e, iaGardee: coche, pubs: C.__req.length }) } });

await test("Visiteur normal (sans le code) : Premium verrouillé et pubs chargées comme prévu", async () => {
  const v = await contexte(true), p = await ouvrir(v); await p.waitForTimeout(1500); const e = await etat(p); const n = v.__req.length; await v.close();
  return { ok: !e.proprio && !e.premium && e.verrou && n > 0 && e.lien === "none", info: JSON.stringify({ ...e, pubs: n }) } });

await test("#proprio=off : accès retiré de l'appareil", async () => {
  const p = await ouvrir(C, "#proprio=off"); await p.waitForTimeout(800); const e = await etat(p); await C.close();
  return { ok: !e.proprio && !e.stock && e.lien === "none", info: JSON.stringify(e) } });

await b.close();
console.log("\nRésultat : " + res.filter(x => x).length + " réussis, " + res.filter(x => !x).length + " échoués.");
process.exit(res.every(x => x) ? 0 : 1);
