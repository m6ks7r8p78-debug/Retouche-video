"""Build a single-file offline HTML proof-of-concept; no third-party assets."""
from pathlib import Path
root=Path(__file__).resolve().parent
core=(root/'smallmotion-local.js').read_text()
html=r'''<!doctype html><html lang="fr"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; media-src blob:; connect-src 'none'; worker-src 'none'; form-action 'none'"/>
<title>RetoucheProAI — Mouvement local</title><style>
:root{color-scheme:light;--ink:#18252c;--muted:#59636a;--line:#d6d9d6;--cream:#faf9f5;--green:#1d675b;--pale:#e9f3ed}
*{box-sizing:border-box}html,body{margin:0;background:var(--cream);font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display',system-ui,sans-serif;color:var(--ink)}
main{width:min(920px,100%);margin:auto;padding:24px 18px 64px}.top{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:4px 0 22px;border-bottom:1px solid var(--line);font-size:12px;font-weight:750;letter-spacing:.06em}.logo{display:flex;gap:9px;align-items:center}.mark{height:29px;width:29px;border-radius:9px;color:white;background:var(--green);display:grid;place-items:center;font-size:19px}.tag{color:var(--green);border:1px solid #b6c9bf;border-radius:20px;padding:6px 10px;font-size:10px;white-space:nowrap}.head{padding:36px 0 22px}.eyebrow{text-transform:uppercase;font-size:11px;color:var(--green);font-weight:790;letter-spacing:.13em}h1{font-weight:690;letter-spacing:-.06em;font-size:clamp(34px,6vw,58px);line-height:1.07;margin:12px 0 16px}.desc{line-height:1.6;color:var(--muted);font-size:15px;max-width:650px;margin:0}.panel{background:white;border:1px solid var(--line);border-radius:18px;padding:22px;box-shadow:0 7px 28px #3348320a}.caps{font-size:12px;font-weight:800;letter-spacing:.04em;margin:0 0 14px}.actions{display:flex;gap:10px;flex-wrap:wrap;align-items:center}.btn,.upload{font:inherit;font-size:14px;font-weight:750;padding:13px 17px;border-radius:12px;min-height:46px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--ink);background:var(--ink);color:white}.btn.secondary{background:white;color:var(--ink);border-color:#bfc8c4}.btn:focus-visible,.upload:focus-visible{outline:3px solid #db8b35;outline-offset:3px}.upload{position:relative;overflow:hidden}.upload input{opacity:0;position:absolute;inset:0;width:100%;height:100%;cursor:pointer}.readout{display:flex;gap:8px;flex-wrap:wrap;margin:16px 0}.chip{border-radius:100px;padding:7px 11px;font-size:12px;background:var(--pale);color:var(--green);font-weight:700}.viewer{position:relative;width:100%;max-width:640px;aspect-ratio:4/3;background:#18242b;overflow:hidden;border-radius:12px;margin:17px auto 5px;border:1px solid #15272e}.viewer canvas{width:100%;height:100%;object-fit:contain;image-rendering:auto}.busy{font-size:13px;color:var(--muted);margin:14px 0}.error{color:#9e3028}.safe{padding:14px 16px;background:#eaf2ed;color:#254a39;border-radius:11px;margin-top:20px;font-size:12px;line-height:1.6}details{margin-top:20px;border-top:1px solid var(--line);padding-top:15px}summary{cursor:pointer;font-weight:700;font-size:13px}code,pre{font-size:11px;white-space:pre-wrap;overflow-wrap:anywhere}.footer{font-size:12px;color:var(--muted);line-height:1.55;margin-top:24px}.footer strong{color:var(--ink)}@media(max-width:460px){main{padding:16px 12px 36px}.panel{padding:15px}.tag{font-size:9px}h1{font-size:38px}}
</style></head><body><main>
<header class="top"><div class="logo"><div class="mark" aria-hidden="true">✦</div><span>RETOUCHEPROAI / RECHERCHE</span></div><span class="tag">EXPERIMENTAL · LOCAL</span></header>
<div class="head"><div class="eyebrow">SmallMotion · pilote navigateur</div><h1>Les détails bougent.<br>Vos vidéos restent ici.</h1><p class="desc">Première recherche de petits mouvements directement dans votre navigateur. Deux images sont analysées sur l’appareil, sans téléchargement de modèle ni transfert de fichier. Les résultats sont des hypothèses visuelles, jamais des preuves d’interaction.</p></div>
<section class="panel"><p class="caps">ANALYSE À UN GESTE</p>
<div class="actions"><label class="upload" for="file">Importer une vidéo <input id="file" type="file" accept="video/*" aria-label="Choisir une vidéo locale"/></label><button id="demo" class="btn secondary" type="button">Essayer la scène fictive</button></div>
<div class="readout"><span class="chip" id="mode">Calcul local JS · CPU</span><span class="chip" id="privacy">Transfert réseau désactivé</span></div>
<div class="viewer"><canvas width="160" height="120" id="view" aria-label="Image vidéo analysée et régions proposées"></canvas></div>
<p role="status" aria-live="polite" class="busy" id="status">Choisissez une vidéo ou la scène fictive pour commencer.</p>
<details><summary>Détails techniques et incertitudes</summary><pre id="json">Aucune analyse lancée.</pre></details>
<div class="safe"><strong>Confidentialité par défaut :</strong> aucune URL distante, aucune demande de permission caméra, aucun envoi de média. L'analyse CPU est limitée à des échantillons 160 × 120. Une vidéo réelle n'est ni annotée ni interprétée anatomiquement. Les limites matérielles Safari iPhone doivent encore être testées.</div>
</section><div class="footer"><strong>À ne pas confondre :</strong> mouvement local ≠ objet identifié ≠ mouvement indépendant ≠ contact ≠ préhension. Prototype séparé de retoucheproai.com ; aucun traitement cloud et aucun entraînement.</div>
<video id="video" preload="metadata" playsinline muted style="display:none" aria-hidden="true"></video>
</main>
<script>
/*LOCAL_CORE*/
</script><script>
'use strict';
const $=id=>document.getElementById(id), canvas=$('view'),ctx=canvas.getContext('2d',{willReadFrequently:true});
let currentUrl=null;
const report=(msg,err=false)=>{$('status').textContent=msg;$('status').classList.toggle('error',err)};
function show(a,r){ctx.putImageData(a,0,0);ctx.lineWidth=1.7;ctx.strokeStyle='#78ffc2';ctx.fillStyle='#78ffc2';ctx.font='bold 8px -apple-system,sans-serif';for(const c of r.candidates||[]){const [x,y,w,h]=c.box;ctx.strokeRect(x,y,w,h);ctx.fillText('Hypothèse',x,Math.max(9,y-2));}const n=r.candidates?.length||0;report(n?`${n} région(s) de mouvement visuel possible. Aucune identification d’objet.`:(r.status?.startsWith('abstain')?'Observation insuffisante : le moteur s’abstient.':'Pas de petit mouvement confirmé sur cet échantillon.'));
$('json').textContent=JSON.stringify(r,null,2);}
function demo(){
 const w=160,h=120, a=ctx.createImageData(w,h),b=ctx.createImageData(w,h),base=new Uint8Array(w*h),small=new Uint8Array(24*20);
 let s=54321;const rnd=()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s>>>24};for(let i=0;i<base.length;i++)base[i]=rnd();for(let i=0;i<small.length;i++)small[i]=rnd();
 for(let frame=0;frame<2;frame++){const data=frame?b.data:a.data;for(let y=0;y<h;y++)for(let x=0;x<w;x++){
 let z=base[y*w+(x-frame+w)%w];const ox=x-65,oy=y-(45+frame*4);if(ox>=0&&ox<24&&oy>=0&&oy<20)z=small[oy*24+ox];const k=(y*w+x)*4;data[k]=data[k+1]=data[k+2]=z;data[k+3]=255;}}
 try{const t0=performance.now(),r=RetoucheLocalMotion.analyze(a,b);r.cpu_ms=+(performance.now()-t0).toFixed(1);r.provenance='synthetic_demo';show(b,r)}catch(e){report('Erreur locale : '+String(e),true)}
}
$('demo').addEventListener('click',demo);
const video=$('video');
function once(el,event,timeout=12000){return new Promise((resolve,reject)=>{let stop;const ok=()=>{clearTimeout(stop);el.removeEventListener(event,ok);el.removeEventListener('error',fail);resolve()};const fail=()=>{clearTimeout(stop);el.removeEventListener(event,ok);el.removeEventListener('error',fail);reject(Error('Décodage vidéo impossible ou non pris en charge'))};el.addEventListener(event,ok,{once:true});el.addEventListener('error',fail,{once:true});stop=setTimeout(fail,timeout)})}
async function seek(t){if(Math.abs(video.currentTime-t)>1/1000){let pending=once(video,'seeked');video.currentTime=t;await pending;}if(video.readyState<2)await once(video,'loadeddata')}
async function processVideo(file){
 if(!file)return;
 if(file.size>120*1024*1024){report('Vidéo trop volumineuse pour ce pilote (maximum 120 Mo).',true);return}
 if(currentUrl){URL.revokeObjectURL(currentUrl);currentUrl=null}
 const local=URL.createObjectURL(file);currentUrl=local;video.src=local;video.load();
 try{report('Décodage local de deux images…');await once(video,'loadedmetadata');const duration=video.duration;
 if(!Number.isFinite(duration)||duration<.5)throw Error('Durée inconnue ou vidéo trop courte');
 const w=160,h=120;ctx.clearRect(0,0,w,h);
 const start=Math.max(.05,Math.min(duration*.2,duration-.35));const end=Math.min(start+.18,duration-.05);
 await seek(start);ctx.drawImage(video,0,0,w,h);const a=ctx.getImageData(0,0,w,h);
 await seek(end);ctx.drawImage(video,0,0,w,h);const b=ctx.getImageData(0,0,w,h);
 const t=performance.now();const r=RetoucheLocalMotion.analyze(a,b);r.cpu_ms=+(performance.now()-t).toFixed(1);r.provenance='user_local_video_unvalidated';r.sample_times_s=[start,end];show(b,r);
 }catch(e){report('Analyse impossible sur ce fichier : '+(e?.message||String(e)),true)}
 finally{video.removeAttribute('src');video.load();if(currentUrl){URL.revokeObjectURL(currentUrl);currentUrl=null}}
}
$('file').addEventListener('change',e=>processVideo(e.target.files?.[0]));
window.addEventListener('pagehide',()=>{if(currentUrl)URL.revokeObjectURL(currentUrl)});
</script></body></html>'''
html=html.replace('/*LOCAL_CORE*/',core)
(root/'RetoucheSmallMotion_Local_iPhone.html').write_text(html,encoding='utf-8')
print('Wrote',root/'RetoucheSmallMotion_Local_iPhone.html',len(html),'chars')