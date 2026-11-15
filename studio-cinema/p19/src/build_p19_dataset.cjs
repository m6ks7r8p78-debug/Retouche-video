#!/usr/bin/env node
'use strict';
/* Generate fictional-adult procedural motion controls only. No real media read. */
const fs=require('node:fs'),path=require('node:path');
const P19=require('./p19_micro_motion_generator.js');
const P16=require('../../p16/presence_director.js');
const P17=require('../../p17/acting_clip_bridge.js');
const P2=require('../../p2/cinema-render-plan.js');
const fps=Number(process.argv.find(x=>x.startsWith('--fps='))?.slice(6)||60);
const scene=P17.planProject({fictional_adult:true,scene:'smoking',duration_s:8,maxClipSeconds:4,
  strengths:{sensualite:3,dominance:3,elegance:4,charme:3,mystere:1}},P16,P2);
const output=P19.attachDirectedClips(P19.generate({fps}),scene,P17,P2);
const qa=P19.auditTrajectories(output),cuts=P19.auditCutContinuity(output);
if(qa.status!=='synthetic_controls_candidate'||cuts.issues.length)throw new Error('Synthetic controls did not pass QA');
const target=path.resolve(__dirname,'../results/p19_pose_controls_60hz.json');
fs.mkdirSync(path.dirname(target),{recursive:true});
fs.writeFileSync(target,JSON.stringify(output));
fs.writeFileSync(path.resolve(__dirname,'../results/p19_qa_60hz.json'),JSON.stringify({qa,cuts},null,2));
console.log(JSON.stringify({target,poses:output.frames.length,fps,generated_photographic_frames:0,qa:qa.status}));
