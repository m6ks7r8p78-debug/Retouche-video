/* ===== Gestionnaire central des modèles IA =====
   Un seul endroit sait quels modèles l'app utilise, où ils se trouvent, s'ils sont intacts et ce qu'on fait sans eux.
   - Registre : nom, version exacte, rôle, taille, empreinte SHA-256, licence, source, moteur, limites, solution de secours.
   - Modèles « intégrés » : livrés avec l'app (et gardés hors ligne par le service worker) ; vérifiés à chaque chargement.
   - Modèles « à télécharger » : seulement quand une fonction en a besoin ou à la demande ; progression réelle,
     reprise après coupure (morceaux gardés dans IndexedDB), vérification SHA-256, puis installation atomique
     (le fichier n'entre dans le stockage des modèles que s'il est complet et vérifié).
   - Versions : l'adresse de chaque version est figée (révision précise) ; une ancienne version reste en secours
     jusqu'à ce que la personne la supprime ; retour arrière possible.
   - Aucune photo ni vidéo n'est jamais lue, stockée ou supprimée par ce module : il ne touche qu'aux modèles. */
var MODELS = (() => {
  const CACHE = "retouche-modeles-v1";          /* même nom qu'avant : les modèles déjà installés sont repris */
  const DBN = "retouche-modeles", STORE = "parts", SK = "modeles_etat";
  const LEGACY = { depth: "https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/main/onnx/model_quantized.onnx" };
  const MB = 1048576;

  /* ---------- registre ---------- */
  const REG = [
    { id: "sr", nom: "Restauration IA « Qualité maximale »", role: "Super-résolution et restauration",
      modele: "Real-ESRGAN general v3 (realesr-general-x4v3 + realesr-general-wdn-x4v3)",
      version: "v0.2.5.0 — poids FP16, 2 jeux (débruitage fort / faible) mélangés",
      fonction: "Retire les blocs de compression, le bruit et le flou, puis agrandit ×4. Une partie des détails est estimée par le réseau.",
      medias: "photo, vidéo", entree: "image RGB 8 bits jusqu’à 1,1 mégapixel (ex. 1280×720)", sortie: "×4, ramenée à la taille d’export",
      moteur: "WebGPU (calcul sur la puce graphique), repli WebGL2", url: "sr.bin", integre: true, taille: 4853184,
      sha256: "96811c8c90fcc4c373706cb528508d63cdb8780a00a37a7da37c8894c72b8e46",
      licence: "BSD-3-Clause (Real-ESRGAN, X. Wang et al.) — usage commercial permis avec la mention de licence",
      source: "https://github.com/xinntao/Real-ESRGAN/releases/tag/v0.2.5.0", lourd: true,
      memoire: "≈ 140 Mo de mémoire graphique pour une image 1280×720 (calcul d’après la taille des tampons, non mesuré sur iPhone)",
      limites: "Lent sur iPhone (26 à 42 s par mégapixel mesurés sur l’iPhone du propriétaire, iOS 27.2, WebGPU). Sur une source très abîmée, peut lisser la peau ou inventer de fines textures. Inutile au-delà de 1,1 Mpx (la source contient déjà ses détails).",
      secours: "Amélioration classique sans IA (anti-blocs, débruitage, netteté, couleurs), toujours disponible.",
      validation: "Banc : 8 images abîmées, LPIPS 0,341–0,371 contre 0,393–0,420 sans IA (plus bas = mieux). Identique WebGPU/WebGL2 à 0,02/255 près." },
    { id: "depth", nom: "Effet de relief (profondeur)", role: "Estimation de profondeur",
      modele: "Depth Anything V2 Small — ONNX quantifié 8 bits (onnx-community)",
      version: "révision 4472b73 (fichier onnx/model_quantized.onnx)",
      fonction: "Estime ce qui est proche ou loin dans une photo, pour « Animer la photo » avec un léger effet de parallaxe. Ne modifie aucun pixel.",
      medias: "photo (animation)", entree: "photo réduite à 518 px", sortie: "carte de profondeur",
      moteur: "ONNX Runtime Web 1.22.0 (WebAssembly)",
      url: "https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/4472b7362082ad9968fee890ca0f1e5aca36b93d/onnx/model_quantized.onnx",
      integre: false, taille: 27258801,
      sha256: "fcf51f1b230362b28690bb9d1809bf0431f29cad20534e3f589bd7285547f20d",
      licence: "Apache-2.0 (seule la version Small ; Base/Large sont non commerciales et ne sont pas utilisées)",
      source: "https://huggingface.co/onnx-community/depth-anything-v2-small", lourd: true,
      memoire: "non mesurée (modèle de 27 Mo + moteur WebAssembly de 11 Mo)",
      limites: "Contours fins (cheveux, grillages) parfois mal séparés : léger étirement possible au bord des sujets.",
      secours: "Animation par zoom lent, sans relief." , validation: "Empreinte SHA-256 vérifiée contre celle publiée par Hugging Face." },
    { id: "migan", nom: "Effacer une zone (reconstruction générative)", role: "Remplissage d’une zone effacée (inpainting)",
      modele: "MI-GAN 512 Places2 — pipeline ONNX v2 (Picsart AI Research)",
      version: "révision 406830d (fichier migan_pipeline_v2.onnx, publié par l’auteur, A. Sargsyan)",
      fonction: "Remplit la zone peinte avec un contenu plausible tiré des alentours. INVENTE des pixels : ne retrouve pas ce qui était caché. Chaque zone inventée est marquée sur une carte.",
      medias: "photo", entree: "image RGB 8 bits + masque (255 = garder, 0 = reconstruire), recadrée autour de la zone", sortie: "même taille ; seuls les pixels de la zone changent",
      moteur: "ONNX Runtime Web 1.22.0 (WebAssembly)",
      url: "https://huggingface.co/andraniksargsyan/migan/resolve/406830d0fa60666da0071c342ad2fbc8f30c5c64/migan_pipeline_v2.onnx",
      integre: false, taille: 28079181,
      sha256: "6f1f3530a1a2324b19752018ce756088b07973cda8d7d890034ace5c8a48c40b",
      licence: "MIT (code et poids : LICENSE et LICENSE-WEIGHTS de Picsart AI Research) — usage commercial permis avec la mention de licence",
      source: "https://github.com/Picsart-AI-Research/MI-GAN", lourd: true,
      memoire: "modèle de 28 Mo + moteur WebAssembly de 11 Mo ; le calcul se fait en interne à 512×512 (non mesuré sur iPhone)",
      limites: "Grande zone : le modèle travaille à 512 px, le remplissage peut être flou ou répétitif ; mieux vaut plusieurs petits coups. Visages, mains, textes : remplissage souvent faux (le modèle a appris sur des scènes, pas sur des visages).",
      secours: "Sans le modèle, rien n’est effacé et la photo reste intacte.",
      validation: "Empreinte SHA-256 identique à celle publiée par Hugging Face ; fichier cité par le README officiel ; essais de reconstruction (tests/effacer.test.mjs)." },
    { id: "ajouts", nom: "Repérer les éléments d’un filtre (essai)", role: "Détection des éléments dessinés par un filtre AR",
      modele: "Détecteur RetoucheProAI v2 (U-Net léger, 0,39 M paramètres), appris sur le laboratoire des filtres",
      version: "v2 (11/11/2026) — tests/labo_filtres/entrainer_ajouts.py (v1 + graphismes du décor et maquillage appris comme « pas un filtre »)",
      fonction: "Repère ce qu’un filtre a dessiné sur une photo (museau, moustaches, oreilles, nez de clown, autocollants, lunettes, couronne…) pour l’effacer.",
      medias: "photo", entree: "tête cadrée 192×192 (BGR 0…255)", sortie: "probabilité « ajouté par un filtre » par pixel",
      moteur: "ONNX Runtime Web 1.22.0 (WebAssembly)",
      url: "modeles/lourds/detecteur_ajouts_v2.onnx",
      integre: false, taille: 1550382,
      sha256: "e0ed001f29b497713d172de732c4ac8107d8f38d3d702852868b008523083059",
      licence: "RetoucheProAI (entraîné par nous sur des portraits du domaine public et des éléments de filtre simulés)",
      source: "tests/labo_filtres/", lourd: false,
      memoire: "≈ 30 Mo pendant le calcul",
      limites: "Appris sur des éléments SIMULÉS : non mesuré sur de vrais filtres Snapchat/Instagram/TikTok. Ne repère pas les déformations, le lissage ni le maquillage.",
      secours: "Sans le détecteur, la photo reste intacte.",
      validation: "Personnes jamais vues à l’entraînement : précision 83 %, rappel 91 %, IoU 0,77 ; photos sans élément : 0,27 % de pixels signalés à tort. tests/dfv.test.mjs." },
    { id: "mains", nom: "Repérer les mains (vérification du retrait de filtre)", role: "Veto : ce qui est posé sur une main n’est pas un filtre",
      modele: "MediaPipe Hand Landmarker (Google), float16",
      version: "modèle hand_landmarker.task « latest » téléchargé le 12/11/2026 ; bibliothèque @mediapipe/tasks-vision 1.2.3",
      fonction: "Repère jusqu’à 4 mains et leurs 21 points. « Retirer un filtre du visage » ne touche pas aux éléments posés sur une main (ongles colorés, doigts, cigarette, bague).",
      medias: "photo", entree: "photo entière", sortie: "points des mains → zone des mains",
      moteur: "MediaPipe Tasks (WebAssembly, 14,7 Mo, servi par l’app)",
      url: "modeles/lourds/mains/hand_landmarker.task",
      integre: false, taille: 7819105,
      sha256: "fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1",
      licence: "Apache-2.0 (modèle et bibliothèque MediaPipe) — usage commercial permis avec la mention de licence (LICENSE-MediaPipe.txt)",
      source: "https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker", lourd: true,
      memoire: "non mesurée sur iPhone (modèle 7,8 Mo + moteur 14,7 Mo)",
      limites: "Main très floue, coupée par le bord ou gantée : parfois pas repérée (le veto ne s’applique alors pas).",
      secours: "Sans le modèle, le retrait de filtre fonctionne sans cette vérification (le journal le signale).",
      validation: "Vrais clips filtrés (main devant la bouche, ongles turquoise) : pixels signalés à tort 0,045 % → 0,011 %, précision 84 % → 91 %, rappel 68 % → 67 % (fiche F30)." },
    { id: "gfpgan", nom: "Restaurer les visages (essai)", role: "Restauration de visage (reconstruction générative)",
      modele: "GFPGAN v1.4 (Tencent ARC) — export ONNX RetoucheProAI, poids quantifiés int8 par canal, calcul en float32",
      version: "v1.4 (GFPGANv1.4.pth, SHA-256 e2cd4703…e5ad) — export v6.9",
      fonction: "Reconstruit les détails d’un visage flou, petit ou compressé (yeux, peau, cheveux). INVENTE des détails plausibles : ils sont mesurés et montrés sur une carte. Un visage déjà net n’est pas modifié.",
      medias: "photo", entree: "visage redressé 512×512 (RGB, −1…1)", sortie: "visage 512×512 recollé dans la photo avec bord fondu",
      moteur: "ONNX Runtime Web 1.22.0 (WebAssembly)",
      url: "modeles/lourds/gfpgan14_int8w.onnx",
      integre: false, taille: 85566839,
      sha256: "40407c8037bd34a7718b9ea60257354c87eafecd6845aa98951dd760a5b33ff9",
      licence: "Code : Apache-2.0 (Tencent ARC). Poids : publiés sous la même licence, MAIS issus d’un générateur StyleGAN2 dont la licence NVIDIA est non commerciale, entraîné sur FFHQ (CC BY-NC-SA). Usage commercial (abonnement, publicité) : décision juridique en attente — voir REGISTRE_LIVRAISON_PERMANENT.md.",
      source: "https://github.com/TencentARC/GFPGAN", lourd: true,
      memoire: "86 Mo de fichier ; pic ≈ 0,75 Go pendant le calcul (mesuré sur ordinateur, ONNX Runtime 1 fil) ; non mesuré sur iPhone",
      limites: "Détails inventés (≈ 8 % de la surface du visage à la force 80 %) : la ressemblance peut changer légèrement. Profil très marqué, visage caché ou très sombre : résultat moins bon. Photo seulement. Visage de moins de 12 px entre les yeux : non traité.",
      secours: "Sans le modèle, la photo reste intacte.",
      validation: "Sortie identique à PyTorch (écart moyen 2·10⁻⁷ en float32) ; version int8 : LPIPS 0,191 contre 0,191 en float32 sur 100 essais (25 portraits du domaine public × 4 dégradations). tests/rvis.test.mjs." },
    { id: "edgetam", nom: "Sélection au toucher (1/2 : lecture de la photo)", role: "Segmentation interactive — encodeur d’image",
      modele: "EdgeTAM (Meta) — export ONNX onnx-community, pleine précision (float32)",
      version: "révision 9c77c7b (onnx/vision_encoder.onnx_data ; structure modeles/edgetam_encodeur.onnx livrée avec l’app, identique à l’octet près)",
      fonction: "Lit la photo une fois (1024×1024) pour que le toucher puisse proposer le contour d’un élément. Ne modifie aucun pixel.",
      medias: "photo (outil Effacer)", entree: "photo étirée à 1024×1024", sortie: "3 cartes de caractéristiques",
      moteur: "ONNX Runtime Web 1.22.0 (WebAssembly)",
      url: "https://huggingface.co/onnx-community/EdgeTAM-ONNX/resolve/9c77c7bff7fd0f3079585fa17af7f730ddc531ed/onnx/vision_encoder.onnx_data",
      integre: false, taille: 19532576,
      sha256: "21e75dba7077dfcb53e8c9a6e99977156f2240ff3f1f9cddc43d66aa1ecb528e",
      licence: "Apache-2.0 (EdgeTAM, Meta Platforms ; conversion Hugging Face et export ONNX sous la même licence) — usage commercial permis avec la mention de licence",
      source: "https://huggingface.co/facebook/EdgeTAM", lourd: false,
      memoire: "≈ 20 Mo de poids + ≈ 17 Mo de cartes gardées pendant l’édition (non mesuré sur iPhone)",
      limites: "Le contour proposé peut déborder ou manquer un morceau (cheveux, objets transparents, éléments très fins) : il se corrige au pinceau et à la gomme.",
      secours: "Peindre la zone au doigt (toujours disponible).", validation: "Empreintes SHA-256 identiques à celles publiées par Hugging Face ; essais de sélection (tests/effacer.test.mjs)." },
    { id: "edgetam_dec", nom: "Sélection au toucher (2/2 : contour)", role: "Segmentation interactive — décodeur de masque",
      modele: "EdgeTAM (Meta) — export ONNX onnx-community, pleine précision (float32)",
      version: "révision 9c77c7b (onnx/prompt_encoder_mask_decoder.onnx_data ; structure modeles/edgetam_decodeur.onnx livrée avec l’app)",
      fonction: "À chaque toucher, propose le contour de l’élément touché (3 propositions, la plus sûre est gardée).",
      medias: "photo (outil Effacer)", entree: "point touché + cartes de la photo", sortie: "masque 256×256 agrandi à la taille de la photo",
      moteur: "ONNX Runtime Web 1.22.0 (WebAssembly)",
      url: "https://huggingface.co/onnx-community/EdgeTAM-ONNX/resolve/9c77c7bff7fd0f3079585fa17af7f730ddc531ed/onnx/prompt_encoder_mask_decoder.onnx_data",
      integre: false, taille: 20958208,
      sha256: "dfa2125e30d08d388732f20c18fb63ab0f0f590cd270eb307f0c2b65919d1be8",
      licence: "Apache-2.0 (EdgeTAM, Meta Platforms) — usage commercial permis avec la mention de licence",
      source: "https://huggingface.co/facebook/EdgeTAM", lourd: false, memoire: "≈ 21 Mo",
      limites: "Contour calculé à 256×256 puis agrandi : bords moins précis sur une grande photo ; à affiner au pinceau.",
      secours: "Peindre la zone au doigt (toujours disponible).", validation: "Empreintes SHA-256 identiques à celles publiées par Hugging Face." },
    { id: "voix", nom: "Voix plus claire", role: "Réduction du bruit audio",
      modele: "RNNoise (Xiph) compilé en WebAssembly", version: "modèle intégré à rnnoise.mjs",
      fonction: "Retire le souffle et les bruits de fond constants de la piste son.",
      medias: "vidéo (son)", entree: "son 48 kHz", sortie: "son 48 kHz", moteur: "WebAssembly",
      url: "rnnoise.mjs", integre: true, taille: 1933102,
      sha256: "05a553f523d59502d133a6d05dbf1878137c9e7bcff06edf5561f7001b62f95f",
      licence: "RNNoise : BSD-3-Clause ; enveloppe WebAssembly : Apache-2.0", source: "https://github.com/xiph/rnnoise", lourd: false,
      memoire: "faible (quelques Mo)", limites: "Prévu pour la voix : la musique peut être légèrement atténuée.",
      secours: "Le son d’origine est gardé tel quel.", validation: "Utilisé depuis la v2.3x ; son vérifié présent dans les exports." },
    { id: "filtres", nom: "Bibliothèque de filtres", role: "Retrait de filtre (données apprises)",
      modele: "25 tables de couleur 17³ (aller et retour), apprises sur de vraies paires avec / sans filtre",
      version: "v2.38", fonction: "Retire les filtres de couleur Snapchat / Instagram. Ce n’est pas un réseau de neurones.",
      medias: "photo, vidéo", entree: "couleurs", sortie: "couleurs", moteur: "WebGL",
      url: "filtres.png", integre: true, taille: 457121,
      sha256: "804891ac561e22c02d9873afd39a53b96b075ba57ee5b48e9351628fdd063ed4",
      licence: "propre à l’app", source: "créée pour l’app", lourd: false, memoire: "faible",
      limites: "Ne retire ni autocollants, ni textes, ni déformations.", secours: "Vidéo gardée avec son filtre.", validation: "6 filtres appris sur des paires fournies par le propriétaire." }
  ];
  const abs = u => { try { return new URL(u, location.href).href } catch (e) { return u } };   /* le stockage garde des adresses complètes */
  const extra = [];                              /* entrées ajoutées par les tests automatiques */
  const all = () => REG.concat(extra);
  const get = id => all().find(e => e.id === id);

  /* ---------- état mémorisé (petit, dans localStorage) ---------- */
  const load = () => { try { return JSON.parse(localStorage.getItem(SK) || "{}") } catch (e) { return {} } };
  const save = s => { try { localStorage.setItem(SK, JSON.stringify(s)) } catch (e) {} };
  const patch = (id, o) => { const s = load(); s[id] = Object.assign({}, s[id] || {}, o); save(s); emit() };

  /* ---------- outils ---------- */
  const hooks = {}, jobs = {}, subs = new Set();
  function emit() { subs.forEach(f => { try { f() } catch (e) {} }) }
  const wait = ms => new Promise(r => setTimeout(r, ms));
  async function sha256(buf) {
    const h = new Uint8Array(await crypto.subtle.digest("SHA-256", buf));
    let s = ""; for (const b of h) s += b.toString(16).padStart(2, "0"); return s;
  }
  function fail(code, detail) { const e = new Error(code + (detail ? " : " + detail : "")); e.code = code; e.detail = detail || ""; return e }
  const MSG = {
    ABSENT: ["Modèle non installé.", "Installe-le depuis « Modèles IA »."],
    CORROMPU: ["Le fichier du modèle est abîmé (taille ou contenu inattendu).", "Il a été retiré ; réinstalle-le."],
    EMPREINTE: ["Le fichier téléchargé ne correspond pas à l’empreinte attendue.", "Il n’a pas été installé. Réessaie plus tard ; si cela recommence, la source a changé."],
    RESEAU: ["Connexion interrompue pendant le téléchargement.", "La partie déjà reçue est gardée : « Réessayer » reprendra où il s’est arrêté."],
    HTTP: ["Le serveur du modèle a refusé la demande.", "Réessaie plus tard."],
    STOCKAGE: ["Pas assez de place sur l’appareil pour ce modèle.", "Libère de l’espace (anciennes versions, nettoyage) ou sur l’iPhone, puis réessaie."],
    INCOMPATIBLE: ["Cet appareil ne peut pas exécuter ce modèle.", "La solution de secours est utilisée."],
    DESACTIVE: ["Ce modèle est désactivé.", "Réactive-le dans « Modèles IA »."],
    ANNULE: ["Téléchargement annulé.", "La partie reçue est gardée pour reprendre plus tard."],
    MEMOIRE: ["Mémoire de l’iPhone insuffisante pour ce modèle.", "Les autres modèles ont été libérés ; réessaie, ou traite une image plus petite."],
    MOTEUR: ["Le moteur de calcul n’a pas pu démarrer.", "La solution de secours est utilisée."]
  };
  function classify(e) {
    if (e && e.code) return e.code;
    const m = String((e && (e.message || e.name)) || e || "");
    if (/Quota|quota|NoSpace|disk|espace/.test(m)) return "STOCKAGE";
    if (/memory|mémoire|alloc|OOM|lost|perdue|trop grande/i.test(m)) return "MEMOIRE";
    if (/abort/i.test(m)) return "ANNULE";
    if (/fetch|network|réseau|Load failed|NetworkError/i.test(m)) return "RESEAU";
    return "MOTEUR";
  }
  function explain(e) { const c = classify(e), t = MSG[c] || MSG.MOTEUR; return { code: c, texte: t[0], solution: t[1] } }

  /* ---------- IndexedDB : morceaux d'un téléchargement interrompu ---------- */
  let dbp = null;
  function db() {
    if (!dbp) dbp = new Promise((ok, ko) => {
      if (!window.indexedDB) return ko(new Error("IndexedDB absent"));
      const r = indexedDB.open(DBN, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error);
    }).catch(e => { dbp = null; throw e });
    return dbp;
  }
  async function idb(mode, fn) {
    const d = await db();
    return new Promise((ok, ko) => { const t = d.transaction(STORE, mode), s = t.objectStore(STORE); const r = fn(s); t.oncomplete = () => ok(r && r.result); t.onerror = () => ko(t.error); t.onabort = () => ko(t.error) });
  }
  const partKey = e => e.id + "|" + e.sha256;
  const partGet = async e => { try { return await idb("readonly", s => s.get(partKey(e))) } catch (x) { return null } };
  const partPut = async (e, v) => { try { await idb("readwrite", s => s.put(v, partKey(e))) } catch (x) {} };
  const partDel = async k => { try { await idb("readwrite", s => s.delete(k)) } catch (x) {} };
  const partKeys = async () => { try { return (await idb("readonly", s => s.getAllKeys())) || [] } catch (x) { return [] } };

  /* ---------- compatibilité ---------- */
  let gl2info = null;
  function gl2() {
    if (gl2info) return gl2info;
    try { const c = document.createElement("canvas"), g = c.getContext("webgl2");
      gl2info = { ok: !!g, fb: !!(g && g.getExtension("EXT_color_buffer_float")), db: g ? g.getParameter(g.MAX_DRAW_BUFFERS) : 0 };
      const x = g && g.getExtension("WEBGL_lose_context"); if (x) x.loseContext();
    } catch (e) { gl2info = { ok: false } }
    return gl2info;
  }
  function compat(id) {
    const e = get(id); if (!e) return { ok: false, why: "inconnu" };
    if (hooks[id] && hooks[id].compat) return hooks[id].compat();
    if (id === "sr") { const g = gl2(); if (navigator.gpu) return { ok: true, why: "WebGPU disponible" + (g.ok && g.fb && g.db >= 4 ? " (WebGL2 en secours)" : "") };
      return g.ok && g.fb && g.db >= 4 ? { ok: true, why: "WebGL2 (WebGPU absent)" } : { ok: false, why: "ni WebGPU ni WebGL2 complet" } }
    if (id === "depth") return window.WebAssembly && gl2().ok ? { ok: true, why: "WebAssembly + WebGL2" } : { ok: false, why: "WebAssembly ou WebGL2 absent" };
    if (id === "voix") return window.WebAssembly && window.AudioEncoder && window.OfflineAudioContext ? { ok: true, why: "WebAssembly + encodeur audio" } : { ok: false, why: "encodeur audio absent (mettre iOS à jour)" };
    if (id === "filtres") return { ok: true, why: "WebGL" };
    return { ok: true, why: "" };
  }

  /* ---------- stockage ---------- */
  async function storage() {
    const o = { usage: null, quota: null, persisted: null };
    try { if (navigator.storage && navigator.storage.estimate) { const q = await navigator.storage.estimate(); o.usage = q.usage; o.quota = q.quota } } catch (e) {}
    try { if (navigator.storage && navigator.storage.persisted) o.persisted = await navigator.storage.persisted() } catch (e) {}
    return o;
  }
  async function persist() { try { if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist() } catch (e) {} return null }
  async function cacheEntry(url) { try { const c = await caches.open(CACHE); return await c.match(url) } catch (e) { return null } }

  /* version active : celle du registre, ou une ancienne version choisie par « revenir en arrière » */
  function versions(e) { return [{ version: e.version, url: e.url, sha256: e.sha256, taille: e.taille }].concat(e.anciennes || []) }
  /* version utilisée : celle choisie par « revenir en arrière », sinon la plus récente réellement installée
     (après une mise à jour de l'app, l'ancienne version installée reste utilisée tant que la nouvelle n'est pas installée et vérifiée) */
  async function active(e) {
    const s = load()[e.id] || {}, vs = versions(e);
    if (s.actif) { const v = vs.find(x => x.url === s.actif); if (v) return v }
    for (const v of vs) if (await cacheEntry(v.url)) return v;
    return vs[0];
  }

  /* ---------- lecture vérifiée des octets d'un modèle ---------- */
  const inflight = {};
  async function bytes(id, opt) {
    opt = opt || {}; const e = get(id); if (!e) throw fail("ABSENT", id);
    const s = load()[id] || {};
    if (s.off) throw fail("DESACTIVE");
    const c = compat(id); if (!c.ok) throw fail("INCOMPATIBLE", c.why);
    if (e.integre) {
      let buf = null, h = "";
      for (const mode of ["default", "reload"]) {          /* 2e essai en court-circuitant les copies locales (fichier abîmé en cache) */
        let r; try { r = await fetch(e.url, { cache: mode === "reload" ? "reload" : "default" }) } catch (x) { throw fail("RESEAU", x.message) }
        if (!r.ok) throw fail("HTTP", String(r.status));
        buf = await r.arrayBuffer(); h = await sha256(buf);
        if (h === e.sha256) break;
      }
      if (h !== e.sha256) { patch(id, { err: "CORROMPU", errAt: Date.now() }); throw fail("CORROMPU", "empreinte " + h.slice(0, 8)) }
      patch(id, { verif: Date.now(), err: null, ver: e.version });
      return buf;
    }
    const v = await active(e);
    let r = await cacheEntry(v.url);
    if (!r && v.url === e.url) r = await migrate(e);
    if (!r) {
      if (!opt.download) throw fail("ABSENT");
      await download(id, opt); r = await cacheEntry(e.url);
      if (!r) throw fail("ABSENT");
    }
    const buf = await r.arrayBuffer(), h = await sha256(buf);
    if (h !== v.sha256 || buf.byteLength !== v.taille) {
      try { const ca = await caches.open(CACHE); await ca.delete(v.url) } catch (x) {}
      patch(id, { err: "CORROMPU", errAt: Date.now(), actif: null });
      throw fail("CORROMPU", "le fichier installé était abîmé et a été retiré");
    }
    patch(id, { verif: Date.now(), err: null, ver: v.version });
    return buf;
  }
  /* ancienne installation (adresse non figée « main ») : reprise seulement si son contenu est exactement la version attendue */
  async function migrate(e) {
    const old = LEGACY[e.id]; if (!old) return null;
    try {
      const ca = await caches.open(CACHE), r = await ca.match(old); if (!r) return null;
      const buf = await r.arrayBuffer(), h = await sha256(buf);
      if (h === e.sha256) { await ca.put(e.url, new Response(buf, { headers: { "content-type": "application/octet-stream" } })); await ca.delete(old); patch(e.id, { ver: e.version, inst: Date.now(), migre: true }); return ca.match(e.url) }
      patch(e.id, { ancienInconnu: true });   /* contenu différent : gardé à part, proposé au nettoyage, jamais utilisé */
    } catch (x) {}
    return null;
  }

  /* ---------- téléchargement contrôlé ---------- */
  /* une seule fois à la fois : la promesse est enregistrée AVANT toute attente, sinon deux appels rapprochés lanceraient deux téléchargements */
  const starting = {};
  function download(id, opt) {
    if (jobs[id]) return jobs[id].p;
    if (starting[id]) return starting[id];
    const pr = starting[id] = download0(id, opt || {}).finally(() => { if (starting[id] === pr) delete starting[id] });
    return pr;
  }
  async function download0(id, opt) {
    const e = get(id); if (!e) throw fail("ABSENT"); if (e.integre) return;
    const c = compat(id); if (!c.ok) throw fail("INCOMPATIBLE", c.why);
    /* autorisation (révocable dans ⚙️ Paramètres) avant tout téléchargement */
    if (window.STUDIO && !STUDIO.granted("modele") && !(await STUDIO.consent("modele"))) throw fail("ANNULE", "téléchargement non autorisé");
    const st = await storage();
    if (st.quota != null && st.usage != null && st.quota - st.usage < e.taille * 1.3) throw fail("STOCKAGE", Math.round((st.quota - st.usage) / MB) + " Mo libres");
    const ctrl = new AbortController(); if (opt.signal) opt.signal.addEventListener("abort", () => ctrl.abort(), { once: true });
    const job = jobs[id] = { ctrl, got: 0, total: e.taille, phase: "téléchargement", t0: Date.now() };
    const prog = () => { if (opt.onProgress) try { opt.onProgress(job.got / job.total, job) } catch (x) {} emit() };
    job.p = (async () => {
      const part = await partGet(e);
      let blob = part && part.blob instanceof Blob ? part.blob : new Blob([]), got = blob.size, tries = 0, noRange = false;
      if (got > e.taille) { blob = new Blob([]); got = 0 }
      job.got = got; job.repris = got > 0; prog();
      const restart = () => { blob = new Blob([]); got = 0; job.got = 0; job.repris = false };
      for (;;) {
        if (got === e.taille) break;                       /* tout était déjà reçu avant la coupure */
        const pend = []; let pendN = 0, lastSave = got, lastEmit = 0;
        const flush = async () => { if (!pendN) return; blob = new Blob([blob, ...pend]); pend.length = 0; pendN = 0; await partPut(e, { blob, at: Date.now() }); lastSave = got };
        try {
          let r;
          try { r = await fetch(e.url, { headers: got && !noRange ? { Range: "bytes=" + got + "-" } : {}, signal: ctrl.signal, cache: "no-store", credentials: "omit" }) }
          catch (x) { if (got && !noRange && !ctrl.signal.aborted && navigator.onLine !== false) { noRange = true; restart() } throw x }   /* certains navigateurs refusent l'en-tête de reprise : on repart du début sans lui */
          if (got && r.status === 200) restart();          /* reprise refusée par le serveur : on repart du début */
          else if (r.status === 206) { const cr = r.headers.get("content-range") || ""; const m = cr.match(/bytes (\d+)-/); if (m && +m[1] !== got) { restart(); throw fail("HTTP", "reprise incohérente") } }
          else if (r.status === 416) { restart(); throw fail("HTTP", "416") }
          else if (!r.ok) throw fail("HTTP", String(r.status));
          if (!r.body) { const b = await r.blob(); blob = new Blob([blob, b]); got = blob.size; job.got = got }
          else { const rd = r.body.getReader();
            for (;;) { const { done, value } = await rd.read(); if (done) break;
              pend.push(value); pendN += value.byteLength; got += value.byteLength; job.got = got;
              if (got > e.taille) throw fail("CORROMPU", "fichier plus gros que prévu");
              if (got - lastSave >= 4 * MB) await flush();
              const now = Date.now(); if (now - lastEmit > 200) { lastEmit = now; prog() } } }
          await flush(); break;
        } catch (x) {
          try { await flush() } catch (y) {}
          if (x && x.code === "CORROMPU") { await partDel(partKey(e)); throw x }
          if (ctrl.signal.aborted) throw fail("ANNULE");
          if (x && x.code === "HTTP" && /^4/.test(x.detail) && x.detail !== "416") throw x;
          if (++tries >= 3) throw fail("RESEAU", (x && x.message) || "");
          job.phase = "nouvel essai (" + (tries + 1) + "/3)"; prog(); await wait(1200 * tries); job.phase = "téléchargement";
        }
      }
      job.got = got; job.phase = "vérification"; prog();
      if (blob.size !== e.taille) { await partDel(partKey(e)); throw fail("CORROMPU", "taille " + blob.size + " au lieu de " + e.taille) }
      const buf = await blob.arrayBuffer(), h = await sha256(buf);
      if (h !== e.sha256) { await partDel(partKey(e)); throw fail("EMPREINTE", h.slice(0, 12)) }
      job.phase = "installation"; prog();
      const prev = await active(e);
      try { const ca = await caches.open(CACHE); await ca.put(e.url, new Response(buf, { headers: { "content-type": "application/octet-stream", "x-sha256": h } })) }
      catch (x) { throw fail("STOCKAGE", (x && x.name) || "") }
      await partDel(partKey(e));
      const s0 = load()[id] || {};
      patch(id, { ver: e.version, inst: Date.now(), verif: Date.now(), err: null, actif: null, prec: prev.url !== e.url && await cacheEntry(prev.url) ? prev.url : (s0.prec || null) });
    })().catch(x => { const k = classify(x); if (k !== "ANNULE") patch(id, { err: k, errAt: Date.now() }); throw x }).finally(() => { delete jobs[id]; emit() });
    emit();
    return job.p;
  }
  function cancel(id) { if (jobs[id]) jobs[id].ctrl.abort() }

  /* ---------- versions ---------- */
  async function updateAvailable(id) { const e = get(id); if (!e || e.integre) return false; const a = await active(e);
    return a.url !== e.url && !!(await cacheEntry(a.url)) && !(load()[id] || {}).actif }
  async function rollback(id) {
    const e = get(id), s = load()[id] || {}; if (!e || !s.prec) throw fail("ABSENT", "aucune version précédente");
    const v = versions(e).find(x => x.url === s.prec); if (!v) throw fail("ABSENT", "version précédente inconnue");
    const r = await cacheEntry(v.url); if (!r) throw fail("ABSENT", "fichier de la version précédente absent");
    const buf = await r.arrayBuffer(); if (await sha256(buf) !== v.sha256) throw fail("CORROMPU");
    const cur = await active(e);
    await unload(id); patch(id, { actif: v.url, prec: cur.url !== v.url ? cur.url : null, ver: v.version });
  }

  /* ---------- mémoire : chargement / déchargement ---------- */
  function register(id, h) { hooks[id] = Object.assign(hooks[id] || {}, h); emit() }
  const loaded = id => { try { return !!(hooks[id] && hooks[id].loaded && hooks[id].loaded()) } catch (e) { return false } };
  const busy = id => { try { return !!(hooks[id] && hooks[id].busy && hooks[id].busy()) } catch (e) { return false } };
  async function unload(id) { try { if (hooks[id] && hooks[id].unload) await hooks[id].unload() } catch (e) {} emit() }
  /* avant de charger un gros modèle : on libère les autres gros modèles inactifs (l'iPhone ferme l'onglet si la mémoire déborde) */
  async function beforeLoad(id) { for (const e of all()) if (e.id !== id && e.lourd && get(id) && get(id).lourd && loaded(e.id) && !busy(e.id)) await unload(e.id) }
  async function freeAll() { for (const e of all()) if (loaded(e.id) && !busy(e.id)) await unload(e.id) }

  /* ---------- suppression, désactivation, nettoyage ---------- */
  async function remove(id) {
    const e = get(id); if (!e || e.integre) throw fail("ABSENT", "modèle intégré à l’app : il ne peut pas être supprimé");
    cancel(id); await unload(id);
    try { const ca = await caches.open(CACHE); for (const v of versions(e)) await ca.delete(v.url); if (LEGACY[id]) await ca.delete(LEGACY[id]) } catch (x) {}
    await partDel(partKey(e)); const s = load(); delete s[id]; save(s); emit();
  }
  function setOff(id, off) { patch(id, { off: !!off }); if (off) unload(id) }
  const isOff = id => !!(load()[id] || {}).off;
  /* ce qui peut être supprimé sans risque : téléchargements incomplets, anciennes versions non actives, fichiers inconnus du registre */
  async function cleanable() {
    const out = []; const keep = new Set();
    for (const e of all()) { const s = load()[e.id] || {}; keep.add(abs((await active(e)).url)); if (s.prec) keep.add("__prec__" + abs(s.prec)) }
    try {
      const ca = await caches.open(CACHE);
      for (const req of await ca.keys()) {
        const u = req.url, e = all().find(x => versions(x).some(v => abs(v.url) === u) || LEGACY[x.id] === u);
        if (keep.has(u)) continue;
        const r = await ca.match(req); const n = r ? (await r.clone().blob()).size : 0;
        const prec = keep.has("__prec__" + u);
        out.push({ kind: prec ? "ancienne" : e ? "inutile" : "inconnu", label: (e ? e.nom : "fichier inconnu") + (prec ? " — version précédente gardée en secours" : LEGACY[e && e.id] === u ? " — ancienne installation non vérifiable" : " — version inutilisée"), taille: n, url: u, sur: !prec });
      }
    } catch (x) {}
    for (const k of await partKeys()) {
      const id = String(k).split("|")[0], e = get(id), job = jobs[id]; if (job) continue;
      let n = 0; try { const v = await idb("readonly", s => s.get(k)); n = v && v.blob ? v.blob.size : 0 } catch (x) {}
      out.push({ kind: "partiel", label: (e ? e.nom : id) + " — téléchargement incomplet", taille: n, part: k, sur: true });
    }
    return out;
  }
  async function clean(includePrev) {
    let freed = 0; const list = await cleanable();
    for (const x of list) {
      if (!x.sur && !includePrev) continue;
      try { if (x.part) await partDel(x.part); else { const ca = await caches.open(CACHE); await ca.delete(x.url) }
        freed += x.taille;
        if (x.kind === "ancienne") for (const e of all()) { const s = load()[e.id] || {}; if (s.prec && abs(s.prec) === x.url) patch(e.id, { prec: null }) }
      } catch (y) {}
    }
    for (const e of all()) { if ((load()[e.id] || {}).ancienInconnu) patch(e.id, { ancienInconnu: false }) }
    emit(); return freed;
  }

  /* ---------- état lisible d'un modèle ---------- */
  async function status(id) {
    const e = get(id), s = load()[id] || {}, c = compat(id), j = jobs[id];
    const o = { e, s, compat: c, loaded: loaded(id), busy: busy(id), off: !!s.off, job: j || null, installed: false, size: 0, update: false, prev: !!s.prec };
    if (e.integre) { o.installed = true; o.size = e.taille }
    else { const a = await active(e), r = await cacheEntry(a.url) || (a.url === e.url && LEGACY[id] ? await cacheEntry(LEGACY[id]) : null); o.installed = !!r; o.size = r ? a.taille : 0; o.update = o.installed && await updateAvailable(id); o.version = a.version }
    const p = !e.integre ? await partGet(e) : null; o.partial = p && p.blob ? p.blob.size : 0;
    o.etat = !c.ok ? "incompatible" : o.off ? "désactivé" : j ? j.phase : s.err && !o.installed ? "erreur" : o.loaded ? "chargé en mémoire" : o.installed ? (e.integre ? "intégré" : "installé") + (s.verif ? ", vérifié" : "") : o.partial ? "téléchargement incomplet" : "non installé";
    return o;
  }

  /* ---------- recommandation pour le média affiché ---------- */
  function recommend(m) {
    const out = [];
    if (!m || !m.w) return out;
    const px = m.w * m.h, srOk = compat("sr").ok && !isOff("sr");
    if (px <= 1100000) out.push({ id: "sr", ok: srOk, texte: srOk ? "Restauration IA conseillée : la source (" + m.w + "×" + m.h + ") est petite, l’IA peut retirer les défauts et affiner l’agrandissement." : "Restauration IA utile ici, mais indisponible (" + (isOff("sr") ? "désactivée" : compat("sr").why) + ") : amélioration classique utilisée." });
    else out.push({ id: "sr", ok: false, texte: "Restauration IA non utilisée : la source (" + m.w + "×" + m.h + ") contient déjà ses détails ; l’IA serait très longue pour un gain nul." });
    if (m.kind === "photo") out.push({ id: "depth", ok: compat("depth").ok && !isOff("depth"), texte: "Effet de relief : seulement pour « Animer la photo » (téléchargé à la première utilisation, 27 Mo)." });
    if (m.kind === "video" && m.son) out.push({ id: "voix", ok: compat("voix").ok && !isOff("voix"), texte: "Voix plus claire : proposée si un souffle constant est mesuré dans le son." });
    return out;
  }

  /* ---------- interface « Modèles IA » ---------- */
  const fmt = n => n >= MB ? (n / MB).toFixed(1).replace(".", ",") + " Mo" : n >= 1024 ? Math.round(n / 1024) + " Ko" : n + " o";
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  let root = null, rendering = false, again = false, note = "";
  function say(t) { note = t || ""; const n = root && root.querySelector(".mdl-note"); if (n) { n.textContent = note; n.hidden = !note } }
  async function render() {
    if (!root || !root.isConnected) return;
    if (rendering) { again = true; return } rendering = true;
    try {
      const st = await storage(), rows = await Promise.all(all().map(e => status(e.id))), cl = await cleanable();
      const media = window.__mediaInfo ? window.__mediaInfo() : null, rec = recommend(media);
      let h = `<p class="mdl-note" role="status" ${note ? "" : "hidden"}>${esc(note)}</p>`;
      h += `<div class="mdl-sto"><b>Stockage</b><span>${st.usage != null ? "Utilisé par l’app : " + fmt(st.usage) + (st.quota ? " sur " + fmt(st.quota) + " autorisés" : "") : "Taille du stockage non communiquée par le navigateur"}.</span>
        <span>${st.persisted === true ? "Protégé : le navigateur ne l’effacera pas de lui-même." : st.persisted === false ? "Non protégé : Safari peut l’effacer si l’app n’est pas utilisée pendant longtemps (les modèles intégrés reviennent seuls, le modèle téléchargé devra être réinstallé)." : "Protection du stockage : information indisponible."}</span>
        ${st.persisted === false ? `<button class="btn" data-a="persist">Demander la protection du stockage</button>` : ""}</div>`;
      if (rec.length) h += `<div class="mdl-rec"><b>Pour le média affiché</b><ul>${rec.map(r => `<li class="${r.ok ? "" : "warn"}">${esc(r.texte)}</li>`).join("")}</ul></div>`;
      for (const o of rows) {
        const e = o.e, j = o.job, pct = j ? Math.floor(j.got / j.total * 100) : 0;
        const b = (a, t, cls) => `<button class="btn ${cls || ""}" data-a="${a}" data-id="${e.id}">${t}</button>`;
        let acts = "";
        if (j) acts += b("cancel", "Annuler");
        else if (!e.integre && !o.installed && o.compat.ok && !o.off) acts += b("install", o.partial ? "Reprendre (" + fmt(o.partial) + " reçus)" : o.s.err ? "Réessayer" : "Installer (" + fmt(e.taille) + ")", "main");
        if (!j && o.update) acts += b("install", "Mettre à jour", "main");
        if (!j && o.prev && !e.integre) acts += b("rollback", "Revenir à la version précédente");
        if (o.loaded && !o.busy) acts += b("unload", "Libérer la mémoire");
        if (o.compat.ok) acts += b("toggle", o.off ? "Réactiver" : "Désactiver");
        if (!e.integre && (o.installed || o.partial) && !j) acts += b("remove", "Supprimer");
        if (e.id === "sr" && o.compat.ok && !o.off) acts += b("bench", "Mesurer la vitesse");
        const errT = o.s.err && !j ? explain({ code: o.s.err }) : null;
        h += `<article class="mdl-card" data-id="${e.id}">
          <div class="mdl-h"><b>${esc(e.nom)}</b><span class="mdl-st ${/incompatible|erreur|désactivé/.test(o.etat) ? "warn" : /chargé|installé|intégré/.test(o.etat) ? "ok" : ""}">${esc(o.etat)}</span></div>
          <p class="mdl-f">${esc(e.fonction)}</p>
          <p class="mdl-m mono">${esc(e.role)} · ${fmt(e.taille)} · ${e.integre ? "intégré à l’app" : o.installed ? "installé sur l’appareil" : "à télécharger"}</p>
          ${j ? `<progress max="100" value="${pct}"></progress><p class="mdl-m mono">${esc(j.phase)} : ${fmt(j.got)} / ${fmt(j.total)} (${pct} %)${j.repris ? " — reprise" : ""}</p>` : ""}
          ${errT ? `<p class="mdl-err">${esc(errT.texte)} ${esc(errT.solution)}</p>` : ""}
          ${!o.compat.ok ? `<p class="mdl-err">Incompatible ici : ${esc(o.compat.why)}. ${esc(e.secours)}</p>` : ""}
          ${e.id === "sr" && o.compat.ok ? engineSel() : ""}
          <div class="mdl-acts">${acts}</div>
          <details><summary>Détails</summary><dl>
            <dt>Modèle</dt><dd>${esc(e.modele)}</dd><dt>Version</dt><dd>${esc(e.version)}${o.version && o.version !== e.version ? " — installée : " + esc(o.version) : ""}</dd>
            <dt>Médias</dt><dd>${esc(e.medias)} — entrée : ${esc(e.entree)} ; sortie : ${esc(e.sortie)}</dd>
            <dt>Moteur</dt><dd>${esc(e.moteur)} — ${esc(o.compat.why)}</dd><dt>Mémoire</dt><dd>${esc(e.memoire)}</dd>
            <dt>Licence</dt><dd>${esc(e.licence)}</dd><dt>Source</dt><dd>${esc(e.source)}</dd>
            <dt>Empreinte SHA-256</dt><dd class="mono" style="word-break:break-all">${e.sha256}</dd>
            <dt>Dernière vérification</dt><dd>${o.s.verif ? new Date(o.s.verif).toLocaleString("fr-FR") : "pas encore (au premier usage)"}</dd>
            <dt>Limites connues</dt><dd>${esc(e.limites)}</dd><dt>Solution de secours</dt><dd>${esc(e.secours)}</dd>
            <dt>Validation</dt><dd>${esc(e.validation)}</dd>${o.s.bench ? `<dt>Vitesse mesurée ici</dt><dd>${esc(o.s.bench)}</dd>` : ""}</dl></details>
        </article>`;
      }
      const tot = cl.reduce((a, x) => a + x.taille, 0), safe = cl.filter(x => x.sur).reduce((a, x) => a + x.taille, 0);
      h += `<div class="mdl-cl"><b>Nettoyage</b>${cl.length ? `<ul>${cl.map(x => `<li>${esc(x.label)} : ${fmt(x.taille)}</li>`).join("")}</ul>
        ${safe ? `<button class="btn" data-a="clean">Libérer ${fmt(safe)} (sans risque)</button>` : ""}
        ${tot > safe ? `<button class="btn" data-a="cleanall">Supprimer aussi la version de secours (${fmt(tot - safe)})</button>` : ""}` : `<span>Rien à nettoyer.</span>`}
        <span class="mdl-m">Le nettoyage ne touche qu’aux modèles : jamais à tes photos, vidéos ou exports.</span></div>`;
      root.querySelector(".mdl-body-in").innerHTML = h;
    } finally { rendering = false; if (again) { again = false; render() } }
  }
  function engineSel() {
    let p = "auto"; try { p = localStorage.getItem("sr_moteur") || (localStorage.getItem("srgl") === "1" ? "gl" : "auto") } catch (e) {}
    const o = (v, t) => `<option value="${v}" ${p === v ? "selected" : ""}>${t}</option>`;
    return `<label class="mdl-eng"><span>Moteur de calcul</span><select data-a="engine">${o("auto", "Automatique (conseillé)")}${navigator.gpu ? o("gpu", "WebGPU") : ""}${o("gl", "WebGL2")}</select></label>`;
  }
  async function act(a, id, el) {
    const e = id ? get(id) : null;
    try {
      if (a === "install") { say(""); await download(id, {}); say(e.nom + " : installé et vérifié.") }
      else if (a === "cancel") { cancel(id) }
      else if (a === "rollback") { if (!confirm("Revenir à la version précédente de « " + e.nom + " » ?")) return; await rollback(id); say("Version précédente rétablie.") }
      else if (a === "unload") { await unload(id); say(e.nom + " : mémoire libérée.") }
      else if (a === "toggle") { const off = !isOff(id); if (off && !confirm("Désactiver « " + e.nom + " » ? " + e.secours)) return; setOff(id, off); say(e.nom + (off ? " désactivé. " + e.secours : " réactivé.")) }
      else if (a === "remove") { if (loaded(id) && !confirm("« " + e.nom + " » est en mémoire. Le supprimer quand même ?")) return; if (!confirm("Supprimer « " + e.nom + " » (" + fmt(e.taille) + ") ? Il faudra le retélécharger pour s’en servir. " + e.secours)) return; await remove(id); say(e.nom + " supprimé.") }
      else if (a === "clean") { const n = await clean(false); say(fmt(n) + " libérés.") }
      else if (a === "cleanall") { if (!confirm("Supprimer aussi la version de secours ? Le retour arrière ne sera plus possible.")) return; const n = await clean(true); say(fmt(n) + " libérés.") }
      else if (a === "persist") { const ok = await persist(); say(ok ? "Stockage protégé." : "Safari n’a pas accordé la protection. Elle est en général accordée quand l’app est ouverte depuis l’écran d’accueil.") }
      else if (a === "engine") { try { localStorage.setItem("sr_moteur", el.value); localStorage.removeItem("srgl") } catch (x) {} if (hooks.sr && hooks.sr.engine) hooks.sr.engine(el.value); say("Moteur de calcul : " + el.options[el.selectedIndex].text + ".") }
      else if (a === "bench") { el.disabled = true; say("Mesure en cours (image d’essai 256×256)…"); const r = await hooks.sr.bench(); patch("sr", { bench: r }); say("Vitesse : " + r) }
    } catch (x) { const t = explain(x); say(t.texte + " " + t.solution) }
    render();
  }
  function mount(el) {
    root = el; if (!el.__wired) { el.__wired = true;
      el.addEventListener("click", ev => { const b = ev.target.closest("button[data-a]"); if (b && el.contains(b)) act(b.dataset.a, b.dataset.id, b) });
      el.addEventListener("change", ev => { const s = ev.target.closest("select[data-a]"); if (s) act(s.dataset.a, null, s) }); }
    render();
  }
  subs.add(() => { if (root && root.isConnected && root.open !== false) render() });

  return { REG, get, all, bytes, download, cancel, remove, rollback, unload, beforeLoad, freeAll, setOff, isOff, register, loaded, compat, status,
    storage, persist, cleanable, clean, recommend, explain, classify, sha256, mount, render, subscribe: f => subs.add(f), versions, active, updateAvailable,
    _test: { add: e => { extra.push(e); emit() }, reset: () => { extra.length = 0 }, jobs, partGet, CACHE } };
})();
