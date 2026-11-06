/* ===== v4.0 : mode simple ===== */
(()=>{
  const $=q=>document.querySelector(q),B=document.body;let m="simple";try{m=localStorage.getItem("ui_mode")||"simple"}catch(e){}
  const ia=$("#s_ia"),h=$("#s_iah"),mx=$("#o_max"),sv=$("#o_srv");
  const kg=()=>!!(window.KG&&KG.actif());
  const fire=e=>{try{e.dispatchEvent(new Event("change",{bubbles:true}))}catch(x){}};
  function hint(){if(!h)return;h.textContent=!ia.checked?"Désactivée : traitement rapide sur le téléphone, sans IA."
    :kg()?"Activée : calcul sur les cartes graphiques gratuites de ton compte Kaggle (quelques minutes)."
    :"Activée sur l’iPhone (photos : ~30 s ; vidéos : très long). Pour les vidéos, ajoute ton jeton Kaggle dans ⚙️.";}
  function syncFromApp(){if(!ia||!mx)return;ia.checked=mx.checked;if(sv&&mx.checked&&kg()&&!sv.checked){sv.checked=true;fire(sv)}hint()}
  if(ia)ia.onchange=()=>{mx.checked=ia.checked;fire(mx);if(sv){const w=ia.checked&&kg();if(sv.checked!==w){sv.checked=w;fire(sv)}}hint()};
  function apply(){B.classList.toggle("simple",m==="simple");const b=$("#modeb");if(b)b.textContent=m==="simple"?"Mode expert":"Mode simple";
    if(m==="simple"){try{showTab("tp1")}catch(e){}syncFromApp()}}
  const b=$("#modeb");if(b)b.onclick=()=>{m=m==="simple"?"expert":"simple";try{localStorage.setItem("ui_mode",m)}catch(e){}apply();window.scrollTo({top:0,behavior:"smooth"})};
  apply();
  /* l'app peut changer la case IA d'elle-même (ex. vidéo trop longue pour l'iPhone) : on garde l'interrupteur à jour */
  if(mx)mx.addEventListener("change",()=>{if(ia&&ia.checked!==mx.checked){ia.checked=mx.checked;hint()}});
  setInterval(()=>{if(m==="simple")syncFromApp()},1000);/* v4.6 : resynchronise toujours (Kaggle chargé après le démarrage) */
  window.__simpleSync=()=>{if(m==="simple")syncFromApp()};
})();
