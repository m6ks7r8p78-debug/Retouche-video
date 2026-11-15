/* Retouche Cinema P7 - fictional-adult-only annotated scene chronology.
 * Deterministic validation of manual labels; NOT action recognition or proof of realism.
 * No image, model weights, private video or network request.
 */
'use strict';
const PHASES = ['idle','raise','seal','inhale','release','hold','exhale_onset','exhale','smoke_drift'];
function evaluateP7(doc) {
  if (!doc || doc.schema !== 'retouche-cinema-p7-gesture-qa-v1' ||
      doc.source_type !== 'synthetic_generated_keyframes' || doc.fictional_adult !== true) {
    throw new Error('fictional-adult P7 schema required');
  }
  if (!Array.isArray(doc.keyframes) || doc.keyframes.length < 10 || doc.keyframes.length > 300) {
    throw new Error('10–300 keyframes required');
  }
  const reasons = new Set(); const seconds = new Map(); const seen = new Set();
  let t = 0, rank = -1, smokeStart = null, releaseStart = null, gaze = 0, cheeks = 0;
  for (let i = 0; i < doc.keyframes.length; i++) {
    const f = doc.keyframes[i];
    if (!f || f.index !== i+1 || typeof f.duration_s !== 'number' ||
        !Number.isFinite(f.duration_s) || f.duration_s < .08 || f.duration_s > 3) {
      throw new Error('invalid frame index or duration');
    }
    const p = PHASES.indexOf(f.phase);
    if (p < 0 || typeof f.gaze_camera !== 'boolean' || typeof f.lip_contact !== 'boolean') {
      throw new Error('invalid phase or missing manual gaze/contact labels');
    }
    if (!['none','tip_wisp','mouth_wisp','mouth_plume'].includes(f.smoke)) {
      throw new Error('invalid smoke label');
    }
    if (p < rank) reasons.add('backwards_phase_order');
    rank = p; seen.add(f.phase);
    seconds.set(f.phase, (seconds.get(f.phase)||0)+f.duration_s);
    gaze += Number(f.gaze_camera);
    if (['seal','inhale'].includes(f.phase) && !f.lip_contact) reasons.add('missing_lip_contact_during_draw');
    if (!['seal','inhale'].includes(f.phase) && f.lip_contact) reasons.add('unexpected_lip_contact');
    if (f.phase === 'inhale') {
      if (!['sealed','narrowed'].includes(f.lip_shape)) reasons.add('missing_inhale_lip_shape');
      if (f.cheek_motion === 'observed') cheeks++;
    }
    function pt(name) {
      const v = f[name];
      if (v == null) return null;
      if (!Array.isArray(v) || v.length !== 2 || v.some(x=>typeof x!=='number'||!Number.isFinite(x)||x<0||x>1)) {
        throw new Error('invalid normalized point '+name);
      }
      return v;
    }
    const mouth=pt('mouth_xy'), filter=pt('filter_xy'), fingers=pt('fingers_xy'), smoke=pt('smoke_xy');
    const dist=(a,b)=>Math.hypot(a[0]-b[0], a[1]-b[1]);
    if (!mouth||!filter||!fingers) reasons.add('manual_hand_mouth_geometry_missing');
    else {
      if (dist(filter,fingers)>.18) reasons.add('unstable_hand_cigarette_attachment');
      if (['seal','inhale'].includes(f.phase) && dist(filter,mouth)>.08) reasons.add('filter_lip_contact_spatial_mismatch');
    }
    if (['mouth_wisp','mouth_plume'].includes(f.smoke)) {
      if (smokeStart==null) smokeStart=t;
      if (!['exhale_onset','exhale','smoke_drift'].includes(f.phase)) reasons.add('mouth_smoke_before_exhale');
      if (!smoke) reasons.add('smoke_origin_position_missing');
    }
    if (f.phase==='exhale_onset' && smoke && mouth && dist(smoke,mouth)>.15) reasons.add('smoke_does_not_originate_at_mouth');
    if (f.phase==='release' && releaseStart==null)releaseStart=t;
    t += f.duration_s;
  }
  for (const required of ['raise','seal','inhale','release','hold','exhale_onset','exhale']) {
    if (!seen.has(required)) reasons.add('missing_'+required);
  }
  if (smokeStart==null) reasons.add('mouth_smoke_not_visible');
  if (releaseStart!=null && smokeStart!=null && smokeStart-releaseStart < .6) reasons.add('too_rapid_release_to_exhale');
  if ((seconds.get('hold')||0)<.25) reasons.add('breath_pause_too_short');
  if ((seconds.get('inhale')||0)<1.2) reasons.add('inhale_duration_too_short');
  if (gaze/doc.keyframes.length<.75) reasons.add('camera_gaze_not_sustained');
  if (!cheeks) reasons.add('cheek_inhalation_not_demonstrated');
  if (doc.human_reviewed!==true) reasons.add('human_review_pending');
  return {status:reasons.size?'review_required':'candidate_only',
    reasons:[...reasons].sort(),total_duration_s:Number(t.toFixed(3)),
    gaze_to_camera_annotated_ratio:Number((gaze/doc.keyframes.length).toFixed(3)),
    source_keyframe_count:doc.keyframes.length,identity_verified:false,physical_realism_verified:false,
    training_on_private_videos:false,interpolated_frames_are_not_new_generated_poses:true};
}
module.exports = {PHASES,evaluateP7};
