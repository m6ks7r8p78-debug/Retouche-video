/* ===== v5.6 : offres Gratuit / Premium (préparées, ÉTEINTES) =====
   Tant que ABO_CONFIG.actif vaut false, tout est gratuit et l'app se comporte exactement comme avant.
   Détail des offres et des prix : OFFRES.md. Pour allumer : PREMIUM.md.

   Deux façons de payer, choisies toutes seules :
   - site web : Polar (marchand officiel, TVA gérée). Chaque achat donne une clé de licence, vérifiée par notre serveur
     (serveur/worker.js, route /abo/verifier) ; le Premium reste actif hors ligne jusqu'à 7 jours entre deux vérifications ;
   - app App Store / Google Play : achats intégrés (obligatoires sur les stores) via RevenueCat, droit « premium ». */
window.ABO_CONFIG = {
  actif: false,                 /* interrupteur général */
  serveur: "https://retouche-serveur.retouche-ia.workers.dev", /* vérifie les clés Polar (/abo/verifier) */
  /* liens de paiement Polar, un par formule (à coller une fois les produits créés chez Polar) */
  paiement: { pass: "", mensuel: "", annuel: "" },
  portail: "",                  /* lien « Gérer mon abonnement » de Polar */
  revenuecat: { ios: "", android: "" }, /* clés publiques RevenueCat de l'app (stores) */
  droit: "premium"              /* nom du droit RevenueCat */
};

window.ABO = (() => {
  const C = window.ABO_CONFIG, CLE = "abo_etat", JOUR = 864e5;
  const PLANS = [
    { id: "pass", nom: "Pass 7 jours", prix: "2,99 €", detail: "TTC, une seule fois, sans abonnement" },
    { id: "mensuel", nom: "Mensuel", prix: "5,99 €", detail: "TTC par mois, sans engagement, résiliable à tout moment" },
    { id: "annuel", nom: "Annuel", prix: "34,99 €", detail: "TTC par an, soit 2,92 € par mois, renouvelé chaque année", top: "−51 %" }
  ];
  const AVANTAGES = ["Export en 4K", "IA qualité maximale", "Retirer un filtre de réseau social", "Effacer une zone (IA)",
    "Corriger une vidéo accélérée ou ralentie", "Regrouper des vidéos et améliorer tout un lot", "Aucune publicité", "Utilisable hors ligne"];
  const RAISONS = { k4: "L’export en 4K", ia: "L’IA qualité maximale", filtre: "Le retrait de filtre", effacer: "« Effacer une zone »",
    tr: "La correction de vitesse (Time Repair)", regrouper: "Le regroupement de vidéos", lot: "L’amélioration d’un lot de vidéos",
    hl: "L’utilisation hors ligne" };

  const natif = () => { try { return !!(window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform()) } catch (e) { return false } };
  const lire = () => { try { return JSON.parse(localStorage.getItem(CLE) || "null") } catch (e) { return null } };
  const ecrire = e => { try { e ? localStorage.setItem(CLE, JSON.stringify(e)) : localStorage.removeItem(CLE) } catch (x) {} };
  /* e = { source: "polar"|"store", cle, plan, fin (ms ou null), verifie (ms) } */
  function valide(e, now = Date.now()) {
    if (!e || !e.verifie) return false;
    if (e.fin && e.fin < now) return false;          /* pass expiré */
    return now - e.verifie < 7 * JOUR;               /* hors ligne : 7 jours de grâce entre deux vérifications */
  }
  const actif = () => !!C.actif;
  const premium = () => !actif() || valide(lire());
  const besoin = { k4: 1, ia: 1, filtre: 1, effacer: 1, tr: 1, regrouper: 1, lot: 1, hl: 1 };
  const autorise = f => premium() || !besoin[f];

  /* ---------- vérification d'une clé de licence Polar (site web) ---------- */
  async function verifierCle(cle) {
    cle = String(cle || "").trim();
    if (!/^[A-Za-z0-9-]{8,80}$/.test(cle)) throw new Error("Code invalide : vérifie qu’il est copié en entier.");
    let r;
    try { r = await fetch(C.serveur + "/abo/verifier", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cle }) }) }
    catch (e) { throw new Error("Pas de connexion : réessaie quand tu es en ligne.") }
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.premium) { const x = new Error(j.raison || "Ce code n’est pas (ou plus) actif."); x.definitif = !!j.definitif; throw x }
    const e = { source: "polar", cle, plan: j.plan || "", fin: j.fin ? Date.parse(j.fin) : null, verifie: Date.now() };
    ecrire(e); return e;
  }
  /* revérifie en arrière-plan (une fois par jour) ; sans réseau, on garde l'accès jusqu'à la fin des 7 jours de grâce */
  async function rafraichir() {
    const e = lire(); if (!actif() || !e || Date.now() - e.verifie < JOUR) return;
    if (e.source === "store") return storeSync();
    try { await verifierCle(e.cle) } catch (x) { if (x.definitif) ecrire(null) } /* panne ou hors ligne : on garde la grâce de 7 jours */
  }

  /* ---------- achats intégrés (app des stores, RevenueCat) ---------- */
  const RC = () => window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.Purchases;
  let rcPret = null;
  function rcInit() {
    if (rcPret) return rcPret;
    rcPret = (async () => {
      const P = RC(); if (!P) throw new Error("Achats indisponibles sur cet appareil.");
      const os = Capacitor.getPlatform(), apiKey = os === "ios" ? C.revenuecat.ios : C.revenuecat.android;
      if (!apiKey) throw new Error("Achats pas encore configurés.");
      await P.configure({ apiKey }); return P;
    })(); return rcPret;
  }
  function depuisInfos(info) {
    const d = info && info.customerInfo && info.customerInfo.entitlements && info.customerInfo.entitlements.active && info.customerInfo.entitlements.active[C.droit];
    if (!d) { ecrire(null); return null }
    const e = { source: "store", cle: "", plan: d.productIdentifier || "", fin: d.expirationDate ? Date.parse(d.expirationDate) : null, verifie: Date.now() };
    ecrire(e); return e;
  }
  async function storeSync() { try { const P = await rcInit(); return depuisInfos(await P.getCustomerInfo()) } catch (e) { return null } }
  async function storeAcheter(plan) {
    const P = await rcInit(), o = await P.getOfferings(), pk = o && o.current && o.current.availablePackages || [];
    const want = { pass: ["CUSTOM", "pass"], mensuel: ["MONTHLY"], annuel: ["ANNUAL"] }[plan] || [];
    const p = pk.find(x => want.includes(x.packageType) || want.includes(x.identifier)); if (!p) throw new Error("Formule indisponible pour l’instant.");
    return depuisInfos(await P.purchasePackage({ aPackage: p }));
  }
  async function storeRestaurer() { const P = await rcInit(); return depuisInfos(await P.restorePurchases()) }

  /* ---------- fenêtre d'offre ---------- */
  function dlg() {
    let d = document.getElementById("abo-dlg");
    if (!d) { d = document.createElement("dialog"); d.id = "abo-dlg"; d.className = "abo-dlg"; d.setAttribute("aria-labelledby", "abo-t"); document.body.appendChild(d) }
    return d;
  }
  function ouvrir(raison) {
    const d = dlg(), n = natif();
    const titre = raison && RAISONS[raison] ? RAISONS[raison] + " fait partie de Premium" : "Passe à Premium";
    d.innerHTML = '<button class="abo-x" type="button" aria-label="Fermer">✕</button><h2 id="abo-t">' + titre + '</h2>' +
      '<ul class="abo-av">' + AVANTAGES.map(a => "<li>" + a + "</li>").join("") + '</ul>' +
      '<div class="abo-plans">' + PLANS.map(p => '<button type="button" class="abo-plan' + (p.top ? " top" : "") + '" data-plan="' + p.id + '">' +
        (p.top ? '<span class="abo-badge">' + p.top + '</span>' : "") + '<b>' + p.nom + '</b><span class="abo-prix">' + p.prix + '</span><small>' + p.detail + '</small></button>').join("") + '</div>' +
      /* droit de rétractation (code de la consommation, art. L221-28 13°) : accord exprès avant tout paiement sur le site */
      (n ? "" : '<label class="abo-retract"><input type="checkbox" id="abo-rc"> <span>Je demande l’accès immédiat à Premium et je reconnais perdre mon droit de rétractation de 14 jours dès son activation (<a href="cgv.html" target="_blank">conditions de vente</a>).</span></label>') +
      '<p class="abo-msg" role="status"></p>' +
      (n ? '<button type="button" class="btn" data-a="restaurer">Restaurer mes achats</button>'
         : '<details class="abo-code"><summary>J’ai déjà un code Premium</summary><div class="row"><input type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="Colle ton code ici" aria-label="Code Premium"><button type="button" class="btn" data-a="code">Activer</button></div></details>') +
      '<p class="abo-pied">Paiement sécurisé' + (n ? " par ton compte " + (Capacitor.getPlatform() === "ios" ? "Apple" : "Google") : " par Polar") + '. Résiliable à tout moment. <a href="tarifs.html">Détail des offres</a>' + (n ? "" : ' · <a href="cgv.html" target="_blank">Conditions de vente</a>') + '</p>';
    const msg = t => { d.querySelector(".abo-msg").textContent = t };
    d.onclick = async e => {
      if (e.target.closest(".abo-x")) return d.close();
      const p = e.target.closest("[data-plan]"), a = e.target.closest("[data-a]");
      try {
        if (p) {
          if (n) { msg("Ouverture du paiement…"); if (await storeAcheter(p.dataset.plan)) { msg("Merci ! Premium est activé."); setTimeout(() => location.reload(), 900) } return }
          const u = C.paiement[p.dataset.plan]; if (!u) return msg("Le paiement ouvre très bientôt.");
          const rc = d.querySelector("#abo-rc"); if (rc && !rc.checked) { rc.closest("label").classList.add("abo-alerte"); rc.focus(); return msg("Coche la case ci-dessus pour continuer.") }
          window.open(u, "_blank", "noopener"); msg("Après le paiement, ton code Premium s’affiche et arrive par e-mail : colle-le ci-dessous.");
          d.querySelector(".abo-code").open = true;
        } else if (a && a.dataset.a === "code") {
          msg("Vérification…"); await verifierCle(d.querySelector(".abo-code input").value); msg("Merci ! Premium est activé."); setTimeout(() => location.reload(), 900);
        } else if (a && a.dataset.a === "restaurer") {
          msg("Recherche de tes achats…"); msg((await storeRestaurer()) ? "Premium restauré." : "Aucun achat Premium trouvé sur ce compte.");
        }
      } catch (x) { if (x && /cancel|annul/i.test(String(x.message || x.code) + (x.userCancelled ? " cancel" : ""))) msg(""); else msg((x && x.message) || "Erreur, réessaie.") }
    };
    d.oncancel = () => d.close();
    if (!d.open) d.showModal();
  }

  /* ---------- verrous (actifs seulement si l'interrupteur est allumé et sans Premium) ---------- */
  const $ = q => document.querySelector(q);
  const fire = (el, t) => { try { el.dispatchEvent(new Event(t || "change", { bubbles: true })) } catch (e) {} };
  const taille = () => { const qc = $("#qc"), q = $("#q"); return +((qc && qc.value) || (q && q.value) || 0) };
  function ramener() {             /* remet les réglages permis à un compte gratuit */
    const q = $("#q"); if (q && +q.value > 1920) { q.value = "1920"; fire(q) }
    const qc = $("#qc"); if (qc && +qc.value > 1920) { qc.value = ""; fire(qc) }
    const mx = $("#o_max"); if (mx && mx.checked) { mx.checked = false; fire(mx) }
    const ia = $("#s_ia"); if (ia && ia.checked) { ia.checked = false }
  }
  /* ce que demandent les réglages actuels de l'export */
  function demandes() { const r = []; if (taille() > 1920) r.push("k4"); const mx = $("#o_max"); if (mx && mx.checked) r.push("ia"); return r }

  function verrouiller() {
    document.documentElement.classList.add("abo-verrou");
    ramener();
    /* clics : on bloque avant le code de l'app (phase de capture) */
    const CLICS = [['[data-q="3840"]', "k4"], ["#fltb", "filtre"], ["#erb", "effacer"], ["#picke", "effacer"], ["#tr_go", "tr"],
      ["#pickm", "regrouper"], ["#mggo", "regrouper"], ["#exall", "lot"]];
    document.addEventListener("click", e => {
      if (premium()) return;
      for (const [s, f] of CLICS) if (e.target.closest(s)) { e.preventDefault(); e.stopImmediatePropagation(); ouvrir(f); return }
    }, true);
    /* cases et listes */
    document.addEventListener("change", e => {
      if (premium()) return; const t = e.target;
      if ((t.id === "o_max" || t.id === "s_ia") && t.checked) { t.checked = false; if (t.id === "s_ia") { const mx = $("#o_max"); if (mx) mx.checked = false } ouvrir("ia") }
      else if ((t.id === "q" || t.id === "qc") && +t.value > 1920) { ramener(); ouvrir("k4") }
    }, true);
    /* dernier garde-fou : l'export lui-même (aussi appelé par le lot, Time Repair, l'avant/après) */
    const ex = $("#ex");
    if (ex && ex.onclick && !ex.__abo) {
      const action = ex.onclick; ex.__abo = true;
      ex.onclick = function (...a) { const r = premium() ? [] : demandes(); if (r.length) { ramener(); ouvrir(r[0]); return Promise.resolve() } return action.apply(this, a) };
    }
    /* l'app peut rallumer l'IA d'elle-même (profil, mode simple) : on la ramène */
    setInterval(() => { if (!premium()) { const mx = $("#o_max"); if (mx && mx.checked) { mx.checked = false; fire(mx) } } }, 1500);
  }

  /* bouton d'accès à l'offre dans l'en-tête */
  function boutonEntete() {
    const h = document.querySelector("header"); if (!h || document.getElementById("abo-b")) return;
    const b = document.createElement("button"); b.id = "abo-b"; b.type = "button"; b.className = "abo-b";
    b.textContent = premium() ? "✓ Premium" : "Premium"; b.onclick = () => premium() ? gerer() : ouvrir();
    h.appendChild(b);
  }
  function gerer() {
    const e = lire(), d = dlg();
    d.innerHTML = '<button class="abo-x" type="button" aria-label="Fermer">✕</button><h2 id="abo-t">Premium est actif ✓</h2><p>' +
      (e && e.fin ? "Valable jusqu’au " + new Date(e.fin).toLocaleDateString("fr-FR") + "." : "Abonnement en cours.") + '</p>' +
      (e && e.source === "store" ? '<p class="abo-pied">Pour le résilier : Réglages de l’iPhone → ton nom → Abonnements (ou Play Store → Paiements et abonnements).</p>'
        : (C.portail ? '<a class="btn" href="' + C.portail + '" target="_blank" rel="noopener">Gérer mon abonnement</a>' : "")) +
      '<button type="button" class="btn" data-a="oubli" style="margin-top:8px">Retirer Premium de cet appareil</button>';
    d.onclick = ev => { if (ev.target.closest(".abo-x")) d.close(); else if (ev.target.closest('[data-a="oubli"]')) { ecrire(null); location.reload() } };
    d.showModal();
  }

  const css = document.createElement("style");
  css.textContent =
    ".abo-b{margin-left:auto;padding:7px 12px;border-radius:999px;border:0;font:700 13px/1 inherit;color:#fff;background:linear-gradient(120deg,#ff7a59,#ff3d8b 45%,#7b5cff);cursor:pointer}" +
    ".abo-verrou [data-q=\"3840\"] small::after{content:\" 🔒\"}" +
    ".abo-verrou #fltb::after,.abo-verrou #erb::after,.abo-verrou #tr_go::after,.abo-verrou #mggo::after,.abo-verrou #exall::after,.abo-verrou #pickm .lbl::after,.abo-verrou #picke .lbl::after{content:\" 🔒\"}" +
    ".abo-verrou #sai b::after{content:\" 🔒\"}" +
    ".abo-dlg{max-width:min(94vw,440px);border:1px solid var(--line);border-radius:18px;background:var(--panel);color:var(--ink);padding:20px 18px 16px}" +
    ".abo-dlg::backdrop{background:rgba(0,0,0,.55)}.abo-dlg h2{margin:0 28px 10px 0;font-size:20px;line-height:1.25}" +
    ".abo-x{position:absolute;top:10px;right:10px;width:36px;height:36px;border:0;border-radius:50%;background:transparent;color:var(--mut);font-size:18px;cursor:pointer}" +
    ".abo-av{margin:0 0 14px;padding:0;list-style:none;display:grid;gap:4px;font-size:14px}.abo-av li::before{content:\"✓ \";color:var(--acc);font-weight:700}" +
    ".abo-plans{display:grid;gap:8px}.abo-plan{position:relative;display:grid;grid-template-columns:1fr auto;align-items:center;gap:2px 10px;text-align:left;padding:12px 14px;border-radius:14px;border:1.5px solid var(--line);background:var(--bg);color:var(--ink);cursor:pointer}" +
    ".abo-plan b{font-size:16px}.abo-plan .abo-prix{font-weight:800;font-size:17px}.abo-plan small{grid-column:1/-1;color:var(--mut);font-size:12.5px}" +
    ".abo-plan.top{border-color:#ff3d8b;box-shadow:0 0 0 1px #ff3d8b inset}.abo-badge{position:absolute;top:-9px;right:12px;padding:2px 8px;border-radius:999px;background:#ff3d8b;color:#fff;font-size:11px;font-weight:700}" +
    ".abo-msg{min-height:1.2em;margin:10px 0 6px;font-size:14px;color:var(--acc)}.abo-code summary{cursor:pointer;font-size:14px;color:var(--mut);margin:4px 0 8px}" +
    ".abo-code .row{display:flex;gap:8px}.abo-code input{flex:1;min-width:0;padding:11px 12px;border-radius:12px;border:1px solid var(--line);background:var(--bg);color:var(--ink);font:15px/1.2 ui-monospace,monospace}" +
    ".abo-retract{display:flex;gap:8px;align-items:flex-start;margin:12px 0 0;font-size:12.5px;line-height:1.4;color:var(--mut)}.abo-retract input{margin-top:2px;width:18px;height:18px;flex:none;accent-color:#ff3d8b}.abo-retract a{color:var(--mut)}" +
    ".abo-alerte{color:var(--acc)}.abo-alerte input{outline:2px solid #ff3d8b;outline-offset:2px}" +
    ".abo-code .btn{width:auto;flex:none}.abo-pied{margin:12px 0 0;font-size:12px;color:var(--mut)}.abo-pied a{color:var(--mut)}";
  document.head.appendChild(css);

  /* résiliation en ligne (code de la consommation, art. L215-1-1) : lien toujours visible en bas de page sur le site */
  function lienResilier() {
    const pied = document.getElementById("pied"); if (!pied || natif() || document.getElementById("abo-resil")) return;
    const a = document.createElement("a"); a.id = "abo-resil"; a.href = "#"; a.textContent = "Résilier un abonnement";
    a.onclick = ev => { ev.preventDefault(); const d = dlg();
      d.innerHTML = '<button class="abo-x" type="button" aria-label="Fermer">✕</button><h2 id="abo-t">Résilier mon abonnement</h2>' +
        '<p>La résiliation est gratuite et prend effet à la fin de la période déjà payée : Premium reste actif jusque-là.</p>' +
        (C.portail ? '<a class="btn main" href="' + C.portail + '" target="_blank" rel="noopener">Résilier mon abonnement</a><p class="abo-pied">Tu reçois un code par e-mail pour confirmer que c’est bien toi, puis « Annuler l’abonnement ». Une confirmation t’est envoyée.</p>'
          : '<p class="abo-pied">Le service de résiliation ouvre en même temps que Premium.</p>') +
        '<p class="abo-pied">Abonnement pris dans l’app iPhone ou Android : Réglages de l’iPhone → ton nom → Abonnements, ou Play Store → Paiements et abonnements.</p>';
      d.onclick = e2 => { if (e2.target.closest(".abo-x")) d.close() }; d.showModal() };
    pied.append(" · ", a);
  }

  function demarrer() {
    if (!actif()) return;
    boutonEntete(); lienResilier();
    if (!premium()) verrouiller();
    rafraichir().then(() => { const b = document.getElementById("abo-b"); if (b) b.textContent = premium() ? "✓ Premium" : "Premium" });
    if (natif()) { const avant = premium(); storeSync().then(e => { if (e && !avant) location.reload() }) } /* Premium retrouvé sur le compte Apple / Google : on relance sans pubs ni cadenas */
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", demarrer); else demarrer();

  return { actif, premium, autorise, ouvrir, natif, verifierCle, PLANS, AVANTAGES, _valide: valide, _ecrire: ecrire, _lire: lire };
})();
