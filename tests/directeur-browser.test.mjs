/* Parcours navigateur réel (Chrome headless) de la version expérimentale.
   Ce test n'est pas une preuve de qualité d'image ni de compatibilité Safari. */
import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import os from "node:os";
import { fileURLToPath } from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const port=8787,base="http://127.0.0.1:"+port;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const work=fs.mkdtempSync(path.join(os.tmpdir(),"retouche-dir-"));
const server=spawn(process.execPath,[path.join(root,"tests","serveur.mjs")],{env:{...process.env,PORT:String(port)},stdio:"ignore"});
let browser;
try {
  // Le serveur de test construit une table déterministe de 6 Mo au démarrage.
  let ready=false;
  for(let i=0;i<60;i++){try{const r=await fetch(base+"/index.html");if(r.ok){ready=true;break}}catch(_){}await sleep(250)}
  assert.ok(ready,"serveur de test démarré");
  const pathChrome=process.env.CHROME||"/usr/bin/google-chrome";
  browser=await chromium.launch({headless:true,executablePath:fs.existsSync(pathChrome)?pathChrome:undefined,
    args:["--enable-unsafe-swiftshader","--use-angle=swiftshader","--ignore-gpu-blocklist","--autoplay-policy=no-user-gesture-required"]});
  const page=await browser.newPage({viewport:{width:430,height:932},deviceScaleFactor:3});
  const jsErrors=[];page.on("pageerror",e=>jsErrors.push(String(e)));
  await test("la page démarre avec le Directeur IA et son contrôle qualité",async()=>{
    const resp=await page.goto(base+"/index.html",{waitUntil:"domcontentloaded"});
    assert.equal(resp.status(),200);
    await page.waitForFunction(()=>!!window.DIRECTEUR_IA&&!!window.DIRECTEUR_QUALITE&&!!window.MODELS,{timeout:20000});
    const result=await page.evaluate(()=>({correct:typeof DIRECTEUR_IA.planifier==="function"&&typeof DIRECTEUR_QUALITE.evaluer==="function",
      planHidden:document.querySelector("#dirbox").hidden}));
    assert.equal(result.correct,true);assert.equal(result.planHidden,true);
  });
  await test("import photo + analyse réelle + volet de plan discret",async()=>{
    await page.locator("#fp").setInputFiles(path.join(root,"demo","chat-avant.jpg"));
    await page.waitForFunction(()=>mode==="photo"&&!!PHOTO.last&&!!window.__dirplan,{timeout:25000});
    const p=await page.evaluate(()=>({mode,plan:window.__dirplan,hidden:document.querySelector("#dirbox").hidden,
      text:document.querySelector("#dirsummary").textContent}));
    assert.equal(p.mode,"photo");assert.ok(p.plan.operations.length>=2);
    assert.equal(p.hidden,false);assert.match(p.text,/Directeur IA/);
    assert.ok(p.plan.operations.every(x=>Number.isFinite(x.intensite)));
  });
  await test("profil manuel préservé lors de la nouvelle analyse",async()=>{
    const r=await page.evaluate(()=>{
      PROF.set("naturel",true);
      PHOTO.analyze();
      return {id:PROF.id,manual:PROF.manual,plan:!!window.__dirplan};
    });
    assert.equal(r.id,"naturel");assert.equal(r.manual,true);assert.equal(r.plan,true);
  });
  await test("export local photo : résultat lisible et comparaison technique",async()=>{
    await page.evaluate(()=>{const o=document.querySelector("#o_max");o.checked=false;o.dispatchEvent(new Event("change"))});
    await page.locator("#ex").click();
    await page.waitForFunction(()=>!exporting&&/Terminé !/.test(document.querySelector("#st1").textContent),{timeout:120000});
    const r=await page.evaluate(()=>({type:outBlob&&outBlob.type,size:outBlob&&outBlob.size,quality:window.__dirqualite,report:document.querySelector("#orep_l").textContent}));
    assert.ok(r.size>1000,"sortie photo non vide");assert.ok(/image\//.test(r.type));
    assert.ok(r.quality&&r.quality.compte.compare>0,"contrôle technique photographique déclenché");
    assert.match(r.report,/Comparatif|comparatif/i);
  });
  await test("vidéo de référence synthétique : import, Directeur IA, export local et son",async()=>{
    const clip=path.join(work,"entree.mp4"),out=path.join(work,"sortie.mp4");
    execFileSync("ffmpeg",["-y","-hide_banner","-loglevel","error",
      "-f","lavfi","-i","testsrc2=size=320x180:rate=15",
      "-f","lavfi","-i","sine=frequency=700:sample_rate=44100",
      "-t","2.6","-c:v","libx264","-preset","ultrafast","-pix_fmt","yuv420p",
      "-c:a","aac","-b:a","96k","-shortest","-movflags","+faststart",clip],{timeout:30000});
    await page.locator("#f").setInputFiles(clip);
    await page.waitForFunction(()=>mode==="video"&&v.videoWidth>0,null,{timeout:30000});
    await page.waitForFunction(()=>!!window.__dirplan&&!!window.__prof&&!!window.__prof.m,null,{timeout:90000});
    const p=await page.evaluate(()=>({type:mode,w:v.videoWidth,h:v.videoHeight,plan:window.__dirplan}));
    assert.equal(p.type,"video");assert.equal(p.w,320);assert.equal(p.h,180);
    assert.ok(p.plan.operations.some(x=>x.id==="export"));
    assert.ok(p.plan.zonage&&p.plan.zonage.echantillons>=5,"video local timing samples missing");
    assert.ok(p.plan.zonage.zones.length>=1);
    assert.ok(p.plan.capacites&&p.plan.capacites.disponibles,"browser support registry absent");
    assert.ok(p.plan.capacites.options.every(x=>x.declenchement==="manuel"),"high-risk modules must require manual use");
    await page.evaluate(()=>{
      const ai=document.querySelector("#o_max");ai.checked=false;ai.dispatchEvent(new Event("change"));
      document.querySelector('[data-q="-1"]').click();
    });
    await page.locator("#ex").click();
    await page.waitForFunction(()=>!exporting&&/Terminé|Échec|Impossible/.test(document.querySelector("#st1").textContent),
      null,{timeout:180000});
    const result=await page.evaluate(async()=>{
      const a=new Uint8Array(await outBlob.arrayBuffer());let bytes="";
      for(let i=0;i<a.length;i+=32768)bytes+=String.fromCharCode(...a.subarray(i,i+32768));
      return {size:a.length,base64:btoa(bytes),status:document.querySelector("#st1").textContent,qa:window.__dirqualite};
    });
    assert.match(result.status,/Terminé/);
    assert.ok(result.size>5000,"fichier exporté vide");
    fs.writeFileSync(out,Buffer.from(result.base64,"base64"));
    const streams=JSON.parse(execFileSync("ffprobe",["-v","error","-show_entries",
      "stream=codec_type,width,height,codec_name","-of","json",out]).toString()).streams;
    const video=streams.find(x=>x.codec_type==="video"),audio=streams.find(x=>x.codec_type==="audio");
    assert.ok(video,"piste vidéo absente");assert.ok(audio,"piste audio perdue");
    assert.equal(video.width,320);assert.equal(video.height,180);
    // Le contrôle comparatif post-export peut être différé après l'écriture ; il ne bloque pas la sauvegarde.
    await page.waitForFunction(()=>!!window.__dirqualite,null,{timeout:60000});
    assert.ok(result.qa||await page.evaluate(()=>window.__dirqualite?.compte.compare>0));
  });
  await test("contraste noir/blanc en deux séquences : variations temporelles réellement détectées",async()=>{
    const clip=path.join(work,"deux_lumieres.mp4");
    execFileSync("ffmpeg",["-y","-hide_banner","-loglevel","error",
      "-f","lavfi","-i","color=c=black:s=320x180:r=15:d=2",
      "-f","lavfi","-i","color=c=white:s=320x180:r=15:d=2",
      "-filter_complex","[0:v][1:v]concat=n=2:v=1:a=0[v]",
      "-map","[v]","-c:v","libx264","-preset","ultrafast",
      "-pix_fmt","yuv420p","-movflags","+faststart",clip],{timeout:30000});
    await page.locator("#f").setInputFiles(clip);
    await page.waitForFunction(()=>mode==="video"&&curFile&&curFile.name==="deux_lumieres.mp4"&&v.videoWidth===320,null,{timeout:30000});
    await page.waitForFunction(()=>window.__dirplan&&window.__dirplan.zonage&&window.__dirplan.zonage.echantillons>=6,null,{timeout:90000});
    const p=await page.evaluate(()=>window.__dirplan.zonage);
    assert.ok(p.zones.length>=2,"forte variation de luminance non détectée");
    assert.equal(p.zones[0].etat.lumiere,"sombre");
    assert.equal(p.zones[p.zones.length-1].etat.lumiere,"normale");
    assert.ok(p.zones.every(x=>x.precision.includes("approximatives")));
  });
  await test("débruitage temporel : variation appliquée aux images exportées, sans profil manuel",async()=>{
    const clip=path.join(work,"deux_bruits.mp4");
    execFileSync("ffmpeg",["-y","-hide_banner","-loglevel","error",
      "-f","lavfi","-i","color=c=gray:s=320x180:r=15:d=3",
      "-f","lavfi","-i","color=c=gray:s=320x180:r=15:d=3",
      "-filter_complex","[0:v]noise=alls=55:allf=t+u[n];[n][1:v]concat=n=2:v=1:a=0[v]",
      "-map","[v]","-c:v","libx264","-preset","ultrafast",
      "-pix_fmt","yuv420p","-movflags","+faststart",clip],{timeout:30000});
    await page.evaluate(()=>{
      localStorage.removeItem("profil");PROF.manual=false;
      const ia=document.querySelector("#o_max");ia.checked=false;ia.dispatchEvent(new Event("change"));
    });
    await page.locator("#f").setInputFiles(clip);
    await page.waitForFunction(()=>curFile?.name==="deux_bruits.mp4"&&!!window.__dirplan?.zonage&&!!window.__prof?.m,null,{timeout:90000});
    const data=await page.evaluate(()=>({
      zonage:window.__dirplan.zonage,
      noise:window.__prof.m.noise,
      manual:PROF.manual
    }));
    assert.equal(data.manual,false);
    assert.ok(data.zonage.zones.length>=2,"noise transition not detected");
    const candidate=await page.evaluate(()=>DIRECTEUR_RENDU.preparer({
      zonage:window.__dirplan.zonage,bruitGlobal:window.__prof.m.noise,activer:true,manuel:false,ia:false}));
    assert.ok(candidate.actif,"moderate denoise adaptation unexpectedly unavailable");
    await page.evaluate(()=>document.querySelector('[data-q="-1"]').click());
    await page.locator("#ex").click();
    await page.waitForFunction(()=>!exporting&&/Terminé|Échec|Impossible/.test(document.querySelector("#st1").textContent),null,{timeout:180000});
    const result=await page.evaluate(()=>({st:document.querySelector("#st1").textContent,
      adapt:window.__dirRendu,
      recipe:document.querySelector("#recipe").textContent}));
    assert.match(result.st,/Terminé/);
    assert.equal(result.adapt?.actif,true);
    assert.ok(result.adapt.imagesAdaptees>5,"no frames used the adaptive denoiser");
    assert.ok(Math.abs(result.adapt.facteurMax-1)>.003||Math.abs(result.adapt.facteurMin-1)>.003);
    assert.ok(result.adapt.netteteMin>=.84&&result.adapt.netteteMin<=1,"dangerous sharpening coefficient");
    assert.ok(result.adapt.imagesNettete>5,"temporal sharpness protection not used on noisy segment");
    assert.ok(result.adapt.netteteMin<1,"no measurable reduction of sharpening");
    assert.match(result.recipe,/adaptation_temporelle/);
    assert.match(result.recipe,/netteteMin/);
    await page.evaluate(()=>{const a=document.querySelector("#r_dn");a.value=".25";a.dispatchEvent(new Event("input"))});
    assert.equal(await page.evaluate(()=>window.__dirDnManuel),true);
  });
  await test("aucune erreur JavaScript non gérée pendant le parcours",async()=>{
    assert.deepEqual(jsErrors,[]);
  });
} finally {
  if(browser)await browser.close();
  server.kill("SIGTERM");
  fs.rmSync(work,{recursive:true,force:true});
}
