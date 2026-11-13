/* Banc de l'analyse (F32) sur de vraies vidéos, sans navigateur : coupures, mouvement de caméra, mosaïque du décor.
   node tests/format/banc_analyse.mjs VIDEO [dossier_sortie] [max_images]   → résumé JSON + mosaïques PNG par scène */
import { spawn, execFileSync } from "child_process"; import fs from "fs"; import path from "path"; import { createRequire } from "module";
const require = createRequire(import.meta.url), FMA = require("../../format-analyse.js"), FMM = require("../../format-moteur.js");
const [, , VID, OUT = "/tmp/fma", MAX = "400"] = process.argv; fs.mkdirSync(OUT, { recursive: true });
const pr = JSON.parse(execFileSync("ffprobe", ["-v", "0", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate", "-of", "json", VID]).toString()).streams[0];
const [fa, fb] = pr.r_frame_rate.split("/").map(Number), cad = fa / fb, sw = pr.width, sh = pr.height, aw = sw >= sh ? 160 : Math.round(160 * sw / sh / 2) * 2, ah = sw >= sh ? Math.round(160 * sh / sw / 2) * 2 : 160;
const ff = spawn("ffmpeg", ["-v", "0", "-i", VID, "-frames:v", MAX, "-vf", `scale=${aw}:${ah}:flags=area`, "-f", "rawvideo", "-pix_fmt", "rgba", "-"]), N = aw * ah * 4;
let buf = Buffer.alloc(0); const imgs = []; for await (const c of ff.stdout) { buf = Buffer.concat([buf, c]); while (buf.length >= N) { imgs.push(new Uint8Array(buf.subarray(0, N))); buf = buf.subarray(N) } }
const t0 = Date.now(), n = imgs.length, ec = [0], mv = [null], rs = [0], CC = []; let pp = null, ps = null; const SV = FMA.suiveur(aw, ah);
for (let i = 0; i < n; i++) { const g = FMA.gris(imgs[i], aw * ah), p = FMA.pyramide(g, aw, ah), s = FMA.signature(imgs[i], aw, ah); const r = SV.ajouter(p); CC.push(r.C); if (i) { ec.push(FMA.ecartSignature(ps, s)); mv.push(r.pas); rs.push(1 - r.pas.inl) } pp = p; ps = s }
const dt = (Date.now() - t0) / n, cp = FMA.coupures(ec, cad, rs); cp.push(n); const res = { video: path.basename(VID), images: n, cadence: cad, ms_par_image: +dt.toFixed(2), scenes: [] };
for (let k = 0; k + 1 < cp.length; k++) { const i0 = cp[k], i1 = cp[k + 1], S = { i0, i1, cadence: cad, aw, ah, mouv: mv.slice(i0, i1), C: CC.slice(i0, i1), pistes: [] }; if (i1 - i0 < 2) continue; const R = FMA.resumer(S);
  const pas = Math.max(1, Math.floor((i1 - i0) / 48)), echs = []; for (let j = 0; j < i1 - i0; j += pas) echs.push({ rgba: imgs[i0 + j], M: R.M[j] });
  const mos = FMM.mosaique(echs, aw, ah), reel = FMM.reelDisponible(mos, R.M, aw, ah, sw / sh, 16 / 9), reelV = FMM.reelDisponible(mos, R.M, aw, ah, sw / sh, 9 / 16);
  const ppm = Buffer.alloc(mos.w * mos.h * 3); for (let p = 0; p < mos.w * mos.h; p++) if (mos.n[p]) { ppm[p * 3] = mos.rgb[p * 3]; ppm[p * 3 + 1] = mos.rgb[p * 3 + 1]; ppm[p * 3 + 2] = mos.rgb[p * 3 + 2] } else { ppm[p * 3] = 255; ppm[p * 3 + 2] = 255 }
  const f = path.join(OUT, path.basename(VID).replace(/\W+/g, "_") + "_s" + k); fs.writeFileSync(f + ".ppm", Buffer.concat([Buffer.from(`P6 ${mos.w} ${mos.h} 255\n`), ppm])); execFileSync("ffmpeg", ["-v", "0", "-y", "-i", f + ".ppm", "-vf", "scale=iw*3:ih*3:flags=neighbor", f + ".png"]); fs.unlinkSync(f + ".ppm");
  res.scenes.push({ i0, i1, classe: R.classe, verrou: R.verrou, etendue: Object.fromEntries(Object.entries(R.etendue).map(([a, b]) => [a, +b.toFixed(3)])), inl: +R.inl.toFixed(2), mosaique: mos.w + "×" + mos.h, reel_16_9: reel, reel_9_16: reelV }) }
console.log(JSON.stringify(res));
