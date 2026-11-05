/* Copie l'app web (dossier parent) dans www/ pour l'emballer dans les apps des stores.
   On ne prend que ce que l'app utilise : pas les tests, les serveurs, la documentation ni l'autre app du site (radar). */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const ICI = path.dirname(fileURLToPath(import.meta.url)), SRC = path.join(ICI, ".."), DST = path.join(ICI, "www");
const EXCLURE = new Set(["app-stores", "tests", "serveur", "serveur-ia", "radar", ".git", ".github", "node_modules", "CNAME", "ads.txt", "sw.js"]);
const garder = n => !EXCLURE.has(n) && !n.startsWith(".") && !/\.(md|py|sh)$/i.test(n); /* les licences (LICENSE-*.txt) sont gardées */
fs.rmSync(DST, { recursive: true, force: true }); fs.mkdirSync(DST, { recursive: true });
let n = 0, octets = 0;
(function copier(de, vers) {
  for (const e of fs.readdirSync(de, { withFileTypes: true })) {
    if (de === SRC && !garder(e.name)) continue;
    const a = path.join(de, e.name), b = path.join(vers, e.name);
    if (e.isDirectory()) { fs.mkdirSync(b, { recursive: true }); copier(a, b) }
    else { fs.copyFileSync(a, b); n++; octets += fs.statSync(a).size }
  }
})(SRC, DST);
for (const f of ["index.html", "abo.js", "pub.js", "sr.bin", "manifest.webmanifest"]) if (!fs.existsSync(path.join(DST, f))) throw new Error("fichier manquant dans www : " + f);
console.log("www prêt : " + n + " fichiers, " + (octets / 1048576).toFixed(1) + " Mo");
