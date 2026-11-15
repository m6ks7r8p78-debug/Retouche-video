"""Reproducible synthetic 3D sphere view-coverage benchmark, no personal video."""
from __future__ import annotations
import argparse,json,time
import numpy as np
import cv2
from pathlib import Path
from outils.rne.rne18.observable_atlas import synthetic_texture,project_texture,accumulate_visible_surface,metrics_on_novel_view,render_known_surface

def evaluate(seed: int=19, size: int=192, atlas_shape=(160,320), save_preview=None):
    tex=synthetic_texture(*atlas_shape,seed=seed)
    # Calibrated yaw is exact simulator truth, NOT camera or human pose recovered from videos.
    exposures=[0, .48, 1.04, 1.58, 2.15, 2.73, 3.28, 3.92, 4.60, 5.31]
    frames=[project_texture(tex,y,size,occlusion=('ellipse' if i%2 else 'band'),phase=i)
            for i,y in enumerate(exposures)]
    # Model incremental evidence: 1 front view, first 4 partial views, 10 near-complete orbit
    result={}
    for n in (1,4,10):
        t=time.perf_counter()
        a=accumulate_visible_surface(frames[:n],shape=atlas_shape)
        dt=time.perf_counter()-t
        novel_angles=[0.26,1.32,2.44,3.68,4.91,5.78]
        scores=[metrics_on_novel_view(a,tex,y,size) for y in novel_angles]
        result[str(n)]={
            'number_of_calibrated_views':n,
            'atlas_observed_fraction':float(a.observed.mean()),
            'atlas_corroborated_fraction':float(a.corroborated.mean()),
            'novel_view_observed_fraction_mean':float(np.mean([s['observed_fraction'] for s in scores])),
            'novel_view_corroborated_fraction_mean':float(np.mean([s['corroborated_fraction'] for s in scores])),
            'novel_view_psnr_measured_only_on_observed_mean_db':float(np.mean([s['psnr_on_observed_pixels_db'] for s in scores])),
            'novel_view_count':len(scores),
            'unobserved_cells_never_inpainted':int((~a.observed).sum()),
            'atlas_build_seconds_local_cpu':round(dt,4),
            'per_novel_view':scores
        }
    if save_preview:
        p=Path(save_preview)
        p.mkdir(parents=True,exist_ok=True)
        a=accumulate_visible_surface(frames,shape=atlas_shape)
        rgb=a.bgr.copy()
        marker=np.zeros_like(rgb); marker[:]=[35,35,35]
        marker[a.observed]=rgb[a.observed]
        overlay=cv2.resize((a.observed.astype(np.uint8)*255),(atlas_shape[1],atlas_shape[0]))
        cv2.imwrite(str(p/'00_texture_groundtruth_synthetic.png'),tex)
        cv2.imwrite(str(p/'01_texture_observed_only.png'),marker)
        cv2.imwrite(str(p/'02_evidence_coverage_binary.png'),overlay)
        for key,yaw in [('view_front',0.),('view_back',3.2),('view_novel',4.7)]:
            img,known,trust,disk=render_known_surface(a,yaw,size)
            color=np.zeros_like(img);color[:]=[30,30,30]
            color[disk&(~known)]=[40,50,190] # visible unknown red, not hallucinated
            color[known]=img[known]
            cv2.imwrite(str(p/(key+'_observed_vs_unknown.png')),color)
        # No personal source frames, the complete texture is 100% procedurally generated
    return {'project':'RNE18/OBSERVABLE3D','status':'synthetic_calibrated_geometry_proof_of_concept',
            'seed':seed,'synthetic_view_size':size,'atlas_shape':list(atlas_shape),
            'method':'UV atlas splatting, color from observed pixels only, multi-view support count',
            'source_media_used':False,'human_identity_recovered':False,'3d_geometry_inferred':False,
            'unknown_texture_generated':False,'automatic_deployment':False,
            'limitations':'Exact per-pixel UV, occlusion, and camera yaw supplied by simulator. No pose estimation, deformable subject, uncertain geometry, or real human performance.',
            'results':result}

if __name__=='__main__':
    ap=argparse.ArgumentParser()
    ap.add_argument('--output',default=None)
    ap.add_argument('--preview',default=None)
    a=ap.parse_args()
    out=evaluate(save_preview=a.preview)
    print(json.dumps(out,indent=2,ensure_ascii=False))
    if a.output:Path(a.output).write_text(json.dumps(out,indent=2,ensure_ascii=False)+'\n',encoding='utf8')