import test from "node:test";
import assert from "node:assert/strict";
import {deps,sha256,PINNED_HASHES} from "../outils/nova-hevc-assets.mjs";
test("HEVC 0.18 : staging n'importe que des modules relatifs explicitement détectés",()=>{
 assert.deepEqual(deps('export {a} from "./chunk-JS.js";\nimport "./later.js";'),[
  "./chunk-JS.js","./later.js"]);
 assert.deepEqual(deps('const x=import("./decoder.js");'),["./decoder.js"]);
 assert.deepEqual(deps("await fetch('https://example.test/decoder')"),[]);
});
test("HEVC 0.18 : SHA-256 reproductible",()=>{
 assert.equal(sha256(Buffer.from("hello")),
  "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
});

test("HEVC 0.18 : quatre composants exacts fixés par empreinte SHA-256",()=>{
 assert.equal(Object.keys(PINNED_HASHES).length,4);
 assert.match(PINNED_HASHES["wasm/hevc-decode.wasm"],/^[0-9a-f]{64}$/);
 assert.equal(PINNED_HASHES["wasm/hevc-decode.wasm"],
 "450601a71473125e772f01437877eb97abcb3a55332553e205f352f500208a1d");
});
