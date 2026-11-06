/* ===== v6.4 : fin du démarrage (exécuté après tous les autres scripts, dans l'ordre) ===== */
/* secours si le fichier local de création MP4 manque : même fichier (npm 5.1.3), refusé par le navigateur s'il ne correspond pas à l'empreinte */
if(!window.Mp4Muxer){const s=document.createElement("script");s.src="https://cdn.jsdelivr.net/npm/mp4-muxer@5.1.3/build/mp4-muxer.js";
  s.integrity="sha384-SujebcgqCNlLMRSnVkLD+3eWOzsxobv30Bct+0lV+fc1EHHEuvcePwmDgMzpnptj";s.crossOrigin="anonymous";document.head.appendChild(s)}
/* hors ligne : l'app se garde sur le téléphone (version installée depuis Safari) ; en ligne, la dernière version est toujours chargée en premier */
try{if("serviceWorker" in navigator&&location.protocol==="https:"&&/(github\.io|retoucheproai\.com)$/.test(location.hostname)){
  /* v5.6 : offres allumées → l'app hors ligne est réservée à Premium (version gratuite : toujours la version en ligne) */
  if(window.ABO&&ABO.actif()&&!ABO.premium())navigator.serviceWorker.getRegistrations().then(r=>r.forEach(x=>x.unregister())).catch(()=>{});
  else navigator.serviceWorker.register("sw.js").catch(()=>{})}}catch(e){}
/* modules lourds (« Effacer une zone », relief) : lus une fois la page prête et le téléphone libre, pour que le gestionnaire
   « Modèles IA » les connaisse comme avant, sans ralentir l'ouverture */
(()=>{const go=()=>{try{chargerModule("effacer").catch(()=>{});chargerModule("relief").catch(()=>{})}catch(e){}};
  const idle=window.requestIdleCallback||(f=>setTimeout(f,1500));
  if(document.readyState==="complete")idle(go,{timeout:4000});else addEventListener("load",()=>idle(go,{timeout:4000}),{once:true})})();
