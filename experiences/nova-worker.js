/* NOVA Worker — traitements locaux dans un thread isolé.
 * Traitement non génératif, sans fetch/transmission ni données personnelles persistées.
 */
"use strict";
importScripts("nova-decision.js","nova-zones.js");
self.onmessage=(event)=>{
 const {id,image,size}=event.data||{};
 if(!image||!Number.isInteger(image.width)||!Number.isInteger(image.height)||!image.data){
   self.postMessage({id,ok:false,erreur:"Image invalide"});return;
 }
 try{
  const result=NOVA_ZONES.restituer(image,{size:size||128,arbitre:NOVA_DECISION});
  self.postMessage({id,ok:true,width:result.width,height:result.height,
    data:result.data,zones:result.zones,bilan:result.bilan},[result.data.buffer]);
 }catch(err){self.postMessage({id,ok:false,erreur:String(err?.message||err)})}
};
