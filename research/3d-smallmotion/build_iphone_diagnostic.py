"""Self-contained opt-in Safari diagnostic, with zero external requests."""
from pathlib import Path
import html
ROOT=Path(__file__).resolve().parent
engine=(ROOT/'smallmotion-local.js').read_text()
guard=(ROOT/'smallmotion-resource-guard.js').read_text()
bridge=(ROOT/'smallmotion-director-local.js').read_text()
bootstrap=(ROOT/'smallmotion-app-bootstrap.js').read_text()
assert '</script' not in (engine+guard+bridge+bootstrap).lower()
page='''<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta http-equiv="Content-Security-Policy" content="default-src 'none';script-src 'unsafe-inline';style-src 'unsafe-inline';media-src blob:;img-src data: blob:;connect-src 'none';object-src 'none';form-action 'none';base-uri 'none';worker-src 'none'">
<title>RetoucheProAI — Mesure locale iPhone</title>
<style>
:root{font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display",system-ui,sans-serif;color:#182b24;background:#f7f7f2}
*{box-sizing:border-box}body{margin:0}.wrap{max-width:700px;margin:auto;padding:26px 16px 55px}header{display:flex;justify-content:space-between;align-items:center;padding-bottom:20px;border-bottom:1px solid #cad8d0;font-size:12px;font-weight:750}
.brand{display:flex;align-items:center;gap:9px}.mark{display:grid;place-items:center;width:31px;height:31px;border-radius:10px;background:#193d32;color:#caffdf}.tag{font-size:10px;background:#e5f6eb;color:#256246;padding:7px 10px;border-radius:30px}
h1{letter-spacing:-.06em;font-size:clamp(35px,8vw,56px);line-height:1.07;font-weight:740;max-width:600px;margin:40px 0 16px}p{line-height:1.55;font-size:14px;color:#5d6f64}.eyebrow{color:#2a7556;font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}
.card{background:#fff;border:1px solid #d2ded5;border-radius:20px;padding:22px;margin:22px 0;box-shadow:0 5px 35px #193d3208}.row{display:flex;align-items:center;flex-wrap:wrap;gap:12px}button,.pick{font:inherit;border-radius:12px;min-height:46px;padding:11px 17px;background:#193d32;color:white;border:1px solid #193d32;cursor:pointer;font-weight:700;font-size:13px}button:focus-visible,.pick:focus-visible{outline:3px solid #e69d65;outline-offset:2px}button.secondary{background:white;color:#193d32}.pick{position:relative;overflow:hidden}.pick input{position:absolute;inset:0;opacity:0;width:100%;cursor:pointer}button:disabled{opacity:.4;cursor:not-allowed}
.readout{font-size:12px;padding:12px 14px;margin-top:12px;background:#eaf3ed;border-radius:12px;color:#234c3a}small{font-size:11px;line-height:1.55;color:#668071;display:block}#smallmotion-app-panel{margin:16px 0!important;max-width:none!important}#smallmotion-app-panel button{background:#193d32;color:white}#smallmotion-app-panel button[hidden]{display:none}#smallmotion-app-panel details{margin-top:14px}#smallmotion-app-panel pre{font-family:ui-monospace,monospace;font-size:11px;overflow-wrap:anywhere}footer{font-size:11px;color:#718075;line-height:1.6;margin-top:30px}
@media(max-width:460px){.wrap{padding:18px 13px 35px}.card{padding:16px}h1{margin-top:32px}}
</style></head><body><main class="wrap"><header><span class="brand"><span class="mark">✦</span> RETOUCHEPROAI / LAB</span><span class="tag">LOCAL · EXPÉRIMENTAL</span></header>
<p class="eyebrow" style="margin-top:35px">Budget appareil & confidentialité</p><h1>Tester le mouvement.<br>Mesurer sans envoyer.</h1>
<p>Choisis une vidéo depuis l’iPhone. Deux images sont décodées et analysées dans ce navigateur. La mesure ne modifie jamais la vidéo et ne quitte pas l’appareil.</p>
<section class="card" aria-label="Essai sur votre appareil"><strong>1. Sélectionner une seule vidéo</strong>
<div class="row" style="margin-top:15px"><label class="pick" for="f">Choisir une vidéo <input type="file" id="f" accept="video/*" aria-label="Fichier vidéo local"></label><button id="pick" class="secondary" type="button">Choisir à nouveau</button></div>
<p class="readout" id="offline">Aucun transfert réseau. Aucun compte, aucun modèle à télécharger.</p>
<small>Le module fera une proposition géométrique ou s’abstiendra. Il ne reconnaît ni mains, ni objets, ni contacts.</small>
</section>
<section class="card"><strong>2. Diagnostic local</strong><div id="diagnostic" class="readout" role="status">Aucun essai effectué.</div>
<div class="row" style="margin-top:15px"><button class="secondary" id="save" disabled type="button">Exporter uniquement le diagnostic JSON</button></div>
<small>Le JSON comprend des durées, dimensions d’analyse et statuts. Il n’inclut pas la vidéo, les pixels, le nom du fichier, ni une prétendue mesure de batterie.</small></section>
<footer>Laboratoire privé expérimental. Aucun résultat ne prouve un mouvement autonome ou une profondeur 3D. Safari iPhone physique : validation à effectuer sur appareil. Le temps d’échantillonnage inclut le décodage éventuel, la lecture et l’attente de trame.</footer></main>
<script>\n__ENGINE__\n</script><script>\n__RESOURCE__\n</script><script>\n__BRIDGE__\n</script><script>\n__BOOTSTRAP__\n</script>
<script>(function(){'use strict';
  document.getElementById('pick').onclick=()=>document.getElementById('f').click();
  const observe=()=>window.RetoucheMotionLabUI?.observe?.()||null;
  const stat=document.getElementById('diagnostic'),save=document.getElementById('save');
  document.getElementById('f').addEventListener('change',()=>{stat.textContent='Fichier sélectionné. Lance l’analyse locale dans le panneau ci-dessus.';save.disabled=true},false);
  const observer=new MutationObserver(()=>{const e=observe(); if(!e){save.disabled=true;return;}
    const r=e.resourceEvaluation;const message=`État : ${e.status} · Échantillonnage : ${r?.captureMs ?? '—'} ms · Calcul : ${r?.processorMs ?? '—'} ms · Profil suivant : ${r?.nextProfile ?? '—'}`;if(stat.textContent!==message)stat.textContent=message;save.disabled=false;
  });observer.observe(document.body,{subtree:true,childList:true,characterData:true});
  save.onclick=()=>{const evidence=observe();if(!evidence)return;const json=JSON.stringify({diagnosticVersion:1,origin:'local_iphone_manual',evidence},null,2);const url=URL.createObjectURL(new Blob([json],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='retouche_motion_local_diagnostic.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)};
})();</script></body></html>'''
for k,v in [('__ENGINE__',engine),('__RESOURCE__',guard),('__BRIDGE__',bridge),('__BOOTSTRAP__',bootstrap)]:page=page.replace(k,v)
assert 'fetch(' not in page and 'new XMLHttpRequest(' not in page and 'new WebSocket(' not in page
(ROOT/'RetoucheMotionBudget_iPhone_Local.html').write_text(page,encoding='utf-8')
print('Wrote HTML',len(page),'bytes')