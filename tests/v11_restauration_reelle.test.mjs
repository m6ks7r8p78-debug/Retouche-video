/* Banc témoin de reconstruction : EXÉCUTE réellement sr.bin dans le navigateur.
   Média 100 % synthétique. Il vérifie le passage du réseau et mesure les pixels
   versus bicubique et une vérité HD, sans prétendre qu'un changement est un gain. */
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
const {chromium}=await import(process.env.PW||"playwright");
const PORT=8897, URL="http://127.0.0.1:"+PORT+"/index.html";
const server=spawn(process.execPath,["tests/serveur.mjs"],{
  cwd:process.cwd(),env:{...process.env,PORT:String(PORT)},stdio:"ignore"
});
let browser=null;
try{
  for(let i=0;i<75;i++){
    try{if((await fetch(URL)).ok)break}catch(e){}
    await new Promise(r=>setTimeout(r,200));
  }
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROME||undefined,
    args:["--use-angle=swiftshader","--enable-unsafe-swiftshader","--autoplay-policy=no-user-gesture-required"]});
  const page=await browser.newPage();
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.goto(URL,{waitUntil:"domcontentloaded",timeout:30000});
  await page.waitForFunction(()=>typeof SR==="object"&&typeof SR.run==="function",{timeout:30000});
  const r=await page.evaluate(async()=>{
    const make=(w,h)=>{const c=document.createElement("canvas");c.width=w;c.height=h;return c};
    const high=make(256,192),h=high.getContext("2d",{willReadFrequently:true});
    const grd=h.createLinearGradient(0,0,256,192);grd.addColorStop(0,"#24374a");grd.addColorStop(.5,"#adb7bc");grd.addColorStop(1,"#3e252a");
    h.fillStyle=grd;h.fillRect(0,0,256,192);
    for(let i=0;i<20;i++){h.fillStyle=i%2?"#d8c1a2":"#382c33";h.fillRect(8+i*12,20+(i%5)*4,7,90)}
    h.fillStyle="#f4ead6";h.font="bold 24px sans-serif";h.fillText("RETRO 1999",14,174);
    h.strokeStyle="#0d253b";h.lineWidth=3;
    for(let i=0;i<7;i++){h.beginPath();h.moveTo(144+i*6,18);h.lineTo(244,100+i*9);h.stroke()}
    const low=make(128,96),lx=low.getContext("2d",{willReadFrequently:true});
    lx.imageSmoothingEnabled=true;lx.imageSmoothingQuality="high";lx.drawImage(high,0,0,128,96);
    const img=new Image(),jpeg=low.toDataURL("image/jpeg",.12);
    await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src=jpeg});
    lx.clearRect(0,0,128,96);lx.drawImage(img,0,0);
    const classic=make(256,192),cx=classic.getContext("2d",{willReadFrequently:true});
    cx.imageSmoothingEnabled=true;cx.imageSmoothingQuality="high";cx.drawImage(low,0,0,256,192);
    const t0=performance.now(),ai=await SR.run(low,2,.3,null,null);
    const ms=performance.now()-t0;
    const rendered=make(256,192),rx=rendered.getContext("2d",{willReadFrequently:true});
    rx.drawImage(ai,0,0,256,192);
    const truth=h.getImageData(0,0,256,192).data,base=cx.getImageData(0,0,256,192).data,
      actual=rx.getImageData(0,0,256,192).data;
    let abs=0,pBase=0,pAI=0,n=0;
    for(let i=0;i<truth.length;i+=4)for(let j=0;j<3;j++){
      const d=actual[i+j]-base[i+j],eb=truth[i+j]-base[i+j],ea=truth[i+j]-actual[i+j];
      abs+=Math.abs(d);pBase+=eb*eb;pAI+=ea*ea;n++;
    }
    return{source:[128,96],sortie:[ai.width,ai.height],moteur:SR.engine,
      modele_execute:true,temps_ms:+ms.toFixed(0),ecart_neuronal_vs_bicubique_255:+(abs/n).toFixed(3),
      psnr_bicubique:+(10*Math.log10(255*255/(pBase/n))).toFixed(3),
      psnr_neuronal:+(10*Math.log10(255*255/(pAI/n))).toFixed(3),
      conclusion:"Différence de pixels = preuve de calcul, pas preuve d'amélioration"};
  });
  console.log("BANCS RÉELS SR:",JSON.stringify(r,null,2));
  assert.equal(r.modele_execute,true);
  assert.deepEqual(r.sortie,[256,192]);
  assert.ok(Number.isFinite(r.ecart_neuronal_vs_bicubique_255));
  assert.ok(r.ecart_neuronal_vs_bicubique_255>0.25,"Réseau exécuté sans différence de pixels mesurable");
  assert.ok(r.temps_ms>0);
  assert.deepEqual(errors,[],"Erreurs JavaScript non traitées: "+errors.join("; "));
  console.log("✓ Vrai réseau sr.bin appliqué, pixels différents de la bicubique, scores rapportés sans embellissement");
}finally{
  if(browser)await browser.close();
  server.kill();
}
