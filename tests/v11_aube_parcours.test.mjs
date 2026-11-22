/* Parcours AUBE v11 + PR92 de bout en bout dans Chromium (390, 430, 1440 px) — vrais fichiers, vrai moteur, aucune simulation.
   Reprise v11.1 : PW=…/playwright/index.mjs node tests/v11_aube_parcours.test.mjs
   Ne remplace pas un essai sur iPhone Safari physique. */
import fs from "node:fs";
import path from "node:path";
import {spawn,execFileSync} from "node:child_process";
const {chromium}=await import(process.env.PW||"playwright");
const APP=process.cwd(),PORT=8892,MED=path.join(APP,"tests/medias");
const OUT=path.join(process.cwd(),"tests/sorties_aube_v11");fs.mkdirSync(OUT,{recursive:true});
const srv=spawn(process.execPath,["tests/serveur.mjs"],{cwd:APP,env:{...process.env,PORT:String(PORT)},stdio:"ignore"});
let browser,passed=0,failed=0;
const ok=(v,m)=>{console.log((v?"✓ ":"✗ ")+m);if(v)passed++;else failed++};
const addr="http://127.0.0.1:"+PORT+"/index.html";
async function wait(){for(let i=0;i<50;i++){try{if((await fetch(addr)).ok)return}catch{}await new Promise(r=>setTimeout(r,240))}throw Error("Serveur inaccessible")}
const probe=f=>JSON.parse(execFileSync("ffprobe",["-v","error","-show_entries","stream=codec_type,codec_name,width,height","-show_entries","format=duration","-of","json",f]).toString());
const noIA=p=>p.evaluate(()=>{const e=document.querySelector("#o_max");if(e&&e.checked){e.checked=false;e.dispatchEvent(new Event("change"))}});
async function ctxFor(viewport,scheme){const mobile=viewport.width<600;
 const ctx=await browser.newContext({viewport,colorScheme:scheme,isMobile:mobile,hasTouch:mobile,acceptDownloads:true});
 const page=await ctx.newPage();const errs=[];page.on("pageerror",e=>errs.push(e.message));
 await page.goto(addr,{waitUntil:"domcontentloaded"});await page.waitForFunction(()=>!!window.__aube?.etapes,null,{timeout:20000});
 return {ctx,page,errs}}
const analysed=p=>p.waitForFunction(()=>!document.querySelector("#rec").hidden&&/mesuré|Aucun défaut|repéré|bon état/.test(document.querySelector("#rec_t").textContent),null,{timeout:120000});
try{
 await wait();
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROME||undefined,args:["--use-angle=swiftshader","--enable-unsafe-swiftshader","--autoplay-policy=no-user-gesture-required"]});
 for(const [viewport,scheme] of [[{width:390,height:844},"dark"],[{width:430,height:932},"light"],[{width:1440,height:900},"dark"]]){
  const W=viewport.width+" "+scheme;const {ctx,page,errs}=await ctxFor(viewport,scheme);
  ok(await page.locator("#ab-start").isVisible(),W+" : accueil AUBE, bouton « Réveiller un souvenir » visible");
  const box=await page.locator("#ab-start").boundingBox();ok(box&&box.y+box.height<=viewport.height,W+" : bouton principal visible sans défiler");
  ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),W+" : aucun défilement latéral");
  ok(await page.evaluate(()=>[...document.querySelectorAll("header.top,main.studio,nav.dock")].every(e=>getComputedStyle(e).display==="none")),W+" : ancienne interface absente");
  const small=await page.evaluate(()=>[...document.querySelectorAll("#aube-root button,#ab-import button")].filter(b=>b.offsetParent&&b.getBoundingClientRect().height<40).map(b=>b.id||b.textContent.trim().slice(0,20)));
  ok(small.length===0,W+" : zones tactiles ≥ 40 px ("+(small.join(", ")||"toutes")+")");
  await page.locator("#ab-start").click();
  ok(await page.locator("#ab-pick-photo").isVisible()&&await page.locator("#ab-pick-video").isVisible(),W+" : choix photo / vidéo");
  for(const [btn,inp] of [["#ab-pick-photo","fp"],["#ab-pick-video","f"]]){
   await page.locator("#ab-start").click().catch(()=>{});
   const fc=page.waitForEvent("filechooser",{timeout:5000}).catch(()=>null);await page.locator(btn).click();const ch=await fc;
   ok(!!ch&&(await ch.element().getAttribute("id"))===inp,W+" : "+btn+" ouvre le vrai sélecteur #"+inp);
  }
  await page.keyboard.press("Escape");
  // outils avancés : chaque raccourci ouvre la vraie fonction
  await page.evaluate(()=>__aube.ouvrirOutils());
  for(const [proxy,inp] of [["pickv","fv"],["picke","fe"],["pickm","fm"]]){
   await page.evaluate(()=>__aube.ouvrirOutils());
   const fc=page.waitForEvent("filechooser",{timeout:5000}).catch(()=>null);await page.locator('[data-ab-proxy="'+proxy+'"]').click();const ch=await fc;
   ok(!!ch&&(await ch.element().getAttribute("id"))===inp,W+" : outil "+proxy+" → sélecteur #"+inp);
   await page.keyboard.press("Escape");
  }
  await page.evaluate(()=>__aube.ouvrirOutils());await page.locator('[data-ab-proxy="mdlb"]').click();
  ok(await page.locator("#mdl").isVisible(),W+" : « Gérer les modèles IA » ouvre le gestionnaire");
  await page.locator("#mdlx").click();
  await page.evaluate(()=>__aube.ouvrirOutils());await page.locator('[data-ab-proxy="stb"]').click();
  ok(await page.evaluate(()=>[...document.querySelectorAll("dialog")].some(d=>d.open)),W+" : « Paramètres » ouvre la fenêtre des paramètres");
  await page.evaluate(()=>document.querySelectorAll("dialog[open]").forEach(d=>d.close()));
  await page.evaluate(()=>__aube.ouvrirOutils());await page.locator("#ab-expert").click();
  ok(await page.evaluate(()=>!document.body.classList.contains("simple")),W+" : Mode expert activable");
  await page.locator("#ab-expert").click();ok(await page.evaluate(()=>document.body.classList.contains("simple")),W+" : retour au mode simple");
  await page.keyboard.press("Escape");
  // PHOTO réelle
  await noIA(page);
  await page.locator("#fp").setInputFiles(path.join(MED,"visage_vieuxtel.jpg"));
  try{
   await analysed(page);
   ok(await page.locator("#ab-steps-work").isVisible()&&!await page.locator(".ab-journey").isVisible(),W+" : étapes de travail sans doublon de l’accueil");
   ok(await page.locator("#cv").isVisible(),W+" : vrai aperçu photo");
   ok(await page.locator("#ab-media-name").innerText()==="visage_vieuxtel.jpg"&&/Ko|Mo/.test(await page.locator("#ab-media-detail").innerText()),W+" : nom et taille réels");
   ok(await page.locator("#rec_l").isVisible()&&await page.locator("#rec_l li").count()>=1,W+" : défauts mesurés et corrections affichés");
   for(const pr of ["naturel","details","equilibre"]){await page.locator("#ab-profiles [data-ab-prof='"+pr+"']").click();
    ok(await page.locator("#prof [data-prof='"+pr+"']").getAttribute("aria-pressed")==="true"&&await page.evaluate(x=>PROF.id===x,pr),W+" : profil "+pr+" appliqué au moteur");}
   ok(await page.locator("#ab-quality-group").isHidden(),W+" : pas de choix de résolution pour une photo");
   await page.locator("#ab-enhance").click();
   const sawBusy=await page.waitForFunction(()=>document.body.classList.contains("ab-processing"),null,{timeout:8000}).then(()=>true).catch(()=>false);
   await page.waitForFunction(()=>/Terminé/.test(document.querySelector("#st1").textContent)&&!document.querySelector("#out").hidden,null,{timeout:300000});
   ok(sawBusy,W+" : écran de traitement affiché pendant la photo (sans pourcentage inventé)");
   ok(await page.locator("#ab-outcome").isVisible()&&await page.locator("#pv").isVisible(),W+" : résultat + comparateur avant/après");
   await page.evaluate(()=>{const s=document.querySelector("#pvs");s.value=250;s.dispatchEvent(new Event("input"))});
   ok(/inset/.test(await page.evaluate(()=>document.querySelector("#pvla").style.clipPath)),W+" : curseur avant/après opérationnel");
   const dl=page.waitForEvent("download",{timeout:20000});await page.locator("#ab-save").click();const d=await dl;
   const f=path.join(OUT,viewport.width+"-photo-"+d.suggestedFilename());await d.saveAs(f);
   const dim=execFileSync("python3",["-c","from PIL import Image;import sys;im=Image.open(sys.argv[1]);im.load();print(*im.size)",f]).toString().trim();
   const nat=await page.evaluate(()=>window.__photoNat);
   ok(fs.statSync(f).size>5000&&Number(dim.split(" ")[0])>nat[0],W+" : photo enregistrée et lisible ("+d.suggestedFilename()+", "+nat.join("×")+" → "+dim+")");
  }catch(e){ok(false,W+" : photo réelle — "+e.message.split("\n")[0])}
  // VIDÉO réelle (une seule taille d’écran : le calcul est long sans carte graphique)
  if(viewport.width===390){
   try{
    await page.locator("#f").setInputFiles(path.join(MED,"video_vieuxtel.mp4"));
    await page.waitForFunction(()=>typeof v!=="undefined"&&v.videoWidth>0,null,{timeout:30000});await analysed(page).catch(()=>{});await noIA(page);
    ok(await page.locator("#ab-quality-group").isVisible()&&await page.locator("#ab-x-toggle").isVisible(),"Vidéo : résolution et option X proposées");
    for(const q of ["3840","-1","1920"]){await page.locator('#ab-quality [data-ab-q="'+q+'"]').click();ok(await page.evaluate(x=>document.querySelector("#q").value===x,q),"Vidéo : résolution "+q+" appliquée au moteur");}
    await page.locator("#ab-x-toggle").click();ok(await page.evaluate(()=>document.querySelector("#o_x").checked),"Vidéo : « Préparer pour X » relié à #o_x");
    await page.locator("#ab-x-toggle").click();
    // annulation
    await page.locator("#ab-enhance").click();
    await page.waitForFunction(()=>document.body.classList.contains("ab-processing"),null,{timeout:15000});
    await page.waitForFunction(()=>!document.querySelector("#ab-cancel").disabled,null,{timeout:20000});
    await page.waitForTimeout(1600);await page.locator("#ab-cancel").click();
    await page.waitForFunction(()=>document.querySelector("#pg").hidden,null,{timeout:60000});
    ok(/annul/i.test(await page.locator("#st1").innerText())&&!await page.locator("#ab-progress-overlay").isVisible(),"Vidéo : annulation réelle ("+(await page.locator("#st1").innerText()).slice(0,60)+")");
    // export complet
    const seen=new Set();await page.locator("#ab-enhance").click();
    await page.waitForFunction(()=>document.body.classList.contains("ab-processing"),null,{timeout:15000});
    for(let i=0;i<900;i++){const s=await page.evaluate(()=>({p:document.querySelector("#ab-percent").textContent,pg:Math.floor(document.querySelector("#pg").value*100),hid:document.querySelector("#pg").hidden}));
     if(s.hid)break;seen.add(s.p+"|"+s.pg);await page.waitForTimeout(400);}
    const coherent=[...seen].every(x=>{const [a,b]=x.split("|");return Math.abs(parseInt(a)-Number(b))<=3});
    ok(seen.size>=3&&coherent,"Vidéo : pourcentage AUBE = progression réelle du moteur ("+seen.size+" valeurs)");
    await page.waitForFunction(()=>/Terminé/.test(document.querySelector("#st1").textContent),null,{timeout:60000});
    ok(await page.locator("#ab-outcome").isVisible()&&await page.locator("#ab-render").isVisible(),"Vidéo : écran de résultat");
    const dl=page.waitForEvent("download",{timeout:30000});await page.locator("#ab-save").click();const d=await dl;
    const f=path.join(OUT,"video-"+d.suggestedFilename());await d.saveAs(f);const pr=probe(f);
    const vs=pr.streams.find(s=>s.codec_type==="video"),as=pr.streams.find(s=>s.codec_type==="audio");
    ok(vs&&vs.height>=1080&&as&&Number(pr.format.duration)>1,"Vidéo : fichier MP4 valide ("+vs?.codec_name+" "+vs?.width+"×"+vs?.height+", son "+(as?.codec_name||"absent")+", "+Number(pr.format.duration).toFixed(1)+" s)");
   }catch(e){
      const diagnostic=await page.evaluate(()=>{
       const v0=typeof v!=="undefined"?v:null;
       const fi=document.querySelector("#f");
       const status=document.querySelector("#st1");
       return {mode:typeof mode!=="undefined"?mode:"inconnu",
        exporting:typeof exporting!=="undefined"?exporting:null,
        exStarting:!!window.__exStarting,
        inputCount:fi?.files?.length||0,inputName:fi?.files?.[0]?.name||null,
        videoWidth:v0?.videoWidth||0,videoHeight:v0?.videoHeight||0,
        readyState:v0?.readyState,networkState:v0?.networkState,
        videoErrorCode:v0?.error?.code||null,videoErrorMessage:v0?.error?.message||null,
        hasVideoSource:!!v0?.currentSrc,videoPaused:v0?.paused,
        outputHidden:document.querySelector("#out")?.hidden,
        appStatus:status?.textContent?.slice(0,150),
        codecSupport:document.createElement("video").canPlayType('video/mp4; codecs="avc1.4D401F"')
       };
      }).catch(x=>({captureError:String(x)}));
      console.log("DIAGNOSTIC_IMPORT_VIDEO_APRES_PHOTO "+JSON.stringify(diagnostic));
      ok(false,"Vidéo réelle — "+e.message.split("\n")[0]);
    }
  }
  ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),W+" : aucun défilement latéral après traitement");
  ok(errs.length===0,W+" : aucune exception JavaScript ("+errs.slice(0,2).join("; ")+")");
  await ctx.close();
 }
 // hors ligne : Service Worker installé puis rechargement sans réseau
 {const ctx=await browser.newContext({viewport:{width:390,height:844}});const page=await ctx.newPage();
  await page.goto(addr);/* l'app n'enregistre le SW que sur retoucheproai.com : on enregistre le même sw.js ici */
  await page.evaluate(()=>navigator.serviceWorker.register("sw.js"));await page.waitForFunction(()=>navigator.serviceWorker.ready.then(()=>true),null,{timeout:60000});
  await page.reload();await page.waitForFunction(async()=>{const k=await caches.keys();return k.some(x=>/^retouche-v/.test(x))},null,{timeout:60000});
  await page.waitForTimeout(3000);await ctx.setOffline(true);
  let good=false;try{await page.reload({timeout:20000});good=await page.waitForFunction(()=>!!window.__aube?.etapes,null,{timeout:20000}).then(()=>true)}catch{}
  ok(good,"Hors ligne : AUBE se recharge sans réseau (Service Worker)");await ctx.close();}
}finally{if(browser)await browser.close();srv.kill("SIGTERM")}
console.log("AUBE : "+passed+" réussis, "+failed+" échoués");
process.exitCode=failed?1:0;
