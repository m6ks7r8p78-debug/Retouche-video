/** Film Studio v0.3 - visualisation locale déterministe des sphères du GLB.
 * Canvas 2D projette la hiérarchie 3D et les pistes glTF; rendu approché,
 * sans dépendance externe ni GPU WebGL. Pas un moteur PBR ni un film.
 */
const ID = [0,0,0,1];
const TMAX = 120;
const MAX_BYTES = 12*1024*1024;
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
const finite = v => typeof v==='number' && Number.isFinite(v);
const vector = (v,n) => Array.isArray(v)&&v.length===n&&v.every(finite);
const qnorm = q => {const l=Math.hypot(...q)||1;return q.map(x=>x/l);};
const qmul = (a,b) => [
 a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],
 a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],
 a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],
 a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]
];
const qrotate=(q,v)=>{const u=[q[0],q[1],q[2]], t=[
 2*(u[1]*v[2]-u[2]*v[1]),
 2*(u[2]*v[0]-u[0]*v[2]),
 2*(u[0]*v[1]-u[1]*v[0])
];return [
 v[0]+q[3]*t[0]+u[1]*t[2]-u[2]*t[1],
 v[1]+q[3]*t[1]+u[2]*t[0]-u[0]*t[2],
 v[2]+q[3]*t[2]+u[0]*t[1]-u[1]*t[0]
];};
const lerp=(a,b,t)=>a.map((x,i)=>x+(b[i]-x)*t);
function readSyntheticGLB(bytes){
 if(!(bytes instanceof Uint8Array)||bytes.byteLength<32||bytes.byteLength>MAX_BYTES)throw Error('GLB absent ou trop volumineux.');
 const dv=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(String.fromCharCode(...bytes.subarray(0,4))!=='glTF'||dv.getUint32(4,true)!==2||
    dv.getUint32(8,true)!==bytes.byteLength)throw Error('Entête GLB 2.0 invalide.');
 const jl=dv.getUint32(12,true);
 if(jl<2||jl>2*1024*1024||20+jl+8>bytes.byteLength||
    String.fromCharCode(...bytes.subarray(16,20))!=='JSON')throw Error('Bloc JSON GLB invalide.');
 const doc=JSON.parse(new TextDecoder().decode(bytes.subarray(20,20+jl)));
 const offset=20+jl;
 const bl=dv.getUint32(offset,true);
 if(String.fromCharCode(...bytes.subarray(offset+4,offset+8))!=='BIN\0'||
    offset+8+bl!==bytes.byteLength||doc.buffers?.length!==1||
    doc.buffers[0].byteLength!==bl)throw Error('Bloc BIN glTF incohérent.');
 if(!Array.isArray(doc.nodes)||doc.nodes.length>250||
    !Array.isArray(doc.meshes)||!Array.isArray(doc.materials)||
    !Array.isArray(doc.scenes)||doc.scenes.length!==1||
    !Array.isArray(doc.animations)||doc.animations.length>20)throw Error('Hiérarchie GLB hors du périmètre du pilote.');
 if(doc.asset?.version!=='2.0'||doc.extras?.synthetic!==true||doc.extras?.notPhotorealistic!==true)
    throw Error('Ce visualiseur n’accepte que les GLB synthétiques de notre laboratoire.');
 if(doc.nodes.some(n=>!vector(n.translation||[0,0,0],3)||
     !vector(n.scale||[1,1,1],3)||!vector(n.rotation||ID,4)||
     (n.children&&(!Array.isArray(n.children)||n.children.length>250))||
     (n.mesh!==undefined&&(!Number.isInteger(n.mesh)||n.mesh<0||n.mesh>=doc.meshes.length))))
    throw Error('Nœuds glTF invalides.');
 const bin=new DataView(bytes.buffer,bytes.byteOffset+offset+8,bl);
 function readAccessor(index){
   const acc=doc.accessors?.[index];
   if(!acc||acc.componentType!==5126||!['SCALAR','VEC3','VEC4'].includes(acc.type)||
      !Number.isInteger(acc.count)||acc.count<1||acc.count>8000)throw Error('Accessor animation incompatible.');
   const comps={SCALAR:1,VEC3:3,VEC4:4}[acc.type],view=doc.bufferViews?.[acc.bufferView];
   const base=(view?.byteOffset||0)+(acc.byteOffset||0);
   if(!view||base<0||base+acc.count*comps*4>bl||
      (acc.byteOffset||0)+acc.count*comps*4>view.byteLength)throw Error('Accessor GLB hors limites.');
   const out=[];
   for(let k=0;k<acc.count;k++){
     const v=[];
     for(let j=0;j<comps;j++){const n=bin.getFloat32(base+4*(k*comps+j),true);if(!finite(n))throw Error('Valeur d’animation non finie.');v.push(n);}
     out.push(v);
   }
   return out;
 }
 const clips=doc.animations.map(animation=>{
   const tracks=[];
   if(!Array.isArray(animation.samplers)||!Array.isArray(animation.channels)||animation.channels.length>100)
      throw Error('Animation incompatible.');
   for(const channel of animation.channels){
      const sample=animation.samplers[channel.sampler];
      const node=channel.target?.node,path=channel.target?.path;
      if(!sample||!Number.isInteger(node)||node<0||node>=doc.nodes.length||
         !['scale','rotation','translation'].includes(path)||sample.interpolation!=='LINEAR')
        throw Error('Canal GLB non pris en charge.');
      const times=readAccessor(sample.input).map(v=>v[0]),values=readAccessor(sample.output);
      if(times.length!==values.length||!times.length||times[0]<0||times.at(-1)>TMAX||
         times.some((v,i)=>!finite(v)||(i>0&&v<=times[i-1]))||
         values.some(v=>v.length!==(path==='rotation'?4:3)))
        throw Error('Temps ou valeurs des clés incohérents.');
      tracks.push({node,path,times,values});
   }
   return {name:animation.name,tracks,duration:Math.max(0,...tracks.map(t=>t.times.at(-1)))};
 });
 return {doc,clips,byteLength:bytes.byteLength};
}
function sampleSyntheticPose(scene,time=0,clipName='film_scene_v02'){
 const {doc,clips}=scene;
 const clip=clips.find(x=>x.name===clipName)||clips[0];
 if(!clip)throw Error('Aucune animation dans ce GLB.');
 const t=clamp(Number.isFinite(time)?time:0,0,clip.duration);
 const local=doc.nodes.map(n=>({translation:(n.translation||[0,0,0]).slice(),
  scale:(n.scale||[1,1,1]).slice(),rotation:(n.rotation||ID).slice()}));
 for(const track of clip.tracks){
   const {times,values,path,node}=track;
   let i=0;while(i<times.length-2&&times[i+1]<t)i++;
   const start=times[i],end=times[i+1]??start;
   const alpha=end===start?0:clamp((t-start)/(end-start),0,1);
   let v=end===start?values[i].slice():lerp(values[i],values[i+1],alpha);
   if(path==='rotation')v=qnorm(v);
   local[node][path]=v;
 }
 const world=new Array(doc.nodes.length);
 const visited=new Set();
 const mat4=(n)=>{
   const [x,y,z,w]=qnorm(n.rotation),[sx,sy,sz]=n.scale;
   return [
    (1-2*(y*y+z*z))*sx,(2*(x*y+z*w))*sx,(2*(x*z-y*w))*sx,0,
    (2*(x*y-z*w))*sy,(1-2*(x*x+z*z))*sy,(2*(y*z+x*w))*sy,0,
    (2*(x*z+y*w))*sz,(2*(y*z-x*w))*sz,(1-2*(x*x+y*y))*sz,0,
    ...n.translation,1
   ];
 };
 const mul4=(a,b)=>{const out=new Array(16).fill(0);
   for(let col=0;col<4;col++)for(let row=0;row<4;row++)
     for(let k=0;k<4;k++)out[col*4+row]+=a[k*4+row]*b[col*4+k];
   return out;
 };
 const visit=(id,parent,depth)=>{
   if(!Number.isInteger(id)||id<0||id>=world.length||depth>100||visited.has(id))
      throw Error('Hiérarchie glTF cyclique ou invalide.');
   visited.add(id);
   const n=local[id],matrix=parent?mul4(parent.matrix,mat4(n)):mat4(n);
   const transform={
     matrix,
     translation:[matrix[12],matrix[13],matrix[14]],
     scale:[Math.hypot(matrix[0],matrix[1],matrix[2]),
       Math.hypot(matrix[4],matrix[5],matrix[6]),
       Math.hypot(matrix[8],matrix[9],matrix[10])],
     rotation:qnorm(qmul(parent?.rotation||ID,n.rotation))
   };
   world[id]=transform;
   for(const child of doc.nodes[id].children||[])visit(child,transform,depth+1);
 };
 for(const id of doc.scenes[0].nodes||[])visit(id,null,0);
 return {world,time:t,duration:clip.duration,name:clip.name};
}
function projectedObjects(scene,pose,{width=480,height=360,yaw=.28,pitch=.10,
 target=null,distance=3.8}={}){
 const {doc}=scene;
 const focus=Array.isArray(target)&&target.length===3&&target.every(Number.isFinite);
 const focal=focus?target:[0,1,0];
 const magnification=focus?3.8/Math.max(.55,Math.min(6,distance)):1;
 const cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);
 const objects=[];
 const colors=doc.materials.map(m=>{
    const rgb=m.pbrMetallicRoughness?.baseColorFactor||[.7,.7,.7,1];
    return 'rgba('+rgb.slice(0,3).map(x=>Math.round(clamp(x,0,1)*255)).join(',')+','+clamp(rgb[3]??1,0,1)+')';
 });
 for(let i=0;i<doc.nodes.length;i++){
  const n=doc.nodes[i],w=pose.world[i];
  if(!w||n.mesh===undefined)continue;
  const [x,y,z]=w.translation;
  const rx=x-focal[0],ry=y-focal[1],rz=z-focal[2];
  const cx=cy*rx+sy*rz,cz=-sy*rx+cy*rz;
  const yy=cp*ry-sp*cz,zz=sp*ry+cp*cz;
  const zoom=1.05/(1.0+Math.max(-.8,zz)/5);
  const size=Math.min(width,height)*.57*zoom*magnification;
  const rx=Math.max(.05,Math.abs(w.scale[0])*size),ry=Math.max(.05,Math.abs(w.scale[1])*size);
  if(rx<.4&&ry<.4)continue;
  // projection volontairement approchée des sphères paramétriques du GLB.
  objects.push({x:width/2+cx*size,y:height*.54-yy*size,rx,ry,depth:zz,
    color:colors[n.mesh]||'#bdc5d0',name:n.name});
 }
 return objects.sort((a,b)=>b.depth-a.depth);
}
function paintSyntheticScene(context,scene,pose,width,height,camera){
 if(!context||typeof context.clearRect!=='function')throw TypeError('Contexte Canvas 2D nécessaire.');
 context.clearRect(0,0,width,height);
 context.fillStyle='#101521';context.fillRect(0,0,width,height);
 const list=projectedObjects(scene,pose,{width,height,...camera});
 for(const obj of list){
   context.beginPath();context.ellipse(obj.x,obj.y,obj.rx,obj.ry,0,0,Math.PI*2);
   context.fillStyle=obj.color;context.fill();
 }
 return list.length;
}
export {readSyntheticGLB,sampleSyntheticPose,projectedObjects,paintSyntheticScene};