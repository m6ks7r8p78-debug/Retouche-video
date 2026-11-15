/* RetoucheProAI SmallMotion: local advisory bridge, experimental only.
   No fetch, XMLHttpRequest, WebSocket, storage, or analytics. No export changes.
   Consumes the existing SmallMotion 2D detector and an existing local file input.
   The word "candidate" never means a detected hand/object/contact/depth. */
(function (root) {
  'use strict';
  const SOURCE = 'smallmotion_local_2frame_v1';
  const LIMIT_BYTES = 120 * 1024 * 1024;
  const MAX_SIDE = [160, 120];
  const MIN_DELTA_S = 0.105;
  const MAX_ANALYSIS_MS = 6000;
  const ABSTAINS = new Set(['abstain_texture','abstain_matches','abstain_cut_or_flash']);
  const STATES = new Set(['local_motion_candidate','no_supported_local_motion',...ABSTAINS]);

  function eligibility(file, opts = {}) {
    if (!file || typeof file.size !== 'number' || !Number.isFinite(file.size)) return 'no_file';
    if (!/^(video\/|application\/octet-stream$)/.test(file.type || '') && !((file.type||'')==='' && /\.(mp4|mov|m4v|webm)$/i.test(file.name||''))) return 'not_video';
    if (file.size <= 0 || file.size > LIMIT_BYTES) return 'file_out_of_budget';
    if (opts.hidden === true) return 'page_hidden';
    if (opts.framesAPI === false) return 'frames_api_unavailable';
    return null;
  }
  const finite = x => typeof x === 'number' && Number.isFinite(x);
  function observation(result, sample, elapsedMs, resources) {
    if (!result || !STATES.has(result.status) || !sample || !Array.isArray(sample.times) ||
        sample.times.length !== 2 || !sample.times.every(finite) ||
        sample.times[1] - sample.times[0] < MIN_DELTA_S - 0.005 ||
        !Number.isInteger(sample.width) || !Number.isInteger(sample.height) || sample.width < 64 || sample.height < 64 || sample.width > 320 || sample.height > 240) {
      return Object.freeze({status:'abstain_invalid_evidence',provenance:SOURCE,action:'no_automatic_change',candidates:[]});
    }
    const candidates = (Array.isArray(result.candidates)?result.candidates:[]).slice(0,4)
      .filter(c => c && Array.isArray(c.box) && c.box.length === 4 && c.box.every(finite) &&
        c.box[0]>=0 && c.box[1]>=0 && c.box[2]>0 && c.box[3]>0 &&
        c.box[0]+c.box[2]<=sample.width && c.box[1]+c.box[3]<=sample.height)
      .map(c=>({box:c.box.map(v=>Math.round(v)),support:Math.max(0,Math.round(c.support||0))}));
    const detectedStatus = result.status === 'local_motion_candidate' && !candidates.length ? 'abstain_invalid_evidence':result.status;
    const status = resources && resources.state==='abstain' ? 'abstain_resource_budget':detectedStatus;
    return Object.freeze({
      version:1,provenance:SOURCE,status,
      action:'no_automatic_change',confidence:'not_calibrated',
      method:'local_2d_block_matching',
      frames:2,frameTimesSeconds:sample.times.map(t=>+t.toFixed(4)),
      analysisDimensions:[sample.width,sample.height],
      candidates:status==='local_motion_candidate'?candidates:[],
      processorMs:finite(elapsedMs)?+elapsedMs.toFixed(2):null,
      resourceEvaluation:resources || null,
      limitations:'Hypothèses 2D seulement : aucune preuve de mouvement indépendant, de main, de profondeur, de contact ou de préhension.'
    });
  }
  function makeAbortError() { const e = new Error('Analyse interrompue'); e.name='AbortError';return e; }
  function measureSize(w,h,maxSize=MAX_SIDE) {
    if (!finite(w)||!finite(h)||w<=0||h<=0) return null;
    const k=Math.min(maxSize[0]/w,maxSize[1]/h,1);
    const ww=Math.floor(w*k),hh=Math.floor(h*k);
    if (ww<64 || hh<64) return null;
    return [ww,hh];
  }
  // The callback runs only when the local video's decoded frame is presented.
  // We explicitly reject engines without this API instead of guessing timestamps.
  function sampleLocalVideo(file, {signal,documentRef,timeoutMs=MAX_ANALYSIS_MS,maxSize=MAX_SIDE}={}) {
    const doc=documentRef || (typeof document!=='undefined'?document:null);
    if (!doc || !doc.createElement) return Promise.reject(Error('Document indisponible'));
    const prelim=eligibility(file,{hidden:doc.visibilityState==='hidden'});
    if(prelim)return Promise.reject(Error(prelim));
    const video=doc.createElement('video');
    if(typeof video.requestVideoFrameCallback!=='function')return Promise.reject(Error('frames_api_unavailable'));
    const cv=doc.createElement('canvas');
    const ctx=cv.getContext('2d',{willReadFrequently:true});
    if(!ctx)return Promise.reject(Error('canvas_unavailable'));
    video.muted=true;video.playsInline=true;video.preload='auto';video.setAttribute('playsinline','');
    video.style.cssText='position:fixed;left:-4px;top:-4px;width:2px;height:2px;opacity:.01;pointer-events:none';
    const url=URL.createObjectURL(file);
    return new Promise((resolve,reject)=>{
      let finished=false,handle=null,timer=null,times=[],frames=[],size=null;
      function cleanup(){
        if(handle!==null && typeof video.cancelVideoFrameCallback==='function')video.cancelVideoFrameCallback(handle);
        if(timer!==null)clearTimeout(timer);
        if(signal)signal.removeEventListener('abort',aborted);
        doc.removeEventListener('visibilitychange',hidden);
        video.removeEventListener('error',mediaError);
        try{video.pause();video.removeAttribute('src');video.load()}catch(_){}
        video.remove();URL.revokeObjectURL(url);cv.width=0;cv.height=0;
      }
      function end(error,value){if(finished)return;finished=true;cleanup();error?reject(error):resolve(value)}
      function aborted(){end(makeAbortError())}
      function hidden(){if(doc.visibilityState==='hidden')end(Error('page_hidden'))}
      function mediaError(){end(Error('media_decode_error'))}
      if(signal?.aborted){end(makeAbortError());return}
      signal?.addEventListener('abort',aborted,{once:true});
      doc.addEventListener('visibilitychange',hidden);
      video.addEventListener('error',mediaError);
      const onFrame=(now,meta)=>{
        if(finished)return;
        const t=meta?.mediaTime;
        if(finite(t) && video.videoWidth>0 && video.videoHeight>0 && (times.length===0 || t-times[0]>=MIN_DELTA_S)){
          if(!size){size=measureSize(video.videoWidth,video.videoHeight,maxSize);if(!size){end(Error('aspect_ratio_unsupported'));return}
             cv.width=size[0];cv.height=size[1];}
          try{ctx.drawImage(video,0,0,size[0],size[1]);frames.push(ctx.getImageData(0,0,size[0],size[1]));times.push(t)}
          catch(_){end(Error('canvas_read_failed'));return}
          if(frames.length===2){end(null,{a:frames[0],b:frames[1],times,width:size[0],height:size[1]});return}
        }
        handle=video.requestVideoFrameCallback(onFrame);
      };
      doc.body.appendChild(video);
      timer=setTimeout(()=>end(Error('sample_timeout')),Math.min(10000,Math.max(1000,timeoutMs)));
      handle=video.requestVideoFrameCallback(onFrame);
      // play called during the button-click handler: do not lose iOS gesture before async work.
      video.src=url;
      try{video.load();const p=video.play();if(p?.catch)p.catch(()=>end(Error('autoplay_or_codec_rejected')))}
      catch(_){end(Error('autoplay_or_codec_rejected'))}
    });
  }
  function mount({doc,analyzer,inputId='f',pickId='pick'}={}) {
    const d=doc || document;
    if(!d || !d.getElementById || typeof analyzer!=='function')throw Error('Analyseur ou document absent');
    const input=d.getElementById(inputId),pick=d.getElementById(pickId);
    if(!input||!pick)throw Error('Import vidéo introuvable : ne pas remplacer le parcours existant');
    if(d.getElementById('smallmotion-app-panel'))return null;
    const panel=d.createElement('section');panel.id='smallmotion-app-panel';
    panel.setAttribute('aria-label','Observation de mouvement locale expérimentale');
    panel.style.cssText='padding:16px;margin:12px 0;border:1px solid #4b525d;border-radius:14px;background:#202125;color:#f4f5f6;max-width:600px;box-sizing:border-box';
    panel.hidden=true;
    const title=d.createElement('strong');title.textContent='SmallMotion · Analyse de mouvement locale';title.style.cssText='display:block;font-size:16px;font-weight:750;line-height:1.45;letter-spacing:.01em;color:#fff';panel.append(title);
    const desc=d.createElement('p');desc.textContent='Analyse consultative de deux images seulement. Ne modifie ni le traitement ni l’export.';desc.style.cssText='font-size:13px;line-height:1.5;color:#d4d7dc;margin:10px 0';panel.append(desc);
    const button=d.createElement('button');button.type='button';button.textContent='Analyser localement';button.style.cssText='appearance:none;min-height:44px;padding:10px 16px;border:1px solid #f0b65e;border-radius:10px;background:#f5b351;color:#1e1710;font-size:14px;font-weight:750;cursor:pointer';panel.append(button);
    const cancel=d.createElement('button');cancel.type='button';cancel.textContent='Annuler';cancel.hidden=true;cancel.style.cssText='min-height:44px;margin-left:8px;padding:10px 14px;border:1px solid #808b9a;border-radius:10px;background:#353942;color:#fff;font-weight:650';panel.append(cancel);
    const status=d.createElement('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.style.cssText='font-size:13px;line-height:1.55;color:#e3ebed;margin:14px 0';panel.append(status);
    const detail=d.createElement('details');const summary=d.createElement('summary');summary.textContent='Diagnostic de l’analyse (sans images)';const pre=d.createElement('pre');pre.style.cssText='font-size:11px;white-space:pre-wrap;overflow-wrap:anywhere';detail.append(summary,pre);panel.append(detail);
    // The import buttons live in a horizontal .drop-acts row; never insert
    // the advisory panel into it (on iPhone it shrinks both original actions).
    // Place the panel directly below the complete drop zone.
    const drop=d.getElementById('drop');
    if(drop?.parentNode)drop.parentNode.insertBefore(panel,drop.nextSibling);
    else pick.parentNode.parentNode.insertBefore(panel,pick.parentNode.nextSibling);
    let chosen=null,controller=null,last=null,nonce=0,profile='full';
    const reset=()=>{nonce++;if(controller)controller.abort();controller=null;button.disabled=false;cancel.hidden=true;last=null;pre.textContent='';};
    input.addEventListener('change',e=>{
      reset();profile='full';const files=Array.from(e.target.files||[]);
      // Batch import stays controlled by app; do not silently choose one video.
      chosen=files.length===1?files[0]:null;panel.hidden=files.length===0;button.disabled=!chosen;
      status.textContent=chosen?'Vidéo sélectionnée. Analyse facultative, entièrement locale.':
        'Import multiple : analyse suspendue pour ne pas désynchroniser le montage.';
    },true);
    cancel.onclick=()=>{reset();status.textContent='Analyse annulée. Vidéo originale inchangée.'};
    d.addEventListener('visibilitychange',()=>{if(d.visibilityState==='hidden'&&controller){reset();status.textContent='Analyse interrompue : page masquée.'}});
    button.onclick=async()=>{
      if(controller)return;
      const error=eligibility(chosen,{hidden:d.visibilityState==='hidden',framesAPI:typeof d.createElement('video').requestVideoFrameCallback==='function'});
      if(error){status.textContent='Analyse non lancée : '+error;return;}
      const run=++nonce;controller=new AbortController();button.disabled=true;cancel.hidden=false;status.textContent='Analyse de deux images sur l’appareil…';
      try{
        const sampleT0=performance.now();
        const maxSize=profile==='reduced'?[128,96]:MAX_SIDE;
        const sample=await sampleLocalVideo(chosen,{signal:controller.signal,documentRef:d,maxSize});
        if(run!==nonce)return;
        const captureMs=performance.now()-sampleT0;
        const runner=root.RetoucheMotionWorkerRunner;
        if(!runner || typeof runner.run!=='function')throw Error('worker_runner_unavailable');
        const execution=await runner.run(sample.a,sample.b,{signal:controller.signal,analyzer});
        if(run!==nonce)return;
        const result=execution.result,elapsed=execution.elapsedMs;
        const evaluator=root.RetoucheMotionResourceGuard?.assess;
        // Never promote a candidate if the resource evaluator is absent or broken.
        const resources=typeof evaluator==='function'?evaluator({captureMs,processorMs:elapsed,width:sample.width,height:sample.height,profile,visibility:d.visibilityState,workerTransferBytes:execution.transferredBytes}):null;
        let evidence=resources?observation(result,sample,elapsed,resources):Object.freeze({status:'abstain_resource_guard_unavailable',provenance:SOURCE,action:'no_automatic_change',candidates:[]});
        // Worker-side errors/timeouts cannot be promoted to a genuine detector conclusion.
        if(execution.processingPath==='worker_timeout'||execution.processingPath==='worker_error')
          evidence=Object.freeze({...evidence,status:result.status,candidates:[]});
        evidence=Object.freeze({...evidence,processingPath:execution.processingPath,workerComputeMs:execution.computeMs==null?null:+execution.computeMs.toFixed(2),
          processingWallMs:+elapsed.toFixed(2),transferredBytes:execution.transferredBytes,
          fallbackReason:execution.fallbackReason||null});
        if(resources?.nextProfile==='reduced')profile='reduced';
        last=evidence;
        // Local-only advisory data; never forwarded to DIAG/send, storage or export.
        pre.textContent=JSON.stringify(evidence,null,2);
        // The diagnostic contains timings only; it never includes pixels, file names or paths.
        status.textContent=evidence.status==='abstain_resource_budget'?'Analyse trop coûteuse ou mesure invalide : aucune conclusion.':evidence.status==='abstain_resource_guard_unavailable'?'Protection de ressources indisponible : aucune conclusion.':evidence.status==='local_motion_candidate'
          ? `${evidence.candidates.length} région(s) de mouvement possible. Aucun geste ni objet identifié.`
          :evidence.status.startsWith('abstain')?'Observations insuffisantes : aucune conclusion automatique.'
          :'Aucun petit mouvement étayé dans ces deux images. Aucun traitement automatique.';
      }catch(e){if(run===nonce)status.textContent=e?.name==='AbortError'?'Analyse annulée.':`Analyse interrompue : ${String(e?.message||e)}`}
      finally{if(run===nonce){controller=null;button.disabled=false;cancel.hidden=true}}
    };
    return {panel,observe:()=>last,cancel:reset};
  }
  const api=Object.freeze({eligibility,observation,measureSize,sampleLocalVideo,mount});
  root.RetoucheMotionDirectorLocal=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);