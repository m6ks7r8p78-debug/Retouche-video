/* Loaded defer after app.js only on the isolated experimental branch. */
(function(){
  'use strict';
  function start(){
    const motion=window.RetoucheLocalMotion,bridge=window.RetoucheMotionDirectorLocal;
    if(!motion?.analyze || !bridge?.mount)return;
    try {window.RetoucheMotionLabUI=bridge.mount({analyzer:motion.analyze});}
    catch(err){console.warn('SmallMotion laboratoire désactivé :',err?.message)}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();