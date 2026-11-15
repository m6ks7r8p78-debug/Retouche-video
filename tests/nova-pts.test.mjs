import test from "node:test";
import assert from "node:assert/strict";
import PTS from "../experiences/nova-pts.js";

const info=()=>({
 ns:5,W:160,H:90,dw:160,dh:90,key:[true,false,false,false,false],
 so:[200,350,450,570,650],sz:[150,100,120,80,110],
 // En ordre de décodage, le PTS peut avancer/reculer (B-frames).
 ptsUs:[0,200000,66667,133333,266667]
});
test("PTS : indexation par présentation, et non ordre de décodage",()=>{
 const x=PTS.planifier(info());
 assert.deepEqual(x.nonnegative.map(z=>z.index),[0,2,3,1,4]);
 assert.equal(PTS.choisir(x.nonnegative,.10).index,2);
 assert.equal(PTS.choisir(x.nonnegative,.14).index,3);
 assert.equal(PTS.choisir(x.nonnegative,.25).index,1);
 assert.equal(PTS.choisir(x.nonnegative,0).index,0);
 assert.equal(PTS.choisir(x.nonnegative,5).index,4);
});
test("PTS : seuil temporel de présentation sans avance artificielle",()=>{
 const x=PTS.planifier(info());
 assert.equal(PTS.choisir(x.nonnegative,.06666).index,0);
 assert.equal(PTS.choisir(x.nonnegative,.066667).index,2);
});
test("PTS : refus des horodatages dupliqués et imprécis",()=>{
 const b=info();b.ptsUs[2]=b.ptsUs[3];
 assert.throws(()=>PTS.planifier(b),/dupliqué/);
 const q=info();q.ptsUs[1]=NaN;
 assert.throws(()=>PTS.planifier(q),/invalide/);
});
test("PTS : rejet des fichiers sans image clé et sources trop grandes",()=>{
 const b=info();b.key[0]=false;
 assert.throws(()=>PTS.planifier(b),/image clé/);
 const big=info();big.W=3840;big.H=2160;
 assert.throws(()=>PTS.planifier(big),/Full HD/);
});
test("PTS : purge des images de pré-roll négatives",()=>{
 const b=info();b.ptsUs[0]=-40000;b.ptsUs[1]=0;
 const x=PTS.planifier(b);
 assert.equal(x.nonnegative.some(z=>z.ptsUs<0),false);
 assert.equal(PTS.choisir(x.nonnegative,0).index,1);
 const bad=info();bad.ptsUs[0]=-500000;
 assert.throws(()=>PTS.planifier(bad),/Preroll/);
});
test("PTS : validations des paramètres",()=>{
 assert.throws(()=>PTS.planifier({}),/invalide/);
 assert.throws(()=>PTS.choisir([],1),/invalide/);
 assert.throws(()=>PTS.choisir([{ptsUs:0}],-1),/invalide/);
});
