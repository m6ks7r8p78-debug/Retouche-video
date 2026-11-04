/* ===== Studio : autorisations, sauvegarde chiffrée, historique, assistant (v3.0) =====
   Module séparé d'index.html (début de la modularisation) : il n'utilise que des fonctions déjà présentes
   (PROF, P, sync, $, msg, shareBlob, MODELS) et ne touche jamais aux photos ni aux vidéos. */
var STUDIO = (() => {
  const AK = "autorisations";
  /* ---------- autorisations : chaque usage réseau a sa finalité, sa portée et se révoque ---------- */
  const PERM = {
    lien: { nom: "Charger une vidéo par lien", envoi: "le lien collé est envoyé au serveur de l’app (Cloudflare Workers) qui récupère la vidéo ; aucune vidéo n’y est conservée", compte: "aucun compte" },
    modele: { nom: "Télécharger un modèle IA", envoi: "rien de personnel : seul le fichier du modèle est téléchargé depuis sa source officielle (Hugging Face), puis vérifié", compte: "aucun compte" },
    analyse_ia: { nom: "Analyse IA (version Claude)", envoi: "une image réduite de ta vidéo est envoyée à Claude pour proposer des réglages", compte: "ton compte Claude" },
    diagnostic: { nom: "Envoi automatique du diagnostic (version Claude)", envoi: "des nombres seulement (réglages, tailles, durées, vitesse de l’IA, modèle de téléphone) sont rangés dans la base privée de la version Claude ; aucune image, aucun son, aucun nom de fichier", compte: "ton compte Claude" }
  };
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const all = () => { try { return JSON.parse(localStorage.getItem(AK) || "{}") } catch (e) { return {} } };
  const put = o => { try { localStorage.setItem(AK, JSON.stringify(o)) } catch (e) {} };
  function granted(k) { const a = all()[k]; return !!(a && a.ok) }
  async function consent(k) {
    if (granted(k)) return true;
    const p = PERM[k]; if (!p) return false;
    const ok = window.confirm(p.nom + " — autorisation\n\nCe qui part de ton iPhone : " + p.envoi + ".\nCompte nécessaire : " + p.compte + ".\nTu peux retirer cette autorisation à tout moment (⚙️ Paramètres).\n\nAutoriser ?");
    const a = all(); a[k] = { ok, at: Date.now() }; put(a); render(); return ok;
  }
  function revoke(k) { const a = all(); delete a[k]; put(a) }
  function grant(k) { if (!PERM[k]) return; const a = all(); a[k] = { ok: true, at: Date.now() }; put(a) }

  /* ---------- sauvegarde des réglages (jamais les médias), chiffrée si une phrase secrète est donnée ---------- */
  const KEEP = /^(q|profil|o_[a-z]+|learn|recettes|modeles_etat|autorisations|sr_moteur|sr_noyau|srspd|spd|fileno|inst)$/;
  const b64 = u => { let s = ""; for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode(...u.subarray(i, i + 32768)); return btoa(s) };
  const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  async function key(pass, salt) {
    const k0 = await crypto.subtle.importKey("raw", new TextEncoder().encode(pass), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: 250000, hash: "SHA-256" }, k0, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }
  async function backup(pass) {
    const data = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (KEEP.test(k)) data[k] = localStorage.getItem(k) }
    const plain = new TextEncoder().encode(JSON.stringify({ app: "Retouche vidéo", version: typeof VER !== "undefined" ? VER : "", date: new Date().toISOString(), data }));
    if (!pass) return { format: "retouche-sauvegarde", v: 1, chiffre: false, contenu: JSON.parse(new TextDecoder().decode(plain)) };
    const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(pass, salt), plain));
    return { format: "retouche-sauvegarde", v: 1, chiffre: true, algo: "AES-256-GCM, clé PBKDF2-SHA256 250 000 tours", sel: b64(salt), iv: b64(iv), donnees: b64(ct) };
  }
  async function restore(obj, pass) {
    if (!obj || obj.format !== "retouche-sauvegarde" || obj.v !== 1) throw new Error("ce fichier n’est pas une sauvegarde de Retouche vidéo");
    let c = obj.contenu;
    if (obj.chiffre) { if (!pass) throw new Error("phrase secrète nécessaire");
      let pt; try { pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(obj.iv) }, await key(pass, unb64(obj.sel)), unb64(obj.donnees)) } catch (e) { throw new Error("phrase secrète incorrecte ou fichier modifié") }
      c = JSON.parse(new TextDecoder().decode(pt)) }
    let n = 0; for (const [k, v] of Object.entries((c && c.data) || {})) if (KEEP.test(k) && typeof v === "string") { localStorage.setItem(k, v); n++ }
    return n;
  }

  /* ---------- assistant : comprend une demande écrite, prépare un plan, applique ce qui est possible ---------- */
  function plan(text) {
    const t = " " + String(text || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "") + " ", has = r => r.test(t), out = [], vid = mode === "video";
    const ok = x => out.push(["ok", x]), no = x => out.push(["warn", x]);
    const chk = (id, label) => { const e = $("#" + id); if (!e) return; if (!vid) { no(label + " : seulement pour les vidéos."); return } if (e.disabled) { no(label + " : indisponible sur cet appareil."); return } e.checked = true; e.dispatchEvent(new Event("change")); ok(label + " activé.") };
    if (has(/4k|3840|uhd/)) { if (vid) { const L = Math.max(v.videoWidth, v.videoHeight), k = 3840 / L; document.querySelector('[data-q="3840"]').click();
        ok("Export 4K choisi." + (k > 2.05 ? " Ta vidéo fait " + v.videoWidth + "×" + v.videoHeight + " : agrandissement ×" + k.toFixed(1).replace(".", ",") + ", les détails ajoutés seront estimés, pas d’origine." : "")) } else no("La taille des photos est choisie automatiquement (×3 pour une petite photo).") }
    else if (has(/1080|full ?hd/)) { if (vid) { document.querySelector('[data-q="1920"]').click(); ok("Export Full HD choisi.") } }
    else if (has(/taille d.origine|sans agrandi/)) { if (vid) { document.querySelector('[data-q="-1"]').click(); ok("Taille d’origine gardée.") } }
    let prof = null;
    if (has(/nuit.{0,8}jour|ambiance de jour/)) prof = "jour"; else if (has(/sombre|nuit|eclairc|lumiere faible|faible lumiere/)) prof = "nuit";
    else if (has(/naturel|fidele|authentique/)) prof = "naturel"; else if (has(/detail|plus net|nettete/)) prof = "details";
    if (prof) { PROF.set(prof, true); ok("Rendu « " + PROF.NOM[prof] + " » choisi.") }
    if (has(/bruit|grain/)) { P.dn = Math.max(P.dn, .5); sync(); ok("Réduction du bruit renforcée.") }
    if (has(/compress|bloc|pixelis|artefact/)) { P.db = Math.max(P.db, .5); sync(); ok("Lissage des carrés de compression activé.") }
    if (has(/couleur|terne|delave/)) ok("Couleurs : déjà corrigées par l’analyse automatique (réglables dans Réglages).");
    if (has(/stabil|trembl|bouge/)) chk("o_stab", "Stabilisation");
    if (has(/poussier|tache/)) chk("o_dust", "Retrait des poussières");
    if (has(/scintill|clignot/)) chk("o_defl", "Anti-scintillement");
    if (has(/voix|son |souffle|audio/)) chk("o_voice", "Voix plus claire");
    if (has(/fluid|saccad/)) chk("o_fluid", "Mouvement plus fluide");
    if (has(/ qualite max|\bia\b|intelligence artificielle|restaur/)) { const e = $("#o_max"); if (e && !e.disabled) { e.checked = true; e.dispatchEvent(new Event("change")); ok("Restauration IA activée (utile seulement si la source est petite).") } }
    if (has(/visage/)) no("Visages : pas de restauration dédiée (essayée puis retirée : elle éloignait du vrai visage). Ils profitent du traitement de toute l’image ; le rendu Naturel est le plus fidèle.");
    const sp = has(/ralenti|plus lent/) ? "0.5" : has(/acceler|plus vite|x2|deux fois plus vite/) ? "2" : null, rev = has(/envers|inverse/);
    if (sp || rev) { if (!vid) no("Vitesse et sens : seulement pour les vidéos."); else { if (sp) $("#tr_v").value = sp; $("#tr_r").checked = rev; try { TR.info() } catch (e) {} ok("Vitesse / sens préparés dans Outils → « Vitesse et sens de lecture » : touche « Créer la version corrigée » là-bas."); } }
    if (has(/effac|gomm|(enleve|enlever|retire|retirer|supprime|supprimer|vire|virer).{0,25}(objet|element|personne|passant|oreille|museau|nez|lunette|accessoire|tache|filtre ar|autocollant|sticker|texte)/))
      ok("Retirer un objet, une personne ou un élément de filtre AR d’une photo : accueil → « Effacer une zone d’une photo (IA) ». La zone est remplie par l’IA : ces pixels sont inventés, et marqués comme tels.");
    if (has(/generer|genere|cree une video|personnage|3d|musique|clone/)) no("Génération d’images, de vidéos, de voix, de personnages ou de 3D : non disponible (voir ROADMAP.md : trop lourd pour un iPhone sans service payant).");
    if (!out.length) no("Je n’ai reconnu aucune demande. Exemples : « stabilise, réduis le bruit, export 4K », « vidéo sombre », « remets à l’endroit ».");
    return out;
  }

  /* ---------- interface : bouton ⚙️ + fenêtre, assistant dans l'onglet Améliorer ---------- */
  let dlg = null;
  function html() {
    const a = all(), h = (window.__recettes = (() => { try { return JSON.parse(localStorage.getItem("recettes") || "[]") } catch (e) { return [] } })());
    return `<div class="mdl-top"><h2>Paramètres</h2><button class="btn" data-s="close" type="button">Fermer</button></div><div class="mdl-body">
      <div class="mdl-sto"><b>Autorisations</b><span>Rien ne quitte ton iPhone sans ton accord. Chaque usage est demandé la première fois et peut être retiré.</span>
      ${Object.entries(PERM).map(([k, p]) => `<div class="mdl-card"><div class="mdl-h"><b>${p.nom}</b><span class="mdl-st ${a[k] && a[k].ok ? "ok" : ""}">${a[k] ? (a[k].ok ? "autorisé" : "refusé") : "pas encore demandé"}</span></div>
        <p class="mdl-m">${p.envoi}. Compte : ${p.compte}.</p><div class="mdl-acts">${a[k] && a[k].ok ? `<button class="btn" data-s="revoke" data-k="${k}">Retirer</button>` : `<button class="btn" data-s="grant" data-k="${k}">Autoriser</button>${a[k] ? `<button class="btn" data-s="revoke" data-k="${k}">Redemander plus tard</button>` : ""}`}</div></div>`).join("")}</div>
      <div class="mdl-sto"><b>Sauvegarde des réglages</b><span>Profils, préférences, autorisations, historique et état des modèles (jamais tes photos ni tes vidéos). Avec une phrase secrète, le fichier est chiffré (AES-256-GCM) : sans elle, il ne peut pas être relu.</span>
        <label class="s"><span>Phrase secrète (facultative)</span><input id="st_pass" type="password" autocomplete="new-password" style="width:100%;padding:11px;border-radius:10px;border:1px solid var(--line);background:var(--panel);color:var(--ink)"></label>
        <div class="mdl-acts"><button class="btn main" data-s="save">Créer la sauvegarde</button><button class="btn" data-s="load">Restaurer une sauvegarde</button></div><input type="file" id="st_file" accept=".json,application/json" hidden></div>
      <div class="mdl-sto"><b>Historique des traitements</b><span>${h.length ? h.length + " traitement(s) gardé(s) sur cet appareil (30 au plus)." : "Aucun traitement enregistré."}</span>
        ${h.length ? `<ul class="mdl-m" style="padding-left:18px">${h.slice(-10).reverse().map(r => { r = r && typeof r === "object" ? r : {}; const d = new Date(r.date);
          /* tout est échappé : une sauvegarde restaurée peut venir d'ailleurs (v3.2) */
          return `<li>${esc(isNaN(d) ? "date inconnue" : d.toLocaleString("fr-FR"))} — ${esc(r.media)} ${esc(r.source)} → ${esc(r.sortie || "?")}, rendu ${esc(r.profil)}${r.ia && r.ia !== "non" ? ", IA" : ""}${Array.isArray(r.operations) && r.operations.length ? " (" + r.operations.map(esc).join(", ") + ")" : ""}</li>` }).join("")}</ul>
        <div class="mdl-acts"><button class="btn" data-s="clearh">Effacer l’historique</button></div>` : ""}</div>
      <p class="mdl-note" id="st_note" hidden></p></div>`;
  }
  function render() { if (dlg && dlg.open) dlg.innerHTML = html() }
  const note = t => { const n = dlg && dlg.querySelector("#st_note"); if (n) { n.textContent = t; n.hidden = !t } };
  function mount() {
    const top = document.querySelector(".top"), b = document.createElement("button"); b.className = "mdlb"; b.id = "stb"; b.type = "button"; b.textContent = "⚙️"; b.setAttribute("aria-label", "Paramètres");
    top.insertBefore(b, document.querySelector("#mdlb"));
    dlg = document.createElement("dialog"); dlg.className = "mdl"; dlg.id = "stg"; document.body.appendChild(dlg);
    b.onclick = () => { dlg.innerHTML = html(); try { dlg.showModal() } catch (e) { dlg.setAttribute("open", "") } };
    dlg.addEventListener("click", async ev => { const x = ev.target.closest("[data-s]"); if (ev.target === dlg) return dlg.close(); if (!x) return; const s = x.dataset.s;
      try {
        if (s === "close") dlg.close();
        else if (s === "revoke") { revoke(x.dataset.k); render(); note("Autorisation retirée : elle sera redemandée au prochain usage.") }
        else if (s === "grant") { grant(x.dataset.k); render(); note("Autorisation donnée. Tu peux la retirer ici à tout moment."); if (x.dataset.k === "diagnostic") try { DIAG.flush() } catch (e) {} }
        else if (s === "clearh") { if (confirm("Effacer l’historique des traitements ?")) { localStorage.removeItem("recettes"); render() } }
        else if (s === "save") { const pass = dlg.querySelector("#st_pass").value; const o = await backup(pass);
          const blob = new Blob([JSON.stringify(o, null, 1)], { type: "application/json" }); window.__lastBackup = o;
          await shareBlob(blob, "retouche-sauvegarde-" + new Date().toISOString().slice(0, 10) + ".json"); note("Sauvegarde créée" + (pass ? " et chiffrée. Garde ta phrase secrète : sans elle, le fichier ne peut pas être relu." : " (non chiffrée).")) }
        else if (s === "load") { const f = dlg.querySelector("#st_file"); f.onchange = async () => { const file = f.files[0]; f.value = ""; if (!file) return;
            try { const o = JSON.parse(await file.text()); const n = await restore(o, o.chiffre ? (dlg.querySelector("#st_pass").value || prompt("Phrase secrète de la sauvegarde :") || "") : ""); note(n + " réglage(s) restauré(s). Recharge l’app pour les appliquer.") } catch (e) { note("Restauration impossible : " + e.message + ".") } }; f.click() }
      } catch (e) { note("Erreur : " + ((e && e.message) || e)) } });
    /* assistant, en tête de l'onglet Améliorer */
    const tp = document.querySelector("#tp1"), card = document.createElement("div"); card.className = "card"; card.id = "asst"; card.style.marginTop = "0";
    card.innerHTML = `<h2>Dis ce que tu veux</h2><p class="help" style="margin:0 0 8px">Exemple : « stabilise, réduis le bruit et exporte en 4K si la qualité le permet ». L’assistant comprend des mots-clés (ce n’est pas une IA conversationnelle) et règle l’app pour toi.</p>
      <textarea id="as_t" rows="2" style="width:100%;padding:10px;border-radius:12px;border:1px solid var(--line);background:var(--panel);color:var(--ink);font:inherit"></textarea>
      <button class="btn" id="as_go" style="margin-top:8px">Préparer</button><ul id="as_l" class="mdl-m" style="padding-left:18px;margin:8px 0 0"></ul>`;
    tp.insertBefore(card, tp.firstChild);
    card.querySelector("#as_go").onclick = () => { const l = card.querySelector("#as_l"); l.textContent = "";
      plan(card.querySelector("#as_t").value).forEach(([k, x]) => { const li = document.createElement("li"); li.textContent = (k === "ok" ? "✓ " : "⚠ ") + x; if (k !== "ok") li.style.color = "var(--tc)"; l.appendChild(li) });
      const li = document.createElement("li"); li.textContent = "Ensuite, touche le grand bouton « Améliorer »."; l.appendChild(li) };
  }
  mount();
  return { consent, granted, grant, revoke, backup, restore, plan, PERM, esc };
})();
