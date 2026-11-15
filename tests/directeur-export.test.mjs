/* Contrôle de faisabilité : décisions synthétiques, pas validation d'un encodeur 8K. */
import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
const D=require("../directeur-export.js");
test("formats paysage et portrait conservent le ratio et restent pairs",()=>{
 assert.deepEqual(D.dimensions(1920,1080,3840),{largeur:3840,hauteur:2160});
 assert.deepEqual(D.dimensions(1080,1920,3840),{largeur:2160,hauteur:3840});
 assert.deepEqual(D.dimensions(1920,1080,-1),{largeur:1920,hauteur:1080});
});
test("4K conservé si le budget et les limites GPU le permettent",()=>{
 const p=D.preparer({w:1920,h:1080,demande:3840,mobile:true,limites:{texture:8192,rendu:8192,viewport:[8192,8192]}});
 assert.equal(p.sortiePreferee.longueur,3840);assert.equal(p.repli,false);
});
test("WebGL insuffisant : bascule Full HD avant toute allocation",()=>{
 const p=D.preparer({w:1920,h:1080,demande:3840,limites:{texture:2048,rendu:2048,viewport:[2048,2048]}});
 assert.deepEqual(p.candidats.map(x=>x.longueur),[1920,1280]);
 assert.equal(p.repli,true);assert.match(p.raisonRepli,/MAX_TEXTURE_SIZE/);
});
test("limite viewport et limite de rendu appliquées séparément",()=>{
 for(const limites of [{viewport:[2000,2000]},{rendu:2000}]){
  const p=D.preparer({w:1920,h:1080,demande:3840,limites});
  assert.equal(p.sortiePreferee.longueur,1920);
 }
});
test("8K jamais déclaré exportable par une simple estimation matérielle",()=>{
 const p=D.preparer({w:7680,h:4320,demande:7680,mobile:false,
  limites:{texture:16384,rendu:16384,viewport:[16384,16384]}});
 assert.ok(!p.candidats.some(x=>x.longueur===7680));
 assert.equal(p.sortiePreferee.longueur,1920);
 assert.match(p.raisonRepli,/non validée/);assert.match(p.examen8k,/Non validé/);
});
test("même le mode origine ne contourne pas le garde-fou 8K",()=>{
 const p=D.preparer({w:7680,h:4320,demande:-1,mobile:false});
 assert.equal(p.sortiePreferee.longueur,1920);assert.equal(p.repli,true);
});
test("budget prudent en mobile, repli automatique sans exception",()=>{
 const p=D.preparer({w:3840,h:2160,demande:3840,mobile:true,
  limites:{texture:8192,rendu:8192},});
 assert.equal(p.sortiePreferee.longueur,3840);
 assert.ok(p.sortiePreferee.moEstimes<=p.budgetMo);
});
test("source carrée en origine trop grande : mémoire et surface bloquent",()=>{
 const p=D.preparer({w:3800,h:3800,demande:-1,mobile:true});
 assert.equal(p.repli,true);assert.equal(p.sortiePreferee.longueur,1920);
});
test("données invalides et trop petites interdites",()=>{
 assert.throws(()=>D.preparer({w:0,h:1080}),/Dimensions/);
 assert.equal(D.dimensions(100,100,0),null);
 assert.equal(D.dimensions(100,100,NaN),null);
});
test("aucune mutation de la source ou des limites",()=>{
 const input={w:1920,h:1080,demande:3840,limites:{texture:2048,viewport:[2048,2048]}};
 const snap=structuredClone(input);
 const a=D.preparer(input),b=D.preparer(input);
 assert.deepEqual(a,b);assert.deepEqual(input,snap);
});
