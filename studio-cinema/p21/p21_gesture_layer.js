/* Retouche Cinema P21 — optional fictional micro-gesture control layer.
 * Extends P19 without modifying its original frames or inventing evidence
 * from real people. All movements are procedural 2D controls, not pixels.
 * Uses P15/P20 for an independently adjudicated LOCAL comparison only.
 * No fetch, models, biometrics, personal video or training.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.RetoucheCinemaP21=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const VERSION='retouche-cinema-p21-gesture-layer-v1';
  const LABELS=Object.freeze({
    lower_lip_bite:'lower_lip_bite',
    lip_lick_lower:'lip_lick_lower',
    tongue_visible:'tongue_visible',
    tongue_retract:'tongue_retract'
  });
  const SEGMENTS=Object.freeze({
    lower_lip_bite:Object.freeze({start:4.70,rise:4.78,hold:4.90,end:4.99}),
    lip_lick_lower:Object.freeze({start:7.13,rise:7.23,hold:7.43,end:7.57}),
    tongue_visible:Object.freeze({start:7.08,rise:7.18,hold:7.47,end:7.67}),
    tongue_retract:Object.freeze({start:7.51,rise:7.56,hold:7.60,end:7.69})
  });
  const finite=x=>typeof x==='number'&&Number.isFinite(x);
  const ok=(x,m)=>{if(!x)throw Error(m)};
  const clamp=x=>Math.max(0,Math.min(1,x));
  const smooth=x=>{const u=clamp(x);return u*u*u*(u*(u*6-15)+10)};
  const round=(x,n=6)=>+x.toFixed(n);
  function envelope(t,s){
    if(t<=s.start||t>=s.end)return 0;
    if(t<s.rise)return smooth((t-s.start)/(s.rise-s.start));
    if(t<=s.hold)return 1;
    return 1-smooth((t-s.hold)/(s.end-s.hold));
  }
  function controlsAt(f){
    ok(f&&finite(f.t)&&Array.isArray(f.mouth_xy)&&f.mouth_xy.length===2&&f.mouth_xy.every(finite),'P19 source frame required');
    const t=f.t;
    const bite=envelope(t,SEGMENTS.lower_lip_bite);
    const lick=envelope(t,SEGMENTS.lip_lick_lower);
    const tongue=envelope(t,SEGMENTS.tongue_visible);
    const retract=envelope(t,SEGMENTS.tongue_retract);
    const visible=tongue>=0.07;
    const mouthX=f.mouth_xy[0],mouthY=f.mouth_xy[1];
    // A tongue position is a drawable vector control, NOT a detected landmark.
    const tongueXY=visible?[round(mouthX+.006*lick-.002*retract),round(mouthY+.008*tongue)]:null;
    return {
      p21_lower_lip_fold:round(.006*bite),p21_lower_lip_bite:bite>=.07,
      p21_lip_lick_lower:lick>=.07,p21_lip_lick_strength:round(lick),
      p21_tongue_visible:visible,p21_tongue_extension:round(.008*tongue),
      p21_tongue_retract:retract>=.07,p21_tongue_retract_strength:round(retract),
      p21_tongue_tip_xy:tongueXY,
      p21_generated_semantics:Object.freeze({source:'fictional_procedural',human_gesture_verified:false})
    };
  }
  function generate(P19,options={}){
    ok(P19&&typeof P19.generate==='function'&&typeof P19.auditTrajectories==='function','Real P19 provider required');
    // Explicit allowlist: no input video, uploaded media, coordinates or arbitrary user identity.
    const keys=Object.keys(options);
    ok(keys.every(k=>k==='fps'||k==='seed'), 'Only fps and seed are supported');
    const original=P19.generate({fps:options.fps??60,seed:options.seed??17});
    ok(original.schema==='retouche-cinema-p19-procedural-micromotion-v1'&&
      original.source_video_accessed===false&&original.photographic_frames_generated===0&&
      original.privately_trained===false,'P19 synthetic provenance required');
    const frames=original.frames.map(f=>({...f,...controlsAt(f)}));
    return {...original,kind:'procedural_pose_controls_with_p21_optional_gestures',
      p21_schema:VERSION,p21_source:'synthetic_procedural_not_annotated',
      p21_video_frames_created:0,p21_training_performed:false,
      p21_human_naturalness_verified:false,frames};
  }
  function validate(g,P20){
    ok(P20&&typeof P20.validateGenerated==='function','Real P20 validator required');
    P20.validateGenerated(g);
    ok(g.p21_schema===VERSION&&g.p21_source==='synthetic_procedural_not_annotated'&&
      g.p21_video_frames_created===0&&g.p21_training_performed===false&&
      g.p21_human_naturalness_verified===false,'P21 source/provenance invalid');
    const errors=[],bounds={};
    for(const label of Object.keys(LABELS))bounds[label]=0;
    let maxTongueSpeed=0;
    for(let i=0;i<g.frames.length;i++){
      const f=g.frames[i];
      const expected=controlsAt(f);
      for(const [k,v] of Object.entries(expected)){
        if(k==='p21_generated_semantics'){
          if(f[k]?.source!=='fictional_procedural'||f[k]?.human_gesture_verified!==false)
            errors.push({frame:i,code:'provenance_modified'});
        }else if(JSON.stringify(f[k])!==JSON.stringify(v))errors.push({frame:i,code:'control_modified',field:k});
      }
      for(const label of Object.keys(LABELS)) if(f['p21_'+label]===true)bounds[label]++;
      if(f.p21_lower_lip_bite&&f.phase!=='pause')errors.push({frame:i,code:'bite_outside_pause'});
      if((f.p21_lip_lick_lower||f.p21_tongue_visible||f.p21_tongue_retract)&&f.phase!=='smoke_drift')errors.push({frame:i,code:'tongue_outside_drft'});
      if(f.lip_contact&&(f.p21_lower_lip_bite||f.p21_lip_lick_lower||f.p21_tongue_visible))
        errors.push({frame:i,code:'incompatible_lip_contact'});
      if(f.mouth_smoke&&(f.p21_lower_lip_bite||f.p21_lip_lick_lower||f.p21_tongue_visible))
        errors.push({frame:i,code:'incompatible_smoke_phase'});
      if(i>0&&Array.isArray(f.p21_tongue_tip_xy)&&Array.isArray(g.frames[i-1].p21_tongue_tip_xy)){
        const a=f.p21_tongue_tip_xy,b=g.frames[i-1].p21_tongue_tip_xy;
        maxTongueSpeed=Math.max(maxTongueSpeed,Math.hypot(a[0]-b[0],a[1]-b[1])*g.fps);
      }
    }
    for(const [label,count] of Object.entries(bounds))if(count<3)errors.push({code:'gesture_not_covered',label});
    if(maxTongueSpeed>.45)errors.push({code:'tongue_teleport_speed'});
    return {schema:'retouche-cinema-p21-qa-v1',status:errors.length?'review_required':'synthetic_controls_candidate',
      issues:errors.slice(0,100),issue_count:errors.length,sample_count:g.frames.length,fps:g.fps,
      generated_event_sample_counts:bounds,max_tongue_tip_speed_norm_per_s:round(maxTongueSpeed),
      original_video_read:false,photographic_frames_created:0,
      tongue_anatomy_proven:false,gesture_realism_proven:false};
  }
  function intervals(g,label){
    ok(LABELS[label], 'Unsupported P21 gesture label');
    let start=null; const out=[];
    for(let i=0;i<=g.frames.length;i++){
      const active=i<g.frames.length&&g.frames[i]['p21_'+label]===true;
      if(active&&start===null)start=i;
      if(!active&&start!==null){out.push({start_s:round(start/g.fps,4),end_s:round(i/g.fps,4)});start=null;}
    }
    return out;
  }
  function iou(a,b){
    const overlap=Math.max(0,Math.min(a.end_s,b.end_s)-Math.max(a.start_s,b.start_s));
    const span=Math.max(a.end_s,b.end_s)-Math.min(a.start_s,b.start_s);
    return span?overlap/span:0;
  }
  function compare(doc,g,P15,P20,{localEvaluationAllowed=false,alignmentOffsetS=0}={}){
    ok(localEvaluationAllowed===true,'Local evaluation authorization required');
    ok(P15&&typeof P15.validateProject==='function','Real P15 provider required');
    ok(finite(alignmentOffsetS)&&Math.abs(alignmentOffsetS)<=2,'Manual alignment out of range');
    const audit=validate(g,P20);
    ok(audit.issue_count===0,'P21 controls failed self audit');
    const base=P20.compare(doc,g,P15,{localEvaluationAllowed,alignmentOffsetS});
    const d=P15.validateProject(doc);
    // Reuse the actual P20 privacy and consent gate; never infer consent from a file's existence.
    const accepted=d.events.filter(e=>e.review_status==='adjudicated'&&e.evidence==='visible'&&
      Array.isArray(e.reviewed_by)&&new Set(e.reviewed_by).size>=2);
    const extra=[];
    for(const label of Object.keys(LABELS)){
      const observed=accepted.filter(e=>e.label===label);
      if(!observed.length)continue;
      const generated=intervals(g,label),taken=new Set(),scores=[];
      for(const e of observed){
        let best=-1,quality=0;
        for(let i=0;i<generated.length;i++){
          if(taken.has(i))continue;
          const a={start_s:e.start_s+alignmentOffsetS,end_s:e.end_s+alignmentOffsetS};
          const s=iou(a,generated[i]);
          if(s>quality){quality=s;best=i;}
        }
        if(best>=0&&quality>=.25){taken.add(best);scores.push(quality);}
      }
      extra.push({label,channel:'lips',adjudicated_visible_events:observed.length,
        synthetic_intervals:generated.length,temporal_overlaps:scores.length,
        mean_overlap_of_matches:scores.length?round(scores.reduce((a,b)=>a+b,0)/scores.length,4):null,
        review_required:true,synthetic_only:true});
    }
    const coverage=[...base.coverage,...extra].sort((a,b)=>a.label.localeCompare(b.label));
    return {...base,schema:'retouche-cinema-p21-temporal-comparison-v1',
      base_schema:base.schema,
      covered_by_p21_labels:extra.map(x=>x.label),
      supported_control_labels:[...base.supported_control_labels,...Object.keys(LABELS)],
      coverage,
      missing_controls:base.missing_controls.filter(m=>!LABELS[m.label]),
      temporal_matches_are_not_anatomical_proof:true,
      local_comparison_only:true,rendered_frames_generated:0};
  }
  return Object.freeze({VERSION,LABELS,SEGMENTS,envelope,controlsAt,generate,validate,intervals,compare});
});
