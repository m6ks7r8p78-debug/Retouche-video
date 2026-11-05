/* ===== v5.7 : app des stores (Capacitor) — ne fait rien dans le navigateur =====
   Dans l'app iPhone / Android, le navigateur intégré ne sait pas « télécharger » un fichier : on écrit la vidéo dans le
   cache de l'app, puis on ouvre la feuille de partage du téléphone (« Enregistrer la vidéo », Fichiers, Messages…).
   L'objet a la même forme que l'enregistreur de la version Claude ({ save }), donc tous les boutons « Enregistrer » de l'app
   l'utilisent sans autre changement. */
window.NATIF = (() => {
  const cap = () => window.Capacitor;
  const actif = () => { try { return !!(cap() && cap().isNativePlatform && cap().isNativePlatform()) } catch (e) { return false } };
  const plateforme = () => (actif() ? cap().getPlatform() : "web");
  const b64 = blob => new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(",")[1] || ""); r.onerror = () => ko(r.error); r.readAsDataURL(blob) });

  async function save({ filename, data }) {
    const P = cap().Plugins, FS = P.Filesystem, SH = P.Share;
    if (!FS || !SH) throw new Error("enregistrement indisponible dans cette version de l’app");
    const nom = String(filename || "video.mp4").replace(/[\\/:*?"<>|]+/g, "_"), chemin = "exports/" + nom;
    try { await FS.deleteFile({ path: chemin, directory: "CACHE" }) } catch (e) {}
    /* écrit par morceaux de 3 Mo (multiple de 3 : les morceaux en base64 se recollent sans erreur) pour ne pas saturer la mémoire */
    const M = 3 * 1024 * 1024;
    for (let o = 0; o < data.size || o === 0; o += M) {
      const d = await b64(data.slice(o, o + M));
      if (o === 0) await FS.writeFile({ path: chemin, data: d, directory: "CACHE", recursive: true });
      else await FS.appendFile({ path: chemin, data: d, directory: "CACHE" });
      if (data.size === 0) break;
    }
    const { uri } = await FS.getUri({ path: chemin, directory: "CACHE" });
    try { await SH.share({ files: [uri], title: nom, dialogTitle: "Enregistrer ou partager" }) }
    catch (e) { if (/cancel|annul/i.test(String(e && (e.message || e.code)))) { const x = new Error("annulé"); x.code = "declined"; throw x } throw e }
  }
  /* fichiers de plus de quelques jours dans le cache : nettoyés au démarrage */
  async function menage() {
    try { const FS = cap().Plugins.Filesystem, l = await FS.readdir({ path: "exports", directory: "CACHE" });
      for (const f of l.files || []) if (f.mtime && Date.now() - f.mtime > 3 * 864e5) await FS.deleteFile({ path: "exports/" + f.name, directory: "CACHE" }).catch(() => {});
    } catch (e) {}
  }
  if (actif()) { document.documentElement.classList.add("natif", "natif-" + plateforme()); setTimeout(menage, 4000) }
  return { actif, plateforme, save };
})();
