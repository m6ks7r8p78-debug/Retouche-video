/* NOVA 0.8 — métriques de référence audio/vidéo sur médias synthétiques.
 * Mesure les premiers instants d'impulsions (PCM Float32 LE + trames grises).
 * NE mesure PAS la synchronisation labiale ni la fidélité perceptuelle.
 * Aucun média d'utilisateur, seulement les fichiers générés dans tests/.
 */
import assert from "node:assert/strict";

export function impulsionsPCM(bytes,{sampleRate=48000,windowMs=10}={}){
 if(!Buffer.isBuffer(bytes)||bytes.length%4!==0||
    !Number.isFinite(sampleRate)||sampleRate<8000||
    !Number.isFinite(windowMs)||windowMs<1||windowMs>40)
  throw new TypeError("PCM float32 ou fréquence incorrecte");
 const samples=bytes.length/4,n=Math.round(sampleRate*windowMs/1000);
 if(samples<n*5)throw new Error("Signal audio trop court pour détecter des impulsions");
 const rms=[];
 for(let i=0;i+n<=samples;i+=n){
  let power=0;
  for(let j=0;j<n;j++){
   const x=bytes.readFloatLE((i+j)*4);
   if(!Number.isFinite(x))throw new Error("PCM invalide");
   power+=x*x;
  }
  rms.push(Math.sqrt(power/n));
 }
 const threshold=Math.max(.012,Math.max(...rms)*.23);
 if(Math.max(...rms)<.04)throw new Error("Signal audio absent ou inaudible dans ce banc");
 const starts=[];let on=false;
 for(let i=0;i<rms.length;i++){
  const active=rms[i]>=threshold;
  if(active&&!on)starts.push(i*n/sampleRate);
  on=active;
 }
 return starts;
}
export function impulsionsVideo(bytes,{width=8,height=8,fps=15}={}){
 if(!Buffer.isBuffer(bytes)||!Number.isInteger(width)||!Number.isInteger(height)||
   width<1||height<1||!Number.isFinite(fps)||fps<=0)
  throw new TypeError("Trames grises ou cadence incorrectes");
 const frameSize=width*height;
 if(bytes.length%frameSize!==0||bytes.length<frameSize*5)
  throw new Error("Trames grises tronquées");
 const means=[];
 for(let p=0;p<bytes.length;p+=frameSize){
  let sum=0;
  for(let i=p;i<p+frameSize;i++)sum+=bytes[i];
  means.push(sum/frameSize);
 }
 const min=Math.min(...means),max=Math.max(...means);
 if(max-min<75)throw new Error("Flashs visuels absents");
 const threshold=min+(max-min)*.45;
 const starts=[];let on=false;
 for(let i=0;i<means.length;i++){
  const active=means[i]>threshold;
  if(active&&!on)starts.push(i/fps);
  on=active;
 }
 return starts;
}
export function comparerImpulsions({sourceAudio,sourceVideo,outputAudio,outputVideo,
  toleranceMs=90}={}){
 const sets=[sourceAudio,sourceVideo,outputAudio,outputVideo];
 if(sets.some(e=>!Array.isArray(e)||e.length!==2||!e.every(Number.isFinite)))
  throw new Error("Deux repères audio et vidéo requis avant et après conversion");
 if(!Number.isFinite(toleranceMs)||toleranceMs<1)throw new TypeError("Tolérance temporelle invalide");
 const differences=(a,v)=>a.map((t,i)=>(t-v[i])*1000);
 const input=differences(sourceAudio,sourceVideo),output=differences(outputAudio,outputVideo);
 const errors=output.map((x,i)=>x-input[i]);
 const offsetMs=Math.abs(errors[0]),driftMs=Math.abs(errors[1]-errors[0]);
 assert.ok(offsetMs<=toleranceMs,
   "Décalage audio/vidéo ajouté après transcodage : "+errors[0].toFixed(1)+" ms");
 assert.ok(driftMs<=toleranceMs,
   "Dérive audio/vidéo entre deux événements : "+driftMs.toFixed(1)+" ms");
 return Object.freeze({inputOffsetsMs:input,outputOffsetsMs:output,
   introducedErrorsMs:errors,offsetMs,driftMs,toleranceMs,
   qualification:"2 événements synthétiques, pas validation de la lip-sync réelle"});
}
