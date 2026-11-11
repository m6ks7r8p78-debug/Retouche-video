/* Hors-ligne et mises à jour, avec le vrai service worker dans Chrome (v6.5).
   Le site est servi en local en HTTPS sous le nom retoucheproai.com (certificat de test, créé avec openssl).
   node tests/sw_reel.test.mjs */
import fs from "fs"; import os from "os"; import path from "path"; import https from "https"; import { execSync } from "child_process"; import { fileURLToPath } from "url";
const HERE = path.dirname(fileURLToPath(import.meta.url)), RACINE = path.join(HERE, "..");
const { chromium } = await import(process.env.PW || "playwright");
for (const k of ["HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy", "ALL_PROXY", "all_proxy"]) delete process.env[k]; /* le test ne doit joindre que le serveur local */
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "swreel-")), SITE = path.join(TMP, "site"), PORT = +(process.env.PORT || 8443);
const copier = () => { fs.rmSync(SITE, { recursive: true, force: true }); fs.cpSync(RACINE, SITE, { recursive: true, filter: s => !/(^|\/)(\.git|tests|app-stores|node_modules)(\/|$)/.test(path.relative(RACINE, s)) }) };
copier();
execSync(`openssl req -x509 -newkey rsa:2048 -nodes -keyout ${TMP}/k.pem -out ${TMP}/c.pem -days 2 -subj /CN=retoucheproai.com -addext subjectAltName=DNS:retoucheproai.com`, { stdio: "ignore" });
const T = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json", ".bin": "application/octet-stream", ".onnx": "application/octet-stream" };
let enLigne = true, demandes = [];
const srv = https.createServer({ key: fs.readFileSync(TMP + "/k.pem"), cert: fs.readFileSync(TMP + "/c.pem") }, (q, r) => {
  if (!enLigne) { q.socket.destroy(); return }
  let p = decodeURIComponent(q.url.split("?")[0]); if (p.endsWith("/")) p += "index.html"; demandes.push(p);
  fs.readFile(path.join(SITE, p), (e, d) => { if (e) { r.writeHead(404); r.end(); return } r.writeHead(200, { "content-type": T[path.extname(p)] || "application/octet-stream", "cache-control": "max-age=600" }); r.end(d) })
}).listen(PORT);
let ok = 0, ko = 0; const check = (c, l) => { if (c) { ok++; console.log("✓ " + l) } else { ko++; console.log("✗ " + l) } };
const b = await chromium.launch({ args: [`--host-resolver-rules=MAP retoucheproai.com:443 127.0.0.1:${PORT}`, "--ignore-certificate-errors", "--no-proxy-server"] });
const c = await b.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 } }), p = await c.newPage(), errs = [];
p.on("pageerror", e => errs.push(e.message));
const URL0 = "https://retoucheproai.com/", ver = () => p.evaluate(() => VER);
const pret = () => p.waitForFunction(() => navigator.serviceWorker.controller && window.STUDIO && window.ERASE, null, { timeout: 60000 });
const attendre = async (f, quoi) => { for (let i = 0; i < 240; i++) { if (await p.evaluate(f).catch(() => false)) return; await p.waitForTimeout(250) } throw new Error("attente dépassée : " + quoi) };
const changer = (v, cache) => { for (const [f, a, z] of [["app.js", /const VER="[^"]+"/, `const VER="${v}"`], ["sw.js", /const C="[^"]+"/, `const C="${cache}"`]]) { const x = path.join(SITE, f); fs.writeFileSync(x, fs.readFileSync(x, "utf8").replace(a, z)) } };
try {
  await p.goto(URL0); await pret(); const v0 = await ver();
  await attendre(async () => { const k = (await caches.keys()).find(x => /^retouche-v\d+$/.test(x)); return !!k && !!(await (await caches.open(k)).match("sr.bin")) && !!(await (await caches.open(k)).match("rnnoise.mjs")) }, "fichiers lourds en cache");
  check(demandes.includes("/app.js") && v0 === fs.readFileSync(path.join(RACINE, "app.js"), "utf8").match(/const VER="([^"]+)"/)[1], "installation : l'app (servie par ce test) et les fichiers lourds (sr.bin…) sont gardés sur l'appareil — " + v0);
  demandes = []; await p.reload(); await pret(); await p.waitForTimeout(1500);
  const app = demandes.filter(x => x !== "/sw.js");
  check(app.length === 0, "deuxième ouverture : aucun fichier de l'app redemandé au serveur" + (app.length ? " (redemandés : " + app.join(", ") + ")" : ""));
  enLigne = false; await p.reload(); await p.waitForFunction(() => window.STUDIO && window.ERASE && typeof VER === "string", null, { timeout: 30000 });
  const dim = await p.evaluate(async () => { const i = new Image(); i.src = "demo/chat-apres.webp"; await i.decode(); return i.naturalWidth });
  check(dim > 0 && (await ver()) === v0, "sans connexion : l'app s'ouvre en entier (code, image de démonstration)");
  await p.goto(URL0 + "tarifs.html"); check((await p.title()).length > 0 && (await p.locator("body").innerText()).length > 200, "sans connexion : la page Tarifs s'ouvre");
  enLigne = true; await p.goto(URL0); await pret();
  changer("v-test-2", "retouche-v99998"); await p.reload();
  await p.waitForFunction(() => typeof VER === "string" && VER === "v-test-2", null, { timeout: 60000 });
  const cles = await p.evaluate(() => caches.keys());
  check(true, "nouvelle version : installée en arrière-plan, la page se recharge toute seule sur la nouvelle");
  check(cles.includes("retouche-v99998") && cles.filter(x => /^retouche-v\d+$/.test(x)).length === 1, "nouvelle version : l'ancien cache est retiré — " + cles.join(", "));
  await pret(); await p.evaluate(() => { document.body.classList.add("loaded"); window.__temoin = 1 });
  changer("v-test-3", "retouche-v99999"); await p.evaluate(() => navigator.serviceWorker.getRegistration().then(r => r.update()));
  await attendre(async () => (await caches.keys()).includes("retouche-v99999") && !(await caches.keys()).includes("retouche-v99998"), "troisième version installée"); await p.waitForTimeout(2500);
  check((await p.evaluate(() => window.__temoin)) === 1 && (await ver()) === "v-test-2", "travail en cours (photo ou vidéo ouverte) : la page n'est PAS rechargée");
  await p.reload(); await p.waitForFunction(() => typeof VER === "string", null, { timeout: 30000 });
  check((await ver()) === "v-test-3", "à l'ouverture suivante : la nouvelle version est là");
  check(!errs.length, "aucune erreur JavaScript" + (errs.length ? " : " + errs.join(" | ") : ""));
} catch (e) { ko++; console.log("✗ exception : " + e.message.split("\n")[0]) }
finally { await b.close(); srv.close(); fs.rmSync(TMP, { recursive: true, force: true }) }
console.log("\nRésultat : " + ok + " réussis, " + ko + " échoués."); process.exit(ko ? 1 : 0);
