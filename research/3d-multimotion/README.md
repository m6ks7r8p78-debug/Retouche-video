# RetoucheProAI — MultiMotion Evidence (experimental continuation of CameraGuard v4.3)

**Scientific status:** new *2D motion-hypothesis* detector, not 3D, not a hand/object tracker, not a physical contact/grasp detector. Designed to preserve the original v4.3 camera guard as a baseline rather than overwrite it.

**Data:** fully synthetic OpenCV/NumPy scenes; no private media, no model weights, no third-party code copies. The six-scenario iPhone HTML only replays precomputed Python observations and embedded synthetic JPG frames. It does **not** execute the detector on iPhone.

## Install and reproduce

Python 3.10+; `python -m pip install numpy opencv-python-headless pytest`.

```sh
python -m pytest -q tests
python benchmark_multimotion.py --seeds 12 --out benchmark_12.json
python probe_estimators.py > probe_estimators_result.json
python build_demo.py
```

Standalone ZIP also includes `previous_v43/camera_guard_v43.py` (public, unchanged code) for a baseline comparison:

```sh
python compare_v43_multimotion.py --seeds 12 --out comparison_v43_12.json
```

When running from the GitHub branch `lab-3d-multimotion-evidence`, the comparison automatically finds the existing public `research/3d-camera-v43/camera_guard_v43.py` from the parent directory; it does not download the private v4.2 archive.

The `benchmark_12.json` and `benchmark_holdout_100_111.json` are different deterministic random seeds of the **same synthetic generator**, not independent real-life datasets. The app status labels correspond only to geometric evidence, not probability or 3D truth.

## Public API

`multimotion_evidence.analyze_sequence(list_of_bgr_uint8_frames, origin='synthetic')`

- Each sequence: 5–60 frames; RGB-like dimensions, BGR `uint8`, 80 px minimum side, ≤1280×720 pixel count.
- Output: `repeated_two_motion_evidence`, `single_dominant_evidence`, `abstain_temporal_gap`, `abstain_insufficient_evidence`, or `ambiguous_mixed_motion_evidence`.
- Each transition: `two_broad_motion_hypotheses`, `one_broad_motion_hypothesis`, or conservative abstention. No persistent IDs, semantic labels, reconstructed depth, contact estimates, or coordinates of people are emitted.
- The method uses bidirectional Lucas–Kanade optical flow, robust partial-affine models, explicit spatial-support thresholds and a temporal-gap guard.

## Most important counterexample

`two_depths` and `two_depths_mimic` intentionally render **bitwise identical frames** from two distinct causal stories:

1. Two stationary surfaces at different simulated depths as the camera moves.
2. A single-depth scene with a large independently moving 2D surface whose projected displacement exactly matches the same pixels.

No pixels-only method, including ours, can distinguish the two from these frames alone. Likewise, the large-object scene triggers two coherent motions; **it would be scientifically wrong to label that as proven parallax**. This is why the output intentionally says only "two broad 2D motion hypotheses." The low-parallax scene is also classified as single motion (known miss).

## GitHub inspirations and licenses — not copied into this project

- MAGSAC++: https://github.com/danini/magsac — source algorithm BSD-style; we probed the method exposed by existing OpenCV `USAC_MAGSAC`. Fits a projective homography that can absorb both synthetic layers, so **not automatically preferable** for multi-layer detection.
- Kornia RANSAC: https://github.com/kornia/kornia — Apache-2.0; useful reference for geometric estimators, not installed or integrated.
- Depth Anything V2: https://github.com/DepthAnything/Depth-Anything-V2 — Small weights Apache-2.0, larger model weights CC-BY-NC-4.0; not installed or tested. Monocular depth alone does not certify camera cause.
- Video Depth Anything: https://github.com/DepthAnything/Video-Depth-Anything — Small weights Apache-2.0; temporal depth candidate for a future *licensed* evaluation, not installed or tested.
- SAM2: https://github.com/facebookresearch/sam2 — Apache-2.0 (code and weights); GitHub issue #739 reports identity switches, not used/tested here.
- Open-CHOIR: https://github.com/hxwork/CHOIR — CHOIR-authored code MIT, but dependencies/checkpoints/assets have separate licenses. Not installed or tested.
- Depth Anything 3: https://github.com/ByteDance-Seed/Depth-Anything-3 — repository Apache-2.0, but individual model weights may have CC-BY-NC restrictions. Not installed.

## Non-goals and next validation

Real-world accuracy, causal identification, hand landmarks, contact, grasp, faithful 3D, and Safari iPhone hardware support are **NOT validated**. Before promotion: labeled real clips under compatible license, camera calibration or external depth when available, counterexamples with rolling shutter, changing illumination, low texture, similar repeated objects, full-frame scene cuts, and measurement on actual iPhone. Never publish personal video/media/weights without separate authorization. No merging to `main` or public site deployment by default.