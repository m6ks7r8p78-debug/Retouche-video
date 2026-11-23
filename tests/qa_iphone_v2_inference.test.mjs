/* Validation du vrai parcours IA V2 (sans médias personnels).
   Le fichier .bin de test est entièrement synthétique et la substitution SHA
   est réalisée sur un HTML local éphémère, JAMAIS sur le site public. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
const {chromium}=await import(process.env.PW||"playwright");
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const temp=path.join(root,"essai-iphone-v2-qa-SYNTHETIQUE-NON-PUBLIE.html");
const source=fs.readFileSync(path.join(root,"essai-iphone-v2.html"),"utf8");
const known="ed7cec236488ed666fbc971ac348c378d33a2767a9b5007b295a6ed58963932d";
const weights=Buffer.alloc(24192);
const fakeHash=createHash("sha256").update(weights).digest("hex");
assert.equal(source.split(known).length,2,"Une empreinte officielle unique attendue");
const simulated=source.replace(known,fakeHash);
fs.writeFileSync(temp,simulated,"utf8");
const port=8918;
const server=spawn(process.execPath,["tests/serveur.mjs"],{cwd:root,env:{...process.env,PORT:String(port)},stdio:"ignore"});
let browser;
try{
  const address="http://127.0.0.1:"+port+"/"+path.basename(temp);
  let ready=false;
  for(let i=0;i<50;i++){try{if((await fetch(address)).ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,150));}
  assert.ok(ready,"QA serveur inaccessible");
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROME||undefined,args:["--use-angle=swiftshader","--enable-unsafe-swiftshader"]});
  const ctx=await browser.newContext({viewport:{width:430,height:932},isMobile:true,hasTouch:true,acceptDownloads:true});
  const page=await ctx.newPage();
  const posts=[],errors=[];
  page.on("request",r=>{if(r.method()!=="GET")posts.push(r.method()+" "+r.url())});
  page.on("pageerror",e=>errors.push(e.message));
  await page.goto(address,{waitUntil:"domcontentloaded"});
  await page.waitForFunction(()=>typeof window.SR?.run==="function",null,{timeout:15000});
  assert.ok(await page.locator("#go").isEnabled(),"Restaurer doit être cliquable même sans vidéo");
  const jpeg=await page.evaluate(()=>{
    const c=document.createElement("canvas");c.width=c.height=160;
    const x=c.getContext("2d"),g=x.createLinearGradient(0,0,160,160);
    g.addColorStop(0,"#132733");g.addColorStop(1,"#edd69a");
    x.fillStyle=g;x.fillRect(0,0,160,160);
    for(let k=0;k<20;k++){x.fillStyle=k%2?"#a22":"#1bc";x.fillRect(3+7*k,16+k%4,3,100)}
    return c.toDataURL("image/jpeg",.22).split(",")[1];
  });
  // Clic sur Restaurer SANS média : ouvre Fichiers au lieu de rester gris.
  const firstPicker=page.waitForEvent("filechooser",{timeout:15000});
  await page.locator("#go").click();
  const first=await firstPicker;
  await first.setFiles({name:"photo-synthetique.jpg",mimeType:"image/jpeg",buffer:Buffer.from(jpeg,"base64")});
  await page.waitForFunction(()=>!document.querySelector("#source").hidden,null,{timeout:15000});
  assert.ok(await page.locator("#go").isEnabled(),"Le bouton doit rester actif après le chargement du média");
  assert.match(await page.locator("#activeModel").innerText(),/MODE PILOTE/);
  // Deuxième clic : charge UNIQUEMENT les poids privés (remplacés ici
  // par des zéros dans la copie locale éphémère, jamais sur le site public).
  const secondPicker=page.waitForEvent("filechooser",{timeout:15000});
  await page.locator("#go").click();
  const second=await secondPicker;
  const started=Date.now();
  await second.setFiles({name:"POIDS-DE-TEST-SYNTHETIQUES.bin",mimeType:"application/octet-stream",buffer:weights});
  await page.waitForFunction(()=>!document.querySelector("#result").hidden,null,{timeout:180000});
  const result=JSON.parse(await page.locator("#report").inputValue());
  assert.match(result.modele,/pilote privé 5 vidéos/);
  assert.equal(result.mode_essai,"pilote_prive_exclusif");
  assert.equal(result.reference,"sr.bin");
  assert.equal(result.sortie,"320×320");
  assert.equal(result.moteur,"gl");
  assert.ok(result.duree_s>0);
  assert.ok(await page.locator("#go").isEnabled());
  assert.deepEqual(posts,[],"Aucun upload de média/poids");
  assert.deepEqual(errors,[],"Erreur JavaScript au chargement ou traitement");
  console.log("PILOTE_V2_INFERENCE_PASS",JSON.stringify({mode:"synthetic test weights ONLY",elapsedSec:((Date.now()-started)/1000).toFixed(2),result,posts:0}));
  await ctx.close();
}finally{
  if(browser)await browser.close();
  server.kill("SIGTERM");
  try{fs.unlinkSync(temp)}catch{}
}