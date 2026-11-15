/* NOVA HD 0.28 : preuve couleur progressive HEVC, sans préjuger du colr.
 * Un MOV iPhone peut omettre/laisser "unspecified" dans colr tout en ayant
 * un SPS/VUI et/ou des VideoFrame SDR 709 explicitement signalés.
 * Les couleurs HDR/P3 reconnues ne doivent PAS être renommées BT.709.
 */
var NOVA_HD_COLOR=(()=>{
"use strict";
const err=s=>{throw new Error("NOVA HD couleur : "+s)};
const recognized=x=>x?.kind==="nclc"||x?.kind==="nclx";
const known=x=>Number.isInteger(x)&&x!==0&&x!==2;
// H.273: matrix 5/6 = BT.601 PAL/NTSC, 9 = BT.2020 NCL. Les
// primaires 9/12 et transferts PQ/HLG restent exclus de ce moteur SDR.
const SDR_XFER=new Set([1,6,13]);
const VIDEO_XFER=new Set(["bt709","smpte170m","iec61966-2-1"]);
const SDR_PRIMARIES=new Map([[1,"bt709"],[5,"bt470bg"],[6,"smpte170m"]]);
const SDR_MATRICES=new Map([[1,"bt709"],[5,"bt470bg"],
 [6,"smpte170m"],[9,"bt2020-ncl"]]);
const VIDEO_PRIMARIES=new Set(SDR_PRIMARIES.values());
const VIDEO_MATRICES=new Set(SDR_MATRICES.values());
const matrixEquivalent=(a,b)=>a===b||
 a==="bt470bg"&&b==="smpte170m"||
 a==="smpte170m"&&b==="bt470bg";
const matrixCodeEquivalent=(a,b)=>a===b||[a,b].every(x=>x===5||x===6);
function hvcSps(info){
 if(!/^(hvc1|hev1)\./.test(info?.codec||""))return null;
 if(!globalThis.NOVA_HEVC_ANNEXB?.configuration||
    !globalThis.NOVA_HEVC_VUI?.lireSPS)return null;
 try{
  const config=NOVA_HEVC_ANNEXB.configuration(info.desc);
  const nals=config.parameterSets.filter(n=>((n[0]>>1)&63)===33);
  if(!nals.length||nals.length>8)return null;
  const all=nals.map(NOVA_HEVC_VUI.lireSPS),ref=all[0];
  if(all.some(x=>JSON.stringify(x)!==JSON.stringify(ref)))
   err("SPS multiples contradictoires");
  if(ref.width!==info.W||ref.height!==info.H)
   err("dimensions SPS et MOV contradictoires");
  if(ref.chroma!==1||ref.lumaBits!==8||ref.chromaBits!==8)
   err("HEVC hors 8 bits 4:2:0 : conversion non certifiée");
  return ref;
 }catch(e){
  if(String(e?.message||"").startsWith("NOVA HD couleur :"))throw e;
  return null; // Pas de preuve SPS exploitable ; le décodeur reste un recours.
 }
}
function metadata(info){
 if(!info||!Number.isSafeInteger(info.W)||!Number.isSafeInteger(info.H))
  err("métadonnées MP4 invalides");
 if(info.pixelAspect&&info.pixelAspect.h!==info.pixelAspect.v)
  err("pixels anamorphiques : géométrie non conservable");
 const c=info.color,s=hvcSps(info);
 if(c&&!recognized(c))err("profil colr ICC/inconnu non certifiable");
 const colors=[c,s].filter(Boolean);
 for(const x of colors){
  if(known(x.primaries)&&!SDR_PRIMARIES.has(x.primaries))
   err("gamut HDR/P3/BT2020 explicitement identifié, conversion SDR non autorisée");
  if(known(x.transfer)&&!SDR_XFER.has(x.transfer))
   err("transfert HDR/PQ/HLG explicitement identifié, conversion SDR non autorisée");
  if(known(x.matrix)&&!SDR_MATRICES.has(x.matrix))
   err("matrice source hors profils SDR pris en charge");
  // La plage entière n'est pas du HDR. Une fois confirmée par le
  // décodeur, Canvas sRGB -> I420 limité réalise une conversion de plage.
 }
 // Ne jamais ignorer deux identifications connues et contradictoires.
 if(c&&s)for(const k of ["primaries","transfer","matrix"]){
  if(known(c[k])&&known(s[k])&&c[k]!==s[k]&&
     !(k==="transfer"&&[1,6].includes(c[k])&&[1,6].includes(s[k]))&&
     !(k==="matrix"&&matrixCodeEquivalent(c[k],s[k])))
   err("colr MOV et SPS/VUI contradictoires");
 }
 if(c&&s&&c.fullRange!==null&&c.fullRange!==undefined&&
    c.fullRange!==s.fullRange)err("plage entre colr et SPS/VUI contradictoire");
 const explicit=x=>!!x&&SDR_PRIMARIES.has(x.primaries)&&
    SDR_XFER.has(x.transfer)&&SDR_MATRICES.has(x.matrix)&&
    typeof x.fullRange==="boolean";
 const confirmed=explicit(s)||explicit(c);
 const sourceMatrix=known(s?.matrix)?s.matrix:
  known(c?.matrix)?c.matrix:null;
 const sourcePrimaries=known(s?.primaries)?s.primaries:
  known(c?.primaries)?c.primaries:null;
 const mode=sourceMatrix===5||sourceMatrix===6?"bt601":
  sourceMatrix===9?"bt2020-matrix":"bt709";
 const kind=explicit(s)?"hevc-sps-vui-"+mode:
  explicit(c)?"mp4-colr-"+mode:"pending-decoded-frame";
 return Object.freeze({kind,confirmed,needsFrameCheck:true,
  colrPresent:!!c,spsVerified:explicit(s),sourceTransfer:
   s?.transfer===13||c?.transfer===13?"srgb":"bt709-or-unspecified",
  sourceFullRange:typeof s?.fullRange==="boolean"?s.fullRange:
   typeof c?.fullRange==="boolean"?c.fullRange:null,
  sourceMatrix,sourcePrimaries,
  sourceTransferCode:known(s?.transfer)?s.transfer:known(c?.transfer)?c.transfer:null,
  expectedMatrix:sourceMatrix===null?null:SDR_MATRICES.get(sourceMatrix),
  expectedPrimaries:sourcePrimaries===null?null:SDR_PRIMARIES.get(sourcePrimaries),
  processing:"native VideoFrame -> color-managed Canvas sRGB -> I420 BT.709"});
}
function verifyFrame(frame,evidence){
 if(!frame||!evidence)err("image native ou preuve couleur absente");
 const cs=frame.colorSpace||{},p=cs.primaries,t=cs.transfer,
  matrix=cs.matrix,range=cs.fullRange;
 if(p!==null&&p!==undefined&&!VIDEO_PRIMARIES.has(p))
  err("trame décodée gamut incompatible : "+String(p));
 if(t!==null&&t!==undefined&&!VIDEO_XFER.has(t))
  err("trame décodée HDR ou transfert incompatible : "+String(t));
 if(matrix!==null&&matrix!==undefined&&!VIDEO_MATRICES.has(matrix))
  err("trame décodée matrice hors SDR : "+String(matrix));
 if(evidence.expectedPrimaries&&p&&p!==evidence.expectedPrimaries)
  err("primaires MOV/SPS et trame décodée contradictoires");
 if(evidence.expectedMatrix&&matrix&&
    !matrixEquivalent(matrix,evidence.expectedMatrix))
  err("matrice MOV/SPS et trame décodée contradictoires (source "+
   evidence.expectedMatrix+", décodeur "+String(matrix)+")");
 if(typeof range==="boolean"&&typeof evidence.sourceFullRange==="boolean"&&
    range!==evidence.sourceFullRange)
  err("plage déclarée et décodée contradictoires");
 const full=VIDEO_PRIMARIES.has(p)&&VIDEO_XFER.has(t)&&
  VIDEO_MATRICES.has(matrix)&&typeof range==="boolean";
 if(!full&&!evidence.confirmed)
  err("couleur insuffisamment signalée par colr, SPS et VideoFrame");
 // Si la source est en plage complète, exigence de preuve vidéo : ne pas
 // prétendre que le décodeur l'a correctement traitée sans indication.
 if(evidence.sourceFullRange===true&&range!==true)
  err("plage complète source non vérifiable après décodage");
 const matrixName=matrix||evidence.expectedMatrix||"unknown";
 const convertedMatrix=matrixName==="bt470bg"||matrixName==="smpte170m"||
  matrixName==="bt2020-ncl";
 return Object.freeze({method:full?
    (convertedMatrix?"decoded-frame-sdr-matrix-to-bt709":
      range?"decoded-frame-sdr-full-to-limited":"decoded-frame-bt709"):
    evidence.kind,
  spsVerified:evidence.spsVerified,frameFullyTagged:full,
  sourceTransfer:evidence.sourceTransfer,sourceMatrix:evidence.sourceMatrix,
  decodedMatrix:matrixName,rangeConversion:range===true,
  matrixConversion:convertedMatrix,
  processing:"browser color-managed Canvas sRGB to BT709 limited; verify visual fidelity"});
}
/* Sortie native opaque Safari : le décodeur matériel peut avoir déjà
 * normalisé la matrice et ne plus exposer les plans YUV. WebCodecs impose
 * au Canvas de convertir les couleurs déclarées de la trame vers sRGB.
 * Ce rendu conserve le visuel effectivement présenté par le navigateur,
 * MAIS il ne prouve pas l'identité avec le BT.601 source. Ne jamais
 * prétendre que la matrice a été réparée ou les pixels vérifiés.
 * Un utilisateur peut comparer avec la vidéo d'origine avant d'adopter
 * l'export. Jamais utilisé pour des sources HDR/P3/BT2020.
 */
function renduNatifOpaque(frame,evidence){
 const p=frame?.colorSpace||{};
 // Colr/SPS peuvent ne préciser que la matrice BT.601, sans primaires
 // ni transfert. Safari fournit parfois toute l'information SDR décodée.
 // Dans ce cas, l'export reproduit l'affichage Safari mais n'est PAS
 // qualifié comme conversion fidèle des métadonnées de la source.
 const nativeFullySpecified=VIDEO_PRIMARIES.has(p.primaries)&&
  VIDEO_XFER.has(p.transfer)&&p.matrix==="bt709"&&
  typeof p.fullRange==="boolean";
 if(!nativeFullySpecified||![5,6].includes(evidence?.sourceMatrix)||
    !["bt470bg","smpte170m"].includes(evidence.expectedMatrix)||
    !VIDEO_PRIMARIES.has(p.primaries)||
    (evidence.expectedPrimaries&&p.primaries!==evidence.expectedPrimaries)||
    p.matrix!=="bt709"||
    !VIDEO_XFER.has(p.transfer)||
    typeof p.fullRange!=="boolean"||
    p.fullRange!==evidence.sourceFullRange)
  err("rendu natif opaque non certifiable (espace ou plage couleur non conforme)");
 return {frame,owned:false,proof:Object.freeze({
  method:"native-safari-sdr-bt709-display",
  sourceMatrix:evidence.expectedMatrix,
  decodedMatrix:p.matrix,
  sourceTransfer:evidence.sourceTransfer,
  matrixConversion:false,rangeConversion:false,
  frameFullyTagged:true,sourceMismatch:true,
  colorFidelity:"uncertified-against-source",
  warning:"Le fichier annonce BT.601 et le décodeur annonce BT.709. " +
   "Le rendu natif du navigateur est utilisé sans réétiqueter les pixels. " +
   "Comparer les couleurs de l'export à celles de l'original.",
  processing:"VideoFrame natif -> Canvas sRGB -> I420 BT709 limité"
 })};
}
// Certains décodeurs Chrome retournent une trame YUV de matrice "bt709"
// alors que le MOV et le SPS spécifient BT.601. Ne PAS ignorer cette
// contradiction : recoller une preuve couleur sur les échantillons YUV bruts,
// en ne manipulant pas la vidéo privée en dehors du navigateur.
// Ce parcours expérimental est interdit aux images opaques/RGB/HDR, et
// dispose d'un bilan distinct pour un contrôle perceptuel ultérieur.
async function imagePourRendu(frame,evidence,VideoFrameClass=globalThis.VideoFrame){
 try{
  const proof=verifyFrame(frame,evidence);
  return {frame,owned:false,proof};
 }catch(e){
  const p=frame?.colorSpace||{};
  const expected=evidence?.expectedMatrix;
  const acceptableMismatch=expected&&SDR_MATRICES.has(evidence.sourceMatrix)&&
   p.matrix==="bt709"&&!matrixEquivalent(p.matrix,expected)&&
   VIDEO_PRIMARIES.has(p.primaries)&&VIDEO_XFER.has(p.transfer)&&
   (!evidence.expectedPrimaries||p.primaries===evidence.expectedPrimaries)&&
   (evidence.sourceFullRange===null||evidence.sourceFullRange===p.fullRange);
  if(!acceptableMismatch)throw e;
  // Safari HEVC matériel : format=null signifie plan YUV inaccessible.
  // La trame possède néanmoins une couleur BT709 décodée déclarée.
  // Le rendu natif est permis uniquement dans ce cas SDR clairement borné.
  // Le navigateur peut livrer une frame SDR affichable mais pas un plan
  // YUV copiable : format RGB, pixel format non exposé, accès hardware
  // restreint, rectangle manquant, ou constructeur VideoFrame qui ne
  // permet pas de ré-étiqueter le YUV.  Ne pas renvoyer l'ancien refus
  // si Canvas peut dessiner la frame avec sa couleur native annoncée.
  // Les formats 10/12 bit et alpha restent exclus de cette voie SDR.
  const drawableNative=new Set([
    "I420","NV12","I422","I444","RGBA","RGBX","BGRA","BGRX"
  ]);
  const canNative=frame.format==null||drawableNative.has(frame.format);
  const fallback=()=>{
   if(!canNative)throw e;
   return renduNatifOpaque(frame,evidence);
  };
  if(frame.format==null)return fallback();
  if(!["I420","NV12"].includes(frame.format)||
     !VideoFrameClass||typeof frame.allocationSize!=="function"||
     typeof frame.copyTo!=="function")return fallback();
  const originalRect=frame.codedRect;
  if(!originalRect)return fallback();
  const options={rect:originalRect};
  let size,layout,data;
  try{
   size=frame.allocationSize(options);
   if(!Number.isSafeInteger(size)||size<1||size>12*1048576)
    err("plan YUV hors budget");
   data=new Uint8Array(size);
   layout=await frame.copyTo(data,options);
  }catch(copyError){
   // Safari peut refuser la lecture YUV pour une image matérielle sans
   // que cette image soit invalide pour Canvas. On bascule seulement pour
   // les erreurs indiquant une opération non prise en charge; les autres
   // restent visibles (fichier corrompu, mémoire, etc.).
   if(["NotSupportedError","TypeError"].includes(copyError?.name))
    return fallback();
   throw copyError;
  }
  const transfer=evidence.sourceTransferCode===6?"smpte170m":
   evidence.sourceTransferCode===13?"iec61966-2-1":
    evidence.sourceTransferCode===1?"bt709":p.transfer;
  let corrected;
  try{
   corrected=new VideoFrameClass(data,{format:frame.format,
    codedWidth:frame.codedWidth,codedHeight:frame.codedHeight,
    visibleRect:frame.visibleRect,
    displayWidth:frame.displayWidth,displayHeight:frame.displayHeight,
    layout,timestamp:frame.timestamp,...(frame.duration!=null?{duration:frame.duration}:{}),
    colorSpace:{primaries:evidence.expectedPrimaries||p.primaries,
      transfer,matrix:expected,
      fullRange:evidence.sourceFullRange??p.fullRange}
   });
   const v=verifyFrame(corrected,evidence);
   return {frame:corrected,owned:true,proof:Object.freeze({...v,
    method:"raw-yuv-source-matrix-correction",colorFidelity:"source-matrix-confirmed",
    decoderReportedMatrix:p.matrix,
    sourceMatrix:expected,
    limitation:"Correction de métadonnées YUV sur trame 8 bits brute ; vérifier la fidélité visuelle avec l'original."})};
  }catch(error){
   try{corrected?.close()}catch{}
   // L'étiquetage/reconstruction YUV8 peut être interdit alors que la
   // VideoFrame native est affichable. Ne pas camoufler un échec couleur,
   // seulement un format/constructeur matériel refusé.
   if(["NotSupportedError","TypeError"].includes(error?.name))
    return fallback();
   throw error;
  }
 }
}
function report(info){
 const c=recognized(info?.color)?info.color:null;
 const fields=x=>x?{primaries:Number.isInteger(x.primaries)?x.primaries:null,
   transfer:Number.isInteger(x.transfer)?x.transfer:null,
   matrix:Number.isInteger(x.matrix)?x.matrix:null,
   fullRange:typeof x.fullRange==="boolean"?x.fullRange:null}:null;
 let evidence=null,warning=null,sps=null;
 try{evidence=metadata(info)}
 catch(e){warning=String(e?.message||"").slice(0,180)}
 try{sps=hvcSps(info)}catch{}
 return Object.freeze({
  schema:"retoucheproai.nova.hd-color.v1",
  colr:fields(c),hevcSpsPresent:!!sps,
  hevcSpsColor:fields(sps),
  evidence:evidence?.kind??null,
  expectedMatrix:evidence?.expectedMatrix??null,
  sourceTransfer:evidence?.sourceTransfer??null,
  warning,
  explanation:"Informations techniques locales seulement. L'absence de colr ne prouve ni SDR ni HDR. Aucun média transmis."
 });
}
return Object.freeze({metadata,verifyFrame,imagePourRendu,report});
})();
if(typeof module!=="undefined"&&module.exports)module.exports=NOVA_HD_COLOR;
