/* Crée toutes les icônes et écrans de démarrage (Android, iOS, site) à partir de logo.svg.
   node icones/creer-icones.mjs   (Playwright requis, comme pour les tests du site) */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const { chromium } = await import(process.env.PW || "playwright");
const ICI = path.dirname(fileURLToPath(import.meta.url)), APP = path.join(ICI, ".."), SITE = path.join(APP, "..");
const SVG = fs.readFileSync(path.join(ICI, "logo.svg"), "utf8");
const sansFond = SVG.replace(/<rect id="carre"[^>]*\/>/, "");
const b = await chromium.launch({ executablePath: process.env.CHROME || undefined });
const p = await b.newPage();
async function rendu(fichier, w, h, { svg = SVG, echelle = 1, fond = "transparent", rond = false } = {}) {
  const t = Math.min(w, h) * echelle;
  await p.setViewportSize({ width: w, height: h });
  await p.setContent(`<html><body style="margin:0;width:${w}px;height:${h}px;background:${fond};display:grid;place-items:center;overflow:hidden">
    <div style="width:${t}px;height:${t}px;${rond ? "border-radius:50%;overflow:hidden" : ""}">${svg.replace("<svg ", `<svg width="${t}" height="${t}" `)}</div></body></html>`);
  fs.mkdirSync(path.dirname(fichier), { recursive: true });
  await p.screenshot({ path: fichier, omitBackground: fond === "transparent" });
}
const RES = path.join(APP, "android/app/src/main/res");
const D = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
for (const [d, s] of Object.entries(D)) {
  await rendu(`${RES}/mipmap-${d}/ic_launcher.png`, s, s);
  await rendu(`${RES}/mipmap-${d}/ic_launcher_round.png`, s, s, { rond: true });
  /* icône adaptative : dessin seul, dans la zone sûre (66 % du carré de 108 dp) */
  await rendu(`${RES}/mipmap-${d}/ic_launcher_foreground.png`, s * 2.25, s * 2.25, { svg: sansFond, echelle: 0.72 });
}
/* écrans de démarrage : fond crème, logo au centre */
for (const f of fs.readdirSync(RES).filter(x => x.startsWith("drawable"))) {
  const fi = path.join(RES, f, "splash.png"); if (!fs.existsSync(fi)) continue;
  const { w, h } = await p.evaluate(async src => { const i = new Image(); i.src = src; await i.decode(); return { w: i.naturalWidth, h: i.naturalHeight } }, "data:image/png;base64," + fs.readFileSync(fi).toString("base64"));
  await rendu(fi, w, h, { fond: "#fff7f2", echelle: 0.32, svg: SVG.replace('<rect id="carre"', '<rect id="carre" rx="230"') });
}
/* iOS : 1024 × 1024 sans transparence */
await rendu(path.join(APP, "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png"), 1024, 1024, { fond: "#ff3d8b" });
const SPL = path.join(APP, "ios/App/App/Assets.xcassets/Splash.imageset");
if (fs.existsSync(SPL)) for (const f of fs.readdirSync(SPL).filter(x => x.endsWith(".png"))) await rendu(path.join(SPL, f), 2732, 2732, { fond: "#fff7f2", echelle: 0.2, svg: SVG.replace('<rect id="carre"', '<rect id="carre" rx="230"') });
/* site (écran d'accueil de l'iPhone, Android, onglet) */
await rendu(path.join(SITE, "icon-180.png"), 180, 180, { fond: "#ff3d8b" });
await rendu(path.join(SITE, "icon-192.png"), 192, 192, { fond: "#ff3d8b" });
await rendu(path.join(SITE, "icon-512.png"), 512, 512, { fond: "#ff3d8b" });
await b.close();
console.log("icônes créées");
