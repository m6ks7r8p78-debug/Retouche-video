"use strict";
(()=> {
 const $=id=>document.getElementById(id);
 const btn=$("run"),stat=$("status"),area=$("result"),report=$("json"),explain=$("explanation"),copy=$("copy"),feedback=$("copy-status");
 let last=null;
 const messages={
  "native-aac-encoded-synthetic":"AAC-LC natif : encodage d’un son fictif réussi sur ce navigateur. Il reste à tester une véritable vidéo HEVC et sa piste sonore.",
  "codec-unsupported":"Ce navigateur n’annonce pas l’encodeur AAC-LC demandé. NOVA doit conserver l’original et refuser l’export si la copie du son échoue.",
  "webcodecs-unavailable":"L’interface d’encodage audio WebCodecs n’est pas disponible ici.",
  "codec-supported-but-encode-failed":"L’encodeur annonce l’AAC mais n’a pas produit de preuve suffisante : résultat non validé.",
  "insecure-context":"Le site n’est pas en contexte sécurisé HTTPS : le test AAC n’est pas possible.",
  "cancelled":"Test annulé."
 };
 btn.addEventListener("click",async()=>{
  btn.disabled=true;area.hidden=true;stat.textContent="Encodage d’un court son synthétique local…";
  try{
   if(!window.NOVA_SAFARI_CODEC_PROBE)throw Error("missing core");
   const r=await window.NOVA_SAFARI_CODEC_PROBE.run();
   last=JSON.stringify(r,null,2)+"\n";
   report.value=last;
   explain.textContent=messages[r.status]||"Résultat inconnu, non certifié.";
   stat.textContent="Test terminé — "+(r.status==="native-aac-encoded-synthetic"?"son synthétique encodé":"capacité non confirmée");
   feedback.textContent="";
   area.hidden=false;
  }catch{
   last=null;
   stat.textContent="Test non disponible. Aucun export et aucune donnée envoyée.";
  }finally{btn.disabled=false}
 });
 copy.addEventListener("click",async()=>{
  if(last===null)return;
  try{
   if(!navigator.clipboard?.writeText)throw Error("clipboard");
   await navigator.clipboard.writeText(last);
   feedback.textContent="Rapport copié. Le partage reste volontaire.";
  }catch{
   report.focus();report.select();
   feedback.textContent="Sélectionne le rapport puis utilise Copier dans le menu du téléphone.";
  }
 });
})();
