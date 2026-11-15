/* CI: calcule l'empreinte PWA attendue sans modifier sw.js. */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");
const files = (name) => {
  const hit = sw.match(new RegExp(name + "=(\\[[^\\]]+\\])"));
  if (!hit) throw new Error("Liste " + name + " absente du service worker");
  return JSON.parse(hit[1]);
};
const h = crypto.createHash("sha256");
for (const f of [...files("F"), ...files("LOURDS")]) {
  if (f === "./") continue;
  h.update(f);
  h.update(fs.readFileSync(path.join(root, f)));
}
const expected = h.digest("hex").slice(0, 16);
const committed = (sw.match(/const H="([^"]+)"/) || [])[1];
console.log("Empreinte PWA attendue :", expected);
console.log("Empreinte PWA enregistree :", committed || "absente");
if (expected !== committed) console.error("Empreintes differentes : actualiser sw.js avant fusion.");
