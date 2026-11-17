import test from 'node:test';
import assert from 'node:assert/strict';
import {createExportFile,canShareLocally,shareLocalFile,GLB_NAME,DIAG_NAME} from './film-share-v07.mjs';

const validGlb=()=>new Uint8Array([103,108,84,70,2,0,0,0,24,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]);
const validReport=()=>JSON.stringify({
 schema:'retoucheproai.film-studio.device-diagnostic.v0.6',
 privacy:{sentToServer:false,userPromptIncluded:false,userAgentIncluded:false,videoOrPhotoIncluded:false},
 validation:{physicalIPhoneCertified:false}
});
test('génère uniquement un fichier GLB ou un rapport de diagnostic local conforme',async()=>{
 const glb=createExportFile('glb',validGlb());
 assert.equal(glb.name,GLB_NAME);
 assert.equal(glb.type,'model/gltf-binary');
 assert.equal(glb.size,24);
 const report=createExportFile('diagnostic',validReport());
 assert.equal(report.name,DIAG_NAME);
 assert.equal(report.type,'application/json');
 assert.match(await report.text(),/userPromptIncluded/);
});
test('refuse un média ou un rapport privé mal formé',()=>{
 assert.throws(()=>createExportFile('photo',validGlb()),/Format/);
 assert.throws(()=>createExportFile('glb',new Uint8Array(50)),/En-tête/);
 assert.throws(()=>createExportFile('diagnostic',JSON.stringify({prompt:'privé'})),/périmètre/);
 assert.throws(()=>createExportFile('diagnostic',JSON.stringify({
  ...JSON.parse(validReport()),privacy:{...JSON.parse(validReport()).privacy,userAgentIncluded:true}
 })),/périmètre/);
});
test('ne propose le partage natif que s’il prend les fichiers en charge',()=>{
 const file=createExportFile('glb',validGlb());
 assert.equal(canShareLocally(file,{native:{}}),false);
 assert.equal(canShareLocally(file,{native:{share:()=>{},canShare:()=>false}}),false);
 assert.equal(canShareLocally(file,{native:{share:()=>{},canShare:()=>true}}),true);
 assert.equal(canShareLocally(file,{native:{share:()=>{},canShare:()=>{throw Error('unsupported');}}}),false);
});
test('le partage explicite ne transmet que le fichier sélectionné',async()=>{
 const file=createExportFile('glb',validGlb());
 const seen=[];
 const native={canShare:({files})=>files.length===1,share:async payload=>{seen.push(payload);}};
 const result=await shareLocalFile(file,{native});
 assert.equal(result.status,'transmis_au_panneau_de_partage');
 assert.equal(seen.length,1);
 assert.deepEqual(Object.keys(seen[0]),['files']);
 assert.equal(seen[0].files[0],file);
});
test('l’annulation, le refus de capacité et l’échec ne prétendent pas enregistrer un fichier',async()=>{
 const file=createExportFile('glb',validGlb());
 assert.equal((await shareLocalFile(file,{native:{}})).status,'non_disponible');
 const canceled=await shareLocalFile(file,{native:{
  canShare:()=>true,share:()=>Promise.reject(Object.assign(new Error('annulé'),{name:'AbortError'}))
 }});
 assert.equal(canceled.status,'annule');
 const failed=await shareLocalFile(file,{native:{canShare:()=>true,share:()=>Promise.reject(new Error('export'))}});
 assert.equal(failed.status,'echec');
 assert.match(failed.reason,/téléchargement/);
});
