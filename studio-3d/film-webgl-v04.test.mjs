import test from 'node:test';
import assert from 'node:assert/strict';
import generator from './generateur.js';
import {buildSyntheticFilmSceneV03} from './film-contact-v03.mjs';
import {readSyntheticGLB,sampleSyntheticPose} from './film-viewer-v03.mjs';
import {inspectSyntheticMesh,mat4Multiply,perspective,lookAt,createWebGLFilmRenderer} from './film-webgl-v04.mjs';

const prepared=()=>{
 const output=buildSyntheticFilmSceneV03("Une femme brune s'assoit dans son salon, boit un café, pose sa tasse puis parle.",generator);
 const scene=readSyntheticGLB(output.glb);
 return {output,scene};
};
test('le fichier GLB expose de vrais triangles, normales, matériaux et indices valides',()=>{
 const {output,scene}=prepared();
 const mesh=inspectSyntheticMesh(output.glb,scene);
 assert.ok(mesh.drawNodes>25);
 assert.ok(mesh.triangles>100);
 assert.ok(mesh.geometries.length>=10);
 for(const g of mesh.geometries){
  assert.equal(g.positions.length,g.normals.length);
  assert.equal(g.positions.length%3,0);
  assert.equal(g.indices.length%3,0);
  assert.ok(g.indices.every(i=>i<g.positions.length/3));
  assert.ok(g.color.every(x=>x>=0&&x<=1));
 }
});
test('les matrices WebGL respectent la convention de hiérarchie 3D',()=>{
 const identity=new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
 assert.deepEqual([...mat4Multiply(identity,identity)],[...identity]);
 const p=perspective(Math.PI/3,1.5);
 assert.ok(p[0]>0&&p[5]>0&&p[11]===-1);
 const v=lookAt([0,2,4]);
 assert.ok(v.every(Number.isFinite));
});
test('détecte les modifications GLB qui rendent indices et positions illisibles',()=>{
 const {output,scene}=prepared();
 const bad=output.glb.slice();
 const doc=scene.doc;
 const acc=doc.accessors[doc.meshes[0].primitives[0].indices];
 const view=doc.bufferViews[acc.bufferView];
 const offset=20+new DataView(bad.buffer).getUint32(12,true)+8+view.byteOffset;
 new DataView(bad.buffer).setUint16(offset,65000,true);
 assert.throws(()=>inspectSyntheticMesh(bad,scene),/Indices/);
});
test('rendu WebGL simulé: vrais buffers géométriques, profondeur et dessins distincts',()=>{
 const calls={draw:0,buffers:0,depth:0,vertex:0};
 let id=0;
 const gl={
 VERTEX_SHADER:35633,FRAGMENT_SHADER:35632,COMPILE_STATUS:35713,LINK_STATUS:35714,
 ARRAY_BUFFER:34962,ELEMENT_ARRAY_BUFFER:34963,STATIC_DRAW:35044,FLOAT:5126,
 TRIANGLES:4,UNSIGNED_SHORT:5123,DEPTH_TEST:2929,BLEND:3042,LEQUAL:515,
 COLOR_BUFFER_BIT:16384,DEPTH_BUFFER_BIT:256,
 createVertexArray(){return ++id;},createShader(){return ++id;},shaderSource(){},
 compileShader(){},getShaderParameter(){return true;},deleteShader(){},
 createProgram(){return ++id;},attachShader(){},linkProgram(){},
 getProgramParameter(){return true;},deleteProgram(){},
 getUniformLocation(_program,key){return key;},
 createBuffer(){calls.buffers++;return ++id;},bindVertexArray(){},
 bindBuffer(){},bufferData(_type,data){assert.ok(data instanceof Float32Array||data instanceof Uint16Array);},
 enableVertexAttribArray(){calls.vertex++;},vertexAttribPointer(){},
 deleteBuffer(){},deleteVertexArray(){},
 viewport(){},enable(x){if(x===this.DEPTH_TEST)calls.depth++;},
 depthFunc(){},disable(){},clearColor(){},clear(){},useProgram(){},
 uniformMatrix4fv(_loc,transposed,data){assert.equal(transposed,false);assert.equal(data.length,16);},
 uniform4fv(){},drawElements(_type,count){assert.ok(count>0);calls.draw++;}
 };
 const {output,scene}=prepared();
 const renderer=createWebGLFilmRenderer(gl);
 const inspection=renderer.prepare(scene,output.glb);
 assert.equal(calls.buffers,inspection.geometries.length*3);
 const before=renderer.render(scene,sampleSyntheticPose(scene,0),480,350,{yaw:.25});
 const after=renderer.render(scene,sampleSyntheticPose(scene,4.2),480,350,{yaw:.52});
 assert.ok(before.drawCalls>25);
 assert.equal(before.drawCalls,after.drawCalls);
 assert.equal(calls.draw,2*before.drawCalls);
 assert.ok(calls.depth>=2);
 renderer.dispose();
});

test('échec GPU partiel : toutes les allocations libérées, puis préparation réutilisable',()=>{
 const {output,scene}=prepared();
 for(const failure of ['vao',2,5,'upload']){
  const buffers=new Set(),vaos=new Set();let id=0,attempts=0,enabled=true,uploads=0;
  const gl={
   VERTEX_SHADER:1,FRAGMENT_SHADER:2,COMPILE_STATUS:3,LINK_STATUS:4,
   createShader:()=>++id,shaderSource(){},compileShader(){},getShaderParameter:()=>true,deleteShader(){},
   createProgram:()=>++id,attachShader(){},linkProgram(){},getProgramParameter:()=>true,
   getUniformLocation(){},deleteProgram(){},
   createVertexArray(){if(enabled&&failure==='vao')return null;const v=++id;vaos.add(v);return v;},
   createBuffer(){if(++attempts===failure&&enabled)return null;const b=++id;buffers.add(b);return b;},
   deleteBuffer(b){if(b!==null)assert.equal(buffers.delete(b),true);},
   deleteVertexArray(v){if(v!==null)assert.equal(vaos.delete(v),true);},
   bindVertexArray(){},bindBuffer(){},enableVertexAttribArray(){},vertexAttribPointer(){},
   bufferData(){if(++uploads===5&&enabled&&failure==='upload')throw Error('Échec upload GPU');}
  };
  const renderer=createWebGLFilmRenderer(gl);
  assert.throws(()=>renderer.prepare(scene,output.glb),/Mémoire graphique|upload GPU/);
  assert.equal(buffers.size,0);assert.equal(vaos.size,0);
  assert.throws(()=>renderer.render(scene,sampleSyntheticPose(scene,0),320,240),/non préparé/);
  enabled=false;renderer.prepare(scene,output.glb);
  assert.ok(buffers.size>0&&vaos.size>0);
  renderer.dispose();assert.equal(buffers.size,0);assert.equal(vaos.size,0);
 }
});
