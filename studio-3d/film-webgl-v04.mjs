/** Film Studio v0.4 — vérification du maillage glTF et affichage WebGL2 natif.
 * Hors ligne, sans moteur CDN ni média importé. Scène 3D stylisée non réaliste.
 */
import {readSyntheticGLB} from './film-viewer-v03.mjs';

function inspectSyntheticMesh(glb, scene=readSyntheticGLB(glb)){
 if(!(glb instanceof Uint8Array)||glb.byteLength!==scene.byteLength)throw Error('GLB et projet non concordants.');
 const doc=scene.doc,dv=new DataView(glb.buffer,glb.byteOffset,glb.byteLength);
 const base=20+dv.getUint32(12,true)+8;
 const binary=new DataView(glb.buffer,glb.byteOffset+base,doc.buffers[0].byteLength);
 function accessor(id,type,component,maxCount){
  const a=doc.accessors?.[id];
  if(!a||a.type!==type||a.componentType!==component||!Number.isInteger(a.count)||
     a.count<3||a.count>maxCount||a.sparse!==undefined||a.normalized===true)
     throw Error('Accesseur glTF incompatible.');
  const view=doc.bufferViews?.[a.bufferView],comps=type==='VEC3'?3:1,bytes=component===5126?4:2;
  const offset=(view?.byteOffset||0)+(a.byteOffset||0);
  const size=a.count*comps*bytes;
  if(!view||view.buffer!==0||view.byteStride!==undefined||!Number.isInteger(view.byteLength)||
    !Number.isInteger(offset)||offset<0||offset%bytes!==0||
    (a.byteOffset||0)+size>view.byteLength||offset+size>binary.byteLength)
    throw Error('Accesseur glTF hors limites.');
  const result=component===5126?new Float32Array(a.count*comps):new Uint16Array(a.count);
  for(let i=0;i<result.length;i++){
    result[i]=component===5126?binary.getFloat32(offset+i*bytes,true):binary.getUint16(offset+i*bytes,true);
    if(!Number.isFinite(result[i]))throw Error('Valeur non finie du maillage.');
  }
  return result;
 }
 if(!Array.isArray(doc.meshes)||!doc.meshes.length||doc.meshes.length>80)throw Error('Nombre de maillages excessif.');
 const geometries=doc.meshes.map(m=>{
  if(!Array.isArray(m.primitives)||m.primitives.length!==1)throw Error('Primitive glTF non gérée.');
  const p=m.primitives[0];
  if(p.mode!==undefined&&p.mode!==4)throw Error('Maillage non triangulaire.');
  const positions=accessor(p.attributes?.POSITION,'VEC3',5126,5000);
  const normals=accessor(p.attributes?.NORMAL,'VEC3',5126,5000);
  const indices=accessor(p.indices,'SCALAR',5123,30000);
  if(normals.length!==positions.length||indices.length%3!==0||
     indices.some(x=>x>=positions.length/3))throw Error('Indices glTF invalides.');
  const color=doc.materials?.[p.material]?.pbrMetallicRoughness?.baseColorFactor;
  if(!Array.isArray(color)||color.length!==4||color.some(x=>!Number.isFinite(x)||x<0||x>1))
    throw Error('Matériau glTF invalide.');
  const morphTargets=p.targets||[];
  if(!Array.isArray(morphTargets)||morphTargets.length>2)
    throw Error('Trop de cibles morph dans la géométrie.');
  const morph=morphTargets.map(target=>{
    if(Object.keys(target).length!==1||!Number.isInteger(target.POSITION))
      throw Error('Cible morph non prise en charge.');
    const delta=accessor(target.POSITION,'VEC3',5126,5000);
    if(delta.length!==positions.length||delta.some(x=>Math.abs(x)>.1))
      throw Error('Deltas morph non conformes.');
    return delta;
  });
  return {positions,normals,indices,color,morph};
 });
 const drawNodes=doc.nodes.filter(n=>n.mesh!==undefined).length;
 if(!drawNodes)throw Error('Aucune surface 3D à afficher.');
 return {geometries,drawNodes,triangles:geometries.reduce((s,g)=>s+g.indices.length/3,0)};
}
function mat4Multiply(a,b){
 const out=new Float32Array(16);
 for(let col=0;col<4;col++)for(let row=0;row<4;row++)
   for(let k=0;k<4;k++)out[col*4+row]+=a[k*4+row]*b[col*4+k];
 return out;
}
function perspective(fov,aspect,near=.1,far=50){
 const f=1/Math.tan(fov/2),nf=1/(near-far);
 return new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(far+near)*nf,-1,0,0,2*far*near*nf,0]);
}
const subtract=(a,b)=>a.map((x,i)=>x-b[i]);
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=v=>{const n=Math.hypot(...v)||1;return v.map(x=>x/n);};
function lookAt(eye,target=[0,1,.1]){
 const z=unit(subtract(eye,target)),x=unit(cross([0,1,0],z)),y=cross(z,x);
 return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,
  -dot(x,eye),-dot(y,eye),-dot(z,eye),1]);
}
function createWebGLFilmRenderer(gl){
 if(!gl||typeof gl.createVertexArray!=='function')throw Error('WebGL2 requis.');
 const vertex=[
  '#version 300 es','precision highp float;',
  'layout(location=0) in vec3 aPosition;','layout(location=1) in vec3 aNormal;',
  'uniform mat4 uMVP;','uniform mat4 uModel;','out vec3 vNormal;',
  'void main(){ gl_Position=uMVP*vec4(aPosition,1.0);',
  'vNormal=mat3(transpose(inverse(uModel)))*aNormal; }'
 ].join('\n');
 const fragment=[
  '#version 300 es','precision highp float;',
  'in vec3 vNormal;','uniform vec4 uColor;','out vec4 fragColor;',
  'void main(){ float l=max(dot(normalize(vNormal),normalize(vec3(-0.45,0.8,0.6))),0.0);',
  'fragColor=vec4(uColor.rgb*(0.38+0.62*l),uColor.a); }'
 ].join('\n');
 function shader(type,source){
  const s=gl.createShader(type);
  if(!s)throw Error('Shader GL indisponible.');
  gl.shaderSource(s,source);gl.compileShader(s);
  if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){
   const reason=gl.getShaderInfoLog(s)||'inconnue';gl.deleteShader(s);
   throw Error('Compilation WebGL: '+reason);
  }
  return s;
 }
 const shaders=[shader(gl.VERTEX_SHADER,vertex),shader(gl.FRAGMENT_SHADER,fragment)];
 const program=gl.createProgram();
 if(!program)throw Error('Programme WebGL indisponible.');
 for(const s of shaders)gl.attachShader(program,s);
 gl.linkProgram(program);
 for(const s of shaders)gl.deleteShader(s);
 if(!gl.getProgramParameter(program,gl.LINK_STATUS)){
  const reason=gl.getProgramInfoLog(program)||'inconnue';gl.deleteProgram(program);
  throw Error('Liaison WebGL: '+reason);
 }
 const um=gl.getUniformLocation(program,'uModel'),uv=gl.getUniformLocation(program,'uMVP'),
   uc=gl.getUniformLocation(program,'uColor');
 let resources=[],current=null;
 function clear(){
  for(const r of resources){
   gl.deleteBuffer(r.pos);gl.deleteBuffer(r.norm);gl.deleteBuffer(r.index);gl.deleteVertexArray(r.vao);
  }
  resources=[];current=null;
 }
 function prepare(scene,glb){
  const result=inspectSyntheticMesh(glb,scene);clear();
  try{
   for(const g of result.geometries){
    // Enregistrer chaque allocation immédiatement : une erreur ultérieure doit
    // libérer aussi la géométrie en cours, pas seulement les précédentes.
    const resource={vao:null,pos:null,norm:null,index:null};resources.push(resource);
    const vao=resource.vao=gl.createVertexArray();
    if(!vao)throw Error('Mémoire graphique indisponible (géométrie).');
    gl.bindVertexArray(vao);
    const pos=resource.pos=gl.createBuffer();
    if(!pos)throw Error('Mémoire graphique indisponible (positions).');
    gl.bindBuffer(gl.ARRAY_BUFFER,pos);
    gl.bufferData(gl.ARRAY_BUFFER,g.positions,g.morph.length?gl.DYNAMIC_DRAW:gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,0,0);
    const norm=resource.norm=gl.createBuffer();
    if(!norm)throw Error('Mémoire graphique indisponible (normales).');
    gl.bindBuffer(gl.ARRAY_BUFFER,norm);
    gl.bufferData(gl.ARRAY_BUFFER,g.normals,gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1);gl.vertexAttribPointer(1,3,gl.FLOAT,false,0,0);
    const index=resource.index=gl.createBuffer();
    if(!index)throw Error('Mémoire graphique indisponible (indices).');
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,index);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,g.indices,gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    Object.assign(resource,{count:g.indices.length,color:new Float32Array(g.color),
      morph:g.morph,basePositions:g.positions,
      morphed:g.morph.length?new Float32Array(g.positions.length):null});
   }
  }catch(error){clear();throw error;}
  current=scene;return result;
 }
 function render(scene,pose,width,height,camera={}){
  if(scene!==current)throw Error('GLB non préparé pour WebGL.');
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>4096||height>4096)
    throw Error('Dimension de rendu invalide.');
  const yaw=Number.isFinite(camera.yaw)?camera.yaw:.3,
    pitch=Number.isFinite(camera.pitch)?camera.pitch:.1;
  // Inspection localisée : la cible peut suivre la tasse animée.
  // Sans cible explicite, conserver à l'identique la caméra historique.
  const target=Array.isArray(camera.target)&&camera.target.length===3&&
    camera.target.every(Number.isFinite)?camera.target:null;
  const distance=Number.isFinite(camera.distance)?
    Math.max(.55,Math.min(6,camera.distance)):3.8;
  const eye=target?[
    target[0]+Math.sin(yaw)*distance,
    target[1]+distance*.27+Math.sin(pitch)*distance*.37,
    target[2]+Math.cos(yaw)*distance
  ]:[Math.sin(yaw)*3.8,2+Math.sin(pitch)*1.4,Math.cos(yaw)*3.8];
  const vp=mat4Multiply(perspective(Math.PI/3,width/height),
    lookAt(eye,target||[0,1,.1]));
  gl.viewport(0,0,width,height);
  gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.BLEND);
  gl.clearColor(.058,.077,.125,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  gl.useProgram(program);
  let drawCalls=0;
  for(let i=0;i<scene.doc.nodes.length;i++){
    const mesh=scene.doc.nodes[i].mesh,world=pose.world[i]?.matrix;
    if(mesh===undefined||!world)continue;
    const g=resources[mesh];
    if(!g)throw Error('Surface GLB non préparée.');
    if(g.morph.length){
      const weights=pose.world[i]?.weights;
      if(!Array.isArray(weights)||weights.length!==g.morph.length||
         weights.some(v=>!Number.isFinite(v)||v<0||v>1))
        throw Error('Poids de déformation de la manchette non conformes.');
      for(let p=0;p<g.morphed.length;p++){
        let value=g.basePositions[p];
        for(let k=0;k<weights.length;k++)value+=weights[k]*g.morph[k][p];
        g.morphed[p]=value;
      }
      gl.bindBuffer(gl.ARRAY_BUFFER,g.pos);
      gl.bufferSubData(gl.ARRAY_BUFFER,0,g.morphed);
    }
    gl.uniformMatrix4fv(um,false,new Float32Array(world));
    gl.uniformMatrix4fv(uv,false,mat4Multiply(vp,world));
    gl.uniform4fv(uc,g.color);
    gl.bindVertexArray(g.vao);
    gl.drawElements(gl.TRIANGLES,g.count,gl.UNSIGNED_SHORT,0);
    drawCalls++;
  }
  gl.bindVertexArray(null);
  return {backend:'webgl2',drawCalls,realMesh:true,physicallyAccurate:false};
 }
 return {prepare,render,dispose(){clear();gl.deleteProgram(program);}};
}
export {inspectSyntheticMesh,mat4Multiply,perspective,lookAt,createWebGLFilmRenderer};
