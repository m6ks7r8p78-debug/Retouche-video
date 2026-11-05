/* Relais « IA rapide » de Retouche vidéo (Cloudflare Workers, compte séparé du serveur des liens).
   Un seul rôle : permettre à l'app (Safari) de lire le résultat d'un calcul Kaggle de la personne, que Kaggle ne sert pas
   aux navigateurs (pas d'en-tête CORS sur ses fichiers de sortie).
   - Le jeton Kaggle arrive dans l'en-tête X-Kaggle-Jeton, sert à UNE demande à Kaggle, n'est ni gardé ni journalisé.
   - Seuls les calculs nommés « retouche-ia-… » du compte de ce jeton, et seuls les fichiers ia.mp4 / info.json, passent.
   - Seuls les sites de l'app peuvent l'appeler depuis un navigateur ; rien n'est stocké ici. */
const VERSION = "1";
const ORIGINS = /^(https:\/\/(m6ks7r8p78-debug\.github\.io|(www\.)?retoucheproai\.com)|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?)$/;
const SLUG = /^retouche-ia-[a-z0-9]{4,24}$/, FICHIERS = new Set(["ia.mp4", "info.json"]);
const HOTES = /^(www\.kaggleusercontent\.com|storage\.googleapis\.com)$/;
const API = "https://api.kaggle.com/v1/";

function cors(req) {
  const o = req.headers.get("Origin") || "";
  return ORIGINS.test(o) ? { "Access-Control-Allow-Origin": o, "Vary": "Origin", "Access-Control-Expose-Headers": "Content-Length" } : null;
}
const json = (o, s, h) => new Response(JSON.stringify(o), { status: s || 200, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...(h || {}) } });

async function kaggle(jeton, svc, m, body, redirect) {
  return fetch(API + svc + "/" + m, { method: "POST", redirect: redirect || "follow",
    headers: { Authorization: "Bearer " + jeton, "Content-Type": "application/json", "User-Agent": "retouche-video-relais/" + VERSION }, body: JSON.stringify(body) });
}

export default {
  async fetch(req) {
    const u = new URL(req.url), h = cors(req);
    if (req.method === "OPTIONS") {
      if (!h) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: { ...h, "Access-Control-Allow-Methods": "GET", "Access-Control-Allow-Headers": "X-Kaggle-Jeton", "Access-Control-Max-Age": "600" } });
    }
    if (u.pathname === "/etat") return json({ ok: true, service: "retouche-kaggle", version: VERSION }, 200, h || {});
    if (u.pathname !== "/kaggle/sortie" || req.method !== "GET") return json({ erreur: "inconnu" }, 404, h || {});
    if (req.headers.get("Origin") && !h) return json({ erreur: "origine refusée" }, 403);
    const jeton = req.headers.get("X-Kaggle-Jeton") || "", k = u.searchParams.get("k") || "", f = u.searchParams.get("f") || "";
    if (!jeton || jeton.length > 200 || !SLUG.test(k) || !FICHIERS.has(f)) return json({ erreur: "demande invalide" }, 400, h || {});
    /* le compte vient du jeton lui-même : on ne peut lire que ses propres calculs */
    const ir = await kaggle(jeton, "security.OAuthService", "IntrospectToken", { token: jeton });
    const id = ir.ok ? await ir.json() : null;
    if (!id || !id.active || !id.username) return json({ erreur: "jeton Kaggle refusé" }, 401, h || {});
    const r = await kaggle(jeton, "kernels.KernelsApiService", "DownloadKernelOutput", { ownerSlug: id.username, kernelSlug: k, filePath: f }, "manual");
    const loc = r.headers.get("Location");
    if (!loc) return json({ erreur: "fichier introuvable chez Kaggle (" + r.status + ")" }, 404, h || {});
    let cible; try { cible = new URL(loc) } catch (e) { return json({ erreur: "adresse invalide" }, 502, h || {}) }
    if (cible.protocol !== "https:" || !HOTES.test(cible.hostname)) return json({ erreur: "hôte non autorisé" }, 502, h || {});
    const d = await fetch(cible.toString(), { redirect: "manual" });
    if (d.status >= 300 && d.status < 400) return json({ erreur: "redirection inattendue" }, 502, h || {});
    if (!d.ok) return json({ erreur: "Kaggle : " + d.status }, 502, h || {});
    const out = new Headers({ "Content-Type": f.endsWith(".json") ? "application/json; charset=utf-8" : "video/mp4", "Cache-Control": "no-store", ...(h || {}) });
    const n = d.headers.get("Content-Length"); if (n) out.set("Content-Length", n);
    return new Response(d.body, { status: 200, headers: out });
  }
};
