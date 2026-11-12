/* Tests v7.2 — coque du studio (atelier.js + nouvelle mise en page) : vraies interactions dans Chrome sans écran.
   node tests/atelier.test.mjs   (PW=/chemin/playwright/index.mjs si playwright n'est pas installé dans le dépôt)
   Ne remplace pas un essai sur iPhone : le rendu Safari et le toucher réel restent à vérifier sur l'appareil. */
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const { chromium } = await import(process.env.PW || "playwright");
const HERE = path.dirname(fileURLToPath(import.meta.url)), PORT = 8773;
const srv = spawn(process.execPath, [path.join(HERE, "serveur.mjs")], { env: { ...process.env, PORT }, stdio: "ignore" }); await new Promise(r => setTimeout(r, 600));
const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const res = []; const errs = [];
const test = async (n, f) => { let ok = false, info = ""; try { const r = await f(); ok = r.ok; info = r.info } catch (e) { info = "exception : " + e.message.split("\n")[0] } res.push(ok); console.log((ok ? "✓ " : "✗ ") + n + " — " + info) };
const page = async (vp, scheme = "dark") => { const c = await b.newContext({ viewport: vp, colorScheme: scheme }); const p = await c.newPage(); p.on("pageerror", e => errs.push(e.message));
  await p.goto("http://localhost:" + PORT + "/index.html"); await p.waitForFunction(() => window.__atelier && window.STUDIO); return p };
const photo = fs.readFileSync(path.join(HERE, "medias", "chat_vieuxtel.jpg")).toString("base64");

const m = await page({ width: 430, height: 932 });
await test("iPhone (430 px) : en-tête sur une ligne, import en premier, barre d'onglets, pas de défilement horizontal", () => m.evaluate(() => {
  const h = document.querySelector("header.top"), d = document.getElementById("drop"), k = document.getElementById("dock");
  const r = { h: h.offsetHeight, dropTop: Math.round(d.getBoundingClientRect().top), dock: getComputedStyle(k).display, large: document.documentElement.scrollWidth <= innerWidth,
    outilsApres: document.getElementById("outils").getBoundingClientRect().top > d.getBoundingClientRect().bottom };
  return { ok: r.h < 80 && r.dropTop < 90 && r.dock !== "none" && r.large && r.outilsApres, info: JSON.stringify(r) } }));
await test("Ancienne composition absente (titre promotionnel, 3 gros boutons, étapes marketing)", () => m.evaluate(() => {
  const r = { hero: !!document.querySelector(".hero"), picks: !!document.querySelector(".picks,.pickbtn"), steps: !!document.querySelector(".steps"), sprock: !!document.querySelector(".sprock") };
  return { ok: !r.hero && !r.picks && !r.steps && !r.sprock, info: JSON.stringify(r) } }));
await test("Outils par besoin : chaque bouton ouvre le bon sélecteur de fichier", async () => {
  const pairs = [['[data-proxy="#pickp"]', "#fp"], ['[data-proxy="#pick"]', "#f"], ["#pickm", "#fm"], ["#pickv", "#fv"], ["#pickd", "#fd"], ["#picke", "#fe"]]; const vu = [];
  for (const [btn, inp] of pairs) {
    const ok = await m.evaluate(([btn, inp]) => new Promise(res => { const i = document.querySelector(inp); const o = i.click; let f = false; i.click = () => { f = true }; document.querySelector(btn).click(); i.click = o; res(f) }), [btn, inp]);
    vu.push(btn + (ok ? " ✓" : " ✗"));
  }
  return { ok: vu.every(x => x.endsWith("✓")), info: vu.join(", ") } });
await test("Barre d'onglets : « Outils » amène les outils à l'écran, « Modèles » ouvre la fenêtre des modèles", async () => {
  await m.click('#dock [data-go="outils"]'); await m.waitForTimeout(900);
  const top = await m.evaluate(() => Math.round(document.getElementById("outils").getBoundingClientRect().top));
  await m.click('#dock [data-go="mdlb"]'); await m.waitForTimeout(400); const open = await m.evaluate(() => document.getElementById("mdl").open);
  await m.evaluate(() => document.getElementById("mdl").close());
  return { ok: top >= 0 && top < 140 && open, info: "outils à " + top + " px du haut ; fenêtre des modèles ouverte : " + open } });
await test("Déroulé réel : 1 → 2 au chargement d'une photo (aucune étape simulée)", async () => {
  const avant = await m.evaluate(() => document.querySelector("#flow li.on").dataset.e);
  await m.setInputFiles("#fp", path.join(HERE, "medias", "chat_vieuxtel.jpg")); await m.waitForFunction(() => !document.getElementById("app").hidden); await m.waitForTimeout(300);
  const apres = await m.evaluate(() => [document.querySelector("#flow li.on").dataset.e, document.querySelector('#flow li[data-e="1"]').className, getComputedStyle(document.getElementById("drop")).minHeight]);
  return { ok: avant === "1" && apres[0] === "2" && apres[1] === "ok", info: `avant ${avant}, après ${apres[0]} (étape 1 « ${apres[1]} »), zone d'import compacte min-height ${apres[2]}` } });
await m.context().close();

const d = await page({ width: 1440, height: 900 }, "light");
await test("Ordinateur (1440 px) : outils à gauche, espace de travail au centre, activité à droite ; barre d'onglets masquée", () => d.evaluate(() => {
  const x = id => Math.round(document.getElementById(id).getBoundingClientRect().left);
  const r = { outils: x("outils"), ws: x("ws"), activite: x("activite"), dock: getComputedStyle(document.getElementById("dock")).display };
  return { ok: r.outils < r.ws && r.ws < r.activite && r.dock === "none", info: JSON.stringify(r) } }));
await test("Glisser-déposer d'une photo : même chemin que le bouton « Photo »", async () => {
  await d.evaluate(async b64 => { const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0)); const f = new File([bin], "chat.jpg", { type: "image/jpeg" });
    const dt = new DataTransfer(); dt.items.add(f);
    window.dispatchEvent(new DragEvent("dragenter", { dataTransfer: dt, cancelable: true }));
    window.__surv = document.getElementById("drop").classList.contains("over");
    window.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, cancelable: true })) }, photo);
  await d.waitForFunction(() => !document.getElementById("app").hidden, null, { timeout: 15000 });
  const r = await d.evaluate(() => ({ survol: window.__surv, ouvert: document.body.classList.contains("loaded"), plusDeSurvol: !document.getElementById("drop").classList.contains("over"), ex: document.getElementById("ex").textContent }));
  return { ok: r.survol && r.ouvert && r.plusDeSurvol && /photo/i.test(r.ex), info: JSON.stringify(r) } });
await test("Fichier non reconnu déposé : message clair, rien n'est ouvert", async () => {
  const r = await d.evaluate(() => { const f = new File(["x"], "notes.txt", { type: "text/plain" }); const st = document.getElementById("st0"); st.textContent = ""; window.__deposer([f]); return st.textContent });
  return { ok: /Format non reconnu/.test(r), info: r } });
await test("Activité : affiche l'historique réel (localStorage « recettes »), échappe le texte, état vide sinon", async () => {
  const r = await d.evaluate(() => {
    localStorage.removeItem("recettes"); window.__atelier.activite(); const vide = !document.getElementById("act_v").hidden && document.getElementById("act_l").hidden;
    localStorage.setItem("recettes", JSON.stringify([{ date: new Date().toISOString(), media: "photo", source: "640×480", profil: "<b>Équilibré</b>", ia: "non" }]));
    window.__atelier.activite(); const l = document.getElementById("act_l");
    return { vide, n: l.children.length, txt: l.textContent, html: l.innerHTML.includes("<b>Équilibré</b>") } });
  return { ok: r.vide && r.n === 1 && /il y a|instant/.test(r.txt) && !r.html, info: JSON.stringify(r) } });
await test("Contraste du texte secondaire ≥ 4,5:1 (clair et sombre)", async () => {
  const out = [];
  for (const sch of ["light", "dark"]) { await d.emulateMedia({ colorScheme: sch });
    out.push(await d.evaluate(() => { const L = c => { const [r, g, b] = c.match(/[\d.]+/g).slice(0, 3).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4 }); return .2126 * r + .7152 * g + .0722 * b };
      const s = getComputedStyle(document.documentElement), t = document.createElement("div"); document.body.appendChild(t);
      t.style.color = s.getPropertyValue("--mut"); const fg = getComputedStyle(t).color; t.style.color = s.getPropertyValue("--panel"); const bg = getComputedStyle(t).color; t.remove();
      const a = L(fg), z = L(bg); return +((Math.max(a, z) + .05) / (Math.min(a, z) + .05)).toFixed(2) })) }
  return { ok: out.every(x => x >= 4.5), info: "clair " + out[0] + ":1, sombre " + out[1] + ":1" } });
await d.context().close();

console.log("Erreurs JavaScript : " + (errs.length ? errs.join(" | ") : "aucune"));
console.log("Résultat : " + res.filter(Boolean).length + " réussis, " + res.filter(x => !x).length + " échoués. (Chrome sans écran — aucun test sur iPhone.)");
await b.close(); srv.kill(); process.exit(res.every(Boolean) && !errs.length ? 0 : 1);
