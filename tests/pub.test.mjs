/* Tests des pubs (v4.9) : éteintes par défaut (rien ne change), puis allumées avec un faux Google pour vérifier le parcours.
   node tests/pub.test.mjs */
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const { chromium } = await import(process.env.PW || "playwright");
const HERE = path.dirname(fileURLToPath(import.meta.url)), PORT = 8779;
const srv = spawn(process.execPath, [path.join(HERE, "serveur.mjs")], { env: { ...process.env, PORT }, stdio: "ignore" }); await new Promise(r => setTimeout(r, 600));
const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ["--use-angle=swiftshader"] });
const res = []; const test = async (n, f) => { let ok = false, info = ""; try { const r = await f(); ok = r.ok; info = r.info } catch (e) { info = "exception : " + e.message.split("\n")[0] } res.push(ok); console.log((ok ? "✓ " : "✗ ") + n + " — " + info) };
const URLAPP = "http://localhost:" + PORT + "/index.html";

/* faux Google : la pub « dure » 50 ms ; window.__finPub = "complete" (récompense) ou "ferme" (arrêtée avant la fin) */
const FAUX_GPT = `window.googletag=window.googletag||{cmd:[]};(()=>{const L={},g=window.googletag,q=g.cmd;
g.enums={OutOfPageFormat:{REWARDED:"R"}};g.pubads=()=>({addEventListener:(t,f)=>(L[t]=L[t]||[]).push(f)});
const fire=(t,e)=>(L[t]||[]).forEach(f=>f(e));window.__vus=0;
g.defineOutOfPageSlot=()=>{const s={addService:()=>s};return s};g.enableServices=()=>{};g.destroySlots=()=>{};
g.display=s=>setTimeout(()=>fire("rewardedSlotReady",{slot:s,makeRewardedVisible(){window.__vus++;setTimeout(()=>{if(window.__finPub!=="ferme")fire("rewardedSlotGranted",{slot:s});fire("rewardedSlotClosed",{slot:s})},50)}}),20);
g.cmd={push:f=>f()};q.forEach(f=>f())})();`;

async function page(allume, gpt = true) {
  const p = await b.newPage(); const req = []; p.on("request", r => { if (/googlesyndication|doubleclick/.test(r.url())) req.push(r.url()) });
  const errs = []; p.on("pageerror", e => errs.push(e.message)); p.__errs = errs; p.__req = req;
  if (allume) {
    const src = fs.readFileSync(path.join(HERE, "..", "pub.js"), "utf8").replace("actif: false", "actif: true").replace(/domaine: "[^"]*"/, 'domaine: "localhost"')
      .replace(/adsense: "[^"]*"/, 'adsense: "ca-pub-0000000000000000"').replace('banniere: ""', 'banniere: "111"').replace('recompense: ""', 'recompense: "/1/test"');
    await p.route("**/pub.js", r => r.fulfill({ contentType: "text/javascript", body: src }));
    await p.route("**/adsbygoogle.js*", r => r.fulfill({ contentType: "text/javascript", body: "" }));
    await p.route("**/gpt.js", r => gpt ? r.fulfill({ contentType: "text/javascript", body: FAUX_GPT }) : r.abort());
  }
  await p.goto(URLAPP); await p.waitForFunction(() => window.PUB && window.STUDIO);
  await p.evaluate(() => { outBlob = new Blob([new Uint8Array(2000)], { type: "video/mp4" }); outUrl = URL.createObjectURL(outBlob); navigator.share = undefined; navigator.canShare = undefined });
  return p;
}
const telecharge = p => p.waitForEvent("download", { timeout: 2500 }).then(() => true, () => false);
const choix = async (p, txt) => { await p.waitForSelector("#pub-dlg[open]"); await p.click("#pub-dlg button:has-text('" + txt + "')") };

let p = await page(false);
await test("Éteintes : aucun script de pub chargé, aucun emplacement, boutons inchangés, liens visibles", async () => {
  await p.waitForTimeout(400);
  const r = await p.evaluate(() => ({ ban: !!document.getElementById("pub-bas"), env: !!document.getElementById("sv").__pub, lien: getComputedStyle(document.getElementById("lnkf")).display !== "none" }));
  return { ok: p.__req.length === 0 && !r.ban && !r.env && r.lien && !p.__errs.length, info: p.__req.length + " requête(s) de pub, bannière " + r.ban + ", liens visibles " + r.lien } });
await test("Éteintes : « Enregistrer » télécharge directement, sans fenêtre", async () => {
  const d = telecharge(p); await p.evaluate(() => document.getElementById("sv").onclick()); const ok = await d;
  return { ok: ok && !(await p.$("#pub-dlg[open]")), info: "téléchargement " + ok } });
await p.close();

p = await page(true);
await test("Allumées : bannière, lien « Cookies », liens masqués, pub préchargée", async () => {
  await p.waitForFunction(() => PUB._etat().pret, null, { timeout: 3000 });
  const r = await p.evaluate(() => ({ ban: !!document.querySelector("#pub-bas ins.adsbygoogle"), ck: !!document.querySelector(".pub-cookies"), lien: getComputedStyle(document.getElementById("lnkf")).display, h: getComputedStyle(document.querySelector(".lnkh")).display }));
  return { ok: r.ban && r.ck && r.lien === "none" && r.h === "none" && !p.__errs.length, info: JSON.stringify(r) } });
await test("Allumées : « Annuler » → rien n’est enregistré, la pub reste prête", async () => {
  const d = telecharge(p); await p.evaluate(() => { document.getElementById("sv").onclick() }); await choix(p, "Annuler");
  const ok = !(await d); const pr = await p.evaluate(() => PUB._etat().pret && window.__vus === 0);
  return { ok: ok && pr, info: "aucun téléchargement, pub encore prête " + pr } });
await test("Allumées : pub regardée jusqu’au bout → « Merci » → enregistrement", async () => {
  await p.evaluate(() => { document.getElementById("sv").onclick() }); await choix(p, "Voir la pub");
  await p.waitForSelector("#pub-dlg[open] h2:has-text('Merci')"); const d = telecharge(p); await choix(p, "Enregistrer maintenant");
  const ok = await d; return { ok: ok && await p.evaluate(() => window.__vus === 1), info: "pub vue 1 fois, téléchargement " + ok } });
await test("Allumées : pub arrêtée avant la fin → pas d’enregistrement, message clair", async () => {
  await p.waitForFunction(() => PUB._etat().pret, null, { timeout: 4000 }); await p.evaluate(() => (window.__finPub = "ferme"));
  const d = telecharge(p); await p.evaluate(() => { document.getElementById("sv").onclick() }); await choix(p, "Voir la pub");
  await p.waitForSelector("#pub-dlg[open] h2:has-text('avant la fin')"); await choix(p, "D’accord");
  const ok = !(await d); return { ok, info: "aucun téléchargement" } });
await p.close();

p = await page(true, false);
await test("Allumées mais pub indisponible (bloqueur, réseau) → enregistrement direct, jamais bloqué", async () => {
  await p.waitForTimeout(600); const d = telecharge(p); await p.evaluate(() => document.getElementById("sv").onclick()); const ok = await d;
  return { ok: ok && !(await p.$("#pub-dlg[open]")) && !p.__errs.length, info: "téléchargement " + ok } });
await p.close();

await test("Sur un autre domaine (ex. github.io) : rien ne s’allume même si actif", async () => {
  const src = fs.readFileSync(path.join(HERE, "..", "pub.js"), "utf8").replace("actif: false", "actif: true").replace(/domaine: "[^"]*"/, 'domaine: "retoucheproai.com"').replace(/adsense: "[^"]*"/, 'adsense: "ca-pub-1"');
  const q = await b.newPage(); const req = []; q.on("request", r => { if (/googlesyndication|doubleclick/.test(r.url())) req.push(1) });
  await q.route("**/pub.js", r => r.fulfill({ contentType: "text/javascript", body: src })); await q.goto(URLAPP); await q.waitForFunction(() => window.PUB);
  await q.waitForTimeout(300); const a = await q.evaluate(() => PUB.allume()); await q.close();
  return { ok: !a && req.length === 0, info: "allumé " + a + ", " + req.length + " requête(s)" } });

await b.close(); srv.kill();
console.log("\nRésultat : " + res.filter(x => x).length + " réussis, " + res.filter(x => !x).length + " échoués.");
process.exit(res.every(x => x) ? 0 : 1);
