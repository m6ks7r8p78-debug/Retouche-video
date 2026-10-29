// Retouche vidéo — serveur (Cloudflare Workers, palier gratuit).
// Rôle : à partir d'un lien TikTok, Instagram, Tumblr (et Reddit / Twitter en secours),
// trouver le fichier vidéo de meilleure qualité et le renvoyer à l'app, avec les bons en-têtes.
// Aucune vidéo n'est stockée : elle transite seulement.

const VERSION = "4";
const UA_PC = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
// hôtes que /proxy accepte de relayer (rien d'autre : pas de relais ouvert)
const PROXY_OK = /^(www\.reddit\.com|old\.reddit\.com|v\.redd\.it|video\.twimg\.com|api\.fxtwitter\.com|[a-z0-9-]+\.media\.tumblr\.com)$/i;

// sites autorisés à appeler ce serveur depuis un navigateur (l'app sur GitHub Pages, sa version dans Claude, les tests locaux) :
// un autre site ne peut plus s'en servir comme téléchargeur sur ton quota gratuit
const ORIGINS = /^https:\/\/(m6ks7r8p78-debug\.github\.io|[a-z0-9-]+\.claudeusercontent\.com|claude\.ai)$|^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;
let ORIGIN = "";
const cors = (h = {}) => ({
  "access-control-allow-origin": ORIGIN || "null",
  vary: "origin",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-expose-headers": "x-nom, x-qualite, content-length",
  ...h,
});
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: cors({ "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }) });
const fail = (code, msg, s = 422) => json({ ok: false, code, msg }, s);
class Err extends Error { constructor(code, msg, s = 422) { super(msg); this.code = code; this.s = s } }

// cookies reçus -> en-tête Cookie
function jar(res, prev = "") {
  const list = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  const m = new Map(prev.split("; ").filter(Boolean).map(c => [c.split("=")[0], c]));
  for (const c of list) { const kv = c.split(";")[0]; m.set(kv.split("=")[0], kv) }
  return [...m.values()].join("; ");
}

async function stream(url, headers, name, quality) {
  const r = await fetch(url, { headers, redirect: "follow" });
  if (!r.ok || !r.body) throw new Err("telechargement", "Le site a refusé l'envoi du fichier vidéo (" + r.status + ").", 502);
  const h = cors({ "content-type": r.headers.get("content-type") || "video/mp4", "x-nom": name, "cache-control": "no-store" });
  if (quality) h["x-qualite"] = quality;
  const len = r.headers.get("content-length"); if (len) h["content-length"] = len;
  return new Response(r.body, { status: 200, headers: h });
}

/* ---------- TikTok ---------- */
async function tiktok(u) {
  let url = u.href;
  if (/^(vm|vt)\./i.test(u.hostname) || /\/t\//.test(u.pathname)) {
    const r = await fetch(url, { headers: { "user-agent": UA_PC }, redirect: "follow" });
    url = r.url;
  }
  const id = (url.match(/\/(?:video|photo)\/(\d+)/) || [])[1];
  if (!id) throw new Err("lien", "Lien TikTok non reconnu : copie le lien de la vidéo (Partager → Copier le lien).");
  if (/\/photo\//.test(url)) throw new Err("pas_video", "Ce TikTok est un diaporama de photos, pas une vidéo.");
  const page = await fetch("https://www.tiktok.com/@i/video/" + id, { headers: { "user-agent": UA_PC, "accept-language": "fr-FR,fr;q=0.9,en;q=0.8" } });
  const cookie = jar(page);
  const html = await page.text();
  const m = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Err("bloque", "TikTok n'a pas répondu normalement. Réessaie dans un moment.", 502);
  const d = JSON.parse(m[1]).__DEFAULT_SCOPE__ || {};
  const vd = d["webapp.video-detail"];
  if (!vd || vd.statusCode) throw new Err("introuvable", "Vidéo TikTok introuvable : supprimée, privée ou réservée à certains pays.", 404);
  const it = vd.itemInfo && vd.itemInfo.itemStruct, v = it && it.video;
  if (!v) throw new Err("pas_video", "Ce TikTok ne contient pas de vidéo.");
  // la meilleure version sans filigrane : plus grande image, puis plus haut débit
  const cand = (v.bitrateInfo || []).map(b => ({
    url: b.PlayAddr && b.PlayAddr.UrlList && b.PlayAddr.UrlList[0],
    h: (b.PlayAddr && b.PlayAddr.Height) || 0, w: (b.PlayAddr && b.PlayAddr.Width) || 0, br: b.Bitrate || 0,
  })).filter(c => c.url).sort((a, b) => (b.h * b.w - a.h * a.w) || (b.br - a.br));
  if (v.playAddr) cand.push({ url: v.playAddr, h: v.height || 0, w: v.width || 0, br: 0 });
  if (!cand.length) throw new Err("pas_video", "Ce TikTok ne contient pas de vidéo téléchargeable.");
  const who = ((it.author && it.author.uniqueId) || "tiktok").replace(/[^\w.-]/g, "");
  let last;
  for (const c of cand) {
    try { return await stream(c.url, { "user-agent": UA_PC, referer: "https://www.tiktok.com/", cookie }, "tiktok-" + who + "-" + id + ".mp4", c.w && c.h ? c.w + "x" + c.h : "") }
    catch (e) { last = e }
  }
  throw last;
}

/* ---------- Instagram (le plus fermé : plusieurs méthodes, la meilleure qualité d'abord) ---------- */
const IG_HDR = { "user-agent": UA_PC, "x-ig-app-id": "936619743392459", "x-asbd-id": "129477", "sec-fetch-site": "same-origin", "accept-language": "fr-FR,fr;q=0.9,en;q=0.8", referer: "https://www.instagram.com/" };
const IG_DOCS = ["8845758582119845", "9510064595728286", "25531498899829322"];
function igMediaId(sc) { // code court (11 premiers caractères) -> identifiant numérique
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let id = 0n; for (const c of sc.slice(0, 11)) id = id * 64n + BigInt(A.indexOf(c)); return id.toString();
}
function igPick(md) {
  let node = md;
  if (md && !md.is_video && md.edge_sidecar_to_children) node = (md.edge_sidecar_to_children.edges || []).map(e => e.node).find(n => n.is_video) || md;
  if (md && md.carousel_media) node = md.carousel_media.find(n => n.video_versions) || md;
  if (node && node.video_url) return { url: node.video_url, q: node.dimensions ? node.dimensions.width + "x" + node.dimensions.height : "" };
  if (node && node.video_versions && node.video_versions.length) { const v = [...node.video_versions].sort((a, b) => (b.width * b.height) - (a.width * a.height))[0]; return { url: v.url, q: v.width + "x" + v.height } }
  return null;
}
async function igFind(sc, log) {
  const codes = [...new Set([sc, sc.slice(0, 11)])];
  // 1) l'interface publique des publications (plusieurs versions connues)
  for (const code of codes) for (const doc of IG_DOCS) {
    try {
      const body = new URLSearchParams({ variables: JSON.stringify({ shortcode: code, fetch_tagged_user_count: null, hoisted_comment_id: null, hoisted_reply_id: null }), doc_id: doc, lsd: "AVqbxe3J_YA" });
      const r = await fetch("https://www.instagram.com/graphql/query", { method: "POST", body, headers: { ...IG_HDR, "content-type": "application/x-www-form-urlencoded", "x-fb-lsd": "AVqbxe3J_YA" } });
      const t = await r.text(); let md = null;
      try { const j = JSON.parse(t); md = j && j.data && (j.data.xdt_shortcode_media || j.data.shortcode_media) } catch (e) {}
      log.push("graphql " + code.length + "c doc" + doc.slice(0, 4) + " : " + r.status + (md ? " média" : " vide"));
      if (md) { const v = igPick(md); if (v) return v; if (!md.is_video) throw new Err("pas_video", "Cette publication Instagram ne contient pas de vidéo.") }
    } catch (e) { if (e instanceof Err) throw e; log.push("graphql erreur " + e.message) }
  }
  // 2) l'interface de l'app (fonctionne parfois sans compte)
  try {
    const r = await fetch("https://i.instagram.com/api/v1/media/" + igMediaId(sc) + "/info/", { headers: { ...IG_HDR, "user-agent": "Instagram 337.0.0.35.102 Android (34/14; 420dpi; 1080x2340; samsung; SM-S918B; dm3q; qcom; fr_FR; 619285474)" } });
    const t = await r.text(); log.push("api app : " + r.status);
    try { const j = JSON.parse(t); const it = j.items && j.items[0]; const v = it && igPick(it); if (v) return v } catch (e) {}
  } catch (e) { log.push("api app erreur " + e.message) }
  // 3) les pages « intégrées »
  for (const path of ["/p/" + sc + "/embed/captioned/", "/reel/" + sc + "/embed/", "/p/" + sc.slice(0, 11) + "/embed/captioned/"]) {
    try {
      const r = await fetch("https://www.instagram.com" + path, { headers: { "user-agent": UA_PC } });
      const t = await r.text();
      const m = t.match(/"video_url\\?"\s*:\s*\\?"([^"\\]*(?:\\.[^"\\]*)*)\\?"/) || t.match(/<video[^>]+src="([^"]+)"/);
      log.push("intégrée " + path.split("/")[1] + " : " + r.status + (m ? " vidéo" : " sans vidéo"));
      if (m) return { url: JSON.parse('"' + m[1].replace(/\\\//g, "/").replace(/\\\\/g, "\\") + '"').replace(/&amp;/g, "&"), q: "" };
    } catch (e) { log.push("intégrée erreur " + e.message) }
  }
  return null;
}
async function instagram(u, log = []) {
  const sc = (u.pathname.match(/\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/) || [])[1];
  if (!sc) throw new Err("lien", "Lien Instagram non reconnu : copie le lien d'une publication ou d'un reel (… → Copier le lien).");
  const v = await igFind(sc, log);
  if (v) return stream(v.url, { "user-agent": UA_PC, referer: "https://www.instagram.com/" }, "instagram-" + sc.slice(0, 11) + ".mp4", v.q);
  throw new Err("bloque", "Instagram bloque l'accès à cette vidéo pour l'instant (compte privé, ou protection d'Instagram). Enregistre-la depuis l'app Instagram puis choisis-la dans Retouche.", 502);
}

/* ---------- Tumblr ---------- */
async function tumblr(u) {
  // ancien format blog.tumblr.com/post/123 -> www.tumblr.com/blog/123 (page lisible sans consentement)
  const bm = u.hostname.match(/^([a-z0-9-]+)\.tumblr\.com$/i), pm = u.pathname.match(/\/post\/(\d+)/);
  if (bm && !/^(www|m)$/i.test(bm[1]) && pm) u = new URL("https://www.tumblr.com/" + bm[1] + "/" + pm[1]);
  const r = await fetch(u.href, { headers: { "user-agent": UA_PC }, redirect: "follow" });
  if (r.status === 404) throw new Err("introuvable", "Publication Tumblr introuvable.", 404);
  const t = await r.text();
  const all = [...new Set((t.match(/https?:\\?\/\\?\/[a-z0-9-]+\.media\.tumblr\.com\\?\/[^"'\s<>]+?\.mp4/gi) || []).map(x => x.replace(/\\\//g, "/")))];
  if (!all.length) throw new Err("pas_video", "Cette publication Tumblr ne contient pas de vidéo hébergée par Tumblr.");
  // la première vidéo de la page est celle de la publication ; parmi ses versions, l'originale
  // (sans suffixe « _480 », qui est une version réduite) passe en premier
  const base = x => (x.match(/(tumblr_[A-Za-z0-9]+)/) || [])[1];
  const b0 = base(all[0]);
  const mine = all.filter(x => base(x) === b0);
  mine.sort((a, b) => (/_\d{3,4}\.mp4$/.test(a) ? 1 : 0) - (/_\d{3,4}\.mp4$/.test(b) ? 1 : 0));
  all.length = 0; all.push(...mine);
  const id = (u.pathname.match(/(\d{6,})/) || [])[1] || "video";
  let last;
  for (const v of all) { try { return await stream(v, { "user-agent": UA_PC, referer: "https://www.tumblr.com/" }, "tumblr-" + id + ".mp4", "") } catch (e) { last = e } }
  throw last;
}

/* ---------- Facebook ---------- */
async function facebook(u, sd) {
  const H = { "user-agent": UA_PC, accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", "accept-language": "en-us,en;q=0.5", "sec-fetch-mode": "navigate" };
  let url = u.href;
  // liens courts / de partage : on suit la redirection pour trouver le numéro de la vidéo
  if (/fb\.watch$/i.test(u.hostname) || /\/share\//.test(u.pathname)) { const r = await fetch(url, { headers: H, redirect: "follow" }); url = r.url }
  const id = (url.match(/(?:[?&]v=|\/videos\/(?:[^/?#]+\/)?|\/reel\/|\/watch\/\?v=)(\d{6,})/) || [])[1];
  const page = await fetch(id ? "https://www.facebook.com/watch/?v=" + id + "&_rdr" : url, { headers: H, redirect: "follow" });
  const t = await page.text();
  const get = k => { const m = t.match(new RegExp('"' + k + '":("(?:[^"\\\\]|\\\\.)*")')); try { return m ? JSON.parse(m[1]) : null } catch (e) { return null } };
  const v = (sd ? null : (get("browser_native_hd_url") || get("playable_url_quality_hd"))) || get("browser_native_sd_url") || get("playable_url");
  if (!v) throw new Err("bloque", "Vidéo Facebook introuvable : elle est peut-être privée, réservée à un groupe, ou supprimée.", 502);
  return stream(v, { "user-agent": UA_PC, referer: "https://www.facebook.com/" }, "facebook-" + (id || "video") + ".mp4", "");
}

/* ---------- Pinterest ---------- */
async function pinterest(u) {
  let url = u.href;
  if (/pin\.it$/i.test(u.hostname)) { const r = await fetch(url, { headers: { "user-agent": UA_PC }, redirect: "follow" }); url = r.url }
  const id = (url.match(/\/pin\/(?:[^/]*?-)?(\d+)/) || [])[1];
  if (!id) throw new Err("lien", "Lien Pinterest non reconnu : copie le lien d'une épingle vidéo.");
  const q = encodeURIComponent(JSON.stringify({ options: { field_set_key: "unauth_react_main_pin", id } }));
  const r = await fetch("https://www.pinterest.com/resource/PinResource/get/?data=" + q, { headers: { "user-agent": UA_PC, "x-pinterest-pws-handler": "www/[username].js", accept: "application/json" } });
  if (!r.ok) throw new Err("bloque", "Pinterest n'a pas répondu (" + r.status + "). Réessaie dans un moment.", 502);
  const d = ((await r.json()).resource_response || {}).data || {};
  let list = (d.videos && d.videos.video_list) || null;
  if (!list && d.story_pin_data) for (const pg of d.story_pin_data.pages || []) for (const b of pg.blocks || []) if (b.video && b.video.video_list) { list = b.video.video_list; break }
  const c = Object.values(list || {}).filter(x => x && x.url && /\.mp4(\?|$)/.test(x.url)).sort((a, b) => (b.width * b.height) - (a.width * a.height));
  if (!c.length) throw new Err("pas_video", "Cette épingle Pinterest ne contient pas de vidéo.");
  return stream(c[0].url, { "user-agent": UA_PC }, "pinterest-" + id + ".mp4", c[0].width + "x" + c[0].height);
}

/* ---------- Snapchat (Spotlight et vidéos publiques) ---------- */
async function snapchat(u) {
  const r = await fetch(u.href, { headers: { "user-agent": UA_PC, "accept-language": "fr-FR,fr;q=0.9" }, redirect: "follow" });
  const t = await r.text();
  const m = t.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Err("bloque", "Snapchat n'a pas répondu normalement. Réessaie dans un moment.", 502);
  const s = m[1];
  const c = [...s.matchAll(/"contentUrl":"([^"]+)"/g)].map(x => JSON.parse('"' + x[1] + '"'));
  const id = (new URL(r.url).pathname.match(/\/spotlight\/([\w-]+)/) || [])[1];
  let pick = c[0];
  if (id) { const i = s.indexOf(id); if (i > 0) { const after = s.slice(i).match(/"contentUrl":"([^"]+)"/); if (after) pick = JSON.parse('"' + after[1] + '"') } }
  if (!pick) throw new Err("pas_video", "Aucune vidéo publique trouvée sur ce lien Snapchat.");
  return stream(pick, { "user-agent": UA_PC }, "snapchat-" + (id ? id.slice(0, 12) : "video") + ".mp4", "");
}

/* ---------- Bluesky (fichier d'origine envoyé par l'auteur) ---------- */
async function bluesky(u) {
  const m = u.pathname.match(/\/profile\/([^/]+)\/post\/([\w]+)/);
  if (!m) throw new Err("lien", "Lien Bluesky non reconnu : copie le lien d'une publication.");
  const j = await (await fetch("https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread?depth=0&parentHeight=0&uri=" + encodeURIComponent("at://" + m[1] + "/app.bsky.feed.post/" + m[2]))).json();
  const post = j && j.thread && j.thread.post;
  if (!post) throw new Err("introuvable", "Publication Bluesky introuvable.", 404);
  const e = post.embed || {}, v = e.$type && e.$type.includes("video") ? e : (e.media && e.media.$type && e.media.$type.includes("video") ? e.media : null);
  if (!v || !v.cid) throw new Err("pas_video", "Cette publication Bluesky ne contient pas de vidéo.");
  const did = post.author.did;
  let ep = "https://bsky.social";
  try { const dj = await (await fetch(did.startsWith("did:web:") ? "https://" + did.slice(8) + "/.well-known/did.json" : "https://plc.directory/" + did)).json(); const sv = (dj.service || []).find(x => x.type === "AtprotoPersonalDataServer"); if (sv) ep = sv.serviceEndpoint } catch (x) {}
  const q = v.aspectRatio ? v.aspectRatio.width + "x" + v.aspectRatio.height : "";
  return stream(ep + "/xrpc/com.atproto.sync.getBlob?did=" + encodeURIComponent(did) + "&cid=" + v.cid, { "user-agent": UA_PC }, "bluesky-" + m[2] + ".mp4", q);
}

/* ---------- Streamable ---------- */
async function streamable(u) {
  const id = (u.pathname.match(/^\/(?:[es]\/)?(\w+)/) || [])[1];
  const r = await fetch("https://ajax.streamable.com/videos/" + id, { headers: { "user-agent": UA_PC } });
  if (!r.ok) throw new Err("introuvable", "Vidéo Streamable introuvable.", 404);
  const j = await r.json(), f = j.files || {};
  const c = Object.values(f).filter(x => x && x.url && /mp4/.test(x.url)).sort((a, b) => (b.width * b.height) - (a.width * a.height));
  if (!c.length) throw new Err("pas_video", "Cette vidéo Streamable n'est pas encore prête.");
  return stream(c[0].url.startsWith("//") ? "https:" + c[0].url : c[0].url, { "user-agent": UA_PC }, "streamable-" + id + ".mp4", c[0].width + "x" + c[0].height);
}

/* ---------- Twitch (clips) ---------- */
async function twitch(u) {
  const slug = (u.pathname.match(/\/clip\/([\w-]+)/) || (u.hostname.startsWith("clips.") ? u.pathname.match(/^\/([\w-]+)/) : null) || [])[1];
  if (!slug) throw new Err("lien", "Seuls les clips Twitch sont pris en charge (pas les rediffusions ni les directs).");
  const r = await fetch("https://gql.twitch.tv/gql", { method: "POST", headers: { "client-id": "ue6666qo983tsx6so1t0vnawi233wa", "content-type": "text/plain;charset=UTF-8" },
    body: JSON.stringify([{ operationName: "ShareClipRenderStatus", variables: { slug }, extensions: { persistedQuery: { version: 1, sha256Hash: "2db6a3b20eabf510bd3cf465ae2408834b59eb6b8af89ca73ab1486cacecfb63" } } }]) });
  const clip = (((await r.json())[0] || {}).data || {}).clip;
  if (!clip) throw new Err("introuvable", "Ce clip Twitch n'existe plus.", 404);
  const qs = ((clip.assets && clip.assets[0] && clip.assets[0].videoQualities) || clip.videoQualities || []).filter(x => x.sourceURL).sort((a, b) => (+b.quality) - (+a.quality));
  if (!qs.length) throw new Err("pas_video", "Clip Twitch sans vidéo téléchargeable.");
  const tok = clip.playbackAccessToken;
  const url = qs[0].sourceURL + (qs[0].sourceURL.includes("?") ? "&" : "?") + "sig=" + encodeURIComponent(tok.signature) + "&token=" + encodeURIComponent(tok.value);
  return stream(url, { "user-agent": UA_PC }, "twitch-" + slug.slice(0, 40) + ".mp4", qs[0].quality + "p");
}

/* ---------- Imgur ---------- */
async function imgur(u) {
  let id = (u.pathname.match(/\/(?:gallery\/|a\/|t\/[^/]+\/)?(?:[\w-]*-)?([A-Za-z0-9]{5,8})(?:\.\w+)?$/) || [])[1];
  if (/\/(gallery|a)\//.test(u.pathname)) {
    const r = await fetch("https://api.imgur.com/post/v1/" + (u.pathname.includes("/a/") ? "albums/" : "posts/") + id + "?client_id=546c25a59c58ad7&include=media", { headers: { "user-agent": UA_PC } });
    const j = await r.json(); const m = (j.media || []).find(x => x.type === "video" || /mp4/.test(x.ext || x.mime_type || ""));
    if (!m) throw new Err("pas_video", "Cette publication Imgur ne contient pas de vidéo.");
    return stream(m.url, { "user-agent": UA_PC }, "imgur-" + id + ".mp4", m.width ? m.width + "x" + m.height : "");
  }
  return stream("https://i.imgur.com/" + id + ".mp4", { "user-agent": UA_PC }, "imgur-" + id + ".mp4", "");
}

/* ---------- 9GAG ---------- */
async function ninegag(u) {
  const id = (u.pathname.match(/\/gag\/(\w+)/) || [])[1];
  if (!id) throw new Err("lien", "Lien 9GAG non reconnu.");
  let last;
  for (const s of ["_460sv.mp4", "_460svh265.mp4", "_460svav1.mp4"]) { try { return await stream("https://img-9gag-fun.9cache.com/photo/" + id + s, { "user-agent": UA_PC, referer: "https://9gag.com/" }, "9gag-" + id + ".mp4", "") } catch (e) { last = e } }
  throw new Err("pas_video", "Ce post 9GAG ne contient pas de vidéo.");
}

/* ---------- LinkedIn (publications publiques) ---------- */
async function linkedin(u) {
  const r = await fetch(u.href, { headers: { "user-agent": UA_PC, "accept-language": "fr-FR,fr;q=0.9" }, redirect: "follow" });
  const t = await r.text();
  const m = t.match(/<video[^>]+data-sources="([^"]+)"/);
  if (!m) throw new Err("pas_video", "Vidéo LinkedIn introuvable : la publication doit être publique et contenir une vidéo.");
  const src = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
  const c = src.filter(x => x.src).sort((a, b) => (+b["data-bitrate"] || 0) - (+a["data-bitrate"] || 0));
  if (!c.length) throw new Err("pas_video", "Vidéo LinkedIn introuvable.");
  return stream(c[0].src, { "user-agent": UA_PC }, "linkedin-video.mp4", "");
}

async function video(link, opt = {}) {
  let u; try { u = new URL(link) } catch (e) { throw new Err("lien", "Lien invalide.") }
  const h = u.hostname.toLowerCase().replace(/^www\.|^m\./, "");
  if (/(^|\.)tiktok\.com$/.test(h)) return tiktok(u);
  if (/(^|\.)instagram\.com$/.test(h)) return instagram(u);
  if (/(^|\.)tumblr\.com$/.test(h)) return tumblr(u);
  if (/(^|\.)(facebook\.com|fb\.watch|fb\.com)$/.test(h)) return facebook(u, opt.sd);
  if (/(^|\.)pinterest\.[a-z.]+$|^pin\.it$/.test(h)) return pinterest(u);
  if (/(^|\.)snapchat\.com$/.test(h)) return snapchat(u);
  if (/(^|\.)bsky\.app$/.test(h)) return bluesky(u);
  if (/(^|\.)streamable\.com$/.test(h)) return streamable(u);
  if (/(^|\.)twitch\.tv$/.test(h)) return twitch(u);
  if (/(^|\.)imgur\.com$/.test(h)) return imgur(u);
  if (/(^|\.)9gag\.com$/.test(h)) return ninegag(u);
  if (/(^|\.)linkedin\.com$/.test(h)) return linkedin(u);
  throw new Err("site", "Ce site n'est pas encore pris en charge.");
}

// limite simple par adresse IP (au mieux : chaque instance du serveur compte de son côté)
const HITS = new Map();
function tooMany(ip) {
  const now = Date.now(), w = 60000, max = 40;
  const a = (HITS.get(ip) || []).filter(t => now - t < w); a.push(now); HITS.set(ip, a);
  if (HITS.size > 5000) HITS.clear();
  return a.length > max;
}

export default {
  async fetch(req) {
    const u = new URL(req.url);
    const origin = req.headers.get("origin") || "";
    ORIGIN = ORIGINS.test(origin) ? origin : "";
    if (origin && !ORIGIN) return new Response("Origine non autorisée.", { status: 403 });
    if (u.pathname !== "/" && u.pathname !== "/etat" && tooMany(req.headers.get("cf-connecting-ip") || "?")) return fail("limite", "Trop de demandes : réessaie dans une minute.", 429);
    if (req.method === "OPTIONS") return new Response(null, { headers: cors({ "access-control-max-age": "86400" }) });
    try {
      if (u.pathname === "/" || u.pathname === "/etat") return json({ ok: true, service: "retouche-serveur", version: VERSION });
      if (u.pathname === "/video") return await video(u.searchParams.get("url") || "", { sd: u.searchParams.get("q") === "sd" });
      if (u.pathname === "/test") { // diagnostic lisible : ce que chaque méthode a obtenu (sans télécharger la vidéo)
        const link = u.searchParams.get("url") || ""; const log = [];
        try { const l = new URL(link); if (!/instagram\.com$/i.test(l.hostname)) return json({ ok: false, msg: "test réservé à Instagram" });
          const sc = (l.pathname.match(/\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/) || [])[1]; const v = await igFind(sc, log);
          return json({ ok: !!v, qualite: v && v.q, etapes: log });
        } catch (e) { return json({ ok: false, erreur: e.message, etapes: log }) }
      }
      if (u.pathname === "/proxy") {
        let t; try { t = new URL(u.searchParams.get("u") || "") } catch (e) { return fail("lien", "Adresse invalide.", 400) }
        if (t.protocol !== "https:" || !PROXY_OK.test(t.hostname)) return fail("refuse", "Adresse non autorisée.", 403);
        const ref = /twimg|fxtwitter/.test(t.hostname) ? "https://x.com/" : /tumblr/.test(t.hostname) ? "https://www.tumblr.com/" : "https://www.reddit.com/";
        // redirections suivies une par une : chaque nouvelle adresse doit rester dans la liste autorisée
        let r, cur = t.href;
        for (let hop = 0; ; hop++) {
          r = await fetch(cur, { headers: { "user-agent": UA_PC, referer: ref, accept: "*/*" }, redirect: "manual" });
          const loc = r.status >= 300 && r.status < 400 && r.headers.get("location");
          if (!loc) break;
          if (hop >= 5) return fail("redirections", "Trop de redirections.", 502);
          const n = new URL(loc, cur);
          if (n.protocol !== "https:" || !PROXY_OK.test(n.hostname)) return fail("refuse", "Redirection vers une adresse non autorisée.", 403);
          cur = n.href;
        }
        const h = cors({ "content-type": r.headers.get("content-type") || "application/octet-stream", "cache-control": "no-store" });
        const len = r.headers.get("content-length"); if (len) h["content-length"] = len;
        return new Response(r.body, { status: r.status, headers: h });
      }
      return fail("route", "Adresse inconnue.", 404);
    } catch (e) {
      if (e instanceof Err) return fail(e.code, e.message, e.s);
      return fail("erreur", "Erreur du serveur : " + String(e && e.message || e).slice(0, 120), 500);
    }
  },
};
