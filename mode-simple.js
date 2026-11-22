/* Parcours grand public — Importer > Améliorer > Ajuster le résultat.
   Aucun réglage technique ni essai obligatoire pour lancer une amélioration.
   Les utilisateurs avancés conservent le mode Expert inchangé. */
(()=>{
  const $=q=>document.querySelector(q),B=document.body;
  let m="simple",plan=null,retouche=null;
  /* AUBE expose un choix de résolution indépendant du bouton Auto.
     Un choix explicite doit rester prioritaire (jusqu'au prochain import).
     Le handler délégué fonctionne même si AUBE crée ses boutons plus tard. */
  let aubeResolutionManuelle=false;
  document.addEventListener("click",e=>{
    if(e.target?.closest?.("[data-ab-q]"))aubeResolutionManuelle=true;
  },true);
  document.addEventListener("change",e=>{
    if(e.target?.id==="f"||e.target?.id==="fp")aubeResolutionManuelle=false;
  },true);
  try{m=localStorage.getItem("ui_mode")==="expert"?"expert":"simple"}catch(e){}
  const mx=$("#o_max"),sv=$("#o_srv"),ia=$("#s_ia"),h=$("#s_iah"),ex=$("#ex");
  const kg=()=>!!(window.KG&&window.KG.actif());
  const setCheck=(e,val)=>{if(e&&e.checked!==val){e.checked=val;e.dispatchEvent(new Event("change",{bubbles:true}))}};
  const setQ=q=>{const e=$("#q");if(e&&e.value!==q){e.value=q;e.dispatchEvent(new Event("change",{bubbles:true}))}};
  const fps=()=>{try{return typeof OFPS==="number"&&OFPS>0?OFPS:30}catch(e){return 30}};
  const duration=()=>{try{const [a,b]=trimRange();return Math.max(.05,b-a)}catch(e){return Math.max(.05,v.duration||.05)}};
  function estimate(q){
    if(!window.IABUDGET||!window.SR||!v.videoWidth||!v.videoHeight)return null;
    const [ow,oh]=outDims(v.videoWidth,v.videoHeight,+q);
    let ms=0;try{ms=+localStorage.getItem("srspd")||0}catch(e){}
    return window.IABUDGET.estimate({w:v.videoWidth,h:v.videoHeight,ow,oh,duration:duration(),fps:fps(),msPerMP:ms,
      iak:!!(window.IAK&&window.IAK.actif()),cascade:!!(window.SR.casc&&window.SR.casc(v.videoWidth,v.videoHeight,ow/v.videoWidth))});
  }
  function decide(){
    if(mode!=="video"||!v.videoWidth)return null;
    const wh=v.videoWidth*v.videoHeight;
    const cloud=kg()&&!!window.VideoDecoder&&wh<=8.9e6;
    const local=window.SR&&window.SR.fits(v.videoWidth,v.videoHeight)&&!(window.MODELS&&window.MODELS.isOff("sr"));
    const hi=local?estimate("3840"):null,lo=local?estimate("1920"):null;
    /* Réserve une marge pour l'encodage et les écarts mesurés sur Safari. */
    if(cloud)return{kind:"cloud",q:"3840",ia:true,remote:true,
      note:"Restauration IA 4K prévue sur GPU distant. Un accord sera demandé avant tout envoi."};
    if(local&&hi&&hi.sec<=Math.min(420,window.IABUDGET.LIMIT_SEC*.7))return{
      kind:"local",q:"3840",ia:true,remote:false,
      note:"Restauration 4K IA calculée sur cet appareil (temps contrôlé)."};
    if(local&&lo&&lo.sec<=Math.min(420,window.IABUDGET.LIMIT_SEC*.7))return{
      kind:"local",q:"1920",ia:true,remote:false,
      note:"Restauration IA Full HD sur cet appareil (temps contrôlé)."};
    /* Impossible de promettre une restauration 4K IA rapide localement.
       Préserver les pixels d'origine si la source est déjà UHD. */
    const q=Math.max(v.videoWidth,v.videoHeight)>1920?"-1":"1920";
    return{kind:"standard",q,ia:false,remote:false,
      note:"Amélioration rapide sans reconstruction IA"+(q==="-1"?" (définition d’origine).":" (sortie Full HD).")+
      " La vraie IA 4K demanderait ici trop de temps. Le fichier ne sera pas présenté comme une restauration IA."};
  }
  function prepare(p){
    if(!p)return;
    plan=p;setQ(p.q);
    setCheck(mx,p.ia);
    setCheck(sv,p.remote);
    /* Mode cinéma = génération vidéo lourde, incompatible avec le parcours rapide par défaut. */
    setCheck($("#o_cine"),false);
    if(p.remote)setCheck($("#o_dust"),false); /* non compatible avec le lecteur GPU distant */
    ex.textContent="✨ Améliorer ma vidéo";
    if($("#auto_note"))$("#auto_note").textContent=p.note;
    if($("#auto_tweaks"))$("#auto_tweaks").hidden=true;
    if($("#auto_result_summary"))$("#auto_result_summary").textContent="";
  }
  function refresh(){
    if(m!=="simple")return;
    /* Le moteur transforme #ex en bouton « Annuler » pendant la conversion.
       AUBE lit CE libellé pour activer sa commande d'annulation.
       Ne jamais le remplacer par « Améliorer » pendant un export. */
    if(exporting||window.__exStarting||/annul/i.test(ex?.textContent||""))return;
    if(mode==="photo"){ex.textContent="✨ Améliorer ma photo";return}
    if(!v.videoWidth){ex.textContent="✨ Améliorer ma vidéo";return}
    ex.textContent="✨ Améliorer ma vidéo";
    const p=decide(),note=$("#auto_note");
    if(note&&p)note.textContent="Traitement automatique : "+p.note;
  }
  function apply(){
    B.classList.toggle("simple",m==="simple");
    const b=$("#modeb");if(b)b.textContent=m==="simple"?"Options avancées":"Retour au mode simple";
    if(m==="simple"){try{showTab("tp1")}catch(e){}refresh()}
  }
  const toggle=$("#modeb");
  if(toggle)toggle.onclick=()=>{m=m==="simple"?"expert":"simple";try{localStorage.setItem("ui_mode",m)}catch(e){}apply();window.scrollTo({top:0,behavior:"smooth"})};
  if(ex)ex.addEventListener("click",()=>{
    if(m!=="simple"||mode!=="video"||!v.videoWidth||exporting||window.__exStarting||window.__baMode||window.__plan)return;
    /* Un choix AUBE 4K/Full HD/Original ne doit jamais être remplacé
       par le plan automatique lorsque l'utilisateur lance le bouton. */
    if(aubeResolutionManuelle){
      plan=null;
      const note=$("#auto_note");
      if(note)note.textContent="Résolution choisie manuellement dans AUBE. Le moteur vérifie toujours le budget IA avant la conversion.";
      return;
    }
    prepare(decide()); /* immédiatement avant l'ancien gestionnaire d'export */
  },true);
  for(const b of document.querySelectorAll("[data-auto-retouch]"))b.onclick=()=>{
    retouche=b.dataset.autoRetouch;
    document.querySelectorAll("[data-auto-retouch]").forEach(x=>x.setAttribute("aria-pressed",String(x===b)));
    if(retouche==="natural")PROF.set("naturel",true);
    if(retouche==="sharp")PROF.set("details",true);
    if(retouche==="light"){P.br=Math.min(.18,(P.br||0)+.08);sync();draw()}
    const n=$("#auto_tweaks_note");
    n.textContent="Retouche « "+({natural:"Plus naturel",sharp:"Plus net",light:"Plus lumineux"}[retouche]||retouche)+
      " » sélectionnée. Ton premier résultat est conservé jusqu’à la nouvelle conversion.";
    $("#auto_reprocess").hidden=false;
  };
  $("#auto_reprocess").onclick=()=>{
    if(exporting||!v.videoWidth)return;
    $("#auto_reprocess").hidden=true;
    $("#ex").click(); /* mêmes décisions automatiques, profil/retouche manuel conservés */
  };
  window.__simpleExportDone=o=>{
    if(m!=="simple"||mode!=="video")return;
    const a=$("#auto_tweaks"),n=$("#auto_result_summary");
    if(a)a.hidden=false;
    if(n)n.textContent=o.iaFrames===o.frames&&o.iaFrames>0
      ?"Restauration IA effectuée sur les "+o.iaFrames+" images : "+o.width+" × "+o.height+". Tu peux enregistrer ou ajuster le rendu."
      :"Amélioration classique effectuée, sans reconstruction IA : "+o.width+" × "+o.height+
       ". Le fichier n'est pas présenté comme une vraie restauration 4K IA.";
    if($("#auto_tweaks_note"))$("#auto_tweaks_note").textContent="";
  };
  window.__simpleRefresh=refresh;
  window.__simpleSync=()=>{if(m==="simple")refresh()};
  /* Les anciens interrupteurs restent accessibles en mode Expert sans polluer le parcours simple. */
  if(ia)ia.onchange=()=>{setCheck(mx,!!ia.checked);setCheck(sv,!!ia.checked&&kg());if(h)h.textContent=ia.checked?"IA activée dans les réglages avancés.":"IA désactivée."};
  if(mx)mx.addEventListener("change",()=>{if(ia)ia.checked=mx.checked});
  apply();
})();
