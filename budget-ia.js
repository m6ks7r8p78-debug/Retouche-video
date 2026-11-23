/* Politique de latence IA — pas de traitement local de plusieurs heures.
   Le calcul est volontairement conservateur : une estimation ne garantit pas un délai.
   Le preview d'une région native sert à MESURER le moteur avant tout export. */
var IABUDGET = (() => {
  const LIMIT_SEC = 600; // temps de traitement local maximum visé : 10 minutes
  function estimate(o) {
    const W = Math.max(1, Number(o.w) || 1), H = Math.max(1, Number(o.h) || 1);
    const OW = Math.max(1, Number(o.ow) || W), OH = Math.max(1, Number(o.oh) || H);
    const fps = Math.min(60, Math.max(1, Number(o.fps) || 30));
    const frames = Math.max(1, Math.ceil(Math.max(.05, Number(o.duration) || .05) * fps));
    /* Les images propagées restent coûteuses : IAK travaille encore pixel par pixel en JavaScript. */
    const keys = o.iak === false ? frames : Math.max(1, Math.ceil(frames / 3.5));
    const observed = Number(o.msPerMP) || 0;
    const ms = observed > 0 ? Math.max(25000, observed) : 125000;
    const mp = W * H / 1e6, outMP = OW * OH / 1e6;
    const network = keys * mp * (ms / 1000) * (o.cascade ? 2 : 1) * (o.tiled ? 5 : 3.8);
    const propagation = Math.max(0, frames - keys) * outMP * 1.5;
    const other = 20 + frames * outMP * .11;
    const sec = Math.ceil(network + propagation + other);
    return { sec, frames, keys, sourceMP: mp, outputMP: outMP, measured: observed > 0, allowed: sec <= LIMIT_SEC };
  }
  function label(seconds) {
    if (!(seconds >= 0) || !Number.isFinite(seconds)) return "durée inconnue";
    return seconds < 60 ? "moins d’une minute" : "au moins " + Math.ceil(seconds / 60) + " min estimées";
  }
  return { estimate, label, LIMIT_SEC };
})();
