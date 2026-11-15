/* NOVA 0.19 — Adaptateur local HEVC -> VideoFrame I420 -> Canvas.
 * Pilote SDR dont les composantes BT.709 sont signalées dans colr.
 * nclc ne fournit pas le bit full-range : vérifier le SPS/VUI HEVC
 * de façon indépendante avant de définir la VideoFrame comme limitée.
 * Le décodeur MIT est versionné dans experiences/vendor/hevc.
 * Les trames sont traitées en flux, sans enregistrer toute la séquence.
 */
var NOVA_HEVC_RENDER=(()=>{
"use strict";
const fail=s=>{throw new Error("HEVC WASM pilote : "+s)};
let loading=null;
function metadata(info){
 if(!info||!/^(hvc1|hev1)\./.test(info.codec||""))fail("MOV/MP4 HEVC requis");
 if(!globalThis.NOVA_PTS||!globalThis.NOVA_DEMUX||!globalThis.NOVA_HEVC_LAB||
    !globalThis.NOVA_HEVC_VUI)
  fail("modules de restauration HEVC ou audit SPS/VUI manquants");
 NOVA_DEMUX.exigerPresentationFidele(info);
 const bitstream=NOVA_HEVC_VUI.analyser(info); // vérifie la gamme/VUI et colr
 const c=info.color;
 if(bitstream.fullRange||bitstream.lumaBits!==8||bitstream.chromaBits!==8)
  fail("SPS/VUI HEVC hors de la plage vidéo limitée 8 bits");
 if(!c||!["nclc","nclx"].includes(c.kind)||c.primaries!==1||
     c.transfer!==1||c.matrix!==1||c.fullRange===true)
  fail("paramètres colorimétriques BT.709 SDR requis ; pas de HDR/P3 ni de pleine plage identifiée");
 if(!Number.isSafeInteger(info.durationUs)||info.durationUs<=0||
    info.durationUs>12e6||info.W*info.H>640*360||
    info.W%2||info.H%2||info.ns<1||info.ns>90)
  fail("limites : 12 s, 640×360, 90 échantillons ou durée inconnue");
 const plan=NOVA_PTS.planifier(info);
 if(plan.sorted.length!==plan.nonnegative.length||
    plan.premierPTS!==0||plan.dernierPTS>=info.durationUs||
    info.durationUs-plan.dernierPTS>250000)
  fail("horodatages vidéo / preroll / durée incohérents");
 return Object.freeze({width:info.dw,height:info.dh,
   encodedWidth:info.W,encodedHeight:info.H,codec:info.codec,
   durationSeconds:info.durationUs/1e6,frames:info.ns,
   ptsUs:plan.nonnegative.map(x=>x.ptsUs),
   firstPTSUs:plan.premierPTS,lastPTSUs:plan.dernierPTS});
}
function local(path){
 const u=new URL(path,document.baseURI);
 if(u.origin!==location.origin)fail("aucun chargement externe autorisé");
 return u.href;
}
async function charger(){
 if(loading)return loading;
 loading=(async()=>{
  if(typeof globalThis.HEVCDecoderModule!=="function"){
   await new Promise((resolve,reject)=>{
    const s=document.createElement("script");
    s.src=local("vendor/hevc/wasm/hevc-decode.js");
    s.onload=resolve;s.onerror=()=>reject(new Error("Script HEVC local indisponible"));
    document.head.append(s);
   });
  }
  if(typeof globalThis.HEVCDecoderModule!=="function")
   fail("moteur HEVC local invalide");
  const mod=await import("./vendor/hevc/decoder-entry.js");
  if(typeof mod.HEVCDecoder?.create!=="function")fail("module décodeur absent");
  return Object.freeze({HEVCDecoder:mod.HEVCDecoder,
   wasmBinaryUrl:local("vendor/hevc/wasm/hevc-decode.wasm")});
 })();
 try{return await loading}catch(e){loading=null;throw e}
}
function imageI420(frame,ptsUs){
 if(!frame||frame.bitDepth!==8||frame.width%2||frame.height%2)
  fail("source HEVC 8 bits 4:2:0 paire exigée");
 const y=frame.width*frame.height,c=y/4;
 if(frame.y.length!==y||frame.cb.length!==c||frame.cr.length!==c)
  fail("plans YUV 4:2:0 invalides");
 const pixels=new Uint8Array(y+2*c);let at=0;
 for(const plane of [frame.y,frame.cb,frame.cr])
  for(let i=0;i<plane.length;i++){
   if(!Number.isInteger(plane[i])||plane[i]>255)fail("pixel YUV 8 bits invalide");
   pixels[at++]=plane[i];
  }
 const vf=new VideoFrame(pixels,{format:"I420",codedWidth:frame.width,
  codedHeight:frame.height,timestamp:ptsUs,
  colorSpace:{primaries:"bt709",transfer:"bt709",matrix:"bt709",fullRange:false}});
 if(vf.format!=="I420"||vf.codedWidth!==frame.width||
    vf.codedHeight!==frame.height){
  vf.close();fail("WebCodecs I420 non supporté");
 }
 return vf;
}
function dessiner(frame,ptsUs,info,canvas){
 const ctx=canvas?.getContext("2d",{willReadFrequently:true});
 if(!ctx||!canvas.width||!canvas.height)fail("surface de rendu indisponible");
 const vf=imageI420(frame,ptsUs);
 try{
  const sx=canvas.width/info.dw,sy=canvas.height/info.dh,m=info.mat;
  ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.setTransform(m[0]*sx,m[1]*sy,m[2]*sx,m[3]*sy,m[4]*sx,m[5]*sy);
  ctx.drawImage(vf,0,0,info.W,info.H);
 }finally{ctx.setTransform(1,0,0,1,0,0);vf.close()}
}
async function rendre(file,info,{timeline,canvas,onOutput,signal}={}){
 const source=metadata(info);
 if(!timeline?.entries?.length||typeof onOutput!=="function")
  fail("sortie ou timeline manquante");
 if(signal?.aborted)fail("export annulé");
 const plan=NOVA_PTS.planifier(info);
 const selection=timeline.entries.map(e=>NOVA_PTS.choisirProche(
  plan.nonnegative,Math.min(source.durationSeconds-.001,e.seekSeconds),15));
 if(selection.some((x,i)=>i&&x.ptsUs<selection[i-1].ptsUs))
  fail("sélection non monotone");
 const wasm=await charger();
 let emitted=0,previousRank=-1,repetitions=0,sautsDeSource=0;
 const metrics=await NOVA_HEVC_LAB.decoderFlux(file,{...wasm,signal,
  onFrame:async({frame,index,ptsUs})=>{
   while(emitted<selection.length&&selection[emitted].ptsUs===ptsUs){
    if(signal?.aborted)fail("export annulé");
    dessiner(frame,ptsUs,info,canvas);
    if(previousRank===index)repetitions++;
    if(previousRank>=0&&index>previousRank+1)
     sautsDeSource+=index-previousRank-1;
    previousRank=index;
    await onOutput(timeline.entries[emitted],
     Object.freeze({rank:index,selectedPTSUs:ptsUs,sourceIndex:selection[emitted].index}));
    emitted++;
   }
  }
 });
 if(emitted!==selection.length)fail("images de sortie HEVC manquantes");
 return Object.freeze({frames:emitted,repetitions,sautsDeSource,
   firstPTSUs:selection[0].ptsUs,lastPTSUs:selection.at(-1).ptsUs,metrics});
}
return Object.freeze({metadata,charger,imageI420,dessiner,rendre});
})();
if(typeof module!=="undefined"&&module.exports)module.exports=NOVA_HEVC_RENDER;
