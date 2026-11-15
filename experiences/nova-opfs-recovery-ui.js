/* Contrôle local, volontaire, des résidus OPFS NOVA.
 * Ne lit pas les MP4, n'envoie aucun rapport et n'efface pas automatiquement.
 * Libellés sans noms de fichiers ni données de média utilisateur.
 */
(()=>{
"use strict";
const $=id=>document.getElementById(id);
const scan=$("novaOpfsRecoveryScan"),clean=$("novaOpfsRecoveryClean"),
  status=$("novaOpfsRecoveryStatus");
if(!scan||!clean||!status)return;
const api=globalThis.NOVA_OPFS_RECOVERY;
let busy=false,eligible=0;
const fmt=n=>(Number.isSafeInteger(n)&&n>=0?(n/1048576).toFixed(2):"—");
function controls(enabled=true){
 const supported=typeof api?.scan==="function"&&
  typeof navigator.storage?.getDirectory==="function";
 scan.disabled=!enabled||!supported;
 clean.disabled=!enabled||!supported||eligible<1;
}
function show(s){status.textContent=s}
controls();
scan.addEventListener("click",async()=>{
 if(busy)return;
 busy=true;eligible=0;controls(false);show("Inventaire privé en cours (aucune lecture vidéo)…");
 try{
  const report=await api.scan();
  eligible=report.oldFiles;
  show(report.oldFiles+" fichier(s) temporaire(s) de plus d'une heure ("+
   fmt(report.oldBytes)+" Mio). "+report.recentFiles+
   " récent(s), "+report.activeFiles+" actif(s) dans cet onglet, "+
   report.unrecognizedEntries+" entrée(s) hors NOVA ignorée(s). "+
   "Aucun fichier n'a été effacé.");
 }catch{show("Inventaire OPFS indisponible : aucun fichier modifié.")}
 finally{busy=false;controls()}
});
clean.addEventListener("click",async()=>{
 if(busy||eligible<1)return;
 busy=true;controls(false);
 show("Suppression demandée des seuls fichiers temporaires anciens…");
 try{
  const report=await api.cleanup();
  eligible=0;
  show(report.deleted+" ancien(s) fichier(s) temporaire(s) effacé(s), "+
   report.failed+" échec(s). Les fichiers récents, inconnus et actifs "+
   "ne sont pas ciblés. Aucune donnée transmise.");
 }catch{
  eligible=0;show("Nettoyage non confirmé. Aucun effacement supplémentaire.");
 }finally{busy=false;controls()}
});
})();
