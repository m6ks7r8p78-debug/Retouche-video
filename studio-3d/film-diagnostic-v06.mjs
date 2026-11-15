/** Film Studio v0.6 — diagnostic local, volontaire et non-identifiant.
 * Aucune connexion, aucun prompt, UA, adresse IP, identité ou donnée privée.
 * Les mesures de cadence sur WebKit Linux NE valident pas l'iPhone physique.
 */
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const round=(n,digits=2)=>Number(n.toFixed(digits));
const quantile=(sorted,fraction)=>{
 const pos=(sorted.length-1)*fraction;
 const lower=Math.floor(pos),upper=Math.ceil(pos);
 return sorted[lower]+(sorted[upper]-sorted[lower])*(pos-lower);
};
function analyzeFrameCadence(timestamps){
 if(!Array.isArray(timestamps)||timestamps.length<3||
    timestamps.length>600||timestamps.some(n=>!finite(n))||
    timestamps.some((n,i)=>i>0&&n<=timestamps[i-1]))
   throw Error('Échantillon de cadence absent, invalide ou incomplet.');
 const intervals=timestamps.slice(1).map((n,i)=>n-timestamps[i]);
 const sorted=[...intervals].sort((a,b)=>a-b);
 const median=quantile(sorted,.5),p95=quantile(sorted,.95);
 const mean=intervals.reduce((a,b)=>a+b,0)/intervals.length;
 return {
  frameSamples:intervals.length,
  meanFrameMs:round(mean),
  medianFrameMs:round(median),
  p95FrameMs:round(p95),
  effectiveFps:round(1000/mean,1),
  slowFramesOver50ms:intervals.filter(n=>n>50).length
 };
}
function makeLocalDiagnostic({backend,canvasWidth,canvasHeight,dpr,glbBytes,metrics,
  webglContextLosses=0,contextRestorations=0,webglError=0}){
 if(!['webgl2','canvas2d','none'].includes(backend))throw Error('Moteur graphique non reconnu.');
 const measures=[canvasWidth,canvasHeight,dpr,glbBytes,webglContextLosses,contextRestorations,webglError];
 if(measures.some(n=>!finite(n)||n<0)||canvasWidth>4096||canvasHeight>4096||
   glbBytes>12*1024*1024||dpr>8)
   throw Error('Mesures techniques impossibles.');
 if(metrics!==null&&metrics!==undefined&&(!finite(metrics.effectiveFps)||!finite(metrics.p95FrameMs)||
   !Number.isInteger(metrics.frameSamples)||metrics.frameSamples<2))throw Error('Mesure de cadence non valide.');
 return {
  schema:'retoucheproai.film-studio.device-diagnostic.v0.6',
  generatedLocally:true,
  userInitiated:true,
  uploaded:false,
  backend,
  canvas:{width:canvasWidth,height:canvasHeight,dpr:round(dpr)},
  sceneGlbBytes:glbBytes,
  cadence:metrics||null,
  gpu:{webglErrors:webglError,contextLosses:webglContextLosses,contextRestorations},
  validation:{
   source:'local_browser_observation',
   physicalIPhoneCertified:false,
   iosFileSaveCertified:false,
   thermalsMeasured:false,
   memoryMeasured:false,
   visualRealismCertified:false
  },
  privacy:{
   userPromptIncluded:false,
   videoOrPhotoIncluded:false,
   userAgentIncluded:false,
   locationIncluded:false,
   serialOrIdentityIncluded:false,
   sentToServer:false
  }
 };
}
async function sampleCadence({nextFrame,draw,frames=90,isActive=()=>true}){
 if(typeof nextFrame!=='function'||typeof draw!=='function'||typeof isActive!=='function'||
   !Number.isInteger(frames)||frames<3||frames>180)throw Error('Paramètres de mesure non valides.');
 const timestamps=[];
 for(let i=0;i<frames;i++){
   if(!isActive())throw Error('Diagnostic interrompu : page inactive ou scène modifiée.');
   const stamp=await nextFrame();
   if(!finite(stamp))throw Error('Horodatage animation invalide.');
   timestamps.push(stamp);
   draw(i,stamp);
 }
 return analyzeFrameCadence(timestamps);
}
export {analyzeFrameCadence,makeLocalDiagnostic,sampleCadence};
