# RetoucheProAI — 3D Camera Evidence v4.3 (experimental)

**Scope**: robust **2D camera similarity compensation**, not a 3D reconstruction, object detector, hand detector, contact estimator, or model training. Standalone, completely local Python prototype; no private media / models / original archive in this public demonstration.

## Installation and tests

Python 3.10+ and `pip install numpy opencv-python pytest`.

```bash
python -m pytest -q tests
python benchmark_v43.py --seeds 12 --output results.json
```

To reproduce the **v4.2 comparison only if you independently possess the private historical archive**, extract it locally and run:

```bash
python benchmark_v43.py --v42-root /path/to/extracted/private/v42 --seeds 12 --output comparison.json
```

The comparison imports the baseline locally, not from GitHub. Never commit the old private archive or its media. The input images are generated procedurally (`scenes_v43.py`) and intentionally easy; a favorable synthetic result is not a real-world accuracy measure.

`camera_guard_v43.analyse_frames(frames, origin='synthetic')` expects `list` of BGR `uint8` images (same dimensions), returns only similarity estimates, *unclassified* 2D motion regions and abstentions. It rejects invalid timestamps, inconsistent frames, low-texture scenes, competing wide-area motion hypotheses and low spatial overlap. It does not assign persistent identities across occlusions. Use `origin='real_unvalidated'` for authorized real material; never mark such results as human-annotated without independent ground truth.

Dependencies: OpenCV + NumPy; licences must be checked for redistributions. There are no trained model weights or network calls.

## Reproducibility and caveats

- 12 fixed random seeds × 9 artificial scenarios = 108 synthetic sequences, 12 frames each.
- Foreground center coverage: L1 distance under 35 pixels in stabilized image coordinates; unmatched regions with no annotated synthetic foreground are counted separately.
- CPU times are from one execution environment, **not iPhone or hardware benchmarks**.
- Main failure intentionally retained: immobile objects are invisible to temporal differencing. A proxy for parallactic multi-plane camera motion is abstained on rather than reconstructed.
- Rotation and zoom compensation can still fail on real rolling shutter, severe motion blur, low texture, repeated patterns, large objects and 3D parallax. No real video annotated here.
- For actual deployment, compare against a human-labelled corpus and video segmentation models under applicable licenses; test Safari physically.