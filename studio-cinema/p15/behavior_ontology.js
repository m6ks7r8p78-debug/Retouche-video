/* Retouche Cinema P15: observable behavior annotation, not automatic action detection.
 * No private images, video names, people or network access. CommonJS + browser global.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object' && module.exports) module.exports=api;
  else root.RetoucheBehaviorP15=api;
})(typeof self!=='undefined'?self:globalThis,function(){
'use strict';
const VERSION='retouche-cinema-behavior-p15-v1';
const CHANNELS=Object.freeze({
  face:['gaze_camera','gaze_away','gaze_shift','blink','eyebrow_raise','head_turn','head_tilt','expression_change'],
  lips:['lip_purse','lip_seal_on_filter','upper_lip_bite','lower_lip_bite','lip_lick_upper','lip_lick_lower','tongue_visible','tongue_retract','jaw_open','jaw_close','mouth_soften'],
  cheeks:['cheek_tension','cheek_relaxation'],
  hands:['hand_raise','hand_lower','hand_reposition','finger_grip_adjust','wrist_rotate','elbow_move','cigarette_to_lips','cigarette_release'],
  object:['cigarette_held','filter_contact','ember_glow','tip_smoke'],
  breath:['chest_expand_observed','chest_relax_observed','audible_inhale','audible_exhale','breath_uncertain'],
  smoke:['mouth_smoke_onset','mouth_smoke_flow','smoke_drift','smoke_dissipate'],
  body:['shoulder_shift','posture_change'],
  audio:['voice','nonverbal_sound','background_sound']
});
const BEHAVIOR_CHANNELS=Object.keys(CHANNELS);
const ALL_LABELS=Object.freeze(Object.values(CHANNELS).flat());
const labelChannel=Object.freeze(Object.fromEntries(Object.entries(CHANNELS).flatMap(([ch,names])=>names.map(name=>[name,ch]))));
const EVIDENCE=['visible','audible','estimated','not_visible','uncertain'];
const REVIEW=['unreviewed','review_1','review_2','adjudicated'];
const MAX_DURATION=60;
function finite(v,label){if(typeof v!=='number'||!Number.isFinite(v))throw new Error('Invalid '+label);return v;}
function event(raw,maxDuration){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Invalid event');
 if(!ALL_LABELS.includes(raw.label))throw new Error('Unknown behavior label');
 if(raw.channel!==labelChannel[raw.label])throw new Error('Channel/label mismatch');
 const start=finite(raw.start_s,'start_s'),end=finite(raw.end_s,'end_s');
 if(start<0||end<=start||end>maxDuration+1e-6||end-start>MAX_DURATION)throw new Error('Invalid time interval');
 if(!EVIDENCE.includes(raw.evidence))throw new Error('Missing evidence type');
 if(!REVIEW.includes(raw.review_status))throw new Error('Review status required');
 if(typeof raw.annotator_id!=='string'||!raw.annotator_id.trim())throw new Error('An independent reviewer ID is required');
 if(raw.confidence!==null && raw.confidence!==undefined && (finite(raw.confidence,'confidence')<0||raw.confidence>1))throw new Error('Invalid confidence');
 if(raw.xy!==undefined && ( !Array.isArray(raw.xy)||raw.xy.length!==2||raw.xy.some(n=>typeof n!=='number'||!Number.isFinite(n)||n<0||n>1)))throw new Error('Invalid normalized 2D point');
 if(['audible_inhale','audible_exhale'].includes(raw.label) && raw.evidence==='visible')throw new Error('Cannot label audible breathing with visible-only evidence');
 if(raw.evidence==='audible' && !['breath','audio'].includes(raw.channel))throw new Error('Audible proof cannot establish visual-only event');
 if(['lip_lick_upper','lip_lick_lower','tongue_visible','tongue_retract'].includes(raw.label) && raw.evidence==='audible')throw new Error('Tongue and lip actions need visible evidence or uncertainty');
 if(raw.review_status==='adjudicated' && (!Array.isArray(raw.reviewed_by)||new Set(raw.reviewed_by).size<2))throw new Error('Adjudication requires two independent reviewers');
 return Object.freeze({id:String(raw.id||''),channel:raw.channel,label:raw.label,start_s:start,end_s:end,
 evidence:raw.evidence,review_status:raw.review_status,annotator_id:raw.annotator_id,confidence:raw.confidence??null,
 ...(raw.xy?{xy:raw.xy}:{}),...(raw.reviewed_by?{reviewed_by:raw.reviewed_by}:{}),notes:String(raw.notes||'').slice(0,300)});
}
function validateProject(input){
 if(!input||input.schema!==VERSION)throw new Error('Invalid schema');
 if(input.media_scope!=='private_local'||input.allow_network!==false||input.export_media!==false)throw new Error('Privacy gates violated');
 if(input.source_type!=='private_authorized_video' && input.source_type!=='fictional_synthetic')throw new Error('Unrecognized source type');
 if(typeof input.file_name!=='string'||input.file_name.trim().length===0)throw new Error('Missing file name');
 if(typeof input.duration_s!=='number'||!Number.isFinite(input.duration_s)||input.duration_s<=0||input.duration_s>86400)throw new Error('Invalid duration');
 if(!Array.isArray(input.events))throw new Error('Missing events');
 if(input.events.length>20000)throw new Error('Too many events');
 const events=input.events.map(x=>event(x,input.duration_s));
 const ids=events.filter(e=>e.id).map(e=>e.id);
 if(ids.length!==new Set(ids).size)throw new Error('Duplicate event ID');
 if(input.ready_for_training===true)throw new Error('Training eligibility must be adjudicated outside this annotation tool');
 return {schema:VERSION,media_scope:'private_local',allow_network:false,export_media:false,source_type:input.source_type,
 file_name:input.file_name,duration_s:input.duration_s,adult_status:input.adult_status||'unverified',
 events,ready_for_training:false,identity_proven:false,semantic_action_verified:false,
 subjective_mood_is_director_choice:true};
}
function missingCoverage(doc){const d=validateProject(doc),groups=new Set(d.events.filter(x=>x.evidence==='visible'||x.evidence==='audible').map(x=>x.channel));
 return {channels_seen:[...groups].sort(),channels_to_review:BEHAVIOR_CHANNELS.filter(x=>!groups.has(x)),
 observed_events:d.events.filter(x=>x.evidence==='visible'||x.evidence==='audible').length,
 uncertain_events:d.events.filter(x=>x.evidence==='estimated'||x.evidence==='uncertain'||x.evidence==='not_visible').length,
 label_count:new Set(d.events.map(x=>x.label)).size};
}
function overlaps(a,b){return Math.max(0,Math.min(a.end_s,b.end_s)-Math.max(a.start_s,b.start_s));}
function similarity(a,b,tolerance=0.15){if(a.label!==b.label||a.channel!==b.channel)return 0;
 const len=Math.max(a.end_s,b.end_s)-Math.min(a.start_s,b.start_s);
 return len===0?1:Math.max(0,(overlaps(a,b)+tolerance)/len);
}
function compareReviews(doc,annotatorA,annotatorB){const d=validateProject(doc);
 if(!annotatorA||!annotatorB||annotatorA===annotatorB)throw new Error('Two distinct annotators required');
 const a=d.events.filter(e=>e.annotator_id===annotatorA),b=d.events.filter(e=>e.annotator_id===annotatorB);
 let matches=0;const remaining=new Set(b.map((_,i)=>i));const disagreements=[];
 for(const x of a){let best=-1,score=0;for(const j of remaining){const s=similarity(x,b[j]);if(s>score){score=s;best=j;}}
 if(best>=0&&score>=0.65){matches++;remaining.delete(best);}else disagreements.push({annotator:annotatorA,label:x.label,start_s:x.start_s,end_s:x.end_s});}
 for(const j of remaining){const x=b[j];disagreements.push({annotator:annotatorB,label:x.label,start_s:x.start_s,end_s:x.end_s});}
 return {annotator_a:annotatorA,annotator_b:annotatorB,matched:matches,disagreements,
 agreement_ratio:(a.length+b.length)?Number((2*matches/(a.length+b.length)).toFixed(3)):null,
 training_ready:false,labels_are_not_inferred_intentions:true};
}
function build(fileName,duration,sourceType='private_authorized_video'){
 return validateProject({schema:VERSION,media_scope:'private_local',allow_network:false,export_media:false,
 source_type:sourceType,file_name:fileName,duration_s:duration,adult_status:'unverified',ready_for_training:false,events:[]});
}
return {VERSION,CHANNELS,ALL_LABELS,BEHAVIOR_CHANNELS,EVIDENCE,REVIEW,build,event,validateProject,missingCoverage,overlaps,similarity,compareReviews};
});
