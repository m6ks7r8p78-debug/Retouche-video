import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import W from "../serveur/worker.js";
const config = JSON.parse((await readFile(new URL("../serveur/wrangler.jsonc", import.meta.url), "utf8")).replace(/^\s*\/\/.*$/gm, ""));
assert.deepEqual(config.d1_databases, []);
const request = (path, origin, init = {}) => W.fetch(new Request("https://srv.test" + path, { ...init, headers: { origin, ...init.headers } }), {});
for (const origin of ["https://retoucheproai-labo.pages.dev", "https://retoucheproai.com", "https://m6ks7r8p78-debug.github.io"]) {
  const r = await request("/etat", origin);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("access-control-allow-origin"), origin);
  assert.equal((await r.json()).ok, true);
}
for (const origin of ["https://evil.pages.dev", "https://retoucheproai-labo.pages.dev.evil.com", "http://retoucheproai-labo.pages.dev"]) {
  assert.equal((await request("/etat", origin)).status, 403);
}
const origin = "https://retoucheproai-labo.pages.dev";
assert.equal((await request("/video", origin)).status, 422);
assert.equal((await request("/diag", origin, { method: "POST", body: JSON.stringify({ lot: [{id:"abc123def"}] }) })).status, 503);
const preflight = await request("/video", origin, { method: "OPTIONS" });
assert.equal(preflight.status, 200);
assert.equal(preflight.headers.get("access-control-allow-origin"), origin);
console.log("Configuration sans D1, état, import, diagnostic, CORS et prévol : OK");
