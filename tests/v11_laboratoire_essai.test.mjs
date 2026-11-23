/* Laboratoire local de restauration : vrai SR et interface iPhone via Chrome.
 * Tout média utilisé est synthétique. Ne prouve pas la performance Safari physique. */
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import path from "node:path";
import {fileURLToPath} from "node:url";
const {chromium}=await import(process.env.PW||"playwright");
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const PORT=8899,server=spawn(process.execPath,["tests/serveur.mjs"],{cwd:ROOT,env:{...process.env,PORT:String(PORT)},stdio:"ignore"});
let browser;
try{
  const url="http://127.0.0.1:"+PORT+"/essai-restauration.html";
  let ready=false;
  for(let i=0;i<50;i++){try{if((await fetch(url)).ok){ready=true;break}}catch(e){}await new Promise(r=>setTimeout(r,150))}
  assert.ok(ready,"Serveur du laboratoire inaccessible");
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROME||undefined,args:["--use-angle=swiftshader","--enable-unsafe-swiftshader"]});
  const ctx=await browser.newContext({viewport:{width:430,height:932},isMobile:true,hasTouch:true,acceptDownloads:true});
  const page=await ctx.newPage(),errors=[],posts=[];
  page.on("pageerror",e=>errors.push(e.message));
  page.on("request",r=>{if(r.method()!=="GET")posts.push(r.method()+" "+r.url())});
  await page.goto(url,{waitUntil:"domcontentloaded"});
  await page.waitForFunction(()=>typeof window.SR?.run==="function");
  assert.ok(await page.getByText("La restauration,").count()>=1);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),"Défilement horizontal iPhone");
  const jpeg=await page.evaluate(()=>{
    const c=document.createElement("canvas");c.width=c.height=204;
    const x=c.getContext("2d"),grad=x.createLinearGradient(0,0,204,204);
    grad.addColorStop(0,"#1b2f40");grad.addColorStop(.5,"#e1cda5");grad.addColorStop(1,"#4c3545");
    x.fillStyle=grad;x.fillRect(0,0,204,204);
    for(let n=0;n<26;n++){x.fillStyle=n%2?"#e7b26a":"#253b5e";x.fillRect(n*8,20+(n%3)*8,5,124)}
    x.fillStyle="#fff";x.font="20px sans-serif";x.fillText("1999",30,180);
    return c.toDataURL("image/jpeg",.12).split(",")[1];
  });
  await page.locator("#file").setInputFiles({name:"photo-compressee.jpg",mimeType:"image/jpeg",buffer:Buffer.from(jpeg,"base64")});
  await page.waitForFunction(()=>!document.querySelector("#source").hidden);
  await page.locator("#factor").selectOption("2");
  const start=Date.now();await page.locator("#go").click();
  await page.waitForFunction(()=>!document.querySelector("#result").hidden,null,{timeout:120000});
  const output=await page.evaluate(()=>({
    report:JSON.parse(document.querySelector("#report").value),
    status:document.querySelector("#status").textContent,
    hasAfter:document.querySelector("#after").src.startsWith("data:image/png"),
    hasBefore:document.querySelector("#before").src.startsWith("data:image/png"),
    hasDownload:!document.querySelector("#download").hidden,
    w:document.documentElement.scrollWidth, viewport:innerWidth
  }));
  assert.ok(output.hasBefore&&output.hasAfter&&output.hasDownload,"Pas de comparaison réelle");
  assert.ok(output.report.ecart_rgb_sur_255>.1,"Aucun écart de pixels neuronal mesurable");
  assert.ok(output.report.duree_s>0,"Durée de réseau absente");
  assert.equal(output.report.modele,"sr.bin");
  assert.equal(output.report.zone,"204×204");
  assert.equal(output.report.sortie,"408×408");
  await page.locator('[data-grade="Identique"]').click();
  assert.match(await page.locator("#report").inputValue(),/Identique/);
  const dl=page.waitForEvent("download",{timeout:15000});
  await page.locator("#download").click();
  const got=await dl;assert.ok(got.suggestedFilename().endsWith(".png"));
  assert.deepEqual(posts,[],"Un média a été envoyé par une requête non GET");
  assert.deepEqual(errors,[],"Erreurs du navigateur: "+errors.join("; "));
  console.log("LABORATOIRE_PASS",JSON.stringify({elapsedSec:((Date.now()-start)/1000).toFixed(2),output:output.report,networkPosts:posts.length}));
  await ctx.close();
}finally{
  if(browser)await browser.close();
  server.kill("SIGTERM");
}