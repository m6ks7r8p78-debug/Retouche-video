import test from 'node:test';
import assert from 'node:assert/strict';
function element(){
 const listeners=new Map();
 const classList={add(){},remove(){}};
 const e={
  value:'',textContent:'',disabled:false,hidden:false,href:'',children:[],
  classList,
  addEventListener(n,fn){listeners.set(n,fn);},
  emit(n,arg={}){const f=listeners.get(n);assert.equal(typeof f,'function');f(arg);},
  setAttribute(n,v){this[n]=v;},
  removeAttribute(n){if(n==='href')this.href='';},
  appendChild(node){this.children.push(node);},
  replaceChildren(){this.children=[];}
 };
 return e;
}
test('v0.3: un clic prépare et projette le GLB, puis refus n’expose pas l’ancien téléchargement',async()=>{
 const old={document:globalThis.document,window:globalThis.window,fetch:globalThis.fetch};
 const ids=['#view','#prompt','#create','#play','#seek','#clock','#status','#download','#steps','#limits'];
 const e=Object.fromEntries(ids.map(id=>[id,element()]));
 const operations={ellipses:0,frames:[]};
 e['#view'].getContext=()=>({
  clearRect(){},fillRect(){},beginPath(){},
  ellipse(){operations.ellipses++;},fill(){},set fillStyle(s){assert.equal(typeof s,'string');}
 });
 e['#view'].getBoundingClientRect=()=>({width:400,height:300});
 e['#prompt'].value="Une femme brune s'assoit, boit un café, pose sa tasse, puis parle.";
 e['#download'].hidden=true;
 globalThis.document={
  querySelector(id){assert.ok(id in e);return e[id];},
  createElement(tag){assert.equal(tag,'li');return element();},
  addEventListener(){}
 };
 globalThis.window={
  devicePixelRatio:2,addEventListener(){},
  requestAnimationFrame(callback){operations.frames.push(callback);}
 };
 globalThis.fetch=()=>{throw Error('Réception ou téléversement réseau interdit dans ce test');};
 try{
  await import('./film-ui-v03.mjs');
  e['#create'].emit('click');
  assert.equal(e['#download'].hidden,false);
  assert.match(e['#download'].href,/^blob:/);
  assert.ok(operations.ellipses>25);
  assert.equal(e['#steps'].children.length,4);
  assert.equal(e['#play'].disabled,false);
  assert.match(e['#status'].textContent,/Aperçu simplifié disponible/);
  e['#play'].emit('click');assert.equal(operations.frames.length,1);
  operations.frames.shift()(1000); // première frame
  assert.ok(operations.frames.length>0);
  e['#play'].emit('click');
  e['#seek'].value='750';e['#seek'].emit('input');
  assert.match(e['#clock'].textContent,/,/);
  e['#prompt'].value='Une femme boit puis parle.';
  e['#create'].emit('click');
  assert.equal(e['#download'].hidden,true);
  assert.equal(e['#download'].href,'');
  assert.equal(e['#play'].disabled,true);
  assert.match(e['#status'].textContent,/aucune animation 3D/);
 }finally{
  globalThis.document=old.document;
  globalThis.window=old.window;
  globalThis.fetch=old.fetch;
 }
});
