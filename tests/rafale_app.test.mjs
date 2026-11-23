/* v12.0 : Rafale dans l'app — export réel d'une vidéo « vieux téléphone » dont on connaît la vérité, sans puis avec Rafale.
   Préparer : RAFALE_N=45 python3 -c "import sys;sys.path.insert(0,'tests/rafale');import creer_banc as c;c.OUT='/tmp/rbe';S=c.sources();c.creer('fusee',S['fusee'],False,26,8.0)"
   node tests/rafale_app.test.mjs /tmp/rbe/fusee SORTIE   puis   python3 tests/rafale/mesurer_app.py /tmp/rbe/fusee SORTIE */
import { spawn, execFileSync as X } from "child_process";
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url";
const { chromium } = await import(process.env.PW || "playwright");
const HERE = path.dirname(fileURLToPath(import.meta.url)), PORT = 8791;
const [SC, OUT] = process.argv.slice(2); fs.mkdirSync(OUT, { recursive: true });
const srv = spawn(process.execPath, [path.join(HERE, "serveur.mjs")], { env: { ...process.env, PORT }, stdio: "ignore" }); await new Promise(r => setTimeout(r, 700));
const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ["--use-angle=swiftshader"] });
const p = await b.newPage({ viewport: { width: 390, height: 844 } }); const errs = []; p.on("pageerror", e => errs.push(e.message));
const res = []; const test = async (n, f) => { let ok = false, info = ""; try { const r = await f(); ok = r.ok; info = r.info } catch (e) { info = "exception : " + e.message.split("\n")[0] } res.push(ok); console.log((ok ? "✓ " : "✗ ") + n + " — " + info) };
const attendre = async (f, ms, quoi) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await p.evaluate(f).catch(() => false)) return; await p.waitForTimeout(150) } throw new Error("attente dépassée : " + quoi) };
const fini = () => attendre(() => !exporting && /Terminé|Échec|Impossible|annulé|pas pu/.test(document.querySelector("#st1").textContent), 1500000, "fin de l'export");
const sauver = async o => { const buf = Buffer.from(await p.evaluate(async () => { const a = new Uint8Array(await outBlob.arrayBuffer()); let s = ""; for (let i = 0; i < a.length; i += 32768) s += String.fromCharCode(...a.subarray(i, i + 32768)); return btoa(s) }), "base64"); fs.writeFileSync(o, buf);
  return +X("ffprobe", ["-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=nb_read_frames", "-of", "csv=p=0", o]).toString() };
await p.goto("http://localhost:" + PORT + "/index.html"); await p.waitForFunction(() => window.RAFALE && typeof draw === "function");
await test("Rafale disponible (WebGL2 flottant)", async () => ({ ok: await p.evaluate(() => RAFALE.dispo()), info: "" }));
await p.setInputFiles("#f", path.join(SC, "lr.mp4")); await attendre(() => mode === "video" && v.videoWidth > 0, 30000, "vidéo chargée");
await p.waitForTimeout(4000);
const n0 = JSON.parse(fs.readFileSync(path.join(SC, "info.json"))).n;
for (const [nom, on] of [["sans", false], ["rafale", true]]) {
  await test("Export " + nom + " Rafale", async () => {
    await p.evaluate(on => { $("#o_raf").checked = on; $("#o_max").checked = false; $("#q").value = "1920" }, on);
    const t0 = Date.now(); await p.evaluate(() => $("#ex").click()); await fini();
    const st = await p.textContent("#st1"), info = await p.evaluate(() => JSON.stringify(window.__raf)), n = await sauver(path.join(OUT, nom + ".mp4"));
    const okRaf = on ? /"s":2/.test(info) : true;
    return { ok: /Terminé/.test(st) && n === n0 && okRaf, info: n + "/" + n0 + " images, " + Math.round((Date.now() - t0) / 1000) + " s (simulé), état : " + info };
  });
}
await test("Aucune erreur de page", async () => ({ ok: errs.length === 0, info: errs.slice(0, 3).join(" | ") }));
await b.close(); srv.kill();
console.log(res.every(x => x) ? "TOUT EST BON" : "ÉCHEC"); process.exit(res.every(x => x) ? 0 : 1);
