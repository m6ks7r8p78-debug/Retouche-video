/** Film Studio v0.20 — véritable test WebKit (moteur Safari), sur Linux.
 * Deux parcours : WebKit standard + repli forcé si échec des shaders WebGL2.
 * L'app est strictement locale et ne reçoit aucune photo, voix ou vidéo privée.
 */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {webkit} from 'playwright';

const root=resolve('studio-3d');
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://127.0.0.1');
  const path=decodeURIComponent(url.pathname);
  if(!path.startsWith('/studio-3d/'))throw Error('Chemin refusé');
  const rel=path.slice('/studio-3d/'.length),file=resolve(root,rel);
  if(!file.startsWith(root+sep))throw Error('Sortie du dépôt');
  const ext=rel.slice(rel.lastIndexOf('.'));
  const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
    '.mjs':'text/javascript; charset=utf-8'}[ext];
  if(!mime)throw Error('Type refusé');
  res.writeHead(200,{'Content-Type':mime,'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'});
  res.end(await readFile(file));
 }catch{
  res.writeHead(404,{'Content-Type':'text/plain'});res.end('Introuvable');
 }
});
let browser;
const report=[];
async function run(page,label,origin){
 const errors=[],external=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',route=>{
  if(new URL(route.request().url()).origin===origin)return route.continue();
  external.push(route.request().url());return route.abort();
 });
 await page.goto(origin+'/studio-3d/film-studio-v20.html',{waitUntil:'load'});
 const backend=await page.locator('#view').getAttribute('data-renderer');
 assert.ok(['webgl2','canvas2d'].includes(backend),'WebKit sans aucun aperçu : '+backend);
 const information=await page.locator('#backend').innerText();
 if(backend==='webgl2')assert.match(information,/Rendu WebGL2 réel/);
 else assert.match(information,/Repli Canvas 2D/);
 const overflow=await page.evaluate(()=>({
   innerWidth,scrollWidth:document.documentElement.scrollWidth,
   devicePixelRatio,renderer:document.querySelector('#view').dataset.renderer
 }));
 assert.ok(overflow.scrollWidth<=overflow.innerWidth+2,'Débordement horizontal sous WebKit : '+JSON.stringify(overflow));
 await page.getByRole('button',{name:'Créer mon animation 3D'}).click();
 const status=await page.locator('#status').innerText();
 assert.match(status,/GLB animé créé localement/);
 assert.match(status,/Audit cinématique 120 Hz/);
 assert.match(status,/Cinq doigts articulés/);
 assert.match(status,/Anse ajourée de 12 segments/);
 assert.match(status,/Paume réalignée/);
 assert.match(status,/Jonction poignet–paume : un seul maillage triangulé fermé/);
 assert.match(status,/Manchette déformable sur 2 zones/);
 assert.match(status,/écart assise/);
 assert.equal(await page.locator('#download').isVisible(),true);
 assert.match(await page.locator('#download').getAttribute('href'),/^blob:/);
 assert.equal(await page.locator('#shareGlb').isVisible(),true);
 await page.locator('#shareGlb').click();
 await page.waitForFunction(()=>window.__shareEvents.length===1);
 let shares=await page.evaluate(()=>window.__shareEvents);
 assert.match(shares[0].name,/film-studio-v20\.glb$/);
 assert.equal(shares[0].type,'model/gltf-binary');
 assert.ok(shares[0].size>1000);
 assert.match(await page.locator('#shareStatus').innerText(),/Aucun enregistrement n’est certifié/);

 // Test diagnostic réel par rAF : aucune information d'identité ou de prompt.
 await page.locator('#runDiagnostic').click();
 await page.locator('#saveDiagnostic').waitFor({state:'visible',timeout:25000});
 const [diagnosticDownload]=await Promise.all([
   page.waitForEvent('download'),
   page.locator('#saveDiagnostic').click()
 ]);
 assert.match(diagnosticDownload.suggestedFilename(),/diagnostic-v20\.json$/);
 const diagnostic=JSON.parse(await readFile(await diagnosticDownload.path(),'utf8'));
 assert.equal(diagnostic.schema,'retoucheproai.film-studio.device-diagnostic.v0.6');
 assert.equal(diagnostic.validation.physicalIPhoneCertified,false);
 assert.equal(diagnostic.validation.memoryMeasured,false);
 assert.equal(diagnostic.privacy.userPromptIncluded,false);
 assert.equal(diagnostic.privacy.userAgentIncluded,false);
 assert.equal(diagnostic.privacy.sentToServer,false);
 assert.equal(await page.locator('#shareDiagnostic').isVisible(),true);
 await page.locator('#shareDiagnostic').click();
 await page.waitForFunction(()=>window.__shareEvents.length===2);
 shares=await page.evaluate(()=>window.__shareEvents);
 assert.match(shares[1].name,/diagnostic-v20\.json$/);
 assert.equal(shares[1].type,'application/json');
 assert.ok(shares[1].size>100);

 assert.ok(diagnostic.cadence.frameSamples>=80);
 assert.ok(diagnostic.cadence.effectiveFps>0);
 assert.ok(diagnostic.cadence.p95FrameMs>0);
 assert.equal(diagnostic.backend,backend);
 const reportString=JSON.stringify(diagnostic);
 for(const privateField of ['Une femme','longitude','latitude','serialNumber','Mozilla/5.0']){
   assert.ok(!reportString.includes(privateField),'Contenu sensible dans le rapport : '+privateField);
 }

 const initial=await page.locator('#view').screenshot();
 await page.locator('#focusHand').click();
 assert.equal(await page.locator('#view').getAttribute('data-view-mode'),'main');
 const focused=await page.locator('#view').screenshot();
 assert.equal(initial.equals(focused),false,'Gros plan non dessiné dans WebKit '+backend);
 assert.equal(await page.locator('#focusHand').getAttribute('aria-pressed'),'true');
 await page.locator('#seek').evaluate(input=>{
   input.value='610';input.dispatchEvent(new Event('input',{bubbles:true}));
 });
 const tracked=await page.locator('#view').screenshot();
 assert.equal(focused.equals(tracked),false,'Le suivi de la tasse ne change pas de vue.');
 await mkdir('test-results',{recursive:true});
 await writeFile('test-results/film-studio-v20-webkit-hand-'+label+'.png',tracked);
 await page.locator('#focusHand').click();
 assert.equal(await page.locator('#view').getAttribute('data-view-mode'),'scene');
 assert.equal(await page.locator('#focusHand').getAttribute('aria-pressed'),'false');
 const pixels=await page.evaluate(()=>{
  const canvas=document.querySelector('#view'),kind=canvas.dataset.renderer;
  let image;
  if(kind==='webgl2'){
    const gl=canvas.getContext('webgl2');
    image=new Uint8Array(canvas.width*canvas.height*4);
    gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,image);
    if(gl.getError()!==gl.NO_ERROR)throw Error('WebGL signale une erreur de rendu');
  }else{
    image=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
  }
  let foreground=0;
  for(let i=0;i<image.length;i+=4)
    if(Math.abs(image[i]-15)+Math.abs(image[i+1]-20)+Math.abs(image[i+2]-32)>48)foreground++;
  return {foreground,width:canvas.width,height:canvas.height};
 });
 assert.ok(pixels.foreground>300,'Scène vide dans WebKit : '+JSON.stringify(pixels));
 await page.locator('#seek').evaluate(input=>{
  input.value='700';input.dispatchEvent(new Event('input',{bubbles:true}));
 });
 const later=await page.locator('#view').screenshot();
 assert.equal(initial.equals(later),false,'Aucun mouvement visuel pendant le scénario');
 await page.locator('#view').evaluate(canvas=>{
  const box=canvas.getBoundingClientRect();
  const send=(name,x,y)=>canvas.dispatchEvent(new PointerEvent(name,{
   bubbles:true,cancelable:true,pointerType:'touch',pointerId:77,
   clientX:box.x+x,clientY:box.y+y
  }));
  send('pointerdown',box.width*.35,box.height*.3);
  send('pointermove',box.width*.72,box.height*.3);
  send('pointerup',box.width*.72,box.height*.3);
 });
 const turned=await page.locator('#view').screenshot();
 assert.equal(later.equals(turned),false,'Le glissement tactile ne change pas la caméra');
 await mkdir('test-results',{recursive:true});
 const screenshot='test-results/film-studio-v20-webkit-'+label+'.png';
 await writeFile(screenshot,turned);

 // Un retour depuis le cache Safari ne doit pas détruire le lien blob courant.
 await page.evaluate(()=>{
  window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));
  window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));
 });
 assert.equal(await page.locator('#download').isVisible(),true);
 assert.match(await page.locator('#download').getAttribute('href'),/^blob:/);

 await page.setViewportSize({width:844,height:390});
 const wide=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
 assert.ok(wide.scroll<=wide.width+2,'Débordement après rotation paysage : '+JSON.stringify(wide));
 await page.locator('#play').click();
 await page.waitForTimeout(120);
 await page.locator('#play').click();

 // Action répétée sous WebKit WebGL2 ET sous Canvas 2D de secours.
 await page.locator('#prompt').fill('Une femme adulte fume trois taffes de cigarette.');
 await page.getByRole('button',{name:'Créer mon animation 3D'}).click();
 assert.match(await page.locator('#status').innerText(),/3 gestes distincts/);
 assert.match(await page.locator('#status').innerText(),/Cible filtre–lèvres suivie/);
 assert.match(await page.locator('#status').innerText(),/Cigarette à corps cylindrique fermé et filtre visible/);
 assert.equal(await page.locator('#focusHand').isEnabled(),true);
 const smokeWide=await page.locator('#view').screenshot();
 await page.locator('#focusHand').click();
 assert.equal(await page.locator('#view').getAttribute('data-view-mode'),'main');
 assert.equal(await page.locator('#focusHand').getAttribute('aria-pressed'),'true');
 assert.match(await page.locator('#focusInfo').innerText(),/caméra suit la cigarette et la main/);
 const smokeClose=await page.locator('#view').screenshot();
 assert.equal(smokeWide.equals(smokeClose),false,'Le gros plan doit montrer la cigarette.');
 await mkdir('test-results',{recursive:true});
 await writeFile('test-results/film-studio-v20-webkit-'+label+'-cigarette-closeup.png',smokeClose);
 await page.locator('#seek').evaluate(e=>{
  e.value='280';e.dispatchEvent(new Event('input',{bubbles:true}));
 });
 const smokeFollow=await page.locator('#view').screenshot();
 assert.equal(smokeClose.equals(smokeFollow),false,'Le gros plan doit suivre la cigarette animée.');
 await page.locator('#focusHand').click();
 assert.equal(await page.locator('#view').getAttribute('data-view-mode'),'scene');
 assert.equal(await page.locator('#focusHand').getAttribute('aria-pressed'),'false');
 assert.equal(await page.locator('#download').isVisible(),true);
 const [smokeFile]=await Promise.all([
  page.waitForEvent('download'),
  page.locator('#download').click()
 ]);
 assert.equal(smokeFile.suggestedFilename(),'retoucheproai-film-studio-v20.glb');
 const smokingBytes=new Uint8Array(await readFile(await smokeFile.path()));
 assert.ok(smokingBytes.length>1000);
 await page.locator('#seek').evaluate(e=>{
  e.value='280';e.dispatchEvent(new Event('input',{bubbles:true}));
 });
 const beforeSmoke=await page.locator('#view').screenshot();
 await page.locator('#seek').evaluate(e=>{
  e.value='350';e.dispatchEvent(new Event('input',{bubbles:true}));
 });
 const afterSmoke=await page.locator('#view').screenshot();
 assert.equal(beforeSmoke.equals(afterSmoke),false,'La cigarette doit être animée même en mode de secours.');
 await page.locator('#prompt').fill('Une femme boit puis parle.');
 await page.getByRole('button',{name:'Créer mon animation 3D'}).click();
 assert.equal(await page.locator('#download').isVisible(),false);
 assert.equal(await page.locator('#download').getAttribute('href'),null);
 assert.equal(await page.locator('#saveDiagnostic').isVisible(),false);
 assert.equal(await page.locator('#runDiagnostic').isEnabled(),false);
 assert.equal(await page.locator('#shareGlb').isVisible(),false);
 assert.equal(await page.locator('#shareDiagnostic').isVisible(),false);
 assert.equal(await page.locator('#focusHand').isEnabled(),false);

 assert.match(await page.locator('#status').innerText(),/aucune animation 3D/);
 assert.deepEqual(errors,[],'Erreurs JS WebKit');
 assert.deepEqual(external,[],'Ressources ou requêtes externes inattendues');
 report.push({label,backend,foreground:pixels.foreground,pixelSize:[pixels.width,pixels.height],
   touch:true,orientation:true,blobSafety:true,errors:errors.length});
}
try{
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 const origin='http://127.0.0.1:'+server.address().port;
 browser=await webkit.launch({headless:true});
 const shareStub=()=>{
  Object.defineProperty(navigator,'canShare',{configurable:true,value:({files})=>files?.length===1});
  Object.defineProperty(navigator,'share',{configurable:true,value:async({files})=>{
   if(files?.length!==1)throw Error('Un seul fichier doit être partagé.');
   const file=files[0];
   window.__shareEvents.push({name:file.name,type:file.type,size:file.size});
  }});
  window.__shareEvents=[];
 };
 const context=await browser.newContext({viewport:{width:390,height:844},
  deviceScaleFactor:2,hasTouch:true});
 await context.addInitScript(shareStub);
 const page=await context.newPage();
 await run(page,'standard',origin);
 await context.close();
 // Échec de compilation de shader : vérifier qu'un Canvas neuf permet le secours 2D.
 const fallbackContext=await browser.newContext({viewport:{width:390,height:844},
  deviceScaleFactor:2,hasTouch:true});
 await fallbackContext.addInitScript(()=>{
  if(globalThis.WebGL2RenderingContext){
   WebGL2RenderingContext.prototype.createShader=function(){return null;};
  }
 });
 await fallbackContext.addInitScript(shareStub);
 const fallback=await fallbackContext.newPage();
 await run(fallback,'forced-fallback',origin);
 const alternate=report[1].backend;
 assert.equal(alternate,'canvas2d','Le refus des shaders doit donner un secours 2D');
 await fallbackContext.close();
 console.log(JSON.stringify({result:'PASS',engine:'webkit',report}));
}finally{
 if(browser)await browser.close();
 await new Promise(ok=>server.close(ok));
}
