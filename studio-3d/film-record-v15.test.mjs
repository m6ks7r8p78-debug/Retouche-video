/** Démonstration vidéo réelle du moteur Film Studio v0.15.
 * Capture des pixels WebGL2 de l'app, SANS storyboard ni média utilisateur.
 * Le MP4 est un artefact de validation sur GitHub CI, pas une fonction d'export
 * MP4 disponible dans l'app web ni un rendu photoréaliste.
 */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,rm,readdir,stat} from 'node:fs/promises';
import {resolve,join,sep} from 'node:path';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';
const root=resolve('studio-3d'),out=resolve('test-results');
const directory=join(out,'film-v15-record-frames');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
 '.mjs':'text/javascript; charset=utf-8'};
const server=createServer(async(req,res)=>{
 try{
  const path=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
  if(!path.startsWith('/studio-3d/'))throw Error('URL interdite');
  const relative=path.slice('/studio-3d/'.length),full=resolve(root,relative);
  if(!full.startsWith(root+sep))throw Error('Chemin interdit');
  const ext=relative.slice(relative.lastIndexOf('.'));
  if(!types[ext])throw Error('Format interdit');
  const data=await readFile(full);
  res.writeHead(200,{'Content-Type':types[ext],
   'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'});res.end(data);
 }catch{res.writeHead(404);res.end('Introuvable');}
});
let browser;
try{
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 browser=await chromium.launch({headless:true,
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader',
   '--enable-webgl','--disable-background-timer-throttling']});
 const context=await browser.newContext({viewport:{width:390,height:844},
  deviceScaleFactor:2,hasTouch:true});
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const url='http://127.0.0.1:'+server.address().port+'/studio-3d/film-studio-v15.html';
 await page.goto(url);
 assert.equal(await page.locator('#view').getAttribute('data-renderer'),'webgl2');
 await page.locator('#create').click();
 assert.equal(await page.locator('#download').isVisible(),true);
 assert.match(await page.locator('#status').innerText(),/Manchette déformable sur 2 zones/);
 await mkdir(directory,{recursive:true});await mkdir(out,{recursive:true});
 const framesPerPart=55,frameCount=110,hashes=new Set();
 for(let i=0;i<frameCount;i++){
  const focus=i>=framesPerPart;
  if(i===framesPerPart){
   await page.locator('#focusHand').click();
   assert.equal(await page.locator('#view').getAttribute('data-view-mode'),'main');
  }
  const k=i%framesPerPart,position=Math.round(k*1000/(framesPerPart-1));
  await page.locator('#seek').evaluate((input,value)=>{
   input.value=String(value);input.dispatchEvent(new Event('input',{bubbles:true}));
  },position);
  const img=await page.locator('#view').screenshot({
   path:join(directory,'frame-'+String(i).padStart(4,'0')+'.png')
  });
  // Borne les doublons : un film avec tous les cadres identiques serait invalide.
  const sig=img.subarray(0,60).toString('hex')+':'+img.byteLength;
  hashes.add(sig);
 }
 assert.ok(hashes.size>20,'Le rendu serait trop statique pour une preuve vidéo.');
 const files=await readdir(directory);
 assert.equal(files.filter(n=>n.endsWith('.png')).length,frameCount);
 assert.deepEqual(errors,[]);
 await context.close();
 const path=join(out,'film-studio-v15-moteur-reel.mp4');
 // Agrandit le vrai canvas 780×580 sans le recadrer. Les bandes latérales
 // identifient la provenance du moteur, sans imaginer des pixels hors champ.
 const filter=[
  'scale=960:720:flags=lanczos',
  'pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=0x121927',
  "drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:text='FILM STUDIO v0.15':x=20:y=34:fontsize=20:fontcolor=white",
  "drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:text='TASSE 3D - APERCU REEL DU MOTEUR':x=20:y=68:fontsize=15:fontcolor=white",
  "drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:text='AUCUNE CIGARETTE / AUCUN MP4 NATIF':x=19:y=675:fontsize=15:fontcolor=white"
 ].join(',');
 execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y',
  '-framerate','10','-i',join(directory,'frame-%04d.png'),'-vf',filter,
  '-r','24','-c:v','libx264','-preset','veryfast','-crf','21',
  '-pix_fmt','yuv420p','-movflags','+faststart',path],
  {stdio:'inherit',timeout:180000});
 const result=await stat(path);
 assert.ok(result.size>70000,'Fichier MP4 du moteur incomplet.');
 const meta=JSON.parse(execFileSync('ffprobe',['-v','error',
  '-show_entries','format=duration:stream=codec_name,width,height,pix_fmt',
  '-of','json',path],{encoding:'utf8'}));
 assert.equal(meta.streams[0].codec_name,'h264');
 assert.equal(meta.streams[0].pix_fmt,'yuv420p');
 console.log(JSON.stringify({result:'PASS',video:path,
  seconds:Number(meta.format.duration),sizeBytes:result.size,
  frames:frameCount,distinctSignatures:hashes.size,
  source:'film-studio-v15.html browser WebGL2 synthetic GLB',
  cigaretteGenerated:false,mp4BuiltInApp:false}));
}finally{
 if(browser)await browser.close();
 await new Promise(ok=>server.close(ok));
 await rm(directory,{recursive:true,force:true});
}
