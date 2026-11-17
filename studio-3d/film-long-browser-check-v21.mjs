import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
export async function checkLongFilm(page){
 await page.locator('summary').filter({hasText:'Préparer un film'}).click();
 const description='Alice garde son manteau vert.\nScène 1 : Une femme entre dans un café.\nScène 2 : Elle dit « Bonjour », puis regarde la fenêtre.';
 await page.locator('#longDescription').fill(description);
 for(const seconds of ['1800','3600']){
  await page.locator('#longDuration').selectOption(seconds);
  await page.locator('#prepareLongFilm').click();
  assert.match(await page.locator('#longStatus').innerText(),/Aucune vidéo générée/);
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#saveLongFilm').click()]);
  const project=JSON.parse(await readFile(await download.path(),'utf8'));
  assert.equal(project.description,description);assert.equal(project.scenes.length,2);
  assert.equal(project.totalFrames,Number(seconds)*24);assert.equal(project.renderedFilm,false);
 }
 await page.locator('#longDescription').fill('');
 assert.equal(await page.locator('#saveLongFilm').isVisible(),false);
 await page.locator('#prepareLongFilm').click();
 assert.match(await page.locator('#longStatus').innerText(),/Projet non préparé/);
 assert.equal(await page.locator('#saveLongFilm').getAttribute('href'),null);
 // Exercer le vrai moteur de poses et le rendu, une image après l'autre.
 // Ce petit bloc synthétique ne prétend pas produire une vidéo d'une heure.
 const result=await page.evaluate(async()=>{
  const {createLongFilmProject}=await import('./film-long-project-v21.mjs');
  const {createFilmCheckpoint,processNextFilmChunk}=await import('./film-long-runtime-v21.mjs');
  const {createWebGLFilmRenderer}=await import('./film-webgl-v04.mjs');
  const {paintSyntheticScene}=await import('./film-viewer-v03.mjs');
  const project=createLongFilmProject({targetDurationSeconds:1800,chunkFrames:24,
   scenes:[{id:'test',prompt:'Une femme adulte fume une taffe de cigarette.',frameCount:120}]});
  const canvas=document.createElement('canvas');canvas.width=320;canvas.height=240;
  const backend=document.querySelector('#view').dataset.renderer;
  const gl=backend==='webgl2'?canvas.getContext('webgl2',{preserveDrawingBuffer:true}):null;
  const renderer=gl?createWebGLFilmRenderer(gl):null,ctx=gl?null:canvas.getContext('2d');
  let scene,frames=0,commits=0,aborts=0;
  try{
   const initial=await createFilmCheckpoint(project);
   const output=await processNextFilmChunk({project,checkpoint:initial,generator:globalThis.Retouche3DGenerator,
    sink:{beginChunk(data){scene=data.scene;if(renderer)renderer.prepare(scene,data.glb);},
     writeFrame({frame,pose}){if(frame!==frames)throw Error('Image non séquentielle');frames++;
      if(renderer)renderer.render(scene,pose,320,240,{});else paintSyntheticScene(ctx,scene,pose,320,240,{});},
     commitChunk(){commits++;},abortChunk(){aborts++;}}});
   let pixels;if(gl){pixels=new Uint8Array(320*240*4);gl.readPixels(0,0,320,240,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    if(gl.getError()!==gl.NO_ERROR)throw Error('Erreur WebGL du bloc');
   }else pixels=ctx.getImageData(0,0,320,240).data;
   let foreground=0;for(let i=0;i<pixels.length;i+=4)
    if(Math.abs(pixels[i]-15)+Math.abs(pixels[i+1]-20)+Math.abs(pixels[i+2]-32)>48)foreground++;
   return {frames,commits,aborts,foreground,nextFrame:output.checkpoint.nextFrame,renderedFilm:output.renderedFilm};
  }finally{renderer?.dispose();}
 });
 assert.equal(result.frames,24);assert.equal(result.nextFrame,24);
 assert.equal(result.commits,1);assert.equal(result.aborts,0);
 assert.ok(result.foreground>100);assert.equal(result.renderedFilm,false);
}
