import test from "node:test";
import assert from "node:assert/strict";
import {deps,sha256} from "../outils/nova-hevc-assets.mjs";
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
