const C="retouche-v81",F=["./","index.html","app.js","atelier.js","analyse.js","directeur-ia.js","contribution.js","visage.js","modeles/yunet.onnx","mode-simple.js","demarrage.js","confidentialite.html","models.js","studio.js","abo.js","pub.js","natif.js","marquage.js","tarifs.html","guide.html","mentions-legales.html","conditions.html","licences.html","pages.css","demo/chat-avant.webp","demo/chat-apres.webp","demo/chat-avant.jpg","demo/chat-apres.jpg","filtres.png","sr.js","sr-gpu.js","depth.js","effacer.js","restauration-visage.js","recalage.js","visages-video.js","filtre-video.js","format-analyse.js","format-directeur.js","format-moteur.js","format-qualite.js","format.js","defiltre-visage.js","mains.js","kaggle.js","camera.js","mp4-muxer.js","manifest.webmanifest","icon-180.png","icon-192.png","icon-512.png","polices/polices.css","polices/bricolage-grotesque-latin.woff2","polices/bricolage-grotesque-latin-ext.woff2","polices/dm-mono-400-latin.woff2","polices/dm-mono-400-latin-ext.woff2","polices/dm-mono-500-latin.woff2","polices/dm-mono-500-latin-ext.woff2","polices/instrument-sans-latin.woff2","polices/instrument-sans-latin-ext.woff2"];
/* v6.4 : fichiers lourds (≈ 7 Mo : moteur IA, débruiteur de voix, sélection au toucher) gardés pour le hors-ligne, mais téléchargés
   en arrière-plan APRÈS l'installation, pour ne plus ralentir la première ouverture sur les données mobiles */
const LOURDS=["sr.bin","rnnoise.mjs","modeles/edgetam_encodeur.onnx","modeles/edgetam_decodeur.onnx"];
/* empreinte de tous les fichiers ci-dessus : recalculée par « node tests/sw.test.mjs --maj » à chaque version. Comme elle change dès
   qu'un fichier change, le téléphone voit toujours qu'une nouvelle version existe (test : tests/sw.test.mjs). */
const H="36eca677a63a342f";
self.addEventListener("install",e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(F.map(u=>new Request(u,{cache:"reload"})))).then(()=>self.skipWaiting()))});
/* v3.2 : on ne retire que les anciennes versions de l'app (« retouche-v… »). Avant, tout autre cache était effacé à chaque mise à jour,
   y compris les modèles IA téléchargés (« retouche-modeles-v1 ») et les caches de l'autre app du site (/radar/). */
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>/^retouche-v\d+$/.test(x)&&x!==C).map(x=>caches.delete(x)))).then(()=>self.clients.claim()).then(()=>caches.open(C).then(c=>Promise.all(LOURDS.map(u=>c.match(u).then(r=>r||c.add(u))))).catch(()=>{})))});
/* v6.5 : l'app s'ouvre depuis le téléphone, sans attendre le réseau (avant : chaque fichier était redemandé au serveur à chaque
   ouverture, d'où une attente sur une connexion lente). Une version est toujours complète : tous ses fichiers sont installés
   ensemble avant d'être utilisés, jamais mélangés avec ceux d'une autre. Quand une nouvelle version sort, elle s'installe en
   arrière-plan et la page se recharge toute seule (demarrage.js) si aucun travail n'est en cours.
   Les autres sites (modèles IA, serveurs) ne passent plus par ici : le navigateur s'en occupe directement. */
self.addEventListener("fetch",e=>{const q=e.request;if(q.method!=="GET")return;const u=new URL(q.url);
  if(u.origin!==location.origin||u.pathname.includes("/radar/")||u.pathname.includes("/modeles/lourds/"))return;/* autre site, ou autre app du même site : on n'y touche pas */
  e.respondWith(caches.open(C).then(c=>c.match(q,{ignoreSearch:q.mode==="navigate"}).then(r=>r||fetch(q).then(n=>{if(n.ok&&n.status===200)c.put(q,n.clone());return n})
    .catch(x=>q.mode==="navigate"?c.match("index.html").then(r=>r||Promise.reject(x)):Promise.reject(x)))))});
