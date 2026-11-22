/* v10.1 — IA en cascade : une petite image agrandie ×2,6 ou plus passe deux fois par l'IA (×2 puis ×2).
   Vérifie : la règle (SR.casc), le chemin de l'app (SRX.run), l'égalité avec la référence Python (ia_serveur, 2 passes),
   et le repli sur une passe si la seconde échoue.  PW=…/playwright/index.mjs node tests/cascade.test.mjs */
import { spawn, execFileSync } from "child_process";
import fs from "fs"; import path from "path";
const { chromium } = await import(process.env.PW || "playwright");
const ICI = path.dirname(new URL(import.meta.url).pathname), RACINE = path.join(ICI, "..");
const TMP = fs.mkdtempSync("/tmp/cascade-");
execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-ss", "2", "-i", path.join(ICI, "medias", "video_vieuxtel.mp4"), "-frames:v", "1", "-vf", "scale=160:120", path.join(TMP, "in.png")]);
execFileSync("python3", ["-c", `
import sys,numpy as np,cv2,torch
torch.set_grad_enabled(False); sys.path.insert(0,${JSON.stringify(path.join(RACINE, "serveur-ia"))}); import ia_serveur as IA
m=IA.charger(open(${JSON.stringify(path.join(RACINE, "sr.bin"))},"rb").read(),0.3,device="cpu",demi=False)
ia=lambda l:IA.traiter(m,torch.from_numpy(np.ascontiguousarray(l[...,::-1]))[None],2.0,demi=False)[0].numpy()[...,::-1]
l=cv2.imread(${JSON.stringify(path.join(TMP, "in.png"))}); cv2.imwrite(${JSON.stringify(path.join(TMP, "ref.png"))},ia(ia(l)))`]);
const b64 = f => "data:image/png;base64," + fs.readFileSync(path.join(TMP, f)).toString("base64");
const PORT = 8799, srv = spawn(process.execPath, [path.join(ICI, "serveur.mjs")], { env: { ...process.env, PORT }, stdio: "ignore" }); await new Promise(r => setTimeout(r, 700));
const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await b.newPage({ viewport: { width: 390, height: 844 } }); const errs = []; p.on("pageerror", e => errs.push(e.message));
await p.goto("http://localhost:" + PORT + "/index.html"); await p.waitForFunction(() => window.MODELS && window.SR && window.SRX);
await p.evaluate(() => localStorage.setItem("autorisations", JSON.stringify({ modele: { ok: true } })));
const res = [], test = (n, ok, info) => { res.push(!!ok); console.log((ok ? "✓ " : "✗ ") + n + " — " + info) };
const regle = await p.evaluate(() => [SR.casc(160, 120, 4), SR.casc(480, 270, 8), SR.casc(640, 480, 4.5), SR.casc(854, 480, 4.5), SR.casc(960, 540, 4), SR.casc(1920, 1080, 2), SR.casc(480, 270, 2)]);
test("règle : petite image ×2,6 et plus → cascade ; 960×540, ×2 → non", JSON.stringify(regle) === JSON.stringify([true, true, true, true, false, false, false]), JSON.stringify(regle));
const r = await p.evaluate(async ([inp, ref]) => {
  const ld = u => new Promise(ok => { const i = new Image(); i.onload = () => ok(i); i.src = u });
  const I = await ld(inp), R = await ld(ref), c = document.createElement("canvas"); c.width = 160; c.height = 120; c.getContext("2d").drawImage(I, 0, 0);
  const px = x => { const k = document.createElement("canvas"); k.width = x.width; k.height = x.height; const g = k.getContext("2d"); g.drawImage(x, 0, 0); return g.getImageData(0, 0, k.width, k.height).data };
  const ecart = (a, b) => { let s = 0, m = 0; for (let i = 0; i < a.length; i += 4) for (let j = 0; j < 3; j++) { const d = Math.abs(a[i + j] - b[i + j]); s += d; if (d > m) m = d } return { moy: s / (a.length * .75), max: m } };
  const t0 = performance.now(); const out = await SRX.run(c, 4, null, null); const ms = performance.now() - t0;
  const o = px(out), rf = px(R), cas = SRX.cascade;
  const un = await SR.run(c, 4, .3, null, null); const e1 = ecart(px(un), rf);
  /* repli : seconde passe impossible (limite forcée à 1 pixel) → une seule passe, pas d'erreur */
  const runOrig = SR.run; let appels = 0;
  SR.run = (s, k, d, t, key, lim) => { appels++; if (lim) return Promise.reject(new Error("image trop grande")); return runOrig(s, k, d, t, key, lim) };
  const fb = await SRX.run(c, 4, null, null); SR.run = runOrig; const ef = ecart(px(fb), px(un));
  return { w: out.width, h: out.height, cas, e: ecart(o, rf), e1, ef, appels, err: SRX.cascErr, ms: Math.round(ms) };
}, [b64("in.png"), b64("ref.png")]);
test("chemin de l'app : SRX.run ×4 sur 160×120 passe en cascade, sortie 640×480", r.cas && r.w === 640 && r.h === 480, `${r.w}×${r.h}, ${r.ms} ms`);
test("identique à la référence Python (2 passes) : écart moyen < 1 niveau", r.e.moy < 1 && r.e.max <= 12, `moyen ${r.e.moy.toFixed(3)}, max ${r.e.max}`);
test("la cascade change vraiment l'image (une passe + agrandissement ≠ référence)", r.e1.moy > r.e.moy * 2, `une passe : écart ${r.e1.moy.toFixed(2)} contre ${r.e.moy.toFixed(3)}`);
test("repli : seconde passe en échec → une passe, aucune erreur", r.appels === 3 && r.ef.moy < .5 && /trop grande/.test(r.err || ""), `appels ${r.appels}, écart ${r.ef.moy.toFixed(3)}, ${r.err}`);
test("aucune erreur de page", !errs.length, errs.join(" | "));
console.log("Résultat : " + res.filter(Boolean).length + " réussis, " + res.filter(x => !x).length + " échoués.");
await b.close(); srv.kill(); fs.rmSync(TMP, { recursive: true, force: true }); process.exit(res.every(Boolean) ? 0 : 1);
