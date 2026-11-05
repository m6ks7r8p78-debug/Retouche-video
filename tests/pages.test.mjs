/* Pages d'information et partie légale (v5.8) : liens internes valides, lisibles sur téléphone (clair et sombre),
   mentions obligatoires présentes, marquage IA des photos effacées.  node tests/pages.test.mjs */
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const { chromium } = await import(process.env.PW || "playwright");
const HERE = path.dirname(fileURLToPath(import.meta.url)), RACINE = path.join(HERE, ".."), PORT = 8783, BASE = "http://localhost:" + PORT + "/";
const srv = spawn(process.execPath, [path.join(HERE, "serveur.mjs")], { env: { ...process.env, PORT }, stdio: "ignore" }); await new Promise(r => setTimeout(r, 600));
const b = await chromium.launch({ executablePath: process.env.CHROME || undefined });
const res = []; const test = async (n, f) => { let ok = false, info = ""; try { const r = await f(); ok = r.ok; info = r.info } catch (e) { info = "exception : " + e.message.split("\n")[0] } res.push(ok); console.log((ok ? "✓ " : "✗ ") + n + " — " + info) };
const PAGES = ["guide.html", "tarifs.html", "mentions-legales.html", "conditions.html", "cgv.html", "confidentialite.html", "licences.html"];

await test("Chaque lien interne et chaque ancre de toutes les pages mène quelque part", async () => {
  const p = await b.newPage(), casses = [];
  for (const f of ["index.html", ...PAGES]) {
    await p.goto(BASE + f);
    const liens = await p.evaluate(() => [...document.querySelectorAll("a[href]")].map(a => a.getAttribute("href")).filter(h => !/^(https?:|mailto:|#$)/.test(h)));
    for (const h of liens) {
      const [fic, ancre] = h.split("#"); const cible = fic ? path.join(RACINE, fic.replace(/^\.\//, "") || "index.html") : path.join(RACINE, f);
      if (fic && fic !== "./" && !fs.existsSync(cible)) { casses.push(f + " → " + h); continue }
      if (ancre) { const html = fs.readFileSync(fic && fic !== "./" ? cible : path.join(RACINE, f), "utf8"); if (!html.includes('id="' + ancre + '"')) casses.push(f + " → " + h) }
    }
  }
  await p.close(); return { ok: !casses.length, info: casses.length ? casses.join(", ") : "aucun lien cassé" } });

await test("Lisibles sur iPhone (390 px), clair et sombre : pas de défilement horizontal, texte contrasté", async () => {
  const pb = [];
  for (const cs of ["light", "dark"]) { const p = await b.newPage({ viewport: { width: 390, height: 844 }, colorScheme: cs });
    for (const f of PAGES) { await p.goto(BASE + f); await p.waitForTimeout(80);
      const r = await p.evaluate(() => { const lum = c => { const m = c.match(/\d+(\.\d+)?/g).map(Number).slice(0, 3).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4 }); return .2126 * m[0] + .7152 * m[1] + .0722 * m[2] };
        const s = getComputedStyle(document.body), a = lum(s.color), bg = lum(s.backgroundColor); return { large: document.documentElement.scrollWidth <= innerWidth + 1, ct: (Math.max(a, bg) + .05) / (Math.min(a, bg) + .05) } });
      if (!r.large || r.ct < 7) pb.push(f + "/" + cs + " " + JSON.stringify(r)) }
    await p.close() }
  return { ok: !pb.length, info: pb.length ? pb.join(" ; ") : "14 vues correctes, contraste ≥ 7:1" } });

await test("Mentions obligatoires : hébergeur, contact, régime non professionnel, CNIL, rétractation, résiliation, médiation", async () => {
  const t = f => fs.readFileSync(path.join(RACINE, f), "utf8");
  const v = { hebergeur: /GitHub, Inc\.,.*San Francisco/.test(t("mentions-legales.html")), lcen: /article 1-1, II/.test(t("mentions-legales.html")),
    contact: ["mentions-legales.html", "conditions.html", "cgv.html", "confidentialite.html"].every(f => t(f).includes("contact@retoucheproai.com")),
    cnil: /cnil\.fr\/fr\/plaintes/.test(t("confidentialite.html")), retract: /L221-28/.test(t("cgv.html")), resil: /Résilier un abonnement/.test(t("cgv.html")),
    mediation: /médiateur de la consommation/.test(t("cgv.html")), aiact: /article 50/.test(t("conditions.html")), cgvNoindex: /noindex/.test(t("cgv.html")),
    sitemap: PAGES.filter(f => f !== "cgv.html").every(f => t("sitemap.xml").includes(f)) };
  return { ok: Object.values(v).every(Boolean), info: JSON.stringify(v) } });

await test("Marquage IA : une photo JPEG et PNG reçoit les métadonnées IPTC « généré en partie par IA » et reste lisible", async () => {
  const p = await b.newPage(); await p.goto(BASE + "index.html"); await p.waitForFunction(() => window.MARQUAGE);
  const r = await p.evaluate(async () => { const out = {};
    for (const t of ["image/jpeg", "image/png"]) { const c = document.createElement("canvas"); c.width = 64; c.height = 48; const x = c.getContext("2d"); x.fillStyle = "#c33"; x.fillRect(0, 0, 64, 48);
      const b0 = await new Promise(r => c.toBlob(r, t, .9)); const b1 = await MARQUAGE.marquer(b0, { outil: "RetoucheProAI test", modele: "MI-GAN" });
      const txt = new TextDecoder("latin1").decode(new Uint8Array(await b1.arrayBuffer()));
      const img = await createImageBitmap(b1); out[t] = { xmp: txt.includes("compositeWithTrainedAlgorithmicMedia"), lisible: img.width === 64 && img.height === 48, plus: b1.size > b0.size } }
    const z = await MARQUAGE.marquer(new Blob(["abc"], { type: "image/jpeg" })); out.erreur = (await z.text()) === "abc"; return out });
  await p.close(); const ok = r["image/jpeg"].xmp && r["image/jpeg"].lisible && r["image/png"].xmp && r["image/png"].lisible && r.erreur;
  return { ok, info: JSON.stringify(r) } });

await test("Premier écran : avant / après qui glisse seul, s’arrête au toucher, carte « écran d’accueil » seulement sur iPhone", async () => {
  const ios = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
  const p = await b.newPage({ viewport: { width: 390, height: 844 } }); await p.goto(BASE + "index.html"); await p.waitForTimeout(300);
  const a = await p.evaluate(() => getComputedStyle(document.getElementById("demo")).getPropertyValue("--p")); await p.waitForTimeout(500);
  const a2 = await p.evaluate(() => getComputedStyle(document.getElementById("demo")).getPropertyValue("--p"));
  await p.evaluate(() => { const r = document.querySelector("#demo input"); r.dispatchEvent(new Event("pointerdown")); r.value = 20; r.dispatchEvent(new Event("input")) });
  await p.waitForTimeout(400); const fixe = await p.evaluate(() => getComputedStyle(document.getElementById("demo")).getPropertyValue("--p"));
  const r = await p.evaluate(() => ({ imgs: [...document.querySelectorAll("#demo img")].every(i => i.complete && i.naturalWidth === 720), inst: !document.getElementById("inst").hidden, h: document.querySelector("header.top").offsetHeight }));
  await p.close();
  const q = await b.newPage({ viewport: { width: 390, height: 844 }, userAgent: ios }); await q.goto(BASE + "index.html"); await q.waitForTimeout(200);
  const instIos = await q.evaluate(() => !document.getElementById("inst").hidden); await q.close();
  return { ok: a !== a2 && fixe.trim() === "20%" && r.imgs && !r.inst && instIos && r.h < 80, info: `bouge ${a.trim()}→${a2.trim()}, après toucher ${fixe.trim()}, images ${r.imgs}, carte Chrome ${r.inst} / iPhone ${instIos}, en-tête ${r.h}px` } });

await b.close(); srv.kill();
console.log("\nRésultat : " + res.filter(x => x).length + " réussis, " + res.filter(x => !x).length + " échoués.");
process.exit(res.every(x => x) ? 0 : 1);
