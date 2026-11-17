
import {SCHEMA,validatePoseTrack} from './film-motion-capture-v01.mjs';
(()=>{'use strict';
const $=s=>document.getElementById(s);
const SEG=[['épaules',11,12,'tronc'],['bassin',23,24,'tronc'],['tronc G',11,23,'tronc'],['tronc D',12,24,'tronc'],['bras G',11,13,'bras'],['avantbras G',13,15,'bras'],['bras D',12,14,'bras'],['avantbras D',14,16,'bras'],['cuisse G',23,25,'jambes'],['mollet G',25,27,'jambes'],['cuisse D',24,26,'jambes'],['mollet D',26,28,'jambes'],['pied G',27,31,'pieds'],['pied D',28,32,'pieds'],['tête indicative',0,11,'tete']];
const PALETTE={tronc:[.32,.65,.74,1],bras:[.46,.75,.84,1],jambes:[.31,.50,.63,1],pieds:[.58,.73,.78,1],tete:[.84,.67,.43,1]};
let source,processed,frame=0,yaw=-.28,pitch=.07,zoom=1,playing=false,raf=0,last=0;
function demo(){const bases={0:[0,-.73,.02],11:[-.23,-.46,0],12:[.23,-.46,0],13:[-.43,-.24,0],14:[.43,-.24,0],15:[-.48,-.03,0],16:[.48,-.03,0],23:[-.14,0,0],24:[.14,0,0],25:[-.16,.48,0],26:[.16,.48,0],27:[-.16,.94,0],28:[.16,.94,0],31:[-.17,1.02,-.11],32:[.17,1.02,-.11]};return {schema:'retouche-pose33-v21',provenance:'entièrement synthétique',frames:Array.from({length:15},(_,j)=>{let u=j/14;let w=Array.from({length:33},()=>({x:0,y:0,z:0,visibility:0}));Object.entries(bases).forEach(([k,[x,y,z]])=>{k=+k;if(k===15){x+=.26*Math.sin(Math.PI*u);y-=.36*Math.sin(Math.PI*u);z+=.12*Math.sin(Math.PI*u)}if(k===13)y-=.05*Math.sin(Math.PI*u);if(k===27)y+=.1*Math.sin(2*Math.PI*u);if(k===28)y-=.1*Math.sin(2*Math.PI*u);w[k]={x,y,z,visibility:.99}});let normalized=w.map(p=>({x:.5+p.x*.36,y:.5+p.y*.36,z:p.z,visibility:p.visibility}));return {timestamp_ms:j*120,landmarks:normalized,world_landmarks:w}})}}
function canonicalize(raw){if(!raw||typeof raw!=='object')throw Error('Objet JSON requis');if(raw.schema===SCHEMA&&Array.isArray(raw.frames))return {frames:raw.frames.map(f=>({timestamp_ms:Math.round(f.timeSeconds*1000),landmarks:f.landmarks}))};let arr=Array.isArray(raw.frames)?raw.frames:((raw.landmarks||raw.worldLandmarks)?[{timestamp_ms:0,result:raw}]:null);if(!arr)throw Error('frames ou résultat MediaPipe requis');return {frames:arr.map((item,i)=>{if(!item||typeof item!=='object')throw Error('Image de pose invalide');let d=item.result||item;function take(...keys){for(let key of keys)if(d[key]!=null)return d[key];return null}function single(p,label){if(Array.isArray(p)&&Array.isArray(p[0])){if(p.length!==1)throw Error(label+': plusieurs personnes, sélection explicite nécessaire');return p[0]}return p}let r={timestamp_ms:item.timestamp_ms??item.timestampMs??d.timestamp_ms??i*100,landmarks:single(take('landmarks','poseLandmarks','pose_landmarks'),'landmarks')};let w=single(take('world_landmarks','worldLandmarks','poseWorldLandmarks','pose_world_landmarks'),'world_landmarks');if(w)r.world_landmarks=w;return r})}}
function normalize(raw){raw=canonicalize(raw);if(!raw||!Array.isArray(raw.frames)||!raw.frames.length||raw.frames.length>1500)throw Error('Il faut entre 1 et 1 500 images.');let world=raw.frames.every(f=>Array.isArray(f.world_landmarks));if(raw.frames.some(f=>!!f.world_landmarks!==world))throw Error('Mélange 2D/3D non autorisé.');let previous=-1,points=[],valid=[],times=[];for(const f of raw.frames){let t=Number(f.timestamp_ms);if(!Number.isFinite(t)||t<=previous||t<0)throw Error('Timestamps strictement croissants requis.');previous=t;times.push(t/1000);let arr=world?f.world_landmarks:f.landmarks;if(!Array.isArray(arr)||arr.length!==33)throw Error('Chaque image doit avoir 33 points.');let pos=[],vis=[];for(let i=0;i<33;i++){let p=arr[i],x=Number(p?.x),y=Number(p?.y),z=Number(p?.z??0),v=Number(p?.visibility??p?.presence??1);if(![x,y,z,v].every(Number.isFinite)||Math.max(Math.abs(x),Math.abs(y),Math.abs(z))>100||v<0||v>1)throw Error('Coordonnées/visibilités invalides.');if(!world&&(x<0||x>1||y<0||y>1))throw Error('Coordonnées image hors [0,1].');if(world&&Array.isArray(f.landmarks)&&f.landmarks[i])v=Math.min(v,Number(f.landmarks[i].visibility??1));pos.push(world?[x,-y,z]:[(x-.5)*1.7,(.5-y)*1.7,-z*1.7]);vis.push(v>=.55)}if(world){let hip=pos[23].map((v,k)=>(v+pos[24][k])*.5);pos=pos.map(p=>p.map((v,k)=>v-hip[k]))}points.push(pos);valid.push(vis)}let accepted=[],rejected=[];const dist=(a,b)=>Math.hypot(...a.map((v,k)=>v-b[k]));for(const s of SEG){let vals=points.map((p,j)=>valid[j][s[1]]&&valid[j][s[2]]?dist(p[s[1]],p[s[2]]):NaN);if(vals.some(v=>!Number.isFinite(v)||v<.025)){rejected.push(s[0]+': visibilité ou longueur insuffisante');continue}let mean=vals.reduce((a,b)=>a+b,0)/vals.length,sd=Math.sqrt(vals.reduce((a,v)=>a+(v-mean)**2,0)/vals.length);if(sd/mean>.4){rejected.push(s[0]+': longueur instable');continue}accepted.push(s)}if(!accepted.length)throw Error('Aucun segment utilisable.');return {points,valid,times:times.map(t=>t-times[0]),world,accepted,rejected}}
function setData(raw){let next=normalize(raw);source=raw;processed=next;$('saveGLB').disabled=false;$('saveJSON').disabled=false;frame=0;playing=false;$('play').textContent='▶ Lire';$('timeline').max=next.points.length-1;$('timeline').value=0;$('status').textContent=`${next.points.length} images de pose · ${next.accepted.length}/${SEG.length} segments visibles sur toute la séquence`;$('metrics').innerHTML=`<span class="pill">${next.world?'Coordonnées 3D estimées':'Image + profondeur relative estimée'}</span><span class="pill">${next.times.at(-1).toFixed(2)} s</span><span class="pill">Sans photo d’origine</span>`;$('warnings').replaceChildren();const notes=['Modèle de segments cylindriques illustratifs, pas un maillage humain fidèle.'];if(!next.world)notes.push('Pas de coordonnées mondiales : épaisseur/relief inconnus.');notes.push(...next.rejected.slice(0,12));for(const w of notes){let li=document.createElement('li');li.textContent=w;$('warnings').append(li)}draw()}
const canvas=$('stage'),ctx=canvas.getContext('2d');
function resize(){let r=canvas.getBoundingClientRect(),dpr=Math.min(2,window.devicePixelRatio||1);canvas.width=Math.max(1,Math.round(r.width*dpr));canvas.height=Math.max(1,Math.round(r.height*dpr));draw()}
function rotate(p){const [x,y,z]=p;let cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);let xx=cy*x+sy*z,zz=-sy*x+cy*z;return [xx,cp*y-sp*zz,sp*y+cp*zz]}
function project(p){let [x,y,z]=rotate(p),w=canvas.width,h=canvas.height,scale=Math.min(w,h)*.4*zoom,cam=4.4,pers=cam/(cam+z);return [w/2+x*scale*pers,h/2-y*scale*pers,z]}
function draw(){if(!ctx||!processed)return;let w=canvas.width,h=canvas.height;ctx.clearRect(0,0,w,h);let g=ctx.createLinearGradient(0,0,0,h);g.addColorStop(0,'#1e3648');g.addColorStop(1,'#091725');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);const xyz=processed.points[frame];let lines=processed.accepted.map(s=>{let a=project(xyz[s[1]]),b=project(xyz[s[2]]);return {a,b,kind:s[3],z:(a[2]+b[2])/2}}).sort((a,b)=>b.z-a.z);let colors={tronc:'#63c6d4',bras:'#8ed8ed',jambes:'#5c9dbb',pieds:'#9cc4d1',tete:'#e7b77c'};for(const l of lines){ctx.lineCap='round';ctx.lineWidth=Math.max(2,Math.min(w,h)*.019*zoom);ctx.strokeStyle='rgba(0,0,0,.35)';ctx.beginPath();ctx.moveTo(l.a[0]+2,l.a[1]+2);ctx.lineTo(l.b[0]+2,l.b[1]+2);ctx.stroke();ctx.lineWidth=Math.max(2,Math.min(w,h)*.014*zoom);ctx.strokeStyle=colors[l.kind];ctx.beginPath();ctx.moveTo(l.a[0],l.a[1]);ctx.lineTo(l.b[0],l.b[1]);ctx.stroke()}ctx.fillStyle='#dce9ea';for(const i of [0,11,12,13,14,15,16,23,24,25,26,27,28]){if(!processed.valid[frame][i])continue;let [x,y]=project(xyz[i]);ctx.beginPath();ctx.arc(x,y,Math.max(2,Math.min(w,h)*.006*zoom),0,Math.PI*2);ctx.fill()}let size=Math.round(Math.min(w,h)*.035);ctx.font=`${size}px system-ui`;ctx.fillStyle='#c0d3df';ctx.textAlign='left';ctx.fillText('POSE ESTIMÉE · MODÈLE SYNTHÉTIQUE',18,30);$('frameText').textContent=`${frame+1} / ${processed.points.length}`;}
function quat(direction){let len=Math.hypot(...direction);let d=direction.map(v=>v/len),dot=d[1];if(dot<-.999999)return [1,0,0,0];let cross=[d[2],0,-d[0]],q=[...cross,1+dot];let m=Math.hypot(...q);return q.map(v=>v/m)}
function buildGLB(){if(!processed)throw Error('Aucune pose chargée');const b=[],bufferViews=[],accessors=[],meshes=[],nodes=[],materials=[],channels=[],samplers=[];const bytes=[];function append(data,component,type){while(bytes.length%4)bytes.push(0);let offset=bytes.length,v=data instanceof Uint8Array?data:new Uint8Array(data.buffer);for(let x of v)bytes.push(x);bufferViews.push({buffer:0,byteOffset:offset,byteLength:v.length});let width={SCALAR:1,VEC3:3,VEC4:4}[type],a={bufferView:bufferViews.length-1,componentType:component,count:data.length/width,type};if(component===5126){let low=Array(width).fill(Infinity),hi=Array(width).fill(-Infinity);for(let i=0;i<data.length;i++){let k=i%width;low[k]=Math.min(low[k],data[i]);hi[k]=Math.max(hi[k],data[i])}a.min=low;a.max=hi}accessors.push(a);return accessors.length-1}
const sections=12,verts=[],normal=[],indices=[];for(let j=0;j<=1;j++)for(let i=0;i<sections;i++){let a=2*Math.PI*i/sections;verts.push(Math.cos(a),j-.5,Math.sin(a));normal.push(Math.cos(a),0,Math.sin(a))}for(let i=0;i<sections;i++){let j=(i+1)%sections;indices.push(i,j,sections+i,j,sections+j,sections+i)}let p=append(new Float32Array(verts),5126,'VEC3'),n=append(new Float32Array(normal),5126,'VEC3'),ind=append(new Uint32Array(indices),5125,'SCALAR');let kinds=[...new Set(processed.accepted.map(s=>s[3]))],ids={};for(let k of kinds){let mat=materials.push({name:'proxy_'+k,pbrMetallicRoughness:{baseColorFactor:PALETTE[k],metallicFactor:0,roughnessFactor:.9},doubleSided:true})-1;ids[k]=meshes.push({primitives:[{attributes:{POSITION:p,NORMAL:n},indices:ind,material:mat}]})-1}
const time=append(new Float32Array(processed.times),5126,'SCALAR');for(const s of processed.accepted){let translations=[],rotations=[],scales=[],radius={tronc:.07,bras:.042,jambes:.058,pieds:.038,tete:.095}[s[3]];for(let xyz of processed.points){let a=xyz[s[1]],c=xyz[s[2]],d=c.map((v,i)=>v-a[i]),length=Math.hypot(...d);translations.push(...a.map((v,i)=>(v+c[i])*.5));rotations.push(...quat(d));scales.push(radius,length,radius)}let node=nodes.push({name:s[0],mesh:ids[s[3]],translation:translations.slice(0,3),rotation:rotations.slice(0,4),scale:scales.slice(0,3),extras:{statut:'proxy_non_anatomique'}})-1;for(let [k,arr] of [['translation',translations],['rotation',rotations],['scale',scales]]){let output=append(new Float32Array(arr),5126,k==='rotation'?'VEC4':'VEC3'),sampler=samplers.push({input:time,output,interpolation:'LINEAR'})-1;channels.push({sampler,target:{node,path:k}})}}
while(bytes.length%4)bytes.push(0);let doc={asset:{version:'2.0',generator:'Retouche 3D Atelier Pose vidéo v0.22 — proxy'},scene:0,scenes:[{nodes:nodes.map((_,i)=>i),extras:{mode:processed.world?'articulations_3d_estimees':'plan_2d_sans_profondeur',avertissement:'Maquette non fidèle, surfaces cachées non reconstruites'}}],nodes,materials,meshes,bufferViews,accessors,buffers:[{byteLength:bytes.length}],animations:[{name:'pose_approximate',channels,samplers}]};let json=new TextEncoder().encode(JSON.stringify(doc));let pad=(4-json.length%4)%4,padded=new Uint8Array(json.length+pad);padded.fill(32);padded.set(json);let buffer=new ArrayBuffer(12+8+padded.length+8+bytes.length),dv=new DataView(buffer),u=new Uint8Array(buffer);u.set([103,108,84,70],0);dv.setUint32(4,2,true);dv.setUint32(8,buffer.byteLength,true);dv.setUint32(12,padded.length,true);u.set([74,83,79,78],16);u.set(padded,20);let off=20+padded.length;dv.setUint32(off,bytes.length,true);u.set([66,73,78,0],off+4);u.set(bytes,off+8);return buffer}
function download(data,name,mime){const blob=data instanceof Blob?data:new Blob([data],{type:mime});let url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000)}
$('saveGLB').onclick=()=>{try{download(buildGLB(),'pose_proxy_articule_v022.glb','model/gltf-binary')}catch(e){alert(e.message)}};
$('saveJSON').onclick=()=>download(JSON.stringify(source,null,2),'film_pose_track_v0_1.json','application/json');
$('demo').onclick=()=>{try{setData(demo());resize()}catch(e){$('status').textContent=e.message}};
$('import').onchange=async e=>{const file=e.target.files[0];if(!file)return;if(file.size>12e6){$('status').textContent='JSON trop volumineux (12 Mo max).';return}try{let raw=JSON.parse(await file.text());setData(raw);resize()}catch(err){$('status').textContent='Fichier refusé : '+err.message}e.target.value=''};
$('timeline').oninput=e=>{frame=Number(e.target.value);draw()};$('reset').onclick=()=>{zoom=1;yaw=-.28;pitch=.07;draw()};
$('play').onclick=()=>{playing=!playing;$('play').textContent=playing?'❚❚ Pause':'▶ Lire';last=0;if(playing)requestAnimationFrame(tick)};
function tick(t){if(!playing||!processed)return;if(!last)last=t;const diff=t-last;if(diff>115){last=t;frame=(frame+1)%processed.points.length;$('timeline').value=frame;draw()}requestAnimationFrame(tick)}
let pointer=null;canvas.addEventListener('pointerdown',e=>{pointer=[e.clientX,e.clientY];canvas.setPointerCapture(e.pointerId)});canvas.addEventListener('pointermove',e=>{if(!pointer)return;yaw+=(e.clientX-pointer[0])*.012;pitch=Math.max(-1,Math.min(1,pitch+(e.clientY-pointer[1])*.01));pointer=[e.clientX,e.clientY];draw()});canvas.addEventListener('pointerup',()=>pointer=null);canvas.addEventListener('wheel',e=>{e.preventDefault();zoom=Math.max(.4,Math.min(3,zoom*(e.deltaY>0?.9:1.1)));draw()},{passive:false});

// v2.3: extraction réelle dans le navigateur UNIQUEMENT après consentement + chargement.
let landmarker22=null,aborted22=false,objectUrl22=null,modelReady22=false;
const player22=$('videoInputPlayer');
function videoStatus22(msg){$('videoStatus').textContent=String(msg)}
function validateLandmarks22(arr){
 if(!Array.isArray(arr)||arr.length!==33)throw Error('Le modèle n’a pas fourni exactement 33 points.');
 return arr.map((p,i)=>{let obj={x:Number(p?.x),y:Number(p?.y),z:Number(p?.z??0),visibility:Number(p?.visibility??p?.presence??1)};
 if(!Object.values(obj).every(Number.isFinite)||obj.visibility<0||obj.visibility>1||Math.max(Math.abs(obj.x),Math.abs(obj.y),Math.abs(obj.z))>100)throw Error('Coordonnée de pose invalide : '+i);
 return obj});
}
function normalizeResult22(result,time){
 const arr=result?.landmarks??[],world=result?.worldLandmarks??[];
 if(arr.length>1||world.length>1)throw Error('Plusieurs personnes détectées : séparer ou recadrer la vidéo avant l’analyse.');
 if(arr.length===0)return null;
 const lm=validateLandmarks22(arr[0]);
 if(lm.filter(p=>p.visibility>=.55).length<8)return null;
 let rec={timestamp_ms:Math.round(time*1000),landmarks:lm};
 if(world.length===1)rec.world_landmarks=validateLandmarks22(world[0]);
 return rec;
}
function buildPoseJson22(records,metadata={}){
 if(!records.length)throw Error('Aucune pose suffisamment visible : aucun avatar créé.');
 if(records.length>1500)throw Error('Limite de 1 500 poses dépassée.');
 let previous=-1;
 const frames=records.map(rec=>{const timestamp_ms=Number(rec.timestamp_ms);
 if(!Number.isFinite(timestamp_ms)||timestamp_ms<=previous)throw Error('Horodatages invalides.');previous=timestamp_ms;
 const frame=Math.round(timestamp_ms*24/1000);
 return {frame,timeSeconds:frame/24,landmarks:validateLandmarks22(rec.landmarks)};
 });
 const checked=validatePoseTrack({schema:SCHEMA,fps:24,width:Math.max(1,Math.round(metadata.source_width||1)),height:Math.max(1,Math.round(metadata.source_height||1)),frames});
 return {...checked,metadata:{...metadata,sampling_rate_hz:5,tracking_cross_video:false,anatomical_reconstruction:false,original_frames_saved:false,depth_calibrated:false}};
}
async function loadModel22(){
 if(!($('consentPose').checked))throw Error('Autorise d’abord le chargement externe du runtime.');
 const localFile=$('modelFile').files[0]||null;
 if(localFile && (!/\.task$/i.test(localFile.name)||localFile.size<1024*1024||localFile.size>65*1024*1024))
   throw Error('Modèle local invalide : fichier .task compris entre 1 et 65 Mo.');
 const {FilesetResolver,PoseLandmarker}=await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/vision_bundle.mjs');
 const fileset=await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm');
 // Les poids sont lus localement si le fichier est choisi; jamais envoyés au serveur.
 const baseOptions=localFile
   ? {modelAssetBuffer:new Uint8Array(await localFile.arrayBuffer())}
   : {modelAssetPath:'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task'};
 return await PoseLandmarker.createFromOptions(fileset,{baseOptions,runningMode:'VIDEO',numPoses:2,
   minPoseDetectionConfidence:.55,minPosePresenceConfidence:.55,minTrackingConfidence:.55});
}
function seek22(player,t){return new Promise((resolve,reject)=>{
 if(Math.abs(player.currentTime-t)<.02 && player.readyState>=2){resolve();return}
 let timer;function clean(){clearTimeout(timer);player.removeEventListener('seeked',done);player.removeEventListener('error',fail)}
 function done(){clean();resolve()}function fail(){clean();reject(Error('La vidéo n’est pas décodable ou sa recherche temporelle échoue.'))}
 player.addEventListener('seeked',done,{once:true});player.addEventListener('error',fail,{once:true});
 timer=setTimeout(()=>{clean();reject(Error('Décodage ou recherche trop lente (12 s).'))},12000);
 try{player.currentTime=t}catch(e){clean();reject(e)}
})}
$('modelFile').addEventListener('change',e=>{const f=e.target.files[0];$('modelFileName').textContent=f?'Modèle local : '+f.name+' · '+(f.size/1048576).toFixed(1)+' Mo':'Modèle officiel distant par défaut.';if(modelReady22){modelReady22=false;landmarker22?.close?.();landmarker22=null;$('loadPose').disabled=false;$('analyzePose').disabled=true;videoStatus22('Modèle modifié : recharger le moteur avant une analyse.')}});
$('videoInput').addEventListener('change',e=>{processed=null;source=null;$('saveGLB').disabled=true;$('saveJSON').disabled=true;$('status').textContent='Vidéo sélectionnée : aucune pose validée ; analyse nécessaire.';if(objectUrl22)URL.revokeObjectURL(objectUrl22);objectUrl22=null;const file=e.target.files[0];
 $('videoName').textContent=file?file.name+' · '+(file.size/1048576).toFixed(1)+' Mo':'Aucune vidéo sélectionnée';
 if(!file)return;
 if(!file.type.startsWith('video/') && !/\.(mp4|mov|webm|m4v)$/i.test(file.name)){videoStatus22('Format vidéo invalide.');return}
 objectUrl22=URL.createObjectURL(file);player22.src=objectUrl22;player22.load();videoStatus22('Vidéo locale chargée : les images restent sur cet appareil.');
});
$('loadPose').onclick=async()=>{
 $('loadPose').disabled=true;videoStatus22('Chargement du moteur IA depuis les serveurs externes…');
 try{landmarker22=await window.RetouchePoseV22.modelLoader();modelReady22=true;$('analyzePose').disabled=false;videoStatus22('Moteur prêt. Sélectionner une vidéo puis lancer l’analyse locale.')}catch(e){videoStatus22('Chargement impossible : '+e.message)}
 finally{$('loadPose').disabled=modelReady22}
};
$('cancelPose').onclick=()=>{aborted22=true;videoStatus22('Arrêt demandé : aucune pose partielle ne sera exportée.');};
$('analyzePose').onclick=async()=>{
 if(!modelReady22||!landmarker22){videoStatus22('Moteur non prêt.');return}
 if(!player22.src){videoStatus22('Choisir une vidéo avant l’analyse.');return}
 let duration=player22.duration;if(!Number.isFinite(duration)||duration<.3){videoStatus22('Durée vidéo invalide / codec non compatible.');return}
 if(duration>300){videoStatus22('Cette étape accepte les séquences jusqu’à 5 minutes. Découpe la vidéo en segments pour continuer.');return}
 $('analyzePose').disabled=true;$('cancelPose').disabled=false;$('videoInput').disabled=true;$('modelFile').disabled=true;aborted22=false;
 processed=null;source=null;$('saveGLB').disabled=true;let frames=[],skipped=0,count=Math.ceil(duration*5);const progress=$('videoProgress');progress.max=count;progress.value=0;
 try{
  player22.pause();
  for(let i=0;i<count;i++){
   if(aborted22)throw Error('Analyse interrompue volontairement.');
   let t=Math.min(duration-.001,(i+.5)/5);
   await seek22(player22,t);
   let result=landmarker22.detectForVideo(player22,Math.round(t*1000));
   let pose=normalizeResult22(result,t);
   if(pose)frames.push(pose);else skipped++;
   progress.value=i+1;videoStatus22(`${i+1}/${count} images examinées, ${frames.length} poses retenues, ${skipped} images sans pose exploitable.`);
   await new Promise(resolve=>setTimeout(resolve,0));
  }
  if(aborted22)throw Error('Analyse interrompue volontairement.');
  const doc=buildPoseJson22(frames,{poids_modele:$('modelFile').files[0]?'fichier_local':'officiel_distant',images_traitees:count,poses_retenues:frames.length,sans_pose:skipped,model:'MediaPipe Pose Landmarker Lite',runtime:'web_1.2.3',mode:'video',sampling_fps:5,source_duration_ms:Math.round(duration*1000),source_width:player22.videoWidth,source_height:player22.videoHeight});
  try{setData(doc);resize();videoStatus22(`${frames.length} poses extraites. La maquette 3D est maintenant disponible à droite et exportable en GLB.`)}
  catch(e){processed=null;source=doc;$('saveGLB').disabled=true;$('saveJSON').disabled=false;$('status').textContent='Aucune maquette validée pour cette séquence.';videoStatus22(`${frames.length} poses extraites, mais le rig 3D est refusé : ${e.message}. JSON de points exportable ; aucune géométrie inventée.`)}
 }catch(e){videoStatus22('Analyse non validée : '+e.message)}
 finally{$('analyzePose').disabled=false;$('cancelPose').disabled=true;$('videoInput').disabled=false;$('modelFile').disabled=false}
};
window.RetouchePoseV22={modelFormat:'task_from_local_or_official_url',weightStorage:'browser_memory_only',schema:SCHEMA};
window.RetouchePoseV22={normalizeResult:normalizeResult22,buildPoseJson:buildPoseJson22,modelLoader:loadModel22};

window.addEventListener('resize',resize);setData(demo());resize();
})();
