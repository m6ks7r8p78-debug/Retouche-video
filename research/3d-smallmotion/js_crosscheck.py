"""Check the real standalone JS algorithm against our existing synthetic frames."""
from pathlib import Path
import json,subprocess,base64
import cv2
from scenes_depthmotion import make_scene_with_oracle
p=Path(__file__).resolve().parent
cases=['local_object','single_plane','two_depths','two_depths_rotated','two_depths_mimic','broad_object','occlusion','blank','two_depths_cut']
inputs=[]
for case in cases:
 for seed in [0,3,100]:
  frames,_,_,_=make_scene_with_oracle(case,seed=seed,n=6)
  imgs=[]
  for im in [frames[0],frames[2]]:
   sm=cv2.resize(im,(160,120),interpolation=cv2.INTER_AREA)
   rgba=cv2.cvtColor(sm,cv2.COLOR_BGR2RGBA)
   imgs.append(base64.b64encode(rgba.tobytes()).decode())
  inputs.append({'scenario':case,'seed':seed,'pair':imgs})
js=r'''const fs=require('node:fs'), R=require('./smallmotion-local.js');let pairs=JSON.parse(fs.readFileSync(0,'utf-8'));let data=[];for(let p of pairs){let [a,b]=p.pair.map(s=>({width:160,height:120,data:Buffer.from(s,'base64')}));let out=R.analyze(a,b);data.push({scenario:p.scenario,seed:p.seed,status:out.status,n:out.candidates.length});}process.stdout.write(JSON.stringify(data));'''
r=subprocess.run(['node','-e',js],input=json.dumps(inputs),text=True,cwd=p,capture_output=True,check=True)
out=json.loads(r.stdout)
summary={}
for k in cases:
 a=[x for x in out if x['scenario']==k];summary[k]={'candidate':sum(x['n']>0 for x in a),'statuses':sorted({x['status'] for x in a}),'total':len(a)}
print(json.dumps(summary,indent=2))
assert summary['local_object']['candidate']==3 and summary['single_plane']['candidate']==0 and summary['two_depths']['candidate']==0, 'Browser proxy failed the synthetic counterexamples'
(p/'results').mkdir(exist_ok=True)
(p/'results'/'browser_crosscheck.json').write_text(json.dumps({'summary':summary,'rows':out,'limits':['RGB-only local hypotheses cannot distinguish parallax from true object motion']},indent=2)+'\n')