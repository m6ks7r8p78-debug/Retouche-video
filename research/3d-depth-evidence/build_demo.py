"""Build offline mobile evidence viewer with synthetic images only, no models or uploads."""
from __future__ import annotations
import base64
import hashlib
import json
from pathlib import Path
import cv2
import numpy as np
from depthmotion_evidence import analyze_sequence
from scenes_depthmotion import make_scene_with_oracle

CASES=[('two_depths','Deux profondeurs — caméra','Deux surfaces fixes, déplacement apparent expliqué par leur distance.'),
       ('two_depths_mimic','Même image, objet mobile','Images pixel par pixel identiques à la scène précédente. Une autre source de profondeur change l’interprétation.'),
       ('broad_object','Objet mobile étendu','Un groupe de pixels se déplace au-delà de la géométrie prévue.'),
       ('local_object','Petit objet — échec connu','Trop peu de caractéristiques suivies sur le petit objet pour constituer une piste indépendante.'),
       ('two_depths_cut','Coupure de scène','Une rupture visuelle doit bloquer les conclusions temporelles.'),
       ('two_depths_rotated','Rotation + parallaxe','La rotation connue de la caméra est intégrée au flux géométrique prédit.')]


def jpeg_uri(frame):
    ok, buf=cv2.imencode('.jpg',frame,[cv2.IMWRITE_JPEG_QUALITY,80])
    if not ok:raise ValueError('jpeg compression failed')
    return 'data:image/jpeg;base64,'+base64.b64encode(buf.tobytes()).decode('ascii')


def depth_image(z):
    mask=np.isfinite(z)
    im=np.zeros((*z.shape,3),np.uint8)
    # Two well-defined synthetic distances; do not claim metric camera measurements.
    im[:]=(167,105,47)  # far (BGR)
    im[np.logical_and(mask,z<3)]=(39,171,239)  # near (BGR)
    im[~mask]=(70,70,70)
    return jpeg_uri(im)


def build():
    entries=[]
    for name,title,desc in CASES:
        fs,ds,ms,meta=make_scene_with_oracle(name,seed=7)
        out=analyze_sequence(fs,ds,ms,depth_source='synthetic_oracle',camera_source='synthetic_oracle')
        signature=hashlib.sha256(b''.join(x.tobytes() for x in fs)).hexdigest()
        entries.append({'key':name,'title':title,'description':desc,
                'images':[jpeg_uri(x) for x in fs],
                'depth':[depth_image(d) for d in ds],
                'status':out['status'],'counts':out['counts'],'pixel_sha256':signature})
    assert entries[0]['pixel_sha256']==entries[1]['pixel_sha256']
    embedded=json.dumps(entries,ensure_ascii=False,separators=(',',':'))
    html='''<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="color-scheme" content="light"><title>RetoucheProAI — DepthMotion Evidence</title>
<style>
:root{font:16px/1.5 -apple-system,BlinkMacSystemFont,"Avenir Next",system-ui,sans-serif;color:#1d2529;background:#f4f3ef}
*{box-sizing:border-box}body{margin:0}.shell{max-width:820px;padding:24px 17px 70px;margin:auto}
header{display:flex;justify-content:space-between;align-items:center;gap:10px;font-size:12px;text-transform:uppercase;letter-spacing:.14em;font-weight:800}
.logo{font-size:13px;color:#173d41}.tag{border:1px solid #b9cac5;padding:4px 8px;border-radius:2px;color:#496362}
h1{font-size:clamp(38px,8vw,75px);line-height:1.04;font-weight:650;letter-spacing:-.06em;max-width:700px;margin:38px 0 14px}
.intro{font-size:15px;max-width:550px;line-height:1.65;color:#53615f;margin-bottom:25px}
.rule{height:1px;background:#bcc9c3;margin:24px 0}.selector{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin-bottom:20px}
.case{border:1px solid #cfceca;padding:12px;text-align:left;min-height:65px;background:white;color:#1c292b;font:inherit;font-size:12px;font-weight:680;border-radius:3px;cursor:pointer}
.case[data-active="yes"]{background:#193b3c;border-color:#193b3c;color:#fff}
.sample{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
.figure{min-width:0;margin:0}figure img{width:100%;aspect-ratio:4/3;display:block;object-fit:contain;background:#10191b}
figcaption{font-size:11px;margin:6px 0 0;text-transform:uppercase;letter-spacing:.09em;color:#576561;font-weight:760}
.timeline{display:flex;align-items:center;gap:10px;margin:22px 0 10px}
button:not(.case){min-height:44px;border:0;background:#193b3c;color:#fff;padding:10px 14px;border-radius:3px;font:inherit;font-size:13px;cursor:pointer}
button:focus-visible,input:focus-visible{outline:3px solid #b56530;outline-offset:3px}
input[type=range]{flex:1;min-width:0;accent-color:#193b3c}#framecount{font-size:12px;min-width:42px;font-variant-numeric:tabular-nums}
.summary{border-top:2px solid #203f3d;padding-top:13px;margin-top:20px;display:grid;grid-template-columns:1fr 1fr;gap:15px}
.mini-label{font-size:10px;text-transform:uppercase;letter-spacing:.11em;color:#526967;font-weight:800}
strong{font-size:15px}.explain{font-size:13px;line-height:1.6;color:#425451;margin:12px 0}
.warning{border-left:3px solid #bc6531;background:#fcf0e6;padding:11px 14px;font-size:12px;line-height:1.6}
.footer{font-size:11px;color:#556866;margin-top:20px}
@media(max-width:380px){.shell{padding-left:12px;padding-right:12px}.case{font-size:11px;padding:8px}.timeline{gap:6px}button:not(.case){padding:8px}}
</style></head><body><main class="shell"><header><span class="logo">RetoucheProAI / Research</span><span class="tag">DepthMotion · Local</span></header>
<h1>Les pixels ne disent pas tout.</h1><p class="intro">Même image. Deux réalités physiques. Compare les pixels et la profondeur indépendante dans six expériences 100 % fictives.</p>
<div class="rule"></div><div class="selector" id="cases" role="group" aria-label="Choisir une expérience"></div>
<div class="sample"><figure class="figure"><img id="pixels" alt="Image synthétique de la séquence"/><figcaption>Pixels vidéo · simulés</figcaption></figure>
<figure class="figure"><img id="depth" alt="Carte de profondeur théorique synthétique"/><figcaption>Profondeur · oracle fictif</figcaption></figure></div>
<div class="timeline"><button id="prev" aria-label="Image précédente">‹</button><input id="seek" aria-label="Position dans la séquence" type="range" min="0" max="10" value="0"><span id="framecount">1/11</span><button id="next" aria-label="Image suivante">›</button></div>
<div class="summary"><div><div class="mini-label">Observation</div><strong id="result"></strong></div><div><div class="mini-label">Transitions interprétées</div><strong id="count"></strong></div></div>
<p id="description" class="explain"></p><div class="warning"><strong>Important.</strong> Ce lecteur affiche des résultats Python pré-calculés sur scènes de synthèse. Aucun modèle de profondeur ne tourne sur l’iPhone. Aucune identité, main, préhension ou reconstruction 3D n'est reconnue ; le diagnostic dépend de cartes de profondeur fictives exactes. Un vrai capteur pourrait se tromper. Aucune vidéo personnelle.</div>
<p class="footer">Hors ligne · zéro ressource distante · aucune collecte · essai Safari physique non effectué</p></main>
<script>const DATA=__EMBEDDED__;let which=0,frame=0;
const $=id=>document.getElementById(id);function paint(){const d=DATA[which];$('pixels').src=d.images[frame];$('depth').src=d.depth[frame];$('seek').value=frame;$('framecount').textContent=(frame+1)+'/11';$('result').textContent=d.status.replaceAll('_',' ');$('count').textContent=d.counts.independent+' indépendants · '+d.counts.explained+' expliqués';$('description').textContent=d.description;document.querySelectorAll('.case').forEach((e,i)=>{e.dataset.active=i===which?'yes':'no';e.setAttribute('aria-pressed',i===which?'true':'false');});}
DATA.forEach((d,i)=>{const b=document.createElement('button');b.className='case';b.type='button';b.textContent=(i+1).toString().padStart(2,'0')+'  '+d.title;b.addEventListener('click',()=>{which=i;frame=0;paint();});$('cases').appendChild(b);});
$('seek').addEventListener('input',e=>{frame=Number(e.target.value);paint();});$('prev').addEventListener('click',()=>{frame=Math.max(0,frame-1);paint();});$('next').addEventListener('click',()=>{frame=Math.min(10,frame+1);paint();});paint();
</script></body></html>'''
    path=Path(__file__).with_name('RetoucheDepthMotion_iPhone_experimental.html')
    path.write_text(html.replace('__EMBEDDED__',embedded),encoding='utf8')
    print('HTML bytes:',path.stat().st_size,'SHA256:',hashlib.sha256(path.read_bytes()).hexdigest())
    return path

if __name__=='__main__': build()