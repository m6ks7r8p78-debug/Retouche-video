/* Contrat : la page dédiée ne doit jamais retomber sur sr.bin.
   Médias et modèles de test exclusivement synthétiques. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = await import(process.env.PW || 'playwright');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const port=8917;
const server=spawn(process.execPath,['tests/serveur.mjs'],{cwd:root,env:{...process.env,PORT:String(port)},stdio:'ignore'});
let browser;
try{
  const address='http://127.0.0.1:'+port+'/essai-iphone-v2.html';
  let ok=false;
  for(let i=0;i<50;i++){
    try{const r=await fetch(address);if(r.ok){ok=true;break}}catch{}
    await new Promise(resolve=>setTimeout(resolve,200));
  }
  assert.ok(ok,'Serveur de prévisualisation indisponible');
  browser=await chromium.launch({
    headless:true,
    executablePath:process.env.CHROME||undefined,
    args:['--use-angle=swiftshader','--enable-unsafe-swiftshader'],
  });
  const ctx=await browser.newContext({viewport:{width:430,height:932},isMobile:true,hasTouch:true});
  const page=await ctx.newPage(),errors=[],posts=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(r.method()!=='GET')posts.push(r.method()+' '+r.url())});
  await page.goto(address,{waitUntil:'domcontentloaded'});
  assert.ok(await page.locator('#go').isEnabled(),'V2 : Restaurer ne peut jamais être grisé au chargement');
  assert.match(await page.locator('h1').innerText(),/nouveau modèle privé/i);
  assert.match(await page.locator('#activeModel').innerText(),/MODE PILOTE/);
  assert.ok(await page.locator('#pilotModeNotice').isVisible());
  assert.ok(await page.locator('#go').isEnabled(),'Le bouton doit être disponible et ouvrir les fichiers selon le contexte');
  assert.equal(await page.locator('#factor').inputValue(),'2');
  assert.ok(await page.locator('#factor option[value="4"]').isDisabled());
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Pas de scroll horizontal');

  const jpeg=await page.evaluate(()=>{
    const c=document.createElement('canvas');c.width=c.height=224;
    const x=c.getContext('2d');
    const g=x.createLinearGradient(0,0,224,224);g.addColorStop(0,'#123');g.addColorStop(1,'#edd');
    x.fillStyle=g;x.fillRect(0,0,224,224);
    for(let k=0;k<40;k++){x.fillStyle=k%2?'#433':'#fab';x.fillRect(k*6,18,2,160)}
    return c.toDataURL('image/jpeg',.15).split(',')[1];
  });
  await page.locator('#file').setInputFiles({
    name:'source-synthetique.jpg',mimeType:'image/jpeg',buffer:Buffer.from(jpeg,'base64')
  });
  await page.waitForFunction(()=>!document.querySelector('#source').hidden,{},{timeout:20000});
  assert.ok(await page.locator('#go').isEnabled(),'Une photo chargée doit permettre de démarrer le parcours pilote');
  assert.match(await page.locator('#status').innerText(),/Touche Restaurer pour choisir le fichier .bin/);

  // Vérifie que le vrai bouton ouvre le sélecteur des Fichiers iPhone.
  const fc=page.waitForEvent('filechooser',{timeout:20000});
  await page.locator('#go').click();
  const chooser=await fc;
  assert.ok(chooser.isMultiple()===false);
  await chooser.setFiles({
    name:'faux-pilote.bin',
    mimeType:'application/octet-stream',
    buffer:Buffer.alloc(24192)
  });
  await page.waitForFunction(()=>/Empreinte incompatible/.test(document.querySelector('#status').textContent),null,{timeout:15000});
  assert.ok(await page.locator('#go').isEnabled(),'Le bouton reste utilisable pour sélectionner un autre fichier');
  assert.match(await page.locator('#activeModel').innerText(),/MODE PILOTE/);
  assert.ok(await page.locator('#result').isHidden(),'Aucune fausse sortie de restauration');

  await page.locator('#pilotBin').setInputFiles({
    name:'faux-taille.bin',mimeType:'application/octet-stream',buffer:Buffer.alloc(16)
  });
  assert.match(await page.locator('#status').innerText(),/Poids non compatibles/);
  assert.ok(await page.locator('#go').isEnabled());
  // Après rejet d'un poids invalide, Restaurer doit rouvrir immédiatement Fichiers.
  const retry=page.waitForEvent('filechooser',{timeout:20000});
  await page.locator('#go').click();
  const retryPicker=await retry;
  await retryPicker.setFiles({name:'encore-invalide.bin',mimeType:'application/octet-stream',buffer:Buffer.alloc(32)});
  assert.match(await page.locator('#status').innerText(),/Poids non compatibles/);
  assert.ok(await page.locator('#result').isHidden());
  assert.deepEqual(posts,[],'Aucune requête POST de média ou modèle');
  assert.deepEqual(errors,[],'Erreur JS dans le mode pilote exclusif');
  console.log('PILOTE_EXCLUSIF_PASS',{
    requirePrivateBin:true,blockedOnEmpty:true,blockedOnWrongSHA:true,blockedOnWrongSize:true,
    sourceSynthetic:true,noUserFiles:true,networkPosts:posts.length
  });
  await ctx.close();
}finally{
  if(browser)await browser.close();
  server.kill('SIGTERM');
}