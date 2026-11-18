/* Pont pour le banc Python : lit sur l'entrée standard [{ profil:{n,energie,mouvement,boites}, L, Lp, T }] et renvoie les variantes
   calculées par le VRAI moteur de l'app (format-fidele.js). */
import { createRequire } from "module"; const require = createRequire(import.meta.url), FFI = require("../../format-fidele.js");
let t = ""; process.stdin.on("data", d => t += d); process.stdin.on("end", () => {
  const out = JSON.parse(t).map(q => { const P = { ...q.profil, energie: Float32Array.from(q.profil.energie), mouvement: Float32Array.from(q.profil.mouvement) }, R = FFI.variantes(P, q.L, q.Lp, q.T);
    return Object.fromEntries(Object.entries(R.variantes).map(([k, v]) => [k, { s: Array.from(v.s), B: Array.from(v.B), mesures: v.mesures, f: v.f || null }])) });
  process.stdout.write(JSON.stringify(out)) });
