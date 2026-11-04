/* Décodage : l'image n° i lue par l'app (SeqReader, WebCodecs) est-elle identique à celle que le serveur lit avec FFmpeg ?
   node tests/serveur_ia_decodage.mjs <vidéo> <dossier de sortie> [indices…]
   Écrit app_<i>.png pour chaque indice ; la comparaison avec FFmpeg (BT.709 / BT.601, plage limitée) est faite par serveur_ia_compare_decodage.py. */
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const { chromium } = await import(process.env.PW || "playwright");
const HERE = path.dirname(fileURLToPath(import.meta.url)), PORT = 8775, BASE = "http://localhost:" + PORT;
const VID = path.resolve(process.argv[2]), OUT = path.resolve(process.argv[3]); fs.mkdirSync(OUT, { recursive: true });
const IDX = process.argv.slice(4).map(Number); if (!IDX.length) IDX.push(0, 30, 90);
const srv = spawn(process.execPath, [path.join(HERE, "serveur.mjs")], { env: { ...process.env, PORT }, stdio: "ignore" });
await new Promise(r => setTimeout(r, 600));
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
const p = await (await browser.newContext()).newPage(); const errs = []; p.on("pageerror", e => errs.push(e.message));
await p.goto(BASE + "/index.html"); await p.waitForFunction(() => window.SR && typeof SeqReader !== "undefined" && typeof demuxVideo === "function");
const b64 = fs.readFileSync(VID).toString("base64");
const r = await p.evaluate(async ({ b64, IDX, name }) => {
  const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0)), f = new File([bin], name, { type: "video/mp4" });
  const inf = await demuxVideo(f), rd = new SeqReader(f, inf); const fps = inf.fps || 30; rd.setFps(fps); await rd.open(rd.map(IDX[0]));
  const out = [];
  for (const i of IDX) { const c = await rd.need(i); const d = document.createElement("canvas"); d.width = c.width || c.displayWidth; d.height = c.height || c.displayHeight;
    d.getContext("2d").drawImage(c, 0, 0); out.push({ i, url: d.toDataURL("image/png"), w: d.width, h: d.height }) }
  rd.close(); return { fps, out, cs: inf.colorSpace || null };
}, { b64, IDX, name: path.basename(VID) });
for (const o of r.out) fs.writeFileSync(path.join(OUT, "app_" + o.i + ".png"), Buffer.from(o.url.split(",")[1], "base64"));
console.log(JSON.stringify({ fps: r.fps, images: r.out.map(o => o.i + ":" + o.w + "x" + o.h), erreurs: errs }));
await browser.close(); srv.kill();
