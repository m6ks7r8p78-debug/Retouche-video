/* ===== IA rapide sur serveur gratuit (Kaggle) — v3.4 =====
   La restauration IA « qualité maximale » (Real-ESRGAN, le même fichier sr.bin que l'app) est calculée sur les cartes
   graphiques gratuites du compte Kaggle de la personne, au lieu du téléphone (≈ 27 s par image sur iPhone, ≈ 0,15 s là-bas).
   - Le jeton Kaggle est gardé sur cet appareil seulement (stockage local), jamais dans le code ni sur un serveur de l'app.
   - Avant chaque envoi, l'app affiche le fournisseur, le modèle, le but et la durée de conservation, et demande l'accord.
   - Tout est déposé dans un espace PRIVÉ du compte (jeu de données + calcul), puis supprimé dès le résultat récupéré.
   - Le résultat (une image calculée par image de la vidéo, déjà à la taille d'export) est relu ensuite par l'export
     normal de l'app à la place du calcul IA local : couleurs, mélange, protection des hautes lumières, son, encodage
     restent ceux de l'app.
   Le téléchargement du résultat passe par un petit serveur relais Cloudflare (serveur-ia/relais.js) (Kaggle ne permet pas à Safari de le lire
   directement) ; le jeton y transite sans être conservé. */
var KG = (() => {
  const API = "https://api.kaggle.com/v1/", JK = "kaggle_jeton";
  const RELAIS = "https://retouche-kaggle.retouche-ia.workers.dev";   /* serveur relais dédié (serveur-ia/relais.js), séparé du serveur des liens */
  const jeton = () => { try { return localStorage.getItem(JK) || "" } catch (e) { return "" } };
  let user = null, abort = null;

  async function api(svc, m, body) {
    const r = await fetch(API + svc + "/" + m, { method: "POST", headers: { Authorization: "Bearer " + jeton(), "Content-Type": "application/json" }, body: JSON.stringify(body || {}), signal: abort && abort.signal });
    const t = await r.text(); let j = null; try { j = JSON.parse(t) } catch (e) {}
    if (!r.ok) { const e = new Error((j && (j.message || j.error)) || ("Kaggle : erreur " + r.status)); e.status = r.status; throw e }
    return j || {};
  }
  async function moi() {
    if (user) return user;
    const r = await api("security.OAuthService", "IntrospectToken", { token: jeton() });
    if (!r.active || !r.username) throw new Error("jeton Kaggle refusé (expiré ou supprimé)");
    return user = r.username;
  }
  /* dépôt d'un fichier (envoi direct du téléphone vers le stockage de Kaggle, avec progression) -> jeton de fichier */
  async function depot(blob, name, onP) {
    const r = await api("blobs.BlobApiService", "StartBlobUpload", { type: "DATASET", name, contentLength: blob.size, contentType: blob.type || "application/octet-stream" });
    await new Promise((ok, ko) => {
      const x = new XMLHttpRequest(); x.open("PUT", r.createUrl);
      x.setRequestHeader("Content-Type", blob.type || "application/octet-stream");
      x.upload.onprogress = e => { if (onP && e.lengthComputable) onP(e.loaded / e.total) };
      x.onload = () => x.status >= 200 && x.status < 300 ? ok() : ko(new Error("envoi refusé (" + x.status + ")"));
      x.onerror = () => ko(new Error("envoi interrompu (réseau)")); x.onabort = () => ko(new Error("annulé"));
      if (abort) abort.signal.addEventListener("abort", () => x.abort());
      x.send(blob);
    });
    return r.token;
  }
  const attendre = ms => new Promise((ok, ko) => { const t = setTimeout(ok, ms); if (abort) abort.signal.addEventListener("abort", () => { clearTimeout(t); ko(new Error("annulé")) }) });
  async function texte(u) { const r = await fetch(u, { cache: "no-cache" }); if (!r.ok) throw new Error("fichier de l’app manquant : " + u); return r }

  /* téléchargement du résultat via le serveur de l'app, écrit au fil de l'eau dans le stockage privé de l'app (pas en mémoire) */
  async function recup(u, slug, f, onP) {
    const r = await fetch(RELAIS + "/kaggle/sortie?k=" + encodeURIComponent(slug) + "&f=" + encodeURIComponent(f),
      { headers: { "X-Kaggle-Jeton": jeton() }, signal: abort && abort.signal });
    if (!r.ok) throw new Error("récupération refusée (" + r.status + ")");
    if (f.endsWith(".json")) return r.json();
    const tot = +r.headers.get("content-length") || 0;
    let root = null; try { root = await navigator.storage.getDirectory() } catch (e) {}
    if (root && root.getFileHandle) {
      const fh = await root.getFileHandle("ia-serveur.mp4", { create: true });
      if (fh.createWritable) {
        const w = await fh.createWritable(); const rd = r.body.getReader(); let got = 0;
        try { for (;;) { const { done, value } = await rd.read(); if (done) break; await w.write(value); got += value.length; if (onP && tot) onP(got / tot) } await w.close() }
        catch (e) { try { await w.abort() } catch (x) {} throw e }
        return await fh.getFile();
      }
    }
    return new File([await r.blob()], "ia-serveur.mp4", { type: "video/mp4" });   /* secours (mémoire) si le stockage privé manque */
  }

  /* menage : supprime le calcul et le jeu de données (rien ne reste chez Kaggle) */
  async function menage(u, slug) {
    const out = [];
    for (const [svc, m, b] of [["kernels.KernelsApiService", "DeleteKernel", { userName: u, kernelSlug: slug }], ["datasets.DatasetApiService", "DeleteDataset", { ownerSlug: u, datasetSlug: slug }]]) {
      try { const sv = abort; abort = null; await api(svc, m, b); abort = sv; out.push(m + " ok") } catch (e) { out.push(m + " : " + e.message) }
    }
    return out;
  }

  /* lance tout : o = {file, dw, dh, ow, oh, dn, images}, ev(étape, fraction, texte) ; renvoie {file, info, slug} */
  async function traiter(o, ev) {
    if (!jeton()) throw new Error("aucun jeton Kaggle enregistré (⚙️ Paramètres)");
    abort = new AbortController();
    const u = await moi(), slug = "retouche-ia-" + Date.now().toString(36), ref = u + "/" + slug, t0 = Date.now();
    let fin = false;
    try {
      ev("envoi", 0, "Préparation de l’envoi…");
      const params = new Blob([JSON.stringify({ dn: o.dn, ow: o.ow, oh: o.oh, dw: o.dw, dh: o.dh, images: o.images, version: 1, qp: 16 })], { type: "application/json" });
      const sr = await (await texte("sr.bin")).blob(), py = await (await texte("serveur-ia/ia_serveur.py")).blob(), code = await (await texte("serveur-ia/traitement_kaggle.py")).text();
      const ext = ((o.file.name || "").match(/\.(mp4|mov|m4v)$/i) || [".mp4"])[0].toLowerCase();
      const files = [];
      const tot = o.file.size + sr.size + py.size + params.size; let base = 0;
      for (const [b, n] of [[params, "params.json"], [py, "ia_serveur.py"], [sr, "sr.bin"], [o.file, "video" + ext]]) {
        const tk = await depot(b, n, f => ev("envoi", (base + f * b.size) / tot, "Envoi de la vidéo vers ton espace privé Kaggle… " + Math.round((base + f * b.size) / tot * 100) + " %"));
        base += b.size; files.push({ token: tk });
      }
      const cd = await api("datasets.DatasetApiService", "CreateDataset", { ownerSlug: u, slug, title: slug.replace(/-/g, " "), licenseName: "other", isPrivate: true, files });
      if (cd.error) throw new Error("Kaggle : " + cd.error);
      for (let i = 0; ; i++) {
        const s = await api("datasets.DatasetApiService", "GetDatasetStatus", { ownerSlug: u, datasetSlug: slug });
        if (/ready/i.test(s.status || "")) break;
        if (/error|fail/i.test(s.status || "")) throw new Error("jeu de données refusé par Kaggle");
        if (i > 120) throw new Error("Kaggle ne prépare pas le jeu de données"); ev("prepa", 0, "Kaggle prépare la vidéo…"); await attendre(5000);
      }
      const sk = await api("kernels.KernelsApiService", "SaveKernel", { slug: ref, newTitle: slug.replace(/-/g, " "), text: code, language: "python", kernelType: "script",
        isPrivate: true, enableGpu: true, enableInternet: false, datasetDataSources: [ref], kernelDataSources: [], competitionDataSources: [], categoryIds: [] });
      if (sk.error) throw new Error("Kaggle : " + sk.error);
      let st = "", t1 = Date.now();
      for (;;) {
        await attendre(15000);
        const s = await api("kernels.KernelsApiService", "GetKernelSessionStatus", { userName: u, kernelSlug: slug });
        st = String(s.status || "");
        const min = Math.round((Date.now() - t1) / 60000);
        if (/COMPLETE/i.test(st)) break;
        if (/ERROR|CANCEL/i.test(st)) throw new Error("le calcul a échoué sur Kaggle" + (s.failureMessage ? " : " + s.failureMessage : ""));
        ev("calcul", 0, (/QUEUED/i.test(st) ? "En attente d’une carte graphique Kaggle…" : "Calcul IA sur les cartes graphiques Kaggle…") + " (" + min + " min)");
      }
      ev("recup", 0, "Récupération du résultat…");
      const info = await recup(u, slug, "info.json");
      if (!info || !info.ok || info.images_lues !== o.images || !info.sortie || info.sortie.width !== o.ow || info.sortie.height !== o.oh)
        throw new Error("résultat incomplet ou différent de la vidéo (contrôle : " + (info ? info.images_lues + "/" + o.images + " images" : "absent") + ")");
      const file = await recup(u, slug, "ia.mp4", f => ev("recup", f, "Récupération du résultat… " + Math.round(f * 100) + " %"));
      fin = true;
      return { file, info, slug, minutes: +((Date.now() - t0) / 60000).toFixed(1) };
    } finally {
      const m = await menage(u, slug);
      try { DIAG.send && DIAG.send("ia_serveur", { ok: fin, menage: m.join(", "), minutes: +((Date.now() - t0) / 60000).toFixed(1) }) } catch (e) {}
      abort = null;
    }
  }
  function annuler() { if (abort) abort.abort() }
  function regle(t) { try { if (t) localStorage.setItem(JK, String(t).trim()); else localStorage.removeItem(JK) } catch (e) {} user = null }
  return { traiter, annuler, regle, actif: () => !!jeton(), moi, _api: api };
})();
