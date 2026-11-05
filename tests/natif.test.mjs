/* Tests de l'app des stores (v5.7), dans Chrome avec de faux modules natifs Capacitor :
   enregistrement par la feuille de partage, « Colle un lien » masqué, pubs AdMob (bannière, pub récompensée, consentement),
   achats intégrés RevenueCat (achat, restauration), pas de lien de paiement web dans l'app.  node tests/natif.test.mjs */
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const { chromium } = await import(process.env.PW || "playwright");
const HERE = path.dirname(fileURLToPath(import.meta.url)), RACINE = path.join(HERE, ".."), PORT = 8782;
const srv = spawn(process.execPath, [path.join(HERE, "serveur.mjs")], { env: { ...process.env, PORT }, stdio: "ignore" }); await new Promise(r => setTimeout(r, 600));
const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ["--use-angle=swiftshader"] });
const res = []; const test = async (n, f) => { let ok = false, info = ""; try { const r = await f(); ok = r.ok; info = r.info } catch (e) { info = "exception : " + e.message.split("\n")[0] } res.push(ok); console.log((ok ? "✓ " : "✗ ") + n + " — " + info) };
const ABO = fs.readFileSync(path.join(RACINE, "abo.js"), "utf8"), PUB = fs.readFileSync(path.join(RACINE, "pub.js"), "utf8");

/* faux Capacitor : tout ce que l'app appelle est noté dans window.__appels */
const FAUX = os => `(() => {
  const A = window.__appels = []; const note = (n, x) => { A.push([n, x]); };
  const L = {}; const ecoute = (n, f) => { (L[n] = L[n] || []).push(f); return Promise.resolve({ remove() { L[n] = (L[n] || []).filter(g => g !== f) } }) };
  const emet = (n, x) => (L[n] || []).slice().forEach(f => f(x));
  const fichiers = {};
  window.__fichiers = fichiers; window.__finPub = "complete"; window.__achat = "ok";
  window.Capacitor = { isNativePlatform: () => true, getPlatform: () => "${os}", Plugins: {
    Filesystem: {
      writeFile: async o => { note("write", o.path); fichiers[o.path] = o.data },
      appendFile: async o => { note("append", o.path); fichiers[o.path] += o.data },
      deleteFile: async o => { delete fichiers[o.path] }, readdir: async () => ({ files: [] }),
      getUri: async o => ({ uri: "file:///cache/" + o.path }) },
    Share: { share: async o => { note("share", o.files); if (window.__partage === "annule") throw new Error("Share canceled") } },
    AdMob: {
      initialize: async o => note("init", o), requestConsentInfo: async () => (note("consent"), { status: "REQUIRED", isConsentFormAvailable: true }),
      showConsentForm: async () => note("form"), trackingAuthorizationStatus: async () => ({ status: "notDetermined" }),
      requestTrackingAuthorization: async () => note("att"), addListener: ecoute, showPrivacyOptionsForm: async () => note("privacy"),
      showBanner: async o => { note("banner", o.adId); setTimeout(() => emet("bannerAdSizeChanged", { height: 50 }), 10) },
      prepareRewardVideoAd: async o => note("prepare", o.adId),
      showRewardVideoAd: async () => { note("show"); setTimeout(() => { if (window.__finPub !== "ferme") emet("onRewardedVideoAdReward", { type: "x", amount: 1 }); emet("onRewardedVideoAdDismissed") }, 30) } },
    Purchases: {
      configure: async o => note("rc-config", o.apiKey),
      getCustomerInfo: async () => ({ customerInfo: { entitlements: { active: window.__dejaPremium ? { premium: { productIdentifier: "annuel", expirationDate: null } } : {} } } }),
      getOfferings: async () => ({ current: { availablePackages: [{ identifier: "pass", packageType: "CUSTOM" }, { identifier: "$rc_monthly", packageType: "MONTHLY" }, { identifier: "$rc_annual", packageType: "ANNUAL" }] } }),
      purchasePackage: async o => { note("buy", o.aPackage.packageType); if (window.__achat === "annule") { const e = new Error("Purchase was cancelled"); e.code = "1"; throw e }
        return { customerInfo: { entitlements: { active: { premium: { productIdentifier: o.aPackage.identifier, expirationDate: "2099-01-01T00:00:00Z" } } } } } },
      restorePurchases: async () => (note("restore"), { customerInfo: { entitlements: { active: {} } } }) } } };
})();`;

async function page({ os = "ios", abo = false, pub = false, premium = false } = {}) {
  const p = await b.newPage(); p.__errs = []; p.on("pageerror", e => p.__errs.push(e.message));
  await p.addInitScript(FAUX(os));
  if (premium) await p.addInitScript(() => { window.__dejaPremium = true });
  if (abo) await p.route("**/abo.js", r => r.fulfill({ contentType: "text/javascript", body: ABO.replace("actif: false", "actif: true").replace('revenuecat: { ios: "", android: "" }', 'revenuecat: { ios: "appl_test", android: "goog_test" }') }));
  if (pub) await p.route("**/pub.js", r => r.fulfill({ contentType: "text/javascript", body: PUB.replace(/app: \{\n    actif: false/, "app: {\n    actif: true") }));
  await p.route(/googlesyndication|doubleclick/, r => r.abort());
  await p.goto("http://localhost:" + PORT + "/index.html"); await p.waitForFunction(() => window.ABO && window.PUB && window.NATIF); await p.waitForTimeout(400);
  return p;
}
const appels = p => p.evaluate(() => window.__appels.map(x => x[0]));

let p = await page();
await test("App : détectée comme native, « Colle un lien » masqué", async () => {
  const r = await p.evaluate(() => ({ n: NATIF.actif(), os: NATIF.plateforme(), cls: document.documentElement.className, lien: getComputedStyle(document.getElementById("lnkf")).display }));
  return { ok: r.n && r.os === "ios" && /sans-liens/.test(r.cls) && /natif-ios/.test(r.cls) && r.lien === "none" && !p.__errs.length, info: JSON.stringify(r) } });
await test("Enregistrer : fichier écrit en morceaux dans le cache puis feuille de partage", async () => {
  const r = await p.evaluate(async () => {
    const octets = new Uint8Array(7 * 1024 * 1024 + 5); for (let i = 0; i < octets.length; i++) octets[i] = (i * 7) & 255;
    outBlob = new Blob([octets], { type: "video/mp4" }); outUrl = URL.createObjectURL(outBlob);
    await document.getElementById("sv").onclick();
    const d = Uint8Array.from(atob(window.__fichiers[Object.keys(window.__fichiers)[0]]), c => c.charCodeAt(0));
    let same = d.length === octets.length; for (let i = 0; same && i < d.length; i += 4099) same = d[i] === octets[i];
    return { a: window.__appels.map(x => x[0]).join(","), taille: d.length, same, st: document.querySelector("#st0,#st1") && [...document.querySelectorAll(".st")].map(x => x.textContent).join(" ") };
  });
  return { ok: r.a === "write,append,append,share" && r.same && r.taille === 7 * 1024 * 1024 + 5, info: r.a + " ; " + r.taille + " octets identiques " + r.same } });
await test("Enregistrer annulé par l’utilisateur : pas de message d’erreur", async () => {
  const r = await p.evaluate(async () => { window.__partage = "annule"; [...document.querySelectorAll(".st")].forEach(x => x.textContent = ""); await document.getElementById("sv").onclick(); window.__partage = ""; return [...document.querySelectorAll(".st")].map(x => x.textContent).join("") });
  return { ok: !/impossible|erreur/i.test(r), info: "« " + r + " »" } });
await p.close();

p = await page({ os: "android", pub: true });
await test("Pubs AdMob : consentement, demande de suivi, bannière d’essai, pub récompensée préparée", async () => {
  await p.waitForTimeout(300); const a = await appels(p); const ban = await p.evaluate(() => window.__appels.find(x => x[0] === "banner")[1]);
  const pad = await p.evaluate(() => document.body.style.paddingBottom);
  return { ok: ["init", "consent", "form", "att", "banner", "prepare"].every(x => a.includes(x)) && ban === "ca-app-pub-3940256099942544/9214589741" && pad === "50px" && !p.__errs.length, info: a.join(",") + " ; marge " + pad } });
await test("Pub récompensée regardée → « Merci » → enregistrement", async () => {
  await p.evaluate(() => { outBlob = new Blob([new Uint8Array(1000)], { type: "video/mp4" }); outUrl = URL.createObjectURL(outBlob); window.__appels.length = 0; document.getElementById("sv").onclick() });
  await p.click("#pub-dlg button:has-text('Voir la pub')"); await p.waitForSelector("#pub-dlg[open] h2:has-text('Merci')"); await p.click("#pub-dlg button:has-text('Enregistrer maintenant')");
  await p.waitForTimeout(300); const a = await appels(p); return { ok: a.includes("show") && a.includes("share"), info: a.join(",") } });
await test("Pub fermée avant la fin → pas d’enregistrement", async () => {
  await p.waitForFunction(() => PUB._etat().pret, null, { timeout: 3000 });
  await p.evaluate(() => { window.__finPub = "ferme"; window.__appels.length = 0; document.getElementById("sv").onclick() });
  await p.click("#pub-dlg button:has-text('Voir la pub')"); await p.waitForSelector("#pub-dlg[open] h2:has-text('avant la fin')"); await p.click("#pub-dlg button:has-text('D’accord')");
  const a = await appels(p); return { ok: a.includes("show") && !a.includes("share"), info: a.join(",") } });
await p.close();

p = await page({ abo: true, pub: true });
await test("Premium dans l’app : achat par le compte Apple, sans lien de paiement web", async () => {
  await p.evaluate(() => ABO.ouvrir("k4"));
  const r = await p.evaluate(() => ({ code: !!document.querySelector("#abo-dlg .abo-code"), rest: !!document.querySelector('#abo-dlg [data-a="restaurer"]'), pied: document.querySelector("#abo-dlg .abo-pied").textContent }));
  await p.evaluate(() => { window.__recharge = 0; window.__appels.length = 0 });
  await p.click('#abo-dlg [data-plan="annuel"]'); await p.waitForFunction(() => /Merci/.test(document.querySelector("#abo-dlg .abo-msg").textContent), null, { timeout: 3000 });
  const a = await appels(p); const prem = await p.evaluate(() => ABO.premium());
  return { ok: !r.code && r.rest && /Apple/.test(r.pied) && a.includes("buy") && prem, info: JSON.stringify(r) + " ; " + a.join(",") + " ; premium " + prem } });
await p.close();

p = await page({ abo: true });
await test("Achat annulé dans la fenêtre Apple : aucun message d’erreur, pas de Premium", async () => {
  await p.evaluate(() => { window.__achat = "annule"; ABO.ouvrir() }); await p.click('#abo-dlg [data-plan="mensuel"]'); await p.waitForTimeout(400);
  const m = await p.textContent("#abo-dlg .abo-msg"); return { ok: !/cancel|erreur|Ouverture/i.test(m) && !(await p.evaluate(() => ABO.premium())), info: "« " + m + " »" } });
await test("Restaurer mes achats : message clair quand il n’y a rien", async () => {
  await p.click('#abo-dlg [data-a="restaurer"]'); await p.waitForTimeout(300); const m = await p.textContent("#abo-dlg .abo-msg");
  return { ok: /Aucun achat/.test(m), info: m } });
await p.close();

p = await page({ abo: true, pub: true, premium: true });
await test("Déjà Premium sur le compte Apple : reconnu au démarrage, aucune pub", async () => {
  await p.waitForTimeout(300); await p.reload(); await p.waitForFunction(() => window.ABO); await p.waitForTimeout(500);
  const r = await p.evaluate(() => ({ prem: ABO.premium(), b: document.getElementById("abo-b").textContent, pubs: window.__appels.filter(x => x[0] === "banner" || x[0] === "init").length }));
  return { ok: r.prem && r.b === "✓ Premium" && r.pubs === 0, info: JSON.stringify(r) } });
await p.close();

await b.close(); srv.kill();
console.log("\nRésultat : " + res.filter(x => x).length + " réussis, " + res.filter(x => !x).length + " échoués.");
process.exit(res.every(x => x) ? 0 : 1);
