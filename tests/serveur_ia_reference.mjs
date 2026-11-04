/* Références pour l'IA serveur : l'app elle-même calcule SR.run(image, s, dn) dans Chrome, et enregistre le résultat en PNG.
   node tests/serveur_ia_reference.mjs <dossier des PNG d'entrée> <dossier de sortie>
   Cas : chaque PNG d'entrée × (s = 3, dn = 0,3) et (s = 2, dn = 0,55). Moteur : WebGPU si disponible (sinon WebGL2), indiqué dans resultats.json. */
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const { chromium } = await import(process.env.PW || "playwright");
const HERE = path.dirname(fileURLToPath(import.meta.url)), PORT = 8774, BASE = "http://localhost:" + PORT;
const IN = path.resolve(process.argv[2]), OUT = path.resolve(process.argv[3]); fs.mkdirSync(OUT, { recursive: true });
const srv = spawn(process.execPath, [path.join(HERE, "serveur.mjs")], { env: { ...process.env, PORT }, stdio: "ignore" });
await new Promise(r => setTimeout(r, 600));
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ["--enable-unsafe-webgpu", "--use-angle=swiftshader", "--ignore-gpu-blocklist"] });
const p = await (await browser.newContext()).newPage(); const errs = []; p.on("pageerror", e => errs.push(e.message));
await p.goto(BASE + "/index.html"); await p.waitForFunction(() => window.SR && window.MODELS);
const CAS = [[3, 0.3], [2, 0.55]], res = [];
for (const f of fs.readdirSync(IN).filter(f => f.endsWith(".png"))) for (const [s, dn] of CAS) {
  const b64 = fs.readFileSync(path.join(IN, f)).toString("base64"), t0 = Date.now();
  const r = await p.evaluate(async ({ b64, s, dn }) => {
    const im = new Image(); im.src = "data:image/png;base64," + b64; await im.decode();
    const c = document.createElement("canvas"); c.width = im.naturalWidth; c.height = im.naturalHeight; c.getContext("2d").drawImage(im, 0, 0);
    const o = await SR.run(c, s, dn, null, null);
    const d = document.createElement("canvas"); d.width = o.width; d.height = o.height; d.getContext("2d").drawImage(o, 0, 0);
    return { url: d.toDataURL("image/png"), w: o.width, h: o.height, moteur: SR.engine };
  }, { b64, s, dn });
  const name = f.replace(".png", "") + "_s" + s + "_dn" + dn + ".png";
  fs.writeFileSync(path.join(OUT, name), Buffer.from(r.url.split(",")[1], "base64"));
  res.push({ entree: f, s, dn, sortie: name, taille: r.w + "x" + r.h, moteur: r.moteur, secondes: (Date.now() - t0) / 1000 });
  console.log(JSON.stringify(res[res.length - 1]));
}
fs.writeFileSync(path.join(OUT, "resultats.json"), JSON.stringify({ cas: res, erreurs: errs }, null, 1));
await browser.close(); srv.kill();
