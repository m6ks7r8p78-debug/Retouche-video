/* ===== v6.4 : fin du démarrage (exécuté après tous les autres scripts, dans l'ordre) ===== */
/* secours si le fichier local de création MP4 manque : même fichier (npm 5.1.3), refusé par le navigateur s'il ne correspond pas à l'empreinte */
if(!window.Mp4Muxer){const s=document.createElement("script");s.src="https://cdn.jsdelivr.net/npm/mp4-muxer@5.1.3/build/mp4-muxer.js";
  s.integrity="sha384-SujebcgqCNlLMRSnVkLD+3eWOzsxobv30Bct+0lV+fc1EHHEuvcePwmDgMzpnptj";s.crossOrigin="anonymous";document.head.appendChild(s)}
/* PRÉVISUALISATION ISOLÉE : aucun enregistrement/désenregistrement de service worker.
   Les médias et les moteurs fonctionnent comme dans le studio natif ; la PWA publique n'est pas touchée. */
/* modules lourds (« Effacer une zone », relief) : lus une fois la page prête et le téléphone libre, pour que le gestionnaire
   « Modèles IA » les connaisse comme avant, sans ralentir l'ouverture */
(()=>{const go=()=>{try{chargerModule("effacer").catch(()=>{});chargerModule("relief").catch(()=>{})}catch(e){}};
  const idle=window.requestIdleCallback||(f=>setTimeout(f,1500));
  if(document.readyState==="complete")idle(go,{timeout:4000});else addEventListener("load",()=>idle(go,{timeout:4000}),{once:true})})();
