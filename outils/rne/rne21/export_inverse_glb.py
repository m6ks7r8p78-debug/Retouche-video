"""Export RNE21 reconstructed relative-proportion toy poses, synthetic ONLY.

The 3D topology is pre-defined, not inferred from human photos. The arm lengths,
pose, camera are recovered from color fiducials in images, without renderer truth
passed into the solver. Geometry is not metric and not personal information.
"""
from __future__ import annotations
import json
from pathlib import Path
import trimesh
import numpy as np
from anchorage import toy_joints,render_fiducials,solve_sequence


def _sphere(center, radius,color):
    mesh=trimesh.creation.icosphere(subdivisions=2,radius=radius)
    mesh.apply_translation(center)
    mesh.visual.vertex_colors=np.asarray(color,dtype=np.uint8)
    return mesh


def _link(a,b,radius,color):
    delta=np.asarray(b)-np.asarray(a)
    norm=float(np.linalg.norm(delta))
    if norm<.05:raise ValueError('Segment degenerate')
    mesh=trimesh.creation.cylinder(radius=radius,height=norm,sections=12)
    rot=trimesh.geometry.align_vectors([0.,0.,1.],delta/norm)
    mesh.apply_transform(rot)
    mesh.apply_translation((np.asarray(a)+np.asarray(b))/2)
    mesh.visual.vertex_colors=np.asarray(color,dtype=np.uint8)
    return mesh


def reconstruct_synthetic_glb(upper:float,forearm:float,phase:float,output:Path):
    pts=toy_joints(upper,forearm,phase)
    scene=trimesh.Scene()
    # 10 fitted synthetic landmarks plus rigid segments and fixed-size template parts.
    for i,p in enumerate(pts):
        scene.add_geometry(_sphere(p,.075,((30+i*22)%200+45,(10+i*13)%170+55,170,255)),
                           node_name=f'RNE21_fitted_joint_{i:02d}')
    for i,j,radius,label in [(0,1,.26,'torso'),(2,5,.085,'left_upper'),
                              (5,6,.08,'left_forearm'),(3,7,.085,'right_upper'),
                              (7,8,.08,'right_forearm')]:
        scene.add_geometry(_link(pts[i],pts[j],radius,(140,155,205,255)),node_name='RNE21_'+label)
    # Object is depicted as a sphere at a model-assumed offset; its physical
    # contact is NOT inferred/verified from the images.
    scene.add_geometry(_sphere(pts[9],.21,(220,170,65,255)),node_name='RNE21_synthetic_object_assumed')
    scene.export(str(output))
    readback=trimesh.load(str(output),force='scene')
    if len(readback.geometry)<12:raise RuntimeError('Export did not survive GLB parse')
    return len(readback.geometry)


def build_demo(root=Path(__file__).parent):
    output=root/'demo'
    output.mkdir(exist_ok=True)
    # NEW example seed outside benchmarks. Only BGR images provided to inverse.
    frames=[]
    for i in range(5):
        f,_=render_fiducials(upper=.87,forearm=.68,phase=.38+i*.31,
             yaw=-.73+i*.36,scale=47+2*i,tx=i*2-4,ty=i*.8)
        frames.append(f)
    fit=solve_sequence(frames,variable_shape=True,manual_research_opt_in=True,extra_seeds=2)
    if fit.status!='provisional':raise RuntimeError('Cannot export unverified fit')
    glbs=[]
    for idx,phase in enumerate(fit.phase_rad):
        path=output/f'RNE21_ANCRAGE_pose_{idx+1:02d}_synthetique.glb'
        count=reconstruct_synthetic_glb(fit.upper_relative,fit.forearm_relative,phase,path)
        glbs.append({'name':path.name,'parts':count,'bytes':path.stat().st_size})
    report={'type':'synthetic_only_joint_fiducial_inverse_not_human_mesh',
       'inverse_from_pixels':True,'estimated_upper_relative':fit.upper_relative,
       'estimated_forearm_relative':fit.forearm_relative,
       'estimated_camera_yaws_rad':fit.yaw_rad,
       'estimated_phases_rad':fit.phase_rad,'fit_status':fit.status,
       'ground_truth_used_for_fit':False,'relative_not_metric':True,
       'object_contact_proven':False,'real_person_model':False,
       'files':glbs}
    (output/'RNE21_DEMO_PROVENANCE.json').write_text(json.dumps(report,indent=2))
    print(json.dumps(report,indent=2))
    return report

if __name__=='__main__':build_demo()

