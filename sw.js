const C="retouche-v102",F=["./","index.html","app.js","atelier.js","analyse.js","contribution.js","visage.js","modeles/yunet.onnx","mode-simple.js","demarrage.js","confidentialite.html","models.js","studio.js","abo.js","pub.js","natif.js","marquage.js","tarifs.html","guide.html","mentions-legales.html","conditions.html","licences.html","pages.css","demo/chat-avant.webp","demo/chat-apres.webp","demo/chat-avant.jpg","demo/chat-apres.jpg","sr.js","sr-gpu.js","depth.js","effacer.js","restauration-visage.js","recalage.js","visages-video.js","iak.js","kaggle.js","camera.js","mp4-muxer.js","manifest.webmanifest","icon-180.png","icon-192.png","icon-512.png","polices/polices.css","polices/bricolage-grotesque-latin.woff2","polices/bricolage-grotesque-latin-ext.woff2","polices/dm-mono-400-latin.woff2","polices/dm-mono-400-latin-ext.woff2","polices/dm-mono-500-latin.woff2","polices/dm-mono-500-latin-ext.woff2","polices/instrument-sans-latin.woff2","polices/instrument-sans-latin-ext.woff2"];
/* v6.4 : fichiers lourds (≈ 7 Mo : moteur IA, débruiteur de voix, sélection au toucher) gardés pour le hors-ligne, mais téléchargés
   en arrière-plan APRÈS l'installation, pour ne plus ralentir la première ouverture sur les données mobiles */
const LOURDS=["sr.bin","sr2.bin","rnnoise.mjs","modeles/edgetam_encodeur.onnx","modeles/edgetam_decodeur.onnx"];
/* empreinte de tous les fichiers ci-dessus : recalculée par « node tests/sw.test.mjs --maj » à chaque version. Comme elle change dès
   qu'un fichier change, le téléphone voit toujours qu'une nouvelle version existe (test : tests/sw.test.mjs). */
const H="bd8085ad104ee94c";
self.addEventListener("install",e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(F.map(u=>new Request(u,{cache:"reload"})))).then(()=>self.skipWaiting()))});
/* v3.2 : on ne retire que les anciennes versions de l'app (« retouche-v… »). Avant, tout autre cache était effacé à chaque mise à jour,
   y compris les modèles IA téléchargés (« retouche-modeles-v1 ») et les caches de l'autre app du site (/radar/). */
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>/^retouche-v\d+$/.test(x)&&x!==C).map(x=>caches.delete(x)))).then(()=>self.clients.claim()).then(()=>caches.open(C).then(c=>Promise.all(LOURDS.map(u=>c.match(u).then(r=>r||c.add(u))))).catch(()=>{})))});
/* v6.5 : l'app s'ouvre depuis le téléphone, sans attendre le réseau (avant : chaque fichier était redemandé au serveur à chaque
   ouverture, d'où une attente sur une connexion lente). Une version est toujours complète : tous ses fichiers sont installés
   ensemble avant d'être utilisés, jamais mélangés avec ceux d'une autre. Quand une nouvelle version sort, elle s'installe en
   arrière-plan et la page se recharge toute seule (demarrage.js) si aucun travail n'est en cours.
   Les autres sites (modèles IA, serveurs) ne passent plus par ici : le navigateur s'en occupe directement. */
/* v9.3 : isolement d'origine (COOP/COEP ajoutés ici, l'hébergeur ne sait pas le faire) → les modèles d'IA calculent sur plusieurs cœurs
   du téléphone au lieu d'un seul. Les autres sites (modèles, serveurs) sont lus avec CORS : ils restent autorisés. */
const iso=r=>{if(!r||r.type==="opaque"||r.status===0)return r;const h=new Headers(r.headers);h.set("Cross-Origin-Opener-Policy","same-origin");h.set("Cross-Origin-Embedder-Policy","require-corp");h.set("Cross-Origin-Resource-Policy","same-origin");return new Response(r.body,{status:r.status,statusText:r.statusText,headers:h})};
self.addEventListener("fetch",e=>{const q=e.request;if(q.method!=="GET")return;const u=new URL(q.url);
  if(u.origin!==location.origin||u.pathname.includes("/radar/"))return;/* autre site, ou autre app du même site : on n'y touche pas */
  if(u.pathname.includes("/modeles/lourds/")){e.respondWith(fetch(q).then(iso));return}
  e.respondWith(caches.open(C).then(c=>c.match(q,{ignoreSearch:q.mode==="navigate"}).then(r=>r||fetch(q).then(n=>{if(n.ok&&n.status===200)c.put(q,n.clone());return n})
    .catch(x=>q.mode==="navigate"?c.match("index.html").then(r=>r||Promise.reject(x)):Promise.reject(x)))).then(iso))});
