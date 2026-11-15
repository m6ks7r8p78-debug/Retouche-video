/* Retouche Cinema AI P19 — procedural 60 Hz motion controls, not photorealistic film.
 * All subjects fictional adults. Outputs generated 2D pose/state samples, not camera frames,
 * no private media, no biometrics, no network and no trained neural model.
 */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RetoucheP19 = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  const VERSION = 'retouche-cinema-p19-procedural-micromotion-v1';
  const DEFAULTS = Object.freeze({ fps: 60, duration_s: 8, mode: 'smoking', fictional_adult: true, seed: 17 });
  const PHASES = Object.freeze([
    {name:'approach', start:0, end:1.55},
    {name:'contact', start:1.55, end:1.85},
    {name:'inhale', start:1.85, end:3.50},
    {name:'release', start:3.50, end:4.65},
    {name:'pause', start:4.65, end:5.10},
    {name:'exhale', start:5.10, end:6.85},
    {name:'smoke_drift', start:6.85, end:8.00}
  ]);
  const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
  const lerp=(a,b,u)=>a+(b-a)*u;
  const smooth=(u)=>{u=clamp(u);return u*u*u*(u*(u*6-15)+10)}; // C2 smooth starts/stops
  const finite=(x)=>typeof x==='number'&&Number.isFinite(x);
  const p2=(x,y)=>[+x.toFixed(7),+y.toFixed(7)];
  const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
  const round=(x,n=5)=>+x.toFixed(n);
  function phaseAt(t) { return PHASES.find(p=>t>=p.start && t<p.end)?.name || (t===8?'smoke_drift':null); }
  function interpolate(t,start,end){return smooth((t-start)/(end-start));}
  function validateConfig(options={}){
    const c={...DEFAULTS,...options};
    if(c.fps!==45&&c.fps!==60)throw new RangeError('Only 45 or 60 source poses per second permitted');
    if(c.duration_s!==8 || c.mode!=='smoking' || c.fictional_adult!==true)throw new Error('P19 only supports fixed-duration fictional-adult pilot');
    if(!Number.isInteger(c.seed)||c.seed<0||c.seed>65535)throw new Error('invalid reproducibility seed');
    return c;
  }
  function smokeParticles(t, mouth, seed){
    if(t<5.10)return [];
    const particles=[];
    for(let i=0;i<26;i++){
      const birth=5.10+i*0.095;
      const age=t-birth;
      if(age<0 || age>1.6)continue;
      // Several overlapping wisps; smoke origin is mouth, not a frame-to-frame teleported cloud.
      const wobble=Math.sin((i*1.618+seed*.013)+age*4.1);
      particles.push({x:round(mouth[0]+.016*age+.004*wobble,6), y:round(mouth[1]-.024*age-.008*age*age,6),
        age_s:round(age,4), radius:round(.0025+.009*age,5), opacity:round(.36*Math.sin(Math.PI*clamp(age/1.6)),5)});
    }
    return particles;
  }
  function poseAt(t, c){
    if(!finite(t)||t<0||t>=8)throw new RangeError('time outside trajectory');
    const phase=phaseAt(t);
    const approach=interpolate(t,0,1.55);
    const retreat=interpolate(t,3.50,4.65);
    const handProgress=approach*(1-retreat);
    const inhale=phase==='inhale'?Math.sin(Math.PI*clamp((t-1.85)/1.65)):0;
    const exhale=phase==='exhale'?Math.sin(Math.PI*clamp((t-5.10)/1.75)):0;
    const breathing=Math.sin(2*Math.PI*(t*.33)+c.seed*.0001);
    const eyelid=Math.max(Math.exp(-Math.pow((t-2.65)/.065,2)),Math.exp(-Math.pow((t-5.63)/.075,2)));
    const headX=.0014*Math.sin(2*Math.PI*t*.16+.3);
    const headY=.0018*Math.sin(2*Math.PI*t*.20+.8);
    const mouth=p2(.50+headX,.40+headY-.0015*inhale+.0028*exhale);
    // Positions are the object filter tip, not a guessed mouth bounding box.
    const filter=p2(lerp(.39,mouth[0]-.008,handProgress),lerp(.73,mouth[1]+.008,handProgress));
    const hand=p2(filter[0]-.038+.003*Math.sin(t*.8),filter[1]+.025);
    const lipOpening=phase==='inhale'?.0008+inhale*.0007:phase==='contact'?.002:
      phase==='exhale'?.009+.011*exhale:phase==='smoke_drift'?.004:.003;
    const cheekDraw=inhale*.012; // explicit dynamic cheek control, not learned physiology
    const gazeShift=Math.sin(t*1.3)*.002+(.005*Math.sin(Math.PI*interpolate(t,4.65,5.10)));
    const lipContact=(phase==='contact'||phase==='inhale');
    const mouthSmoke=phase==='exhale';
    return {
      t:round(t,7), phase, mouth_xy:mouth,filter_xy:filter,hand_xy:hand,
      fingers_xy:p2(hand[0]-.009,hand[1]-.005),
      lip_contact:lipContact,lip_shape:phase==='inhale'?'sealed':phase==='exhale'?'rounded':phase==='pause'?'relaxed':'parted',
      lip_opening:round(lipOpening,6),cheek_draw:round(cheekDraw,6),
      cheek_motion:phase==='inhale'?'subtle_visible':'not_observed',
      shoulder_breath:round(.003*breathing+.010*inhale,6),
      brow_micro_raise:round(.002*Math.sin(t*.82+.3),6),
      head_tilt_deg:round(1.5*Math.sin(t*.35+.7),5),
      soft_smile:round(.18+.045*Math.sin(t*.55+.4),5),
      gaze_camera:true,gaze_xy:p2(.5+gazeShift,.5+.001*Math.sin(t*.7)),
      blink:eyelid>.85,eyelid_closure:round(eyelid,6),
      wrist_rotation_deg:round(10+15*handProgress+2*Math.sin(t*.8),5),
      cigarette_angle_deg:round(-18+10*handProgress,5),
      mouth_smoke:mouthSmoke,smoke_origin_xy:mouthSmoke?p2(mouth[0]+.002,mouth[1]):null,
      smoke_particles:smokeParticles(t,mouth,c.seed),
      breath_audio_state:phase==='inhale'?'in':phase==='exhale'?'out':'none',
      generated_control_pose:true, pixel_frame_generated:false,
      verified_human_motion:false
    };
  }
  function generate(options={}){
    const c=validateConfig(options),n=c.fps*c.duration_s;
    const frames=Array.from({length:n},(_,i)=>poseAt(i/c.fps,c));
    return {schema:VERSION,kind:'procedural_pose_controls',source:'fictional_synthetic_no_person',
      interpretation:'original kinematic controls, not original filmed or AI-rendered photographic frames',
      fps:c.fps,duration_s:c.duration_s,seed:c.seed,
      sample_count:n,pose_samples_generated:n,photographic_frames_generated:0,
      interpolated_photographic_frames:0,privately_trained:false,source_video_accessed:false,
      phases:PHASES.map(p=>({...p})),frames};
  }
  function auditTrajectories(g,opts={}){
    if(!g||g.schema!==VERSION||!Array.isArray(g.frames)||g.frames.length<4)throw Error('Invalid P19 trajectory');
    const f=g.frames,fps=g.fps; if(![45,60].includes(fps)||f.length!==fps*8)throw Error('P19 sample count invalid');
    const issues=[]; let maxSpeed=0,maxAcceleration=0,maxJerk=0;
    const vel=[];
    for(let i=0;i<f.length;i++){
      const p=f[i]; if(p.phase!==phaseAt(i/fps)) issues.push({type:'phase_mismatch',frame:i});
      if(!p.generated_control_pose||p.pixel_frame_generated)issues.push({type:'provenance_invalid',frame:i});
      if(p.mouth_smoke && p.phase!=='exhale')issues.push({type:'premature_smoke',frame:i});
      if(p.lip_contact&&dist(p.filter_xy,p.mouth_xy)>.04)issues.push({type:'contact_misalignment',frame:i});
      if(dist(p.filter_xy,p.hand_xy)>.15)issues.push({type:'prop_detaches_from_fingers',frame:i});
      if(i>0){let dt=p.t-f[i-1].t;
        if(!(dt>.001&&Math.abs(dt-1/fps)<.0001))issues.push({type:'broken_timestamps',frame:i});
        const v=(p.filter_xy[0]-f[i-1].filter_xy[0])/dt;
        const vy=(p.filter_xy[1]-f[i-1].filter_xy[1])/dt;
        vel.push([v,vy]);maxSpeed=Math.max(maxSpeed,Math.hypot(v,vy));
        if(vel.length>1){const a=Math.hypot((v-vel.at(-2)[0])/dt,(vy-vel.at(-2)[1])/dt);maxAcceleration=Math.max(maxAcceleration,a)}
        if(vel.length>2){const a0=[(vel.at(-2)[0]-vel.at(-3)[0])/dt,(vel.at(-2)[1]-vel.at(-3)[1])/dt];const a1=[(v-vel.at(-2)[0])/dt,(vy-vel.at(-2)[1])/dt];maxJerk=Math.max(maxJerk,Math.hypot((a1[0]-a0[0])/dt,(a1[1]-a0[1])/dt))}
      }
    }
    const cap=opts.max_speed??.65;
    if(maxSpeed>cap)issues.push({type:'teleport_speed',value:round(maxSpeed,4)});
    if(maxJerk>(opts.max_jerk??35))issues.push({type:'jerk_spike',value:round(maxJerk,4)});
    const phaseCoverage=Object.fromEntries(PHASES.map(p=>[p.name,f.filter(v=>v.phase===p.name).length]));
    for(const p of PHASES)if(!phaseCoverage[p.name])issues.push({type:'missing_phase',phase:p.name});
    const variedFields=['filter_xy','mouth_xy','gaze_xy','lip_opening','cheek_draw','shoulder_breath'];
    const variations=Object.fromEntries(variedFields.map(k=>[k,new Set(f.map(v=>JSON.stringify(v[k]))).size]));
    if(variations.filter_xy < fps)issues.push({type:'insufficient_filter_motion_diversity'});
    if(variations.lip_opening < 20)issues.push({type:'insufficient_lip_microchange'});
    if(!f.some(p=>p.blink))issues.push({type:'no_eyelid_blinks'});
    if(!f.some(p=>p.smoke_particles.length))issues.push({type:'no_smoke_plume'});
    return {schema:'retouche-cinema-p19-qa-v1',status:issues.length?'review_required':'synthetic_controls_candidate',
      issues,phase_coverage:phaseCoverage,unique_control_values:variations,
      max_filter_speed_norm_s:round(maxSpeed,5),max_filter_accel_norm_s2:round(maxAcceleration,5),max_filter_jerk_norm_s3:round(maxJerk,5),
      fps,control_pose_count:f.length,photographic_original_frame_count:0,trained_from_private_videos:false,
      physics_certified:false,human_naturalness_certified:false};
  }
  function attachDirectedClips(g, project, P17, P2){
    if(!P17 || typeof P17.validateDirectedProject!=='function' || !project)throw Error('P17 project validator required');
    P17.validateDirectedProject(project,P2);
    if(project.fictional_adult!==true || project.scene!=='smoking' || project.duration_s!==g.duration_s)throw Error('Director scene or duration mismatch');
    const clips=project.clips;
    if(!Array.isArray(clips)||clips.length<2)throw Error('At least two real storyboard clips are needed to test a cut');
    const frames=g.frames.map(p=>{
      const clip=clips.find(c=>p.t>=c.start_seconds-1e-7 && p.t<c.start_seconds+c.duration_seconds-1e-7);
      if(!clip)throw Error('Frame has no matching directed clip');
      return {...p,clip_id:clip.clip_id,character_ids:[...clip.character_ids],object_ids:[...clip.object_ids],
        active_acting_layers:clip.active_beats.filter(b=>p.t>=b.absolute_start_s-1e-7 && p.t<b.absolute_end_s-1e-7).map(b=>b.layer)};
    });
    return {...g,kind:'directed_procedural_pose_controls',directed_project_schema:project.schema,
      clips:clips.map(c=>({clip_id:c.clip_id,start_seconds:c.start_seconds,duration_seconds:c.duration_seconds,
      character_ids:[...c.character_ids],object_ids:[...c.object_ids]})),frames};
  }
  function auditCutContinuity(g){
    if(!Array.isArray(g?.frames)||!Array.isArray(g?.clips))throw Error('Directed P19 output required');
    const issues=[],cuts=[]; const f=g.frames;
    for(let i=1;i<f.length;i++)if(f[i].clip_id!==f[i-1].clip_id){
      const p=f[i-1],q=f[i],dFilter=dist(p.filter_xy,q.filter_xy),dMouth=dist(p.mouth_xy,q.mouth_xy);
      const idMatch=JSON.stringify(p.character_ids)===JSON.stringify(q.character_ids),
        propMatch=JSON.stringify(p.object_ids)===JSON.stringify(q.object_ids);
      cuts.push({from:p.clip_id,to:q.clip_id,t:q.t,filter_motion_per_sample:round(dFilter,6),mouth_motion_per_sample:round(dMouth,6),id_match:idMatch,prop_match:propMatch});
      if(dFilter>.035||dMouth>.02)issues.push({code:'pose_teleport_at_cut',time:q.t});
      if(!idMatch||!propMatch)issues.push({code:'identity_or_prop_change_at_cut',time:q.t});
    }
    if(cuts.length!==g.clips.length-1)issues.push({code:'missing_cut_transition'});
    return {status:issues.length?'review_required':'controls_continuous_across_cuts',issues,cuts,
      rendered_frame_identity_verified:false,source_pixels_processed:false};
  }
  function toP18Audit(g,P18){
    if(!P18||typeof P18.auditMeasured!=='function')throw Error('P18 module required');
    // P18 must explicitly accept synthetic_procedural; never disguise as manually annotated evidence.
    const samples=g.frames.map(f=>({t:f.t,phase:f.phase==='smoke_drift'?'exhale':f.phase,
      mouth_xy:f.mouth_xy,filter_xy:f.filter_xy,hand_xy:f.hand_xy,
      lip_contact:f.lip_contact,lip_shape:f.lip_shape,
      gaze_camera:f.gaze_camera,blink:f.blink,
      cheek_motion:f.cheek_motion,mouth_smoke:f.mouth_smoke,
      smoke_origin_xy:f.smoke_origin_xy}));
    const result=P18.auditMeasured({source_type:'synthetic_procedural',recorded_from_pixels:false,samples});
    return {...result,source_pose_schema:g.schema,generated_procedural_controls:g.sample_count};
  }
  return Object.freeze({VERSION,PHASES,generate,auditTrajectories,attachDirectedClips,auditCutContinuity,toP18Audit,phaseAt,smooth});
});
