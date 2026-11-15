/* RetoucheProAI — prototype 8K hors navigateur.
 * Lance FFmpeg localement sur une machine/instance autorisée, sans transfert réseau.
 * Résolution de conteneur 8K ≠ récupération de détails natifs.
 * Un chemin séparé : aucune modification des exports iPhone actuels.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const MAX_LONG=7680,MAX_PIXELS=7680*4320;
const valide=v=>Number.isInteger(v)&&v>0;
export function dimensions8k(w,h){
  if(!valide(w)||!valide(h))throw new RangeError("Dimensions source invalides");
  const scale=Math.min(MAX_LONG/Math.max(w,h),Math.sqrt(MAX_PIXELS/(w*h)));
  const largeur=Math.max(2,Math.floor(w*scale/2)*2);
  const hauteur=Math.max(2,Math.floor(h*scale/2)*2);
  if(largeur>MAX_LONG||hauteur>MAX_LONG||largeur*hauteur>MAX_PIXELS)
    throw new RangeError("Dimensions 8K incompatibles avec le budget de pixels");
  return {largeur,hauteur,agrandi:scale>1.001,maximumPixels:MAX_PIXELS};
}
export function argumentsFFmpeg({entree,sortie,largeur,hauteur,preset="medium",crf=20}){
  if(!entree||!sortie||resolve(entree)===resolve(sortie))throw new Error("Source et destination distinctes requises");
  if(!valide(largeur)||!valide(hauteur)||largeur>MAX_LONG||hauteur>MAX_LONG||
     largeur*hauteur>MAX_PIXELS||largeur%2||hauteur%2)throw new RangeError("Résolution hors limite");
  if(!["ultrafast","superfast","veryfast","faster","fast","medium","slow"].includes(preset))
    throw new RangeError("Préréglage encodeur non autorisé");
  if(!Number.isInteger(crf)||crf<14||crf>32)throw new RangeError("CRF non autorisé");
  return ["-hide_banner","-nostdin","-loglevel","error","-y","-i",entree,
    "-map","0:v:0","-map","0:a?","-vf",`scale=${largeur}:${hauteur}:flags=lanczos,format=yuv420p`,
    "-c:v","libx264","-profile:v","high","-level:v","6.2",
    "-preset",preset,"-crf",String(crf),"-threads","2",
    "-c:a","aac","-b:a","160k","-movflags","+faststart",sortie];
}
function lancer(commande,args,delai){
  const r=spawnSync(commande,args,{encoding:"utf8",timeout:delai,maxBuffer:2*1024*1024});
  if(r.error||r.status!==0)throw new Error(commande+" : "+(r.stderr||r.error?.message||"échec").slice(0,600));
  return r.stdout;
}
export function preparer(entree,sortie,{preset="medium",crf=20}={}){
  if(!entree||!sortie||resolve(entree)===resolve(sortie)||!existsSync(entree))
    throw new Error("Fichier d'entrée existant et destination distincte requis");
  const info=JSON.parse(lancer("ffprobe",["-v","error","-select_streams","v:0",
    "-show_entries","stream=width,height,codec_name","-of","json",entree],30000));
  const video=info.streams?.[0];
  if(!video)throw new Error("Aucun flux vidéo lisible");
  const cible=dimensions8k(video.width,video.height);
  return {entree,sortie,source:{largeur:video.width,hauteur:video.height},
    cible,arguments:argumentsFFmpeg({entree,sortie,largeur:cible.largeur,hauteur:cible.hauteur,preset,crf})};
}
export function convertir(entree,sortie,options={}){
  const plan=preparer(entree,sortie,options);
  lancer("ffmpeg",plan.arguments,options.timeoutMs||30*60*1000);
  return {source:plan.source,cible:plan.cible,sortie,encodeur:"libx264 H.264 Level 6.2",
    provenance:"Redimensionnement Lanczos. Ne reconstitue pas de détails absents."};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const args=process.argv.slice(2),i=args.indexOf("--input"),o=args.indexOf("--output");
  if(i<0||o<0||!args[i+1]||!args[o+1]){
    console.error("Usage : node outils/export-8k.mjs --input entree.mp4 --output resultat-8k.mp4 [--preset ultrafast] [--crf 20]");
    process.exitCode=2;
  }else{
    try{
      const p=args.indexOf("--preset"),c=args.indexOf("--crf");
      const options={};
      if(p>=0)options.preset=args[p+1];
      if(c>=0)options.crf=Number(args[c+1]);
      console.log(JSON.stringify(convertir(args[i+1],args[o+1],options)));
    }catch(e){console.error(e.message);process.exitCode=1}
  }
}
