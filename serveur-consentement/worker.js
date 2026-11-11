/* Serveur de consentement RetoucheProAI (Cloudflare Workers + D1) — PRÉPARÉ, NON DÉPLOYÉ.
   Applique côté serveur les mêmes règles que contribution.js. Ne reçoit et ne stocke AUCUN média : le téléversement répond toujours non
   (double verrou : COLLECTE_ACTIVE=0 ici et DISTANT_ACTIF=false dans contribution.js, et aucun stockage n’est configuré).
   Jetons (propriétaire, invitation, révocation) : aléatoires 256 bits, remis une seule fois, seule leur empreinte SHA-256 est gardée. */
import C from "../contribution.js";
const J = (o, s = 200, h = {}) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...h } });
const jeton = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), x => x.toString(16).padStart(2, "0")).join("");
const id = () => jeton().slice(0, 24), HEX = /^[0-9a-f]{64}$/, IDR = /^[0-9a-f]{24}$/, PID = /^[\w-]{1,40}$/;
async function corps(req) { const t = await req.text(); if (t.length > 4096) throw Object.assign(new Error("requête trop grande"), { s: 413 }); try { return t ? JSON.parse(t) : {} } catch (e) { throw Object.assign(new Error("JSON invalide"), { s: 400 }) } }
async function journal(db, type, donnees, now) {
  const d = await db.prepare("SELECT n, empreinte FROM registre ORDER BY n DESC LIMIT 1").first(), c = { n: d ? d.n + 1 : 0, quand: now, type, donnees, precedent: d ? d.empreinte : "0".repeat(64) };
  await db.prepare("INSERT INTO registre (n, quand, type, donnees, precedent, empreinte) VALUES (?,?,?,?,?,?)").bind(c.n, c.quand, c.type, JSON.stringify(c.donnees), c.precedent, await C.empreinte(JSON.stringify(c))).run();
}
async function proprio(db, req, mid) {
  const t = (req.headers.get("authorization") || "").replace(/^Bearer /, ""); if (!HEX.test(t) || !IDR.test(mid)) return null;
  const m = await db.prepare("SELECT * FROM medias WHERE id = ?").bind(mid).first(); return m && m.proprietaire_hash === await C.empreinte(t) ? m : null;
}
async function etatMedia(db, m, now) {
  const P = (await db.prepare("SELECT personne_id FROM personnes WHERE media_id = ?").bind(m.id).all()).results.map(r => r.personne_id);
  const A = (await db.prepare("SELECT * FROM accords WHERE media_id = ?").bind(m.id).all()).results.map(a => ({ personneId: a.personne_id, mediaId: a.media_id, purposes: JSON.parse(a.purposes), majeur: !!a.majeur, notice: a.notice, expire: a.expire, revoked: !!a.revoque }));
  return { media: { id: m.id, droitsFichier: !!m.droits_fichier, tiersProteges: !!m.tiers_proteges, mineurPresent: !!m.mineur_present, personnesInconnues: !!m.personnes_inconnues, personnes: P, etat: m.etat, permissions: JSON.parse(m.permissions) }, accords: A };
}
async function passer(db, m, vers, now, acteur) { if (m.etat === vers || !C.peut(m.etat, vers)) return false; await db.prepare("UPDATE medias SET etat = ? WHERE id = ?").bind(vers, m.id).run(); await journal(db, "etat", { media: m.id, de: m.etat, vers, acteur }, now); m.etat = vers; return true }

export async function traiter(req, env, now = Date.now()) {
  const u = new URL(req.url), p = u.pathname.split("/").filter(Boolean), db = env.DB, M = req.method;
  const cors = { "access-control-allow-origin": env.ORIGINE || "https://retoucheproai.com", "access-control-allow-headers": "authorization, content-type", "access-control-allow-methods": "GET, POST, DELETE", vary: "origin" };
  const R = (o, s) => J(o, s, cors);
  try {
    if (M === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (M === "POST" && p[0] === "medias" && p.length === 1) {
      const b = await corps(req), pers = Array.isArray(b.personnes) ? [...new Set(b.personnes)] : [];
      if (pers.length > 12 || !pers.every(x => typeof x === "string" && PID.test(x))) return R({ erreur: "personnes invalides (identifiants neutres, 12 au plus)" }, 400);
      const perm = {}; for (const k of C.PERMISSIONS) perm[k] = b.permissions && b.permissions[k] === true;
      const mid = id(), t = jeton(); await db.prepare("INSERT INTO medias (id, proprietaire_hash, droits_fichier, tiers_proteges, mineur_present, personnes_inconnues, permissions, cree, expire) VALUES (?,?,?,?,?,?,?,?,?)")
        .bind(mid, await C.empreinte(t), b.droitsFichier === true ? 1 : 0, b.tiersProteges ? 1 : 0, b.mineurPresent ? 1 : 0, b.personnesInconnues ? 1 : 0, JSON.stringify(perm), now, now + 730 * 864e5).run();
      for (const x of pers) await db.prepare("INSERT INTO personnes (media_id, personne_id) VALUES (?,?)").bind(mid, x).run();
      await journal(db, "media_cree", { media: mid, personnes: pers.length }, now); return R({ id: mid, jetonProprietaire: t, etat: "brouillon" }, 201);
    }
    if (p[0] === "medias" && p[2] === "invitations" && M === "POST") {
      const m = await proprio(db, req, p[1]); if (!m) return R({ erreur: "non autorisé" }, 403); const b = await corps(req);
      if (!(await db.prepare("SELECT 1 AS x FROM personnes WHERE media_id = ? AND personne_id = ?").bind(m.id, String(b.personneId)).first())) return R({ erreur: "personne inconnue pour ce média" }, 400);
      const { jeton: t, enregistrement: e } = await C.creerInvitation(m.id, String(b.personneId), 7 * 864e5, now);
      await db.prepare("INSERT INTO invitations (empreinte, media_id, personne_id, cree, expire, notice) VALUES (?,?,?,?,?,?)").bind(e.empreinte, e.mediaId, e.personneId, e.cree, e.expire, e.notice).run();
      await passer(db, m, "invitation_envoyee", now, "proprietaire"); await journal(db, "invitation", { media: m.id, personne: e.personneId }, now); return R({ jetonInvitation: t, expire: e.expire }, 201);
    }
    if (p[0] === "invitations" && (p[1] === "accepter" || p[1] === "refuser") && M === "POST") {
      const b = await corps(req), t = String(b.jeton || ""), inv = HEX.test(t) ? await db.prepare("SELECT * FROM invitations WHERE empreinte = ?").bind(await C.empreinte(t)).first() : null;
      const v = await C.validerInvitation(inv && { ...inv, utilise: !!inv.utilise }, t, now); if (!v.ok) return R({ erreur: v.raison }, 403);
      const m = await db.prepare("SELECT * FROM medias WHERE id = ?").bind(inv.media_id).first(); if (!m) return R({ erreur: "média supprimé" }, 410);
      if (p[1] === "refuser") { await db.prepare("UPDATE invitations SET utilise = 1 WHERE empreinte = ?").bind(inv.empreinte).run(); await passer(db, m, "refuse", now, "personne"); await journal(db, "refus", { media: m.id, personne: inv.personne_id }, now); return R({ etat: m.etat }) }
      const pur = Array.isArray(b.purposes) ? [...new Set(b.purposes)].filter(x => C.FINALITES.includes(x)) : [];
      if (b.majeur !== true) return R({ erreur: "réservé aux personnes majeures : aucun accord enregistré" }, 403);
      if (b.lu !== true || !pur.length) return R({ erreur: "notice non confirmée ou aucun usage choisi : aucun accord enregistré" }, 400);
      await db.prepare("UPDATE invitations SET utilise = 1 WHERE empreinte = ?").bind(inv.empreinte).run();
      const aid = id(), rv = jeton(); await db.prepare("INSERT INTO accords (id, media_id, personne_id, purposes, majeur, notice, cree, expire, revocation_hash) VALUES (?,?,?,?,?,?,?,?,?)")
        .bind(aid, m.id, inv.personne_id, JSON.stringify(pur), 1, C.VERSION_NOTICE, now, now + 730 * 864e5, await C.empreinte(rv)).run();
      const total = (await db.prepare("SELECT COUNT(*) AS c FROM personnes WHERE media_id = ?").bind(m.id).first()).c, ok = (await db.prepare("SELECT COUNT(DISTINCT personne_id) AS c FROM accords WHERE media_id = ? AND revoque = 0").bind(m.id).first()).c;
      if (ok >= total) { if (m.etat === "invitation_envoyee" || m.etat === "accord_partiel") await passer(db, m, "accord_complet", now, "personne") } else await passer(db, m, "accord_partiel", now, "personne");
      await journal(db, "accord", { media: m.id, personne: inv.personne_id, accord: aid, usages: pur, notice: C.VERSION_NOTICE }, now); return R({ accord: aid, jetonRevocation: rv, usages: pur, etat: m.etat }, 201);
    }
    if (p[0] === "accords" && p[2] === "revoquer" && M === "POST") {
      const b = await corps(req), a = IDR.test(p[1]) ? await db.prepare("SELECT * FROM accords WHERE id = ?").bind(p[1]).first() : null;
      if (!a || !HEX.test(String(b.jeton || "")) || a.revocation_hash !== await C.empreinte(b.jeton)) return R({ erreur: "non autorisé" }, 403);
      await db.prepare("UPDATE accords SET revoque = 1, revoque_le = ? WHERE id = ?").bind(now, a.id).run();
      const m = await db.prepare("SELECT * FROM medias WHERE id = ?").bind(a.media_id).first(); if (m) await passer(db, m, "revoque", now, "personne");
      await journal(db, "revocation", { media: a.media_id, accord: a.id }, now); return R({ revoque: true, effet: "usages futurs bloqués immédiatement ; un modèle déjà entraîné ne peut pas toujours oublier un exemple" });
    }
    if (p[0] === "medias" && p.length === 3 && (p[2] === "verifier" || p[2] === "televerser" || p[2] === "valider")) {
      const m = await proprio(db, req, p[1]); if (!m) return R({ erreur: "non autorisé" }, 403);
      if (p[2] === "valider" && M === "POST") { if (m.etat === "accord_complet") await passer(db, m, "verification_en_attente", now, "proprietaire"); return R({ etat: m.etat, note: "le passage à « autorisé » exige une vérification humaine, absente de cette version" }) }
      const fin = u.searchParams.get("finalite") || "", e = await etatMedia(db, m, now), v = C.verifier(e.media, e.accords, fin, { maintenant: now });
      const actif = env.COLLECTE_ACTIVE === "1" && C.DISTANT_ACTIF === true;
      if (p[2] === "verifier" && M === "GET") return R({ reglesOk: v.reglesOk, envoiPermis: v.envoiPermis && actif, raisons: v.raisons, etat: m.etat });
      if (M === "POST") return R({ erreur: actif && v.envoiPermis ? "stockage des médias non configuré" : "téléversement refusé", raisons: v.raisons }, actif && v.envoiPermis ? 501 : 403);
    }
    if (p[0] === "medias" && p.length === 2 && M === "DELETE") {
      const m = await proprio(db, req, p[1]); if (!m) return R({ erreur: "non autorisé" }, 403);
      for (const t of ["personnes", "invitations", "accords"]) await db.prepare("DELETE FROM " + t + " WHERE media_id = ?").bind(m.id).run();
      await db.prepare("DELETE FROM medias WHERE id = ?").bind(m.id).run(); await journal(db, "suppression", { media: m.id }, now); return R({ supprime: true });
    }
    return R({ erreur: "introuvable" }, 404);
  } catch (e) { return R({ erreur: e.s ? e.message : "erreur interne" }, e.s || 500) }
}
/* purge quotidienne : invitations expirées et médias arrivés au terme de conservation */
export async function purger(env, now = Date.now()) {
  await env.DB.prepare("DELETE FROM invitations WHERE expire <= ?").bind(now).run();
  const M = (await env.DB.prepare("SELECT id FROM medias WHERE expire <= ?").bind(now).all()).results;
  for (const m of M) { for (const t of ["personnes", "invitations", "accords"]) await env.DB.prepare("DELETE FROM " + t + " WHERE media_id = ?").bind(m.id).run(); await env.DB.prepare("DELETE FROM medias WHERE id = ?").bind(m.id).run(); await journal(env.DB, "purge", { media: m.id }, now) }
  return M.length;
}
export default { fetch: (req, env) => traiter(req, env), scheduled: (ev, env) => purger(env) };
