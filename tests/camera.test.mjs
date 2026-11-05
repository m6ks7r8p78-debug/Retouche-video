/* Caméra virtuelle (v6.0) : les mesures de l'objectif retrouvent les défauts simulés, et ne voient rien sur une image saine.
   node tests/camera.test.mjs   (Python 3 + numpy, scipy, pillow) */
import { execFileSync } from "node:child_process";
import { readFileSync, mkdtempSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url)), req = createRequire(import.meta.url);
const CAM = req(join(here, "..", "camera.js"));
const tmp = mkdtempSync(join(tmpdir(), "cam-"));
let ok = 0, ko = 0;
const check = (c, t) => { if (c) { ok++; console.log("  ✓ " + t) } else { ko++; console.log("  ✗ " + t) } };

function sim(img, sigma, vg, sR, sB) {
  const out = join(tmp, `${img}_${sigma}_${vg}_${sR}_${sB}.rgba`);
  execFileSync("python3", [join(here, "camera_simuler.py"), join(here, "medias", `ref_${img}.png`), out, sigma, vg, sR, sB].map(String));
  const m = JSON.parse(readFileSync(out + ".json", "utf8"));
  const luma = (d, n) => { const y = new Float32Array(n); for (let i = 0, k = 0; k < n; i += 4, k++) y[k] = .299 * d[i] + .587 * d[i + 1] + .114 * d[i + 2]; return y };
  const big = new Uint8Array(readFileSync(out)), small = new Uint8Array(readFileSync(out + ".480"));
  /* centre 640×640 en définition d'origine, comme dans l'app */
  const cw = Math.min(640, m.W), ch = Math.min(640, m.H), sx = (m.W - cw) >> 1, sy = (m.H - ch) >> 1, crop = new Uint8Array(cw * ch * 4);
  for (let j = 0; j < ch; j++) crop.set(big.subarray(((sy + j) * m.W + sx) * 4, ((sy + j) * m.W + sx + cw) * 4), j * cw * 4);
  return { small: { W: m.w, H: m.h, d: small, y: luma(small, m.w * m.h) }, crop: { W: cw, H: ch, y: luma(crop, cw * ch) } };
}
const near = (a, b, tol) => a != null && Math.abs(a - b) <= tol;

for (const img of ["cafe", "chat", "fusee"]) {
  console.log(`\n${img}`);
  const sain = sim(img, 0.6, 0, 0, 0);
  const f0 = CAM.franges(sain.small), b0 = CAM.flou(sain.crop), v0 = CAM.vignetage(sain.small);
  console.log("  image saine :", { coins: v0 && +v0.toFixed(3), franges: f0 && [f0.r.s, f0.b.s], flou: b0 && b0.sigma });
  check(f0 && Math.abs(f0.r.s) <= .001 && Math.abs(f0.b.s) <= .001, "image saine : franges nulles ou très faibles");

  for (const [s, vg, sR, sB] of [[1.6, .35, .003, -.002], [2.2, 0, -.0025, .0035]]) {
    const x = sim(img, s, vg, sR, sB), fr = CAM.franges(x.small), fl = CAM.flou(x.crop), vv = CAM.vignetage(x.small), vv0 = v0;
    console.log(`  simulé σ=${s} vg=${vg} R=${sR} B=${sB} →`, { coins: vv && +vv.toFixed(3), franges: fr && [fr.r.s, fr.b.s], flou: fl && fl.sigma });
    /* l'image de référence peut avoir ses propres franges (vraie photo) : elles s'ajoutent à celles simulées */
    check(fr && f0 && near(fr.r.s, sR + f0.r.s, .0007) && near(fr.b.s, sB + f0.b.s, .0007), `franges retrouvées (R ${sR}, B ${sB}, + celles de l'image ${f0 && [f0.r.s, f0.b.s]})`);
    /* scène trop douce (dessin sans contours nets) : l'image saine n'a pas de mesure, on ne juge pas le flou ici */
    if (b0) check(fl && near(fl.sigma, Math.hypot(s, b0.sigma), .45), `flou retrouvé (σ ${s} combiné au flou propre de l'image ${b0 && b0.sigma} → ${Math.hypot(s, b0 ? b0.sigma : 0).toFixed(2)})`);
    if (vg) check(vv != null && vv0 != null && vv / vv0 < .85, "coins sombres vus (rapport à l'image saine " + (vv / vv0).toFixed(2) + ")");
  }
}

/* synthèse : règles de prudence */
console.log("\nsynthèse");
const L = CAM.synthese([.8, .82, .78, .85, .9, .8], [{ r: { s: .003, gain: .3 }, b: { s: -.002, gain: .2 } }, { r: { s: .0028, gain: .25 }, b: { s: -.0021, gain: .2 } }], [{ sigma: 1.6 }, { sigma: 1.7 }], { bruit: 1, blocs: 1 });
check(L.vg > .15 && L.vg < .3 && L.ca[0] > .002 && L.ca[1] < -.0015 && L.k > .5, "défauts nets et constants → corrigés " + JSON.stringify({ vg: L.vg, ca: L.ca, k: L.k }));
const L2 = CAM.synthese([.8, 1.1, .7, 1.2, 1, .95], [{ r: { s: .004, gain: .3 }, b: { s: 0, gain: 0 } }, { r: { s: -.002, gain: .3 }, b: { s: 0, gain: 0 } }], [{ sigma: .7 }], { bruit: 3, blocs: 1.3 });
check(L2.vg === 0 && L2.ca[0] === 0 && L2.k < .1, "mesures instables ou image déjà nette → rien n'est corrigé");
const L3 = CAM.synthese([1], [], [{ sigma: 1.8 }], { bruit: 3, blocs: 1.35 });
const L4 = CAM.synthese([1], [], [{ sigma: 1.8 }], { bruit: .8, blocs: 1 });
check(L3.k < L4.k, `bruit et blocs → correction du flou plus douce (${L3.k} < ${L4.k})`);

/* fiche d'appareil : familles */
console.log("\nfamilles");
check(CAM.famille({ format: "3gp4", ext: "3gp" }, 176, 144).id === "tel_3gp", "3GP → téléphone ancien");
check(CAM.famille({ format: "AVI", codec: "MJPG", ext: "avi" }, 640, 480).id === "compact", "AVI MJPEG → appareil photo compact");
check(CAM.famille({ marque: "Apple", modele: "iPhone 4" }, 1280, 720).nom === "iPhone 4", "Apple → modèle d'iPhone");
check(CAM.famille({ format: "isom", codec: "avc1" }, 640, 480).id === "ancien", "VGA sans marque → appareil ancien");
check(CAM.annee({ creation: "2009-07-14T10:00:00.000Z" }) === 2009 && CAM.annee({ date: "2012:05:01" }) === 2012, "année lue dans la date");

console.log(`\n${ok} réussis, ${ko} échoués`);
process.exit(ko ? 1 : 0);
