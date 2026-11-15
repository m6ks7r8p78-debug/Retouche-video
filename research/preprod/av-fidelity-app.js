/* RetoucheProAI lab: optional local post-export metadata audit for two MP4 files.
 * No auto-upload, media rewriting, telemetry, or result persistence.
 */
(function(root){
  'use strict';
  function mount(doc){
    const d=doc||document;const existing=d.getElementById('smallmotion-app-panel');
    const input=d.getElementById('f');if(!existing||!input||!root.RetoucheLocalExportAudit)return null;
    if(d.getElementById('retouche-av-audit-panel'))return root.RetoucheLocalExportAuditUI||null;
    const wrapper=d.createElement('section');wrapper.id='retouche-av-audit-panel';
    wrapper.style.cssText='margin-top:18px;padding-top:14px;border-top:1px solid #616873;color:#f4f4f6';
    wrapper.setAttribute('aria-label','Comparaison de fidélité export local');
    const heading=d.createElement('strong');heading.textContent='Contrôle local de fidélité de l’export';
    heading.style.cssText='font-size:15px;line-height:1.5;display:block;color:#fff';wrapper.append(heading);
    const info=d.createElement('p');info.textContent='Compare l’original importé et un MP4 exporté, sans les envoyer. Vérifie seulement les pistes, durées, trames et métadonnées AAC.';
    info.style.cssText='font-size:13px;line-height:1.5;color:#d4d7dc;margin:10px 0';wrapper.append(info);
    const pick=d.createElement('button');pick.type='button';pick.textContent='Comparer mon MP4 exporté';
    pick.style.cssText='appearance:none;min-height:44px;padding:10px 14px;background:#373d49;color:#fff;border:1px solid #bec9d9;border-radius:10px;font-weight:700';wrapper.append(pick);
    const fileInput=d.createElement('input');fileInput.type='file';fileInput.accept='.mp4,.m4v,video/mp4';fileInput.hidden=true;
    fileInput.setAttribute('aria-label','Sélectionner le MP4 exporté');wrapper.append(fileInput);
    const status=d.createElement('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.style.cssText='font-size:13px;line-height:1.5;color:#ebeff1;margin:12px 0';
    status.textContent='Importe une vidéo originale, puis sélectionne le MP4 exporté.';wrapper.append(status);
    const details=d.createElement('details');const summary=d.createElement('summary');summary.textContent='Détails techniques (aucune image)';
    const pre=d.createElement('pre');pre.style.cssText='font-size:11px;white-space:pre-wrap;overflow-wrap:anywhere';details.append(summary,pre);wrapper.append(details);
    existing.append(wrapper);
    let source=null,last=null,token=0;
    const reset=()=>{token++;last=null;pre.textContent='';fileInput.value='';pick.disabled=false;};
    input.addEventListener('change',e=>{
      reset();const chosen=Array.from(e.target.files||[]);source=chosen.length===1?chosen[0]:null;
      status.textContent=source?'Original sélectionné. Après export, choisis le MP4 pour contrôler sa fidélité.':'Audit suspendu : un seul fichier original est nécessaire.';
    },true);
    pick.addEventListener('click',()=>{if(!source){status.textContent='Importe d’abord une vidéo originale.';return}fileInput.click()});
    fileInput.addEventListener('change',async()=>{
      const output=fileInput.files?.[0];if(!source||!output)return;
      const run=++token;pick.disabled=true;pre.textContent='';status.textContent='Vérification locale des en-têtes MP4…';
      try{const r=await root.RetoucheLocalExportAudit.audit(source,output);if(run!==token)return;
        last=r;pre.textContent=JSON.stringify(r,null,2);
        status.textContent=r.status==='needs_review'?'Écarts de fidélité possibles : '+r.warnings.map(x=>x.code).join(', ')+'. Aucune correction automatique.':
          r.status==='metadata_consistent'?'Métadonnées compatibles. Ce contrôle ne certifie pas la synchronisation audio réelle.':
          'Fichier non pris en charge : aucune conclusion automatique.';
      }catch(_){if(run===token){last=null;status.textContent='Analyse impossible ; aucun résultat supposé.'}}
      finally{if(run===token)pick.disabled=false}
    });
    const api=Object.freeze({observe:()=>last,reset});root.RetoucheLocalExportAuditUI=api;return api;
  }
  function init(){mount(document)}
  if(typeof document!=='undefined'){
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
  }
  if(typeof module!=='undefined'&&module.exports)module.exports={mount};
})(typeof globalThis!=='undefined'?globalThis:this);