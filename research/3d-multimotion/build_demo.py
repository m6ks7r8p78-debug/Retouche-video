"""Build standalone touch-ready synthetic viewer with precomputed evidence.
No scripts/libraries/models are loaded from the network; no private input.
"""
from __future__ import annotations
import base64
import json
from pathlib import Path
import cv2
from multimotion_evidence import analyze_sequence
from scenes_multimotion import make_scene

ITEMS=[
 ('two_depths','Deux surfaces, caméra mobile','Simulation de parallaxe : 2 distances connues dans le générateur'),
 ('two_depths_mimic','Mêmes pixels, autre cause','Contre-exemple : grande surface mobile indépendante, rendu identique'),
 ('single_plane','Un seul mouvement','Toutes les textures suivent une transformation unique'),
 ('local_object','Petit objet mobile','Une seule grande couche, petit mouvement local non assimilé à un second plan'),
 ('broad_object','Grand objet mobile','Second champ étendu : les pixels ne prouvent PAS qu’il s’agit de parallaxe'),
 ('two_depths_cut','Rupture de scène','Le moteur refuse une continuité géométrique à travers une coupe'),
]
html_path=Path(__file__).parent/'RetoucheMultiMotion_iPhone_experimental.html'
traces=[]
for key,title,detail in ITEMS:
    frames,gt=make_scene(key,seed=104)
    out=analyze_sequence(frames)
    b64=[]
    for frame in frames:
        ok,b=cv2.imencode('.jpg',frame,[cv2.IMWRITE_JPEG_QUALITY,65])
        if not ok:raise RuntimeError('encode jpg failed')
        b64.append('data:image/jpeg;base64,'+base64.b64encode(b).decode('ascii'))
    traces.append({'key':key,'title':title,'detail':detail,'status':out['status'],
                   'counts':out['counts'],'states':[e['state'] for e in out['transitions']],
                   'images':b64,'gt':{
                        'is_camera_parallax':gt['is_camera_parallax'],
                        'is_independent_object':gt['is_independent_object']}})

style='''
:root{--ink:#172633;--soft:#52606e;--paper:#f5f3ee;--line:#d9dedc;--teal:#006f65;--gold:#a36c13;--coral:#a94438}
*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:var(--paper);color:var(--ink);font-family:system-ui,-apple-system,Segoe UI,Arial,sans-serif}
main{width:min(850px,100%);margin:auto;padding:19px 16px 38px}.meta{font-size:11px;font-weight:800;letter-spacing:.13em;text-transform:uppercase;color:var(--teal)}h1{font-size:clamp(27px,6.5vw,42px);line-height:1.06;letter-spacing:-.055em;margin:12px 0 10px}.intro{color:var(--soft);font-size:14px;line-height:1.6;max-width:660px;margin:0 0 18px}.selector{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin-bottom:16px}.selector button{border:1px solid var(--line);background:#fff;color:var(--ink);text-align:left;border-radius:12px;font-size:12px;font-weight:750;min-height:46px;padding:9px;cursor:pointer}.selector button[aria-pressed=true]{background:var(--ink);color:#fff}.panel{border:1px solid var(--line);border-radius:18px;background:#fff;padding:12px;box-shadow:0 6px 22px #1525340d}.photo{position:relative;border-radius:10px;overflow:hidden;background:#171c23;touch-action:pan-y}.photo img{display:block;max-width:100%;width:100%;height:auto;aspect-ratio:4/3;object-fit:contain;image-rendering:auto}.flag{position:absolute;top:9px;left:9px;padding:5px 9px;border-radius:30px;background:#fffdf1ef;color:#1c2732;font-weight:800;font-size:10px}.readout{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:13px 0 8px}.readout b{font-size:14px}.chip{font-size:11px;font-weight:800;background:#e6f6f3;color:var(--teal);padding:6px 8px;border-radius:9px}.chip.bad{background:#fff0ee;color:var(--coral)}.row{display:flex;align-items:center;gap:9px}button.ctrl{font:inherit;font-size:13px;font-weight:750;border:1px solid var(--line);background:#f7f7f3;border-radius:10px;min-width:44px;min-height:44px;cursor:pointer}.seek{min-width:0;flex:1;accent-color:var(--teal)}.small{font-size:12px;color:var(--soft)}.finding{background:#ecf3f2;padding:12px;border-radius:12px;font-size:13px;line-height:1.5;margin-top:13px}.warning{font-size:12px;line-height:1.55;color:#694e20;background:#fff4df;padding:11px 12px;border-radius:12px;margin-top:15px}.sub{border-top:1px solid var(--line);margin-top:20px;padding-top:14px;font-size:12px;line-height:1.6;color:var(--soft)}button:focus-visible,input:focus-visible{outline:3px solid #e4b85a;outline-offset:2px}@media(min-width:760px){main{padding-top:35px}.selector{grid-template-columns:repeat(3,minmax(0,1fr))}.panel{padding:20px}}
'''
shell='''<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><title>RetoucheProAI — MultiMotion Lab (synthétique)</title><style>STYLE_HERE</style></head>
<body><main><div class="meta">RETOUCHEPROAI / LABORATOIRE 3D / EXPÉRIENCE</div><h1>Deux mouvements.<br>Plusieurs explications.</h1><p class="intro">Les images sont fabriquées en Python. Le module OpenCV propose des <strong>hypothèses de champs de mouvement 2D</strong>, pas un diagnostic de profondeur ni un suivi d'objets.</p>
<div id="selector" class="selector" role="group" aria-label="Scénario"></div><section class="panel"><div class="photo" id="surface" aria-label="Séquence synthétique tactile"><img id="frame" alt="Scène synthétique générée, aucune personne réelle"><span class="flag">SYNTHÉTIQUE · 0 MÉDIA PRIVÉ</span></div><div class="readout"><b id="name"></b><span id="status" class="chip"></span></div>
<div class="row"><button id="toggle" class="ctrl" aria-label="Lecture ou pause">▶ Lire</button><button id="previous" class="ctrl" aria-label="Image précédente">‹</button><input class="seek" id="seek" type="range" min="0" max="10" step="1" value="0" aria-label="Parcourir les images"><button id="next" class="ctrl" aria-label="Image suivante">›</button><span class="small" id="index">1/11</span></div><div id="finding" class="finding"></div><p id="desc" class="small"></p>
<div class="warning"><strong>Ne pas sur-interpréter :</strong> deux champs de mouvement peuvent résulter d'une différence de profondeur, mais aussi d'un objet autonome. La démo n'est pas exécutée sur iPhone : les diagnostics ont été calculés en Python puis embarqués, sans service réseau.</div></section><p class="sub">Recherche hors production. Aucun modèle neuronal exécuté ; aucune preuve de 3D fidèle, de main, de contact ou de préhension. Aucun média privé ni transfert. Fonctionnement Safari sur iPhone physique non validé.</p></main><script id="payload" type="application/json">DATA_HERE</script><script>
(function(){'use strict';const data=JSON.parse(document.getElementById('payload').textContent);const $=id=>document.getElementById(id);let current=0,index=0,timer=null;const labels={repeated_two_motion_evidence:'Deux champs observés',single_dominant_evidence:'Un champ dominant',abstain_temporal_gap:'Rupture : abstention',abstain_insufficient_evidence:'Preuves insuffisantes',ambiguous_mixed_motion_evidence:'Résultat ambigu'};
function stop(){if(timer){clearInterval(timer);timer=null;}$('toggle').textContent='▶ Lire'}
function update(){let r=data[current];$('frame').src=r.images[index];$('name').textContent=r.title;$('status').textContent=labels[r.status]||r.status;$('status').className='chip'+(r.status.startsWith('abstain')?' bad':'');$('index').textContent=(index+1)+'/'+r.images.length;$('seek').value=index;$('seek').max=r.images.length-1;let s=index?r.states[index-1]:null;let status=s==='two_broad_motion_hypotheses'?'2 déplacements cohérents dans cette paire':s==='one_broad_motion_hypothesis'?'1 déplacement dominant dans cette paire':s?'Estimation refusée pour cette paire':'Début de séquence';$('finding').textContent=status+' — Total : '+r.counts.two+' transitions à deux champs / '+r.counts.transitions+'. Le moteur ne déduit ni profondeur ni causalité.';$('desc').textContent='Vérité de simulation (non déduite) : '+r.detail;}
function choose(i){stop();current=i;index=0;Array.from($('selector').children).forEach((b,j)=>b.setAttribute('aria-pressed',j===i?'true':'false'));update()}
data.forEach((r,i)=>{let b=document.createElement('button');b.textContent=r.title;b.setAttribute('aria-pressed','false');b.addEventListener('click',()=>choose(i));$('selector').appendChild(b)});
$('toggle').addEventListener('click',()=>{if(timer){stop();return}timer=setInterval(()=>{index=(index+1)%data[current].images.length;update()},320);$('toggle').textContent='⏸ Pause'});
$('previous').addEventListener('click',()=>{stop();index=Math.max(0,index-1);update()});$('next').addEventListener('click',()=>{stop();index=Math.min(data[current].images.length-1,index+1);update()});$('seek').addEventListener('input',e=>{stop();index=Number(e.target.value);update()});let sx=null;$('surface').addEventListener('touchstart',e=>{sx=e.changedTouches[0]?.clientX??null},{passive:true});$('surface').addEventListener('touchend',e=>{if(sx===null)return;let dx=(e.changedTouches[0]?.clientX??sx)-sx;if(Math.abs(dx)>35){stop();index=Math.max(0,Math.min(data[current].images.length-1,index+(dx<0?1:-1)));update()}sx=null},{passive:true});choose(0);
})();</script></body></html>'''
html=shell.replace('STYLE_HERE',style).replace('DATA_HERE',json.dumps(traces,ensure_ascii=False,separators=(',',':')))
html_path.write_text(html,encoding='utf8')
print(html_path,html_path.stat().st_size,'bytes',len(traces),'cases')