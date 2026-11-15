/* RetoucheProAI — opt-in MP4 metadata comparison. Standalone, visible HTML shell.
 * This script NEVER creates a hidden-by-race panel: index.html owns the card.
 * No network, media upload, storage or automatic export. Experimental only.
 */
(function(root){
  'use strict';
  function mount(doc){
    const d=doc||document;
    const panel=d.getElementById('retouche-av-audit-panel');
    const input=d.getElementById('f');
    const pick=d.getElementById('retouche-av-audit-pick');
    const exported=d.getElementById('retouche-av-audit-output');
    const status=d.getElementById('retouche-av-audit-status');
    const pre=d.getElementById('retouche-av-audit-json');
    if(!panel||!input||!pick||!exported||!status||!pre)return null;
    if(d.documentElement.dataset.auditMounted==='v2')return root.RetoucheLocalExportAuditUI||null;
    if(!root.RetoucheLocalExportAudit?.audit){
      status.textContent='Module de comparaison indisponible. Le site ne contient peut-être pas tous les scripts. Recharge cette page dans Safari.';
      panel.dataset.auditReady='false';return null;
    }
    d.documentElement.dataset.auditMounted='v2';panel.dataset.auditReady='true';
    pick.disabled=false;
    let source=null,last=null,token=0;
    const reset=()=>{token++;last=null;pre.textContent='';exported.value='';pick.disabled=false;};
    function onInputChange(){
      reset();const chosen=Array.from(input.files||[]);source=chosen.length===1?chosen[0]:null;
      status.textContent=source?'Original sélectionné. Tu peux choisir le MP4 exporté, même si la conversion a déjà été faite.':'Un seul fichier original est nécessaire pour comparer.';
    }
    input.addEventListener('change',onInputChange,true);
    if(input.files?.length)onInputChange();
    else status.textContent='Importe une vidéo originale pour activer la comparaison.';
    pick.addEventListener('click',()=>{
      if(!source){status.textContent='Importe d’abord une vidéo originale.';return;}
      exported.click();
    });
    exported.addEventListener('change',async()=>{
      const output=exported.files?.[0];if(!source||!output)return;
      const run=++token;pick.disabled=true;pre.textContent='';status.textContent='Lecture locale des en-têtes MP4…';
      try{
        const r=await root.RetoucheLocalExportAudit.audit(source,output);
        if(run!==token)return;
        last=r;pre.textContent=JSON.stringify(r,null,2);
        status.textContent=r.status==='needs_review'? 'Écarts possibles : '+r.warnings.map(x=>x.code).join(', ')+'. Aucune correction automatique.':
          r.status==='metadata_consistent'?'Métadonnées compatibles. La synchronisation sonore réelle et la netteté ne sont pas certifiées.':
          'MP4 non pris en charge. Aucune conclusion.';
      }catch(_){if(run===token){last=null;status.textContent='Analyse impossible ; aucun résultat supposé.';}}
      finally{if(run===token)pick.disabled=false;}
    });
    const api=Object.freeze({observe:()=>last,reset});root.RetoucheLocalExportAuditUI=api;return api;
  }
  function init(){mount(document);}
  if(typeof document!=='undefined'){
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
  }
  if(typeof module!=='undefined'&&module.exports)module.exports={mount};
})(typeof globalThis!=='undefined'?globalThis:this);
