/* ===== Modes de conversion (v4.4) : Conversion normale · Qualité maximale · Optimisation pour X =====
   Un seul moteur d'export (celui d'index.html) ; un mode n'est qu'un profil appliqué au moment de l'export :
   - normale : taille, cadence et couleurs d'origine, aucune IA ni retouche (les options des Réglages sont ignorées pendant l'export)
   - max     : le traitement habituel de l'app (IA, stabilisation, anti-scintillement… selon les Réglages et l'analyse)
   - x       : H.264 High (pas de HEVC), MP4, AAC, image clé toutes les 2 s, cadence d'origine (jusqu'à 60 i/s gardés),
               jamais au-delà du Full HD, pas d'agrandissement sans IA.
   Les cases des Réglages ne sont pas modifiées de façon durable : elles sont mises de côté pendant l'export puis remises.
   Changer de mode avant un nouvel export réutilise les analyses déjà faites (cadence mesurée, stabilisation, compte rendu). */
var MODE = (() => {
  const L = {
    normal: { nom: "Conversion normale", tag: "normale", court: "Normale", aide: "Rapide et fidèle : taille, cadence et couleurs d’origine, sans IA ni retouche." },
    max: { nom: "Qualité maximale", tag: "qualite-max", court: "Qualité max", aide: "Le meilleur résultat possible : l’app choisit seule les améliorations utiles (IA, stabilisation, nettoyage…)." },
    x: { nom: "Optimisation pour X", tag: "pour-X", court: "Pour X", aide: "Fichier préparé pour X : H.264 + AAC en MP4, cadence gardée (60 i/s compris), Full HD au maximum. Tu le publies toi-même depuis Photos." }
  };
  let cur = "max", rec = null, saved = null;
  const $ = s => document.querySelector(s);
  const long = () => { try { return Math.max(v.videoWidth || 0, v.videoHeight || 0) } catch (e) { return 0 } };

  function recommend() {
    const Ls = long(), i = (window.FREP && FREP.info) || {};
    let d = 0; try { d = v.duration || 0 } catch (e) {}
    const mbps = i.taille && d ? i.taille * 8 / 1e6 / d : 0;
    if (Ls && Ls < 1000) return ["max", "petite définition : l’IA apportera un vrai gain"];
    if (mbps && Ls >= 1000 && mbps < 2.5) return ["max", "vidéo très compressée : le nettoyage sera utile"];
    return ["normal", "vidéo déjà de bonne qualité"];
  }
  function render() {
    document.querySelectorAll("[data-mode]").forEach(b => b.setAttribute("aria-pressed", b.dataset.mode === cur ? "true" : "false"));
    const h = $("#mhint"); if (!h) return;
    let t = L[cur].aide;
    if (rec) t += " — Conseillé pour cette vidéo : " + L[rec[0]].nom + " (" + rec[1] + ")" + (rec[0] === cur ? "." : ". Pour publier sur X, choisis « Pour X ».");
    h.textContent = t;
    const w = $("#qwrap"); if (w) w.hidden = cur !== "max";
    const e = $("#ex"); if (e && !e.disabled && typeof exporting !== "undefined" && !exporting && typeof mode !== "undefined" && mode === "video")
      e.textContent = cur === "normal" ? "Convertir (taille d’origine)" : cur === "x" ? "Préparer pour X" : ($("#q").value === "-1" ? "Nettoyer (taille d’origine)" : $("#q").value === "3840" ? "Améliorer en 4K" : "Améliorer en Full HD");
  }
  function set(m) { if (!L[m]) return; cur = m; try { sessionStorage.setItem("mode_conv", m) } catch (e) {} render() }
  /* nouvelle vidéo : le mode conseillé est présélectionné, l'utilisateur garde le dernier mot */
  function onLoad() { rec = recommend(); set(rec[0]) }
  /* après le compte rendu du fichier (débit connu) : on affine le conseil sans changer le choix de l'utilisateur */
  function refine() { rec = recommend(); render() }

  /* ----- application au moment de l'export ----- */
  const BOX = ["o_max", "o_stab", "o_defl", "o_dust", "o_voice", "o_fluid", "o_fast"];
  function begin() {
    saved = null; if (cur === "max") return;
    saved = { q: $("#q").value, stabOn: stabOn };
    BOX.forEach(id => { const e = $("#" + id); if (e) saved[id] = e.checked });
    const set1 = (id, val) => { const e = $("#" + id); if (e) e.checked = val };
    if (cur === "normal") {
      ["o_max", "o_stab", "o_defl", "o_dust", "o_voice", "o_fluid"].forEach(id => set1(id, false)); set1("o_fast", true);
      stabOn = false; $("#q").value = "-1";
    } else { /* x : restauration au choix de l'utilisateur, mais ni changement de cadence ni agrandissement inutile */
      set1("o_fluid", false);
      const ai = $("#o_max") && $("#o_max").checked;
      $("#q").value = (ai || long() >= 1920) ? "1920" : "-1";
    }
    try { SRX.pc = null; SRX.key = "" } catch (e) {}
  }
  function end() {
    if (!saved) return;
    BOX.forEach(id => { const e = $("#" + id); if (e && id in saved) e.checked = saved[id] });
    stabOn = saved.stabOn; if (!window.__retryPending) $("#q").value = saved.q;
    try { SRX.pc = null; SRX.key = "" } catch (e) {}
    saved = null; render();
  }
  /* paramètres d'encodage du profil X */
  const x = () => cur === "x";
  const gop = fps => x() ? Math.max(1, Math.round(2 * (fps || 30))) : 60;
  /* contrôle du fichier produit (vrais réglages de l'encodeur, pas d'estimation) */
  function check(o) {
    const out = [];
    if (cur === "x") {
      if (!/^avc1/.test(o.codec)) out.push("l’image n’est pas en H.264");
      if (o.audio && o.audio !== "mp4a.40.2") out.push("le son n’est pas en AAC (cet iPhone ne sait pas l’encoder) : X pourrait le refuser");
      if (Math.max(o.w, o.h) > 1920) out.push("la taille dépasse le Full HD");
      if (o.fps > 60.5) out.push("la cadence dépasse 60 images par seconde");
    }
    if (cur === "normal" && o.srcW && (o.w !== (o.srcW & ~1) && o.h !== (o.srcH & ~1))) out.push("la taille a changé (mémoire de l’iPhone)");
    return out;
  }
  return { L, get cur() { return cur }, set, onLoad, refine, begin, end, x, gop, check, tag: () => L[cur].tag, nom: () => L[cur].nom, render };
})();
document.addEventListener("click", e => { const b = e.target.closest && e.target.closest("[data-mode]"); if (b) MODE.set(b.dataset.mode) });
