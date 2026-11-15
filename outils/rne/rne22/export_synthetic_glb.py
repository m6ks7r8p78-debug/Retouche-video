"""Export known toy skeleton in pose/relative shape inferred from generated grayscale pixels.
Never a person scan; never raw video, face, identity or measured metric scale.
"""
from pathlib import Path
import numpy as np
import trimesh
from markerless_perspective import render_toy,fit_markerless,toy_points,DRAW_SEGMENTS


def scene_from_inferred_shape(upper,forearm,phase):
    joints=toy_points(upper,forearm,phase)
    scene=trimesh.Scene()
    for k,(a,b) in enumerate(DRAW_SEGMENTS):
        if np.linalg.norm(joints[a]-joints[b]) < 1e-5:continue
        obj=trimesh.creation.cylinder(radius=.055,segment=np.stack([joints[a],joints[b]]),sections=10)
        obj.visual.face_colors=[150,173,193,255]
        scene.add_geometry(obj,geom_name=f'synthetic_toy_segment_{k:02d}')
    head=trimesh.creation.icosphere(subdivisions=1,radius=.115)
    head.apply_translation(joints[8]);head.visual.face_colors=[195,197,205,255]
    scene.add_geometry(head,geom_name='synthetic_toy_head')
    return scene


def export_from_only_pixels(frames,folder):
    output=Path(folder);output.mkdir(parents=True,exist_ok=True)
    fit=fit_markerless(frames,manual_research_opt_in=True,starts=2,max_nfev=70)
    if fit.status!='provisional':raise RuntimeError('Insufficient silhouette fit, refuse GLB export')
    paths=[]
    for k,phase in enumerate(fit.phase_rad):
        scene=scene_from_inferred_shape(fit.upper_torso_units,fit.forearm_torso_units,phase)
        path=output/f'RNE22_pose_{k+1:02d}_toy_synthetique.glb'
        path.write_bytes(scene.export(file_type='glb'))
        reloaded=trimesh.load(path,force='scene',process=False)
        if len(reloaded.geometry)!=len(DRAW_SEGMENTS)+1:raise RuntimeError('Export verification failed')
        paths.append(str(path))
    return paths,fit

if __name__=='__main__':
    base=Path(__file__).resolve().parent
    pixels=[render_toy(.74,.71,yaw=y,phase=p,focal=174,distance=4.2)
            for y,p in [(-.3,.55),(.15,.95),(.38,1.25)]]
    paths,fit=export_from_only_pixels(pixels,base/'demo_glb')
    print('Exported',len(paths),'synthetic GLB meshes from pixel-fitted phases')
    print('Fitted shape',fit.upper_torso_units,fit.forearm_torso_units,'status',fit.status)
    for path in paths:print(path)