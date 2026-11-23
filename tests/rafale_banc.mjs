/* Banc Rafale (v12.0) : exécute rafale.js dans Chrome sans écran sur les scènes de tests/rafale/creer_banc.py,
   puis tests/rafale/mesurer.py compare à la vérité (PSNR, SSIM, LPIPS, scintillement) contre l'agrandissement d'une seule image.
   node tests/rafale_banc.mjs DOSSIER_BANC DOSSIER_SORTIE ['{"kd":0.4}'] [R]
   Le GPU est simulé (SwiftShader) : les durées ne disent rien de la vitesse sur iPhone, la qualité est identique. */
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url";
const { chromium } = await import(process.env.PW || "playwright");
const HERE = path.dirname(fileURLToPath(import.meta.url));
const [BANC, OUT, OPT = "{}", RR = "2"] = process.argv.slice(2);
const R = +RR;
fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await b.newPage(); const errs = []; p.on("pageerror", e => errs.push(e.message)); p.on("console", m => { if (m.type() === "error") errs.push(m.text()) });
await p.setContent("<!doctype html><body></body>");
await p.addScriptTag({ path: path.join(HERE, "..", "rafale.js") });
const dispo = await p.evaluate(() => RAFALE.dispo());
if (!dispo) { console.log("✗ WebGL2 flottant indisponible"); process.exit(1) }
const scenes = fs.readdirSync(BANC).filter(d => fs.existsSync(path.join(BANC, d, "info.json")));
let tot = 0;
for (const sc of scenes) {
  const info = JSON.parse(fs.readFileSync(path.join(BANC, sc, "info.json")));
  const imgs = []; for (let i = 0; i < info.n; i++) imgs.push("data:image/png;base64," + fs.readFileSync(path.join(BANC, sc, "lr_" + String(i).padStart(2, "0") + ".png")).toString("base64"));
  fs.mkdirSync(path.join(OUT, sc), { recursive: true });
  const res = await p.evaluate(async ({ imgs, OPT, R }) => {
    const el = await Promise.all(imgs.map(u => new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = u })));
    const r = RAFALE.creer(JSON.parse(OPT)), out = [], t = [], rob = [];
    let pushed = -1;
    for (let i = 0; i < el.length; i++) {
      while (pushed < Math.min(el.length - 1, i + R)) { pushed++; r.pousser(pushed, el[pushed]) }
      const t0 = performance.now(); const c = r.fusion(i, { s: 2, R, mesure: true }); t.push(performance.now() - t0); rob.push(r.stats.rob.map(x => +x.toFixed(3)));
      out.push(c.toDataURL("image/png"));
    }
    r.liberer(); return { out, t, rob };
  }, { imgs, OPT, R });
  res.out.forEach((u, i) => fs.writeFileSync(path.join(OUT, sc, "sr_" + String(i).padStart(2, "0") + ".png"), Buffer.from(u.split(",")[1], "base64")));
  tot++;
  console.log("· " + sc + " : " + res.out.length + " images, " + Math.round(res.t.reduce((a, b) => a + b, 0) / res.t.length) + " ms/image (simulé), robustesse moyenne image 5 : " + JSON.stringify(res.rob[5]));
}
await b.close();
if (errs.length) { console.log("✗ erreurs : " + errs.slice(0, 5).join(" | ")); process.exit(1) }
console.log("✓ " + tot + " scènes traitées");
