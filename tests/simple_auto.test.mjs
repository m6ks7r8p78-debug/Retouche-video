/* Parcours grand public sans navigateur : le bouton unique choisit automatiquement
   la meilleure option REALISTE, la vidéo n'est jamais envoyée sans autorisation.
   Lancer : node tests/simple_auto.test.mjs */
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import {fileURLToPath} from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const code=fs.readFileSync(path.join(root,"mode-simple.js"),"utf8");
const budget=fs.readFileSync(path.join(root,"budget-ia.js"),"utf8");
const html=fs.readFileSync(path.join(root,"index.html"),"utf8");
const app=fs.readFileSync(path.join(root,"app.js"),"utf8");
assert.match(html,/id="auto_note"/);assert.match(html,/id="auto_tweaks"/);assert.match(html,/id="auto_reprocess"/);
assert.match(html,/body\.simple #qwrap/);assert.match(html,/body\.simple #sai/);
assert.match(app,/window\.__simpleExportDone/);assert.match(app,/window\.__simpleRefresh/);
let pass=0;
function scene({w=848,h=480,d=.7,remote=false,local=true,mode="video"}={}){
  const names=["#o_max","#o_srv","#s_ia","#s_iah","#ex","#modeb","#q","#auto_note",
    "#auto_tweaks","#auto_result_summary","#auto_reprocess","#auto_tweaks_note","#o_cine","#o_dust"];
  const els=Object.fromEntries(names.map(k=>[k,{checked:k==="#o_max",value:k==="#q"?"1920":"",hidden:true,
    textContent:"",listeners:{},dataset:{},setAttribute(k,v){this[k]=v},addEventListener(type,fn){this.listeners[type]=fn},
    dispatchEvent(e){this.listeners[e.type]?.(e)},click(){this.listeners.click?.()}}]));
  const tweaks=["natural","sharp","light"].map(kind=>({dataset:{autoRetouch:kind},setAttribute(k,v){this[k]=v}}));
  const document={listeners:{},addEventListener(type,fn){this.listeners[type]=fn},body:{classList:{toggle(){}}},querySelector:s=>els[s]||null,querySelectorAll:s=>s==="[data-auto-retouch]"?tweaks:[]};
  const data=new Map([["ui_mode","simple"]]);
  const localStorage={getItem:k=>data.has(k)?data.get(k):null,setItem:(k,v)=>data.set(k,String(v))};
  const win={KG:{actif:()=>remote},VideoDecoder:remote?function(){}:undefined,
    SR:{fits:()=>local,casc:(W,H,s)=>s>=2.6&&W*H<=1100000},MODELS:{isOff:()=>false},
    IAK:{actif:()=>true},scrollTo(){},};
  const mock={window:win,document,localStorage,Event:class{constructor(type){this.type=type}},
    showTab(){},mode,v:{videoWidth:w,videoHeight:h,duration:d},curFile:{},exporting:false,
    trimRange:()=>[0,d],OFPS:30,SR:win.SR,
    outDims:(W,H,L)=>{if(L<0)return[W,H];const s=Math.min(L/Math.max(W,H),L*9/16/Math.min(W,H));return[Math.round(W*s/2)*2,Math.round(H*s/2)*2]},
    PROF:{set(id){win.profile=id}},P:{br:0},sync(){},draw(){}};
  Object.assign(mock,{IABUDGET:vm.runInNewContext(budget+"\nIABUDGET",{})});
  win.IABUDGET=mock.IABUDGET;
  vm.runInNewContext(code,mock);
  return{els,tweaks,win,mock,data,document};
}
{
 const x=scene();x.els["#ex"].listeners.click();
 assert.equal(x.els["#o_max"].checked,false);
 assert.equal(x.els["#o_srv"].checked,false);
 assert.equal(x.els["#q"].value,"1920");
 assert.match(x.els["#auto_note"].textContent,/sans reconstruction IA/);
 pass++;console.log("✓ sans GPU : un clic -> amélioration rapide, aucune fausse restauration");
}
{
 const x=scene({remote:true});x.els["#ex"].listeners.click();
 assert.equal(x.els["#o_max"].checked,true);
 assert.equal(x.els["#o_srv"].checked,true);
 assert.equal(x.els["#q"].value,"3840");
 assert.match(x.els["#auto_note"].textContent,/accord/);
 pass++;console.log("✓ GPU autorisé : un clic -> IA distante 4K avec accord explicite dans l'export");
}
{
 const x=scene({w:160,h:120,local:true});
 x.els["#ex"].listeners.click();
 assert.equal(x.els["#o_max"].checked,true);
 assert.equal(x.els["#o_srv"].checked,false);
 assert.equal(x.els["#q"].value,"3840");
 pass++;console.log("✓ petite source : choix automatique de la vraie IA locale dans le budget");
}
{
 const x=scene({local:false});x.els["#ex"].listeners.click();
 assert.equal(x.els["#o_max"].checked,false);
 assert.equal(x.els["#o_srv"].checked,false);
 pass++;console.log("✓ moteur local indisponible : pas d'attente ni de faux résultat IA");
}
{
 const x=scene();x.win.__simpleExportDone({width:1920,height:1080,frames:21,iaFrames:0});
 assert.equal(x.els["#auto_tweaks"].hidden,false);
 assert.match(x.els["#auto_result_summary"].textContent,/sans reconstruction IA/);
 x.tweaks[1].onclick();assert.equal(x.win.profile,"details");
 assert.equal(x.els["#auto_reprocess"].hidden,false);
 pass++;console.log("✓ après résultat : retouches facultatives, premier export conservé");
}
{
 const x=scene({local:false});
 x.els["#q"].value="3840";
 x.document.listeners.click({target:{closest:selector=>selector==="[data-ab-q]"?{dataset:{abQ:"3840"}}:null}});
 x.els["#ex"].listeners.click();
 assert.equal(x.els["#q"].value,"3840","AUBE 4K manuelle ne doit PAS revenir à Full HD");
 assert.equal(x.els["#o_max"].checked,true,"IA manuelle préservée ; le moteur vérifiera son propre budget");
 pass++;console.log("✓ AUBE : résolution 4K explicitement choisie non écrasée par le plan Auto");
}
{
 const x=scene({local:false});
 x.els["#q"].value="3840";
 x.document.listeners.click({target:{closest:()=>({dataset:{abQ:"3840"}})}});
 x.document.listeners.change({target:{id:"f"}});
 x.els["#ex"].listeners.click();
 assert.equal(x.els["#q"].value,"1920","nouvelle vidéo : le mode Auto doit revenir");
 pass++;console.log("✓ nouvel import : le choix manuel précédent ne bloque pas l'automatisation");
}
{
 const x=scene();
 x.els["#ex"].textContent="Annuler";
 x.mock.exporting=true;
 x.win.__simpleRefresh();
 assert.equal(x.els["#ex"].textContent,"Annuler",
   "AUBE doit reconnaître l'état annulable pendant un export");
 x.mock.exporting=false;
 x.win.__simpleRefresh();
 assert.equal(x.els["#ex"].textContent,"Annuler",
   "le rafraîchissement intermédiaire ne doit pas masquer Annuler");
 pass++;console.log("✓ conversion vidéo : Auto ne masque plus le bouton Annuler d'AUBE");
}
console.log("Résultat : "+pass+"/"+pass+" scénarios fonctionnels (sans GPU réel).");
