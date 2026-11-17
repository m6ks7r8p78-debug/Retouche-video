/** Film Studio v0.9 — test Chromium réel (images synthétiques uniquement).
 * Aucune dépendance externe dans l'application testée, un serveur local éphémère.
 */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,join,sep} from 'node:path';
import {chromium} from 'playwright';
import {readSyntheticGLB} from './film-viewer-v03.mjs';

const root=resolve('studio-3d');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
 '.mjs':'text/javascript; charset=utf-8'};
const server=createServer(async(req,res)=>{
 try{
  const path=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
  if(!path.startsWith('/studio-3d/'))throw Error('Non autorisé');
  const relative=path.slice('/studio-3d/'.length);
  const full=resolve(root,relative);
  if(!full.startsWith(root+sep))throw Error('Chemin non autorisé');
  const ext=relative.slice(relative.lastIndexOf('.'));
  if(!types[ext])throw Error('Format non autorisé');
  const data=await readFile(full);
  res.writeHead(200,{'Content-Type':types[ext],'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'});
  res.end(data);
 }catch{
  res.writeHead(404,{'Content-Type':'text/plain'});res.end('Introuvable');
 }
});
let browser=null,port;
try{
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 port=server.address().port;
 browser=await chromium.launch({
  headless:true,
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader',
   '--enable-webgl','--disable-background-timer-throttling']
 });
 const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,hasTouch:true});
 const errors=[];
 const page=await context.newPage();
 page.on('pageerror',e=>errors.push(e.message));
 const origin='http://127.0.0.1:'+port;
 await page.route('**/*',route=>new URL(route.request().url()).origin===origin?
  route.continue():route.abort());
 await page.goto(origin+'/studio-3d/film-studio-v09.html',{waitUntil:'load'});
 assert.equal(await page.locator('#view').getAttribute('data-renderer'),'webgl2',
  'L’environnement Chromium doit rendre via WebGL2 et non son repli 2D.');
 await page.getByRole('button',{name:'Créer mon animation 3D'}).click();
 const status=await page.locator('#status').innerText();
 assert.match(status,/Rendu WebGL2 des maillages disponible/);
 assert.match(status,/Cinq doigts articulés/);
 assert.match(status,/écart assise/);
 assert.equal(await page.locator('#download').isVisible(),true);
 const [glbDownload]=await Promise.all([
  page.waitForEvent('download'),
  page.locator('#download').click()
 ]);
 assert.equal(glbDownload.suggestedFilename(),'retoucheproai-film-studio-v09.glb');
 const bytes=new Uint8Array(await readFile(await glbDownload.path()));
 const encoded=readSyntheticGLB(bytes);
 const visibleFingers=encoded.doc.nodes.filter(n=>/^film_doigt_.*_bout$/.test(n.name));
 assert.equal(visibleFingers.length,5,'Le fichier téléchargé doit contenir cinq bouts de doigts.');
 assert.equal(encoded.doc.nodes.filter(n=>n.name==='tasse_unique_mobile').length,1);
 assert.ok(encoded.clips[0].tracks.filter(t=>encoded.doc.nodes[t.node].name.startsWith('film_doigt_')).length>=10);

 const initial=await page.locator('#view').screenshot();
 const metrics=await page.evaluate(()=>{
  const canvas=document.querySelector('#view'),gl=canvas.getContext('webgl2');
  const pixels=new Uint8Array(canvas.width*canvas.height*4);
  gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
  let foreground=0;
  for(let i=0;i<pixels.length;i+=4){
   if(Math.abs(pixels[i]-15)+Math.abs(pixels[i+1]-20)+Math.abs(pixels[i+2]-32)>45)foreground++;
  }
  return {foreground,error:gl.getError(),width:canvas.width,height:canvas.height};
 });
 assert.ok(metrics.foreground>1000,'Aucun maillage visible dans le tampon WebGL : '+JSON.stringify(metrics));
 assert.equal(metrics.error,0,'Erreur de rendu WebGL');
 await page.locator('#seek').evaluate(input=>{input.value='675';input.dispatchEvent(new Event('input',{bubbles:true}));});
 const next=await page.locator('#view').screenshot();
 assert.equal(initial.equals(next),false,'La chronologie ne change pas les images WebGL.');
 const area=await page.locator('#view').boundingBox();
 await page.mouse.move(area.x+area.width*.5,area.y+area.height*.5);
 await page.mouse.down();
 await page.mouse.move(area.x+area.width*.7,area.y+area.height*.5,{steps:5});
 await page.mouse.up();
 const rotated=await page.locator('#view').screenshot();
 assert.equal(next.equals(rotated),false,'La rotation tactile ne change pas la caméra.');
 await mkdir('test-results',{recursive:true});
 await writeFile('test-results/film-studio-v09-chromium.png',rotated);
 await page.locator('#prompt').fill('Une femme boit puis parle.');
 await page.getByRole('button',{name:'Créer mon animation 3D'}).click();
 assert.equal(await page.locator('#download').isVisible(),false);
 assert.equal(await page.locator('#download').getAttribute('href'),null);
 assert.match(await page.locator('#status').innerText(),/aucune animation 3D/);
 assert.deepEqual(errors,[],'Erreurs JavaScript du navigateur');
 console.log(JSON.stringify({result:'PASS',backend:'webgl2',foregroundPixels:metrics.foreground,
  pixelSize:[metrics.width,metrics.height],checks:['mesh','five-fingers-export','timeline','rotation','download','refusal','no-page-error']}));
 await context.close();
}finally{
 if(browser)await browser.close();
 await new Promise(ok=>server.close(ok));
}
