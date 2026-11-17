/** Film Studio v0.20 — test Chromium réel (images synthétiques uniquement).
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
 await page.goto(origin+'/studio-3d/film-studio-v20.html',{waitUntil:'load'});
 assert.equal(await page.locator('#view').getAttribute('data-renderer'),'webgl2',
  'L’environnement Chromium doit rendre via WebGL2 et non son repli 2D.');
 await page.getByRole('button',{name:'Créer mon animation 3D'}).click();
 const status=await page.locator('#status').innerText();
 assert.match(status,/Rendu WebGL2 des maillages disponible/);
 assert.match(status,/Cinq doigts articulés/);
 assert.match(status,/Anse ajourée de 12 segments/);
 assert.match(status,/Paume réalignée/);
 assert.match(status,/Jonction poignet–paume : un seul maillage triangulé fermé/);
 assert.match(status,/Manchette déformable sur 2 zones/);
 assert.match(status,/Chevauchement estimé manchette–tasse/);
 assert.match(status,/chevauchement volumique paume–tasse estimé/);
 assert.match(status,/Proximité moyenne maximale doigt–anse/);
 assert.match(status,/écart assise/);
 assert.equal(await page.locator('#download').isVisible(),true);
 const [glbDownload]=await Promise.all([
  page.waitForEvent('download'),
  page.locator('#download').click()
 ]);
 assert.equal(glbDownload.suggestedFilename(),'retoucheproai-film-studio-v20.glb');
 const bytes=new Uint8Array(await readFile(await glbDownload.path()));
 const encoded=readSyntheticGLB(bytes);
 const visibleFingers=encoded.doc.nodes.filter(n=>/^film_doigt_.*_bout$/.test(n.name));
 assert.equal(visibleFingers.length,5,'Le fichier téléchargé doit contenir cinq bouts de doigts.');
 assert.equal(encoded.doc.nodes.filter(n=>n.name==='tasse_unique_mobile').length,1);
 assert.ok(encoded.clips[0].tracks.filter(t=>encoded.doc.nodes[t.node].name.startsWith('film_doigt_')).length>=10);
 assert.equal(encoded.doc.nodes.find(n=>n.name==='tasse_anse_table').mesh,undefined);
 assert.equal(encoded.doc.nodes.filter(n=>n.name.startsWith('film_anse_boucle_')).length,12);
 assert.ok(encoded.doc.nodes.find(n=>n.name==='main_droite').translation[0]>.14);
 assert.equal(encoded.doc.nodes.filter(n=>n.name.startsWith('film_liaison_poignet_paume_')).length,0);
 const cuff=encoded.doc.nodes.find(n=>n.name==='film_manchon_continu_poignet_paume');
 assert.ok(cuff&&cuff.mesh>=0);
 assert.equal(encoded.doc.meshes[cuff.mesh].primitives[0].material,0);
 assert.equal(encoded.doc.meshes[cuff.mesh].primitives[0].targets.length,2);
 assert.ok(encoded.clips[0].tracks.some(t=>t.node===encoded.doc.nodes.indexOf(cuff)&&t.path==='weights'));
 const wrist=encoded.doc.nodes.find(n=>n.name==='poignet_droite');
 assert.ok(wrist.children.includes(encoded.doc.nodes.indexOf(cuff)));

 const initial=await page.locator('#view').screenshot();
 assert.equal(await page.locator('#focusHand').isEnabled(),true);
 await page.locator('#focusHand').click();
 assert.equal(await page.locator('#view').getAttribute('data-view-mode'),'main');
 assert.equal(await page.locator('#focusHand').getAttribute('aria-pressed'),'true');
 assert.match(await page.locator('#focusInfo').innerText(),/caméra suit le récipient/);
 const closeup=await page.locator('#view').screenshot();
 assert.equal(initial.equals(closeup),false,'Le mode inspection doit cadrer réellement la main.');
 await mkdir('test-results',{recursive:true});
 await writeFile('test-results/film-studio-v20-chromium-hand-closeup.png',closeup);
 const focusedBounds=await page.locator('#view').boundingBox();
 const centerX=focusedBounds.x+focusedBounds.width*.5;
 const centerY=focusedBounds.y+focusedBounds.height*.5;
 await page.mouse.move(centerX,centerY);
 await page.mouse.down();
 await page.mouse.move(centerX+130,centerY,{steps:8});
 await page.mouse.up();
 const wristProfile=await page.locator('#view').screenshot();
 assert.equal(wristProfile.equals(closeup),false,'Le cadrage latéral doit dévoiler une autre vue du raccord.');
 await writeFile('test-results/film-studio-v20-chromium-wrist-profile.png',wristProfile);
 // Restituer l'orientation avant la vérification temporelle existante.
 await page.mouse.move(centerX+130,centerY);
 await page.mouse.down();
 await page.mouse.move(centerX,centerY,{steps:8});
 await page.mouse.up();

 await page.locator('#seek').evaluate(input=>{
  input.value='640';input.dispatchEvent(new Event('input',{bubbles:true}));
 });
 const laterCloseup=await page.locator('#view').screenshot();
 assert.equal(closeup.equals(laterCloseup),false,'La caméra détaillée doit suivre le mouvement.');
 await page.locator('#focusHand').click();
 assert.equal(await page.locator('#view').getAttribute('data-view-mode'),'scene');
 assert.equal(await page.locator('#focusHand').getAttribute('aria-pressed'),'false');

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
 await writeFile('test-results/film-studio-v20-chromium.png',rotated);

 // Nouveau moteur d'actions répétées : vraie deuxième création dans la même UI.
 await page.locator('#prompt').fill('Une femme adulte brune fume trois taffes de cigarette.');
 await page.getByRole('button',{name:'Créer mon animation 3D'}).click();
 const smokeStatus=await page.locator('#status').innerText();
 assert.match(smokeStatus,/3 gestes distincts/);
 assert.match(smokeStatus,/cigarette unique/);
 assert.match(smokeStatus,/Cible filtre–lèvres suivie avec écart maximal mesuré/);
 assert.match(smokeStatus,/Cigarette à corps cylindrique fermé et filtre visible/);
 assert.equal(await page.locator('#focusHand').isEnabled(),false);
 assert.equal(await page.locator('#download').isVisible(),true);
 const [smokeDownload]=await Promise.all([
   page.waitForEvent('download'),page.locator('#download').click()
 ]);
 assert.equal(smokeDownload.suggestedFilename(),'retoucheproai-film-studio-v20.glb');
 const smokeBytes=new Uint8Array(await readFile(await smokeDownload.path()));
 const smokingScene=readSyntheticGLB(smokeBytes);
 assert.equal(smokingScene.clips[0].name,'film_actions_v16');
 assert.equal(smokingScene.doc.nodes.filter(n=>n.name==='cigarette_tige').length,1);
 const cigaretteNode=smokingScene.doc.nodes.find(n=>n.name==='cigarette_tige');
 assert.equal(smokingScene.doc.meshes[cigaretteNode.mesh].name,'film_cigarette_cylindre_v20');
 assert.equal(smokingScene.doc.nodes.filter(n=>n.name==='film_filtre_papier_v20').length,1);
 assert.equal(smokingScene.doc.materials.filter(m=>m.name==='filtre_papier_synthetique').length,1);
 assert.equal(smokingScene.doc.nodes.filter(n=>n.name==='film_cigarette_filtre_contact').length,1);
 assert.equal(smokingScene.doc.nodes.filter(n=>n.name==='film_bouche_cible').length,1);
 assert.equal(smokingScene.doc.nodes.filter(n=>/^film_pince_.*_bout$/.test(n.name)).length,5);
 const fingerMesh=smokingScene.doc.meshes.findIndex(m=>m.name==='film_phalange_effilee_v20');
 assert.ok(fingerMesh>=0);
 assert.equal(smokingScene.doc.nodes.filter(n=>/^film_pince_.*_(proximal|bout)$/.test(n.name)).length,10);
 assert.equal(smokingScene.doc.nodes.filter(n=>/^film_pince_.*_(proximal|bout)$/.test(n.name)&&n.mesh===fingerMesh).length,10);
 assert.equal(smokingScene.clips[0].tracks.filter(t=>smokingScene.doc.nodes[t.node].name.startsWith('film_pince_')).length,10);
 const rodId=smokingScene.doc.nodes.findIndex(n=>n.name==='cigarette_tige');
 const gripWrist=smokingScene.doc.nodes.findIndex(n=>n.children?.includes(rodId));
 for(const finger of ['index','majeur']){
   const node=smokingScene.doc.nodes.findIndex(n=>n.name==='film_pince_'+finger+'_pivot');
   assert.ok(smokingScene.doc.nodes[gripWrist].children.includes(node));
 }
 assert.equal(smokingScene.doc.nodes.filter(n=>n.name==='fumee_volute_1').length,1);
 assert.equal(smokingScene.doc.nodes.filter(n=>n.name==='tasse_unique_mobile').length,0);
 await page.locator('#seek').evaluate(e=>{
   e.value='250';e.dispatchEvent(new Event('input',{bubbles:true}));
 });
 const cigaretteInhale=await page.locator('#view').screenshot();
 await page.locator('#seek').evaluate(e=>{
   e.value='360';e.dispatchEvent(new Event('input',{bubbles:true}));
 });
 const cigaretteExhale=await page.locator('#view').screenshot();
 assert.equal(cigaretteInhale.equals(cigaretteExhale),false,'Les poses de cigarette doivent bouger.');
 await page.locator('#prompt').fill('Une femme boit puis parle.');
 await page.getByRole('button',{name:'Créer mon animation 3D'}).click();
 assert.equal(await page.locator('#download').isVisible(),false);
 assert.equal(await page.locator('#download').getAttribute('href'),null);
 assert.match(await page.locator('#status').innerText(),/aucune animation 3D/);
 assert.deepEqual(errors,[],'Erreurs JavaScript du navigateur');
 console.log(JSON.stringify({result:'PASS',backend:'webgl2',foregroundPixels:metrics.foreground,
  pixelSize:[metrics.width,metrics.height],checks:['three-puff-smoke','one-cigarette-export','mesh','five-fingers-export','hand-closeup','camera-tracking','timeline','rotation','download','refusal','no-page-error']}));
 await context.close();
}finally{
 if(browser)await browser.close();
 await new Promise(ok=>server.close(ok));
}
