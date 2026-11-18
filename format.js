/* RetoucheProAI v8.0 — FMT : « Changer de format » (F32), l'outil complet : lecture, analyse, décision par scène, décor, contrôle
   qualité, aperçu, export. Chargé à la demande (chargerModule("format")).
   Modules (chacun indépendant, calcul pur, testés dans Node — tests/format/) :
     format-analyse.js   FMA  mesure : bandes noires, changements de plan, mouvement de la caméra, suivi des sujets ;
     format-directeur.js FMD  décide, scène par scène : recadrage suivi, décor retrouvé, décor reconstruit, hybride, prolongement flou ;
     format-moteur.js    FMM  fabrique le décor de chaque scène (mosaïque réelle + reconstruction MI-GAN bornée) ;
     format-qualite.js   FMQ  mesure le résultat et demande une correction si un seuil est dépassé.
   Ce fichier-ci : tout ce qui touche au navigateur (décodage WebCodecs, toiles, encodage, écran).
   Principes : l'image d'origine n'est jamais retouchée (seul ce qui manque autour est ajouté) ; le décor d'une scène est calculé UNE fois
   et suit la caméra (pas de scintillement possible) ; chaque chiffre affiché est une mesure ; rien n'est envoyé hors de l'appareil. */
var FMT = (() => {
  const $ = s => document.querySelector(s), pair = x => Math.max(2, Math.round(x / 2) * 2), borne = (x, a, b) => x < a ? a : x > b ? b : x;
  const toile = (w, h, lire) => { const c = document.createElement("canvas"); c.width = w; c.height = h; c.x = c.getContext("2d", lire ? { willReadFrequently: true } : undefined); return c };
  const attendre = ms => new Promise(r => setTimeout(r, ms)), souffler = () => new Promise(r => setTimeout(r, 0));
  class Annule extends Error { constructor() { super("annulé"); this.name = "AbortError" } }
  let E = null;   /* séance en cours */

  /* ================= appareil ================= */
  function appareil() {
    const ua = navigator.userAgent, mobile = /iPhone|iPad|iPod|Android/i.test(ua) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform || "")), mem = navigator.deviceMemory || (mobile ? 4 : 8);
    const faible = mobile || mem <= 4;
    return { mobile, mem, coeurs: navigator.hardwareConcurrency || 2, webgpu: !!navigator.gpu, webcodecs: !!(window.VideoDecoder && window.VideoEncoder),
      plafond: faible ? 1920 : 3840,                 /* plus grand côté de la sortie en réglage automatique */
      plafondZero: 4096,                             /* Zéro perte : plus grand côté que l'encodeur H.264/HEVC niveau 5.1 accepte (au-delà : réduction signalée) */
      plaqueMax: faible ? 3.4e6 : 9e6,               /* pixels d'un décor de scène à l'export */
      apercu: faible ? 432 : 540,                    /* petit côté de l'aperçu */
      echantillons: faible ? 18 : 32,                /* images lues pour bâtir un décor */
      gardes: faible ? 260 : 420 };                  /* vignettes gardées pendant l'analyse */
  }
  const AP = appareil();

  /* ================= lecture image par image ================= */
  async function ouvrirLecteur(file, vid) {
    let inf = null; try { inf = await demuxVideo(file) } catch (e) {}
    if (inf && inf.ns > 1 && window.VideoDecoder && typeof SeqReader !== "undefined") {
      try { try { cancel = false } catch (e) {}
        const r = new SeqReader(file, inf); r.setFps(0); await r.open(0); await r.need(0); r.close();
        const t = inf.cts.slice().sort((a, b) => a - b), t0 = t[0], tps = Float64Array.from(t, v => (v - t0) / inf.ts), n = inf.ns, dt = n > 1 ? (tps[n - 1] - tps[0]) / (n - 1) : 1 / 30;
        return { type: "webcodecs", n, w: inf.dw, h: inf.dh, tps, cadence: 1 / dt, duree: tps[n - 1] + dt, codec: inf.codec,
          async parcourir(indices, cb) { if (!indices.length) return; try { cancel = false } catch (e) {} const rd = new SeqReader(file, inf); rd.setFps(0); await rd.open(indices[0]);
            try { for (const i of indices) { if (E && E.stop) throw new Annule(); await cb(await rd.need(i), i) } } finally { try { rd.close() } catch (e) {} } } };
      } catch (e) { if (e instanceof Annule) throw e }
    }
    /* secours : la balise vidéo du navigateur (tout format qu'il sait lire ; plus lent, cadence supposée de 30 images/s) */
    if (!vid) throw new Error("ce fichier n’est pas une vidéo lisible par ce navigateur");
    const v = attacher(document.createElement("video")); v.src = vid.src; await attendreVideo(v, 1, 30000, "vidéo illisible (délai dépassé)"); await amorcer(v);
    const cadence = 30, n = Math.max(1, Math.floor(v.duration * cadence)), tps = Float64Array.from({ length: n }, (_, i) => i / cadence);
    return { type: "balise", v, n, w: v.videoWidth, h: v.videoHeight, tps, cadence, duree: v.duration, codec: "",
      async parcourir(indices, cb) { for (const i of indices) { if (E && E.stop) throw new Annule(); await new Promise(r => { const fin = () => { v.onseeked = null; r() }; v.onseeked = fin; v.currentTime = Math.min(v.duration - .001, tps[i] + .4 / cadence); setTimeout(fin, 3000) }); await cb(v, i) } } };
  }

  /* ================= détecteurs ================= */
  const COCO = { person: "personne", cat: "animal", dog: "animal", horse: "animal", bird: "animal", sheep: "animal", cow: "animal", elephant: "animal", bear: "animal", zebra: "animal", giraffe: "animal",
    car: "vehicule", bus: "vehicule", truck: "vehicule", motorcycle: "vehicule", bicycle: "vehicule", train: "vehicule", boat: "vehicule", airplane: "vehicule" };
  const OBJ = { det: null, pr: null, n: 0,
    async charger() { if (OBJ.det) return OBJ.det; if (!OBJ.pr) OBJ.pr = (async () => {
        if (MODELS.beforeLoad) await MODELS.beforeLoad("objets"); const b = new Uint8Array(await MODELS.bytes("objets", { download: true })), base = "modeles/lourds/mains/";
        const V = await import(new URL(base + "vision_bundle.mjs", location.href).href);
        OBJ.det = await V.ObjectDetector.createFromOptions({ wasmLoaderPath: new URL(base + "vision_wasm_internal.js", location.href).href, wasmBinaryPath: new URL(base + "vision_wasm_internal.wasm", location.href).href },
          { baseOptions: { modelAssetBuffer: b, delegate: "CPU" }, runningMode: "IMAGE", scoreThreshold: .35, maxResults: 12 }); return OBJ.det })().catch(e => { OBJ.pr = null; throw e });
      return OBJ.pr },
    async liberer() { const d = OBJ.det; OBJ.det = OBJ.pr = null; try { if (d && d.close) d.close() } catch (e) {} },
    detecter(c) { OBJ.n++; try { const r = OBJ.det.detect(c), W = c.width, H = c.height; return (r.detections || []).map(d => { const b = d.boundingBox, k = d.categories[0] || {}, cl = COCO[k.categoryName] || (k.score >= .5 ? "objet" : null);
        return cl && { x: borne(b.originX / W, 0, 1), y: borne(b.originY / H, 0, 1), w: Math.min(1, b.width / W), h: Math.min(1, b.height / H), score: k.score, classe: cl, nom: k.categoryName } }).filter(Boolean) } finally { OBJ.n-- } } };
  if (window.MODELS) try { MODELS.register("objets", { loaded: () => !!OBJ.det, busy: () => OBJ.n > 0, unload: OBJ.liberer }) } catch (e) {}

  /* ================= 1. analyse ================= */
  async function bandes(L) {   /* bandes noires incrustées : 9 images réparties */
    const w = 96, h = Math.max(8, Math.round(96 * L.h / L.w)), c = toile(w, h, true), G = [], idx = []; for (let k = 0; k < 9; k++) idx.push(Math.min(L.n - 1, Math.floor((k + .5) / 9 * L.n)));
    const cw = Math.min(L.w, 1920), chh = Math.min(L.h, 1920), cc = toile(cw, 48, true), cl = toile(48, chh, true), pc = new Float32Array(cw), pl = new Float32Array(chh); let nb = 0;
    for (const i of [...new Set(idx)]) await L.parcourir([i], async s => { c.x.drawImage(s, 0, 0, w, h); G.push(FMA.gris(c.x.getImageData(0, 0, w, h).data, w * h)); nb++;
      cc.x.drawImage(s, 0, 0, cw, 48); const a = cc.x.getImageData(0, 0, cw, 48).data; for (let x = 0; x < cw; x++) { let m = 0; for (let y = 4; y < 44; y += 3) { const j = (y * cw + x) * 4; m += .299 * a[j] + .587 * a[j + 1] + .114 * a[j + 2] } pc[x] += m / 14 }
      cl.x.drawImage(s, 0, 0, 48, chh); const b = cl.x.getImageData(0, 0, 48, chh).data; for (let y = 0; y < chh; y++) { let m = 0; for (let x = 4; x < 44; x += 3) { const j = (y * 48 + x) * 4; m += .299 * b[j] + .587 * b[j + 1] + .114 * b[j + 2] } pl[y] += m / 14 } });
    const b = FMA.bandesNoires(G, w, h); let x = Math.round(b.x * L.w), y = Math.round(b.y * L.h), zw = Math.min(L.w - x, Math.round(b.w * L.w)), zh = Math.min(L.h - y, Math.round(b.h * L.h)); const bandes = !(zw * zh > .985 * L.w * L.h || zw < 32 || zh < 32); if (!bandes) { x = y = 0; zw = L.w; zh = L.h }
    for (let k = 0; k < cw; k++) pc[k] /= nb || 1; for (let k = 0; k < chh; k++) pl[k] /= nb || 1; const ex = cw / L.w, ey = chh / L.h;
    if (bandes) { /* la recherche se fait sur une image réduite (1 point ≈ 5 pixels) : on retrouve la frontière exacte sur le profil en pleine définition */
      let a = Math.round(x * ex), b2 = Math.round((x + zw) * ex), c2 = Math.round(y * ey), d2 = Math.round((y + zh) * ey); const lim = Math.ceil(cw / 96 * 2.5), limy = Math.ceil(chh / h * 2.5);
      for (let k = 0; k < lim && a > 0 && pc[a - 1] > 20; k++) a--; for (let k = 0; k < lim && b2 < cw && pc[b2] > 20; k++) b2++; for (let k = 0; k < limy && c2 > 0 && pl[c2 - 1] > 20; k++) c2--; for (let k = 0; k < limy && d2 < chh && pl[d2] > 20; k++) d2++;
      x = Math.round(a / ex); zw = Math.round(b2 / ex) - x; y = Math.round(c2 / ey); zh = Math.round(d2 / ey) - y }
    /* liseré sombre de quelques pixels au bord de l'image utile (il ferait une ligne noire au raccord) */
    const mx = Math.max(3, Math.round(.02 * zw * ex)), my = Math.max(3, Math.round(.02 * zh * ey));
    const X0 = Math.round(x * ex), X1 = Math.round((x + zw) * ex), Y0 = Math.round(y * ey), Y1 = Math.round((y + zh) * ey), g = Math.ceil(FMA.lisere(pc.subarray(X0, X1), mx) / ex), d = Math.ceil(FMA.lisere(pc.subarray(X0, X1).slice().reverse(), mx) / ex), ht = Math.ceil(FMA.lisere(pl.subarray(Y0, Y1), my) / ey), bs = Math.ceil(FMA.lisere(pl.subarray(Y0, Y1).slice().reverse(), my) / ey);
    return { x: x + g, y: y + ht, w: zw - g - d, h: zh - ht - bs, bandes, lisere: g + d + ht + bs > 0 };
  }
  /* profils d'une image d'analyse : moyenne par colonne / ligne de |gradient| (÷2) et de |image − précédente| (stockés sur 8 bits) */
  function FFP(g, pg, w, h, a, Ce, Cm, Re, Rm) {
    const ce = new Float32Array(w), cm = new Float32Array(w), re = new Float32Array(h), rm = new Float32Array(h);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const j = y * w + x, e = Math.abs(g[j + 1] - g[j - 1]) + Math.abs(g[j + w] - g[j - w]), m = pg ? Math.abs(g[j] - pg[j]) : 0; ce[x] += e; re[y] += e; cm[x] += m; rm[y] += m }
    ce[0] = ce[1]; ce[w - 1] = ce[w - 2]; cm[0] = cm[1]; cm[w - 1] = cm[w - 2]; re[0] = re[1]; re[h - 1] = re[h - 2]; rm[0] = rm[1]; rm[h - 1] = rm[h - 2];
    for (let x = 0; x < w; x++) { Ce[a * w + x] = Math.min(255, ce[x] / (h - 2) / 2); Cm[a * w + x] = Math.min(255, cm[x] / (h - 2)) }
    for (let y = 0; y < h; y++) { Re[a * h + y] = Math.min(255, re[y] / (w - 2) / 2); Rm[a * h + y] = Math.min(255, rm[y] / (w - 2)) }
  }
  async function analyser(onP) {
    const L = E.lecteur, t0 = performance.now(); onP("Recherche de bandes noires…", 0); const Z = E.zone = await bandes(L);
    const pasA = Math.max(1, Math.round(L.cadence / 30)), nA = Math.ceil(L.n / pasA), cadA = L.cadence / pasA, aw = Z.w >= Z.h ? 160 : pair(160 * Z.w / Z.h), ah = Z.w >= Z.h ? pair(160 * Z.h / Z.w) : 160, gw = Math.max(4, Math.round(aw / 10)), gh = Math.max(4, Math.round(ah / 10));
    const ac = toile(aw, ah, true), dk = 640 / Math.max(Z.w, Z.h), dc = toile(Math.max(8, Math.round(Z.w * Math.min(1, dk))), Math.max(8, Math.round(Z.h * Math.min(1, dk))), true);
    const SV = FMA.suiveur(aw, ah), ecarts = new Float32Array(nA), residus = new Float32Array(nA), lum = new Float32Array(nA), C = new Array(nA), mouv = new Array(nA), reliefs = new Uint8Array(nA * gw * gh), resids = new Uint8Array(nA * gw * gh);
    /* v8.5 Fidèle : profils par colonne et par ligne (détails, mouvement) de chaque image d'analyse → importance pour la déformation protégée */
    const PCe = new Uint8Array(nA * aw), PCm = new Uint8Array(nA * aw), PRe = new Uint8Array(nA * ah), PRm = new Uint8Array(nA * ah);
    const gardes = [], reperes = [], interets = [], tGarde = Math.max(.4, L.duree / (AP.gardes * .75)), pasD = Math.max(1, Math.round(cadA * (L.duree > 180 ? .8 : .4)));
    /* détecteurs : visages (YuNet, livré avec l'app) ; personnes, animaux, objets (EfficientDet-Lite0, téléchargé avec accord) */
    let visOK = false, objOK = false; onP("Préparation des détecteurs…", 0);
    try { await VISAGE.charger(); visOK = true } catch (e) {}
    try { await OBJ.charger(); objOK = true } catch (e) {}
    let ps = null, pg = null, dernG = -1e9, depl = 0, a = 0; const idx = []; for (let i = 0; i < L.n; i += pasA) idx.push(i);
    await L.parcourir(idx, async src => {
      ac.x.drawImage(src, Z.x, Z.y, Z.w, Z.h, 0, 0, aw, ah); const d = ac.x.getImageData(0, 0, aw, ah).data, g = FMA.gris(d, aw * ah), p = FMA.pyramide(g, aw, ah), s = FMA.signature(d, aw, ah), r = SV.ajouter(p);
      FFP(g, pg, aw, ah, a, PCe, PCm, PRe, PRm);
      C[a] = r.C; mouv[a] = r.pas; let m = 0; for (let k = 0; k < g.length; k += 7) m += g[k]; lum[a] = m / Math.ceil(g.length / 7);
      const rel = FMA.relief(g, aw, ah, gw, gh); for (let k = 0; k < gw * gh; k++) reliefs[a * gw * gh + k] = Math.min(255, rel[k] * 255);
      let res = null; if (a) { ecarts[a] = FMA.ecartSignature(ps, s); residus[a] = 1 - r.pas.inl; res = FMA.residu(pg, g, aw, ah, FMA.matrice(r.pas, aw, ah), gw, gh); for (let k = 0; k < gw * gh; k++) resids[a * gw * gh + k] = Math.min(255, res[k] * 255); depl += Math.hypot(r.pas.tx / aw, r.pas.ty / ah) + Math.abs(r.pas.a) }
      const t = a / cadA; if (t - dernG >= tGarde || depl >= .03 || ecarts[a] > .16) { if (gardes.length < AP.gardes * 1.5) gardes.push({ a, rgba: new Uint8Array(d) }); dernG = t; depl = 0 }
      if (a % pasD === 0) { const B = []; dc.x.drawImage(src, Z.x, Z.y, Z.w, Z.h, 0, 0, dc.width, dc.height);
        if (visOK) try { for (const f of await VISAGE.detecter(dc, dc.width, dc.height, .6)) B.push({ x: borne(f.x / dc.width, 0, 1), y: borne(f.y / dc.height, 0, 1), w: Math.min(1, f.w / dc.width), h: Math.min(1, f.h / dc.height), score: f.score, classe: "visage" }) } catch (e) { visOK = false }
        if (objOK) try { for (const o of OBJ.detecter(dc)) B.push(o) } catch (e) { objOK = false }
        reperes.push({ i: a, boites: B }); const it = FMA.interet(g, aw, ah, res, gw, gh); interets.push({ i: a, boites: it ? [{ x: it.x, y: it.y, w: it.w, h: it.h, score: .4 + .4 * borne(it.concentration, 0, 1), classe: "interet" }] : [] }) }
      ps = s; pg = g; a++; if (a % 6 === 0) { onP("Analyse de la vidéo… " + Math.round(100 * a / nA) + " %", a / nA); await souffler() }
    });
    const n = a, cp = FMA.coupures(ecarts.subarray(0, n), cadA, residus.subarray(0, n)); cp.push(n); const scenes = [];
    for (let k = cp.length - 2; k >= 0; k--) if (cp[k + 1] - cp[k] < 2 && cp.length > 2) cp.splice(k ? k : 1, 1);   /* une « scène » d'une seule image est rattachée à sa voisine */
    for (let k = 0; k + 1 < cp.length; k++) { const a0 = cp[k], a1 = cp[k + 1];
      const S = { i0: a0, i1: a1, cadence: cadA, aw, ah, mouv: mouv.slice(a0, a1), C: C.slice(a0, a1) }; let P = FMA.suivre(reperes, a0, a1, cadA); const nbSujets = P.length; if (!P.length) P = FMA.suivre(interets, a0, a1, cadA); S.pistes = P;
      const R = FMA.resumer(S), ns = a1 - a0, cr = new Float32Array(gw * gh), ca = new Float32Array(gw * gh); let lm = 0;
      for (let j = a0; j < a1; j++) { lm += lum[j]; for (let q = 0; q < gw * gh; q++) { cr[q] += reliefs[j * gw * gh + q] / 255 / ns; ca[q] += resids[j * gw * gh + q] / 255 / ns } }
      const cote = (M, x0, x1, y0, y1) => { let s = 0, c = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { s += M[y * gw + x]; c++ } return c ? s / c : 0 }, bd = M => ({ g: cote(M, 0, 2, 0, gh), d: cote(M, gw - 2, gw, 0, gh), h: cote(M, 0, gw, 0, 2), b: cote(M, 0, gw, gh - 2, gh) });
      const ech = gardes.filter(q => q.a >= a0 && q.a < a1).map(q => ({ rgba: q.rgba, M: R.M[q.a - a0] })), mos = ech.length ? FMM.mosaique(ech, aw, ah) : null;
      const moyP = (T, L, f) => { const o = new Float32Array(L); for (let j = a0; j < a1; j++) for (let q = 0; q < L; q++) o[q] += T[j * L + q] * f / ns; return o };
      const profil = { x: { e: moyP(PCe, aw, 2), m: moyP(PCm, aw, 1) }, y: { e: moyP(PRe, ah, 2), m: moyP(PRm, ah, 1) } };
      scenes.push({ profil, a0, a1, n: ns, cadence: cadA, pistes: P, sujets: nbSujets, classe: R.classe, etendue: R.etendue, verrou: R.verrou, touche: R.touche, M: R.M, bord: { relief: bd(cr), activite: bd(ca) }, carteRelief: cr, gw, gh, mos, lum: lm / ns, inl: R.inl });
      await souffler() }
    for (const s of scenes) { s.n = s.a1 - s.a0 }
    return { v: 2, zone: Z, pasA, cadA, aw, ah, n: L.n, scenes, detecteurs: { visages: visOK, objets: objOK }, ms: Math.round(performance.now() - t0) };
  }

  /* ================= 2. décision ================= */
  const REGLAGES = () => ({ mode: "fidele", plein: true, variante: "auto", bords: "ambiance", fidelite: .5, liberte: .5, intensite: .5, suivi: true, fond: "auto", qualite: "haute", resolution: "auto", cadence: "origine", scenes: {} });
  function cible() { const Z = E.zone; if (E.format === "auto") return FMD.FORMATS[FMD.formatAuto(Z.w, Z.h)]; if (E.format === "perso") return [Math.max(1, E.perso[0]), Math.max(1, E.perso[1])]; return FMD.FORMATS[E.format] }
  function decider() {
    if (E.reglages.mode === "fidele") return deciderFidele();
    E.fidele = null;
    const A = E.analyse, Z = E.zone, [rw, rh] = cible(), As = Z.w / Z.h, At = rw / rh, R = E.reglages;
    for (const s of A.scenes) s.reel = s.mos && s.classe !== "complexe" ? FMM.reelDisponible(s.mos, s.M, A.aw, A.ah, As, At) : { g: 0, d: 0, h: 0, b: 0 };
    const zero = R.mode === "zero", kg = zero && E.kaggle !== false && !!window.KG && KG.actif();
    const D = FMD.decider({ source: { w: Z.w, h: Z.h }, cadence: A.cadA, scenes: A.scenes }, { rw, rh }, { ...R, fond: R.fond === "auto" ? undefined : R.fond, generateur: kg ? "kaggle" : E.generateur ? "migan" : "aucun", plafond: zero ? AP.plafondZero : AP.plafond, scenes: R.scenes });
    E.zero = zero ? (D.taille.zero != null ? D.taille : { W: D.taille.W, H: D.taille.H, zero: FMM.placementZero(Z.w, Z.h, D.taille.W, D.taille.H).exact, raison: "résolution choisie à la main" }) : null;
    E.plans = D.plans; E.At = At; E.sortie = D.taille; const ap = AP.apercu / Math.min(D.taille.W, D.taille.H); E.apercu = ap >= 1 ? { W: D.taille.W, H: D.taille.H } : { W: pair(D.taille.W * ap), H: pair(D.taille.H * ap) };
    E.plans.forEach((p, i) => { p.cle = [p.methode, p.z, p.fond, p.portee.toFixed(3), rw, rh, (R.scenes[i] || {}).graine || 0].join("|"); p.opt = E.opts[i] || (E.opts[i] = { plume: 1, lumiere: true }) });
    return D;
  }

  /* ================= 2 bis. Fidèle : conversion SANS GÉNÉRATION (format-fidele.js) =================
     Toute l'image filmée est gardée. Seuls les pixels réels sont utilisés : déformation alignée sur l'axe, visages et corps copiés
     pixel pour pixel, fond étiré sous le seuil de perception ; le reste en bandes (noires, ou flou de la vidéo elle-même si choisi).
     Aucune variante qui coupe ou déforme visiblement n'est activée sans que la personne la choisisse. */
  const pairSup = x => Math.max(2, Math.ceil(x / 2 - 1e-9) * 2);
  function tailleFidele(Zw, Zh, At, choix) {
    const As = Zw / Zh, ax = At >= As ? "x" : "y", Lp = ax === "x" ? Zh : Zw;   /* Lp : côté conservé tel quel */
    let k = 1, note = ""; if (choix && choix !== "auto") { const petit = +choix, court = ax === "x" ? (At >= 1 ? Zh : Zh * At) : (At >= 1 ? Zw / At : Zw); k = petit / court;
      if (k > 1.001) note = "agrandi " + k.toFixed(2).replace(".", ",") + " fois : la résolution augmente, mais aucun détail réel n’est récupéré (les pixels ajoutés sont interpolés)" }
    const fab = k => ax === "x" ? { H: pairSup(Zh * k), W: pairSup(Zh * k * At) } : { W: pairSup(Zw * k), H: pairSup(Zw * k / At) };
    let T = fab(k); const m = Math.max(T.W, T.H); if (m > AP.plafondZero) { k *= AP.plafondZero / m * .9999; T = fab(k); T.W = Math.min(T.W, AP.plafondZero); T.H = Math.min(T.H, AP.plafondZero); note = "réduit à " + T.W + "×" + T.H + " : l’encodeur vidéo n’accepte pas plus de " + AP.plafondZero + " px de côté" }
    return { ...T, k, ax, Lp, exact: Math.abs(k - 1) < 1e-9, note };
  }
  /* boîtes des sujets d'une scène, le long de l'axe étendu (union sur toute la scène : un sujet qui se déplace est protégé partout où il passe) */
  function boitesScene(s, ax) { const sc = E.analyse.scenes[s], B = [];
    for (const p of sc.pistes || []) { let a = 1, b = 0, pa = 1, pb = 0, n = 0; for (let j = 0; j < p.present.length; j++) if (p.present[j]) { n++;
        const x0 = p.x[j], x1 = p.x[j] + p.w[j], y0 = p.y[j], y1 = p.y[j] + p.h[j]; if (ax === "x") { a = Math.min(a, x0); b = Math.max(b, x1); pa = Math.min(pa, y0); pb = Math.max(pb, y1) } else { a = Math.min(a, y0); b = Math.max(b, y1); pa = Math.min(pa, x0); pb = Math.max(pb, x1) } }
      if (n) B.push({ a: borne(a, 0, 1), b: borne(b, 0, 1), pa, pb, classe: p.classe, poids: p.poids }) }
    for (const x of (E.ffExtra && E.ffExtra[s]) || []) B.push(x);
    return B }
  function deciderFidele() {
    const A = E.analyse, Z = E.zone, [rw, rh] = cible(), At = rw / rh, R = E.reglages, T = tailleFidele(Z.w, Z.h, At, R.resolution), ax = T.ax;
    const plein = !!R.plein && Math.abs(At / (Z.w / Z.h) - 1) > .015; if (plein) Object.assign(T, taillePlein(Z, At, ax, R.resolution));
    E.ffExtra = E.ffExtra || {}; E.ffCadre = E.ffCadre || {}; E.zero = null; E.At = At; E.sortie = { W: T.W, H: T.H }; E.fidele = T;
    const ap = AP.apercu / Math.min(T.W, T.H); E.apercu = ap >= 1 ? { W: T.W, H: T.H } : { W: pair(T.W * ap), H: pair(T.H * ap) };
    const L = ax === "x" ? Z.w : Z.h, Lp = T.Lp, Tlen = ax === "x" ? Lp * At : Lp / At;
    E.plans = A.scenes.map((sc, s) => { const rs = R.scenes[s] || {}, prof = sc.profil ? sc.profil[ax] : null, n = prof ? prof.e.length : 64, boites = boitesScene(s, ax);
      const V = FFI.variantes({ n, energie: prof && prof.e, mouvement: prof && prof.m, boites }, L, Lp, Tlen), auto = FFI.choisir(V.variantes);
      const id = rs.variante && rs.variante !== "auto" ? rs.variante : R.variante && R.variante !== "auto" ? R.variante : auto.id, v = V.variantes[id];
      const raisons = [Math.abs(Tlen - L) < 1.5 ? "La vidéo a déjà ce format : rien à adapter." : id === auto.id && (!rs.variante || rs.variante === "auto") && (!R.variante || R.variante === "auto") ? "Choix automatique : " + auto.raison + "." : "Méthode choisie à la main : " + v.nom + "."];
      const pr = boites.filter(b => FFI.PROTEGES[b.classe] != null); raisons.push(pr.length ? pr.length + " sujet(s) protégé(s) (" + [...new Set(pr.map(b => ({ visage: "visage", personne: "personne", animal: "animal" })[b.classe]))].join(", ") + ") : leurs colonnes sont copiées pixel pour pixel." : "Aucun visage, personne ni animal repéré : seuls les détails et les mouvements guident l’étirement.");
      let rec = null; if (id === "recadrage") { /* garde 1/f de la dimension perpendiculaire, centrée sur les sujets */ const f = v.f, keep = Lp / f; let c = .5, w = 0;
        for (const b of boites) { const q = (FFI.PROTEGES[b.classe] != null ? 2 : .5) * (b.poids || .5); c = (c * w + (b.pa + b.pb) / 2 * q) / (w + q); w += q }
        rec = { f, debut: Math.round(borne(c * Lp - keep / 2, 0, Lp - keep)), garde: Math.round(keep) } }
      let cadre = null, mes = v.mesures; if (plein) { rec = null; cadre = cadrer(s, v, ax, Lp, At, T); mes = { ...v.mesures, conservation: cadre.garde, remplissage: 1, plein: true, agrandissement: cadre.k, fixe: cadre.fixe, visible: v.mesures.visible };
        raisons.unshift("Plein écran : l’image remplit toute la télé ; " + (ax === "x" ? "le haut et le bas sont coupés" : "les côtés sont coupés") + " (" + Math.round((1 - cadre.garde) * 100) + " % de l’image), le cadre " + (cadre.fixe ? "reste fixe" : "suit les visages et les personnes en douceur") + ". Rien n’est inventé.") }
      return { methode: "fidele", variante: id, auto: auto.id, z: 1, plaque: false, fond: "fidele", axeExt: ax, raisons, mesures: mes, V: V.variantes, boites,
        ff: { ax, B: v.B, s: v.s, L, Lp, Tlen, rec, uniforme: id === "uniforme", cadre }, cle: ["fidele", id, rw, rh, T.W, T.H, R.bords, boites.length, plein ? "plein" + ((E.ffCadre[s] || []).length) : ""].join("|"), opt: E.opts[s] || (E.opts[s] = { plume: 1, lumiere: true }) } });
    return { plans: E.plans, taille: E.sortie };
  }
  /* Plein écran : taille de sortie « télé » (le côté conservé passe à une définition standard : agrandissement interpolé, signalé) */
  function taillePlein(Z, At, ax, choix) { const vis = ax === "x" ? Z.w / At : Z.h * At;   /* longueur perpendiculaire visible, en px de la source */
    let petit = choix && choix !== "auto" ? +choix : vis < 400 ? 720 : vis <= 1080 ? 1080 : vis <= 1440 ? 1440 : 2160; const court = At >= 1 ? "H" : "W";
    let W = At >= 1 ? pair(petit * At) : petit, H = At >= 1 ? petit : pair(petit / At); const m = Math.max(W, H); if (m > AP.plafondZero) { W = pair(W * AP.plafondZero / m); H = pair(H * AP.plafondZero / m) }
    const k = (ax === "x" ? W / Z.w : H / Z.h); return { W, H, plein: true, exact: false, k, note: k > 1.001 ? "agrandi " + k.toFixed(2).replace(".", ",") + " fois pour la télé : les pixels ajoutés sont interpolés, aucun détail réel n’est récupéré (✨ Améliorer cette vidéo peut ensuite affiner la netteté)" : "" } }
  /* cadre de la scène s : fenêtre perpendiculaire qui suit les sujets (format-fidele.js, FFI.trajectoire) */
  function cadrer(s, v, ax, Lp, At, T) {
    const A = E.analyse, sc = A.scenes[s], n = sc.n; let len = 0; for (let i = 0; i < v.s.length; i++) len += (v.B[i + 1] - v.B[i]) * v.s[i];
    const AL = ax === "x" ? T.W : T.H, PL = ax === "x" ? T.H : T.W, k = AL / len, win = Math.min(Lp, PL / k), cibles = new Array(n).fill(null), visages = new Array(n).fill(null);
    const P = (sc.pistes || []).filter(p => p.classe !== "interet" || !(sc.pistes || []).some(q => q.classe !== "interet"));
    for (const p of P) for (let j = 0; j < n; j++) { if (!p.present[j]) continue; const a = (ax === "x" ? p.y[j] : p.x[j]) * Lp, l = (ax === "x" ? p.h[j] : p.w[j]) * Lp, b = a + l, c = p.classe;
      /* où placer la fenêtre pour ce sujet : visage aux 2/5 du cadre ; corps : la tête (haut de la boîte) avec de l'air au-dessus */
      const debut = c === "visage" ? (a + b) / 2 - .4 * win : c === "personne" || c === "animal" ? (l > win ? a - .06 * win : (a + b) / 2 - .5 * win) : (a + b) / 2 - .5 * win;
      (cibles[j] = cibles[j] || []).push({ debut, poids: (p.poids || .3) * (c === "visage" ? 3 : 1) }); if (c === "visage") (visages[j] = visages[j] || []).push({ a, b }) }
    for (const f of E.ffCadre[s] || []) { const j = borne(Math.round(f.j), 0, n - 1); for (let q = Math.max(0, j - 2); q <= Math.min(n - 1, j + 2); q++) (visages[q] = visages[q] || []).push({ a: f.a, b: f.b }) }
    /* sans sujet : centre des détails (profil perpendiculaire de l'analyse) */
    const pr = sc.profil && sc.profil[ax === "x" ? "y" : "x"]; let defaut = (Lp - win) / 2; if (pr) { let t = 0, m = 0; for (let i = 0; i < pr.e.length; i++) { t += pr.e[i] + pr.m[i]; m += (pr.e[i] + pr.m[i]) * (i + .5) / pr.e.length } if (t > 0) defaut = m / t * Lp - win / 2 }
    const y = FFI.trajectoire({ n, Lp, win, cadence: A.cadA, cibles, visages, defaut }); let mn = 1e9, mx = -1e9; for (const v of y) { mn = Math.min(mn, v); mx = Math.max(mx, v) }
    return { y, win, k, garde: win / Lp, fixe: mx - mn < .5, len };
  }
  /* « ambiance » des côtés : flou gaussien (3 passes de boîte) d'une petite copie de l'image qui couvre toute la sortie, couleurs
     un peu assourdies, lissé dans le temps (aucun scintillement ; remis à zéro à chaque changement de plan), assombri vers les bords
     extérieurs, et une ombre douce le long de l'image pour la détacher. Calculé en petit : coût négligeable même en 3414×1920. */
  function ambiance(R, s, W, H, im, ax) {
    const Z = E.zone, x = R.cv.x, aw = ax === "x" ? 192 : Math.max(16, Math.round(192 * W / H)), ah = ax === "x" ? Math.max(16, Math.round(192 * H / W)) : 192;
    if (!R.amb || R.amb.width !== aw || R.amb.height !== ah) { R.amb = toile(aw, ah, true); R.ambAcc = null }
    const a = R.amb.x, kc = Math.max(aw / Z.w, ah / Z.h) * 1.08, dw = Z.w * kc, dh = Z.h * kc; a.imageSmoothingQuality = "high"; a.drawImage(R.sc, (aw - dw) / 2, (ah - dh) / 2, dw, dh);
    const id = a.getImageData(0, 0, aw, ah), d = id.data, r = Math.max(2, Math.round(Math.max(aw, ah) * .035)); flouBoite(d, aw, ah, r); flouBoite(d, aw, ah, r);
    const n = aw * ah * 4; if (!R.ambAcc || R.ambS !== s || R.ambAcc.length !== n) { R.ambAcc = Float32Array.from(d); R.ambS = s }
    const A = R.ambAcc; for (let i = 0; i < n; i += 4) { for (let c = 0; c < 3; c++) A[i + c] += .3 * (d[i + c] - A[i + c]);
      const l = .299 * A[i] + .587 * A[i + 1] + .114 * A[i + 2]; for (let c = 0; c < 3; c++) d[i + c] = (l + .75 * (A[i + c] - l)) * .86; d[i + 3] = 255 }
    a.putImageData(id, 0, 0); x.imageSmoothingQuality = "high"; x.drawImage(R.amb, .5, .5, aw - 1, ah - 1, 0, 0, W, H);
    /* assombrissement vers les bords extérieurs + ombre douce contre l'image (dessinés hors de l'image seulement) */
    const L = ax === "x" ? W : H, g1 = ax === "x" ? x.createLinearGradient(0, 0, W, 0) : x.createLinearGradient(0, 0, 0, H), sh = Math.max(4, Math.round(.012 * L)), st = v => borne(v / L, 0, 1);
    g1.addColorStop(0, "rgba(0,0,0,.42)"); if (im.a > 0) { g1.addColorStop(st(im.a - sh * 1.5), "rgba(0,0,0,.18)"); g1.addColorStop(st(im.a - 1), "rgba(0,0,0,.5)"); g1.addColorStop(st(im.a), "rgba(0,0,0,0)") }
    if (im.b < L) { g1.addColorStop(st(im.b), "rgba(0,0,0,0)"); g1.addColorStop(st(im.b + 1), "rgba(0,0,0,.5)"); g1.addColorStop(st(im.b + sh * 1.5), "rgba(0,0,0,.18)") } g1.addColorStop(1, "rgba(0,0,0,.42)");
    x.fillStyle = g1; x.fillRect(0, 0, W, H);
  }
  /* rendu Fidèle d'une image : les colonnes réelles sont posées à leur place dans la sortie (bornes entières : copie exacte à s = 1) */
  function rendreFidele(R, src, s, plan, opt, j) {
    const F = plan.ff, Z = E.zone, W = R.W, H = R.H, ax = F.ax, x = R.cv.x, e = ax === "x" ? H / E.sortie.H : W / E.sortie.W, k = E.fidele.k * e;
    x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = "source-over"; x.globalAlpha = 1; x.imageSmoothingEnabled = true; x.imageSmoothingQuality = "high";
    if (!R.sc || R.sc.width !== Z.w || R.sc.height !== Z.h) R.sc = toile(Z.w, Z.h, true);
    R.sc.x.drawImage(src, Z.x, Z.y, Z.w, Z.h, 0, 0, Z.w, Z.h);   /* une seule lecture de l'image (conversion YUV → RVB faite une fois) */
    if (F.rec) { const r = F.rec; if (ax === "x") x.drawImage(R.sc, 0, r.debut, Z.w, r.garde, 0, 0, W, H); else x.drawImage(R.sc, r.debut, 0, r.garde, Z.h, 0, 0, W, H); return { ox: 0, oy: 0, lw: W, lh: H, k: W / Z.w, exact: false, rec: true } }
    if (F.cadre) { /* plein écran : colonnes à leur place sur toute la largeur, fenêtre perpendiculaire qui suit les sujets */
      const C = F.cadre, AL = ax === "x" ? W : H, PL = ax === "x" ? H : W, kk = AL / C.len, ck = s + "|" + plan.cle + "|" + W; R.ff = R.ff || new Map(); let G = R.ff.get(ck);
      if (!G) { const D = FFI.carte(F.B, F.s, kk, 0), runs = []; for (let i = 0; i < F.s.length;) { let q = i + 1; while (q < F.s.length && Math.abs(F.s[q] - F.s[i]) < 1e-6) q++; runs.push([i, q]); i = q } G = { D, runs }; R.ff.set(ck, G) }
      const n = C.y.length, a = borne(Math.floor(j || 0), 0, n - 1), b = Math.min(n - 1, a + 1), f = borne((j || 0) - a, 0, 1), y0 = C.y[a] + (C.y[b] - C.y[a]) * f, win = PL / kk, B = F.B, D = G.D;
      x.fillStyle = "#000"; x.fillRect(0, 0, W, H);
      for (const [i, q] of G.runs) { const sa = B[i], sl = B[q] - B[i], da = D[i], dl = D[q] - D[i]; if (dl <= 0) continue; if (ax === "x") x.drawImage(R.sc, sa, y0, sl, win, da, 0, dl, H); else x.drawImage(R.sc, y0, sa, win, sl, 0, da, W, dl) }
      if (opt && opt.carte) { const prot = FFI.importance({ n: F.s.length, boites: plan.boites }).prot; for (let i = 0; i < F.s.length; i++) { const st = F.s[i] - 1, al = prot[i] ? .28 : Math.min(.6, st / .35 * .6); if (al < .02) continue;
        x.fillStyle = prot[i] ? "rgba(70,215,200," + al + ")" : "rgba(235,60,150," + al + ")"; if (ax === "x") x.fillRect(D[i], 0, D[i + 1] - D[i], H); else x.fillRect(0, D[i], W, D[i + 1] - D[i]) } }
      return { ox: 0, oy: 0, lw: W, lh: H, k: kk, exact: false, plein: { y0, win } } }
    R.ff = R.ff || new Map(); const ck = s + "|" + plan.cle + "|" + W; let G = R.ff.get(ck);
    if (!G) { const AL = ax === "x" ? W : H, PL = ax === "x" ? H : W; let len = 0; for (let i = 0; i < F.s.length; i++) len += (F.B[i + 1] - F.B[i]) * F.s[i];
      const o = Math.round((AL - k * len) / 2), op = Math.floor((PL - Math.round(F.Lp * k)) / 2), D = FFI.carte(F.B, F.s, k, o), runs = [];
      for (let i = 0; i < F.s.length;) { let j = i + 1; while (j < F.s.length && Math.abs(F.s[j] - F.s[i]) < 1e-6) j++; runs.push([i, j]); i = j }
      G = { D, o, op, pl: Math.round(F.Lp * k), runs, un: runs.filter(([i]) => F.s[i] === 1) }; R.ff.set(ck, G) }
    const { D, op, pl, runs } = G, B = F.B;
    /* côtés : « ambiance » (par défaut) = la même image, très floutée, assourdie et stable dans le temps (rien d'inventé : aucun décor,
       aucune forme nouvelle, seulement les couleurs et la lumière de l'image filmée) ; ou bandes noires */
    const plein = (ax === "x" ? D[D.length - 1] - D[0] >= W - 1 : D[D.length - 1] - D[0] >= H - 1) && pl >= (ax === "x" ? H : W) - 1;
    if (F.rec || plein) {}
    else if (E.reglages.bords !== "noir") ambiance(R, s, W, H, ax === "x" ? { a: D[0], b: D[D.length - 1] } : { a: D[0], b: D[D.length - 1] }, ax);
    else { x.fillStyle = "#000"; x.fillRect(0, 0, W, H) }
    if (F.uniforme) { if (ax === "x") x.drawImage(R.sc, 0, 0, Z.w, Z.h, D[0], op, D[D.length - 1] - D[0], pl); else x.drawImage(R.sc, 0, 0, Z.w, Z.h, op, D[0], pl, D[D.length - 1] - D[0]) }
    else for (const [i, j] of runs) { const sa = B[i], sl = B[j] - B[i], da = D[i], dl = D[j] - D[i]; if (dl <= 0) continue;
      if (ax === "x") x.drawImage(R.sc, sa, 0, sl, Z.h, da, op, dl, pl); else x.drawImage(R.sc, 0, sa, Z.w, sl, op, da, pl, dl) }
    if (opt && opt.carte) { /* carte : turquoise = copié tel quel (sujets protégés), rose = étiré (plus c'est vif, plus c'est étiré) */
      const prot = FFI.importance({ n: F.s.length, boites: plan.boites }).prot; for (let i = 0; i < F.s.length; i++) { const st = F.s[i] - 1, a = prot[i] ? .28 : Math.min(.6, st / .35 * .6); if (a < .02) continue;
        x.fillStyle = prot[i] ? "rgba(70,215,200," + a + ")" : "rgba(235,60,150," + a + ")"; if (ax === "x") x.fillRect(D[i], op, D[i + 1] - D[i], pl); else x.fillRect(op, D[i], pl, D[i + 1] - D[i]) } }
    return ax === "x" ? { ox: D[0], oy: op, lw: D[D.length - 1] - D[0], lh: pl, k, exact: Math.abs(k - 1) < 1e-9, G } : { ox: op, oy: D[0], lw: pl, lh: D[D.length - 1] - D[0], k, exact: Math.abs(k - 1) < 1e-9, G };
  }
  /* vérification d'une scène avant l'export : visages cherchés sur plusieurs images ; un visage sous une zone étirée → protégé, nouvelle décision */
  async function controlerFidele(s, onP) {
    const A = E.analyse, sc = A.scenes[s], L = E.lecteur, journal = []; let vu = 0, maxV = 1, imgs = 0, vis = true, coupes = 0; try { await VISAGE.charger() } catch (e) { vis = false }
    for (let tour = 0; tour < 2; tour++) { const plan = E.plans[s], F = plan.ff, nb = Math.min(8, sc.n), idx = []; for (let q = 0; q < nb; q++) idx.push(Math.min(L.n - 1, (sc.a0 + Math.floor((q + .5) * sc.n / nb)) * A.pasA));
      const Z = E.zone, c = toile(Z.w, Z.h, true), nouv = [], nc = []; vu = 0; maxV = 1; imgs = 0; coupes = 0;
      if (vis && !F.rec) await L.parcourir([...new Set(idx)], async (src, i) => { c.x.drawImage(src, Z.x, Z.y, Z.w, Z.h, 0, 0, Z.w, Z.h); imgs++;
        for (const f of await VISAGE.detecter(c, Z.w, Z.h, .6)) { vu++; const cp = coupe(F, f, i / A.pasA - sc.a0); if (cp) { coupes++; nc.push(cp) } const a = (F.ax === "x" ? f.x / Z.w : f.y / Z.h), b = (F.ax === "x" ? (f.x + f.w) / Z.w : (f.y + f.h) / Z.h), st = FFI.etirementSous(F.B, F.s, a, b); maxV = Math.max(maxV, st);
          if (st > 1.0005 && !F.uniforme) nouv.push({ a: borne(a, 0, 1), b: borne(b, 0, 1), pa: F.ax === "x" ? f.y / Z.h : f.x / Z.w, pb: F.ax === "x" ? (f.y + f.h) / Z.h : (f.x + f.w) / Z.w, classe: "visage", poids: 1 }) } });
      if ((!nouv.length && !nc.length) || tour === 1) break;
      if (nouv.length) { (E.ffExtra[s] = E.ffExtra[s] || []).push(...nouv); journal.push("Vérification : " + nouv.length + " visage(s) trouvé(s) sous une zone étirée → zone(s) protégée(s), nouveau calcul.") }
      if (nc.length) { (E.ffCadre[s] = E.ffCadre[s] || []).push(...nc); journal.push("Vérification : " + nc.length + " visage(s) coupé(s) par le cadre → cadre déplacé pour les garder entiers.") }
      decider() }
    const plan = E.plans[s], m = plan.mesures, pc = v => (Math.round(v * 1000) / 10).toString().replace(".", ",") + " %", C = [];
    if (m.plein) C.push({ code: "cadre", nom: "Visages entiers dans le cadre", ok: !coupes, texte: vis ? (imgs ? (coupes ? coupes + " visage(s) coupé(s)" : "aucun visage coupé") + " sur " + imgs + " image(s) vérifiée(s)" : "non vérifié") : "détecteur de visages indisponible" });
    if (m.plein) C.push({ code: "conservation", nom: "Plein écran", ok: true, info: true, texte: pc(m.conservation) + " de la hauteur gardée (" + (plan.axeExt === "x" ? "haut et bas" : "côtés") + " coupés, comme demandé), cadre " + (m.fixe ? "fixe" : "qui suit les sujets") + " ; agrandi " + m.agrandissement.toFixed(2).replace(".", ",") + " fois (interpolé)" });
    else C.push({ code: "conservation", nom: "Image filmée gardée", ok: m.conservation >= .9999, texte: m.conservation >= .9999 ? "100 % (rien n’est coupé)" : pc(m.conservation) + " seulement : " + pc(1 - m.conservation) + " coupé (recadrage choisi)" });
    C.push({ code: "invente", nom: "Contenu inventé", ok: true, texte: "aucun (seuls les pixels filmés sont utilisés)" });
    if (!plan.ff.rec) C.push({ code: "visages", nom: "Visages vérifiés", ok: maxV <= 1.0005, texte: vis ? (imgs ? vu + " visage(s) sur " + imgs + " image(s) : étirement max " + pc(maxV - 1) : "non vérifié") : "détecteur de visages indisponible" });
    if (m.etirementProtege != null) C.push({ code: "sujets", nom: "Sujets protégés", ok: m.etirementProtege <= 1.0005, texte: "étirement " + pc(m.etirementProtege - 1) });
    C.push({ code: "fond", nom: "Déformation", ok: !m.visible, texte: m.etirementMax <= 1.0005 ? "aucune" : "étirement max " + pc(m.etirementMax - 1) + " (seuil de perception " + pc(FFI.SEUILS.perception - 1) + "), sur " + pc(m.partEtiree) + " de l’image" });
    C.push({ code: "remplissage", nom: "Écran rempli", ok: true, info: true, texte: pc(m.remplissage) + (m.remplissage < .999 ? " ; le reste en " + (E.reglages.bords === "noir" ? "bandes noires" : "ambiance floue de ta propre image") : "") });
    C.push({ code: "stabilite", nom: "Stabilité dans le temps", ok: true, texte: "un seul calcul pour toute la scène : aucune ondulation possible" });
    E.qc[s] = { ok: C.every(c => c.ok), controles: C, journal, images: imgs, valeurs: { remplissage: m.remplissage, etirementMax: m.etirementMax, visages: maxV } }; return E.qc[s];
  }

  /* ================= 3. décor d'une scène ================= */
  function matrices(s) { const A = E.analyse, sc = A.scenes[s], Z = E.zone; if (!sc.Ms) sc.Ms = sc.M.map(M => FMM.matSource(M, A.aw, A.ah, Z.w, Z.h)); return sc.Ms }
  const interp = (Ms, j) => { const a = borne(Math.floor(j), 0, Ms.length - 1), b = Math.min(Ms.length - 1, a + 1), f = borne(j - a, 0, 1); if (!f || a === b) return Ms[a]; const A = Ms[a], B = Ms[b]; return [0, 1, 2, 3, 4, 5].map(k => A[k] + (B[k] - A[k]) * f) };
  const posA = (plan, j) => { const p = plan.pos; if (!p || !p.length) return 0; const a = borne(Math.floor(j), 0, p.length - 1), b = Math.min(p.length - 1, a + 1); return p[a] + (p[b] - p[a]) * borne(j - a, 0, 1) };
  async function generateurPret(onP) {   /* MI-GAN (celui d'« Effacer une zone ») : chargé à la demande, avec l'accord de téléchargement */
    if (E.generateur === false) return false;
    try { await chargerModule("effacer"); if (!ERASE.loaded()) { onP && onP("Chargement du modèle de reconstruction (28 Mo, une seule fois)…"); const v = new Uint8ClampedArray(64 * 64 * 4).fill(255), t = new Uint8Array(64 * 64); t.fill(1, 0, 64 * 8); await ERASE.infer(v, t, 64, 64) } return true }
    catch (e) { E.generateur = false; E.pourquoiSansGen = window.STUDIO && !STUDIO.granted("modele") ? "téléchargement du modèle non autorisé" : "modèle de reconstruction indisponible (" + ((e && e.message) || e) + ")"; return false }
  }
  /* bâtit le décor de la scène s pour une sortie W×H. Renvoie null si la scène n'en a pas besoin. */
  /* garde-fou : un visage apparu dans une zone inventée est retiré (le modèle n'a pas à inventer des gens). src : toile à analyser ;
     couche : toile de la couche inventée (même repère, éventuellement plus grande) ; invente(cx, cy) : le point (repère src) est-il inventé ? */
  async function retirerVisages(src, couche, invente) { let n = 0; const k = couche.width / src.width;
    try { for (const f of await VISAGE.detecter(src, src.width, src.height, .7)) { const cx = Math.round(f.x + f.w / 2), cy = Math.round(f.y + f.h / 2); if (cx < 0 || cy < 0 || cx >= src.width || cy >= src.height || !invente(cx, cy)) continue; n++; couche.x.clearRect((f.x - f.w * .4) * k, (f.y - f.h * .4) * k, f.w * 1.8 * k, f.h * 1.8 * k) } } catch (e) {}
    return n }
  const b64blob = (b, type) => { const s = atob(b), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return new Blob([u], { type }) };
  const enPng = cv => new Promise((ok, ko) => cv.toBlob(b => b ? ok(b) : ko(new Error("image impossible à préparer")), "image/png"));
  /* v8.4 Zéro perte : reconstruction COMPLÈTE du décor des scènes sur le serveur gratuit (Kaggle, serveur-ia/extension_kaggle.py).
     Seuls les décors de scène partent (images fixes : pixels réels + trous), jamais la vidéo ; une seule fois par scène et par réglage.
     En cas de refus ou d'échec : le téléphone reconstruit ce qu'il peut (portée de MI-GAN), le reste en prolongement flou — l'image
     filmée reste entière dans tous les cas. */
  async function etendreServeur(onP) {
    if (!E.zero || E.kaggle === false || !window.KG || !KG.actif()) return;
    E.kgTente = E.kgTente || new Set();
    const todo = E.plans.map((p, s) => ({ p, s, cle: s + "|" + p.cle })).filter(o => o.p.plaque && o.p.fond === "genere" && o.p.generateur === "kaggle" && !E.couches.has(o.cle) && !E.kgTente.has(o.cle));
    if (!todo.length) return;
    const refus = r => { E.kaggle = false; E.kaggleNote = r; decider() };
    if (!(window.STUDIO && await STUDIO.consent("cloud"))) return refus("Décor complet sur serveur non autorisé : reconstruit sur le téléphone sur une profondeur limitée, puis prolongement flou.");
    if (!confirm("Zéro perte — reconstruction complète du décor\n\nFournisseur : Kaggle (Google), dans un espace PRIVÉ de ton compte.\nEnvoyé : uniquement le décor de " + todo.length + " scène(s) (images fixes du fond, sans la vidéo).\nModèle : Stable Diffusion XL Inpainting 0.1 (licence Open RAIL++-M), puis agrandissement Real-ESRGAN (celui de l’app).\nBut : remplir les côtés ajoutés par un vrai décor net au lieu d’un flou. Ta vidéo filmée reste intacte, pixel pour pixel.\nConservation : tout est supprimé de Kaggle dès le résultat récupéré.\nDurée : souvent 5 à 15 min (attente d’une carte graphique comprise).\n\nContinuer ?")) return refus("Envoi refusé : décor reconstruit sur le téléphone sur une profondeur limitée, puis prolongement flou.");
    const { W, H } = E.sortie, travaux = [], prep = {};
    for (const o of todo) { const plan = o.p, perp = plan.axeExt === "x" ? H : W, cote = Math.min(1024, perp), e = cote / perp, Wk = pair(W * e), Hk = pair(H * e);
      onP("Scène " + (o.s + 1) + " : préparation du décor pour le serveur…"); const { geo, fin, bes } = await plaqueScene(o.s, Wk, Hk, AP.plaqueMax, onP);
      const G = FMM.genPreparer(fin, bes, geo, plan, Wk, Hk, 99, cote); E.kgTente.add(o.cle); if (!G.couverts) continue;
      const pc = toile(G.w, G.h), tc = toile(G.w, G.h), ti = new ImageData(G.w, G.h); pc.x.putImageData(new ImageData(new Uint8ClampedArray(G.rgba), G.w, G.h), 0, 0);
      for (let i = 0; i < G.w * G.h; i++) { const v = G.trou[i] ? 255 : 0; ti.data[i * 4] = ti.data[i * 4 + 1] = ti.data[i * 4 + 2] = v; ti.data[i * 4 + 3] = 255 } tc.x.putImageData(ti, 0, 0);
      const id = travaux.length; prep[id] = { s: o.s, cle: o.cle, geo, G: { w: G.w, h: G.h, aFaire: G.aFaire, couverts: G.couverts }, src: pc };
      travaux.push({ id, w: G.w, h: G.h, fenetres: G.fenetres, echelle: +(perp / cote).toFixed(4), plaque: await enPng(pc), trou: await enPng(tc) }) }
    if (!travaux.length) return;
    let info; try { info = await KG.etendre({ travaux, graine: 7 + ((E.reglages.scenes[todo[0].s] || {}).graine || 0) }, (et, f, t) => onP(t, f)) }
    catch (e) { return refus("Serveur indisponible (" + ((e && e.message) || e) + ") : décor reconstruit sur le téléphone sur une profondeur limitée, puis prolongement flou.") }
    let recus = 0;
    for (const t of info.travaux || []) { const p = prep[t.id]; if (!p || !t.pixels || !t.jpeg) continue;
      const rgb = await createImageBitmap(b64blob(t.jpeg, "image/jpeg")), al = await createImageBitmap(b64blob(t.alpha, "image/png")), a = toile(t.w, t.h, true), b = toile(t.w, t.h, true);
      a.x.drawImage(rgb, 0, 0); b.x.drawImage(al, 0, 0); const da = a.x.getImageData(0, 0, t.w, t.h), db = b.x.getImageData(0, 0, t.w, t.h).data; for (let i = 0; i < t.w * t.h; i++) da.data[i * 4 + 3] = db[i * 4]; a.x.putImageData(da, 0, 0);
      const gc = toile(t.W, t.H, true); gc.x.drawImage(a, t.x, t.y); const k = p.G.w / t.W, comp = toile(p.G.w, p.G.h, true); comp.x.drawImage(p.src, 0, 0); comp.x.drawImage(gc, 0, 0, p.G.w, p.G.h);
      const visages = await retirerVisages(comp, gc, (cx, cy) => { const X = Math.round(cx / k) - t.x, Y = Math.round(cy / k) - t.y; return X >= 0 && Y >= 0 && X < t.w && Y < t.h && db[(Y * t.w + X) * 4] > 127 });
      E.couches.set(p.cle, { cv: gc, x: p.geo.x0 / p.geo.k, y: p.geo.y0 / p.geo.k, w: p.geo.w / p.geo.k, h: p.geo.h / p.geo.k, pixels: t.pixels, total: p.G.aFaire, couverts: p.G.couverts, serveur: true, visages }); recus++ }
    if (recus < travaux.length) E.kaggleNote = "Serveur : " + (travaux.length - recus) + " décor(s) non reconstruit(s)" + (info.erreurs && info.erreurs.length ? " (" + info.erreurs[0] + ")" : info.repli ? " (" + info.repli + ")" : "") + " → reconstruits sur le téléphone sur une profondeur limitée.";
    onP("Décor complet reçu du serveur (" + recus + " scène(s), " + info.minutes + " min).");
  }
  /* décor réel de la scène s (mosaïque des images, à la définition de la sortie W×H) : { geo, fin, bes } */
  async function plaqueScene(s, W, H, maxPx, onP) {
    const A = E.analyse, sc = A.scenes[s], plan = E.plans[s], Z = E.zone, L = E.lecteur;
    const Ms = matrices(s), P = FMM.plaqueCreer(Ms, plan, Z.w, Z.h, W, H, maxPx); if (sc.mos) FMM.plaqueReference(P, sc.mos, A.aw, A.ah, Z.w, Z.h);
    /* images à lire : plus la caméra bouge, plus il en faut ; sur pied, quelques-unes suffisent (elles servent seulement de contexte) */
    const max = sc.verrou ? 4 : AP.echantillons, choix = []; { let acc = 1e9, der = -1e9; const pasT = sc.n / max; for (let j = 0; j < sc.n; j++) { if (j) { const m = sc.M[j], q = sc.M[j - 1]; acc += Math.hypot((m[2] - q[2]) / A.aw, (m[5] - q[5]) / A.ah) + Math.abs(m[0] - q[0]) } if (acc >= .025 || j - der >= pasT) { choix.push(j); acc = 0; der = j } }
      while (choix.length > max) { for (let k = choix.length - 2; k > 0; k -= 2) choix.splice(k, 1) } }
    const pc = toile(P.w, P.h, true); let fait = 0;
    await L.parcourir(choix.map(j => Math.min(L.n - 1, (sc.a0 + j) * A.pasA)), async (src, i) => { const j = choix[fait], B = FMM.versPlaque(P, Ms[j]);
      pc.x.setTransform(1, 0, 0, 1, 0, 0); pc.x.clearRect(0, 0, P.w, P.h); pc.x.setTransform(...FMM.versCanvas(B)); pc.x.imageSmoothingQuality = "high"; pc.x.drawImage(src, Z.x, Z.y, Z.w, Z.h, 0, 0, Z.w, Z.h);
      FMM.plaqueAccumuler(P, pc.x.getImageData(0, 0, P.w, P.h).data, B, Z.w, Z.h); fait++; onP && onP("Scène " + (s + 1) + " : décor " + Math.round(100 * fait / choix.length) + " %"); await souffler() });
    const geo = { k: P.k, x0: P.x0, y0: P.y0, w: P.w, h: P.h }, fin = FMM.plaqueFinir(P), bes = FMM.besoin(geo, Ms, plan, Z.w, Z.h, W, H, 4);
    return { geo, fin, bes };
  }
  /* bâtit le décor de la scène s pour une sortie W×H. Renvoie null si la scène n'en a pas besoin. */
  async function construireDecor(s, W, H, maxPx, onP) {
    const plan = E.plans[s]; if (!plan.plaque || plan.z === 1) return null;
    const { geo, fin, bes } = await plaqueScene(s, W, H, maxPx, onP);
    /* Zéro perte + serveur : la couche complète vient de Kaggle (etendreServeur) ; tant qu'elle manque, le modèle du téléphone remplit
       ce qu'il sait faire (sa propre portée), rangé sous une autre clé pour ne pas être pris pour la couche du serveur */
    const cleS = s + "|" + plan.cle, kgSans = plan.generateur === "kaggle" && !E.couches.has(cleS), cle = kgSans ? cleS + "|local" : cleS;
    const portee = plan.fond === "genere" ? (kgSans ? plan.portee * FMD.PORTEE.migan / FMD.PORTEE.kaggle : plan.portee) : 0;
    const G = FMM.genPreparer(fin, bes, geo, plan, W, H, portee, [512, 448, 576, 480][((E.reglages.scenes[s] || {}).graine || 0) % 4]), plume = FMM.plumeReel(G, plan.fond === "genere" ? 6 : 14);
    /* reconstruction : une seule fois par scène et par réglage ; la même couche sert à l'aperçu et à l'export (ce qu'on voit est ce qu'on obtient) */
    let gen = E.couches.get(cle) || null; const journal = [];
    if (gen && gen.serveur) journal.push("Décor complet reconstruit sur le serveur (" + Math.round(gen.pixels / 1e3) + " k pixels inventés, raccord de couleur et netteté recalés sur le réel).");
    if (plan.fond === "genere" && !gen && G.couverts > 0) {
      if (await generateurPret(onP)) { let k = 0; for (const f of G.fenetres) { const e = FMM.genEntree(G, f); k++; if (!e.utiles) continue; onP && onP("Scène " + (s + 1) + " : reconstruction du décor (" + k + "/" + G.fenetres.length + ")…"); await souffler(); FMM.genPoser(G, f, await ERASE.infer(e.rgba, e.trou, f.w, f.h)); if (E.stop) throw new Annule() }
        const g = FMM.genFinir(G), gc = toile(G.w, G.h, true); gc.x.putImageData(new ImageData(g.rgba, G.w, G.h), 0, 0);
        /* garde-fou : un visage apparu dans une zone inventée est retiré (le modèle n'a pas à inventer des gens) */
        const tc = toile(G.w, G.h, true); tc.x.putImageData(new ImageData(new Uint8ClampedArray(G.rgba), G.w, G.h), 0, 0); const visages = await retirerVisages(tc, gc, (cx, cy) => G.invente[cy * G.w + cx]);
        if (visages) journal.push("Contrôle : " + visages + " visage(s) apparu(s) dans la zone inventée → retiré(s) (remplacé(s) par le prolongement flou).");
        gen = { cv: gc, x: geo.x0 / geo.k, y: geo.y0 / geo.k, w: geo.w / geo.k, h: geo.h / geo.k, pixels: g.pixels, total: G.aFaire, couverts: G.couverts }; E.couches.set(cle, gen) }
      else journal.push("Reconstruction impossible (" + (E.pourquoiSansGen || "modèle indisponible") + ") : le décor retrouvé et le prolongement flou sont utilisés.") }
    /* assemblage : inventé dessous, réel (bord fondu) dessus */
    const cv = toile(geo.w, geo.h), rc = toile(geo.w, geo.h), al = toile(G.w, G.h), ad = new ImageData(G.w, G.h); for (let i = 0; i < plume.length; i++) { ad.data[i * 4 + 3] = plume[i] } al.x.putImageData(ad, 0, 0);
    rc.x.putImageData(new ImageData(fin.rgba, geo.w, geo.h), 0, 0); rc.x.globalCompositeOperation = "destination-in"; rc.x.imageSmoothingQuality = "high"; rc.x.drawImage(al, 0, 0, geo.w, geo.h); rc.x.globalCompositeOperation = "source-over";
    cv.x.imageSmoothingQuality = "high"; if (gen) cv.x.drawImage(gen.cv, (gen.x * geo.k - geo.x0), (gen.y * geo.k - geo.y0), gen.w * geo.k, gen.h * geo.k); cv.x.drawImage(rc, 0, 0);
    /* carte : rose = inventé, turquoise = retrouvé dans d'autres images */
    const carte = toile(G.w, G.h), cd = new ImageData(G.w, G.h); let nr = 0, ni = 0, nb = 0; let gd = null, memeG = false; if (gen) { const gg = toile(G.w, G.h, true); gg.x.drawImage(gen.cv, 0, 0, G.w, G.h); gd = gg.x.getImageData(0, 0, G.w, G.h).data; memeG = true }
    for (let i = 0; i < G.w * G.h; i++) { const bx = Math.min(bes.w - 1, Math.floor((i % G.w + .5) / G.e / bes.q)), by = Math.min(bes.h - 1, Math.floor((Math.floor(i / G.w) + .5) / G.e / bes.q)); if (!bes.carte[by * bes.w + bx]) continue; nb++;
      if (plume[i] > 127) { nr++; cd.data.set([70, 215, 200, 105], i * 4) } else if (memeG && gd[i * 4 + 3] > 127) { ni++; cd.data.set([235, 60, 150, 120], i * 4) } }
    carte.x.putImageData(cd, 0, 0);
    if (kgSans && E.kaggleNote) journal.push(E.kaggleNote);
    return { geo, cv, carte, gen, journal, parts: nb ? { reel: nr / nb, invente: ni / nb, flou: Math.max(0, 1 - (nr + ni) / nb) } : { reel: 0, invente: 0, flou: 1 }, cle: plan.cle, W, H };
  }

  /* ================= 4. rendu d'une image ================= */
  function rendu(W, H) { return { W, H, cv: toile(W, H), tmp: toile(W, H), am: toile(96, Math.max(8, Math.round(96 * H / W)), true), g1: toile(48, Math.max(4, Math.round(48 * H / W)), true), g2: toile(48, Math.max(4, Math.round(48 * H / W)), true), gain: null, gs: -1 } }
  function flouBoite(d, w, h, r) { const t = new Float32Array(w * h), k = 2 * r + 1; for (let c = 0; c < 3; c++) for (let tour = 0; tour < 2; tour++) {
      for (let y = 0; y < h; y++) { let a = 0; for (let x = -r; x <= r; x++) a += d[(y * w + borne(x, 0, w - 1)) * 4 + c]; for (let x = 0; x < w; x++) { t[y * w + x] = a / k; a += d[(y * w + Math.min(w - 1, x + r + 1)) * 4 + c] - d[(y * w + Math.max(0, x - r)) * 4 + c] } }
      for (let x = 0; x < w; x++) { let a = 0; for (let y = -r; y <= r; y++) a += t[borne(y, 0, h - 1) * w + x]; for (let y = 0; y < h; y++) { d[(y * w + x) * 4 + c] = a / k; a += t[Math.min(h - 1, y + r + 1) * w + x] - t[Math.max(0, y - r) * w + x] } } } }
  /* src : image de la vidéo (orientation d'affichage) ; s : scène ; j : position dans la scène, en images d'analyse (peut être fractionnaire) ; decor : construireDecor() ou null */
  function rendre(R, src, s, j, decor, opt) {
    if (E.plans[s].methode === "fidele") return rendreFidele(R, src, s, E.plans[s], opt, j);
    const A = E.analyse, plan = E.plans[s], Z = E.zone, W = R.W, H = R.H, x = R.cv.x, c = FMM.cadre({ ...plan, pos: [posA(plan, j)] }, 0, Z.w, Z.h, W, H);
    x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = "source-over"; x.globalAlpha = 1; x.imageSmoothingEnabled = true; x.imageSmoothingQuality = "high";
    const ext = plan.methode !== "identique" && plan.z < 1;
    if (!ext) { x.drawImage(src, Z.x, Z.y, Z.w, Z.h, c.ox, c.oy, c.lw, c.lh); return c }
    if (plan.fond === "noir") { x.fillStyle = "#000"; x.fillRect(0, 0, W, H); x.drawImage(src, Z.x, Z.y, Z.w, Z.h, c.ox, c.oy, c.lw, c.lh); return c }
    /* a) prolongement flou de l'image (remplit tout ; ce qui est net vient se poser dessus) */
    { const a = R.am, kc = Math.max(W / Z.w, H / Z.h) * 1.06, dw = Z.w * kc * a.width / W, dh = Z.h * kc * a.height / H; a.x.drawImage(src, Z.x, Z.y, Z.w, Z.h, (a.width - dw) / 2, (a.height - dh) / 2, dw, dh);
      const id = a.x.getImageData(0, 0, a.width, a.height); flouBoite(id.data, a.width, a.height, Math.max(2, Math.round(a.width * .05))); a.x.putImageData(id, 0, 0);
      x.drawImage(a, .5, .5, a.width - 1, a.height - 1, 0, 0, W, H); x.fillStyle = "rgba(0,0,0,.16)"; x.fillRect(0, 0, W, H) }
    /* b) décor de la scène, posé selon le mouvement de la caméra, à la lumière de l'image en cours */
    if (decor) { const Ms = matrices(s), Mj = interp(Ms, j), g = decor.geo, e = W / decor.W, T = FMM.versSortie(g, Mj, { k: c.k / e, ox: c.ox / e, oy: c.oy / e }), TS = FMM.mul(FMM.ech(e, e), T), t = R.tmp.x;
      let gain = null;
      if (plan.opt.lumiere && !A.scenes[s].verrou) { const q = R.g1.width / W, a = R.g1.x, b = R.g2.x; a.setTransform(1, 0, 0, 1, 0, 0); a.clearRect(0, 0, R.g1.width, R.g1.height); a.drawImage(src, Z.x, Z.y, Z.w, Z.h, c.ox * q, c.oy * q, c.lw * q, c.lh * q);
        b.setTransform(1, 0, 0, 1, 0, 0); b.clearRect(0, 0, R.g2.width, R.g2.height); b.setTransform(...FMM.versCanvas(FMM.mul(FMM.ech(q, q), TS))); b.drawImage(decor.cv, 0, 0); b.setTransform(1, 0, 0, 1, 0, 0);
        const n = R.g1.width * R.g1.height, gi = FMM.gain(a.getImageData(0, 0, R.g1.width, R.g1.height).data, b.getImageData(0, 0, R.g2.width, R.g2.height).data, n);
        if (gi) { R.gain = R.gs === s && R.gain ? R.gain.map((v, k) => v + .3 * (gi[k] - v)) : gi; R.gs = s; if (Math.max(...R.gain.map(v => Math.abs(v - 1))) > .012) gain = R.gain } }
      t.setTransform(1, 0, 0, 1, 0, 0); t.globalCompositeOperation = "source-over"; t.clearRect(0, 0, W, H); t.imageSmoothingQuality = "high"; t.setTransform(...FMM.versCanvas(TS)); t.drawImage(decor.cv, 0, 0);
      if (gain) { /* gain par couleur : < 1 par « multiply », > 1 par « color-dodge » (résultat = fond / (1 − c)) ; puis on redécoupe à la forme du décor */
        t.setTransform(1, 0, 0, 1, 0, 0); const bas = gain.map(v => Math.round(255 * Math.min(1, v))), haut = gain.map(v => Math.round(255 * (v > 1 ? 1 - 1 / v : 0)));
        if (bas.some(v => v < 255)) { t.globalCompositeOperation = "multiply"; t.fillStyle = "rgb(" + bas + ")"; t.fillRect(0, 0, W, H) }
        if (haut.some(v => v > 0)) { t.globalCompositeOperation = "color-dodge"; t.fillStyle = "rgb(" + haut + ")"; t.fillRect(0, 0, W, H) }
        t.globalCompositeOperation = "destination-in"; t.setTransform(...FMM.versCanvas(TS)); t.drawImage(decor.cv, 0, 0); t.globalCompositeOperation = "source-over" }
      t.setTransform(1, 0, 0, 1, 0, 0); x.drawImage(R.tmp, 0, 0);
      if (opt && opt.carte) { x.setTransform(...FMM.versCanvas(TS)); x.imageSmoothingEnabled = false; x.drawImage(decor.carte, 0, 0, g.w, g.h); x.setTransform(1, 0, 0, 1, 0, 0); x.imageSmoothingEnabled = true } }
    /* c) Zéro perte : l'image d'origine est posée telle quelle, entièrement opaque (aucun pixel fondu ni recouvert) */
    if (plan.zero) { /* raccord SANS toucher l'image : son bord est reflété (miroir) sur quelques pixels du côté ajouté, en fondu vers le décor */
      const pl = Math.max(3, Math.round(.006 * Math.max(W, H) * (plan.opt.plume || 1))), ps = Math.max(1, Math.min(pl / c.k, (plan.axeExt === "x" ? Z.w : Z.h) / 4)), t = R.tmp.x, ax = plan.axeExt === "x";
      t.setTransform(1, 0, 0, 1, 0, 0); t.globalCompositeOperation = "source-over"; t.clearRect(0, 0, W, H);
      if (ax) { t.setTransform(-1, 0, 0, 1, c.ox, 0); t.drawImage(src, Z.x, Z.y, ps, Z.h, 0, c.oy, pl, c.lh); t.setTransform(-1, 0, 0, 1, c.ox + c.lw, 0); t.drawImage(src, Z.x + Z.w - ps, Z.y, ps, Z.h, -pl, c.oy, pl, c.lh) }
      else { t.setTransform(1, 0, 0, -1, 0, c.oy); t.drawImage(src, Z.x, Z.y, Z.w, ps, c.ox, 0, c.lw, pl); t.setTransform(1, 0, 0, -1, 0, c.oy + c.lh); t.drawImage(src, Z.x, Z.y + Z.h - ps, Z.w, ps, c.ox, -pl, c.lw, pl) }
      t.setTransform(1, 0, 0, 1, 0, 0); const L0 = ax ? W : H, a0 = ax ? c.ox : c.oy, a1 = a0 + (ax ? c.lw : c.lh), g = ax ? t.createLinearGradient(0, 0, W, 0) : t.createLinearGradient(0, 0, 0, H), st = v => borne(v / L0, 0, 1);
      g.addColorStop(st(a0 - pl), "rgba(0,0,0,0)"); g.addColorStop(st(a0 - pl * .5), "rgba(0,0,0,.5)"); g.addColorStop(st(a0), "rgba(0,0,0,.92)"); g.addColorStop(st(a1), "rgba(0,0,0,.92)"); g.addColorStop(st(a1 + pl * .5), "rgba(0,0,0,.5)"); g.addColorStop(st(a1 + pl), "rgba(0,0,0,0)");
      t.globalCompositeOperation = "destination-in"; t.fillStyle = g; t.fillRect(0, 0, W, H); t.globalCompositeOperation = "source-over"; x.drawImage(R.tmp, 0, 0);
      x.drawImage(src, Z.x, Z.y, Z.w, Z.h, c.ox, c.oy, c.lw, c.lh); return c }
    /* c) l'image d'origine, intacte ; seul un liseré de quelques pixels est fondu avec le décor, du côté ajouté */
    const pl = Math.max(decor ? 3 : 2, Math.round((decor ? .005 : .002) * Math.max(W, H) * (plan.opt.plume || 1))), t = R.tmp.x;
    t.setTransform(1, 0, 0, 1, 0, 0); t.globalCompositeOperation = "source-over"; t.clearRect(0, 0, W, H); t.drawImage(src, Z.x, Z.y, Z.w, Z.h, c.ox, c.oy, c.lw, c.lh); t.globalCompositeOperation = "destination-out";
    const fondu = (x0, y0, x1, y1, rx, ry, rw, rh) => { const g = t.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, "rgba(0,0,0,1)"); g.addColorStop(1, "rgba(0,0,0,0)"); t.fillStyle = g; t.fillRect(rx, ry, rw, rh) };
    if (plan.axeExt === "x") { fondu(c.ox, 0, c.ox + pl, 0, c.ox - 1, 0, pl + 1, H); fondu(c.ox + c.lw, 0, c.ox + c.lw - pl, 0, c.ox + c.lw - pl, 0, pl + 1, H) }
    else { fondu(0, c.oy, 0, c.oy + pl, 0, c.oy - 1, W, pl + 1); fondu(0, c.oy + c.lh, 0, c.oy + c.lh - pl, 0, c.oy + c.lh - pl, W, pl + 1) }
    t.globalCompositeOperation = "source-over"; x.drawImage(R.tmp, 0, 0); return c;
  }
  const sceneDe = i => { const A = E.analyse, a = Math.floor(i / A.pasA); let s = 0; while (s < A.scenes.length - 1 && a >= A.scenes[s].a1) s++; return s };
  const posDans = (s, i) => i / E.analyse.pasA - E.analyse.scenes[s].a0;

  /* ================= 5. contrôle qualité d'une scène (sur l'aperçu), avec corrections ================= */
  async function controler(s, onP) {
    if (E.plans[s].methode === "fidele") return controlerFidele(s, onP);
    const A = E.analyse, sc = A.scenes[s], L = E.lecteur, R = E.rApercu, qw = 192, qh = Math.max(8, Math.round(192 * R.H / R.W)), qc = toile(qw, qh, true), journal = [];
    for (let tour = 0; tour < 3; tour++) {
      let plan = E.plans[s], decor = E.decors.get(s);
      if (plan.plaque && plan.z < 1 && (!decor || decor.cle !== plan.cle)) { decor = await construireDecor(s, R.W, R.H, AP.plaqueMax / 3, onP); E.decors.set(s, decor); if (decor) journal.push(...decor.journal) }
      /* le modèle de reconstruction n'a pas pu être chargé : on redécide sans lui (la fiche ne doit pas annoncer un décor reconstruit qui n'existe pas) */
      if (E.generateur === false && plan.fond === "genere") { decider(); plan = E.plans[s]; decor = null; E.decors.delete(s); if (plan.plaque && plan.z < 1) { decor = await construireDecor(s, R.W, R.H, AP.plaqueMax / 3, onP); E.decors.set(s, decor) } }
      if (!plan.plaque) E.decors.delete(s);
      const M = []; if (plan.methode !== "identique" && plan.z < 1 && plan.fond !== "noir") { const lots = sc.n >= 16 ? [Math.floor(sc.n * .25), Math.floor(sc.n * .7)] : [0], idx = []; for (const d of lots) for (let k = 0; k < Math.min(6, sc.n - d); k++) idx.push(d + k);
        let gp = null, prec = -9; await L.parcourir(idx.map(j => Math.min(L.n - 1, (sc.a0 + j) * A.pasA)), async (src, i) => { const j = posDans(s, i), c = rendre(R, src, s, j, plan.plaque ? decor : null); qc.x.drawImage(R.cv, 0, 0, qw, qh);
          const g = FMQ.luminance(qc.x.getImageData(0, 0, qw, qh).data, qw * qh), e = qw / R.W, z = { x0: Math.max(0, c.ox * e), y0: Math.max(0, c.oy * e), x1: Math.min(qw, (c.ox + c.lw) * e), y1: Math.min(qh, (c.oy + c.lh) * e) };
          M.push(FMQ.mesurer(g, j - prec <= 1.01 ? gp : null, qw, qh, z, plan.axeExt)); gp = g; prec = j }) }
      const B = FMQ.bilan(M, plan, A.cadA); E.qc[s] = { ...B, journal, images: M.length };
      if (B.ok || !B.action || tour === 2 || (!plan.plaque && B.action !== "adoucir")) break;
      const rs = E.reglages.scenes[s] = E.reglages.scenes[s] || {}, ko = B.controles.filter(c => !c.ok).map(c => c.nom + " (" + c.texte + ")").join(" ; ");
      if (B.action === "ambiance" || (tour === 1 && (B.action === "plume" || B.action === "lumiere"))) { rs.fond = "ambiance"; rs.qc = true; journal.push("Contrôle non satisfait — " + ko + " → retour au prolongement flou, plus fidèle."); decider() }
      else if (B.action === "plume" || B.action === "lumiere") { plan.opt.plume = 2.5; journal.push("Contrôle non satisfait — " + ko + " → raccord élargi, nouvelle mesure.") }
      else if (B.action === "adoucir") { rs.lissage = (rs.lissage || 1) * 1.8; journal.push("Contrôle non satisfait — " + ko + " → suivi du sujet adouci."); decider() }
    }
    return E.qc[s];
  }
  async function preparer(onP) {   /* décors d'aperçu + contrôle de toutes les scènes */
    E.rApercu = rendu(E.apercu.W, E.apercu.H); E.qc = []; await etendreServeur(onP); const n = E.analyse.scenes.length;
    for (let s = 0; s < n; s++) { onP("Préparation de la scène " + (s + 1) + " sur " + n + "…", s / n); await controler(s, t => onP(t, s / n)); await souffler() }
  }

  /* ================= 6. export ================= */
  const DEBIT = { zero: [.4, .28], max: [.16, .11], haute: [.11, .075], standard: [.07, .05] };   /* bits par pixel et par image : [H.264, HEVC] */
  async function exporter(onP) {
    if (!window.VideoEncoder || !window.Mp4Muxer) throw new Error("la création de vidéo n’est pas disponible sur cet appareil (mets iOS à jour)");
    const A = E.analyse, L = E.lecteur, R0 = E.reglages, t0 = performance.now(); let { W, H } = E.sortie;
    /* cadence : celle d'origine (horodatages d'origine conservés, même irréguliers) ; un choix plus bas retire des images, jamais l'inverse */
    const fc = R0.cadence === "origine" ? 0 : +R0.cadence, garde = []; { let der = -1; for (let i = 0; i < L.n; i++) { if (fc && fc < L.cadence - .5) { const q = Math.floor(L.tps[i] * fc + 1e-6); if (q === der) continue; der = q } garde.push(i) } }
    const cad = fc && fc < L.cadence - .5 ? fc : L.cadence, db = E.zero || E.fidele ? DEBIT.zero : DEBIT[R0.qualite] || DEBIT.haute;   /* Zéro perte : débit le plus haut (perte de compression la plus faible possible) */
    let cfg = vcfg(false, W, H, cad, Math.round(W * H * cad * db[0])); try { const hv = vcfg(true, W, H, cad, Math.round(W * H * cad * db[1])); if (localStorage.getItem("nohevc") !== "1" && (await VideoEncoder.isConfigSupported(hv)).supported) cfg = hv } catch (e) {}
    /* Zéro perte : encodage « à quantification fixe » très fine quand l'appareil le permet (qualité constante, la perte de compression
       la plus faible possible), sinon le débit le plus haut */
    let qp = null; if (E.zero || E.fidele) for (const c of [{ ...cfg, bitrateMode: "quantizer" }, { ...vcfg(false, W, H, cad, cfg.bitrate), bitrateMode: "quantizer" }]) { try { if ((await VideoEncoder.isConfigSupported(c)).supported) { cfg = c; qp = c.codec.startsWith("hvc") ? 12 : 10; break } } catch (e) {} }
    if (!(await VideoEncoder.isConfigSupported(cfg)).supported) { /* repli : Full HD */ const k = 1920 / Math.max(W, H); if (k < 1) { W = pair(W * k); H = pair(H * k); cfg = vcfg(false, W, H, cad, Math.round(W * H * cad * db[0])) } if (!(await VideoEncoder.isConfigSupported(cfg)).supported) throw new Error("l’encodeur de cet appareil refuse ce format (" + W + "×" + H + ")") }
    /* son : copie exacte de la piste d'origine quand c'est de l'AAC (aucune perte, aucun décalage) ; sinon réencodage ; sinon vidéo muette, et on le dit */
    let rawA = null, acfg = null, ab = null, sonNote = ""; try { rawA = await demuxAudio(E.file) } catch (e) {}
    if (!rawA && window.AudioEncoder && E.file.size < 350 * 1048576) { try { const ctx = new (window.AudioContext || window.webkitAudioContext)(); ab = await ctx.decodeAudioData(await E.file.arrayBuffer()); ctx.close(); acfg = await audioCfg(ab.sampleRate, ab.numberOfChannels, 160000); if (!acfg) { ab = null; sonNote = "son non réencodable sur cet appareil" } } catch (e) { ab = null; sonNote = E.aSon === false ? "" : "pas de son lisible dans la vidéo d’origine" } }
    const son = !!(rawA || acfg), mt = memTarget(), mx = new Mp4Muxer.Muxer({ target: mt.target, fastStart: false, firstTimestampBehavior: "offset", video: { codec: cfg.codec.startsWith("hvc") ? "hevc" : "avc", width: W, height: H },
      ...(son ? { audio: rawA ? { codec: "aac", numberOfChannels: rawA.ch, sampleRate: rawA.sr } : { codec: acfg.codec === "opus" ? "opus" : "aac", numberOfChannels: acfg.numberOfChannels, sampleRate: acfg.sampleRate } } : {}) });
    let err = null; const enc = new VideoEncoder({ output: (c, m) => { try { mx.addVideoChunk(c, m) } catch (e) { err = e } }, error: e => { err = e } }); enc.configure(cfg);
    const zeros = [], Z = E.zone, perteExport = E.zero && (W !== E.sortie.W || H !== E.sortie.H) ? "l’encodeur de cet appareil refuse " + E.sortie.W + "×" + E.sortie.H + " : réduit en " + W + "×" + H : ""; let zc = null, zq = 0;
    /* Fidèle : contrôle IMAGE PAR IMAGE (visages sous une zone étirée, copie exacte des colonnes non étirées, stabilité) */
    const FV = E.fidele ? { images: 0, visages: 0, max: 1, violations: [], coupes: [], ident: [], dO: 0, dS: 0, vis: false, pc: toile(64, 64, true), ps: toile(64, 64, true), po: null, pz: null } : null;
    if (FV) { try { await VISAGE.charger(); FV.vis = true } catch (e) {} if (W !== E.sortie.W || H !== E.sortie.H) FV.perte = "l’encodeur de cet appareil refuse " + E.sortie.W + "×" + E.sortie.H + " : réduit en " + W + "×" + H }
    const R = rendu(W, H), qw = 192, qh = Math.max(8, Math.round(192 * H / W)), qc = toile(qw, qh, true), mesures = A.scenes.map(() => []); let decor = null, sCour = -1, gp = null, nq = 0, fait = 0, cle = 0;
    try {
      /* scène par scène : le décor de la scène est bâti à la définition de sortie, utilisé, puis libéré */
      let k = 0; while (k < garde.length) { const s = sceneDe(garde[k]); let k1 = k; while (k1 < garde.length && sceneDe(garde[k1]) === s) k1++;
        const plan = E.plans[s]; decor = null; if (plan.plaque && plan.z < 1) decor = await construireDecor(s, W, H, AP.plaqueMax, t => onP(t, fait / garde.length));
        R.gain = null; gp = null; let prem = true;
        await L.parcourir(garde.slice(k, k1), async (src, i) => { if (err) throw err; const j = posDans(s, i), c = rendre(R, src, s, j, decor);
          const ts = Math.round(L.tps[i] * 1e6), nx = fait + 1 < garde.length ? L.tps[garde[fait + 1]] : L.duree, fr = new VideoFrame(R.cv, { timestamp: ts, duration: Math.max(1, Math.round((nx - L.tps[i]) * 1e6)) });
          enc.encode(fr, { keyFrame: prem || ts - cle >= 2e6, ...(qp != null ? (cfg.codec.startsWith("hvc") ? { hevc: { quantizer: qp } } : { avc: { quantizer: qp } }) : {}) }); if (prem || ts - cle >= 2e6) cle = ts; prem = false; fr.close();
          /* Zéro perte : toutes les ~12 images, l'image d'origine est relue DANS le rendu et comparée, pixel par pixel, à l'image seule */
          if (plan.zero && c.exact && zq++ % 12 === 0) { if (!zc) zc = toile(Z.w, Z.h, true); zc.x.drawImage(src, Z.x, Z.y, Z.w, Z.h, 0, 0, Z.w, Z.h);
            zeros.push(FMQ.identiques(R.cv.getContext("2d").getImageData(c.ox, c.oy, Z.w, Z.h).data, zc.x.getImageData(0, 0, Z.w, Z.h).data)) }
          if (FV && plan.methode === "fidele") await verifierFidele(FV, R, c, plan, s, i);
          /* contrôle sur le VRAI rendu d'export : deux images de suite toutes les ~12 images */
          if (plan.z < 1 && plan.methode !== "identique" && plan.fond !== "noir" && (nq % 12 === 0 || nq % 12 === 1)) { qc.x.drawImage(R.cv, 0, 0, qw, qh); const g = FMQ.luminance(qc.x.getImageData(0, 0, qw, qh).data, qw * qh), e = qw / W, z = { x0: Math.max(0, c.ox * e), y0: Math.max(0, c.oy * e), x1: Math.min(qw, (c.ox + c.lw) * e), y1: Math.min(qh, (c.oy + c.lh) * e) };
            mesures[s].push(FMQ.mesurer(g, nq % 12 === 1 ? gp : null, qw, qh, z, plan.axeExt)); gp = g } nq++;
          fait++; while (enc.encodeQueueSize > 4) { await attendre(4); if (err) throw err }
          if (fait % 5 === 0) { const el = (performance.now() - t0) / 1000, reste = el / fait * (garde.length - fait); onP("Création de la vidéo… " + Math.round(100 * fait / garde.length) + " %" + (fait > 20 ? " — encore " + (reste > 90 ? Math.round(reste / 60) + " min" : Math.max(1, Math.round(reste)) + " s") : ""), fait / garde.length); await souffler() } });
        decor = null; k = k1 }
      await enc.flush(); if (err) throw err;
      if (rawA) rawA.samples.forEach((s, i) => mx.addAudioChunkRaw(s.data, "key", s.ts, s.dur, i === 0 ? { decoderConfig: { codec: "mp4a.40.2", numberOfChannels: rawA.ch, sampleRate: rawA.sr, description: rawA.asc } } : undefined));
      else if (acfg) { onP("Son…", 1); const ae = new AudioEncoder({ output: (c, m) => { if (acfg.codec === "mp4a.40.2" && m && m.decoderConfig && m.decoderConfig.description) m = { ...m, decoderConfig: { ...m.decoderConfig, description: ascOnly(m.decoderConfig.description) } }; mx.addAudioChunk(c, m) }, error: e => { err = e } }); ae.configure(acfg);
        const ch = acfg.numberOfChannels, N = ab.length, Bz = 16384, d = []; for (let i = 0; i < ch; i++) d.push(ab.getChannelData(i));
        for (let o = 0; o < N; o += Bz) { const n = Math.min(Bz, N - o), buf = new Float32Array(n * ch); for (let c = 0; c < ch; c++) buf.set(d[c].subarray(o, o + n), c * n); ae.encode(new AudioData({ format: "f32-planar", sampleRate: ab.sampleRate, numberOfFrames: n, numberOfChannels: ch, timestamp: Math.round(o / ab.sampleRate * 1e6), data: buf })); if (ae.encodeQueueSize > 20) await attendre(5) }
        await ae.flush(); ae.close(); if (err) throw err }
      mx.finalize();
    } finally { try { enc.close() } catch (e) {} }
    const blob = mt.blob(), ms = Math.round(performance.now() - t0);
    /* relecture du fichier produit par le navigateur : dimensions, durée */
    /* relecture : par le lecteur du navigateur ; s'il ne répond pas (lecteur lent sur iPhone), par la lecture du conteneur MP4 lui-même */
    let lu = null; try { lu = await probeInfo(blob) } catch (e) {}
    if (!lu) try { const i = await demuxVideo(new File([blob], "relu.mp4", { type: "video/mp4" })); if (i && i.ns) { const t = Array.from(i.cts).sort((a, b) => a - b), dt = i.ns > 1 ? (t[i.ns - 1] - t[0]) / (i.ns - 1) : 0; lu = { w: i.dw, h: i.dh, d: (t[i.ns - 1] - t[0] + dt) / i.ts } } } catch (e) {}
    const tech = lu ? FMQ.fichier({ w: W, h: H, duree: L.duree, cadence: cad, son: son ? true : (E.aSon ? false : null) }, { w: lu.w, h: lu.h, duree: lu.d, son: son ? true : false }) : { controles: [{ code: "relecture", nom: "Relecture", ok: false, texte: "le fichier produit n’a pas pu être relu par le navigateur" }], ok: false };
    const qcs = A.scenes.map((sc, s) => mesures[s].length ? FMQ.bilan(mesures[s], E.plans[s], A.cadA) : null);
    const zero = E.zero ? { ...FMQ.bilanZero(zeros), perte: perteExport || (E.zero.zero ? "" : E.zero.raison || "réduction nécessaire") } : null;
    if (zero) zero.quantif = qp;
    const fidele = FV ? { images: FV.images, visages: FV.visages, max: FV.max, violations: FV.violations, coupes: FV.coupes, plein: !!E.fidele.plein, verifVisages: FV.vis, identite: FMQ.bilanZero(FV.ident), stabilite: FV.dS > 0 ? FV.dO / FV.dS : 1, perte: FV.perte || "", quantif: qp,
      scenes: E.plans.map(p => ({ variante: p.variante, mesures: p.mesures })) } : null;
    return { fidele, blob, W, H, zero, cadence: cad, images: fait, codec: cfg.codec, son, sonNote: son ? (rawA ? "piste d’origine copiée telle quelle" : "son réencodé (" + acfg.codec + ")") : (sonNote || "la vidéo d’origine n’a pas de son"), ms, tech, qcs, debit: cfg.bitrate };
  }

  /* visage coupé par le cadre du plein écran ? (f : boîte en px de la zone ; j : position dans la scène, en images d'analyse) → contrainte ou null */
  function coupe(F, f, j) { if (!F.cadre) return null; const C = F.cadre, n = C.y.length, a0 = borne(Math.floor(j), 0, n - 1), y0 = C.y[a0], fa = F.ax === "x" ? f.y : f.x, fb = fa + (F.ax === "x" ? f.h : f.w);
    if (fb - fa > C.win || f.w * f.h < 36) return null; return fa < y0 - 1 || fb > y0 + C.win + 1 ? { j, a: fa, b: fb } : null }
  /* vérification Fidèle d'une image exportée : i = n° d'image de la source */
  async function verifierFidele(FV, R, c, plan, s, i) {
    const F = plan.ff, Z = E.zone; FV.images++;
    /* 1. visages de CETTE image (détecteur YuNet sur l'image filmée) : aucun ne doit se trouver sous une colonne étirée */
    if (FV.vis && !F.rec && !F.uniforme) { try { for (const f of await VISAGE.detecter(R.sc, Z.w, Z.h, .6)) { FV.visages++; const a = F.ax === "x" ? f.x / Z.w : f.y / Z.h, b = F.ax === "x" ? (f.x + f.w) / Z.w : (f.y + f.h) / Z.h, st = FFI.etirementSous(F.B, F.s, a, b);
          const cp = coupe(F, f, posDans(s, i)); if (cp && FV.coupes.length < 200) FV.coupes.push({ s, ...cp });
          if (st > FV.max) FV.max = st; if (st > 1.0005 && FV.violations.length < 200) FV.violations.push({ s, i, a: borne(a, 0, 1), b: borne(b, 0, 1), pa: F.ax === "x" ? f.y / Z.h : f.x / Z.w, pb: F.ax === "x" ? (f.y + f.h) / Z.h : (f.x + f.w) / Z.w, st }) } } catch (e) { FV.vis = false } }
    /* 2. toutes les ~12 images : les colonnes non étirées sont relues dans le rendu et comparées pixel par pixel à l'image filmée */
    if (c.exact && c.G && FV.images % 12 === 1) for (const [a, b] of c.G.un) { const sa = F.B[a], sl = F.B[b] - F.B[a], da = c.G.D[a]; if (sl <= 0) continue;
      const o = F.ax === "x" ? R.cv.x.getImageData(da, c.G.op, sl, Z.h).data : R.cv.x.getImageData(c.G.op, da, Z.w, sl).data, r = F.ax === "x" ? R.sc.x.getImageData(sa, 0, sl, Z.h).data : R.sc.x.getImageData(0, sa, Z.w, sl).data; FV.ident.push(FMQ.identiques(o, r)) }
    /* 3. stabilité : variation d'une image à l'autre dans le rendu, rapportée à celle de l'original (1 = aucune ondulation ni scintillement ajoutés) */
    FV.pc.x.drawImage(R.cv, c.ox, c.oy, c.lw, c.lh, 0, 0, 64, 64); FV.ps.x.drawImage(R.sc, 0, 0, Z.w, Z.h, 0, 0, 64, 64);
    const o = FV.pc.x.getImageData(0, 0, 64, 64).data, z = FV.ps.x.getImageData(0, 0, 64, 64).data;
    if (FV.po && FV.ls === s) { let a = 0, b = 0; for (let q = 0; q < o.length; q += 4) { a += Math.abs(o[q + 1] - FV.po[q + 1]); b += Math.abs(z[q + 1] - FV.pz[q + 1]) } FV.dO += a; FV.dS += b }
    FV.po = o; FV.pz = z; FV.ls = s;
  }

  /* ================= mémoire de l'analyse (reprise) ================= */
  const BASE = () => new Promise((ok, ko) => { const r = indexedDB.open("retouche-format", 1); r.onupgradeneeded = () => r.result.createObjectStore("analyses"); r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error) });
  const cleFichier = f => [f.name, f.size, f.lastModified, "v1"].join("|");
  async function relire(f) { try { const b = await BASE(); return await new Promise(ok => { const q = b.transaction("analyses").objectStore("analyses").get(cleFichier(f)); q.onsuccess = () => ok(q.result || null); q.onerror = () => ok(null) }) } catch (e) { return null } }
  async function memoriser(f, A) { try { const b = await BASE(), st = b.transaction("analyses", "readwrite").objectStore("analyses"); st.clear(); st.put(A, cleFichier(f)) } catch (e) {} }

  /* ================= écran ================= */
  const NOMS = { fidele: "Fidèle", identique: "Déjà au bon format", recadrage: "Recadrage suivi", extension: "Décor reconstruit", decor: "Décor retrouvé", hybride: "Hybride", ambiance: "Prolongement flou", bandes: "Bandes noires" };
  function css() { if ($("#fmt_css")) return; const st = document.createElement("style"); st.id = "fmt_css"; st.textContent = `
#fmt{position:fixed;inset:0;z-index:60;display:flex;flex-direction:column;--t-bg:#0b0b0d;--t-pan:#16161a;--t-pan2:#1e1e23;--t-line:rgba(255,255,255,.09);--t-line2:rgba(255,255,255,.18);--t-ink:#ecebe7;--t-mut:#a3a19a;--t-acc:#f0a64a;--t-accink:#1d1205;--t-ai:#7cd0c3;
  background:radial-gradient(120% 60% at 50% -10%,#1b1d26 0,#0b0b0d 60%);color:var(--t-ink);font:15px/1.45 var(--fb,system-ui);color-scheme:dark}
#fmt[hidden]{display:none}
#fmt header{display:flex;align-items:center;gap:8px;padding:calc(env(safe-area-inset-top,0px) + 8px) max(12px,env(safe-area-inset-right,0px)) 8px max(12px,env(safe-area-inset-left,0px));background:rgba(11,11,13,.82);-webkit-backdrop-filter:blur(16px);backdrop-filter:blur(16px);border-bottom:1px solid var(--t-line)}
#fmt header h2{flex:1;margin:0;font:700 17px/1.2 var(--fd,system-ui);letter-spacing:-.015em;text-align:center}
#fmt .f-ib{min-width:40px;min-height:40px;border-radius:12px;border:1px solid var(--t-line2);background:var(--t-pan);color:var(--t-ink);font:600 13px/1 var(--fd,system-ui);padding:0 12px;cursor:pointer}
#fmt .f-ib[aria-pressed="true"]{border-color:var(--t-ai);color:var(--t-ai);background:rgba(124,208,195,.12)}
#fmt_corps{flex:1;min-height:0;display:flex;flex-direction:column}
#fmt_scene{position:relative;flex:1 1 42%;min-height:180px;background:#000;display:grid;place-items:center;overflow:hidden;touch-action:none;user-select:none;-webkit-user-select:none}
#fmt_cv{max-width:100%;max-height:100%;display:block;box-shadow:0 0 0 1px rgba(255,255,255,.06),0 30px 80px -30px rgba(124,208,195,.25)}
#fmt_vide{display:grid;gap:14px;justify-items:center;text-align:center;padding:24px;max-width:420px}
#fmt_vide p{margin:0;color:var(--t-mut)}
#fmt_ligne{position:absolute;top:0;bottom:0;width:2px;background:#fff;box-shadow:0 0 6px #000;pointer-events:none}
#fmt_ligne::after{content:"⟷";position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:#fff;color:#000;border-radius:50%;width:30px;height:30px;display:grid;place-items:center;font-size:15px}
#fmt .f-tag{position:absolute;top:10px;padding:5px 9px;border-radius:7px;background:rgba(0,0,0,.62);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);font:500 11px/1 var(--fm,monospace);letter-spacing:.08em;text-transform:uppercase;color:#fff;pointer-events:none}
#fmt_bar{height:3px;background:var(--t-line)}#fmt_bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,var(--t-ai),var(--t-acc));transition:width .2s}
#fmt_msg{margin:0;min-height:20px;padding:8px 16px 0;font-size:13.5px;color:var(--t-mut)}
#fmt_pan{flex:0 1 auto;max-height:56%;overflow:auto;-webkit-overflow-scrolling:touch;background:var(--t-pan);border-top:1px solid var(--t-line);padding:12px max(14px,env(safe-area-inset-right,0px)) calc(env(safe-area-inset-bottom,0px) + 12px) max(14px,env(safe-area-inset-left,0px));display:grid;gap:10px;align-content:start}
#fmt_pan>*{width:100%;max-width:820px;margin-inline:auto}
#fmt .f-h{margin:0;font:600 11px/1 var(--fm,monospace);letter-spacing:.1em;text-transform:uppercase;color:var(--t-mut)}
#fmt .f-seg{display:flex;gap:4px;flex-wrap:wrap}
#fmt .f-seg button{flex:1 0 auto;min-width:56px;min-height:44px;border-radius:12px;border:1px solid var(--t-line);background:var(--t-bg);color:var(--t-mut);font:600 13.5px/1.15 var(--fd,system-ui);cursor:pointer;padding:4px 10px}
#fmt .f-seg button small{display:block;font:500 10.5px/1.2 var(--fb,system-ui);opacity:.75;margin-top:2px}
#fmt .f-seg button[aria-pressed="true"]{background:var(--t-pan2);color:var(--t-ink);border-color:var(--t-ai);box-shadow:inset 0 0 0 1px var(--t-ai)}
#fmt .f-go{min-height:50px;border-radius:14px;border:0;background:linear-gradient(180deg,#f5b25c,#e8963a);color:var(--t-accink);font:700 15.5px/1.1 var(--fd,system-ui);cursor:pointer;padding:0 16px}
#fmt .f-no{min-height:50px;border-radius:14px;border:1px solid var(--t-line2);background:transparent;color:var(--t-ink);font:600 15px/1.1 var(--fd,system-ui);cursor:pointer;padding:0 16px}
#fmt button:disabled{opacity:.4;cursor:default}
#fmt .f-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}#fmt .f-row>.f-go,#fmt .f-row>.f-no{flex:1}
#fmt_lect{display:flex;gap:8px;align-items:center}#fmt_lect input{flex:1}
#fmt input[type=range]{accent-color:var(--t-acc);margin:0;min-height:28px}
#fmt_scenes{display:flex;gap:6px;overflow-x:auto;padding-bottom:2px}
#fmt_scenes button{flex:none;min-height:44px;border-radius:12px;border:1px solid var(--t-line);background:var(--t-bg);color:var(--t-mut);font:600 12.5px/1.2 var(--fd,system-ui);padding:4px 10px;cursor:pointer;text-align:left}
#fmt_scenes button small{display:block;font:500 11px/1.2 var(--fb,system-ui);opacity:.8}
#fmt_scenes button[aria-pressed="true"]{color:var(--t-ink);border-color:var(--t-acc);background:var(--t-pan2)}
#fmt_scenes button.ko{border-color:#d9744a}
#fmt_fiche{border:1px solid var(--t-line);border-radius:14px;padding:10px 12px;background:var(--t-bg);font-size:13.5px}
#fmt_fiche p{margin:0 0 6px}#fmt_fiche ul{margin:4px 0 6px;padding-left:18px;color:var(--t-mut)}#fmt_fiche li.ok::marker{content:"✓  ";color:var(--t-ai)}#fmt_fiche li.ko::marker{content:"!  ";color:#f08a5d}#fmt_fiche li.info::marker{content:"·  "}
#fmt select,#fmt input[type=number]{min-height:40px;border-radius:10px;border:1px solid var(--t-line2);background:var(--t-pan2);color:var(--t-ink);font:500 14px/1 var(--fb,system-ui);padding:0 8px}
#fmt input[type=number]{width:72px}
#fmt details{border-top:1px solid var(--t-line);padding-top:6px;color:var(--t-mut);font-size:13px}
#fmt summary{cursor:pointer;min-height:36px;display:flex;align-items:center;color:var(--t-ink);font:600 13px/1.2 var(--fd,system-ui)}
#fmt .f-reg{display:grid;grid-template-columns:minmax(120px,38%) 1fr;gap:8px 10px;align-items:center;padding:6px 0}
#fmt .f-reg label{color:var(--t-ink)}
#fmt .f-chk{display:flex;gap:8px;align-items:center;color:var(--t-ink)}#fmt .f-chk input{width:20px;height:20px;accent-color:var(--t-acc)}
#fmt_res video{width:100%;max-height:38vh;border-radius:12px;background:#000}
#fmt .f-lg{display:inline-block;width:11px;height:11px;border-radius:3px;vertical-align:-1px;margin:0 4px 0 8px}
#fmt button:focus-visible,#fmt select:focus-visible,#fmt input:focus-visible,#fmt summary:focus-visible{outline:2px solid var(--t-acc);outline-offset:2px}
@media (min-width:900px){#fmt_corps{flex-direction:row}#fmt_gauche{flex:1;min-width:0;display:flex;flex-direction:column}#fmt_pan{flex:0 0 440px;max-height:none;border-top:0;border-left:1px solid var(--t-line)}#fmt_scene{flex:1}}
@media (max-width:899px){#fmt_gauche{flex:1 1 44%;min-height:0;display:flex;flex-direction:column}}
@media (prefers-reduced-motion:reduce){#fmt_bar i{transition:none}}`; document.head.appendChild(st) }
  const FM = [["auto", "Auto", "l’IA choisit"], ["16:9", "16:9", "télé"], ["9:16", "9:16", "vertical"], ["1:1", "1:1", "carré"], ["4:3", "4:3", "ancien"], ["4:5", "4:5", "portrait"], ["21:9", "21:9", "cinéma"], ["perso", "Autre", "sur mesure"]];
  function ui() {
    if ($("#fmt")) return $("#fmt"); css(); const d = document.createElement("div"); d.id = "fmt"; d.hidden = true; d.setAttribute("role", "dialog"); d.setAttribute("aria-label", "Changer de format");
    d.innerHTML = `<header><button class="f-ib" id="fmt_x" aria-label="Fermer">✕</button><h2>Changer de format</h2><button class="f-ib" id="fmt_carte" aria-pressed="false" hidden>Carte</button></header>
<div id="fmt_corps"><div id="fmt_gauche"><div id="fmt_scene"><div id="fmt_vide"><p>Transforme une vidéo verticale en horizontale, une ancienne 4:3 en 16:9, une horizontale en verticale… sans abîmer ce qui a été filmé.</p><button class="f-go" id="fmt_choisir">Choisir une vidéo</button><input type="file" id="fmt_f" accept="video/*" hidden></div>
<canvas id="fmt_cv" hidden></canvas><div id="fmt_ligne" hidden></div><span class="f-tag" id="fmt_t1" style="left:10px" hidden>Original</span><span class="f-tag" id="fmt_t2" style="right:10px" hidden>Nouveau format</span></div>
<div id="fmt_bar"><i></i></div><p id="fmt_msg" role="status" aria-live="polite"></p></div>
<div id="fmt_pan" hidden>
<p class="f-h">Format voulu</p><div class="f-seg" id="fmt_fmts">${FM.map(f => `<button type="button" data-f="${f[0]}" aria-pressed="${f[0] === "auto"}">${f[1]}<small>${f[2]}</small></button>`).join("")}</div>
<div class="f-row" id="fmt_perso" hidden><label>Largeur <input type="number" id="fmt_pw" min="1" max="100" value="5" inputmode="numeric"></label><label>Hauteur <input type="number" id="fmt_ph" min="1" max="100" value="4" inputmode="numeric"></label></div>
<p class="f-h">Façon de faire</p><div class="f-seg" id="fmt_modes"><button type="button" data-m="fidele" aria-pressed="true">Fidèle<small>sans génération, rien d’inventé</small></button><button type="button" data-m="zero" aria-pressed="false">Zéro perte<small>toute l’image, au pixel près</small></button><button type="button" data-m="auto" aria-pressed="false">Auto<small>l’IA décide</small></button><button type="button" data-m="fidelite" aria-pressed="false">Fidélité<small>rien d’inventé</small></button><button type="button" data-m="max" aria-pressed="false">Reconstruction max<small>plus de décor recréé</small></button></div>
<p class="f-h" id="fmt_ecr_t">Écran</p><div class="f-seg" id="fmt_ecr"><button type="button" data-e="plein" aria-pressed="true">Plein écran<small>remplit la télé, coupe le haut et le bas</small></button><button type="button" data-e="entier" aria-pressed="false">Image entière<small>tout garder, côtés en ambiance</small></button></div>
<div class="f-row"><button class="f-go" id="fmt_go">Analyser la vidéo</button></div>
<div id="fmt_apres" hidden>
<div id="fmt_lect"><button class="f-ib" id="fmt_pp" aria-label="Lecture">▶</button><input type="range" id="fmt_pos" min="0" max="1000" value="0" aria-label="Position dans la vidéo"><button class="f-ib" id="fmt_cmp" aria-pressed="true">Comparer</button></div>
<p class="f-h" style="margin-top:10px">Scènes <span id="fmt_ns"></span></p><div id="fmt_scenes"></div>
<div id="fmt_fiche" style="margin-top:8px"></div>
<div class="f-row" style="margin-top:10px"><button class="f-go" id="fmt_ex">Créer la vidéo</button></div>
<div id="fmt_res" hidden style="margin-top:10px"><video id="fmt_rv" controls playsinline></video><div id="fmt_bilan" style="margin-top:8px"></div>
<div class="f-row" style="margin-top:8px"><button class="f-go" id="fmt_sv">Enregistrer la vidéo</button><button class="f-no" id="fmt_am">✨ Améliorer cette vidéo</button></div></div>
</div>
<details id="fmt_av"><summary>Réglages avancés</summary><div class="f-reg">
<label for="fmt_ri">Intensité de reconstruction</label><input type="range" id="fmt_ri" min="0" max="100" value="50">
<label for="fmt_rf">Fidélité à l’original</label><input type="range" id="fmt_rf" min="0" max="100" value="50">
<label for="fmt_rl">Liberté de génération</label><input type="range" id="fmt_rl" min="0" max="100" value="50">
<label for="fmt_rs">Suivi des sujets</label><label class="f-chk"><input type="checkbox" id="fmt_rs" checked> le cadre suit les personnes et les animaux</label>
<label for="fmt_rb">Arrière-plans</label><select id="fmt_rb"><option value="auto">Automatique</option><option value="genere">Reconstruire le décor</option><option value="reel">Seulement le décor réellement filmé</option><option value="ambiance">Prolongement flou</option><option value="noir">Bandes noires</option></select>
<label for="fmt_rq">Qualité du fichier</label><select id="fmt_rq"><option value="max">Maximale (fichier lourd)</option><option value="haute" selected>Haute</option><option value="standard">Standard (fichier léger)</option></select>
<label for="fmt_rr">Résolution</label><select id="fmt_rr"><option value="auto">Automatique (celle de la vidéo)</option><option value="720">720p</option><option value="1080">1080p</option><option value="1440">1440p</option><option value="2160">4K</option></select>
<label for="fmt_rc">Images par seconde</label><select id="fmt_rc"><option value="origine">Comme l’original</option><option value="30">30</option><option value="25">25</option><option value="24">24</option></select>
</div></details>
<details><summary>Ce que fait cet outil, et ses limites</summary><b>Plein écran</b> (par défaut) : la vidéo remplit toute la télé, sans rien inventer ni déformer ; pour ça, le haut et le bas d’une vidéo verticale sont coupés (environ 68 % de l’image en 9:16 → 16:9) et le cadre suit les visages et les personnes, en douceur ; chaque image est vérifiée (aucun visage coupé). L’image est agrandie pour la télé : la définition augmente, mais aucun détail réel n’est récupéré. <b>Image entière</b> : rien n’est coupé, les côtés sont remplis par une ambiance floue. <br><br><b>Fidèle</b> : <b>aucune génération</b>, seuls les pixels filmés sont utilisés. Toute l’image est gardée ; les visages, personnes et animaux sont copiés pixel pour pixel ; seul le fond peu détaillé est légèrement étiré, sous le seuil où l’œil le remarque (10 %) ; ce qui reste est rempli par une « ambiance » : ta propre image très floutée et assourdie, qui ne montre aucune forme ni aucun décor (ou des bandes noires si tu préfères). Chaque image de la vidéo est vérifiée à l’export (visages, copie exacte, stabilité). <b>Limite impossible à contourner :</b> passer de 9:16 à 16:9 demande 3,16 fois plus de largeur ; on ne peut pas à la fois tout garder, ne rien déformer, remplir l’écran et ne rien ajouter. Les méthodes qui remplissent davantage (étirement plus fort, étirement uniforme, recadrage) sont proposées avec leurs mesures, et ne s’appliquent que si tu les choisis. Le bouton « Carte » montre en <span class="f-lg" style="background:#46d7c8"></span>turquoise ce qui est copié tel quel et en <span class="f-lg" style="background:#eb3c96"></span>rose ce qui est étiré.<br><br>Autres modes : L’image filmée n’est <b>jamais</b> modifiée : l’outil ajoute seulement ce qui manque autour. En mode <b>Zéro perte</b> (par défaut), rien n’est coupé ni réduit : la vidéo est posée pixel pour pixel dans le nouveau format, et c’est vérifié à l’export ; avec un jeton Kaggle, tout le décor ajouté est reconstruit net sur ton serveur gratuit (sinon : décor retrouvé, reconstruit près du bord, puis prolongement flou). Pour chaque scène il compare plusieurs méthodes et garde la meilleure : <b>recadrage</b> qui suit les personnes, <b>décor retrouvé</b> (quand la caméra bouge, ce qu’une image ne montre pas a souvent été filmé par une autre : ce sont de vrais pixels), <b>décor reconstruit</b> par un modèle d’IA (pixels <b>inventés</b>, plausibles mais pas réels, sur une profondeur limitée), puis <b>prolongement flou</b> au-delà. Le bouton « Carte » montre ce qui est <span class="f-lg" style="background:#46d7c8"></span>retrouvé et <span class="f-lg" style="background:#eb3c96"></span>inventé. Le décor ajouté est fixe : ce qui bouge dans la vraie scène (passants, feuillage) ne bouge pas dans la partie ajoutée. Une vidéo verticale ne devient pas une « vraie » horizontale filmée telle quelle : les côtés très profonds restent flous. Tout est calculé sur ton appareil ; rien n’est envoyé.</details>
</div></div>`;
    document.body.appendChild(d);
    $("#fmt_x").onclick = fermer; $("#fmt_choisir").onclick = () => $("#fmt_f").click(); $("#fmt_f").onchange = e => { const f = e.target.files[0]; e.target.value = ""; if (f) charger(f) };
    $("#fmt_fmts").onclick = e => { const b = e.target.closest("button"); if (!b || !E || E.occupe) return; E.format = b.dataset.f; $("#fmt_perso").hidden = E.format !== "perso"; maj("format") };
    $("#fmt_pw").onchange = $("#fmt_ph").onchange = () => { if (!E) return; E.perso = [borne(+$("#fmt_pw").value || 1, 1, 100), borne(+$("#fmt_ph").value || 1, 1, 100)]; maj("format") };
    $("#fmt_modes").onclick = e => { const b = e.target.closest("button"); if (!b || !E || E.occupe) return; E.reglages.mode = b.dataset.m; maj("mode") };
    $("#fmt_ecr").onclick = e => { const b = e.target.closest("button"); if (!b || !E || E.occupe) return; E.reglages.plein = b.dataset.e === "plein"; E.ffCadre = {}; maj("reglage") };
    $("#fmt_go").onclick = () => lancer(); $("#fmt_ex").onclick = () => E && E.occupe === "export" ? (E.stop = true) : creer(); $("#fmt_sv").onclick = enregistrer; $("#fmt_am").onclick = ameliorer;
    $("#fmt_pp").onclick = () => { if (!E || !E.pret) return; const v = E.vid; if (v.paused) v.play().catch(() => {}); else v.pause() };
    $("#fmt_pos").oninput = e => { if (!E || !E.pret) return; E.vid.pause(); E.vid.currentTime = +e.target.value / 1000 * E.lecteur.duree };
    $("#fmt_cmp").onclick = e => { if (!E) return; E.comparer = !E.comparer; e.currentTarget.setAttribute("aria-pressed", E.comparer); $("#fmt_ligne").hidden = $("#fmt_t1").hidden = !E.comparer; dessiner() };
    $("#fmt_carte").onclick = e => { if (!E) return; E.carte = !E.carte; e.currentTarget.setAttribute("aria-pressed", E.carte); dessiner() };
    const st = $("#fmt_scene"), gl = e => { if (!E || !E.pret || !E.comparer) return; const r = $("#fmt_cv").getBoundingClientRect(); E.split = borne((e.clientX - r.left) / r.width, 0, 1); dessiner() };
    st.addEventListener("pointerdown", e => { if (e.target.closest("button")) return; gl(e); try { st.setPointerCapture(e.pointerId) } catch (x) {} }); st.addEventListener("pointermove", e => { if (e.buttons) gl(e) });
    const reg = (id, k, f) => { $(id).onchange = e => { if (!E) return; E.reglages[k] = f(e.target); maj("reglage") } };
    reg("#fmt_ri", "intensite", t => +t.value / 100); reg("#fmt_rf", "fidelite", t => +t.value / 100); reg("#fmt_rl", "liberte", t => +t.value / 100); reg("#fmt_rs", "suivi", t => t.checked); reg("#fmt_rb", "fond", t => t.value); reg("#fmt_rq", "qualite", t => t.value); reg("#fmt_rr", "resolution", t => t.value); reg("#fmt_rc", "cadence", t => t.value);
    return d;
  }
  const MSG = (t, f) => { const m = $("#fmt_msg"); if (m) m.textContent = t || ""; const b = $("#fmt_bar i"); if (b) b.style.width = f == null ? "0" : Math.round(100 * borne(f, 0, 1)) + "%" };
  const presseEcran = () => { if (!E) return; presse("#fmt_ecr", "e", E.reglages.plein ? "plein" : "entier"); $("#fmt_ecr").hidden = $("#fmt_ecr_t").hidden = E.reglages.mode !== "fidele" };
  const presse = (sel, attr, v) => document.querySelectorAll(sel + " button").forEach(b => b.setAttribute("aria-pressed", b.dataset[attr] === v));
  function occupe(o) { if (!E) return; E.occupe = o; for (const s of ["#fmt_go", "#fmt_sv", "#fmt_am", "#fmt_choisir"]) $(s).disabled = !!o; $("#fmt_ex").disabled = !!o && o !== "export"; $("#fmt_ex").textContent = o === "export" ? "Arrêter" : "Créer la vidéo"; document.querySelectorAll("#fmt_av input,#fmt_av select,#fmt_fmts button,#fmt_modes button,#fmt_ecr button,#fmt_fiche select,#fmt_fiche button").forEach(e => e.disabled = !!o || e.hasAttribute("data-non")) }

  async function ouvrir(file) { const d = ui(); d.hidden = false; document.body.classList.add("fmt-ouvert"); if (file) await charger(file) }
  function liberer() { if (!E) return; E.stop = true; try { E.vid.pause(); E.vid.removeAttribute("src"); E.vid.load(); if (E.vid.remove) E.vid.remove(); if (E.lecteur && E.lecteur.v) E.lecteur.v.remove() } catch (e) {} if (E.url) URL.revokeObjectURL(E.url); if (E.resUrl) URL.revokeObjectURL(E.resUrl); E = null }
  function fermer() { liberer(); const d = $("#fmt"); if (d) { d.hidden = true; d.remove() } document.body.classList.remove("fmt-ouvert") }
  /* iPhone (Safari) : une vidéo hors de la page n'est pas décodée tant qu'elle n'est pas lue (« loadeddata » ne vient jamais pour une
     vidéo de téléphone). On l'attache donc à la page (invisible), on attend seulement ses métadonnées, puis on l'amorce (lecture muette
     interrompue aussitôt) pour avoir une image à montrer. Les calculs, eux, lisent les images par WebCodecs, sans cette balise. */
  function attacher(v) { v.muted = true; v.playsInline = true; v.setAttribute("playsinline", ""); v.setAttribute("muted", ""); v.preload = "auto"; v.style.cssText = "position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none;z-index:-1"; document.body.appendChild(v); return v }
  function attendreVideo(v, etat, ms, msgDelai) { return new Promise((ok, ko) => { if (v.readyState >= etat) return ok(); let fini = false; const fin = f => { if (fini) return; fini = true; clearTimeout(t); for (const n of ev) v.removeEventListener(n, verif); v.removeEventListener("error", err); f() };
    const verif = () => { if (v.readyState >= etat) fin(ok) }, err = () => fin(() => ko(new Error("ce fichier n’est pas une vidéo lisible par ce navigateur" + (v.error && v.error.code ? " (erreur " + v.error.code + ")" : "")))), ev = ["loadedmetadata", "loadeddata", "canplay", "canplaythrough", "seeked", "timeupdate"];
    for (const n of ev) v.addEventListener(n, verif); v.addEventListener("error", err); const t = setTimeout(() => fin(() => ko(new Error(msgDelai || "la vidéo met trop de temps à s’ouvrir"))), ms) }) }
  async function amorcer(v) { if (v.readyState >= 2) return true; try { const p = v.play(); if (p && p.then) await Promise.race([p, attendre(4000)]); v.pause() } catch (e) {} try { if (v.readyState < 2) v.currentTime = Math.min(.05, (v.duration || 1) / 2); await attendreVideo(v, 2, 8000) ; return true } catch (e) { return false } }
  /* aperçu sans la balise vidéo (format que le lecteur du navigateur refuse, mais que WebCodecs sait lire) : une image fixe à la position voulue */
  function fauxVideo(L) { const c = toile(L.w, L.h), ev = {}; let t = 0, file = Promise.resolve();
    const o = { cv: c, paused: true, readyState: 0, seeking: false, duration: L.duree, faux: true, onseeked: null, ontimeupdate: null, onplay: null, onpause: null,
      get currentTime() { return t }, set currentTime(v) { t = borne(v, 0, L.duree); o.seeking = true; let i = 0; while (i < L.n - 1 && L.tps[i + 1] <= t + 1e-4) i++;
        file = file.then(() => L.parcourir([i], async f => { c.x.drawImage(f, 0, 0, L.w, L.h) })).catch(() => {}).then(() => { o.readyState = 4; o.seeking = false; (ev.seeked || []).slice().forEach(f => f()); ev.seeked = (ev.seeked || []).filter(f => !f.une); if (o.onseeked) o.onseeked() }) },
      play() { return Promise.reject(new Error("lecture indisponible")) }, pause() {}, load() {}, removeAttribute() {}, remove() {},
      addEventListener(n, f, op) { if (op && op.once) f.une = true; (ev[n] = ev[n] || []).push(f) }, removeEventListener(n, f) { ev[n] = (ev[n] || []).filter(g => g !== f) } };
    return o }
  const sourceApercu = () => E.vid.faux ? E.vid.cv : E.vid;
  async function charger(file) {
    liberer(); ui(); $("#fmt_pp").disabled = false; $("#fmt_pp").removeAttribute("data-non"); const vid = attacher(document.createElement("video")); vid.loop = true;
    E = { file, nom: (file.name || "video").replace(/\.[^.]+$/, ""), url: URL.createObjectURL(file), vid, format: "auto", perso: [5, 4], reglages: REGLAGES(), couches: new Map(), decors: new Map(), opts: [], qc: [], comparer: true, split: .5, generateur: true, scene: 0, journal: [] };
    const moi = E; vid.src = E.url; $("#fmt_vide").hidden = true; $("#fmt_pan").hidden = false; $("#fmt_apres").hidden = true; $("#fmt_res").hidden = true; $("#fmt_carte").hidden = true; presse("#fmt_fmts", "f", "auto"); presse("#fmt_modes", "m", E.reglages.mode); presseEcran(); MSG("Ouverture de la vidéo…");
    try { let errBalise = null; const t0 = performance.now(); try { await attendreVideo(vid, 1, window.VideoDecoder ? 8000 : 45000) } catch (e) { errBalise = e } if (E !== moi) return; E.ouverture = { balise: errBalise ? errBalise.message : "ok", ms: Math.round(performance.now() - t0) };
      E.lecteur = await ouvrirLecteur(file, errBalise ? null : vid); if (E !== moi) return; const L = E.lecteur; E.zone = { x: 0, y: 0, w: L.w, h: L.h };
      if (errBalise) { if (L.type !== "webcodecs") throw errBalise; E.vid = fauxVideo(L); E.vid.currentTime = 0; await new Promise(r => E.vid.addEventListener("seeked", r, { once: true }));
        /* la balise répond finalement (lecteur lent) : on repasse sur la vraie vidéo, avec la lecture */
        if (/délai/.test(errBalise.message)) attendreVideo(vid, 1, 120000).then(() => amorcer(vid)).then(ok => { if (!ok || E !== moi || E.occupe) return; const f = E.vid; vid.currentTime = f.currentTime; E.vid = vid;
          vid.ontimeupdate = f.ontimeupdate; vid.onseeked = f.onseeked; vid.onplay = vid.onpause = f.onplay; $("#fmt_pp").disabled = false; $("#fmt_pp").removeAttribute("data-non") }).catch(() => { try { vid.remove() } catch (e) {} });
        else try { vid.remove() } catch (e) {} }
      else await amorcer(vid); if (E !== moi) return;
      const cv = $("#fmt_cv"); cv.hidden = false; cv.width = pair(L.w * Math.min(1, 540 / Math.min(L.w, L.h))); cv.height = pair(L.h * Math.min(1, 540 / Math.min(L.w, L.h)));
      if (E.vid.readyState >= 2) cv.getContext("2d").drawImage(sourceApercu(), 0, 0, cv.width, cv.height); else await L.parcourir([0], async f => { cv.getContext("2d").drawImage(f, 0, 0, cv.width, cv.height) });
      const vid2 = E.vid;
      const r = L.w / L.h, nomF = Math.abs(r - 16 / 9) < .03 ? "16:9" : Math.abs(r - 9 / 16) < .02 ? "9:16" : Math.abs(r - 4 / 3) < .03 ? "4:3" : Math.abs(r - 3 / 4) < .03 ? "3:4" : Math.abs(r - 1) < .03 ? "1:1" : r.toFixed(2).replace(".", ",") + ":1";
      MSG("Vidéo " + L.w + "×" + L.h + " (" + nomF + "), " + L.duree.toFixed(1).replace(".", ",") + " s, " + (Math.round(L.cadence * 100) / 100).toString().replace(".", ",") + " images/s" + (L.type === "balise" ? " — lecture de secours (plus lente)" : "") + ". " + (window.__fmtSansAuto ? "Choisis le format, puis « Analyser la vidéo »." : "Analyse automatique…"));
      vid2.ontimeupdate = () => { if (E === moi && E.pret && !E.vid.seeking) $("#fmt_pos").value = Math.round(E.vid.currentTime / L.duree * 1000) }; vid2.onseeked = () => { if (E === moi) dessiner() }; vid2.onplay = vid2.onpause = () => { if (E === moi) { $("#fmt_pp").textContent = E.vid.paused ? "▶" : "❚❚"; if (!E.vid.paused) boucle() } };
      if (vid2.faux) { $("#fmt_pp").disabled = true; $("#fmt_pp").setAttribute("data-non", "") }
      /* v8.7 : l'analyse démarre toute seule (format choisi automatiquement) ; on peut ensuite changer de format ou de méthode */
      if (!window.__fmtSansAuto) setTimeout(() => { if (E === moi && !E.occupe && !E.pret) lancer() }, 0);
    } catch (e) { if (E === moi) { MSG("Impossible d’ouvrir cette vidéo : " + ((e && e.message) || e) + "."); $("#fmt_vide").hidden = false; $("#fmt_pan").hidden = true; $("#fmt_cv").hidden = true } }
  }
  /* analyse (ou reprise d'une analyse gardée) → décision → décors d'aperçu → contrôles */
  async function lancer() {
    if (!E || E.occupe || !E.lecteur) return; const moi = E; occupe("analyse"); E.stop = false; E.vid.pause(); E.pret = false;
    try {
      if (!E.analyse) { const g = await relire(E.file); if (g && g.v === 2 && g.n === E.lecteur.n) { E.analyse = g; E.reprise = true; MSG("Analyse retrouvée (déjà faite pour cette vidéo).") } else { E.analyse = await analyser(MSG); if (E !== moi) return; memoriser(E.file, E.analyse) } }
      E.zone = E.analyse.zone; decider(); await preparer(MSG); if (E !== moi) return;
      E.pret = true; $("#fmt_apres").hidden = false; $("#fmt_res").hidden = true; $("#fmt_go").textContent = "Refaire l’analyse"; const cv = $("#fmt_cv"); cv.width = E.apercu.W; cv.height = E.apercu.H; $("#fmt_ligne").hidden = $("#fmt_t1").hidden = !E.comparer; $("#fmt_t2").hidden = false;
      scenes(); fiche(); resume(); await new Promise(r => { const fin = () => r(); E.vid.addEventListener("seeked", fin, { once: true }); E.vid.currentTime = Math.min(E.lecteur.duree - .05, tempsScene(E.scene) + .02); setTimeout(fin, 1500) }); dessiner();
      try { if (window.REC && REC.log) REC.log("format", diagnostic()) } catch (e) {}
    } catch (e) { if (E === moi) MSG(e instanceof Annule || (e && e.name === "AbortError") ? "Arrêté." : "Analyse impossible : " + ((e && e.message) || e) + ". La vidéo d’origine n’a pas été modifiée.") }
    finally { if (E === moi) occupe(null) }
  }
  function resumeFidele() { const A = E.analyse, n = A.scenes.length, pc = v => (Math.round(v * 1000) / 10).toString().replace(".", ",") + " %", [rw, rh] = cible(), P = E.plans;
    const cons = Math.min(...P.map(p => p.mesures.conservation)), rem = Math.min(...P.map(p => p.mesures.remplissage)), rmax = Math.max(...P.map(p => p.mesures.remplissage)), def = Math.max(...P.map(p => p.mesures.etirementMax)), ko = E.qc.filter(q => q && !q.ok).length;
    if (E.fidele.plein) return MSG("Plein écran, sans génération → " + rw + ":" + rh + ", " + E.sortie.W + "×" + E.sortie.H + ". L’image remplit toute la télé ; " + (P[0].axeExt === "x" ? "le haut et le bas sont coupés" : "les côtés sont coupés") + " (" + pc(1 - cons) + "), le cadre suit les visages. Rien d’inventé. " + (n > 1 ? n + " scènes. " : "") + (ko ? ko + " scène(s) avec un contrôle non satisfait (voir la fiche)." : "Contrôles passés.") + " Pour garder toute l’image : « Image entière ».");
    MSG("Fidèle, sans génération → " + rw + ":" + rh + ", " + E.sortie.W + "×" + E.sortie.H + (E.fidele.exact ? " (un pixel filmé = un pixel du fichier)" : "") + ". Image gardée : " + pc(cons) + ", rien d’inventé. Écran rempli : " + (rem === rmax ? pc(rem) : pc(rem) + " à " + pc(rmax)) + (rmax < .999 ? " (le reste en " + (E.reglages.bords === "noir" ? "bandes noires" : "ambiance floue de ta propre image") + ")" : "") + ". Déformation : " + (def <= 1.0005 ? "aucune" : "max " + pc(def - 1)) + ". " + (n > 1 ? n + " scènes. " : "") + (ko ? ko + " scène(s) avec un contrôle non satisfait (voir la fiche)." : "Contrôles passés.") + (rem < .999 && P.every(p => p.variante === "fidele" || p.variante === "exact") ? " Remplir tout l’écran sans rien inventer obligerait à couper ou à déformer : voir « Méthode »." : "")) }
  function resume() { if (E.fidele) return resumeFidele(); const A = E.analyse, n = A.scenes.length, c = {}; E.plans.forEach(p => c[p.methode] = (c[p.methode] || 0) + 1); const [rw, rh] = cible(), ko = E.qc.filter(q => q && !q.ok).length;
    MSG((E.zero ? (E.zero.zero ? "Zéro perte : chaque pixel filmé est gardé (" + E.zone.w + "×" + E.zone.h + " posé tel quel dans " + E.sortie.W + "×" + E.sortie.H + "). " : "Zéro perte non garanti : " + E.zero.raison + ". ") : "") + (n > 1 ? n + " scènes" : "1 scène") + " → " + (E.format === "auto" ? "format choisi : " : "") + rw + ":" + rh + ", sortie " + E.sortie.W + "×" + E.sortie.H + ". " + Object.entries(c).map(([k, v]) => NOMS[k] + (n > 1 ? " × " + v : "")).join(", ") + "." + (A.zone.bandes ? " Bandes noires d’origine retirées." : "") + (ko ? " " + ko + " scène(s) avec un contrôle non satisfait (voir la fiche)." : " Contrôles passés.") + (E.reprise ? "" : " Analyse : " + (A.ms / 1000).toFixed(1).replace(".", ",") + " s.")) }
  const tempsScene = s => E.lecteur.tps[Math.min(E.lecteur.n - 1, E.analyse.scenes[s].a0 * E.analyse.pasA)];
  function scenes() { const A = E.analyse, d = $("#fmt_scenes"); $("#fmt_ns").textContent = "(" + A.scenes.length + ")"; d.innerHTML = A.scenes.map((sc, s) => `<button type="button" data-s="${s}" aria-pressed="${s === E.scene}" class="${E.qc[s] && !E.qc[s].ok ? "ko" : ""}">Scène ${s + 1} · ${tempsScene(s).toFixed(1).replace(".", ",")} s<small>${E.plans[s].methode === "fidele" ? FFI.VARIANTES[E.plans[s].variante].nom : NOMS[E.plans[s].methode]}</small></button>`).join("");
    d.onclick = e => { const b = e.target.closest("button"); if (!b || !E || E.occupe) return; E.scene = +b.dataset.s; E.vid.pause(); E.vid.currentTime = Math.min(E.lecteur.duree - .05, tempsScene(E.scene) + .02); scenes(); fiche() };
    $("#fmt_carte").hidden = !E.fidele && ![...E.decors.values()].some(Boolean) }
  function ficheFidele() { const s = E.scene, A = E.analyse, sc = A.scenes[s], p = E.plans[s], q = E.qc[s], R = E.reglages.scenes[s] || {}, V = p.V;
    const cam = sc.verrou ? "caméra fixe" : sc.classe === "fixe" ? "caméra presque fixe" : sc.classe === "panoramique" ? "caméra en mouvement (panoramique)" : "caméra très mobile";
    const choisi = R.variante || E.reglages.variante || "auto";
    $("#fmt_fiche").innerHTML = `<p><b>Scène ${s + 1}</b> — ${FFI.VARIANTES[p.variante].nom} · ${cam}</p>
<ul>${p.raisons.map(r => "<li class=info>" + STUDIO.esc(r) + "</li>").join("")}</ul>
${q && q.controles.length ? "<p>Contrôles :</p><ul>" + q.controles.map(c => `<li class="${c.info ? "info" : c.ok ? "ok" : "ko"}">${STUDIO.esc(c.nom)} : ${STUDIO.esc(c.texte)}</li>`).join("") + "</ul>" : ""}${q && q.journal.length ? "<ul>" + q.journal.map(j => "<li class=info>" + STUDIO.esc(j) + "</li>").join("") + "</ul>" : ""}
<p>Méthodes comparées (mesures de cette scène) :</p><ul>${FFI.ORDRE.map(id => `<li class="${id === p.variante ? "ok" : "info"}"><b>${FFI.VARIANTES[id].nom}</b>${id === p.auto ? " (choix auto)" : ""} — ${STUDIO.esc(FFI.decrire(V[id]))}</li>`).join("")}</ul>
<div class="f-row"><label for="fmt_var">Méthode</label><select id="fmt_var"><option value="auto"${choisi === "auto" ? " selected" : ""}>Automatique (Fidèle)</option>${FFI.ORDRE.map(id => `<option value="${id}"${choisi === id ? " selected" : ""}>${FFI.VARIANTES[id].nom}</option>`).join("")}</select>
<label class="f-chk"><input type="checkbox" id="fmt_tout" checked> toutes les scènes</label></div>
<div class="f-row"><label for="fmt_bords">Côtés</label><select id="fmt_bords"><option value="ambiance"${E.reglages.bords !== "noir" ? " selected" : ""}>Ambiance : ta propre image, très floutée (rien d’inventé)</option><option value="noir"${E.reglages.bords === "noir" ? " selected" : ""}>Bandes noires</option></select></div>`;
    $("#fmt_var").onchange = e => { const v = e.target.value; if ($("#fmt_tout").checked) { E.reglages.variante = v; for (const k in E.reglages.scenes) delete E.reglages.scenes[k].variante; maj("reglage") } else { (E.reglages.scenes[s] = E.reglages.scenes[s] || {}).variante = v; maj("scene", s) } };
    $("#fmt_bords").onchange = e => { E.reglages.bords = e.target.value; maj("reglage") } }
  function fiche() { if (E.plans[E.scene].methode === "fidele") return ficheFidele(); const s = E.scene, A = E.analyse, sc = A.scenes[s], p = E.plans[s], q = E.qc[s], dc = E.decors.get(s), R = E.reglages.scenes[s] || {}, pc = v => Math.round(v * 100) + " %";
    const cam = sc.verrou ? "caméra fixe" : sc.classe === "fixe" ? "caméra presque fixe" : sc.classe === "panoramique" ? "caméra en mouvement (panoramique)" : "caméra très mobile", suj = sc.sujets ? sc.pistes.slice(0, 4).map(t => ({ visage: "visage", personne: "personne", animal: "animal", vehicule: "véhicule", objet: "objet" })[t.classe] || t.classe).join(", ") : "aucun sujet reconnu" + (sc.pistes.length ? " (zone d’intérêt suivie)" : "");
    $("#fmt_fiche").innerHTML = `<p><b>Scène ${s + 1}</b> — ${NOMS[p.methode]} · ${cam} · ${suj}${sc.lum < 45 ? " · scène sombre" : ""}</p>
<ul>${p.raisons.map(r => "<li class=info>" + STUDIO.esc(r) + "</li>").join("")}${dc ? "<li class=info>Côtés ajoutés : " + pc(dc.parts.reel) + " retrouvé dans d’autres images, " + pc(dc.parts.invente) + " inventé par le modèle, " + pc(dc.parts.flou) + " en prolongement flou.</li>" : ""}</ul>
${q && q.controles.length ? "<p>Contrôles mesurés sur " + q.images + " images :</p><ul>" + q.controles.map(c => `<li class="${c.info ? "info" : c.ok ? "ok" : "ko"}">${STUDIO.esc(c.nom)} : ${STUDIO.esc(c.texte)}</li>`).join("") + "</ul>" : ""}${q && q.journal.length ? "<ul>" + q.journal.map(j => "<li class=info>" + STUDIO.esc(j) + "</li>").join("") + "</ul>" : ""}
<div class="f-row"><label for="fmt_meth">Méthode</label><select id="fmt_meth">${[["auto", "Automatique"], ["recadrage", "Recadrage suivi"], ["hybride", "Hybride"], ["extension", "Décor reconstruit"], ["decor", "Décor retrouvé"], ["ambiance", "Prolongement flou"], ["bandes", "Bandes noires"]].map(o => `<option value="${o[0]}"${(R.methode || "auto") === o[0] ? " selected" : ""}>${o[1]}</option>`).join("")}</select>
<button class="f-ib" id="fmt_re" ${p.fond === "genere" ? "" : "disabled data-non"}>Relancer la reconstruction</button></div>`;
    $("#fmt_meth").onchange = e => { const r = E.reglages.scenes[s] = E.reglages.scenes[s] || {}; r.methode = e.target.value; delete r.fond; delete r.qc; maj("scene", s) };
    $("#fmt_re").onclick = () => { const r = E.reglages.scenes[s] = E.reglages.scenes[s] || {}; r.graine = (r.graine || 0) + 1; delete r.fond; delete r.qc; maj("scene", s) } }
  /* un réglage a changé : nouvelle décision (immédiate), puis décors et contrôles des scènes concernées */
  async function maj(quoi, s) {
    if (!E || E.occupe) return; presse("#fmt_fmts", "f", E.format); presse("#fmt_modes", "m", E.reglages.mode); presseEcran(); if (!E.analyse || !E.pret) return; const moi = E;
    if (quoi === "format" || quoi === "mode" || (quoi === "reglage")) for (const k in E.reglages.scenes) { delete E.reglages.scenes[k].fond; delete E.reglages.scenes[k].qc }
    if (quoi === "format" || quoi === "mode") E.ffExtra = {};
    occupe("analyse"); E.vid.pause(); E.stop = false; const avant = E.plans.map(p => p.cle), ap = E.apercu.W + "x" + E.apercu.H;
    try { decider(); await etendreServeur(MSG); if (E !== moi) return; const cv = $("#fmt_cv"); cv.width = E.apercu.W; cv.height = E.apercu.H; const tout = ap !== E.apercu.W + "x" + E.apercu.H; if (tout || !E.rApercu) { E.rApercu = rendu(E.apercu.W, E.apercu.H); E.decors.clear() }
      const n = E.plans.length; for (let k = 0; k < n; k++) if (tout || E.plans[k].cle !== avant[k] || k === s) { MSG("Préparation de la scène " + (k + 1) + "…", k / n); await controler(k, t => MSG(t, k / n)); if (E !== moi) return }
      $("#fmt_res").hidden = true; scenes(); fiche(); resume(); dessiner();
    } catch (e) { if (E === moi) MSG("Impossible d’appliquer ce réglage : " + ((e && e.message) || e) + ".") } finally { if (E === moi) occupe(null) }
  }
  /* aperçu : la vidéo d'origine est lue par le navigateur, chaque image est recomposée au vol (définition réduite) */
  function imageCourante() { const L = E.lecteur, t = E.vid.currentTime; let a = 0, b = L.n - 1; while (a < b) { const m = (a + b + 1) >> 1; if (L.tps[m] <= t + 1e-4) a = m; else b = m - 1 } return a }
  function dessiner() {
    if (!E || !E.pret || !E.rApercu || E.vid.readyState < 2) { if (E && E.pret && !E.vid.faux && !E.amorce) { E.amorce = true; amorcer(E.vid).then(() => { E && (E.amorce = false); dessiner() }) } return } const i = imageCourante(), s = sceneDe(i), R = E.rApercu, cv = $("#fmt_cv"), x = cv.getContext("2d"), Z = E.zone;
    rendre(R, sourceApercu(), s, posDans(s, i), E.plans[s].plaque ? E.decors.get(s) : null, { carte: E.carte }); x.drawImage(R.cv, 0, 0);
    if (E.comparer) { const w = Math.round(cv.width * E.split), k = Math.min(cv.width / Z.w, cv.height / Z.h), dw = Z.w * k, dh = Z.h * k; x.save(); x.beginPath(); x.rect(0, 0, w, cv.height); x.clip(); x.fillStyle = "#000"; x.fillRect(0, 0, cv.width, cv.height); x.drawImage(sourceApercu(), Z.x, Z.y, Z.w, Z.h, (cv.width - dw) / 2, (cv.height - dh) / 2, dw, dh); x.restore();
      const r = cv.getBoundingClientRect(), p = $("#fmt_scene").getBoundingClientRect(); $("#fmt_ligne").style.left = (r.left - p.left + r.width * E.split - 1) + "px" }
    if (s !== E.scene && !E.vid.paused) { E.scene = s; scenes(); fiche() }
  }
  function boucle() { const moi = E, v = E.vid, pas = () => { if (E !== moi || v.paused) return; dessiner(); if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(pas); else requestAnimationFrame(pas) }; pas() }

  async function creer() {
    if (!E || E.occupe || !E.pret) return; const moi = E; occupe("export"); E.stop = false; E.vid.pause(); let verrou = null; try { verrou = await navigator.wakeLock.request("screen") } catch (e) {}
    try { let r = await exporter(MSG); if (E !== moi) return;
      /* Fidèle : un visage trouvé à l'export sous une zone étirée (manqué par l'analyse) → sa zone est protégée et la vidéo refaite, une fois */
      if (r.fidele && (r.fidele.violations.length || r.fidele.coupes.length)) { const V = r.fidele.violations, K = r.fidele.coupes, sc = [...new Set(V.map(v => v.s).concat(K.map(v => v.s)))];
        for (const v of V) (E.ffExtra[v.s] = E.ffExtra[v.s] || []).push({ a: v.a, b: v.b, pa: v.pa, pb: v.pb, classe: "visage", poids: 1 }); for (const v of K) (E.ffCadre[v.s] = E.ffCadre[v.s] || []).push({ j: v.j, a: v.a, b: v.b });
        decider(); for (const k of sc) await controler(k, t => MSG(t)); MSG("Correction : " + (V.length + K.length) + " visage(s) " + (K.length ? "coupé(s) par le cadre" : "sous une zone étirée") + " (scène " + sc.map(k => k + 1).join(", ") + ") → corrigé, la vidéo est refaite…");
        const avant = V.length + K.length; r = await exporter(MSG); if (E !== moi) return; r.fidele.corrige = avant; scenes(); fiche(); resume() }
      E.res = r; if (E.resUrl) URL.revokeObjectURL(E.resUrl); E.resUrl = URL.createObjectURL(r.blob); $("#fmt_rv").src = E.resUrl; $("#fmt_res").hidden = false;
      const ko = r.qcs.filter(q => q && !q.ok).length, li = c => `<li class="${c.ok ? "ok" : "ko"}">${STUDIO.esc(c.nom)} : ${STUDIO.esc(c.texte)}</li>`;
      $("#fmt_bilan").innerHTML = `<ul>${r.tech.controles.map(li).join("")}<li class="info">Fichier : ${r.W}×${r.H}, ${(Math.round(r.cadence * 100) / 100).toString().replace(".", ",")} images/s, ${r.images} images, ${r.codec.startsWith("hvc") ? "HEVC" : "H.264"}, ${(r.blob.size / 1048576).toFixed(1).replace(".", ",")} Mo. Son : ${STUDIO.esc(r.sonNote)}.</li>${r.fidele ? fideleTexte(r) : `<li class="${ko ? "ko" : "ok"}">Contrôles refaits sur la vidéo finale : ${ko ? ko + " scène(s) au-dessus d’un seuil" : "tous sous les seuils"}.</li>`}${zeroTexte(r)}</ul>`;
      MSG("Vidéo créée en " + (r.ms > 90000 ? Math.round(r.ms / 60000) + " min" : Math.round(r.ms / 1000) + " s") + ". Vérifie-la, puis enregistre-la.", 1); $("#fmt_res").scrollIntoView({ behavior: "smooth", block: "nearest" });
      try { if (window.REC && REC.log) REC.log("format_export", { W: r.W, H: r.H, images: r.images, ms: r.ms, codec: r.codec, son: r.son, tech: r.tech.ok, qc: r.qcs.map(q => q && q.ok) }) } catch (e) {}
    } catch (e) { if (E === moi) MSG(e instanceof Annule ? "Création arrêtée." : "Création impossible : " + ((e && e.message) || e) + ". Essaie une résolution plus basse dans les réglages avancés.") }
    finally { try { verrou && verrou.release() } catch (e) {} if (E === moi) occupe(null) }
  }
  function fideleTexte(r) { const f = r.fidele, pc = v => (Math.round(v * 1000) / 10).toString().replace(".", ",") + " %", li = (ok, t) => `<li class="${ok ? "ok" : "ko"}">${STUDIO.esc(t)}</li>`, o = [];
    const cons = Math.min(...f.scenes.map(x => x.mesures.conservation)), def = Math.max(...f.scenes.map(x => x.mesures.etirementMax)), rem = f.scenes.map(x => x.mesures.remplissage);
    if (f.plein) { o.push(li(true, "Plein écran : l’image remplit toute la télé, rien n’est inventé ; " + pc(1 - cons) + " de l’image (" + (E.plans[0].axeExt === "x" ? "haut et bas" : "côtés") + ") hors du cadre, comme demandé."));
      o.push(li(f.verifVisages && !f.coupes.length, f.verifVisages ? "Cadre vérifié image par image : " + (f.coupes.length ? f.coupes.length + " visage(s) coupé(s)" : "aucun visage coupé") + " (" + f.visages + " visages détectés sur " + f.images + " images)." : "Vérification des visages impossible sur cet appareil.")) }
    else o.push(li(cons >= .9999, cons >= .9999 ? "Image filmée gardée à 100 % : rien n’est coupé, rien n’est inventé." : "Recadrage choisi : " + pc(1 - cons) + " de l’image coupée."));
    o.push(li(f.verifVisages && f.max <= 1.0005, f.verifVisages ? "Vérifié image par image (" + f.images + " images, " + f.visages + " visages détectés) : étirement max sous un visage = " + pc(f.max - 1) + "." : "Vérification des visages impossible sur cet appareil."));
    if (f.corrige) o.push(li(true, "Correction automatique faite : " + f.corrige + " visage(s) d’abord repéré(s) sous une zone étirée, protégé(s) puis vidéo refaite."));
    if (f.violations.length) o.push(li(false, f.violations.length + " visage(s) encore sous une zone étirée (premier : image " + f.violations[0].i + ")."));
    o.push(li(def <= FFI.SEUILS.perception + 1e-6, def <= 1.0005 ? "Aucune déformation." : "Étirement max " + pc(def - 1) + " (seuil de perception " + pc(FFI.SEUILS.perception - 1) + ")."));
    if (f.identite.images) o.push(li(f.identite.ok, f.identite.ok ? "Colonnes non étirées identiques à l’original, pixel pour pixel (" + (f.identite.pixels / 1e6).toFixed(1).replace(".", ",") + " millions de pixels contrôlés sur " + f.identite.images + " relevés)." : f.identite.differents + " pixel(s) différent(s) dans les colonnes non étirées (écart max " + f.identite.ecartMax + ")."));
    o.push(li(Math.abs(f.stabilite - 1) < .15, "Stabilité : variations d’une image à l’autre = " + f.stabilite.toFixed(2).replace(".", ",") + " × celles de l’original (1 = aucune ondulation ajoutée)."));
    o.push(`<li class="info">Écran rempli : ${rem.map(pc).join(", ")}${rem.some(v => v < .999) ? " ; le reste en " + (E.reglages.bords === "noir" ? "bandes noires" : "ambiance floue de ta propre image") : ""}.${E.fidele.note ? " " + STUDIO.esc(E.fidele.note) + "." : ""}${f.perte ? " " + STUDIO.esc(f.perte) + "." : ""}</li>`);
    return o.join("") }
  function zeroTexte(r) { const z = r.zero; if (!z) return "";
    if (z.perte) return `<li class="ko">Zéro perte impossible ici : ${STUDIO.esc(z.perte)}. Toute l’image est gardée (rien n’est coupé), mais réduite.</li>`;
    return z.ok ? `<li class="ok">Zéro perte vérifié : sur ${z.images} images contrôlées, les ${(z.pixels / 1e6).toFixed(1).replace(".", ",")} millions de pixels filmés sont identiques à l’original (rien coupé, rien réduit, rien recouvert). Fichier en qualité maximale.</li>`
      : z.images ? `<li class="ko">Contrôle Zéro perte : ${z.differents} pixel(s) différent(s) sur ${z.pixels} (écart max ${z.ecartMax}).</li>` : `<li class="info">Zéro perte : image d’origine posée à l’échelle 1 (contrôle pixel par pixel non applicable à cette taille).</li>` }
  async function enregistrer() { if (!E || !E.res) return; const [rw, rh] = cible(), n = E.nom + "-" + rw + "x" + rh; if (typeof shareBlob === "function") return shareBlob(E.res.blob, typeof uniqName === "function" ? uniqName(n, "mp4") : n + ".mp4"); const a = document.createElement("a"); a.href = E.resUrl; a.download = n + ".mp4"; a.click() }
  /* passe la vidéo au format dans l'atelier d'amélioration existant (netteté, bruit, couleurs, IA, visages…) : rien n'est dupliqué ici */
  function ameliorer() { if (!E || !E.res || typeof loadFile !== "function") return; const [rw, rh] = cible(), f = new File([E.res.blob], E.nom + "-" + rw + "x" + rh + ".mp4", { type: "video/mp4" }); fermer(); try { batch = null } catch (e) {} loadFile(f); window.scrollTo({ top: 0, behavior: "smooth" }) }
  function diagnostic() { const A = E.analyse, L = E.lecteur; return { source: { w: L.w, h: L.h, n: L.n, cadence: +L.cadence.toFixed(3), duree: +L.duree.toFixed(2), lecteur: L.type, codec: L.codec, zone: A.zone }, cible: cible(), sortie: E.sortie, mode: E.reglages.mode, analyse_ms: A.ms, detecteurs: A.detecteurs, appareil: { mobile: AP.mobile, mem: AP.mem, webgpu: AP.webgpu },
    scenes: A.scenes.map((sc, s) => ({ images: sc.n, classe: sc.classe, verrou: sc.verrou, sujets: sc.sujets, methode: E.plans[s].methode, z: E.plans[s].z, fond: E.plans[s].fond, mesures: E.plans[s].mesures, qc: E.qc[s] && { ok: E.qc[s].ok, valeurs: E.qc[s].valeurs, journal: E.qc[s].journal }, parts: E.decors.get(s) && E.decors.get(s).parts })) } }

  return { ouvrir, fermer, charger, lancer, creer, maj, appareil: () => AP, get etat() { return E }, diagnostic, NOMS, _t: { analyser, decider, preparer, construireDecor, rendre, rendu, exporter, controler, OBJ } };
})();
