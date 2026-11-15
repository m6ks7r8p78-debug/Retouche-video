/* NOVA — attestation volontaire d'identité du MP4 produit AVANT partage.
 * Ne téléverse rien : hash SHA-256 du MP4 exporté dans le navigateur.
 * L'empreinte identifie ce fichier et ne doit être partagée que volontairement.
 * Ne contient jamais son nom, ses pixels, la bande audio, ni les PTS individuels.
 */
var NOVA_OUTPUT_IDENTITY=(()=>{
"use strict";
const schema="retoucheproai.nova.local-export-identity.v1";
const allowedBrands=new Set(["isom","iso5","iso6","mp41","mp42","avc1","avc3","M4V ","qt  "]);
const safeInt=n=>Number.isSafeInteger(n)&&n>=0?n:null;
const hashValid=h=>typeof h==="string"&&/^[0-9a-f]{64}$/.test(h);
const wh=n=>Number.isSafeInteger(n)&&n>=2&&n<=16384?n:null;
const frameCount=n=>Number.isSafeInteger(n)&&n>=1&&n<=100000?n:null;
const msec=n=>Number.isSafeInteger(n)&&n>=0&&n<=86400000?n:null;
function header(bytes){
 if(!(bytes instanceof Uint8Array)||bytes.length<12||
    String.fromCharCode(...bytes.subarray(4,8))!=="ftyp")
  throw new Error("signature MP4 non vérifiable");
 const v=String.fromCharCode(...bytes.subarray(8,12));
 return allowedBrands.has(v)?v:"other";
}
async function inspect(blob,claim={},opts={}){
 if(!(blob instanceof Blob)||blob.size<1024||blob.size>64*1048576)
  throw new Error("fichier MP4 hors budget");
 const probe=opts.probe||globalThis.NOVA_DEMUX?.analyser;
 if(typeof probe!=="function")throw new Error("analyseur MP4 absent");
 const info=await probe(blob);
 if(!info||![info.W,info.H,info.dw,info.dh,info.ns].every(
    n=>Number.isSafeInteger(n)&&n>0))
  throw new Error("index vidéo final illisible");
 const brand=header(new Uint8Array(await blob.slice(0,12).arrayBuffer()));
 const webcrypto=opts.crypto||globalThis.crypto;
 if(!webcrypto?.subtle?.digest)throw new Error("SHA-256 non disponible dans Safari");
 const raw=await blob.arrayBuffer();
 const bytes=new Uint8Array(await webcrypto.subtle.digest("SHA-256",raw));
 const sha=Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("");
 if(!hashValid(sha))throw new Error("empreinte SHA-256 incorrecte");
 const actual={codedWidth:wh(info.W),codedHeight:wh(info.H),
  width:wh(info.dw),height:wh(info.dh),frames:frameCount(info.ns),
  durationMs:msec(Math.round(info.durationUs/1000))};
 const declared={width:wh(claim.originalWidth),height:wh(claim.originalHeight),
  frames:frameCount(claim.sourceFrames)};
 const matchesClaim=actual.width===declared.width&&
  actual.height===declared.height&&actual.frames===declared.frames;
 return Object.freeze({schema,proof:"sha256-of-local-export-before-sharing",
  sizeBytes:blob.size,sha256:sha,majorBrand:brand,
  video:Object.freeze(actual),novaClaim:Object.freeze(declared),
  matchesClaim,audioMode:["aac-copy","aac-native-encode"].includes(claim.audioMode)?
   claim.audioMode:"not-confirmed",
  privacy:Object.freeze({localOnly:true,mediaIncluded:false,filenameIncluded:false,
   originalMediaHashed:false,exportedFileFingerprintIncluded:true}),
  limitation:"Identité du MP4 avant partage ; ne certifie pas la fidélité visuelle ou sonore de la source."});
}
function serialiser(v){
 if(!v||v.schema!==schema||!hashValid(v.sha256)||
   typeof v.matchesClaim!=="boolean")
  throw new TypeError("preuve MP4 inconnue");
 const e=v.video||{},c=v.novaClaim||{};
 const safe={
  schema,proof:"sha256-of-local-export-before-sharing",
  sizeBytes:safeInt(v.sizeBytes),sha256:v.sha256,
  majorBrand:allowedBrands.has(v.majorBrand)?v.majorBrand:"other",
  video:{codedWidth:wh(e.codedWidth),codedHeight:wh(e.codedHeight),
   width:wh(e.width),height:wh(e.height),frames:frameCount(e.frames),
   durationMs:msec(e.durationMs)},
  novaClaim:{width:wh(c.width),height:wh(c.height),frames:frameCount(c.frames)},
  matchesClaim:v.matchesClaim,
  audioMode:["aac-copy","aac-native-encode"].includes(v.audioMode)?
   v.audioMode:"not-confirmed",
  privacy:{localOnly:true,mediaIncluded:false,filenameIncluded:false,
   originalMediaHashed:false,exportedFileFingerprintIncluded:true},
  limitation:"Identité du MP4 avant partage ; ne certifie pas la fidélité visuelle ou sonore de la source."
 };
 if(!safe.sizeBytes||!safe.video.width||!safe.video.height||!safe.video.frames)
  throw new TypeError("preuve MP4 incomplète");
 return JSON.stringify(safe,null,2)+"\n";
}
return Object.freeze({inspect,serialiser});
})();
if(typeof module!=="undefined"&&module.exports)module.exports=NOVA_OUTPUT_IDENTITY;
