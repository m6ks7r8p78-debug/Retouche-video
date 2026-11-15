/** Film Studio v0.5 — véritable test WebKit (moteur Safari), sur Linux.
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
 await page.goto(origin+'/studio-3d/film-studio-v05.html',{waitUntil:'load'});
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
 assert.equal(await page.locator('#download').isVisible(),true);
 assert.match(await page.locator('#download').getAttribute('href'),/^blob:/);
 const initial=await page.locator('#view').screenshot();
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
 const screenshot='test-results/film-studio-v05-webkit-'+label+'.png';
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
 await page.getByRole('button',{name:/Lire/}).click();
 await page.waitForTimeout(120);
 await page.getByRole('button',{name:/Lire/}).click();
 await page.locator('#prompt').fill('Une femme boit puis parle.');
 await page.getByRole('button',{name:'Créer mon animation 3D'}).click();
 assert.equal(await page.locator('#download').isVisible(),false);
 assert.equal(await page.locator('#download').getAttribute('href'),null);
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
 const context=await browser.newContext({viewport:{width:390,height:844},
  deviceScaleFactor:2,hasTouch:true});
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
