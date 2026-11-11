/* RetoucheProAI v6.9 — RVIS : restauration des visages d'une photo, sur le téléphone.
   Chaîne : repérage (VISAGE / YuNet, 5 repères) → alignement sur le gabarit 512×512 → GFPGAN v1.4 (Tencent ARC, poids quantifiés
   int8, calcul en float32, ONNX Runtime WebAssembly) → couleurs recalées sur l'original → dosage avec l'original (« force ») →
   recollage avec bord fondu. Les détails fins qui n'étaient PAS dans l'original sont mesurés et montrés (« zones inventées »).
   Ce que le module ne fait pas : il ne reconnaît personne, ne touche pas au reste de la photo, ne traite pas encore la vidéo,
   et laisse intact un visage déjà net et grand (rien à gagner, risque de changer l'expression).
   Mesures et limites : REGISTRE_LIVRAISON_PERMANENT.md, section « Restauration des visages ». */
var RVIS = (() => {
  const ID = "gfpgan", N = 512, Q = N * N;
  /* gabarit FFHQ 512 (facexlib) : œil gauche image, œil droit image, nez, coin gauche, coin droit de la bouche — même ordre que YuNet */
  const T = [192.98138, 239.94708, 318.90277, 240.1936, 256.63416, 314.01935, 201.26117, 371.41043, 313.08905, 371.15118];
  /* réglages issus du banc d'essai (tests/banc_visages.py) : voir le registre */
  const R = { force: 0.8, netMin: 6, oeilMin: 12, seuilInvente: 6, max: 8 };
  let sess = null, chargement = null;
  const $ = s => document.querySelector(s);

  function script(src) { return new Promise((ok, ko) => { if (window.ort) return ok(); const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => ko(new Error("moteur introuvable")); document.head.appendChild(s) }) }
  async function charger(onP) {
    if (sess) return sess;
    if (!chargement) chargement = (async () => {
      if (MODELS.beforeLoad) await MODELS.beforeLoad(ID);
      const b = new Uint8Array(await MODELS.bytes(ID, { download: true, onProgress: onP }));
      await script("ort/ort.wasm.min.js");
      ort.env.wasm.wasmPaths = new URL("ort/", location.href).href;
      ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
      /* optimisations du graphe coupées : les poids restent en int8 (86 Mo) au lieu d'être dépliés d'un coup en float32 (345 Mo).
         Mesuré (banc, 1 fil) : même vitesse, pic mémoire plus bas. */
      sess = await ort.InferenceSession.create(b, { executionProviders: ["wasm"], graphOptimizationLevel: "disabled", enableCpuMemArena: false });
      return sess;
    })().catch(e => { chargement = null; throw e });
    return chargement;
  }
  async function liberer() { const s = sess; sess = null; chargement = null; try { if (s && s.release) await s.release() } catch (e) {} }
  let enCours = 0;
  if (window.MODELS) MODELS.register(ID, { loaded: () => !!sess, busy: () => enCours > 0 || (!!chargement && !sess), unload: liberer });

  /* similitude (échelle, rotation, translation) au sens des moindres carrés : p (5 points) → q (5 points) */
  function similitude(p, q) {
    let mx = 0, my = 0, nx = 0, ny = 0; for (let i = 0; i < 5; i++) { mx += p[2 * i]; my += p[2 * i + 1]; nx += q[2 * i]; ny += q[2 * i + 1] }
    mx /= 5; my /= 5; nx /= 5; ny /= 5; let sxx = 0, a = 0, b = 0;
    for (let i = 0; i < 5; i++) { const x = p[2 * i] - mx, y = p[2 * i + 1] - my, u = q[2 * i] - nx, v = q[2 * i + 1] - ny; sxx += x * x + y * y; a += x * u + y * v; b += x * v - y * u }
    a /= sxx; b /= sxx; return [a, b, nx - a * mx + b * my, ny - b * mx - a * my];   /* x' = a·x − b·y + tx ; y' = b·x + a·y + ty */
  }
  const inverse = ([a, b, tx, ty]) => { const d = a * a + b * b, ia = a / d, ib = -b / d; return [ia, ib, -(ia * tx - ib * ty), -(ib * tx + ia * ty)] };

  /* netteté du visage aligné : énergie du laplacien sur le centre du visage (yeux, nez, bouche) */
  function nettete(d) {
    let s = 0, n = 0; const g = k => .299 * d[k] + .587 * d[k + 1] + .114 * d[k + 2];
    for (let y = 200; y < 400; y += 2) for (let x = 160; x < 352; x += 2) { const i = (y * N + x) * 4, l = 4 * g(i) - g(i - 4) - g(i + 4) - g(i - 4 * N) - g(i + 4 * N); s += l * l; n++ }
    return Math.sqrt(s / n);
  }
  function flou(src, r) {   /* flou boîte ×3 ≈ gaussienne, plan 512×512 */
    let a = Float32Array.from(src), b = new Float32Array(Q); const w = N, h = N, k = 2 * r + 1;
    for (let p = 0; p < 3; p++) {
      for (let y = 0; y < h; y++) { const o = y * w; let s = 0; for (let x = -r; x <= r; x++) s += a[o + Math.min(w - 1, Math.max(0, x))]; for (let x = 0; x < w; x++) { b[o + x] = s / k; s += a[o + Math.min(w - 1, x + r + 1)] - a[o + Math.max(0, x - r)] } }
      for (let x = 0; x < w; x++) { let s = 0; for (let y = -r; y <= r; y++) s += b[Math.min(h - 1, Math.max(0, y)) * w + x]; for (let y = 0; y < h; y++) { a[y * w + x] = s / k; s += b[Math.min(h - 1, y + r + 1) * w + x] - b[Math.max(0, y - r) * w + x] } }
    }
    return a;
  }
  const gris = d => { const g = new Float32Array(Q); for (let j = 0, i = 0; j < Q; j++, i += 4) g[j] = .299 * d[i] + .587 * d[i + 1] + .114 * d[i + 2]; return g };
  /* détails fins présents dans la sortie mais absents de l'entrée → « inventés » (même mesure que le banc d'essai) */
  function carteInventee(sortie, entree) {
    const a = gris(sortie), b = gris(entree), fa = flou(a, 2), fb = flou(b, 2), e = new Float32Array(Q);
    for (let i = 0; i < Q; i++) e[i] = Math.abs((a[i] - fa[i]) - (b[i] - fb[i]));
    return flou(e, 3);
  }
  /* bord fondu du visage recollé : 1 au centre du visage, 0 au bord du carré aligné */
  const ALPHA = (() => { const a = new Float32Array(Q); for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = (x - 256) / 236, dy = (y - 286) / 250, r = Math.sqrt(dx * dx + dy * dy), m = Math.min(x, y, N - 1 - x, N - 1 - y);
    a[y * N + x] = Math.min(1, Math.max(0, (1.12 - r) / .22)) * Math.min(1, m / 24) } return a })();
  const toile = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c };

  /* 1) calcul : repère, aligne, restaure chaque visage. La photo d'origine n'est jamais modifiée.
     src : image ou canvas ; opt.onProgress(étape, fraction) ; opt.signal (AbortSignal) */
  async function analyser(src, opt) {
    opt = opt || {}; const t0 = performance.now(), P = opt.onProgress || (() => {});
    const W = src.naturalWidth || src.width, H = src.naturalHeight || src.height, base = toile(W, H); base.getContext("2d").drawImage(src, 0, 0, W, H);
    P("Recherche des visages…", 0);
    const F = (await VISAGE.detecter(base, W, H, .55)).slice(0, R.max), V = [];
    for (const f of F) {
      const oeil = Math.hypot(f.pts[2] - f.pts[0], f.pts[3] - f.pts[1]), v = { boite: [f.x, f.y, f.w, f.h].map(Math.round), oeil: Math.round(oeil), score: f.score };
      V.push(v); if (oeil < R.oeilMin) { v.statut = "trop petit"; continue }
      v.M = similitude(f.pts, T); v.Mi = inverse(v.M);
      const al = toile(N, N), ax = al.getContext("2d", { willReadFrequently: true });
      ax.imageSmoothingQuality = "high"; ax.setTransform(v.M[0], v.M[1], -v.M[1], v.M[0], v.M[2], v.M[3]); ax.drawImage(base, 0, 0);
      v.d = ax.getImageData(0, 0, N, N).data;
      /* netteté ramenée à la taille réelle du visage : un visage net mais agrandi pour l'alignement paraît flou à 512 px (mesuré) */
      v.echelle = +Math.hypot(v.M[0], v.M[1]).toFixed(3); v.nettete = +(nettete(v.d) * v.echelle).toFixed(1);
      v.statut = v.nettete >= R.netMin ? "déjà net" : "à restaurer";
    }
    const todo = V.filter(v => v.statut === "à restaurer");
    if (todo.length) {
      const s = await charger(f => P("Téléchargement du modèle de visage (86 Mo, une seule fois)…", f));
      for (let k = 0; k < todo.length; k++) {
        if (opt.signal && opt.signal.aborted) throw new DOMException("annulé", "AbortError");
        const v = todo[k], d = v.d, x = new Float32Array(3 * Q); P("Restauration du visage " + (k + 1) + " sur " + todo.length + "…", k / todo.length);
        await new Promise(r => setTimeout(r, 30));   /* laisse l'écran afficher l'étape */
        for (let j = 0, i = 0; j < Q; j++, i += 4) { x[j] = d[i] / 127.5 - 1; x[Q + j] = d[i + 1] / 127.5 - 1; x[2 * Q + j] = d[i + 2] / 127.5 - 1 }
        const t = performance.now(); enCours++; let y; try { y = (await s.run({ entree: new ort.Tensor("float32", x, [1, 3, N, N]) }))
        .sortie.data } finally { enCours-- } v.msModele = Math.round(performance.now() - t);
        /* couleurs : moyenne de chaque canal recalée sur l'original au centre du visage (le réseau peut teinter la peau) */
        const mo = [0, 0, 0], ms = [0, 0, 0]; let nc = 0; const g = new Uint8ClampedArray(Q * 4);
        for (let j = 0, i = 0; j < Q; j++, i += 4) { for (let c = 0; c < 3; c++) g[i + c] = (Math.max(-1, Math.min(1, y[c * Q + j])) + 1) * 127.5; if (ALPHA[j] > .9) { nc++; for (let c = 0; c < 3; c++) { mo[c] += d[i + c]; ms[c] += g[i + c] } } }
        const dc = mo.map((o, c) => (o - ms[c]) / Math.max(1, nc));
        for (let i = 0; i < Q * 4; i += 4) for (let c = 0; c < 3; c++) g[i + c] += dc[c];
        v.g = g; v.statut = "restauré";
      }
    }
    return { W, H, base, visages: V, ms: Math.round(performance.now() - t0) };
  }

  /* 2) composition au dosage voulu (instantané, sans relancer le réseau) : photo, carte des zones inventées, part inventée */
  function composer(S, force) {
    force = force == null ? R.force : Math.max(0, Math.min(1, force));
    const out = toile(S.W, S.H), ox = out.getContext("2d"); ox.drawImage(S.base, 0, 0);
    const carte = toile(S.W, S.H), cx = carte.getContext("2d");
    for (const v of S.visages) {
      if (v.statut !== "restauré") continue;
      const d = v.d, r = new ImageData(N, N), rd = r.data, ca = new ImageData(N, N), cd = ca.data;
      for (let i = 0; i < Q * 4; i += 4) { for (let c = 0; c < 3; c++) rd[i + c] = force * v.g[i + c] + (1 - force) * d[i + c]; rd[i + 3] = 255 }
      const inv = carteInventee(rd, d); let n = 0, m = 0;
      for (let j = 0, i = 0; j < Q; j++, i += 4) {
        rd[i + 3] = Math.round(255 * ALPHA[j]); const z = inv[j] > R.seuilInvente;
        if (ALPHA[j] > .5) { m++; if (z) n++ }
        if (z) { cd[i] = 255; cd[i + 1] = 0; cd[i + 2] = 200; cd[i + 3] = Math.round(180 * ALPHA[j]) }
      }
      v.inventee = +(n / Math.max(1, m)).toFixed(3);
      const c1 = toile(N, N); c1.getContext("2d").putImageData(r, 0, 0); const c2 = toile(N, N); c2.getContext("2d").putImageData(ca, 0, 0);
      const t = v.Mi; for (const [x, c] of [[ox, c1], [cx, c2]]) { x.save(); x.imageSmoothingQuality = "high"; x.setTransform(t[0], t[1], -t[1], t[0], t[2], t[3]); x.drawImage(c, 0, 0); x.restore() }
    }
    return { canvas: out, carte, force };
  }
  async function restaurer(src, opt) { const S = await analyser(src, opt); return Object.assign(composer(S, opt && opt.force), { visages: S.visages, ms: S.ms, S }) }
  function resume(S) {   /* phrase honnête de ce qui a été fait */
    const V = S.visages, r = V.filter(v => v.statut === "restauré"), n = V.filter(v => v.statut === "déjà net").length, p = V.filter(v => v.statut === "trop petit").length;
    if (!V.length) return "Aucun visage trouvé : la photo n’a pas été modifiée.";
    const t = [];
    if (r.length) t.push(r.length + " visage" + (r.length > 1 ? "s restaurés" : " restauré") + " (détails inventés : " + Math.round(100 * r.reduce((a, v) => a + v.inventee, 0) / r.length) + " % de la surface, en rose sur la carte)");
    if (n) t.push(n + " déjà net" + (n > 1 ? "s" : "") + ", laissé" + (n > 1 ? "s" : "") + " tel" + (n > 1 ? "s" : "") + " quel" + (n > 1 ? "s" : ""));
    if (p) t.push(p + " trop petit" + (p > 1 ? "s" : "") + " pour être restauré" + (p > 1 ? "s" : "") + " sans tout inventer");
    return t.join(" · ") + ".";
  }

  /* ---------- écran « Restaurer les visages » ---------- */
  function css() {
    if ($("#rv_css")) return; const st = document.createElement("style"); st.id = "rv_css";
    st.textContent = `
#rvis{position:fixed;inset:0;z-index:60;background:var(--stage,#0a0f10);color:#e8f0ee;display:flex;flex-direction:column;font:15px/1.4 var(--fb,system-ui)}
#rvis[hidden]{display:none}
#rvis header{display:flex;align-items:center;gap:8px;padding:calc(env(safe-area-inset-top) + 8px) 12px 8px;background:rgba(0,0,0,.35)}
#rvis header h2{flex:1;margin:0;font:600 16px/1.2 var(--fd,system-ui);color:#fff}
#rvis .rv-ib{min-width:44px;min-height:44px;border-radius:12px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:#fff;font-size:15px;padding:0 10px;cursor:pointer}
#rv_stage{position:relative;flex:1;min-height:0;overflow:hidden;touch-action:none;user-select:none;-webkit-user-select:none}
#rv_stage canvas{position:absolute;inset:0;width:100%;height:100%;object-fit:contain}
#rv_av{clip-path:inset(0 0 0 50%)}
#rv_carte{opacity:0;transition:opacity .2s}#rvis.carte #rv_carte{opacity:1}
#rv_ligne{position:absolute;top:0;bottom:0;left:50%;width:2px;background:#fff;box-shadow:0 0 6px #000;pointer-events:none}
#rv_ligne::after{content:"⟷";position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:#fff;color:#000;border-radius:50%;width:30px;height:30px;display:grid;place-items:center;font-size:15px}
.rv-tag{position:absolute;top:10px;padding:5px 9px;border-radius:9px;background:rgba(0,0,0,.6);font-size:12px;color:#fff;pointer-events:none}
#rv_msg{min-height:20px;margin:0;padding:6px 12px 0;font-size:13px;color:#cfe0dc}
#rv_bar{height:4px;margin:4px 12px 0;border-radius:2px;background:rgba(255,255,255,.12);overflow:hidden}#rv_bar i{display:block;height:100%;width:0;background:var(--acc,#0b7a80);transition:width .2s}
#rvis footer{padding:6px 12px calc(env(safe-area-inset-bottom) + 10px);background:rgba(0,0,0,.35);display:grid;gap:8px}
#rvis .rv-row{display:flex;gap:8px;align-items:center}
#rvis label.rv-f{display:flex;align-items:center;gap:8px;flex:1;font-size:13px}
#rvis input[type=range]{flex:1;accent-color:var(--acc,#0b7a80)}
#rvis .rv-go{flex:1;min-height:48px;border-radius:12px;border:0;background:var(--acc,#0b7a80);color:var(--accink,#fff);font-weight:700;font-size:15px;cursor:pointer}
#rvis .rv-no{flex:1;min-height:48px;border-radius:12px;border:1px solid rgba(255,255,255,.25);background:transparent;color:#fff;font-weight:600;font-size:15px;cursor:pointer}
#rvis button:disabled{opacity:.4}
#rvis details{font-size:12.5px;color:#cfe0dc}#rvis summary{cursor:pointer;min-height:32px;display:flex;align-items:center}`;
    document.head.appendChild(st);
  }
  function ui() {
    if ($("#rvis")) return $("#rvis"); css();
    const d = document.createElement("div"); d.id = "rvis"; d.hidden = true; d.setAttribute("role", "dialog"); d.setAttribute("aria-label", "Restaurer les visages");
    d.innerHTML = `<header><button class="rv-ib" id="rv_x" aria-label="Fermer">✕</button><h2>Restaurer les visages</h2><button class="rv-ib" id="rv_cb" aria-pressed="false" disabled>Carte</button></header>
<div id="rv_stage"><canvas id="rv_ap"></canvas><canvas id="rv_av"></canvas><canvas id="rv_carte"></canvas><div id="rv_ligne"></div><span class="rv-tag" style="left:10px">Original</span><span class="rv-tag" style="right:10px">Restauré</span></div>
<div id="rv_bar"><i></i></div><p id="rv_msg" role="status" aria-live="polite"></p>
<footer><div class="rv-row"><label class="rv-f">Force <input type="range" id="rv_force" min="0" max="100" step="5" value="80" disabled aria-label="Force de la restauration"><output id="rv_fo">80 %</output></label></div>
<div class="rv-row"><button class="rv-no" id="rv_ann">Annuler</button><button class="rv-go" id="rv_ok" disabled>Enregistrer la photo</button></div>
<details><summary>Ce que fait cet outil (essai)</summary>Le visage est repéré, redressé, puis restauré par un modèle d’IA (GFPGAN 1.4) qui <b>reconstruit</b> les détails trop abîmés : yeux, peau, cheveux. Ces détails sont <b>plausibles, pas retrouvés</b> : la carte rose montre où ils ont été inventés. Baisse la force si le visage ne ressemble plus assez à la personne. Le calcul se fait sur ton téléphone ; la photo n’est envoyée nulle part. Le reste de la photo n’est pas touché.</details></footer>`;
    document.body.appendChild(d);
    const stage = d.querySelector("#rv_stage"), av = d.querySelector("#rv_av"), ligne = d.querySelector("#rv_ligne");
    const pos = e => { const r = stage.getBoundingClientRect(), p = Math.max(0, Math.min(1, ((e.touches ? e.touches[0].clientX : e.clientX) - r.left) / r.width)); av.style.clipPath = "inset(0 0 0 " + p * 100 + "%)"; ligne.style.left = p * 100 + "%" };
    stage.addEventListener("pointerdown", e => { pos(e); stage.setPointerCapture(e.pointerId) }); stage.addEventListener("pointermove", e => { if (e.buttons) pos(e) });
    d.querySelector("#rv_cb").onclick = e => { const on = d.classList.toggle("carte"); e.currentTarget.setAttribute("aria-pressed", on) };
    d.querySelector("#rv_force").oninput = e => { d.querySelector("#rv_fo").textContent = e.target.value + " %"; clearTimeout(ui.t); ui.t = setTimeout(() => afficher(+e.target.value / 100), 60) };
    d.querySelector("#rv_x").onclick = d.querySelector("#rv_ann").onclick = fermer;
    d.querySelector("#rv_ok").onclick = enregistrer;
    return d;
  }
  let E = null;   /* séance : { S, nom, res, ctrl } */
  const MSG = (t, f) => { $("#rv_msg").textContent = t || ""; $("#rv_bar i").style.width = f == null ? "0" : Math.round(100 * f) + "%" };
  function dessiner(id, c) { const x = $(id); x.width = c.width; x.height = c.height; x.getContext("2d").drawImage(c, 0, 0) }
  function afficher(force) { if (!E || !E.S) return; E.res = composer(E.S, force); dessiner("#rv_av", E.res.canvas); dessiner("#rv_carte", E.res.carte); MSG(resume(E.S)) }
  async function ouvrir(file) {
    const d = ui(); d.hidden = false; d.classList.remove("carte"); ["#rv_ok", "#rv_force", "#rv_cb"].forEach(s => $(s).disabled = true);
    const url = URL.createObjectURL(file), im = new Image(); E = { nom: (file.name || "photo").replace(/\.[^.]+$/, ""), ctrl: new AbortController() };
    try {
      im.src = url; await im.decode(); const c = toile(im.naturalWidth, im.naturalHeight); c.getContext("2d").drawImage(im, 0, 0);
      dessiner("#rv_ap", c); dessiner("#rv_av", c); dessiner("#rv_carte", toile(c.width, c.height));
      const S = await analyser(c, { signal: E.ctrl.signal, onProgress: (t, f) => MSG(t, f) }); if (!E) return; E.S = S;
      afficher(+$("#rv_force").value / 100);
      const ok = S.visages.some(v => v.statut === "restauré"); ["#rv_ok", "#rv_force", "#rv_cb"].forEach(s => $(s).disabled = !ok);
      try { if (window.REC && REC.log) REC.log("rvis", { visages: S.visages.map(v => ({ statut: v.statut, oeil: v.oeil, nettete: v.nettete, inventee: v.inventee, ms: v.msModele })), ms: S.ms }) } catch (e) {}
    } catch (e) {
      if (e && e.name === "AbortError") return;
      if (window.STUDIO && !STUDIO.granted("modele")) return MSG("Téléchargement du modèle non autorisé : rien n’a été envoyé ni modifié. Tu peux l’autoriser dans ⚙️ Paramètres, puis relancer.");
      const m = window.MODELS && MODELS.explain ? MODELS.explain(e) : null;
      MSG("Restauration impossible : " + (m ? m.texte + " " + m.solution : (e && e.message) || e) + " La photo d’origine n’a pas été modifiée.");
    } finally { URL.revokeObjectURL(url) }
  }
  function fermer() { if (E && E.ctrl) E.ctrl.abort(); E = null; const d = $("#rvis"); if (d) d.hidden = true }
  async function enregistrer() {
    if (!E || !E.res) return; const b = await new Promise(r => E.res.canvas.toBlob(r, "image/jpeg", .95)), n = E.nom + "-visages";
    if (typeof shareBlob === "function") return shareBlob(b, typeof uniqName === "function" ? uniqName(n, "jpg") : n + ".jpg");
    const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = n + ".jpg"; a.click();
  }
  return { analyser, composer, restaurer, resume, ouvrir, fermer, charger, liberer, similitude, inverse, R, ID };
})();
