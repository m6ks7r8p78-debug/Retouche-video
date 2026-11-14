/* RetoucheProAI — démonstrateur causal de stabilisation de probabilités de masques AR.
 * R&D hors application : aucun accès aux fichiers, pixels RGB, poids, réseau, DLSS 5 ou médias.
 * Le déplacement « fluxArriere » courant -> précédent doit être estimé hors module.
 */
'use strict';
const CLES = new Set(['largeur','hauteur','courant','precedent','fluxArriere','fiabiliteMouvement','coupeScene','coefficient','zoneAutorisee']);
const correct = n => typeof n === 'number' && Number.isFinite(n);
function fusionnerMasquesCausaux(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d) || Object.keys(d).some(k => !CLES.has(k)))
    throw new TypeError('Métadonnées interdites : paramètres numériques uniquement');
  const {largeur:w,hauteur:h,courant,precedent=null,fluxArriere=null,zoneAutorisee=null} = d;
  if (!Number.isSafeInteger(w) || !Number.isSafeInteger(h) || w < 2 || h < 2 || w*h > 1024*1024)
    throw new RangeError('Dimensions hors budget mémoire du laboratoire');
  const n=w*h;
  if (!(courant instanceof Float32Array) || courant.length!==n || [...courant].some(v=>!correct(v)||v<0||v>1))
    throw new TypeError('Probabilités courantes invalides');
  if (precedent!==null && (!(precedent instanceof Float32Array)||precedent.length!==n||[...precedent].some(v=>!correct(v)||v<0||v>1)))
    throw new TypeError('Probabilités précédentes invalides');
  if (fluxArriere!==null && (!(fluxArriere instanceof Float32Array)||fluxArriere.length!==2*n||[...fluxArriere].some(v=>!correct(v)||Math.abs(v)>64)))
    throw new TypeError('Flux arrière invalide');
  if (zoneAutorisee!==null && (!(zoneAutorisee instanceof Uint8Array)||zoneAutorisee.length!==n||[...zoneAutorisee].some(v=>v!==0&&v!==1)))
    throw new TypeError('Zone de lissage invalide');
  if (typeof d.coupeScene!=='boolean' || !correct(d.fiabiliteMouvement) || d.fiabiliteMouvement<0 || d.fiabiliteMouvement>1 ||
      !correct(d.coefficient) || d.coefficient<0 || d.coefficient>.5)
    throw new TypeError('Coupe, confiance ou coefficient invalide');
  const out = new Float32Array(courant); let modifiees=0;
  const enable = precedent!==null && fluxArriere!==null && !d.coupeScene && d.fiabiliteMouvement>=.9 && d.coefficient>0;
  if (enable) {
    for (let y=0;y<h;y++) for(let x=0;x<w;x++) {
      const i=y*w+x;
      if(zoneAutorisee && !zoneAutorisee[i]) continue;
      const px=x+fluxArriere[2*i], py=y+fluxArriere[2*i+1];
      if(px<0||py<0||px>w-1||py>h-1) continue;
      const x0=Math.floor(px), y0=Math.floor(py), x1=Math.min(w-1,x0+1), y1=Math.min(h-1,y0+1);
      const fx=px-x0, fy=py-y0;
      const p00=precedent[y0*w+x0], p10=precedent[y0*w+x1], p01=precedent[y1*w+x0],p11=precedent[y1*w+x1];
      const weighted=(p00*(1-fx)+p10*fx)*(1-fy)+(p01*(1-fx)+p11*fx)*fy;
      const v=courant[i]*(1-d.coefficient)+weighted*d.coefficient;
      if(Math.abs(v-courant[i])>1e-7){out[i]=v;modifiees++;}
    }
  }
  return Object.freeze({probabilites:out,pixelsLisses:modifiees,reinitialise:d.coupeScene,
    applicationSurMedia:false,sdkNvidiaDLSS5Utilise:false,modeleValide:false,publication:false,deploiement:false});
}
module.exports=Object.freeze({fusionnerMasquesCausaux});
