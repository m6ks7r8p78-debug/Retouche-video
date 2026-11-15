/* Retouche Cinema P20 — read-only evidence/coverage bridge.
 * P15 observations are not automatically generated from P19 poses.
 * P19 poses are authored synthetic controls, NEVER evidence of human behavior.
 * No network, media access, training, persistence or identity inference.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RetoucheCinemaP20 = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const VERSION = 'retouche-cinema-p20-temporal-evidence-v1';
  const SUPPORTED = Object.freeze({
    blink: {field: 'blink', channel: 'face'},
    gaze_camera: {field: 'gaze_camera', channel: 'face'},
    lip_seal_on_filter: {field: 'lip_contact', channel: 'lips'},
    mouth_smoke_flow: {field: 'mouth_smoke', channel: 'smoke'}
  });
  const finite = x => typeof x === 'number' && Number.isFinite(x);
  const round = x => +x.toFixed(4);
  function insist(ok, msg) { if (!ok) throw new Error(msg); }

  function validateGenerated(g) {
    insist(g && typeof g === 'object' && g.schema === 'retouche-cinema-p19-procedural-micromotion-v1', 'P19 procedural trajectory required');
    insist(g.source === 'fictional_synthetic_no_person' && g.privately_trained === false &&
      g.source_video_accessed === false && g.photographic_frames_generated === 0,
      'P19 synthetic provenance must not be promoted to measured human evidence');
    insist((g.fps === 45 || g.fps === 60) && g.duration_s === 8 && Array.isArray(g.frames) &&
      g.frames.length === g.fps * g.duration_s && g.sample_count === g.frames.length,
      'P19 timeline or sample count invalid');
    for (let i = 0; i < g.frames.length; i++) {
      const f = g.frames[i];
      insist(f && finite(f.t) && Math.abs(f.t - i / g.fps) < 0.0001 &&
        f.generated_control_pose === true && f.pixel_frame_generated === false,
        'Broken synthetic frame provenance/timing');
      for (const k of Object.values(SUPPORTED)) insist(typeof f[k.field] === 'boolean', 'Missing synthetic control: ' + k.field);
    }
    return g;
  }

  function intervals(g, label) {
    const k = SUPPORTED[label];
    insist(k, 'Unsupported label');
    const out = [];
    let start = null;
    for (let i = 0; i <= g.frames.length; i++) {
      const active = i < g.frames.length && g.frames[i][k.field] === true;
      if (active && start === null) start = i;
      if (!active && start !== null) {
        out.push({start_s: round(start / g.fps), end_s: round(i / g.fps)});
        start = null;
      }
    }
    return out;
  }

  function overlap(a, b) {
    const intersection = Math.max(0, Math.min(a.end_s, b.end_s) - Math.max(a.start_s, b.start_s));
    const union = Math.max(a.end_s, b.end_s) - Math.min(a.start_s, b.start_s);
    return union > 0 ? intersection / union : 0;
  }
  function shiftInterval(e, seconds) { return {start_s: e.start_s + seconds, end_s: e.end_s + seconds}; }

  // Caller explicitly opts into a local, read-only comparison. This is NOT training consent.
  function compare(doc, generated, P15, {localEvaluationAllowed = false, alignmentOffsetS = 0} = {}) {
    insist(localEvaluationAllowed === true, 'Explicit local evaluation authorization required');
    insist(P15 && typeof P15.validateProject === 'function', 'Real P15 validator required');
    insist(finite(alignmentOffsetS) && Math.abs(alignmentOffsetS) <= 2, 'Invalid manual timeline alignment');
    const d = P15.validateProject(doc), g = validateGenerated(generated);
    insist(d.source_type === 'private_authorized_video' && d.media_scope === 'private_local' &&
      d.allow_network === false && d.export_media === false && d.ready_for_training === false,
      'Local-only authorized annotation document required');
    // No source basename, raw notes, reviewer IDs, media pixels or personal landmarks enter the output.
    const accepted = d.events.filter(e => e.review_status === 'adjudicated' &&
      e.evidence === 'visible' && e.reviewed_by && new Set(e.reviewed_by).size >= 2);
    const pending = d.events.length - accepted.length;
    const supportedLabels = Object.keys(SUPPORTED), coverage = [], missingControls = [];
    for (const label of [...new Set(accepted.map(e => e.label))].sort()) {
      const observed = accepted.filter(e => e.label === label);
      if (!SUPPORTED[label]) { missingControls.push({label, observed_count: observed.length, reason: 'no_equivalent_p19_control'}); continue; }
      const expected = intervals(g, label);
      // Match one-to-one to avoid counting one long generated interval many times.
      const used = new Set(), pairs = [];
      for (const e of observed) {
        const interval = shiftInterval(e, alignmentOffsetS);
        let best = -1, value = 0;
        for (let j = 0; j < expected.length; j++) {
          if (used.has(j)) continue;
          const v = overlap(interval, expected[j]);
          if (v > value) { value = v; best = j; }
        }
        if (best >= 0 && value >= 0.25) { used.add(best); pairs.push(round(value)); }
      }
      coverage.push({label, channel: SUPPORTED[label].channel,
        adjudicated_visible_events: observed.length, synthetic_intervals: expected.length,
        temporal_overlaps: pairs.length, mean_overlap_of_matches: pairs.length ? round(pairs.reduce((a,b)=>a+b,0)/pairs.length) : null,
        review_required: true});
    }
    const unreviewedTypes = [...new Set(d.events.filter(e => !accepted.includes(e)).map(e => e.label))].sort();
    return Object.freeze({schema: VERSION, status: 'human_review_required',
      comparison: 'temporal_annotation_vs_synthetic_control_only',
      manually_aligned: true, alignment_offset_s: alignmentOffsetS,
      annotation_events_total: d.events.length, adjudicated_visible_events: accepted.length,
      excluded_unadjudicated_or_uncertain_events: pending,
      unreviewed_labels: unreviewedTypes, supported_control_labels: supportedLabels,
      coverage, missing_controls: missingControls,
      time_overlap_is_not_motion_realism: true, human_naturalness_verified: false,
      person_identity_verified: false, video_landmarks_extracted: false,
      source_media_accessed: false, media_bytes_exported: false, network_used: false,
      training_authorized_by_this_comparison: false, generated_photographic_frames: 0});
  }

  // Strictly isolates SmallMotion's *two-frame* 2D diagnostic from semantic annotation.
  // It must never be used to classify gaze, lips, hands, contact, smoke or intent.
  function inspectSmallMotion(report) {
    if (report === null || report === undefined) return Object.freeze({status: 'not_connected', semantic_events: [], usable_as_P15_review: false});
    insist(report && typeof report === 'object' && !Array.isArray(report) &&
      report.provenance === 'smallmotion_local_2frame_v1' && report.action === 'no_automatic_change',
      'Untrusted SmallMotion diagnostic');
    const states = new Set(['local_motion_candidate','no_supported_local_motion','abstain_texture','abstain_matches',
      'abstain_cut_or_flash','abstain_invalid_evidence','abstain_resource_budget',
      'abstain_resource_guard_unavailable','abstain_worker_version_mismatch','abstain_worker_timeout','abstain_worker_error']);
    insist(states.has(report.status), 'Unrecognized motion status');
    if (report.status === 'local_motion_candidate') {
      insist(report.frames === 2 && Array.isArray(report.candidates) && report.candidates.length > 0,
        'Candidate report without valid two-frame provenance');
    }
    return Object.freeze({status: report.status === 'local_motion_candidate' ? '2d_motion_candidate_only' : 'abstain_or_no_2d_candidate',
      source: 'SmallMotion', evidence_frames: report.frames === 2 ? 2 : 0,
      semantic_events: [], usable_as_P15_review: false, contact_verified: false,
      '3d_verified': false, automatic_director_change: false});
  }
  return Object.freeze({VERSION, SUPPORTED, validateGenerated, intervals, compare, inspectSmallMotion});
});
