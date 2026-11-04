/* Tests du gestionnaire de modèles IA (models.js), dans Chrome sans écran.
   Lancement : node tests/gestionnaire.test.mjs   (variable PW = chemin de Playwright si besoin)
   Chaque scénario de la mission (§13.14) a son test ; ceux qui ne peuvent pas être reproduits ici sont signalés « non testable ». */
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
const { chromium } = await import(process.env.PW || "playwright");
const HERE = path.dirname(fileURLToPath(import.meta.url)), PORT = 8766, BASE = "http://localhost:" + PORT;
const srv = spawn(process.execPath, [path.join(HERE, "serveur.mjs")], { env: { ...process.env, PORT }, stdio: "ignore" });
await new Promise(r => setTimeout(r, 600));
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ["--enable-unsafe-webgpu", "--use-angle=swiftshader", "--ignore-gpu-blocklist"] });
const results = [];
async function fresh() {
  const ctx = await browser.newContext(); const p = await ctx.newPage(); const errs = [];
  p.on("pageerror", e => errs.push(e.message));
  await p.goto(BASE + "/index.html"); await p.waitForFunction(() => window.MODELS && window.SR);
  await p.evaluate(async () => {
    const info = async v => (await fetch("/__test/info?v=" + v)).json();
    const [a, b] = [await info(1), await info(2)];
    window.T = { a, b, add(id, q, o) { const e = Object.assign({ id, nom: "Test " + id, role: "test", modele: "m", version: "1", fonction: "", medias: "", entree: "", sortie: "", moteur: "", url: "/__test/model.bin?k=" + id + (q ? "&" + q : ""), integre: false, taille: a.size, sha256: a.sha256, licence: "", source: "", lourd: false, memoire: "", limites: "", secours: "secours", validation: "" }, o || {}); MODELS._test.add(e); return e },
      log: async (k) => (await (await fetch("/__test/log")).json()).filter(x => x.k === k), code: async f => { try { await f(); return "OK" } catch (e) { return e.code || e.message } } };
  });
  return { p, ctx, errs };
}
async function test(name, fn) {
  const t0 = Date.now(); let ok = false, info = "";
  try { const r = await fn(); ok = r === true || (r && r.ok); info = r && r.info ? r.info : (r === true ? "" : JSON.stringify(r)) } catch (e) { info = "exception : " + e.message }
  results.push({ name, ok, info, s: ((Date.now() - t0) / 1000).toFixed(1) });
  console.log((ok ? "✓ " : "✗ ") + name + (info ? " — " + info : "") + " (" + ((Date.now() - t0) / 1000).toFixed(1) + " s)");
}
const nt = (name, why) => { results.push({ name, ok: null, info: why }); console.log("○ " + name + " — non testable ici : " + why) };

const { p, errs } = await fresh();

await test("Installation normale (progression réelle, vérification SHA-256, installation)", () => p.evaluate(async () => {
  T.add("n1"); const pr = []; await MODELS.download("n1", { onProgress: f => pr.push(f) });
  const st = await MODELS.status("n1"), b = await MODELS.bytes("n1"), h = await MODELS.sha256(b);
  return { ok: st.installed && h === T.a.sha256 && pr.length > 3 && pr[pr.length - 1] === 1 && !!st.s.verif, info: pr.length + " étapes de progression, état « " + st.etat + " »" } }));

await test("Téléchargement interrompu puis repris automatiquement (en-tête Range)", () => p.evaluate(async () => {
  T.add("cut", "cut=2500000"); await MODELS.download("cut"); const l = await T.log("cut"), b = await MODELS.bytes("cut");
  return { ok: l.length === 2 && /^bytes=\d+-$/.test(l[1].range) && +l[1].range.slice(6, -1) > 0 && (await MODELS.sha256(b)) === T.a.sha256, info: "demandes : " + l.map(x => x.range || "complète").join(" puis ") } }));

await test("Reprise après annulation (morceaux gardés dans IndexedDB)", () => p.evaluate(async () => {
  T.add("ann", "slow=60"); const d = MODELS.download("ann"); await new Promise(r => setTimeout(r, 700)); MODELS.cancel("ann");
  const c = await T.code(() => d); const part = await MODELS._test.partGet(MODELS.get("ann"));
  const kept = part && part.blob ? part.blob.size : 0; await MODELS.download("ann"); const l = await T.log("ann");
  const h = await MODELS.sha256(await MODELS.bytes("ann")), after = await MODELS._test.partGet(MODELS.get("ann"));
  return { ok: c === "ANNULE" && kept > 0 && l.length === 2 && l[1].range === "bytes=" + kept + "-" && h === T.a.sha256 && !after, info: c + ", " + kept + " octets gardés, reprise « " + l[1].range + " », morceaux effacés après installation" } }));

await test("Serveur qui refuse la reprise : redémarrage propre depuis le début", () => p.evaluate(async () => {
  T.add("nr", "cut=2000000&norange=1"); await MODELS.download("nr"); const h = await MODELS.sha256(await MODELS.bytes("nr"));
  return { ok: h === T.a.sha256, info: "empreinte correcte" } }));

await test("Fichier corrompu (un octet modifié) : refusé, rien d’installé", () => p.evaluate(async () => {
  T.add("bad", "bad=1"); const c = await T.code(() => MODELS.download("bad")); const st = await MODELS.status("bad");
  return { ok: c === "EMPREINTE" && !st.installed && !st.partial && st.s.err === "EMPREINTE", info: c + ", état « " + st.etat + " »" } }));

await test("Taille inattendue : refusée avant même l’empreinte", () => p.evaluate(async () => {
  T.add("ext", "extra=1"); const c = await T.code(() => MODELS.download("ext")); const st = await MODELS.status("ext");
  return { ok: c === "CORROMPU" && !st.installed, info: c } }));

await test("Empreinte attendue incorrecte dans le registre : refusé", () => p.evaluate(async () => {
  T.add("sha", "", { sha256: "0".repeat(64) }); const c = await T.code(() => MODELS.download("sha"));
  return { ok: c === "EMPREINTE" && !(await MODELS.status("sha")).installed, info: c } }));

await test("Espace de stockage insuffisant : refusé avant de télécharger", () => p.evaluate(async () => {
  const keep = navigator.storage.estimate; navigator.storage.estimate = async () => ({ usage: 0, quota: 1000000 });
  T.add("q"); const c = await T.code(() => MODELS.download("q")); navigator.storage.estimate = keep; const l = await T.log("q");
  return { ok: c === "STOCKAGE" && l.length === 0, info: c + ", aucune demande envoyée" } }));

await test("Modèle incompatible avec l’appareil : refusé, secours annoncé", () => p.evaluate(async () => {
  T.add("inc"); MODELS.register("inc", { compat: () => ({ ok: false, why: "test" }) });
  const c1 = await T.code(() => MODELS.download("inc")), c2 = await T.code(() => MODELS.bytes("inc")), st = await MODELS.status("inc");
  return { ok: c1 === "INCOMPATIBLE" && c2 === "INCOMPATIBLE" && st.etat === "incompatible", info: c1 } }));

await test("Fichier abîmé après installation : détecté au chargement et retiré", () => p.evaluate(async () => {
  const e = T.add("rot"); await MODELS.download("rot");
  const ca = await caches.open(MODELS._test.CACHE); await ca.put(e.url, new Response(new Uint8Array(e.taille)));
  const c = await T.code(() => MODELS.bytes("rot")), st = await MODELS.status("rot");
  return { ok: c === "CORROMPU" && !st.installed, info: c + ", état « " + st.etat + " »" } }));

await test("Modèle absent au moment du traitement : erreur claire (ABSENT), pas de téléchargement caché", () => p.evaluate(async () => {
  T.add("abs"); const c = await T.code(() => MODELS.bytes("abs")); const l = await T.log("abs");
  return { ok: c === "ABSENT" && l.length === 0, info: c + " ; " + MODELS.explain({ code: c }).texte } }));

await test("Chargements simultanés : un seul téléchargement", () => p.evaluate(async () => {
  T.add("cc", "slow=5"); await Promise.all([MODELS.download("cc"), MODELS.download("cc"), MODELS.download("cc")]); const l = await T.log("cc");
  return { ok: l.length === 1, info: l.length + " demande(s) au serveur pour 3 appels" } }));

await test("Perte de réseau : 3 essais au plus, puis message clair", () => p.evaluate(async () => {
  /* on compte les essais de l'app (Chrome relance parfois seul une connexion coupée : ce n'est pas un essai de l'app) */
  T.add("net", "down=1"); const f0 = window.fetch; let n = 0; window.fetch = (u, o) => { if (String(u).includes("k=net")) n++; return f0(u, o) };
  const t0 = Date.now(); const c = await T.code(() => MODELS.download("net")); window.fetch = f0;
  return { ok: c === "RESEAU" && n === 3, info: c + " après " + n + " essais de l’app, " + ((Date.now() - t0) / 1000).toFixed(1) + " s" } }));

await test("Mise à jour : l’ancienne version reste utilisée tant que la nouvelle n’est pas vérifiée", () => p.evaluate(async () => {
  const e = T.add("up"); await MODELS.download("up"); const u1 = e.url;
  Object.assign(e, { version: "2", url: "/__test/model.bin?k=up2&v=2", sha256: T.b.sha256, anciennes: [{ version: "1", url: u1, sha256: T.a.sha256, taille: T.a.size }] });
  const before = await MODELS.updateAvailable("up"), h1 = await MODELS.sha256(await MODELS.bytes("up"));
  await MODELS.download("up"); const h2 = await MODELS.sha256(await MODELS.bytes("up")), st = await MODELS.status("up");
  return { ok: before && h1 === T.a.sha256 && h2 === T.b.sha256 && st.prev && !st.update, info: "v1 utilisée avant la mise à jour, v2 ensuite, v1 gardée en secours" } }));

await test("Retour à la version précédente", () => p.evaluate(async () => {
  await MODELS.rollback("up"); const h = await MODELS.sha256(await MODELS.bytes("up")), st = await MODELS.status("up");
  return { ok: h === T.a.sha256 && st.prev, info: "v1 rétablie, v2 reste disponible" } }));

await test("Mise à jour échouée : la version en place continue de fonctionner", () => p.evaluate(async () => {
  const e = T.add("uf"); await MODELS.download("uf"); const u1 = e.url;
  Object.assign(e, { version: "2", url: "/__test/model.bin?k=uf2&v=2&bad=1", sha256: T.b.sha256, anciennes: [{ version: "1", url: u1, sha256: T.a.sha256, taille: T.a.size }] });
  const c = await T.code(() => MODELS.download("uf")); const h = await MODELS.sha256(await MODELS.bytes("uf"));
  return { ok: c === "EMPREINTE" && h === T.a.sha256, info: c + ", v1 toujours utilisable" } }));

await test("Déchargement et libération de la mémoire (vrai réseau Real-ESRGAN)", () => p.evaluate(async () => {
  const c = document.createElement("canvas"); c.width = c.height = 48; c.getContext("2d").fillRect(8, 8, 20, 20);
  await SR.run(c, 2, .3, null, null); const l1 = MODELS.loaded("sr"), st = await MODELS.status("sr");
  await MODELS.unload("sr"); const l2 = MODELS.loaded("sr");
  const out = await SR.run(c, 2, .3, null, null); const l3 = MODELS.loaded("sr");
  return { ok: l1 && !l2 && l3 && out.width === 96 && !!st.s.verif, info: "chargé → libéré → rechargé et revérifié (moteur " + SR.engine + ")" } }));

await test("Mémoire insuffisante : libère les modèles inactifs, pas de nouvel essai en boucle", () => p.evaluate(async () => {
  let n = 0; T.add("m1", "", { lourd: true }); MODELS.register("m1", { loaded: () => true, unload: () => { n++ } });
  const code = MODELS.classify(new Error("RangeError: Out of memory")); SRX.off = false; SRX.fail(new Error("out of memory"));
  await new Promise(r => setTimeout(r, 200)); const off = SRX.off; SRX.off = false; SRX.lastErr = null; MODELS.register("m1", { loaded: () => false });
  return { ok: code === "MEMOIRE" && n >= 1 && off === true, info: "classé « " + code + " », " + n + " modèle(s) libéré(s), IA coupée pour la session" } }));

await test("Gros modèles jamais chargés ensemble (libération avant chargement)", () => p.evaluate(async () => {
  let n = 0; T.add("h1", "", { lourd: true }); T.add("h2", "", { lourd: true }); MODELS.register("h1", { loaded: () => n === 0, unload: () => { n++ } });
  await MODELS.beforeLoad("h2"); return { ok: n === 1, info: "h1 libéré avant le chargement de h2" } }));

await test("Désactivation : la fonction passe au secours, sans téléchargement", () => p.evaluate(async () => {
  MODELS.setOff("sr", true); const c = await T.code(() => MODELS.bytes("sr")), on = SRX.on(), dis = document.querySelector("#o_max").disabled;
  MODELS.setOff("sr", false); const on2 = document.querySelector("#o_max").disabled;
  return { ok: c === "DESACTIVE" && !on && dis && !on2, info: "case « Qualité maximale » grisée puis réactivée" } }));

await test("Modèle intégré abîmé (sr.bin) : refusé, l’app continue sans IA", async () => {
  const { p: q, ctx } = await fresh();
  await q.route("**/sr.bin", async r => { const resp = await r.fetch(); const b = Buffer.from(await resp.body()); b[100] ^= 255; r.fulfill({ response: resp, body: b }) });
  const r = await q.evaluate(async () => { const c = await T.code(() => MODELS.bytes("sr")); return { c, st: (await MODELS.status("sr")).s.err } });
  await ctx.close(); return { ok: r.c === "CORROMPU" && r.st === "CORROMPU", info: r.c };
});

await test("Nettoyage : ne touche ni aux photos, ni aux vidéos, ni aux autres stockages", () => p.evaluate(async () => {
  const med = await caches.open("mes-medias"); await med.put("/photo-test.jpg", new Response("photo"));
  const db = await new Promise(r => { const o = indexedDB.open("medias-utilisateur", 1); o.onupgradeneeded = () => o.result.createObjectStore("s"); o.onsuccess = () => r(o.result) });
  await new Promise(r => { const t = db.transaction("s", "readwrite"); t.objectStore("s").put("video", "k"); t.oncomplete = r });
  T.add("pp", "slow=60"); const d = MODELS.download("pp"); await new Promise(r => setTimeout(r, 500)); MODELS.cancel("pp"); await T.code(() => d);
  const before = await MODELS.cleanable(), freed = await MODELS.clean(true);
  const still = await (await caches.open("mes-medias")).match("/photo-test.jpg");
  const v = await new Promise(r => { const g = db.transaction("s").objectStore("s").get("k"); g.onsuccess = () => r(g.result) });
  const n1 = await MODELS.status("n1");
  return { ok: !!still && v === "video" && before.some(x => x.kind === "partiel") && freed > 0 && n1.installed, info: before.length + " élément(s) nettoyable(s), " + freed + " octets libérés ; médias et modèles actifs intacts" } }));

await test("Protection : un modèle intégré ne peut pas être supprimé ; la version de secours n’est retirée que sur demande", () => p.evaluate(async () => {
  const e = T.add("pv"); await MODELS.download("pv"); const u1 = e.url;
  Object.assign(e, { version: "2", url: "/__test/model.bin?k=pv2&v=2", sha256: T.b.sha256, anciennes: [{ version: "1", url: u1, sha256: T.a.sha256, taille: T.a.size }] }); await MODELS.download("pv");
  const c = await T.code(() => MODELS.remove("sr")); const list = await MODELS.cleanable(), prev = list.filter(x => x.kind === "ancienne");
  await MODELS.clean(false); const prevStill = (await MODELS.cleanable()).filter(x => x.kind === "ancienne").length;
  return { ok: c === "ABSENT" && prev.length >= 1 && prevStill === prev.length, info: "suppression refusée (" + c + "), " + prev.length + " version(s) de secours gardée(s) par le nettoyage sans risque" } }));

await test("Interface « Modèles IA » : s’ouvre, affiche chaque modèle avec des boutons réels", () => p.evaluate(async () => {
  MODELS._test.reset(); document.querySelector("#mdlb").click(); await new Promise(r => setTimeout(r, 1200));
  const cards = [...document.querySelectorAll(".mdl-card")], btns = [...document.querySelectorAll(".mdl-card button")].map(b => b.dataset.a);
  const known = ["install", "cancel", "rollback", "unload", "toggle", "remove", "bench"];
  document.querySelector("#mdlx").click();
  return { ok: cards.length === 5 && btns.length > 0 && btns.every(a => known.includes(a)), info: cards.length + " modèles affichés ; actions : " + [...new Set(btns)].join(", ") } }));

nt("Limites de stockage réelles de Safari / iOS", "simulées ci-dessus (quota réduit) ; le comportement exact d’éviction de Safari ne peut être vérifié que sur un iPhone");
nt("Mémoire réellement saturée sur iPhone", "la saturation est simulée (erreur « out of memory ») ; une vraie saturation ne se reproduit que sur l’appareil");
console.log("\nErreurs JavaScript de la page : " + (errs.length ? errs.join(" | ") : "aucune"));
const ok = results.filter(r => r.ok === true).length, ko = results.filter(r => r.ok === false).length;
console.log(`\nRésultat : ${ok} réussis, ${ko} échoués, ${results.filter(r => r.ok === null).length} non testables ici.`);
await browser.close(); srv.kill();
process.exit(ko || errs.length ? 1 : 0);
