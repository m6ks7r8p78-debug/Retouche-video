/* BANC RÉEL NEURONAL : vidéo SYNTHÉTIQUE 0,7 s, aucun média privé,
   aucun Cloudflare/Kaggle ; vérifie MP4 H264/AAC et absence de blocage.
   Nécessite PW=.../playwright/index.mjs + médias tests/creer_medias.py. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {spawn,execFileSync} from "node:child_process";
import {fileURLToPath} from "node:url";
const {chromium}=await import(process.env.PW||"playwright");
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const MED=path.join(ROOT,"tests","medias"),OUT=path.join(ROOT,"tests","sorties_aube_v11");
fs.mkdirSync(OUT,{recursive:true});
const original=path.join(MED,"video_vieuxtel.mp4");
if(!fs.existsSync(original))throw new Error("Créer les médias tests/creer_medias.py");
const sample=path.join(OUT,"source_0_7_s_neuronal.mp4");
execFileSync("ffmpeg",["-nostdin","-v","error","-y","-i",original,"-t","0.7",
  "-c:v","libx264","-preset","veryfast","-c:a","aac","-movflags","+faststart",sample],
  {timeout:40000});
const server=spawn(process.execPath,["tests/serveur.mjs"],{
  cwd:ROOT,env:{...process.env,PORT:"8898"},stdio:"ignore"});
const address="http://127.0.0.1:8898/index.html";
let browser;
try{
  for(let i=0;i<60;i++){
    try{if((await fetch(address)).ok)break}catch{}
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  browser=await chromium.launch({executablePath:process.env.CHROME||undefined,args:["--use-angle=swiftshader",
      "--enable-unsafe-swiftshader","--autoplay-policy=no-user-gesture-required"]});
  const ctx=await browser.newContext({viewport:{width:390,height:844},
      isMobile:true,hasTouch:true,acceptDownloads:true});
  const page=await ctx.newPage(),errors=[];
  page.on("pageerror",e=>errors.push(e.message));
  await page.goto(address,{waitUntil:"domcontentloaded"});
  await page.waitForFunction(()=>!!window.__aube?.etapes,null,{timeout:25000});
  await page.evaluate(()=>localStorage.setItem("autorisations",
       JSON.stringify({modele:{ok:true}})));
  await page.locator("#f").setInputFiles(sample);
  await page.waitForFunction(()=>typeof v!=="undefined"&&v.videoWidth>0,null,{timeout:30000});
  /* Épreuve neurale (pas un export classique) : résolution native pour garder un
     coût expérimental mesurable sur le navigateur logiciel, IA locale ACTIVÉE. */
  await page.locator('#ab-quality [data-ab-q="-1"]').click();
  await page.evaluate(()=>{
    localStorage.setItem("iak","1");
    const o=document.querySelector("#o_max");o.checked=true;
    o.dispatchEvent(new Event("change",{bubbles:true}));
  });
  const start=Date.now();
  await page.locator("#ab-enhance").click();
  await page.waitForFunction(()=>{
    const status=document.querySelector("#st1")?.textContent||"";
    return /Terminé/.test(status)&&document.querySelector("#out")?.hidden===false;
  },null,{timeout:300000});
  const elapsed=(Date.now()-start)/1000;
  assert.ok(elapsed<300,"Traitement neural vidéo 0,7 s trop long : "+elapsed+" s");
  const diag=await page.evaluate(()=>({
    ia:document.querySelector("#o_max")?.checked||false,
    summary:document.querySelector("#auto_result_summary")?.textContent||"",
    status:document.querySelector("#st1")?.textContent||"",
    ready:document.querySelector("#out")?.hidden===false,
    proof:SRX.proof?{...SRX.proof}:null,
    iak:window.IAK?.stats?.()||null,
    engine:window.SR?.engine||null
  }));
  assert.ok(diag.ready);
  assert.equal(diag.ia,true,"IA explicitement demandée ; impossible de confondre avec le standard");
  assert.ok(diag.proof?.samples>0,"Le comparateur de pixels du vrai export IA n'a pas été exécuté");
  assert.ok(diag.proof.sumMAD/diag.proof.samples>.1,"La sortie vidéo IA ressemble trop à l'agrandissement classique");
  assert.ok(diag.iak?.cles>0,"Aucune vraie image clé calculée par le réseau");
  assert.deepEqual(errors,[],"Erreurs JavaScript page : "+errors.join("; "));
  const dl=page.waitForEvent("download",{timeout:30000});
  await page.locator("#ab-save").click();
  const d=await dl,filename=path.join(OUT,"export_07s_neuronal_"+d.suggestedFilename());
  await d.saveAs(filename);
  assert.ok(fs.statSync(filename).size>1024);
  const meta=JSON.parse(execFileSync("ffprobe",["-v","error","-show_entries",
    "stream=codec_type,codec_name,width,height:format=duration","-of","json",filename]).toString());
  assert.ok(meta.streams.some(s=>s.codec_type==="video"&&s.codec_name==="h264"),
    "La vraie piste vidéo H264 est obligatoire");
  assert.ok(meta.streams.some(s=>s.codec_type==="audio"&&s.codec_name==="aac"),
    "La vraie piste sonore AAC doit être conservée");
  const dur=Number(meta.format.duration);
  assert.ok(dur>=0.45&&dur<=1.3,"Durée sortie 0,7 s différente : "+dur);
  assert.match(diag.summary,/Réseau IA appliqué/i,"Le résultat doit indiquer la participation du réseau");
  assert.ok(meta.streams.some(st=>st.codec_type==="video"&&st.width===480&&st.height===270),
     "On valide le parcours neuronal à la résolution SOURCE, pas une fausse 4K");
  console.log(JSON.stringify({status:"PASS",input_duration_s:0.7,
    total_walltime_s:Number(elapsed.toFixed(2)),output_duration_s:dur,
    video_codec:"h264",audio_codec:"aac",ia_vraie:true,reseau:diag.engine,
    iak:diag.iak,ecart_pixels_final_vs_classique_255:+(diag.proof.sumMAD/diag.proof.samples).toFixed(3),
    environment:"Google Chrome Linux, médias synthétiques, PAS Safari iPhone physique",
    guarantee_4k_under_15_minutes:"NON TESTÉ"},null,2));
  await ctx.close();
}finally{
  if(browser)await browser.close();
  server.kill("SIGTERM");
}
