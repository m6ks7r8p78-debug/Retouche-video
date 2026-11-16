import {buildSyntheticFilmSceneV09} from './film-fingers-v09.mjs';
import {inspectGripSurface} from './film-inspection-v10.mjs';

/** Recalcule l'audit depuis le GLB final réellement exporté, sans images privées. */
function buildSyntheticFilmSceneV10(request,generator,{decorateModel}={}){
 const output=buildSyntheticFilmSceneV09(request,generator,{decorateModel});
 if(output.status!=='apercu_partiel_glb_anime')return output;
 const surfaceAudit=inspectGripSurface(output.glb,output.timeline);
 const warnings=[
  ...output.warnings,
  'Mesure radiale des doigts à la surface approximative d’une tasse sphéroïdale ; aucun contact physique ni force de prise certifiés.'
 ];
 return {...output,schema:'retoucheproai.film-motion-preview.v0.10',surfaceAudit,warnings};
}
export {buildSyntheticFilmSceneV10};
