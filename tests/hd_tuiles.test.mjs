/* Geometry and export contract checks. Run: node tests/hd_tuiles.test.mjs
   A real GPU video and physical Safari iPhone still need separate validation. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(root, "sr.js"), "utf8");
let draws = [];
function createCanvas() {
  const c = { width: 0, height: 0 };
  c.getContext = () => ({ drawImage(...args) { draws.push({ owner: c, args }); } });
  return c;
}
const SR = vm.runInNewContext(source + "\nSR", { window: {}, document: { createElement: createCanvas } });
assert.equal(SR.fits(1920, 1080), true);
assert.equal(SR.fits(1080, 1920), true);
assert.equal(SR.fits(2560, 1440), false);
assert.equal(SR.fits(0, 0), false);
let count = 0;
for (const [W, H, s] of [[1920, 1080, 2], [1080, 1920, 2], [1440, 1080, 2], [854, 480, 2.65]]) {
  draws = []; let n = 0, last = 0;
  const result = await SR.runTiled({ width: W, height: H }, s, .3, f => {
    assert.ok(f >= last - 1e-7 && f <= 1);
    last = f;
  }, null, async (tile, scale) => {
    n++;
    assert.ok(tile.width * tile.height <= SR.MAXPX, "tile GPU budget");
    return { width: Math.round(tile.width * scale), height: Math.round(tile.height * scale) };
  });
  const OW = Math.round(W * s), OH = Math.round(H * s);
  assert.equal(result.width, OW); assert.equal(result.height, OH);
  const rects = draws.filter(d => d.owner === result).map(d => d.args.slice(5).map(Number));
  assert.equal(rects.length, n, "every tile composed");
  let area = 0;
  for (const [x, y, w, h] of rects) {
    assert.ok(x >= 0 && y >= 0 && w > 0 && h > 0 && x + w <= OW && y + h <= OH);
    area += w * h;
  }
  assert.equal(area, OW * OH, "no missing pixels");
  const ys = [...new Set(rects.flatMap(r => [r[1], r[1] + r[3]]))].sort((a, b) => a - b);
  for (const y of ys.slice(0, -1)) {
    let x = 0;
    for (const [dx, , dw] of rects.filter(r => r[1] <= y && r[1] + r[3] > y).sort((a, b) => a[0] - b[0])) {
      assert.equal(dx, x, "no gaps or overlaps");
      x += dw;
    }
    assert.equal(x, OW);
  }
  assert.equal(last, 1);
  console.log("✓ " + W + "×" + H + " → " + OW + "×" + OH + " ; " + n + " tuiles");
  count++;
}
await assert.rejects(() => SR.runTiled({ width: 2560, height: 1440 }, 2, .3, null, null, async () => {}), /trop grande/);
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
assert.ok(app.includes("aucune conversion classique ne remplace silencieusement"));
assert.ok(app.includes("restauration_ia_images:framesIA"));
assert.ok(app.includes('!aChoisiQ'));
console.log("Résultat : " + (count + 4) + " contrôles réussis (sans GPU réel).");
