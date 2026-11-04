/* Version « 4 pixels par fil » du calcul WebGPU : résultat identique à la version d'origine ? Laquelle est la plus rapide ici ?
   node tests/noyau.test.mjs
   Attention : ici le GPU est simulé sur le processeur (SwiftShader). Les durées ne disent RIEN de la vitesse sur iPhone ;
   c'est pourquoi l'app refait cette comparaison elle-même sur chaque appareil, au premier usage. */
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
const { chromium } = await import(process.env.PW || "playwright");
const HERE = path.dirname(fileURLToPath(import.meta.url)), PORT = 8769;
const srv = spawn(process.execPath, [path.join(HERE, "serveur.mjs")], { env: { ...process.env, PORT }, stdio: "ignore" });
await new Promise(r => setTimeout(r, 600));
const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ["--enable-unsafe-webgpu", "--use-angle=swiftshader", "--ignore-gpu-blocklist"] });
const p = await b.newPage(); const errs = []; p.on("pageerror", e => errs.push(e.message));
await p.goto("http://localhost:" + PORT + "/index.html"); await p.waitForFunction(() => window.SRGPU && navigator.gpu);
const r = await p.evaluate(async () => {
  /* image d'essai 150×110 : plusieurs groupes de calcul et des bords incomplets (150 et 110 ne sont pas des multiples de 16) */
  const c = document.createElement("canvas"); c.width = 150; c.height = 110; const x = c.getContext("2d");
  for (let i = 0; i < 150; i += 3) for (let j = 0; j < 110; j += 3) { x.fillStyle = `rgb(${(i * 31 + j * 7) & 255},${(i * 5 ^ j * 13) & 255},${(i * 3 + j * 9) & 255})`; x.fillRect(i, j, 3, 3) }
  const once = async k => { localStorage.setItem("sr_noyau", JSON.stringify({ v: "1", k })); SRGPU.unload(); localStorage.setItem("sr_moteur", "gpu");
    const t0 = performance.now(); const o = await SRGPU.run(c, 4, .3, null, null); const ms = performance.now() - t0;
    return { d: o.getContext("2d").getImageData(0, 0, o.width, o.height).data.slice(), ms, w: o.width, k: SRGPU.kernel && SRGPU.kernel.k } };
  const a = await once("1"), b4 = await once("4");
  let diff = 0, n = 0; for (let i = 0; i < a.d.length; i++) { const d = Math.abs(a.d[i] - b4.d[i]); if (d > diff) diff = d; if (d) n++ }
  localStorage.removeItem("sr_noyau"); SRGPU.unload(); const t = await (async () => { await SRGPU.run(c, 1, .3, null, null); return SRGPU.kernel })();
  return { diff, n, px: a.d.length / 4, w: a.w, ms1: Math.round(a.ms), ms4: Math.round(b4.ms), k1: a.k, k4: b4.k, auto: t };
});
console.log("Sortie " + r.w + " px de large ; écart maximal entre les deux versions : " + r.diff + "/255 (" + r.n + " valeurs différentes sur " + r.px * 4 + ")");
console.log("Durée ici (GPU simulé, NON représentatif d'un iPhone) : 1 pixel/fil " + r.ms1 + " ms, 4 pixels/fil " + r.ms4 + " ms");
console.log("Choix automatique fait par l'app : " + JSON.stringify(r.auto));
console.log("Erreurs JavaScript : " + (errs.length ? errs.join(" | ") : "aucune"));
const ok = r.k1 === "1" && r.k4 === "4" && r.diff <= 1 && r.auto && (r.auto.k === "1" || r.auto.k === "4") && !errs.length;
console.log(ok ? "✓ versions équivalentes, choix automatique opérationnel" : "✗ échec"); await b.close(); srv.kill(); process.exit(ok ? 0 : 1);
