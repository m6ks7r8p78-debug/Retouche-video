/* Retouche Cinema P10 — two independent annotations, local only, no remote calls.
 * Comparisons NEVER prove action realism or training eligibility.
 */
(function(root,factory){ const api=factory(); if(typeof module!=='undefined'&&module.exports)module.exports=api;root.RetoucheP10=api; })(typeof window!=='undefined'?window:globalThis,function(){
'use strict';
const CHANNELS=new Set(['main','doigts','poignet','cigarette','filtre','levres','joues','regard','paupieres','tete','torse','fumee','audio','autre']);
const PHASES=new Set(['preparation','approche','contact','inspiration','maintien','retrait','pause','expiration','dispersion','regard_camera','clignement','autre']);
const VISIBILITY=new Set(['observe','incertain','non_visible']);
function goodNumber(n){return typeof n==='number' && Number.isFinite(n)}
function validate(p){
 if(!p||p.schema!=='retouche-cinema-p9-private-human-annotations-v1'||!p.source||!goodNumber(p.source.duration_s)||p.source.duration_s<=0||!Array.isArray(p.annotations)||p.annotations.length>20000)throw Error('Export P9 incorrect');
 for(const a of p.annotations){if(!a||!CHANNELS.has(a.channel)||!PHASES.has(a.phase)||!VISIBILITY.has(a.visibility)||!goodNumber(a.start_s)||!goodNumber(a.end_s)||a.start_s<0||a.end_s<=a.start_s||a.end_s>p.source.duration_s+.12)throw Error('Annotation incorrecte');
  if(a.point!==null&&a.point!==undefined&&(!Array.isArray(a.point)||a.point.length!==2||a.point.some(v=>!goodNumber(v)||v<0||v>1)))throw Error('Point incorrect');}
 return p;
}
function iou(a,b){const inter=Math.max(0,Math.min(a.end_s,b.end_s)-Math.max(a.start_s,b.start_s));return inter/Math.max(a.end_s-a.start_s+b.end_s-b.start_s-inter,1e-9)}
function compare(A,B){validate(A);validate(B);let a=A.source,b=B.source;
 if(a.video_id&&b.video_id&&a.video_id!==b.video_id)throw Error('Deux identifiants vidéo différents');
 if(a.local_filename&&b.local_filename&&a.local_filename!==b.local_filename)throw Error('Deux fichiers vidéo différents');
 if(Math.abs(a.duration_s-b.duration_s)>.20)throw Error('Durées de source incompatibles');
 const x=A.annotations,y=B.annotations,candidates=[];
 x.forEach((r,i)=>y.forEach((s,j)=>{if(r.channel!==s.channel||r.phase!==s.phase)return;const inter=iou(r,s),delta=Math.abs((r.start_s+r.end_s-s.start_s-s.end_s)/2);if(inter>=.35||delta<=.15)candidates.push({i,j,inter,delta});}));
 candidates.sort((a,b)=>b.inter-a.inter||a.delta-b.delta);
 const usedA=new Set(),usedB=new Set(),matches=[],disagreements=[];
 for(const c of candidates){if(usedA.has(c.i)||usedB.has(c.j))continue;usedA.add(c.i);usedB.add(c.j);const r=x[c.i],s=y[c.j],issues=[];
  if(r.visibility!==s.visibility)issues.push('visibilité différente');
  if(r.channel==='fumee'&&(r.smoke_origin||'unknown')!==(s.smoke_origin||'unknown'))issues.push('origine de fumée différente');
  if(r.point&&s.point&&Math.hypot(r.point[0]-s.point[0],r.point[1]-s.point[1])>.08)issues.push('position spatiale différente');
  if(Math.abs(r.start_s-s.start_s)>.25||Math.abs(r.end_s-s.end_s)>.25)issues.push('décalage temporel');
  const item={a_index:c.i,b_index:c.j,channel:r.channel,phase:r.phase,overlap:Number(c.inter.toFixed(3)),issues};matches.push(item);if(issues.length)disagreements.push(item);
 }
 x.forEach((r,i)=>{if(!usedA.has(i))disagreements.push({a_index:i,b_index:null,channel:r.channel,phase:r.phase,issues:['non retrouvé chez B']});});
 y.forEach((r,i)=>{if(!usedB.has(i))disagreements.push({a_index:null,b_index:i,channel:r.channel,phase:r.phase,issues:['non retrouvé chez A']});});
 const t=matches.length,p=(t+y.length-usedB.size)?t/(t+y.length-usedB.size):null,r=(t+x.length-usedA.size)?t/(t+x.length-usedA.size):null;
 const f=(p!==null&&r!==null&&p+r>0)?2*p*r/(p+r):null;
 return {schema:'retouche-cinema-p10-independent-annotation-audit-v1',comparison_type:'two_human_annotation_exports_not_ground_truth',source:{video_id:a.video_id||b.video_id||null,duration_s:a.duration_s},counts:{reviewer_a:x.length,reviewer_b:y.length,matched:t,disagreements:disagreements.length},event_matching_f1:f===null?null:Number(f.toFixed(4)),matched:matches,disagreements,independent_human_adjudication:'REQUIRED',ready_for_training:false,consensus_proves_realism:false,source_pixels_or_sound_exported:false};
}
return Object.freeze({validate,compare});
});

