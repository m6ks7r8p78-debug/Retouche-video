/* P22 visual-observability fixture: executable only on synthetic P19/P21.
 * Does not read private media, P15 observations or any user supplied input.
 */
'use strict';
const fs=require('node:fs'), path=require('node:path');
const P19=require('../../p19/src/p19_micro_motion_generator.js');
const P20=require('../../p20/p20_temporal_evidence.js');
const P21=require('../../p21/p21_gesture_layer.js');
function build(){
  const data=P21.generate(P19,{fps:60,seed:17});
  if(P19.auditTrajectories(data).status!=='synthetic_controls_candidate')throw Error('P19 source QA failed');
  const qa=P21.validate(data,P20);
  if(qa.issue_count!==0||qa.status!=='synthetic_controls_candidate')throw Error('P21 source QA failed');
  return {schema:'retouche-cinema-p22-vector-preview-v1',
    provenance:'synthetic_procedural_only',source_media_accessed:false,
    visual_qa_not_human_realism:true,clip_duration_s:8,
    fps:data.fps,seed:data.seed,frames:data.frames,control_qa:qa};
}
if(require.main===module){
  const target=path.resolve(process.argv[2]||'studio-cinema/p22/results/controls.json');
  const result=build();fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.writeFileSync(target,JSON.stringify(result));process.stdout.write(JSON.stringify({target,frames:result.frames.length,verified:'P19+P21 synthetic input only'})+'\n');
}
module.exports={build};
