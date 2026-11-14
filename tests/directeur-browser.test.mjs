/* Parcours navigateur réel (Chrome headless) de la version expérimentale.
   Ce test n'est pas une preuve de qualité d'image ni de compatibilité Safari. */
import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const port=8787,base="http://127.0.0.1:"+port;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const server=spawn(process.execPath,[path.join(root,"tests","serveur.mjs")],{env:{...process.env,PORT:String(port)},stdio:"ignore"});
let browser;
try {
  // Le serveur de test construit une table déterministe de 6 Mo au démarrage.
  let ready=false;
  for(let i=0;i<60;i++){try{const r=await fetch(base+"/index.html");if(r.ok){ready=true;break}}catch(_){}await sleep(250)}
  assert.ok(ready,"serveur de test démarré");
  const pathChrome=process.env.CHROME||"/usr/bin/google-chrome";
  browser=await chromium.launch({headless:true,executablePath:fs.existsSync(pathChrome)?pathChrome:undefined,
    args:["--enable-unsafe-swiftshader","--use-angle=swiftshader","--ignore-gpu-blocklist","--autoplay-policy=no-user-gesture-required"]});
  const page=await browser.newPage({viewport:{width:430,height:932},deviceScaleFactor:3});
  const jsErrors=[];page.on("pageerror",e=>jsErrors.push(String(e)));
  await test("la page démarre avec le Directeur IA et son contrôle qualité",async()=>{
    const resp=await page.goto(base+"/index.html",{waitUntil:"domcontentloaded"});
    assert.equal(resp.status(),200);
    await page.waitForFunction(()=>!!window.DIRECTEUR_IA&&!!window.DIRECTEUR_QUALITE&&!!window.MODELS,{timeout:20000});
    const result=await page.evaluate(()=>({correct:typeof DIRECTEUR_IA.planifier==="function"&&typeof DIRECTEUR_QUALITE.evaluer==="function",
      planHidden:document.querySelector("#dirbox").hidden}));
    assert.equal(result.correct,true);assert.equal(result.planHidden,true);
  });
  await test("import photo + analyse réelle + volet de plan discret",async()=>{
    await page.locator("#fp").setInputFiles(path.join(root,"demo","chat-avant.jpg"));
    await page.waitForFunction(()=>mode==="photo"&&!!PHOTO.last&&!!window.__dirplan,{timeout:25000});
    const p=await page.evaluate(()=>({mode,plan:window.__dirplan,hidden:document.querySelector("#dirbox").hidden,
      text:document.querySelector("#dirsummary").textContent}));
    assert.equal(p.mode,"photo");assert.ok(p.plan.operations.length>=2);
    assert.equal(p.hidden,false);assert.match(p.text,/Directeur IA/);
    assert.ok(p.plan.operations.every(x=>Number.isFinite(x.intensite)));
  });
  await test("profil manuel préservé lors de la nouvelle analyse",async()=>{
    const r=await page.evaluate(()=>{
      PROF.set("naturel",true);
      PHOTO.analyze();
      return {id:PROF.id,manual:PROF.manual,plan:!!window.__dirplan};
    });
    assert.equal(r.id,"naturel");assert.equal(r.manual,true);assert.equal(r.plan,true);
  });
  await test("export local photo : résultat lisible et comparaison technique",async()=>{
    await page.evaluate(()=>{const o=document.querySelector("#o_max");o.checked=false;o.dispatchEvent(new Event("change"))});
    await page.locator("#ex").click();
    await page.waitForFunction(()=>!exporting&&/Terminé !/.test(document.querySelector("#st1").textContent),{timeout:120000});
    const r=await page.evaluate(()=>({type:outBlob&&outBlob.type,size:outBlob&&outBlob.size,quality:window.__dirqualite,report:document.querySelector("#orep_l").textContent}));
    assert.ok(r.size>1000,"sortie photo non vide");assert.ok(/image\//.test(r.type));
    assert.ok(r.quality&&r.quality.compte.compare>0,"contrôle technique photographique déclenché");
    assert.match(r.report,/Comparatif|comparatif/i);
  });
  await test("aucune erreur JavaScript non gérée pendant le parcours",async()=>{
    assert.deepEqual(jsErrors,[]);
  });
} finally {
  if(browser)await browser.close();
  server.kill("SIGTERM");
}
