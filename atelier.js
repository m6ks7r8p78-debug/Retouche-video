/* ===== v7.2 : coque du studio — import par glisser-déposer, outils par besoin, déroulé réel, activité, barre d'onglets iPhone =====
   Ce fichier ne contient aucun traitement d'image : il ne fait que relier la nouvelle mise en page aux fonctions existantes
   (mêmes boutons, mêmes champs de fichier, mêmes gestionnaires dans app.js). Rien n'est simulé : le déroulé et l'activité
   lisent l'état réel de l'app et l'historique réel des traitements (localStorage « recettes », 30 au plus, sur cet appareil). */
(() => {
  const $ = q => document.querySelector(q), B = document.body;

  /* -- outils « par besoin » qui ouvrent une fonction déjà présente ailleurs (ex. « Photo ancienne » = bouton Photo) -- */
  document.querySelectorAll("[data-proxy]").forEach(b => b.addEventListener("click", () => {
    const t = $(b.dataset.proxy); if (t && !t.disabled) t.click();
  }));

  /* -- glisser-déposer (ordinateur, iPad) : les fichiers passent par les mêmes champs que le sélecteur -- */
  const drop = $("#drop");
  function versChamp(input, files) {
    try { const dt = new DataTransfer(); files.forEach(f => dt.items.add(f)); input.files = dt.files }
    catch (e) { return false }
    input.dispatchEvent(new Event("change", { bubbles: true })); return true;
  }
  function deposer(list) {
    const fs = [...(list || [])].filter(f => f && f.size > 0);
    const vid = fs.filter(f => /^video\//.test(f.type) || /\.(mp4|mov|m4v|webm|3gp)$/i.test(f.name));
    const img = fs.filter(f => /^image\//.test(f.type) || /\.(jpe?g|png|heic|heif|webp)$/i.test(f.name));
    const st = $("#st0");
    if (vid.length) { if (!versChamp($("#f"), vid) && st) st.textContent = "Ce navigateur n’accepte pas le dépôt : utilise le bouton « Vidéo »."; return }
    if (img.length) { if (!versChamp($("#fp"), [img[0]]) && st) st.textContent = "Ce navigateur n’accepte pas le dépôt : utilise le bouton « Photo »."; return }
    if (fs.length && st) { st.hidden = false; st.textContent = "Format non reconnu : dépose une vidéo (MP4, MOV) ou une photo (JPEG, PNG, HEIC)." }
  }
  if (drop) {
    let n = 0;
    const porte = e => e.dataTransfer && [...e.dataTransfer.types].includes("Files");
    window.addEventListener("dragenter", e => { if (!porte(e)) return; e.preventDefault(); n++; drop.classList.add("over") });
    window.addEventListener("dragleave", e => { if (!porte(e)) return; if (--n <= 0) { n = 0; drop.classList.remove("over") } });
    window.addEventListener("dragover", e => { if (porte(e)) e.preventDefault() });
    window.addEventListener("drop", e => {
      if (!porte(e)) return; e.preventDefault(); n = 0; drop.classList.remove("over");
      /* pendant un outil plein écran (effacer, filtre, visages), on n'importe rien par-dessous */
      if (document.querySelector("#ez:not([hidden]),#dfv:not([hidden]),#rvis:not([hidden])")) return;
      deposer(e.dataTransfer.files);
    });
  }
  window.__deposer = deposer; /* utilisé par les tests */

  /* -- déroulé : reflète l'état réel (média ouvert, calcul en cours, résultat affiché) -- */
  const flow = $("#flow");
  function etape() {
    if (!flow) return;
    const app = $("#app"), pg = $("#pg"), out = $("#out");
    const ouvert = B.classList.contains("loaded") && app && !app.hidden;
    const calc = pg && !pg.hidden, fini = out && !out.hidden;
    const e = !ouvert ? 1 : fini ? 4 : calc ? 3 : 2;
    flow.querySelectorAll("li").forEach(li => { const k = +li.dataset.e; li.className = k < e ? "ok" : k === e ? "on" : "";
      if (k === e) li.setAttribute("aria-current", "step"); else li.removeAttribute("aria-current") });
  }

  /* -- activité : l'historique réel des traitements, rien d'inventé -- */
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  function quand(iso) {
    const d = new Date(iso); if (isNaN(d)) return "date inconnue";
    const m = Math.round((Date.now() - d) / 60000);
    if (m < 1) return "à l’instant"; if (m < 60) return "il y a " + m + " min";
    const h = Math.round(m / 60); if (h < 24) return "il y a " + h + " h";
    return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  }
  let derniere = "";
  function activite() {
    const l = $("#act_l"), v = $("#act_v"); if (!l || !v) return;
    let h = []; try { h = JSON.parse(localStorage.getItem("recettes") || "[]") } catch (e) {}
    if (!Array.isArray(h)) h = [];
    const cle = h.length + ":" + (h.length ? h[h.length - 1].date : "");
    if (cle === derniere) return; derniere = cle;
    const r = h.slice(-6).reverse().filter(x => x && typeof x === "object");
    l.hidden = !r.length; v.hidden = !!r.length;
    l.innerHTML = r.map(x => {
      const ph = x.media === "photo", ia = x.ia && x.ia !== "non";
      const titre = x.profil === "effacement" ? "Zone effacée" : (ph ? "Photo" : "Vidéo") + (x.profil ? " · " + x.profil : "");
      const det = [x.source, x.sortie && "→ " + x.sortie, ia && "IA"].filter(Boolean).join(" ");
      return `<li><span class="ai" aria-hidden="true">${ph ? "🖼" : "🎞"}</span><div><b>${esc(titre)}</b><span>${esc(quand(x.date))}${det ? " · " + esc(det) : ""}</span></div></li>`;
    }).join("");
  }

  /* -- barre d'onglets iPhone -- */
  const dock = $("#dock");
  if (dock) dock.addEventListener("click", e => {
    const b = e.target.closest("button[data-go]"); if (!b) return;
    const go = b.dataset.go;
    if (go === "mdlb") { const m = $("#mdlb"); if (m) m.click(); return }
    if (go === "activite" && B.classList.contains("loaded") && innerWidth < 1024) { /* pendant un travail, l'activité est masquée sur iPhone : on l'affiche */
      const a = $("#activite"); if (a) a.style.display = "grid" }
    const t = $("#" + go); if (t) t.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion:reduce)").matches ? "auto" : "smooth", block: "start" });
    dock.querySelectorAll("button").forEach(x => x.setAttribute("aria-current", x === b ? "true" : "false"));
  });

  /* -- mises à jour : observation des attributs que l'app change déjà (aucune modification d'app.js) -- */
  const obs = new MutationObserver(() => { etape(); activite() });
  ["#app", "#pg", "#out"].forEach(q => { const e = $(q); if (e) obs.observe(e, { attributes: true, attributeFilter: ["hidden"] }) });
  obs.observe(B, { attributes: true, attributeFilter: ["class"] });
  window.addEventListener("storage", e => { if (e.key === "recettes") activite() });
  window.addEventListener("focus", activite);
  etape(); activite();
  window.__atelier = { etape, activite };
})();
/* v7.2 : icône « Paramètres » dessinée dans le style des autres (le bouton est créé par studio.js) */
(() => { const b = document.getElementById("stb"); if (b) b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>' })();
