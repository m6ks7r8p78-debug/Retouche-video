"""Export an original, explicitly synthetic multi-part 3D mannequin in GLB.

GLB contains NO user imagery, real 3D scans, or reconstructed people. The pose
is simulator ground truth. Model rigging / animation are not represented in GLB.
"""
from __future__ import annotations
from pathlib import Path
import numpy as np
import trimesh
from articulated_observable import pose_primitives,synthetic_part_texture,PARTS


def scene_for_pose(phase:float,*,hold:bool=True,subdivisions:int=2)->trimesh.Scene:
    if type(hold) is not bool: raise TypeError('Hold must be bool')
    if type(subdivisions) is not int or subdivisions not in (1,2,3):
        raise ValueError('Mesh triangle budget')
    parts,contact=pose_primitives(phase,hold)
    scene=trimesh.Scene()
    for i,part in enumerate(parts):
        mesh=trimesh.creation.icosphere(subdivisions=subdivisions,radius=1.)
        local=mesh.vertices.copy()
        mesh.vertices=(local*part.radii)@part.rotation.T+part.center
        u=(.5+np.arctan2(local[:,0],local[:,2])/(2*np.pi))%1.
        v=np.arccos(np.clip(-local[:,1],-1,1))/np.pi
        tex=synthetic_part_texture(i)
        ix=(u*tex.shape[1]).astype(int).clip(0,tex.shape[1]-1)
        iy=(v*(tex.shape[0]-1)).astype(int).clip(0,tex.shape[0]-1)
        rgba=np.column_stack((tex[iy,ix][:,::-1],np.full(len(ix),255,np.uint8)))
        mesh.visual.vertex_colors=rgba
        mesh.metadata={'research_only':True,'synthetic_only':True,'part':part.name}
        scene.add_geometry(mesh, node_name=part.name, geom_name=part.name)
    # Save a contact flag in the returned scene's Python metadata; GLB exporters
    # may omit metadata, so README+JSON is the definitive contact evidence.
    scene.metadata={'synthetic_contact':contact.state,'contact_gap_m':contact.surface_gap_m,
                    'identity_reconstructed':False,'source_media_used':False}
    return scene


def write_glb(output:str|Path,phase:float,*,hold:bool=True)->dict:
    output=Path(output)
    if output.suffix.lower()!='.glb':raise ValueError('Only .glb export for synthetic model')
    output.parent.mkdir(parents=True,exist_ok=True)
    scene=scene_for_pose(phase,hold=hold)
    scene.export(str(output),file_type='glb')
    if not output.is_file() or output.stat().st_size<1024:
        raise RuntimeError('Synthetic GLB export failed')
    reread=trimesh.load(str(output),force='scene')
    if len(reread.geometry)!=len(PARTS):raise RuntimeError('GLB parts lost on export')
    return {'file':output.name,'parts':len(PARTS),'size_bytes':output.stat().st_size,
            'state':'holding' if hold else 'released','synthetic_only':True,
            'rigged_animation_exported':False,'person_reconstructed':False}

if __name__=='__main__':
    base=Path(__file__).resolve().parent/'demonstrations'
    for phase,hold,name in [(.75,True,'RNE19_personnage_synthetique_objet_tenu.glb'),
                            (2.8,False,'RNE19_personnage_synthetique_objet_relache.glb')]:
        print(write_glb(base/name,phase,hold=hold))