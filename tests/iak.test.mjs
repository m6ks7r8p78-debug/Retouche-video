/* v8.3 — IA par images clés (iak.js), dans Chromium, sans média extérieur.
   Une scène qui défile de 2 px et 1 px par image (déplacement entier : la vérité est exactement l’IA déplacée) ; « l'IA » est ici une fonction connue (agrandissement + renforcement fort), appliquée à
   chaque image pour la vérité. Vérifie : beaucoup moins d'images calculées, détail transporté au bon endroit (sortie bien plus
   proche de l'« IA » complète que l'agrandissement seul), nouvelle clé après une coupe de plan, taille de sortie exacte.
   PW=…/playwright/index.mjs node tests/iak.test.mjs */
import { spawn } from "child_process";
const { chromium } = await import(process.env.PW || "playwright");
const PORT = 8797, srv = spawn(process.execPath, [new URL("./serveur.mjs", import.meta.url).pathname], { env: { ...process.env, PORT }, stdio: "ignore" });
await new Promise(r => setTimeout(r, 700));
const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await b.newPage(); const errs = []; p.on("pageerror", e => errs.push(e.message));
await p.goto("http://localhost:" + PORT + "/index.html"); await p.waitForFunction(() => window.IAK);
const r = await p.evaluate(async () => {
  const W = 240, H = 136, mk = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c };
  /* grande scène détaillée (rayures, cercles, texte) */
  const big = mk(900, 400), bx = big.getContext("2d"); bx.fillStyle = "#777"; bx.fillRect(0, 0, 900, 400);
  for (let i = 0; i < 300; i++) { bx.fillStyle = `hsl(${(i * 47) % 360},60%,${30 + (i * 13) % 50}%)`; bx.beginPath(); bx.arc((i * 97) % 900, (i * 53) % 400, 4 + (i % 9), 0, 7); bx.fill() }
  bx.fillStyle = "#111"; bx.font = "18px sans-serif"; for (let i = 0; i < 20; i++) bx.fillText("RetoucheProAI " + i, (i * 131) % 800, 20 + (i * 37) % 380);
  const frame = (k, coupe) => { const c = mk(W, H); c.getContext("2d").drawImage(big, coupe ? 600 : 40 + k * 2, coupe ? 250 : 30 + k, W, H, 0, 0, W, H); return c };
  const fausseIA = c => { /* « IA » connue : agrandissement ×2 + renforcement très marqué */
    const o = mk(W * 2, H * 2), x = o.getContext("2d", { willReadFrequently: true }); x.imageSmoothingQuality = "high"; x.drawImage(c, 0, 0, W * 2, H * 2);
    const im = x.getImageData(0, 0, W * 2, H * 2), d = im.data, s = new Uint8ClampedArray(d), w = W * 2;
    for (let y = 1; y < H * 2 - 1; y++) for (let X = 1; X < w - 1; X++) for (let ch = 0; ch < 3; ch++) { const i = (y * w + X) * 4 + ch;
      d[i] = s[i] * 3 - (s[i - 4] + s[i + 4] + s[i - w * 4] + s[i + w * 4]) / 2 }
    x.putImageData(im, 0, 0); return o };
  const lum = c => { const d = c.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, c.width, c.height).data, o = new Float32Array(d.length / 4); for (let i = 0; i < o.length; i++) o[i] = (d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 3; return o };
  const ecart = (a, b) => { const A = lum(a), B = lum(b); let s = 0, n = 0; for (let y = 8; y < a.height - 8; y++) for (let x = 8; x < a.width - 8; x++) { const i = y * a.width + x; s += Math.abs(A[i] - B[i]); n++ } return s / n };
  IAK.reinit(); let appels = 0, eI = 0, eB = 0, tailles = true, nb = 0;
  for (let k = 0; k < 24; k++) {
    const f = frame(k, k === 16), vrai = fausseIA(f);
    const o = await IAK.image(f, "t", async () => { appels++; return fausseIA(f) });
    tailles = tailles && o.width === W * 2 && o.height === H * 2;
    const bc = mk(W * 2, H * 2), bx2 = bc.getContext("2d"); bx2.imageSmoothingQuality = "high"; bx2.drawImage(f, 0, 0, W * 2, H * 2);
    if (k % 8) { eI += ecart(o, vrai); eB += ecart(bc, vrai); nb++ }
  }
  return { appels, tailles, ecartIAK: eI / nb, ecartAgrandi: eB / nb, stats: IAK.stats() };
});
const res = [], test = (n, ok, info) => { res.push(ok); console.log((ok ? "✓ " : "✗ ") + n + " — " + info) };
test("beaucoup moins d'images calculées par l'IA", r.appels <= 6, r.appels + " / 24 images calculées");
test("une nouvelle clé après la coupe de plan", r.stats.cles >= 3, JSON.stringify(r.stats));
test("taille de sortie exacte", r.tailles, "");
test("détail transporté au bon endroit", r.ecartIAK < r.ecartAgrandi * .6, `écart à l'IA complète ${r.ecartIAK.toFixed(2)} contre ${r.ecartAgrandi.toFixed(2)} sans transport`);
test("aucune erreur de page", !errs.length, errs.join(" | "));
console.log("\nRésultat : " + res.filter(Boolean).length + " réussis, " + res.filter(x => !x).length + " échoués.");
await b.close(); srv.kill(); process.exit(res.every(Boolean) ? 0 : 1);
