"""RNE20: render a fully synthetic input, infer from pixels alone, export guessed template pose.
The simulator truth enters only in demonstration/evaluation; NEVER in estimator.fit().
"""
from pathlib import Path
import json, math
import cv2, numpy as np
from inverse_pose import ArticulatedInverse,circular_error
from evaluate_inverse import manifest
try:
    from outils.rne.rne19.articulated_observable import render_scene
except ModuleNotFoundError:
    from articulated_observable import render_scene
try:
    from outils.rne.rne19.export_synthetic_glb import write_glb
except ModuleNotFoundError:
    from export_synthetic_glb import write_glb

def produce(output_dir):
    out=Path(output_dir);out.mkdir(parents=True,exist_ok=True)
    case=manifest('locked')[10]
    original=render_scene(case['phase'],case['yaw'],frame_id=101,size=256,
            hold=case['hold'],occluder=case['occluder'],texture_seed=case['texture_seed'])
    estimator=ArticulatedInverse(bank_cache=Path(__file__).resolve().parent/'template_bank_synthetic.npz')
    prediction=estimator.fit(original.bgr,manual_research_opt_in=True)
    # This is *not* a 3D scan; geometry/radii/renderer are pre-existing known toy templates.
    hypothetical_hold=prediction.contact_hypothesis=='holding'
    guessed=render_scene(prediction.articulation_phase_rad,prediction.yaw_rad,frame_id=100,
            size=256,hold=hypothetical_hold,texture_seed=0)
    gap=cv2.absdiff(original.bgr,guessed.bgr)
    def annotated(im,label):
        panel=np.zeros((286,256,3),np.uint8)
        panel[:256]=im
        cv2.putText(panel,label,(8,276),cv2.FONT_HERSHEY_SIMPLEX,.43,(248,248,248),1,cv2.LINE_AA)
        return panel
    mosaic=np.concatenate([annotated(original.bgr,'Image cible 100% synthetique'),
          annotated(guessed.bgr,'Pose retrouvee depuis pixels'),
          annotated(gap,'Difference (pixels)')],axis=1)
    png=out/'RNE20_image_vers_pose_3D_DEMO_SYNTHE.png'
    assert cv2.imwrite(str(png),mosaic)
    glb=out/'RNE20_POSE_INVERSEE_MODELE_SYNTHETIQUE.glb'
    info=write_glb(glb,prediction.articulation_phase_rad,hold=hypothetical_hold)
    proof={'source_image':'fully procedurally generated 256x256 BGR, no real people',
       'fit_only_uses_bgr_pixels':True,
       'GT_phase_deg_for_EVALUATION_ONLY':round(math.degrees(case['phase']),3),
       'inferred_phase_deg':round(math.degrees(prediction.articulation_phase_rad),3),
       'phase_error_deg':round(math.degrees(circular_error(prediction.articulation_phase_rad,case['phase'])),3),
       'GT_camera_yaw_deg_for_EVALUATION_ONLY':round(math.degrees(case['yaw']),3),
       'inferred_yaw_deg':round(math.degrees(prediction.yaw_rad),3),
       'yaw_error_deg':round(math.degrees(circular_error(prediction.yaw_rad,case['yaw'])),3),
       'GT_hold_for_EVALUATION_ONLY':bool(case['hold']),
       'contact_hypothesis':prediction.contact_hypothesis,
       'pose_ambiguous':prediction.pose_ambiguous,
       'template_geometry_pre_known':True,
       'silhouette_geometry_not_reconstructed':True,
       'GLB_geometry_is_known_toy_template_at_inferred_pose':True,
       'no_person_identified_or_reconstructed':True,
       'synthetic_media_only':True,'export':info}
    (out/'RNE20_DEMO_PROVENANCE.json').write_text(json.dumps(proof,indent=2,ensure_ascii=False)+'\n')
    return proof

if __name__=='__main__':
    import sys
    print(json.dumps(produce(sys.argv[1]),ensure_ascii=False,indent=2))