/* ===== v4.9 : publicités (préparées, ÉTEINTES) =====
   Tant que PUB_CONFIG.actif vaut false, ce fichier ne fait RIEN : aucun script de pub chargé, aucun emplacement affiché,
   les boutons « Enregistrer » marchent exactement comme avant. Pour allumer : voir PUBLICITE.md.

   Ce qui est prévu une fois allumé, sur le nom de domaine indiqué ci-dessous uniquement :
   - une bannière discrète tout en bas de la page, juste au-dessus du pied de page (Google AdSense, taille automatique) ;
   - avant d'enregistrer une vidéo ou une photo : une fenêtre propose une courte pub « récompensée » (Google Ad Manager).
     Règles Google respectées : la récompense est annoncée avant, la pub n'est montrée qu'après « oui », elle peut être fermée.
   - si aucune pub n'est prête (pas de pub disponible, bloqueur, connexion lente…), l'enregistrement se fait directement :
     l'app ne bloque jamais l'utilisateur à cause d'une pub qui ne vient pas ;
   - le bandeau de consentement (cookies, obligatoire en Europe) est celui, certifié, de Google : il s'allume dans le compte
     AdSense (« Confidentialité et messages ») et se charge tout seul avec le script de pub. Un lien « Cookies et pubs » en bas
     de page permet de changer d'avis à tout moment. */
window.PUB_CONFIG = {
  actif: false,            /* interrupteur général */
  domaine: "",             /* ex. "retoucheproai.com" : les pubs ne s'affichent que sur ce domaine (jamais sur github.io ni dans Claude) */
  adsense: "",             /* identifiant éditeur AdSense, ex. "ca-pub-1234567890123456" */
  banniere: "",            /* numéro du bloc d'annonces de la bannière, ex. "1234567890" */
  recompense: "",          /* bloc récompensé Ad Manager, ex. "/12345678/retouche_recompense" */
  masquerLiens: true       /* masque « Coller un lien » quand les pubs sont allumées (règles Google sur les outils de téléchargement) */
};

window.PUB = (() => {
  const C = window.PUB_CONFIG;
  const hote = () => location.hostname.replace(/^www\./, "");
  const allume = () => !!(C.actif && C.adsense && C.domaine && hote() === C.domaine.replace(/^www\./, ""));
  let gptCharge = null, pret = null, enCours = false;

  function script(src, attrs) {
    return new Promise((ok, ko) => {
      const s = document.createElement("script"); s.async = true; s.src = src;
      for (const k in attrs || {}) s.setAttribute(k, attrs[k]);
      s.onload = ok; s.onerror = () => ko(new Error("script")); document.head.appendChild(s);
    });
  }

  /* ---------- bannière du bas ---------- */
  function banniere() {
    const pied = document.getElementById("pied"); if (!pied || !C.banniere) return;
    const z = document.createElement("div"); z.id = "pub-bas"; z.setAttribute("aria-label", "Publicité");
    z.innerHTML = '<p class="pub-tag">Publicité — elle garde l’app gratuite</p><ins class="adsbygoogle" style="display:block" data-ad-client="' + C.adsense +
      '" data-ad-slot="' + C.banniere + '" data-ad-format="auto" data-full-width-responsive="true"></ins>';
    pied.before(z);
    try { (window.adsbygoogle = window.adsbygoogle || []).push({}) } catch (e) {}
  }

  /* ---------- lien « Cookies et pubs » (changer son choix de consentement) ---------- */
  function lienCookies() {
    const pied = document.getElementById("pied"); if (!pied) return;
    const a = document.createElement("button"); a.type = "button"; a.className = "pub-cookies"; a.textContent = "Cookies et pubs : modifier mon choix";
    a.onclick = () => { try { window.googlefc = window.googlefc || {}; (googlefc.callbackQueue = googlefc.callbackQueue || []).push({ CONSENT_DATA_READY: () => googlefc.showRevocationMessage() }) } catch (e) {} };
    pied.appendChild(a);
  }

  /* ---------- pub récompensée : préchargée à l'avance pour qu'un clic n'attende jamais ---------- */
  function precharger() {
    if (!C.recompense || pret || enCours) return;
    enCours = true;
    gptCharge = gptCharge || script("https://securepubads.g.doubleclick.net/tag/js/gpt.js", { crossorigin: "anonymous" });
    gptCharge.then(() => {
      const g = window.googletag = window.googletag || { cmd: [] };
      g.cmd.push(() => {
        const slot = g.defineOutOfPageSlot(C.recompense, g.enums.OutOfPageFormat.REWARDED);
        if (!slot) { enCours = false; return } /* page ou appareil non compatible : pas de pub, enregistrement libre */
        slot.addService(g.pubads());
        const pa = g.pubads();
        const etat = { slot, evt: null, accorde: false, ferme: null };
        pa.addEventListener("rewardedSlotReady", e => { if (e.slot === slot) { etat.evt = e; pret = etat; enCours = false } });
        pa.addEventListener("rewardedSlotGranted", e => { if (e.slot === slot) etat.accorde = true });
        pa.addEventListener("rewardedSlotClosed", e => { if (e.slot === slot && etat.ferme) etat.ferme() });
        pa.addEventListener("slotRenderEnded", e => { if (e.slot === slot && e.isEmpty) { enCours = false; try { g.destroySlots([slot]) } catch (x) {} } });
        g.enableServices(); g.display(slot);
      });
    }).catch(() => { enCours = false });
  }

  /* ---------- fenêtre d'accord (avant) puis de remerciement (après) ---------- */
  function fenetre() {
    let d = document.getElementById("pub-dlg");
    if (!d) { d = document.createElement("dialog"); d.id = "pub-dlg"; d.className = "pub-dlg"; d.setAttribute("aria-labelledby", "pub-t"); document.body.appendChild(d) }
    return d;
  }
  function demander(texte, oui, non) {
    const d = fenetre();
    return new Promise(res => {
      d.innerHTML = '<h2 id="pub-t">' + texte.t + '</h2><p>' + texte.p + '</p><button class="btn main" type="button" data-r="1">' + oui + '</button>' +
        (non ? '<button class="btn" type="button" data-r="0" style="margin-top:8px">' + non + '</button>' : "");
      d.onclick = e => { const b = e.target.closest("button[data-r]"); if (!b) return; d.close(); res(b.dataset.r === "1" ? e : null) };
      d.oncancel = () => res(null);
      d.showModal();
    });
  }

  /* Enveloppe un bouton d'enregistrement : action() est appelée dans un vrai toucher (l'iPhone l'exige pour ouvrir
     la feuille « Enregistrer la vidéo »). */
  function proteger(id) {
    const b = document.getElementById(id); if (!b || !b.onclick || b.__pub) return;
    const action = b.onclick; b.__pub = true;
    b.onclick = async function (e) {
      const p = pret;
      if (!p) return action.call(b, e); /* pas de pub prête : enregistrement direct, tout de suite */
      pret = null;
      const ok = await demander({ t: "Une courte pub, puis c’est enregistré", p: "L’app est gratuite grâce aux pubs. Regarde une courte pub (quelques secondes), puis ta vidéo s’enregistre." }, "Voir la pub et enregistrer", "Annuler");
      if (!ok) { pret = p; return } /* refusé : la pub reste prête pour la prochaine fois */
      const ferme = new Promise(r => (p.ferme = r));
      try { p.evt.makeRewardedVisible() } catch (x) { return action.call(b, e) }
      await ferme;
      try { googletag.destroySlots([p.slot]) } catch (x) {}
      setTimeout(precharger, 1000);
      if (!p.accorde) { await demander({ t: "Pub arrêtée avant la fin", p: "Pour enregistrer, la pub doit être regardée jusqu’au bout. Tu peux réessayer." }, "D’accord"); return }
      const e2 = await demander({ t: "Merci !", p: "Ta vidéo est prête." }, "Enregistrer maintenant");
      if (e2) action.call(b, e2);
    };
  }

  function demarrer() {
    if (!allume()) return;
    document.documentElement.classList.add("avec-pub");
    if (C.masquerLiens) document.querySelectorAll("#lnkf,#lnkc,#lnkst,.lnkh").forEach(z => z.style.setProperty("display", "none", "important"));
    script("https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" + encodeURIComponent(C.adsense), { crossorigin: "anonymous" }).catch(() => {});
    banniere(); lienCookies();
    ["sv", "svall", "mgsave"].forEach(proteger);
    precharger();
  }

  const css = document.createElement("style");
  css.textContent = "#pub-bas{max-width:720px;margin:18px auto 0;padding:0 16px;min-height:60px}.pub-tag{margin:0 0 4px;font-size:11px;color:var(--mut);text-align:center}" +
    ".pub-cookies{display:block;margin:10px auto 0;background:none;border:0;color:var(--mut);font-size:12px;text-decoration:underline;cursor:pointer}" +
    ".pub-dlg{max-width:min(92vw,420px);border:1px solid var(--line);border-radius:16px;background:var(--panel);color:var(--ink);padding:20px}" +
    ".pub-dlg::backdrop{background:rgba(0,0,0,.55)}.pub-dlg h2{margin:0 0 8px;font-size:19px}.pub-dlg p{margin:0 0 14px;color:var(--mut)}";
  document.head.appendChild(css);

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", demarrer); else demarrer();
  return { allume, _etat: () => ({ pret: !!pret, enCours }), _precharger: precharger };
})();
